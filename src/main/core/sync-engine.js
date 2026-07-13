import { createTunnel } from './ssh-tunnel'
import { getSyncHistory, addSyncHistory } from './config-store'
import { ipcMain } from 'electron'

const activeSyncTasks = new Map()

export function registerSyncHandlers() {
  ipcMain.handle('sync:start', async (event, { profile, tables }) => {
    const syncId = crypto.randomUUID()
    const task = new SyncTask(syncId, profile, tables, event.sender)
    activeSyncTasks.set(syncId, task)
    
    // Start async, don't wait here
    task.start().finally(() => {
      activeSyncTasks.delete(syncId)
    })
    
    return syncId
  })

  ipcMain.handle('sync:abort', (_, syncId) => {
    const task = activeSyncTasks.get(syncId)
    if (task) {
      task.abort()
      return true
    }
    return false
  })

  ipcMain.handle('sync:getHistory', () => {
    return getSyncHistory()
  })
}

class SyncTask {
  constructor(id, profile, tables, webContents) {
    this.id = id
    this.profile = profile
    this.tables = tables // Array of { name, mode }
    this.webContents = webContents
    this.isAborted = false
    this.tunnel = null
    this.remoteDriver = null
    this.localDriver = null
    this.lastEmitTime = 0
    
    this.activeStream = null
    
    const totalRowsToSync = tables.reduce((sum, t) => {
      if (t.mode !== 'full') return sum
      const count = t.rowCount || 0
      if (t.limit && t.limit > 0 && t.limit < count) {
        return sum + t.limit
      }
      return sum + count
    }, 0)
    
    this.stats = {
      totalTables: tables.length,
      completedTables: 0,
      totalRows: 0, // copied rows
      totalRowsToSync,
      etaSeconds: 0,
      startTime: Date.now(),
      status: 'starting', // starting, syncing, completed, error, aborted
      currentTable: null
    }
  }

  abort() {
    this.isAborted = true
    this.stats.status = 'aborted'
    this.forceEmitProgress()
    this.emitLog('warning', 'Sync aborted by user. Cleaning up...')
    if (this.activeStream && typeof this.activeStream.destroy === 'function') {
      try {
        this.activeStream.destroy()
      } catch (e) {
        console.error('Failed to destroy active stream:', e)
      }
    }
  }

  emitProgress() {
    const now = Date.now()
    if (now - this.lastEmitTime > 100) {
      this.forceEmitProgress()
    } else {
      // Ensure the very last update in a rapid sequence is not dropped
      if (this.pendingEmitTimer) clearTimeout(this.pendingEmitTimer)
      this.pendingEmitTimer = setTimeout(() => {
        this.forceEmitProgress()
      }, 100)
    }
  }

  forceEmitProgress() {
    this.lastEmitTime = Date.now()
    if (this.pendingEmitTimer) {
      clearTimeout(this.pendingEmitTimer)
      this.pendingEmitTimer = null
    }
    if (!this.webContents.isDestroyed()) {
      this.webContents.send(`sync:progress:${this.id}`, this.stats)
    }
  }

  emitLog(type, message) {
    if (!this.webContents.isDestroyed()) {
      this.webContents.send(`sync:log:${this.id}`, { type, message, timestamp: Date.now() })
    }
  }

  async cleanup() {
    if (this.remoteDriver) {
      try { await this.remoteDriver.close() } catch (e) {}
    }
    if (this.localDriver) {
      try { await this.localDriver.close() } catch (e) {}
    }
    if (this.tunnel) {
      try { this.tunnel.close() } catch (e) {}
    }
  }

  async start() {
    try {
      this.emitProgress()
      this.emitLog('info', `Starting sync for profile: ${this.profile.name}`)

      // 1. Establish Tunnel
      this.emitLog('info', `Establishing SSH tunnel to ${this.profile.sshHost}:${this.profile.sshPort}...`)
      this.tunnel = await createTunnel({
        sshHost: this.profile.sshHost,
        sshPort: this.profile.sshPort,
        sshUsername: this.profile.sshUsername,
        authMethod: this.profile.authMethod,
        keyPath: this.profile.keyPath,
        passphrase: this.profile.passphrase,
        password: this.profile.sshPassword,
        remoteDbHost: this.profile.dbHost,
        remoteDbPort: this.profile.dbPort
      })
      this.emitLog('success', `SSH tunnel established on local port ${this.tunnel.localPort}`)

      // 2. Load drivers
      this.remoteDriver = await getDriverInstance(this.profile.dbType)
      this.localDriver = await getDriverInstance(this.profile.dbType)

      // 3. Connect DBs
      this.emitLog('info', `Connecting to remote database via tunnel (${this.profile.dbName})...`)
      await this.remoteDriver.connect({
        host: '127.0.0.1',
        port: this.tunnel.localPort,
        user: this.profile.dbUser,
        password: this.profile.dbPassword,
        database: this.profile.dbName
      })
      this.emitLog('success', `Connected to remote database.`)

      this.emitLog('info', `Connecting to local destination database (${this.profile.localDbName})...`)
      await this.localDriver.connect({
        host: this.profile.localDbHost || '127.0.0.1',
        port: this.profile.localDbPort,
        user: this.profile.localDbUser,
        password: this.profile.localDbPassword,
        database: this.profile.localDbName
      })
      this.emitLog('success', `Connected to local database.`)

      this.stats.status = 'syncing'
      this.emitProgress()

      // 4. Sync Tables
      for (const table of this.tables) {
        if (this.isAborted) break

        const tableName = table.name
        this.stats.currentTable = tableName
        this.emitProgress()
        this.emitLog('info', `[${tableName}] Preparing table...`)

        // Fetch schema and create table locally if missing
        const schema = await this.remoteDriver.getTableSchema(tableName)
        await this.localDriver.syncTableSchema(tableName, schema)
        this.emitLog('info', `[${tableName}] Schema synchronized.`)
        
        // Truncate local table for full sync (or to empty it for structure mode)
        await this.localDriver.truncateTable(tableName)
        this.emitLog('info', `[${tableName}] Local table truncated.`)

        if (this.isAborted) break

        // Stream data if in 'full' mode
        if (table.mode === 'full') {
          this.emitLog('info', `[${tableName}] Starting data stream...`)
          const inserted = await this.streamTableData(table)
          
          // Self-correct totalRowsToSync (InnoDB information_schema.TABLE_ROWS is an approximation)
          const expected = (table.limit && table.limit > 0 && table.limit < (table.rowCount || 0)) 
                           ? table.limit 
                           : (table.rowCount || 0)
          this.stats.totalRowsToSync = this.stats.totalRowsToSync - expected + inserted
          this.forceEmitProgress()
          
          this.emitLog('success', `[${tableName}] Data sync completed.`)
        } else {
          this.emitLog('info', `[${tableName}] Skipped data (structure only).`)
        }

        this.stats.completedTables++
        this.emitProgress()
      }

      if (!this.isAborted) {
        this.stats.status = 'completed'
        this.forceEmitProgress()
      }

    } catch (err) {
      console.error('Sync error:', err)
      if (!this.isAborted) {
        this.stats.status = 'error'
        this.stats.error = err.message
        this.forceEmitProgress()
      }
    } finally {
      await this.cleanup()
      
      // Save history
      addSyncHistory({
        profileId: this.profile.id,
        profileName: this.profile.name,
        tables: this.tables.length,
        rows: this.stats.totalRows,
        status: this.stats.status,
        durationMs: Date.now() - this.stats.startTime
      })
    }
  }

  async streamTableData(table) {
    const tableName = table.name
    let batch = []
    let tableInsertedRows = 0
    // Increase batch size to 2000 for massive speed up (Bulk Insert Optimization)
    const BATCH_SIZE = 2000

    const flushBatch = async () => {
      if (batch.length === 0) return
      const toInsert = [...batch]
      batch = []
      await this.localDriver.insertBatch(tableName, toInsert)
      this.stats.totalRows += toInsert.length
      tableInsertedRows += toInsert.length

      // Calculate ETA
      const elapsedMs = Date.now() - this.stats.startTime
      if (elapsedMs > 1000 && this.stats.totalRows > 0) {
        const rowsPerMs = this.stats.totalRows / elapsedMs
        const remainingRows = this.stats.totalRowsToSync - this.stats.totalRows
        if (remainingRows > 0) {
          this.stats.etaSeconds = Math.round(remainingRows / rowsPerMs / 1000)
        } else {
          this.stats.etaSeconds = 0
        }
      }

      this.emitProgress()
    }

    const stream = await this.remoteDriver.streamTable(tableName, table.limit, table.order)
    this.activeStream = stream
    
    try {
      for await (const row of stream) {
        if (this.isAborted) {
          break
        }
        batch.push(row) // Just push the raw row directly
        if (batch.length >= BATCH_SIZE) {
          await flushBatch()
        }
      }
    } finally {
      this.activeStream = null
    }

    if (!this.isAborted) {
      await flushBatch()
    }
    
    return tableInsertedRows
  }
}

async function getDriverInstance(dbType) {
  switch (dbType) {
    case 'mysql':
    case 'mariadb': {
      const { MySQLDriver } = await import('../drivers/mysql-driver.js')
      return new MySQLDriver()
    }
    case 'postgresql': {
      const { PostgreSQLDriver } = await import('../drivers/postgres-driver.js')
      return new PostgreSQLDriver()
    }
    case 'sqlite': {
      const { SQLiteDriver } = await import('../drivers/sqlite-driver.js')
      return new SQLiteDriver()
    }
    default:
      throw new Error(`Unsupported database type: ${dbType}`)
  }
}
