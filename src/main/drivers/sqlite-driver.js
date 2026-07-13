import Database from 'better-sqlite3'

export class SQLiteDriver {
  constructor() {
    this.db = null
  }

  async testConnection(config) {
    const db = new Database(config.database || ':memory:')
    db.close()
    return { version: 'SQLite3' }
  }

  async listTables(config) {
    const db = new Database(config.database)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    const result = tables.map(t => {
      const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get()
      return { name: t.name, rowCount: count.c }
    })
    db.close()
    return result
  }

  async connect(config) {
    this.db = new Database(config.database)
    // Optimize for bulk insert
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
  }

  async close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  async getTableSchema(tableName) {
    const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
    if (!row) throw new Error(`Table ${tableName} not found`)
    return row.sql
  }

  async syncTableSchema(tableName, createTableSql) {
    this.db.exec(`DROP TABLE IF EXISTS "${tableName}"`)
    
    // Basic translation of MySQL/Postgres CREATE TABLE syntax to SQLite
    let sql = createTableSql
      .replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT')
      .replace(/INT\([0-9]+\)/gi, 'INTEGER')
      .replace(/VARCHAR\([0-9]+\)/gi, 'TEXT')
      .replace(/DATETIME/gi, 'TEXT')
      .replace(/TIMESTAMP/gi, 'TEXT')
      .replace(/ENGINE=InnoDB.*/gi, '')
      .replace(/CHARACTER SET [a-z0-9_]+/gi, '')
      .replace(/COLLATE [a-z0-9_]+/gi, '')
      
    this.db.exec(sql)
  }

  async truncateTable(tableName) {
    this.db.prepare(`DELETE FROM "${tableName}"`).run()
  }

  detectSortColumn(tableName) {
    try {
      const info = this.db.pragma(`table_info("${tableName}")`)
      const columns = info.map(c => c.name)
      const colNames = columns.map(c => c.toLowerCase())
      
      const timeCandidates = ['created_at', 'updated_at', 'created_time', 'updated_time', 'tanggal', 'date']
      for (const cand of timeCandidates) {
        const found = colNames.find(c => c === cand)
        if (found) {
          return columns[colNames.indexOf(cand)]
        }
      }
      
      const pkCol = info.find(c => c.pk > 0)
      if (pkCol) {
        return pkCol.name
      }
      
      const idCol = columns.find(c => c.toLowerCase().endsWith('id'))
      if (idCol) {
        return idCol
      }
    } catch (e) {
      // Fallback silently
    }
    return null
  }

  async *streamTable(tableName, limit, order = 'oldest') {
    let sql = `SELECT * FROM "${tableName}"`
    
    if (limit && limit > 0 && order === 'newest') {
      const sortColumn = this.detectSortColumn(tableName)
      if (sortColumn) {
        sql += ` ORDER BY "${sortColumn}" DESC`
      }
    }

    if (limit && limit > 0) {
      sql += ` LIMIT ${limit}`
    }
    const stmt = this.db.prepare(sql)
    for (const row of stmt.iterate()) {
      yield row
    }
  }

  async insertBatch(tableName, rows) {
    if (!rows || rows.length === 0) return

    const columns = Object.keys(rows[0])
    const columnsSql = columns.map(c => `"${c}"`).join(', ')
    const placeholders = columns.map(() => '?').join(', ')

    const stmt = this.db.prepare(`REPLACE INTO "${tableName}" (${columnsSql}) VALUES (${placeholders})`)
    
    const insertMany = this.db.transaction((items) => {
      for (const item of items) {
        const values = columns.map(c => item[c])
        stmt.run(...values)
      }
    })

    insertMany(rows)
  }
}
