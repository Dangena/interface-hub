import { Router } from 'express';
import db from './database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  try {
    const { status, category, search } = req.query;
    let query = 'SELECT * FROM interfaces WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR path LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY updated_at DESC';

    const interfaces = db.prepare(query).all(...params);

    const formattedInterfaces = interfaces.map((iface: any) => ({
      ...iface,
      tags: iface.tags ? JSON.parse(iface.tags) : [],
      requestSchema: iface.request_schema ? JSON.parse(iface.request_schema) : null,
      responseSchema: iface.response_schema ? JSON.parse(iface.response_schema) : null,
    }));

    res.json(formattedInterfaces);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interfaces' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id);

    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const formattedInterface: any = {
      ...iface,
      tags: (iface as any).tags ? JSON.parse((iface as any).tags) : [],
      requestSchema: (iface as any).request_schema ? JSON.parse((iface as any).request_schema) : null,
      responseSchema: (iface as any).response_schema ? JSON.parse((iface as any).response_schema) : null,
    };

    const parameters = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(id);
    formattedInterface.parameters = parameters.map((param: any) => ({
      ...param,
      required: Boolean(param.required),
    }));

    const mappings = db.prepare('SELECT * FROM field_mappings WHERE interface_id = ?').all(id);
    formattedInterface.mappings = mappings;

    res.json(formattedInterface);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interface' });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, path, method, description, category, tags, status, version, requestSchema, responseSchema, createdBy } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, request_schema, response_schema, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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

    const newInterface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id);

    res.status(201).json({
      ...newInterface,
      tags: tags || [],
      requestSchema: requestSchema || null,
      responseSchema: responseSchema || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create interface' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, path, method, description, category, tags, status, version, requestSchema, responseSchema } = req.body;

    const existing = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE interfaces
      SET name = ?, path = ?, method = ?, description = ?, category = ?, tags = ?, status = ?, version = ?, request_schema = ?, response_schema = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      path,
      method,
      description,
      category,
      JSON.stringify(tags || []),
      status,
      version,
      requestSchema ? JSON.stringify(requestSchema) : null,
      responseSchema ? JSON.stringify(responseSchema) : null,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id);

    res.json({
      ...updated,
      tags: tags || [],
      requestSchema: requestSchema || null,
      responseSchema: responseSchema || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update interface' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    db.prepare('DELETE FROM interfaces WHERE id = ?').run(id);

    res.json({ message: 'Interface deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete interface' });
  }
});

export default router;
