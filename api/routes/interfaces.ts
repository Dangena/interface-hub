import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import { cacheManager } from '../utils/cache';

const router = Router();

function recordChange(interfaceId: string, action: string, fieldName: string | null, oldValue: string | null, newValue: string | null, operator?: string) {
  db.prepare(`
    INSERT INTO change_history (id, interface_id, action, field_name, old_value, new_value, operator, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), interfaceId, action, fieldName, oldValue, newValue, operator || 'system', new Date().toISOString());
}

function diffAndRecord(interfaceId: string, oldData: Record<string, any>, newData: Record<string, any>, operator?: string) {
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
      recordChange(interfaceId, 'update', label, oldVal || null, newVal || null, operator);
    }
  }

  const oldTags = JSON.stringify(oldData.tags || []);
  const newTags = JSON.stringify(newData.tags || []);
  if (oldTags !== newTags) {
    recordChange(interfaceId, 'update', '标签', oldTags, newTags, operator);
  }
}

router.get('/', (req, res) => {
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

    let query = 'SELECT * FROM interfaces WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM interfaces WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
      countParams.push(status);
    }

    if (category) {
      query += ' AND category = ?';
      countQuery += ' AND category = ?';
      params.push(category);
      countParams.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR path LIKE ? OR description LIKE ?)';
      countQuery += ' AND (name LIKE ? OR path LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const interfaces = db.prepare(query).all(...params);
    const { total } = db.prepare(countQuery).get(...countParams) as any;

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

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `interfaces:detail:${id}`;
    
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as Record<string, any>;

    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const formattedInterface: Record<string, any> = {
      ...iface,
      tags: iface.tags ? JSON.parse(iface.tags) : [],
      requestSchema: iface.request_schema ? JSON.parse(iface.request_schema) : null,
      responseSchema: iface.response_schema ? JSON.parse(iface.response_schema) : null,
    };

    const parameters = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(id);
    formattedInterface.parameters = parameters.map((param: any) => ({
      ...param,
      required: Boolean(param.required),
    }));

    const mappings = db.prepare('SELECT * FROM field_mappings WHERE interface_id = ?').all(id);
    formattedInterface.mappings = mappings;

    cacheManager.set(cacheKey, formattedInterface, 5 * 60 * 1000);
    res.json(formattedInterface);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interface' });
  }
});

router.post('/', (req, res) => {
  try {
    cacheManager.invalidate('interfaces:');
    const { name, path, method, description, category, tags, status, version, requestSchema, responseSchema, createdBy, parameters } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    const insertInterface = db.prepare(`
      INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, request_schema, response_schema, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertParam = db.prepare(`
      INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      insertInterface.run(
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
      );

      if (parameters && Array.isArray(parameters)) {
        for (const param of parameters) {
          if (param.name) {
            insertParam.run(
              uuidv4(),
              id,
              param.name,
              param.location || 'query',
              param.type || 'string',
              param.required ? 1 : 0,
              param.description || '',
              param.example || ''
            );
          }
        }
      }
    });

    transaction();

    recordChange(id, 'create', null, null, `创建接口: ${name}`, createdBy);

    const newInterface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as Record<string, any>;
    const newParams = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(id) as any[];

    res.status(201).json({
      ...newInterface,
      tags: tags || [],
      requestSchema: requestSchema || null,
      responseSchema: responseSchema || null,
      parameters: newParams.map((p: any) => ({ ...p, required: Boolean(p.required) })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create interface' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    cacheManager.delete(`interfaces:detail:${id}`);
    cacheManager.invalidate('interfaces:list:');
    const body = req.body;

    const existing = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as Record<string, any>;
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

    const updateInterface = db.prepare(`
      UPDATE interfaces
      SET name = ?, path = ?, method = ?, description = ?, category = ?, tags = ?, status = ?, version = ?, request_schema = ?, response_schema = ?, updated_at = ?
      WHERE id = ?
    `);
    const deleteOldParams = db.prepare('DELETE FROM parameters WHERE interface_id = ?');
    const insertParam = db.prepare(`
      INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      updateInterface.run(
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
      );

      if (parameters && Array.isArray(parameters)) {
        deleteOldParams.run(id);
        for (const param of parameters) {
          if (param.name) {
            insertParam.run(
              param.id || uuidv4(),
              id,
              param.name,
              param.location || 'query',
              param.type || 'string',
              param.required ? 1 : 0,
              param.description || '',
              param.example || ''
            );
          }
        }
      }
    });

    transaction();

    diffAndRecord(id, oldData, { name, path, method, description, category, tags, status, version });

    const updated = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as Record<string, any>;
    const updatedParams = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(id) as any[];

    res.json({
      ...updated,
      tags,
      requestSchema,
      responseSchema,
      parameters: updatedParams.map((p: any) => ({ ...p, required: Boolean(p.required) })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update interface' });
  }
});

router.post('/:id/parameters', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const { name, location, type, required, description, example } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Parameter name is required' });
    }

    const paramId = uuidv4();
    db.prepare(`
      INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paramId, id, name, location || 'query', type || 'string', required ? 1 : 0, description || '', example || '');

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

router.put('/:id/parameters/:paramId', (req, res) => {
  try {
    const { id, paramId } = req.params;
    const existing = db.prepare('SELECT * FROM parameters WHERE id = ? AND interface_id = ?').get(paramId, id);
    if (!existing) {
      return res.status(404).json({ error: 'Parameter not found' });
    }

    const { name, location, type, required, description, example } = req.body;
    db.prepare(`
      UPDATE parameters SET name = ?, location = ?, type = ?, required = ?, description = ?, example = ?
      WHERE id = ? AND interface_id = ?
    `).run(name, location, type, required ? 1 : 0, description, example, paramId, id);

    cacheManager.delete(`interfaces:detail:${id}`);

    res.json({ id: paramId, interface_id: id, name, location, type, required: Boolean(required), description, example });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update parameter' });
  }
});

router.delete('/:id/parameters/:paramId', (req, res) => {
  try {
    const { id, paramId } = req.params;
    const existing = db.prepare('SELECT * FROM parameters WHERE id = ? AND interface_id = ?').get(paramId, id);
    if (!existing) {
      return res.status(404).json({ error: 'Parameter not found' });
    }

    db.prepare('DELETE FROM parameters WHERE id = ?').run(paramId);
    cacheManager.delete(`interfaces:detail:${id}`);

    res.json({ message: 'Parameter deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete parameter' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as Record<string, any>;
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    recordChange(id, 'delete', null, `删除接口: ${existing.name}`, null);

    const deleteMappings = db.prepare('DELETE FROM field_mappings WHERE interface_id = ?');
    const deleteParams = db.prepare('DELETE FROM parameters WHERE interface_id = ?');
    const deleteMocks = db.prepare('DELETE FROM mock_configs WHERE interface_id = ?');
    const deleteHistory = db.prepare('DELETE FROM change_history WHERE interface_id = ?');
    const deleteInterface = db.prepare('DELETE FROM interfaces WHERE id = ?');

    const transaction = db.transaction(() => {
      deleteMappings.run(id);
      deleteParams.run(id);
      deleteMocks.run(id);
      deleteHistory.run(id);
      deleteInterface.run(id);
    });

    transaction();

    cacheManager.delete(`interfaces:detail:${id}`);
    cacheManager.invalidate('interfaces:list:');

    res.json({ message: 'Interface deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete interface' });
  }
});

router.get('/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const existing = db.prepare('SELECT id FROM interfaces WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const history = db.prepare(
      'SELECT * FROM change_history WHERE interface_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(id, limitNum, offset) as any[];

    const { total } = db.prepare('SELECT COUNT(*) as total FROM change_history WHERE interface_id = ?').get(id) as any;

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

router.post('/:id/versions', (req, res) => {
  try {
    const { id } = req.params;
    const { description, operator } = req.body;

    const existing = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const parameters = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(id) as any[];
    const snapshot = JSON.stringify({ ...existing, parameters });

    const versionId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO interface_versions (id, interface_id, version, snapshot, description, operator, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(versionId, id, existing.version || '1.0.0', snapshot, description || '', operator || 'system', now);

    cacheManager.delete(`interfaces:detail:${id}`);
    recordChange(id, 'update', '版本快照', null, `保存版本 ${existing.version}`, operator);

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

router.get('/:id/versions', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM interfaces WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const versions = db.prepare(
      'SELECT id, interface_id, version, description, operator, created_at FROM interface_versions WHERE interface_id = ? ORDER BY created_at DESC'
    ).all(id) as any[];

    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

router.get('/:id/versions/:versionId', (req, res) => {
  try {
    const { id, versionId } = req.params;
    const version = db.prepare('SELECT * FROM interface_versions WHERE id = ? AND interface_id = ?').get(versionId, id) as any;
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const snapshot = JSON.parse(version.snapshot);
    res.json({ ...version, snapshot });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

router.post('/:id/versions/:versionId/restore', (req, res) => {
  try {
    const { id, versionId } = req.params;
    const { operator } = req.body;

    const version = db.prepare('SELECT * FROM interface_versions WHERE id = ? AND interface_id = ?').get(versionId, id) as any;
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const snapshot = JSON.parse(version.snapshot);

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE interfaces
      SET name = ?, path = ?, method = ?, description = ?, category = ?, tags = ?, status = ?, version = ?, request_schema = ?, response_schema = ?, updated_at = ?
      WHERE id = ?
    `).run(
      snapshot.name, snapshot.path, snapshot.method, snapshot.description,
      snapshot.category, snapshot.tags, snapshot.status, snapshot.version,
      snapshot.request_schema, snapshot.response_schema, now, id
    );

    const deleteOldParams = db.prepare('DELETE FROM parameters WHERE interface_id = ?');
    const insertParam = db.prepare(`
      INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      deleteOldParams.run(id);
      for (const param of snapshot.parameters || []) {
        insertParam.run(
          uuidv4(), id, param.name, param.location, param.type,
          param.required ? 1 : 0, param.description || '', param.example || ''
        );
      }
    });
    transaction();

    cacheManager.delete(`interfaces:detail:${id}`);
    cacheManager.invalidate('interfaces:list:');
    recordChange(id, 'update', '版本回滚', null, `回滚到版本 ${snapshot.version}`, operator);

    const restored = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id) as any;
    const restoredParams = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(id) as any[];

    res.json({
      ...restored,
      tags: snapshot.tags ? JSON.parse(snapshot.tags) : [],
      requestSchema: snapshot.request_schema ? JSON.parse(snapshot.request_schema) : null,
      responseSchema: snapshot.response_schema ? JSON.parse(snapshot.response_schema) : null,
      parameters: restoredParams.map((p: any) => ({ ...p, required: Boolean(p.required) })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

export default router;
