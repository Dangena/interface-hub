import pg from 'pg';

const { Pool } = pg;

interface DataSourceConfig {
  id: string;
  name: string;
  type: 'postgresql' | 'supabase' | 'sqlite';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema?: string;
  ssl?: boolean;
}

interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_primary_key: boolean;
  is_unique: boolean;
  is_auto_increment: boolean;
  comment: string | null;
  foreign_key?: {
    table: string;
    column: string;
  };
}

interface TableInfo {
  table_name: string;
  table_type: string;
  schema_name: string;
  columns: TableColumn[];
  row_count?: number;
  comment?: string;
}

interface GeneratedAPI {
  method: string;
  path: string;
  description: string;
  handler: string;
  parameters: Array<{
    name: string;
    type: string;
    location: string;
    required: boolean;
  }>;
}

const pools = new Map<string, pg.Pool>();

function getPool(config: DataSourceConfig): pg.Pool {
  const existing = pools.get(config.id);
  if (existing) return existing;

  const poolConfig: pg.PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (config.ssl) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  if (config.type === 'supabase') {
    poolConfig.ssl = { rejectUnauthorized: false };
    poolConfig.port = config.port || 5432;
  }

  const pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error(`PostgreSQL pool error for ${config.name}:`, err.message);
  });

  pools.set(config.id, pool);
  return pool;
}

async function closePool(id: string): Promise<void> {
  const pool = pools.get(id);
  if (pool) {
    await pool.end();
    pools.delete(id);
  }
}

async function testConnection(config: DataSourceConfig): Promise<{ success: boolean; message: string; version?: string }> {
  let pool: pg.Pool | undefined;
  try {
    pool = getPool(config);
    const result = await pool.query('SELECT version()');
    const version = result.rows[0]?.version || 'Unknown';
    return { success: true, message: 'Connection successful', version: version.split(',')[0] };
  } catch (error) {
    closePool(config.id);
    return { success: false, message: (error as Error).message };
  }
}

async function getTableList(config: DataSourceConfig, schemaName?: string): Promise<TableInfo[]> {
  const pool = getPool(config);
  const schema = schemaName || config.schema || 'public';

  const tablesResult = await pool.query(
    `SELECT t.table_name, t.table_type, obj_description(c.oid) as comment
     FROM information_schema.tables t
     LEFT JOIN pg_class c ON c.relname = t.table_name
     LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
     WHERE t.table_schema = $1 AND t.table_type IN ('BASE TABLE', 'VIEW')
     ORDER BY t.table_name`,
    [schema]
  );

  const tables: TableInfo[] = [];

  for (const row of tablesResult.rows) {
    const columns = await getTableColumns(config, row.table_name, schema);
    let rowCount: number | undefined;

    if (row.table_type === 'BASE TABLE') {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${schema}"."${row.table_name}"`);
        rowCount = parseInt(countResult.rows[0]?.count || '0', 10);
      } catch (_e: any) {
        rowCount = undefined;
      }
    }

    tables.push({
      table_name: row.table_name,
      table_type: row.table_type,
      schema_name: schema,
      columns,
      row_count: rowCount,
      comment: row.comment,
    });
  }

  return tables;
}

async function getTableColumns(config: DataSourceConfig, tableName: string, schemaName?: string): Promise<TableColumn[]> {
  const pool = getPool(config);
  const schema = schemaName || config.schema || 'public';

  const pkResult = await pool.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'`,
    [schema, tableName]
  );
  const pkColumns = new Set(pkResult.rows.map((r: any) => r.column_name));

  const uniqueResult = await pool.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'UNIQUE'`,
    [schema, tableName]
  );
  const uniqueColumns = new Set(uniqueResult.rows.map((r: any) => r.column_name));

  const fkResult = await pool.query(
    `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
     WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'FOREIGN KEY'`,
    [schema, tableName]
  );
  const fkMap = new Map<string, { table: string; column: string }>();
  for (const row of fkResult.rows) {
    fkMap.set(row.column_name, { table: row.foreign_table, column: row.foreign_column });
  }

  const columnsResult = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale,
            col_description(attrelid, attnum) as comment
     FROM information_schema.columns c
     LEFT JOIN pg_attribute a ON a.attname = c.column_name
     LEFT JOIN pg_class t ON t.relname = c.table_name
     LEFT JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = c.table_schema
     WHERE c.table_schema = $1 AND c.table_name = $2
     ORDER BY c.ordinal_position`,
    [schema, tableName]
  );

  return columnsResult.rows.map((row: any) => ({
    column_name: row.column_name,
    data_type: row.data_type,
    is_nullable: row.is_nullable,
    column_default: row.column_default,
    character_maximum_length: row.character_maximum_length,
    numeric_precision: row.numeric_precision,
    numeric_scale: row.numeric_scale,
    is_primary_key: pkColumns.has(row.column_name),
    is_unique: uniqueColumns.has(row.column_name),
    is_auto_increment: row.column_default?.includes('nextval') || false,
    comment: row.comment,
    foreign_key: fkMap.get(row.column_name),
  }));
}

async function getTableData(config: DataSourceConfig, tableName: string, options?: {
  schema?: string;
  page?: number;
  pageSize?: number;
  where?: string;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
  const pool = getPool(config);
  const schema = options?.schema || config.schema || 'public';
  const page = options?.page || 1;
  const pageSize = Math.min(options?.pageSize || 50, 500);
  const offset = (page - 1) * pageSize;

  const whereClause = options?.where ? `WHERE ${options.where}` : '';
  const orderByClause = options?.orderBy
    ? `ORDER BY "${options.orderBy}" ${options.orderDir || 'ASC'}`
    : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM "${schema}"."${tableName}" ${whereClause}`
  );
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataResult = await pool.query(
    `SELECT * FROM "${schema}"."${tableName}" ${whereClause} ${orderByClause} LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  return { data: dataResult.rows, total, page, pageSize };
}

async function insertTableRow(config: DataSourceConfig, tableName: string, data: Record<string, any>, schemaName?: string): Promise<any> {
  const pool = getPool(config);
  const schema = schemaName || config.schema || 'public';

  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const columnNames = columns.map(c => `"${c}"`).join(', ');

  const result = await pool.query(
    `INSERT INTO "${schema}"."${tableName}" (${columnNames}) VALUES (${placeholders}) RETURNING *`,
    values
  );

  return result.rows[0];
}

async function updateTableRow(config: DataSourceConfig, tableName: string, primaryKey: string, primaryKeyValue: any, data: Record<string, any>, schemaName?: string): Promise<any> {
  const pool = getPool(config);
  const schema = schemaName || config.schema || 'public';

  const setClauses = Object.keys(data).map((key, i) => `"${key}" = $${i + 1}`).join(', ');
  const values = [...Object.values(data), primaryKeyValue];

  const result = await pool.query(
    `UPDATE "${schema}"."${tableName}" SET ${setClauses} WHERE "${primaryKey}" = $${values.length} RETURNING *`,
    values
  );

  return result.rows[0];
}

async function deleteTableRow(config: DataSourceConfig, tableName: string, primaryKey: string, primaryKeyValue: any, schemaName?: string): Promise<boolean> {
  const pool = getPool(config);
  const schema = schemaName || config.schema || 'public';

  const result = await pool.query(
    `DELETE FROM "${schema}"."${tableName}" WHERE "${primaryKey}" = $1`,
    [primaryKeyValue]
  );

  return (result.rowCount || 0) > 0;
}

async function executeQuery(config: DataSourceConfig, sql: string, params?: any[]): Promise<{ rows: any[]; rowCount: number; fields: any[] }> {
  const pool = getPool(config);

  const result = await pool.query(sql, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount || 0,
    fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })) || [],
  };
}

function generateCRUDAPIs(tableName: string, columns: TableColumn[]): GeneratedAPI[] {
  const apis: GeneratedAPI[] = [];
  const pk = columns.find(c => c.is_primary_key);
  const pkName = pk?.column_name || 'id';

  apis.push({
    method: 'GET',
    path: `/${tableName}`,
    description: `List all ${tableName} with pagination`,
    handler: 'list',
    parameters: [
      { name: 'page', type: 'integer', location: 'query', required: false },
      { name: 'pageSize', type: 'integer', location: 'query', required: false },
      { name: 'orderBy', type: 'string', location: 'query', required: false },
      { name: 'orderDir', type: 'string', location: 'query', required: false },
    ],
  });

  apis.push({
    method: 'GET',
    path: `/${tableName}/:${pkName}`,
    description: `Get a single ${tableName} by ${pkName}`,
    handler: 'getOne',
    parameters: [
      { name: pkName, type: mapPGTypeToJS(pk?.data_type || 'integer'), location: 'path', required: true },
    ],
  });

  const writableColumns = columns.filter(c => !c.is_auto_increment && c.column_default !== 'now()' && !c.column_default?.includes('nextval'));

  apis.push({
    method: 'POST',
    path: `/${tableName}`,
    description: `Create a new ${tableName}`,
    handler: 'create',
    parameters: writableColumns.map(c => ({
      name: c.column_name,
      type: mapPGTypeToJS(c.data_type),
      location: 'body',
      required: c.is_nullable === 'NO' && !c.column_default,
    })),
  });

  apis.push({
    method: 'PUT',
    path: `/${tableName}/:${pkName}`,
    description: `Update a ${tableName} by ${pkName}`,
    handler: 'update',
    parameters: [
      { name: pkName, type: mapPGTypeToJS(pk?.data_type || 'integer'), location: 'path', required: true },
      ...writableColumns.map(c => ({
        name: c.column_name,
        type: mapPGTypeToJS(c.data_type),
        location: 'body',
        required: false,
      })),
    ],
  });

  apis.push({
    method: 'DELETE',
    path: `/${tableName}/:${pkName}`,
    description: `Delete a ${tableName} by ${pkName}`,
    handler: 'delete',
    parameters: [
      { name: pkName, type: mapPGTypeToJS(pk?.data_type || 'integer'), location: 'path', required: true },
    ],
  });

  apis.push({
    method: 'GET',
    path: `/${tableName}/count`,
    description: `Get count of ${tableName}`,
    handler: 'count',
    parameters: [],
  });

  return apis;
}

function generateGraphQLSchema(tableName: string, columns: TableColumn[]): { typeDefs: string; resolvers: string } {
  const typeName = tableName.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const inputTypeName = `${typeName}Input`;
  const filterTypeName = `${typeName}Filter`;

  const typeFields = columns.map(c => {
    const gqlType = mapPGTypeToGraphQL(c.data_type);
    const nullable = c.is_nullable === 'YES' ? '' : '!';
    return `  ${c.column_name}: ${gqlType}${nullable}`;
  }).join('\n');

  const inputFields = columns
    .filter(c => !c.is_auto_increment && !c.column_default?.includes('nextval'))
    .map(c => {
      const gqlType = mapPGTypeToGraphQL(c.data_type);
      const nullable = c.is_nullable === 'YES' || c.column_default ? '' : '!';
      return `  ${c.column_name}: ${gqlType}${nullable}`;
    }).join('\n');

  const filterFields = columns.map(c => {
    const gqlType = mapPGTypeToGraphQL(c.data_type);
    return `  ${c.column_name}: ${gqlType}`;
  }).join('\n');

  const pk = columns.find(c => c.is_primary_key);
  const pkName = pk?.column_name || 'id';
  const pkGqlType = mapPGTypeToGraphQL(pk?.data_type || 'integer');

  const typeDefs = `type ${typeName} {
${typeFields}
}

input ${inputTypeName} {
${inputFields}
}

input ${filterTypeName} {
${filterFields}
  page: Int
  pageSize: Int
  orderBy: String
  orderDir: String
}

type Query {
  ${tableName}(filter: ${filterTypeName}): [${typeName}]!
  ${tableName}By${pkName.charAt(0).toUpperCase() + pkName.slice(1)}(${pkName}: ${pkGqlType}!): ${typeName}
  ${tableName}Count: Int!
}

type Mutation {
  create${typeName}(input: ${inputTypeName}!): ${typeName}!
  update${typeName}(${pkName}: ${pkGqlType}!, input: ${inputTypeName}!): ${typeName}!
  delete${typeName}(${pkName}: ${pkGqlType}!): Boolean!
}`;

  const resolvers = `Query: {
  ${tableName}: async (_, { filter }, context) => {
    const { page, pageSize, orderBy, orderDir, ...where } = filter || {};
    const result = await context.dataSource.getTableData('${tableName}', {
      page, pageSize, orderBy, orderDir,
      where: Object.keys(where).length > 0 ? buildWhereClause(where) : undefined
    });
    return result.data;
  },
  ${tableName}By${pkName.charAt(0).toUpperCase() + pkName.slice(1)}: async (_, { ${pkName} }, context) => {
    const result = await context.dataSource.getTableData('${tableName}', {
      where: '"${pkName}" = \\'${pkName}\\''
    });
    return result.data[0];
  },
  ${tableName}Count: async (_, __, context) => {
    const result = await context.dataSource.getTableData('${tableName}', { pageSize: 0 });
    return result.total;
  }
},
Mutation: {
  create${typeName}: async (_, { input }, context) => {
    return context.dataSource.insertTableRow('${tableName}', input);
  },
  update${typeName}: async (_, { ${pkName}, input }, context) => {
    return context.dataSource.updateTableRow('${tableName}', '${pkName}', ${pkName}, input);
  },
  delete${typeName}: async (_, { ${pkName} }, context) => {
    return context.dataSource.deleteTableRow('${tableName}', '${pkName}', ${pkName});
  }
}`;

  return { typeDefs, resolvers };
}

function mapPGTypeToJS(pgType: string): string {
  const map: Record<string, string> = {
    'integer': 'number', 'bigint': 'number', 'smallint': 'number', 'int': 'number',
    'numeric': 'number', 'decimal': 'number', 'real': 'number', 'double precision': 'number',
    'character varying': 'string', 'character': 'string', 'text': 'string', 'varchar': 'string',
    'boolean': 'boolean', 'bool': 'boolean',
    'date': 'string', 'timestamp without time zone': 'string', 'timestamp with time zone': 'string',
    'time without time zone': 'string', 'time with time zone': 'string',
    'json': 'object', 'jsonb': 'object',
    'uuid': 'string', 'bytea': 'string',
    'ARRAY': 'array',
  };

  for (const [key, value] of Object.entries(map)) {
    if (pgType.toLowerCase().includes(key.toLowerCase())) return value;
  }

  return 'string';
}

function mapPGTypeToGraphQL(pgType: string): string {
  const map: Record<string, string> = {
    'integer': 'Int', 'bigint': 'Int', 'smallint': 'Int', 'int': 'Int',
    'numeric': 'Float', 'decimal': 'Float', 'real': 'Float', 'double precision': 'Float',
    'character varying': 'String', 'character': 'String', 'text': 'String', 'varchar': 'String',
    'boolean': 'Boolean', 'bool': 'Boolean',
    'date': 'String', 'timestamp without time zone': 'String', 'timestamp with time zone': 'String',
    'json': 'JSON', 'jsonb': 'JSON',
    'uuid': 'ID', 'bytea': 'String',
  };

  for (const [key, value] of Object.entries(map)) {
    if (pgType.toLowerCase().includes(key.toLowerCase())) return value;
  }

  return 'String';
}

export {
  DataSourceConfig,
  TableColumn,
  TableInfo,
  GeneratedAPI,
  getPool,
  closePool,
  testConnection,
  getTableList,
  getTableColumns,
  getTableData,
  insertTableRow,
  updateTableRow,
  deleteTableRow,
  executeQuery,
  generateCRUDAPIs,
  generateGraphQLSchema,
  mapPGTypeToJS,
  mapPGTypeToGraphQL,
};
