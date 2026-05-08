import { Router } from 'express';
import { pool, query } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { cacheManager } from '../utils/cache';

const router = Router();

async function recordChange(interfaceId: string, action: string, fieldName: string | null, oldValue: string | null, newValue: string | null, operator?: string) {
  await query(`
    INSERT INTO change_history (id, interface_id, action, field_name, old_value, new_value, operator, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [uuidv4(), interfaceId, action, fieldName, oldValue, newValue, operator || 'system', new Date().toISOString()]);
}

async function diffAndRecord(interfaceId: string, oldData: Record<string, any>, newData: Record<string, any>, operator?: string) {
  const trackedFields: Record<string, string> = {
    name: '接口名称',
    path: '接口路径',
    method: '请求方法',
    description: '描述',
    category: '分类',
    status: '状态',
    version: '版本',
  };

  for (const [field, label] of Object.entries(trackedFields)) {
    const oldVal = String(oldData[field] ?? '');
    const newVal = String(newData[field] ?? '');
    if (oldVal !== newVal) {
      await recordChange(interfaceId, 'update', label, oldVal || null, newVal || null, operator);
    }
  }

  const oldTags = JSON.stringify(oldData.tags || []);
  const newTags = JSON.stringify(newData.tags || []);
  if (oldTags !== newTags) {
    await recordChange(interfaceId, 'update', '标签', oldTags, newTags, operator);
  }
}

router.get('/', async (req, res) => {
  try {
    const { status, category, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;
    const cacheKey = `interfaces:list:${status || 'all'}:${category || 'all'}:${search || 'none'}:${pageNum}:${limitNum}`;

    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let sql = 'SELECT * FROM interfaces WHERE 1=1';
    let countSql = 'SELECT COUNT(*) as total FROM interfaces WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];
    let paramIdx = 1;
    let countParamIdx = 1;

    if (status) {
      sql += ` AND status = $${paramIdx++}`;
      countSql += ` AND status = $${countParamIdx++}`;
      params.push(status);
      countParams.push(status);
    }

    if (category) {
      sql += ` AND category = $${paramIdx++}`;
      countSql += ` AND category = $${countParamIdx++}`;
      params.push(category);
      countParams.push(category);
    }

    if (search) {
      sql += ` AND (name LIKE $${paramIdx} OR path LIKE $${paramIdx + 1} OR description LIKE $${paramIdx + 2})`;
      countSql += ` AND (name LIKE $${countParamIdx} OR path LIKE $${countParamIdx + 1} OR description LIKE $${countParamIdx + 2})`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
      paramIdx += 3;
      countParamIdx += 3;
    }

    sql += ` ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limitNum, offset);

    const { rows: interfaces } = await query(sql, params);
    const { rows: countRows } = await query(countSql, countParams);
    const { total } = countRows[0] as any;

    const formattedInterfaces = interfaces.map((iface: any) => ({
      ...iface,
      tags: iface.tags ? JSON.parse(iface.tags) : [],
      requestSchema: iface.request_schema ? JSON.parse(iface.request_schema) : null,
      responseSchema: iface.response_schema ? JSON.parse(iface.response_schema) : null,
    }));

    const result = {
      data: formattedInterfaces,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    cacheManager.set(cacheKey, result, 2 * 60 * 1000);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interfaces' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `interfaces:detail:${id}`;

    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const { rows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const iface = rows[0] as Record<string, any> | undefined;

    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const formattedInterface: Record<string, any> = {
      ...iface,
      tags: iface.tags ? JSON.parse(iface.tags) : [],
      requestSchema: iface.request_schema ? JSON.parse(iface.request_schema) : null,
      responseSchema: iface.response_schema ? JSON.parse(iface.response_schema) : null,
    };

    const { rows: paramRows } = await query('SELECT * FROM parameters WHERE interface_id = $1', [id]);
    formattedInterface.parameters = paramRows.map((param: any) => ({
      ...param,
      required: Boolean(param.required),
    }));

    const { rows: mappingRows } = await query('SELECT * FROM field_mappings WHERE interface_id = $1', [id]);
    formattedInterface.mappings = mappingRows;

    cacheManager.set(cacheKey, formattedInterface, 5 * 60 * 1000);
    res.json(formattedInterface);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interface' });
  }
});

router.post('/', async (req, res) => {
  try {
    cacheManager.invalidate('interfaces:');
    const { name, path, method, description, category, tags, status, version, requestSchema, responseSchema, createdBy, parameters } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, request_schema, response_schema, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        id,
        name,
        path,
        method,
        description,
        category,
        JSON.stringify(tags || []),
        status || 'draft',
        version || '1.0.0',
        requestSchema ? JSON.stringify(requestSchema) : null,
        responseSchema ? JSON.stringify(responseSchema) : null,
        createdBy || 'system',
        now,
        now
      ]);

      if (parameters && Array.isArray(parameters)) {
        for (const param of parameters) {
          if (param.name) {
            await client.query(`
              INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              uuidv4(),
              id,
              param.name,
              param.location || 'query',
              param.type || 'string',
              param.required ? 1 : 0,
              param.description || '',
              param.example || ''
            ]);
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await recordChange(id, 'create', null, null, `创建接口: ${name}`, createdBy);

    const { rows: newRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const newInterface = newRows[0] as Record<string, any>;
    const { rows: newParamRows } = await query('SELECT * FROM parameters WHERE interface_id = $1', [id]);

    res.status(201).json({
      ...newInterface,
      tags: tags || [],
      requestSchema: requestSchema || null,
      responseSchema: responseSchema || null,
      parameters: newParamRows.map((p: any) => ({ ...p, required: Boolean(p.required) })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create interface' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    cacheManager.delete(`interfaces:detail:${id}`);
    cacheManager.invalidate('interfaces:list:');
    const body = req.body;

    const { rows: existingRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const existing = existingRows[0] as Record<string, any> | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const oldData = {
      ...existing,
      tags: existing.tags ? JSON.parse(existing.tags) : [],
    };

    const name = body.name ?? existing.name;
    const path = body.path ?? existing.path;
    const method = body.method ?? existing.method;
    const description = body.description ?? existing.description;
    const category = body.category ?? existing.category;
    const tags = body.tags ?? (existing.tags ? JSON.parse(existing.tags) : []);
    const status = body.status ?? existing.status;
    const version = body.version ?? existing.version;
    const requestSchema = body.requestSchema ?? (existing.request_schema ? JSON.parse(existing.request_schema) : null);
    const responseSchema = body.responseSchema ?? (existing.response_schema ? JSON.parse(existing.response_schema) : null);
    const parameters = body.parameters;

    const now = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE interfaces
        SET name = $1, path = $2, method = $3, description = $4, category = $5, tags = $6, status = $7, version = $8, request_schema = $9, response_schema = $10, updated_at = $11
        WHERE id = $12
      `, [
        name,
        path,
        method,
        description,
        category,
        JSON.stringify(tags),
        status,
        version,
        requestSchema ? JSON.stringify(requestSchema) : null,
        responseSchema ? JSON.stringify(responseSchema) : null,
        now,
        id
      ]);

      if (parameters && Array.isArray(parameters)) {
        await client.query('DELETE FROM parameters WHERE interface_id = $1', [id]);
        for (const param of parameters) {
          if (param.name) {
            await client.query(`
              INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              param.id || uuidv4(),
              id,
              param.name,
              param.location || 'query',
              param.type || 'string',
              param.required ? 1 : 0,
              param.description || '',
              param.example || ''
            ]);
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await diffAndRecord(id, oldData, { name, path, method, description, category, tags, status, version });

    const { rows: updatedRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const updated = updatedRows[0] as Record<string, any>;
    const { rows: updatedParamRows } = await query('SELECT * FROM parameters WHERE interface_id = $1', [id]);

    res.json({
      ...updated,
      tags,
      requestSchema,
      responseSchema,
      parameters: updatedParamRows.map((p: any) => ({ ...p, required: Boolean(p.required) })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update interface' });
  }
});

router.post('/:id/parameters', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const { name, location, type, required, description, example } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Parameter name is required' });
    }

    const paramId = uuidv4();
    await query(`
      INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [paramId, id, name, location || 'query', type || 'string', required ? 1 : 0, description || '', example || '']);

    cacheManager.delete(`interfaces:detail:${id}`);

    res.status(201).json({
      id: paramId,
      interface_id: id,
      name,
      location: location || 'query',
      type: type || 'string',
      required: Boolean(required),
      description: description || '',
      example: example || '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create parameter' });
  }
});

router.put('/:id/parameters/:paramId', async (req, res) => {
  try {
    const { id, paramId } = req.params;
    const { rows: existingRows } = await query('SELECT * FROM parameters WHERE id = $1 AND interface_id = $2', [paramId, id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Parameter not found' });
    }

    const { name, location, type, required, description, example } = req.body;
    await query(`
      UPDATE parameters SET name = $1, location = $2, type = $3, required = $4, description = $5, example = $6
      WHERE id = $7 AND interface_id = $8
    `, [name, location, type, required ? 1 : 0, description, example, paramId, id]);

    cacheManager.delete(`interfaces:detail:${id}`);

    res.json({ id: paramId, interface_id: id, name, location, type, required: Boolean(required), description, example });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update parameter' });
  }
});

router.delete('/:id/parameters/:paramId', async (req, res) => {
  try {
    const { id, paramId } = req.params;
    const { rows: existingRows } = await query('SELECT * FROM parameters WHERE id = $1 AND interface_id = $2', [paramId, id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Parameter not found' });
    }

    await query('DELETE FROM parameters WHERE id = $1', [paramId]);
    cacheManager.delete(`interfaces:detail:${id}`);

    res.json({ message: 'Parameter deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete parameter' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: existingRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const existing = existingRows[0] as Record<string, any> | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    await recordChange(id, 'delete', null, `删除接口: ${existing.name}`, null);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM field_mappings WHERE interface_id = $1', [id]);
      await client.query('DELETE FROM parameters WHERE interface_id = $1', [id]);
      await client.query('DELETE FROM mock_configs WHERE interface_id = $1', [id]);
      await client.query('DELETE FROM change_history WHERE interface_id = $1', [id]);
      await client.query('DELETE FROM interfaces WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    cacheManager.delete(`interfaces:detail:${id}`);
    cacheManager.invalidate('interfaces:list:');

    res.json({ message: 'Interface deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete interface' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const { rows: existingRows } = await query('SELECT id FROM interfaces WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const { rows: history } = await query(
      'SELECT * FROM change_history WHERE interface_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [id, limitNum, offset]
    );

    const { rows: countRows } = await query('SELECT COUNT(*) as total FROM change_history WHERE interface_id = $1', [id]);
    const { total } = countRows[0] as any;

    res.json({
      data: history,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch change history' });
  }
});

router.post('/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, operator } = req.body;

    const { rows: existingRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const existing = existingRows[0] as any;
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const { rows: paramRows } = await query('SELECT * FROM parameters WHERE interface_id = $1', [id]);
    const parameters = paramRows as any[];
    const snapshot = JSON.stringify({ ...existing, parameters });

    const versionId = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO interface_versions (id, interface_id, version, snapshot, description, operator, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [versionId, id, existing.version || '1.0.0', snapshot, description || '', operator || 'system', now]);

    cacheManager.delete(`interfaces:detail:${id}`);
    await recordChange(id, 'update', '版本快照', null, `保存版本 ${existing.version}`, operator);

    res.status(201).json({
      id: versionId,
      interface_id: id,
      version: existing.version,
      description: description || '',
      operator: operator || 'system',
      created_at: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create version snapshot' });
  }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await query('SELECT id FROM interfaces WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const { rows: versions } = await query(
      'SELECT id, interface_id, version, description, operator, created_at FROM interface_versions WHERE interface_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

router.get('/:id/versions/:versionId', async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const { rows } = await query('SELECT * FROM interface_versions WHERE id = $1 AND interface_id = $2', [versionId, id]);
    const version = rows[0] as any;
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const snapshot = JSON.parse(version.snapshot);
    res.json({ ...version, snapshot });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

router.post('/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const { operator } = req.body;

    const { rows: versionRows } = await query('SELECT * FROM interface_versions WHERE id = $1 AND interface_id = $2', [versionId, id]);
    const version = versionRows[0] as any;
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const snapshot = JSON.parse(version.snapshot);

    const now = new Date().toISOString();
    await query(`
      UPDATE interfaces
      SET name = $1, path = $2, method = $3, description = $4, category = $5, tags = $6, status = $7, version = $8, request_schema = $9, response_schema = $10, updated_at = $11
      WHERE id = $12
    `, [
      snapshot.name, snapshot.path, snapshot.method, snapshot.description,
      snapshot.category, snapshot.tags, snapshot.status, snapshot.version,
      snapshot.request_schema, snapshot.response_schema, now, id
    ]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM parameters WHERE interface_id = $1', [id]);
      for (const param of snapshot.parameters || []) {
        await client.query(`
          INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          uuidv4(), id, param.name, param.location, param.type,
          param.required ? 1 : 0, param.description || '', param.example || ''
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    cacheManager.delete(`interfaces:detail:${id}`);
    cacheManager.invalidate('interfaces:list:');
    await recordChange(id, 'update', '版本回滚', null, `回滚到版本 ${snapshot.version}`, operator);

    const { rows: restoredRows } = await query('SELECT * FROM interfaces WHERE id = $1', [id]);
    const restored = restoredRows[0] as any;
    const { rows: restoredParamRows } = await query('SELECT * FROM parameters WHERE interface_id = $1', [id]);

    res.json({
      ...restored,
      tags: snapshot.tags ? JSON.parse(snapshot.tags) : [],
      requestSchema: snapshot.request_schema ? JSON.parse(snapshot.request_schema) : null,
      responseSchema: snapshot.response_schema ? JSON.parse(snapshot.response_schema) : null,
      parameters: restoredParamRows.map((p: any) => ({ ...p, required: Boolean(p.required) })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

export default router;
