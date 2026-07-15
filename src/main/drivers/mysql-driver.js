import mysqlPromise from 'mysql2/promise'
import mysql from 'mysql2' // non-promise for streaming

export class MySQLDriver {
  constructor() {
    this.conn = null
    this.stream = null
  }

  // --- Stateless methods (for testing & listing) ---
  async testConnection(config) {
    const conn = await mysqlPromise.createConnection(config)
    const [rows] = await conn.execute('SELECT VERSION() as version')
    await conn.end()
    return { version: rows[0].version }
  }

  async listTables(config) {
    const conn = await mysqlPromise.createConnection(config)
    const [rows] = await conn.execute(
      'SELECT TABLE_NAME as name, TABLE_ROWS as rowCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
      [config.database]
    )
    await conn.end()
    return rows.map((r) => ({ name: r.name, rowCount: r.rowCount || 0 }))
  }

  // --- Stateful methods (for Sync Engine) ---
  async connect(config) {
    this.conn = await mysqlPromise.createConnection({
      ...config,
      multipleStatements: true // For executing SHOW CREATE TABLE properly or bulk drops
    })
    // Disable foreign key checks so we can create/truncate tables in any order
    await this.conn.query('SET FOREIGN_KEY_CHECKS = 0;')
  }

  async close() {
    if (this.stream) {
      this.stream.destroy()
      this.stream = null
    }
    if (this.conn) {
      await this.conn.end()
      this.conn = null
    }
  }

  async getTableSchema(tableName) {
    const [rows] = await this.conn.query(`SHOW CREATE TABLE \`${tableName}\``)
    let sql = rows[0]['Create Table']
    
    // Hapus baris CONSTRAINT FOREIGN KEY agar sinkronisasi tidak pernah gagal 
    // karena urutan tabel atau ketidaksesuaian index/tipe data di lokal.
    sql = sql.replace(/,\n\s*CONSTRAINT `[^`]+` FOREIGN KEY \([^)]+\) REFERENCES `[^`]+` \([^)]+\)( ON DELETE (CASCADE|SET NULL|NO ACTION|RESTRICT))?( ON UPDATE (CASCADE|SET NULL|NO ACTION|RESTRICT))?/gi, '')
    
    return sql
  }

  async syncTableSchema(tableName, createTableSql, dropIfExists = true) {
    if (dropIfExists) {
      await this.conn.query(`DROP TABLE IF EXISTS \`${tableName}\``)
    }
    
    // Ensure CREATE TABLE is safe if not dropping
    let safeSql = createTableSql
    if (!dropIfExists && safeSql.toUpperCase().startsWith('CREATE TABLE `')) {
      safeSql = safeSql.replace(/^CREATE TABLE `/i, 'CREATE TABLE IF NOT EXISTS `')
    } else if (!dropIfExists && safeSql.toUpperCase().startsWith('CREATE TABLE ')) {
      safeSql = safeSql.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ')
    }
    
    await this.conn.query(safeSql)
  }

  async getMaxValue(tableName, columnName) {
    try {
      const sql = `SELECT MAX(\`${columnName}\`) as max_val FROM \`${tableName}\``
      const [rows] = await this.conn.query(sql)
      return rows[0].max_val
    } catch(e) {
      return null
    }
  }

  async getRowCount(tableName) {
    try {
      const [rows] = await this.conn.query(`SELECT COUNT(*) as c FROM \`${tableName}\``)
      return rows[0].c
    } catch(e) {
      return 0
    }
  }

  async truncateTable(tableName) {
    await this.conn.query(`TRUNCATE TABLE \`${tableName}\``)
  }

  async prefetchMetadata() {
    this.sortColumnCache = {}
    try {
      const sql = `
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_KEY 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE()
      `
      const [rows] = await this.conn.query(sql)
      const tablesMap = {}
      for (const r of rows) {
        if (!tablesMap[r.TABLE_NAME]) tablesMap[r.TABLE_NAME] = []
        tablesMap[r.TABLE_NAME].push({ Field: r.COLUMN_NAME, Key: r.COLUMN_KEY })
      }

      for (const [tableName, columns] of Object.entries(tablesMap)) {
        const colNames = columns.map(c => c.Field.toLowerCase())
        
        // 1. Find update column (prefers updated_at)
        let updateCol = null
        const updateCandidates = ['updated_at', 'updated_time']
        for (const cand of updateCandidates) {
          if (colNames.includes(cand)) {
            updateCol = columns.find(c => c.Field.toLowerCase() === cand).Field
            break
          }
        }

        // 2. Find append column (prefers PRI, then id, then created_at)
        let appendCol = null
        const primaryCol = columns.find(c => c.Key === 'PRI')
        if (primaryCol) {
          appendCol = primaryCol.Field
        }
        if (!appendCol) {
          const idCol = columns.find(c => c.Field.toLowerCase().endsWith('id'))
          if (idCol) appendCol = idCol.Field
        }
        if (!appendCol) {
          const timeCandidates = ['created_at', 'created_time', 'tanggal', 'date']
          for (const cand of timeCandidates) {
            if (colNames.includes(cand)) {
              appendCol = columns.find(c => c.Field.toLowerCase() === cand).Field
              break
            }
          }
        }

        // 3. Fallbacks
        if (!updateCol) updateCol = appendCol
        if (!appendCol) appendCol = updateCol

        this.sortColumnCache[tableName] = {
          incremental: appendCol,
          update_append: updateCol
        }
      }
    } catch (e) {
      console.error('MySQL prefetch failed:', e)
    }
  }

  async detectSortColumn(tableName, strategy = 'incremental') {
    if (this.sortColumnCache && this.sortColumnCache[tableName]) {
      return this.sortColumnCache[tableName][strategy] || this.sortColumnCache[tableName].incremental
    }
    
    try {
      const [columns] = await this.conn.query(`SHOW COLUMNS FROM \`${tableName}\``)
      const colNames = columns.map(c => c.Field.toLowerCase())
      
      if (strategy === 'update_append') {
        const updateCandidates = ['updated_at', 'updated_time']
        for (const cand of updateCandidates) {
          const found = colNames.find(c => c === cand)
          if (found) return columns.find(c => c.Field.toLowerCase() === cand).Field
        }
      }
      
      const primaryCol = columns.find(c => c.Key === 'PRI')
      if (primaryCol) return primaryCol.Field
      
      const idCol = columns.find(c => c.Field.toLowerCase().endsWith('id'))
      if (idCol) return idCol.Field
      
      const timeCandidates = ['created_at', 'created_time', 'tanggal', 'date']
      for (const cand of timeCandidates) {
        const found = colNames.find(c => c === cand)
        if (found) return columns.find(c => c.Field.toLowerCase() === cand).Field
      }
    } catch (e) {
      // Fallback silently if SHOW COLUMNS fails
    }
    return null
  }

  async streamTable(tableName, limit, order = 'oldest', sinceColumn = null, sinceValue = null) {
    const rawConn = this.conn.connection
    let sql = `SELECT * FROM \`${tableName}\``
    const params = []
    
    if (sinceColumn && sinceValue !== undefined && sinceValue !== null) {
      sql += ` WHERE \`${sinceColumn}\` > ?`
      params.push(sinceValue)
    }
    
    if (limit && limit > 0 && order === 'newest') {
      const sortColumn = await this.detectSortColumn(tableName)
      if (sortColumn) {
        sql += ` ORDER BY \`${sortColumn}\` DESC`
      }
    } else if (sinceColumn) {
      // Always order ASC by sort column when doing incremental append
      sql += ` ORDER BY \`${sinceColumn}\` ASC`
    }
    
    if (limit && limit > 0) {
      sql += ` LIMIT ${limit}`
    }
    
    const query = rawConn.query(sql, params)
    return query.stream()
  }



  async insertBatch(tableName, rows) {
    if (!rows || rows.length === 0) return

    const columns = Object.keys(rows[0])
    const columnsSql = columns.map(c => `\`${c}\``).join(', ')
    
    // Create placeholders for one row: (?, ?, ?)
    const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`
    // Create placeholders for all rows: (?, ?, ?), (?, ?, ?)
    const allPlaceholders = rows.map(() => rowPlaceholders).join(', ')

    // Create ON DUPLICATE KEY UPDATE clause
    const updateClause = columns.map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ')

    const sql = `INSERT INTO \`${tableName}\` (${columnsSql}) VALUES ${allPlaceholders} ON DUPLICATE KEY UPDATE ${updateClause}`
    
    // Flatten values
    const values = []
    for (const row of rows) {
      for (const col of columns) {
        values.push(row[col])
      }
    }

    await this.conn.query(sql, values)
  }
}
