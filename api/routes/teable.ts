import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';

const router = Router();

function getConnection(id: string) {
  return db.prepare('SELECT * FROM database_connections WHERE id = ? AND type = ?').get(id, 'teable') as any;
}

function maskConnection(conn: any) {
  if (!conn) return conn;
  return { ...conn, password: conn.password ? '••••••••' : null };
}

async function teableFetch(host: string, path: string, apiKey: string, options?: RequestInit) {
  const url = `${host.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teable API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

router.get('/connections', (req, res) => {
  const connections = db.prepare("SELECT * FROM database_connections WHERE type = 'teable' ORDER BY created_at DESC").all();
  res.json(connections.map(maskConnection));
});

router.post('/connections', (req, res) => {
  const { name, apiUrl, apiKey, spaceId } = req.body;

  if (!name || !apiUrl || !apiKey || !spaceId) {
    res.status(400).json({ error: 'name, apiUrl, apiKey, and spaceId are required' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO database_connections (id, name, type, host, password, path, created_at)
    VALUES (?, ?, 'teable', ?, ?, ?, ?)
  `).run(id, name, apiUrl, apiKey, spaceId, now);

  const conn = db.prepare('SELECT * FROM database_connections WHERE id = ?').get(id);
  res.status(201).json(maskConnection(conn));
});

router.delete('/connections/:id', (req, res) => {
  const { id } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }
  db.prepare('DELETE FROM database_connections WHERE id = ?').run(id);
  res.json({ success: true });
});

router.get('/connections/:id/test', async (req, res) => {
  const { id } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const data = await teableFetch(conn.host, `/api/space/${conn.path}`, conn.password);
    res.json({ success: true, space: data });
  } catch (error) {
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/connections/:id/bases', async (req, res) => {
  const { id } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const data = await teableFetch(conn.host, `/api/base?spaceId=${conn.path}`, conn.password);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list bases', details: (error as Error).message });
  }
});

router.get('/connections/:id/bases/:baseId/fields', async (req, res) => {
  const { id, baseId } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const data = await teableFetch(conn.host, `/api/base/${baseId}/fields`, conn.password);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get fields', details: (error as Error).message });
  }
});

router.get('/connections/:id/bases/:baseId/records', async (req, res) => {
  const { id, baseId } = req.params;
  const { skip, take } = req.query;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const params = new URLSearchParams();
    if (skip) params.set('skip', skip as string);
    if (take) params.set('take', take as string);
    const qs = params.toString();
    const path = `/api/base/${baseId}/records${qs ? `?${qs}` : ''}`;
    const data = await teableFetch(conn.host, path, conn.password);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get records', details: (error as Error).message });
  }
});

router.post('/connections/:id/bases/:baseId/records', async (req, res) => {
  const { id, baseId } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const data = await teableFetch(conn.host, `/api/base/${baseId}/records`, conn.password, {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create record', details: (error as Error).message });
  }
});

router.put('/connections/:id/bases/:baseId/records/:recordId', async (req, res) => {
  const { id, baseId, recordId } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const data = await teableFetch(conn.host, `/api/base/${baseId}/records/${recordId}`, conn.password, {
      method: 'PUT',
      body: JSON.stringify(req.body),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update record', details: (error as Error).message });
  }
});

router.delete('/connections/:id/bases/:baseId/records/:recordId', async (req, res) => {
  const { id, baseId, recordId } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    await teableFetch(conn.host, `/api/base/${baseId}/records/${recordId}`, conn.password, {
      method: 'DELETE',
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete record', details: (error as Error).message });
  }
});

router.post('/connections/:id/sync/:baseId', async (req, res) => {
  const { id, baseId } = req.params;
  const conn = getConnection(id);
  if (!conn) {
    res.status(404).json({ error: 'Teable connection not found' });
    return;
  }

  try {
    const [fieldsData, baseData] = await Promise.all([
      teableFetch(conn.host, `/api/base/${baseId}/fields`, conn.password),
      teableFetch(conn.host, `/api/base/${baseId}`, conn.password),
    ]);

    const baseName = (baseData as any)?.name || baseId;
    const fields = Array.isArray(fieldsData) ? fieldsData : (fieldsData as any)?.fields || [];

    const now = new Date().toISOString();
    const modelName = `teable_${baseId}`;
    const tableName = baseName;

    const existing = db.prepare('SELECT name FROM data_models WHERE name = ?').get(modelName) as any;

    if (existing) {
      db.prepare(`
        UPDATE data_models SET table_name = ?, description = ?, schema = ?, updated_at = ?
        WHERE name = ?
      `).run(tableName, `Synced from Teable base: ${baseName}`, JSON.stringify(fieldsData), now, modelName);
      db.prepare('DELETE FROM fields WHERE model_name = ?').run(modelName);
    } else {
      db.prepare(`
        INSERT INTO data_models (name, table_name, description, schema, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(modelName, tableName, `Synced from Teable base: ${baseName}`, JSON.stringify(fieldsData), now, now);
    }

    const insertField = db.prepare(`
      INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const field of fields) {
      const f = field as any;
      insertField.run(
        uuidv4(),
        modelName,
        f.name || f.fieldName,
        f.name || f.fieldName,
        f.type || f.fieldType || 'string',
        1,
        f.isPrimary ? 1 : 0,
        f.defaultValue ?? null,
        f.description || null,
      );
    }

    const interfaceId = uuidv4();
    const interfacePath = `/teable/${baseId}/records`;
    const interfaceName = `Teable: ${baseName}`;

    const existingInterface = db.prepare('SELECT id FROM interfaces WHERE path = ? AND method = ?').get(interfacePath, 'GET') as any;

    if (!existingInterface) {
      db.prepare(`
        INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, request_schema, response_schema, created_at, updated_at)
        VALUES (?, ?, ?, 'GET', ?, 'teable', '[]', 'published', '1.0.0', ?, ?, ?, ?)
      `).run(
        interfaceId,
        interfaceName,
        interfacePath,
        `List records from Teable base: ${baseName}`,
        JSON.stringify({ contentType: 'application/json', schema: { type: 'object', properties: { skip: { type: 'number' }, take: { type: 'number' } } } }),
        JSON.stringify({ contentType: 'application/json', schema: { type: 'object', properties: { records: { type: 'array' } } } }),
        now,
        now,
      );
    }

    res.json({
      success: true,
      model: modelName,
      tableName,
      fieldCount: fields.length,
      syncedAt: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync base', details: (error as Error).message });
  }
});

export default router;
