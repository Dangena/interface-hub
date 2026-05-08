import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database.js';
import {
  DataSourceConfig,
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
  closePool,
  getPool,
} from '../services/dataSource.js';

const router = Router();

router.get('/sources', async (req, res) => {
  const sources = (await query('SELECT * FROM database_connections ORDER BY created_at DESC')).rows;
  const safeSources = sources.map((s: any) => ({
    ...s,
    password: s.password ? '••••••••' : null,
  }));
  res.json(safeSources);
});

router.post('/sources', async (req, res) => {
  const { name, type, host, port, database_name, username, password, schema, ssl } = req.body;

  if (!name || !type || !host) {
    res.status(400).json({ error: 'Name, type, and host are required' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  await query(`
    INSERT INTO database_connections (id, name, type, host, port, database_name, username, password, path, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [id, name, type, host, port || 5432, database_name, username, password, schema || 'public', now]);

  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0];
  const safeSource = { ...(source as any), password: '••••••••' };
  res.status(201).json(safeSource);
});

router.put('/sources/:id', async (req, res) => {
  const { id } = req.params;
  const { name, type, host, port, database_name, username, password, schema, ssl } = req.body;
  const now = new Date().toISOString();

  const existing = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;
  if (!existing) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const updatedPassword = password && password !== '••••••••' ? password : existing.password;

  await query(`
    UPDATE database_connections SET name = $1, type = $2, host = $3, port = $4, database_name = $5,
    username = $6, password = $7, path = $8, created_at = $9
    WHERE id = $10
  `, [name || existing.name, type || existing.type, host || existing.host,
    port || existing.port, database_name || existing.database_name,
    username || existing.username, updatedPassword, schema || existing.path, now, id]);

  closePool(id);

  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0];
  res.json({ ...(source as any), password: '••••••••' });
});

router.delete('/sources/:id', async (req, res) => {
  const { id } = req.params;
  closePool(id);
  await query('DELETE FROM database_connections WHERE id = $1', [id]);
  res.json({ success: true });
});

router.post('/sources/:id/test', async (req, res) => {
  const { id } = req.params;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  const result = await testConnection(config);
  res.json(result);
});

router.get('/sources/:id/tables', async (req, res) => {
  const { id } = req.params;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const tables = await getTableList(config, req.query.schema as string);
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tables', details: (error as Error).message });
  }
});

router.get('/sources/:id/tables/:tableName', async (req, res) => {
  const { id, tableName } = req.params;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const columns = await getTableColumns(config, tableName, req.query.schema as string);
    res.json({ tableName, columns });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get table columns', details: (error as Error).message });
  }
});

router.get('/sources/:id/tables/:tableName/data', async (req, res) => {
  const { id, tableName } = req.params;
  const { page, pageSize, where, orderBy, orderDir, schema } = req.query;

  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;
  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const result = await getTableData(config, tableName, {
      schema: schema as string,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      where: where as string,
      orderBy: orderBy as string,
      orderDir: orderDir as 'ASC' | 'DESC',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get table data', details: (error as Error).message });
  }
});

router.post('/sources/:id/tables/:tableName/data', async (req, res) => {
  const { id, tableName } = req.params;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const result = await insertTableRow(config, tableName, req.body, req.query.schema as string);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to insert row', details: (error as Error).message });
  }
});

router.put('/sources/:id/tables/:tableName/data/:pkValue', async (req, res) => {
  const { id, tableName, pkValue } = req.params;
  const { pkColumn } = req.body;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const { [pkColumn || 'id']: _, ...updateData } = req.body;
    const result = await updateTableRow(config, tableName, pkColumn || 'id', pkValue, updateData, req.query.schema as string);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update row', details: (error as Error).message });
  }
});

router.delete('/sources/:id/tables/:tableName/data/:pkValue', async (req, res) => {
  const { id, tableName, pkValue } = req.params;
  const { pkColumn } = req.query;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const result = await deleteTableRow(config, tableName, (pkColumn as string) || 'id', pkValue, req.query.schema as string);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete row', details: (error as Error).message });
  }
});

router.post('/sources/:id/query', async (req, res) => {
  const { id } = req.params;
  const { sql, params } = req.body;

  if (!sql) {
    res.status(400).json({ error: 'SQL query is required' });
    return;
  }

  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;
  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const result = await executeQuery(config, sql, params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Query execution failed', details: (error as Error).message });
  }
});

router.get('/sources/:id/crud-apis', async (req, res) => {
  const { id } = req.params;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const tables = await getTableList(config, req.query.schema as string);
    const allAPIs: Record<string, any[]> = {};

    for (const table of tables) {
      allAPIs[table.table_name] = generateCRUDAPIs(table.table_name, table.columns);
    }

    res.json({ source: source.name, tables: allAPIs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate CRUD APIs', details: (error as Error).message });
  }
});

router.get('/sources/:id/graphql-schema', async (req, res) => {
  const { id } = req.params;
  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const tables = await getTableList(config, req.query.schema as string);
    const schemas: Record<string, { typeDefs: string; resolvers: string }> = {};

    const typeDefsParts: string[] = [];
    const queryParts: string[] = [];
    const mutationParts: string[] = [];

    for (const table of tables) {
      const schema = generateGraphQLSchema(table.table_name, table.columns);
      schemas[table.table_name] = schema;
      typeDefsParts.push(schema.typeDefs);
    }

    const combinedTypeDefs = typeDefsParts.join('\n\n');

    res.json({
      source: source.name,
      typeDefs: combinedTypeDefs,
      schemas,
      tableCount: tables.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate GraphQL schema', details: (error as Error).message });
  }
});

router.post('/sources/:id/graphql', async (req, res) => {
  const { id } = req.params;
  const { query: gqlQuery, variables } = req.body;

  if (!gqlQuery) {
    res.status(400).json({ error: 'GraphQL query is required' });
    return;
  }

  const source = (await query('SELECT * FROM database_connections WHERE id = $1', [id])).rows[0] as any;
  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: source.type,
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path,
    ssl: source.type === 'supabase',
  };

  try {
    const pool = getPool(config);
    const result = await pool.query(gqlQuery, variables);
    res.json({ data: result.rows });
  } catch (error) {
    res.status(500).json({
      errors: [{ message: (error as Error).message }],
    });
  }
});

export default router;
