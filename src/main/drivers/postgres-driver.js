import pg from 'pg'
const { Client } = pg

export class PostgreSQLDriver {
  constructor() {
    this.client = null
  }

  // --- Stateless methods ---
  async testConnection(config) {
    const client = new Client(config)
    await client.connect()
    const res = await client.query('SELECT version()')
    await client.end()
    return { version: res.rows[0].version }
  }

  async listTables(config) {
    const client = new Client(config)
    await client.connect()
    const res = await client.query(
      `SELECT schemaname, tablename as name,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as row_count
       FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    )
    await client.end()
    return res.rows.map((r) => ({ name: r.name, rowCount: Number(r.row_count) || 0 }))
  }

  // --- Stateful methods (for Sync Engine) ---
  async connect(config) {
    this.client = new Client(config)
    await this.client.connect()
  }

  async close() {
    if (this.client) {
      await this.client.end()
      this.client = null
    }
  }

  async getTableSchema(tableName) {
    // Generate basic schema since Postgres doesn't have SHOW CREATE TABLE
    const res = await this.client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `, [tableName])

    if (res.rows.length === 0) throw new Error(`Table ${tableName} not found`)

    let cols = res.rows.map(r => {
      let type = r.data_type
      if (r.character_maximum_length) type += `(${r.character_maximum_length})`
      const nullable = r.is_nullable === 'YES' ? '' : 'NOT NULL'
      return `"${r.column_name}" ${type} ${nullable}`
    })

    return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${cols.join(',\n  ')}\n);`
  }

  async syncTableSchema(tableName, createTableSql) {
    await this.client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`)
    await this.client.query(createTableSql)
  }

  async truncateTable(tableName) {
    await this.client.query(`TRUNCATE TABLE "${tableName}" CASCADE`)
  }

  async *streamTable(tableName, limit) {
    let offset = 0
    const chunkLimit = 1000
    let totalFetched = 0
    while (true) {
      const fetchLimit = (limit > 0 && limit - totalFetched < chunkLimit) ? limit - totalFetched : chunkLimit
      if (limit > 0 && totalFetched >= limit) break

      const res = await this.client.query(`SELECT * FROM "${tableName}" LIMIT ${fetchLimit} OFFSET ${offset}`)
      for (const row of res.rows) {
        yield row
        totalFetched++
      }
      if (res.rows.length < fetchLimit) break
      offset += fetchLimit
    }
  }

  async insertBatch(tableName, rows) {
    if (!rows || rows.length === 0) return

    const columns = Object.keys(rows[0])
    const columnsSql = columns.map(c => `"${c}"`).join(', ')
    
    // Postgres bulk insert format: ($1, $2), ($3, $4)
    let paramIndex = 1
    const placeholders = rows.map(() => {
      const rowParams = columns.map(() => `$${paramIndex++}`)
      return `(${rowParams.join(', ')})`
    }).join(', ')

    const sql = `INSERT INTO "${tableName}" (${columnsSql}) VALUES ${placeholders}`
    
    const values = []
    for (const row of rows) {
      for (const col of columns) {
        values.push(row[col])
      }
    }

    await this.client.query(sql, values)
  }
}
