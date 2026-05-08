import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';
import {
  DataSourceConfig,
  testConnection,
  getTableList,
  getTableData,
  insertTableRow,
  updateTableRow,
  deleteTableRow,
  getPool,
} from '../services/dataSource.js';

const router = Router();

interface SupabaseProject {
  id: string;
  name: string;
  url: string;
  anonKey: string;
  serviceKey?: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}

router.get('/projects', (req, res) => {
  const projects = db.prepare("SELECT * FROM database_connections WHERE type = 'supabase' ORDER BY created_at DESC").all();
  const safeProjects = projects.map((p: any) => ({
    ...p,
    password: p.password ? '••••••••' : null,
  }));
  res.json(safeProjects);
});

router.post('/connect', async (req, res) => {
  const { name, dbHost, dbPort, dbName, dbUser, dbPassword, projectUrl, anonKey, serviceKey } = req.body;

  if (!name || !dbHost || !dbName) {
    res.status(400).json({ error: 'Name, host, and database name are required' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO database_connections (id, name, type, host, port, database_name, username, password, path, created_at)
    VALUES (?, ?, 'supabase', ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, dbHost, dbPort || 5432, dbName, dbUser, dbPassword, 'public', now);

  const config: DataSourceConfig = {
    id,
    name,
    type: 'supabase',
    host: dbHost,
    port: dbPort || 5432,
    database: dbName,
    username: dbUser,
    password: dbPassword,
    schema: 'public',
    ssl: true,
  };

  const testResult = await testConnection(config);

  res.status(201).json({
    id,
    name,
    type: 'supabase',
    connectionTest: testResult,
  });
});

router.get('/:id/tables', async (req, res) => {
  const { id } = req.params;
  const source = db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'supabase') as any;

  if (!source) {
    res.status(404).json({ error: 'Supabase project not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: 'supabase',
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path || 'public',
    ssl: true,
  };

  try {
    const tables = await getTableList(config);
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tables', details: (error as Error).message });
  }
});

router.get('/:id/rest-api/:tableName', async (req, res) => {
  const { id, tableName } = req.params;
  const { select, filter, order, limit, offset } = req.query;

  const source = db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'supabase') as any;
  if (!source) {
    res.status(404).json({ error: 'Supabase project not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: 'supabase',
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path || 'public',
    ssl: true,
  };

  try {
    let whereClause = '';
    if (filter) {
      const filters = (filter as string).split(',').map(f => {
        const [col, op, val] = f.split('.');
        if (op === 'eq') return `"${col}" = '${val}'`;
        if (op === 'neq') return `"${col}" != '${val}'`;
        if (op === 'gt') return `"${col}" > '${val}'`;
        if (op === 'lt') return `"${col}" < '${val}'`;
        if (op === 'like') return `"${col}" LIKE '${val}'`;
        if (op === 'in') return `"${col}" IN (${val.split('|').map(v => `'${v}'`).join(',')})`;
        return `"${col}" = '${val}'`;
      });
      whereClause = filters.join(' AND ');
    }

    const result = await getTableData(config, tableName, {
      pageSize: limit ? parseInt(limit as string) : 100,
      page: offset ? Math.floor(parseInt(offset as string) / (parseInt((limit as string) || '100'))) + 1 : 1,
      where: whereClause || undefined,
      orderBy: order ? (order as string).replace(/^"/, '').replace(/"$/, '') : undefined,
    });

    let data = result.data;
    if (select && select !== '*') {
      const columns = (select as string).split(',');
      data = data.map((row: any) => {
        const filtered: any = {};
        columns.forEach(col => {
          if (row[col] !== undefined) filtered[col] = row[col];
        });
        return filtered;
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Query failed', details: (error as Error).message });
  }
});

router.post('/:id/rest-api/:tableName', async (req, res) => {
  const { id, tableName } = req.params;

  const source = db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'supabase') as any;
  if (!source) {
    res.status(404).json({ error: 'Supabase project not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: 'supabase',
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path || 'public',
    ssl: true,
  };

  try {
    const result = await insertTableRow(config, tableName, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Insert failed', details: (error as Error).message });
  }
});

router.patch('/:id/rest-api/:tableName', async (req, res) => {
  const { id, tableName } = req.params;
  const { pkColumn, pkValue, ...updateData } = req.body;

  if (!pkColumn || pkValue === undefined) {
    res.status(400).json({ error: 'pkColumn and pkValue are required in body' });
    return;
  }

  const source = db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'supabase') as any;
  if (!source) {
    res.status(404).json({ error: 'Supabase project not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: 'supabase',
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path || 'public',
    ssl: true,
  };

  try {
    const result = await updateTableRow(config, tableName, pkColumn, pkValue, updateData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Update failed', details: (error as Error).message });
  }
});

router.delete('/:id/rest-api/:tableName', async (req, res) => {
  const { id, tableName } = req.params;
  const { pkColumn, pkValue } = req.query;

  if (!pkColumn || !pkValue) {
    res.status(400).json({ error: 'pkColumn and pkValue query params are required' });
    return;
  }

  const source = db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'supabase') as any;
  if (!source) {
    res.status(404).json({ error: 'Supabase project not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: 'supabase',
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path || 'public',
    ssl: true,
  };

  try {
    const result = await deleteTableRow(config, tableName, pkColumn as string, pkValue);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed', details: (error as Error).message });
  }
});

router.get('/:id/rpc/:functionName', async (req, res) => {
  const { id, functionName } = req.params;
  const source = db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'supabase') as any;

  if (!source) {
    res.status(404).json({ error: 'Supabase project not found' });
    return;
  }

  const config: DataSourceConfig = {
    id: source.id,
    name: source.name,
    type: 'supabase',
    host: source.host,
    port: source.port,
    database: source.database_name,
    username: source.username,
    password: source.password,
    schema: source.path || 'public',
    ssl: true,
  };

  try {
    const pool = getPool(config);
    const params = req.query;
    const paramValues = Object.values(params);
    const paramPlaceholders = Object.keys(params).map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `SELECT * FROM "${source.path || 'public'}"."${functionName}"(${paramPlaceholders})`,
      paramValues
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'RPC call failed', details: (error as Error).message });
  }
});

export default router;
