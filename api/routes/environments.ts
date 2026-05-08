import { Router, type Request, type Response } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

let activeEnvironmentId: string | null = null;

db.exec(`
  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('dev', 'staging', 'prod')),
    baseUrl TEXT NOT NULL DEFAULT '',
    variables TEXT DEFAULT '{}',
    headers TEXT DEFAULT '{}',
    authType TEXT DEFAULT 'none',
    authConfig TEXT DEFAULT '{}',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

router.get('/', (req: Request, res: Response) => {
  try {
    const environments = db.prepare('SELECT * FROM environments ORDER BY createdAt DESC').all();
    res.json(environments);
  } catch (error) {
    console.error('List environments error:', error);
    res.status(500).json({ error: 'Failed to list environments' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, type, baseUrl, variables, headers, authType, authConfig } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }

    if (!['dev', 'staging', 'prod'].includes(type)) {
      return res.status(400).json({ error: 'type must be one of: dev, staging, prod' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO environments (id, name, type, baseUrl, variables, headers, authType, authConfig, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      type,
      baseUrl || '',
      JSON.stringify(variables || {}),
      JSON.stringify(headers || {}),
      authType || 'none',
      JSON.stringify(authConfig || {}),
      now,
      now,
    );

    const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(id);
    res.status(201).json(env);
  } catch (error) {
    console.error('Create environment error:', error);
    res.status(500).json({ error: 'Failed to create environment' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, baseUrl, variables, headers, authType, authConfig } = req.body;

    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    if (type && !['dev', 'staging', 'prod'].includes(type)) {
      return res.status(400).json({ error: 'type must be one of: dev, staging, prod' });
    }

    const now = new Date().toISOString();
    const updatedName = name ?? existing.name;
    const updatedType = type ?? existing.type;
    const updatedBaseUrl = baseUrl !== undefined ? baseUrl : existing.baseUrl;
    const updatedVariables = variables !== undefined ? JSON.stringify(variables) : existing.variables;
    const updatedHeaders = headers !== undefined ? JSON.stringify(headers) : existing.headers;
    const updatedAuthType = authType ?? existing.authType;
    const updatedAuthConfig = authConfig !== undefined ? JSON.stringify(authConfig) : existing.authConfig;

    db.prepare(`
      UPDATE environments SET name = ?, type = ?, baseUrl = ?, variables = ?, headers = ?, authType = ?, authConfig = ?, updatedAt = ?
      WHERE id = ?
    `).run(updatedName, updatedType, updatedBaseUrl, updatedVariables, updatedHeaders, updatedAuthType, updatedAuthConfig, now, id);

    const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(id);
    res.json(env);
  } catch (error) {
    console.error('Update environment error:', error);
    res.status(500).json({ error: 'Failed to update environment' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    db.prepare('DELETE FROM environments WHERE id = ?').run(id);

    if (activeEnvironmentId === id) {
      activeEnvironmentId = null;
    }

    res.json({ success: true, message: 'Environment deleted' });
  } catch (error) {
    console.error('Delete environment error:', error);
    res.status(500).json({ error: 'Failed to delete environment' });
  }
});

router.post('/:id/clone', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    const newId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO environments (id, name, type, baseUrl, variables, headers, authType, authConfig, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      `${existing.name} (copy)`,
      existing.type,
      existing.baseUrl,
      existing.variables,
      existing.headers,
      existing.authType,
      existing.authConfig,
      now,
      now,
    );

    const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(newId);
    res.status(201).json(env);
  } catch (error) {
    console.error('Clone environment error:', error);
    res.status(500).json({ error: 'Failed to clone environment' });
  }
});

router.get('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    const baseUrl = existing.baseUrl;
    if (!baseUrl) {
      return res.status(400).json({ error: 'Environment has no baseUrl configured' });
    }

    const testUrl = baseUrl.endsWith('/') ? `${baseUrl}health` : `${baseUrl}/health`;
    const startTime = Date.now();

    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      const duration = Date.now() - startTime;

      res.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: testUrl,
        responseTime: duration,
      });
    } catch (fetchError: any) {
      const fallbackUrl = baseUrl;
      const fallbackStart = Date.now();

      try {
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        });

        const fallbackDuration = Date.now() - fallbackStart;

        res.json({
          success: fallbackResponse.ok,
          status: fallbackResponse.status,
          statusText: fallbackResponse.statusText,
          url: fallbackUrl,
          responseTime: fallbackDuration,
          note: 'Health endpoint unavailable, tested baseUrl directly',
        });
      } catch (innerError: any) {
        res.json({
          success: false,
          error: innerError.message || 'Connection failed',
          url: fallbackUrl,
        });
      }
    }
  } catch (error) {
    console.error('Test environment error:', error);
    res.status(500).json({ error: 'Failed to test environment' });
  }
});

router.post('/:id/switch', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    activeEnvironmentId = id;

    res.json({
      success: true,
      activeEnvironment: existing,
      message: `Switched to environment: ${existing.name}`,
    });
  } catch (error) {
    console.error('Switch environment error:', error);
    res.status(500).json({ error: 'Failed to switch environment' });
  }
});

router.get('/active', (req: Request, res: Response) => {
  try {
    if (!activeEnvironmentId) {
      return res.json({ activeEnvironment: null });
    }

    const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(activeEnvironmentId) as any;
    if (!env) {
      activeEnvironmentId = null;
      return res.json({ activeEnvironment: null });
    }

    res.json({ activeEnvironment: env });
  } catch (error) {
    console.error('Get active environment error:', error);
    res.status(500).json({ error: 'Failed to get active environment' });
  }
});

router.get('/:id/compare/:otherId', (req: Request, res: Response) => {
  try {
    const { id, otherId } = req.params;

    const envA = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
    if (!envA) {
      return res.status(404).json({ error: 'First environment not found' });
    }

    const envB = db.prepare('SELECT * FROM environments WHERE id = ?').get(otherId) as any;
    if (!envB) {
      return res.status(404).json({ error: 'Second environment not found' });
    }

    const varsA: Record<string, any> = JSON.parse(envA.variables || '{}');
    const varsB: Record<string, any> = JSON.parse(envB.variables || '{}');
    const headersA: Record<string, any> = JSON.parse(envA.headers || '{}');
    const headersB: Record<string, any> = JSON.parse(envB.headers || '{}');

    const variables = diffObjects(varsA, varsB);
    const headers = diffObjects(headersA, headersB);

    res.json({
      environmentA: { id: envA.id, name: envA.name },
      environmentB: { id: envB.id, name: envB.name },
      variables,
      headers,
    });
  } catch (error) {
    console.error('Compare environments error:', error);
    res.status(500).json({ error: 'Failed to compare environments' });
  }
});

function diffObjects(objA: Record<string, any>, objB: Record<string, any>) {
  const keysA = new Set(Object.keys(objA));
  const keysB = new Set(Object.keys(objB));

  const added: Array<{ key: string; value: any }> = [];
  const removed: Array<{ key: string; value: any }> = [];
  const changed: Array<{ key: string; valueA: any; valueB: any }> = [];
  const unchanged: Array<{ key: string; value: any }> = [];

  for (const key of keysB) {
    if (!keysA.has(key)) {
      added.push({ key, value: objB[key] });
    }
  }

  for (const key of keysA) {
    if (!keysB.has(key)) {
      removed.push({ key, value: objA[key] });
    }
  }

  for (const key of keysA) {
    if (keysB.has(key)) {
      const valA = JSON.stringify(objA[key]);
      const valB = JSON.stringify(objB[key]);
      if (valA !== valB) {
        changed.push({ key, valueA: objA[key], valueB: objB[key] });
      } else {
        unchanged.push({ key, value: objA[key] });
      }
    }
  }

  return { added, removed, changed, unchanged };
}

export default router;
