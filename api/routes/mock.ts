import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  try {
    const mocks = db.prepare('SELECT * FROM mock_configs ORDER BY created_at DESC').all();
    res.json(mocks.map((m: any) => ({
      ...m,
      responseConfig: m.response_config ? JSON.parse(m.response_config) : null,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mock configs' });
  }
});

router.post('/', (req, res) => {
  try {
    const { interfaceId, path, method, statusCode, delay, responseConfig, enabled } = req.body;
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO mock_configs (id, interface_id, path, method, status_code, delay, response_config, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      interfaceId || null,
      path,
      method || 'GET',
      statusCode || 200,
      delay || 0,
      responseConfig ? JSON.stringify(responseConfig) : null,
      enabled ? 1 : 0,
      now,
      now
    );
    
    const mock = db.prepare('SELECT * FROM mock_configs WHERE id = ?').get(id) as Record<string, any>;
    res.status(201).json({
      ...mock,
      responseConfig: responseConfig || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mock config' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { path, method, statusCode, delay, responseConfig, enabled } = req.body;
    
    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE mock_configs
      SET path = ?, method = ?, status_code = ?, delay = ?, response_config = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(
      path,
      method || 'GET',
      statusCode || 200,
      delay || 0,
      responseConfig ? JSON.stringify(responseConfig) : null,
      enabled ? 1 : 0,
      now,
      id
    );
    
    const mock = db.prepare('SELECT * FROM mock_configs WHERE id = ?').get(id) as Record<string, any>;
    res.json({
      ...mock,
      responseConfig: responseConfig || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mock config' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM mock_configs WHERE id = ?').run(id);
    res.json({ message: 'Mock config deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mock config' });
  }
});

router.all('/proxy/*', (req, res) => {
  try {
    const mockPath = req.params[0];
    const method = req.method;
    
    const mockConfig = db.prepare(`
      SELECT * FROM mock_configs 
      WHERE path = ? AND method = ? AND enabled = 1
    `).get(`/${mockPath}`, method) as any;
    
    if (!mockConfig) {
      return res.status(404).json({ error: 'Mock not found' });
    }
    
    const delay = mockConfig.delay || 0;
    const statusCode = mockConfig.status_code || 200;
    const responseConfig = mockConfig.response_config ? JSON.parse(mockConfig.response_config) : {};
    
    setTimeout(() => {
      res.status(statusCode).json(responseConfig);
    }, delay);
  } catch (error) {
    res.status(500).json({ error: 'Mock proxy error' });
  }
});

export default router;
