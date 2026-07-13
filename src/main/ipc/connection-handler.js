import { ipcMain } from 'electron'
import { saveProfile, getProfiles, deleteProfile } from '../core/config-store'
import { testSshConnection, createTunnel } from '../core/ssh-tunnel'

// Active tunnels map: profileId -> { localPort, close }
const activeTunnels = new Map()

export function registerConnectionHandlers() {
  // --- Profile CRUD ---
  ipcMain.handle('profiles:getAll', () => {
    return getProfiles()
  })

  ipcMain.handle('profiles:save', (_, profile) => {
    return saveProfile(profile)
  })

  ipcMain.handle('profiles:delete', (_, id) => {
    deleteProfile(id)
    return { success: true }
  })

  // --- Test Connection ---
  ipcMain.handle('connection:testSsh', async (_, config) => {
    try {
      const result = await testSshConnection(config)
      return result
    } catch (err) {
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle('connection:testFull', async (_, profile) => {
    let tunnel = null
    try {
      // 1. Open SSH tunnel
      tunnel = await createTunnel({
        sshHost: profile.sshHost,
        sshPort: profile.sshPort,
        sshUsername: profile.sshUsername,
        authMethod: profile.authMethod,
        keyPath: profile.keyPath,
        passphrase: profile.passphrase,
        password: profile.sshPassword,
        remoteDbHost: profile.dbHost,
        remoteDbPort: profile.dbPort
      })

      // 2. Try DB connection
      const driver = await getDriver(profile.dbType)
      const dbResult = await driver.testConnection({
        host: '127.0.0.1',
        port: tunnel.localPort,
        user: profile.dbUser,
        password: profile.dbPassword,
        database: profile.dbName
      })

      return { success: true, message: `SSH ✓ | DB ✓ (${profile.dbType})`, dbInfo: dbResult }
    } catch (err) {
      return { success: false, message: err.message }
    } finally {
      if (tunnel) tunnel.close()
    }
  })

  // --- List Remote Tables ---
  ipcMain.handle('connection:listTables', async (_, profile) => {
    let tunnel = null
    try {
      tunnel = await createTunnel({
        sshHost: profile.sshHost,
        sshPort: profile.sshPort,
        sshUsername: profile.sshUsername,
        authMethod: profile.authMethod,
        keyPath: profile.keyPath,
        passphrase: profile.passphrase,
        password: profile.sshPassword,
        remoteDbHost: profile.dbHost,
        remoteDbPort: profile.dbPort
      })

      const driver = await getDriver(profile.dbType)
      const tables = await driver.listTables({
        host: '127.0.0.1',
        port: tunnel.localPort,
        user: profile.dbUser,
        password: profile.dbPassword,
        database: profile.dbName
      })

      // Convert BigInt or other weird objects to standard JSON primitives
      return JSON.parse(JSON.stringify({ success: true, tables }, (key, value) => 
        typeof value === 'bigint' ? Number(value) : value
      ))
    } catch (err) {
      return { success: false, message: err.message, tables: [] }
    } finally {
      if (tunnel) tunnel.close()
    }
  })
}

async function getDriver(dbType) {
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
