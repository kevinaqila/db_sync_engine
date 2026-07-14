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

  async syncTableSchema(tableName, createTableSql, dropIfExists = true) {
    if (dropIfExists) {
      await this.client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`)
    }
    await this.client.query(createTableSql)
  }

  async getMaxValue(tableName, columnName) {
    try {
      const sql = `SELECT MAX("${columnName}") as max_val FROM "${tableName}"`
      const res = await this.client.query(sql)
      return res.rows[0].max_val
    } catch(e) {
      return null
    }
  }

  async truncateTable(tableName) {
    await this.client.query(`TRUNCATE TABLE "${tableName}" CASCADE`)
  }

  async prefetchMetadata() {
    this.sortColumnCache = {}
    try {
      const colRes = await this.client.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
      `)
      
      const pkRes = await this.client.query(`
        SELECT t.relname as table_name, a.attname as column_name
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        JOIN   pg_class t ON t.oid = i.indrelid
        JOIN   pg_namespace n ON n.oid = t.relnamespace
        WHERE  i.indisprimary AND n.nspname = 'public'
      `)
      
      const pkMap = {}
      for (const r of pkRes.rows) {
        pkMap[r.table_name] = r.column_name
      }

      const tablesMap = {}
      for (const r of colRes.rows) {
        if (!tablesMap[r.table_name]) tablesMap[r.table_name] = []
        tablesMap[r.table_name].push(r.column_name)
      }

      for (const [tableName, columns] of Object.entries(tablesMap)) {
        const colNames = columns.map(c => c.toLowerCase())
        
        // 1. Find update column
        let updateCol = null
        const updateCandidates = ['updated_at', 'updated_time']
        for (const cand of updateCandidates) {
          if (colNames.includes(cand)) {
            updateCol = columns[colNames.indexOf(cand)]
            break
          }
        }
        
        // 2. Find append column
        let appendCol = null
        if (pkMap[tableName]) {
          appendCol = pkMap[tableName]
        }
        if (!appendCol) {
          const idCol = columns.find(c => c.toLowerCase().endsWith('id'))
          if (idCol) appendCol = idCol
        }
        if (!appendCol) {
          const timeCandidates = ['created_at', 'created_time', 'tanggal', 'date']
          for (const cand of timeCandidates) {
            if (colNames.includes(cand)) {
              appendCol = columns[colNames.indexOf(cand)]
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
      console.error('Postgres prefetch failed:', e)
    }
  }

  async detectSortColumn(tableName, strategy = 'incremental') {
    if (this.sortColumnCache && this.sortColumnCache[tableName]) {
      return this.sortColumnCache[tableName][strategy] || this.sortColumnCache[tableName].incremental
    }
    
    try {
      const res = await this.client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [tableName])
      
      const columns = res.rows.map(r => r.column_name)
      const colNames = columns.map(c => c.toLowerCase())
      
      if (strategy === 'update_append') {
        const updateCandidates = ['updated_at', 'updated_time']
        for (const cand of updateCandidates) {
          const found = colNames.find(c => c === cand)
          if (found) return columns[colNames.indexOf(cand)]
        }
      }
      
      const pkRes = await this.client.query(`
        SELECT a.attname
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = $1::regclass
        AND    i.indisprimary;
      `, [tableName]).catch(() => ({ rows: [] }))
      
      if (pkRes.rows && pkRes.rows.length > 0) return pkRes.rows[0].attname
      
      const idCol = columns.find(c => c.toLowerCase().endsWith('id'))
      if (idCol) return idCol
      
      const timeCandidates = ['created_at', 'created_time', 'tanggal', 'date']
      for (const cand of timeCandidates) {
        const found = colNames.find(c => c === cand)
        if (found) return columns[colNames.indexOf(cand)]
      }
    } catch (e) {
      // Fallback silently
    }
    return null
  }

  async *streamTable(tableName, limit, order = 'oldest', sinceColumn = null, sinceValue = null) {
    let offset = 0
    const chunkLimit = 1000
    let totalFetched = 0
    
    let whereSql = ''
    const params = []
    if (sinceColumn && sinceValue !== undefined && sinceValue !== null) {
      whereSql = `WHERE "${sinceColumn}" > $1`
      params.push(sinceValue)
    }

    let orderSql = ''
    if (limit && limit > 0 && order === 'newest') {
      const sortColumn = await this.detectSortColumn(tableName)
      if (sortColumn) {
        orderSql = `ORDER BY "${sortColumn}" DESC`
      }
    } else if (sinceColumn) {
      orderSql = `ORDER BY "${sinceColumn}" ASC`
    }

    while (true) {
      const fetchLimit = (limit > 0 && limit - totalFetched < chunkLimit) ? limit - totalFetched : chunkLimit
      if (limit > 0 && totalFetched >= limit) break

      const sql = `SELECT * FROM "${tableName}" ${whereSql} ${orderSql} LIMIT ${fetchLimit} OFFSET ${offset}`
      const res = await this.client.query(sql, params)
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
    const allPlaceholders = rows.map(() => {
      const rowParams = columns.map(() => `$${paramIndex++}`)
      return `(${rowParams.join(', ')})`
    }).join(', ')

    const pkCol = await this.detectSortColumn(tableName, 'incremental')
    let conflictClause = 'ON CONFLICT DO NOTHING'
    
    if (pkCol) {
      // If we have a PK, we can do UPSERT
      const updateSet = columns.filter(c => c !== pkCol).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')
      if (updateSet) {
        conflictClause = `ON CONFLICT ("${pkCol}") DO UPDATE SET ${updateSet}`
      }
    }

    const sql = `INSERT INTO "${tableName}" (${columnsSql}) VALUES ${allPlaceholders} ${conflictClause}`
    
    const values = []
    for (const row of rows) {
      for (const col of columns) {
        values.push(row[col])
      }
    }

    await this.client.query(sql, values)
  }
}
