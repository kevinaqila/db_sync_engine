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

  async syncTableSchema(tableName, createTableSql) {
    // Drop table if exists to ensure schema is exactly matched with remote,
    // avoiding "Unknown column" errors if remote schema was updated.
    await this.conn.query(`DROP TABLE IF EXISTS \`${tableName}\``)
    await this.conn.query(createTableSql)
  }

  async truncateTable(tableName) {
    await this.conn.query(`TRUNCATE TABLE \`${tableName}\``)
  }

  async detectSortColumn(tableName) {
    try {
      const [columns] = await this.conn.query(`SHOW COLUMNS FROM \`${tableName}\``)
      const colNames = columns.map(c => c.Field.toLowerCase())
      
      const timeCandidates = ['created_at', 'updated_at', 'created_time', 'updated_time', 'tanggal', 'date']
      for (const cand of timeCandidates) {
        const found = colNames.find(c => c === cand)
        if (found) {
          const originalCol = columns.find(c => c.Field.toLowerCase() === cand)
          return originalCol.Field
        }
      }
      
      const primaryCol = columns.find(c => c.Key === 'PRI')
      if (primaryCol) {
        return primaryCol.Field
      }
      
      const idCol = columns.find(c => c.Field.toLowerCase().endsWith('id'))
      if (idCol) {
        return idCol.Field
      }
    } catch (e) {
      // Fallback silently if SHOW COLUMNS fails
    }
    return null
  }

  async streamTable(tableName, limit, order = 'oldest') {
    // Must use the callback API from underlying connection for streaming
    const rawConn = this.conn.connection
    let sql = `SELECT * FROM \`${tableName}\``
    
    if (limit && limit > 0 && order === 'newest') {
      const sortColumn = await this.detectSortColumn(tableName)
      if (sortColumn) {
        sql += ` ORDER BY \`${sortColumn}\` DESC`
      }
    }
    
    if (limit && limit > 0) {
      sql += ` LIMIT ${limit}`
    }
    const query = rawConn.query(sql)
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

    const sql = `REPLACE INTO \`${tableName}\` (${columnsSql}) VALUES ${allPlaceholders}`
    
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
