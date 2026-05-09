import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database.js';

const router = Router();

function compareInterfaces(before: Record<string, any>, after: Record<string, any>) {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ field: string; before: any; after: any }> = [];
  const unchanged: string[] = [];

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const inBefore = key in before;
    const inAfter = key in after;

    if (inBefore && !inAfter) {
      removed.push(key);
    } else if (!inBefore && inAfter) {
      added.push(key);
    } else {
      const beforeVal = typeof before[key] === 'object' ? JSON.stringify(before[key]) : before[key];
      const afterVal = typeof after[key] === 'object' ? JSON.stringify(after[key]) : after[key];

      if (beforeVal !== afterVal) {
        changed.push({ field: key, before: before[key], after: after[key] });
      } else {
        unchanged.push(key);
      }
    }
  }

  return { added, removed, changed, unchanged };
}

function normalizeInterface(raw: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = { ...raw };

  if (typeof normalized.tags === 'string') {
    try {
      normalized.tags = JSON.parse(normalized.tags);
    } catch (_e: any) {
      normalized.tags = [];
    }
  }

  if (typeof normalized.request_schema === 'string') {
    try {
      normalized.request_schema = JSON.parse(normalized.request_schema);
    } catch (_e: any) {
      normalized.request_schema = null;
    }
  }

  if (typeof normalized.response_schema === 'string') {
    try {
      normalized.response_schema = JSON.parse(normalized.response_schema);
    } catch (_e: any) {
      normalized.response_schema = null;
    }
  }

  return normalized;
}

router.post('/compare', async (req, res) => {
  try {
    const { before, after, sourceId, targetId } = req.body;

    let beforeData = before;
    let afterData = after;

    if (!beforeData && sourceId) {
      const row = (await query('SELECT * FROM interfaces WHERE id = $1', [sourceId])).rows[0];
      if (!row) return res.status(404).json({ error: 'Source interface not found' });
      beforeData = row;
    }
    if (!afterData && targetId) {
      const row = (await query('SELECT * FROM interfaces WHERE id = $1', [targetId])).rows[0];
      if (!row) return res.status(404).json({ error: 'Target interface not found' });
      afterData = row;
    }

    if (!beforeData || !afterData) {
      return res.status(400).json({ error: 'Provide either before/after objects or sourceId/targetId' });
    }

    const normalizedBefore = normalizeInterface(beforeData);
    const normalizedAfter = normalizeInterface(afterData);

    const result = compareInterfaces(normalizedBefore, normalizedAfter);

    const diffs: Array<{ type: 'added' | 'removed' | 'changed'; field: string; oldValue?: string; newValue?: string }> = [];
    for (const field of result.added) {
      diffs.push({ type: 'added', field, newValue: String(normalizedAfter[field] ?? '') });
    }
    for (const field of result.removed) {
      diffs.push({ type: 'removed', field, oldValue: String(normalizedBefore[field] ?? '') });
    }
    for (const item of result.changed) {
      diffs.push({ type: 'changed', field: item.field, oldValue: String(item.before ?? ''), newValue: String(item.after ?? '') });
    }

    res.json({
      source: normalizedBefore.name || sourceId,
      target: normalizedAfter.name || targetId,
      diffs,
      summary: { added: result.added.length, removed: result.removed.length, changed: result.changed.length },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compare interfaces' });
  }
});

router.post('/compare-versions', async (req, res) => {
  try {
    const { interfaceId, version1, version2 } = req.body;

    if (!interfaceId || !version1 || !version2) {
      return res.status(400).json({ error: 'interfaceId, version1, and version2 are required' });
    }

    const iface = (await query('SELECT id FROM interfaces WHERE id = $1', [interfaceId])).rows[0];
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const v1 = (await query('SELECT * FROM interface_versions WHERE interface_id = $1 AND version = $2 ORDER BY created_at DESC LIMIT 1', [interfaceId, version1])).rows[0] as any;
    const v2 = (await query('SELECT * FROM interface_versions WHERE interface_id = $1 AND version = $2 ORDER BY created_at DESC LIMIT 1', [interfaceId, version2])).rows[0] as any;

    if (!v1) {
      return res.status(404).json({ error: `Version "${version1}" not found` });
    }
    if (!v2) {
      return res.status(404).json({ error: `Version "${version2}" not found` });
    }

    const snapshot1 = normalizeInterface(JSON.parse(v1.snapshot));
    const snapshot2 = normalizeInterface(JSON.parse(v2.snapshot));

    const result = compareInterfaces(snapshot1, snapshot2);

    res.json({
      interfaceId,
      version1: { id: v1.id, version: v1.version, created_at: v1.created_at },
      version2: { id: v2.id, version: v2.version, created_at: v2.created_at },
      diff: result,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compare versions' });
  }
});

router.get('/interface/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const iface = (await query('SELECT id FROM interfaces WHERE id = $1', [id])).rows[0];
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const history = (await query(
      'SELECT * FROM change_history WHERE interface_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [id, limitNum, offset]
    )).rows as any[];

    const { total } = (await query('SELECT COUNT(*) as total FROM change_history WHERE interface_id = $1', [id])).rows[0] as any;

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

router.post('/batch-compare', async (req, res) => {
  try {
    const { source1, source2 } = req.body;

    if (!source1 || !source2) {
      return res.status(400).json({ error: 'Both source1 and source2 are required' });
    }

    const getInterfacesBySource = async (source: { category?: string; project?: string }): Promise<any[]> => {
      const category = source.category || source.project;
      if (!category) {
        return (await query('SELECT * FROM interfaces')).rows as any[];
      }
      return (await query('SELECT * FROM interfaces WHERE category = $1', [category])).rows as any[];
    };

    const list1 = await getInterfacesBySource(source1);
    const list2 = await getInterfacesBySource(source2);

    const map1 = new Map<string, any>();
    const map2 = new Map<string, any>();

    for (const iface of list1) {
      const key = `${iface.method}:${iface.path}`;
      map1.set(key, normalizeInterface(iface));
    }
    for (const iface of list2) {
      const key = `${iface.method}:${iface.path}`;
      map2.set(key, normalizeInterface(iface));
    }

    const allKeys = new Set([...map1.keys(), ...map2.keys()]);

    const added: any[] = [];
    const removed: any[] = [];
    const changed: any[] = [];
    const unchanged: any[] = [];

    for (const key of allKeys) {
      const in1 = map1.has(key);
      const in2 = map2.has(key);

      if (in1 && !in2) {
        removed.push({ key, interface: map1.get(key) });
      } else if (!in1 && in2) {
        added.push({ key, interface: map2.get(key) });
      } else {
        const diff = compareInterfaces(map1.get(key), map2.get(key));
        if (diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0) {
          changed.push({ key, diff });
        } else {
          unchanged.push({ key });
        }
      }
    }

    res.json({
      source1: source1.category || source1.project || 'all',
      source2: source2.category || source2.project || 'all',
      summary: {
        totalSource1: list1.length,
        totalSource2: list2.length,
        added: added.length,
        removed: removed.length,
        changed: changed.length,
        unchanged: unchanged.length,
      },
      added,
      removed,
      changed,
      unchanged,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to batch compare' });
  }
});

router.get('/impact/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const iface = (await query('SELECT * FROM interfaces WHERE id = $1', [id])).rows[0] as any;
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const fieldMappings = (await query('SELECT * FROM field_mappings WHERE interface_id = $1', [id])).rows as any[];

    const mockConfigs = (await query('SELECT * FROM mock_configs WHERE interface_id = $1', [id])).rows as any[];

    const pathPrefix = iface.path.split('/').slice(0, -1).join('/');
    const dependentInterfaces = (await query(
      'SELECT * FROM interfaces WHERE id != $1 AND (path LIKE $2 OR path LIKE $3)',
      [id, `${pathPrefix}%`, `%${iface.path}%`]
    )).rows as any[];

    const relatedModels = new Set<string>();
    for (const mapping of fieldMappings) {
      relatedModels.add(mapping.model_name);
    }

    let modelDetails: any[] = [];
    if (relatedModels.size > 0) {
      const modelNames = Array.from(relatedModels);
      const placeholders = modelNames.map((_, i) => `$${i + 1}`).join(', ');
      modelDetails = (await query(`SELECT * FROM data_models WHERE name IN (${placeholders})`, modelNames)).rows as any[];
    }

    const affectedFieldMappings = fieldMappings.map((m: any) => ({
      id: m.id,
      interface_field: m.interface_field,
      model_name: m.model_name,
      model_field: m.model_field,
    }));

    const affectedMockConfigs = mockConfigs.map((m: any) => ({
      id: m.id,
      path: m.path,
      method: m.method,
      status_code: m.status_code,
      enabled: Boolean(m.enabled),
    }));

    const affectedInterfaces = dependentInterfaces.map((dep: any) => ({
      id: dep.id,
      name: dep.name,
      path: dep.path,
      method: dep.method,
      status: dep.status,
      similarity: calculatePathSimilarity(iface.path, dep.path),
    }));

    const affectedModels = modelDetails.map((m: any) => ({
      name: m.name,
      table_name: m.table_name,
      description: m.description,
    }));

    const totalAffected = affectedFieldMappings.length + affectedMockConfigs.length + affectedInterfaces.length + affectedModels.length;

    res.json({
      interface: {
        id: iface.id,
        name: iface.name,
        path: iface.path,
        method: iface.method,
        version: iface.version,
      },
      summary: {
        totalAffected,
        fieldMappings: affectedFieldMappings.length,
        mockConfigs: affectedMockConfigs.length,
        dependentInterfaces: affectedInterfaces.length,
        relatedModels: affectedModels.length,
      },
      affectedFieldMappings,
      affectedMockConfigs,
      affectedInterfaces,
      affectedModels,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze impact' });
  }
});

function calculatePathSimilarity(path1: string, path2: string): number {
  const segments1 = path1.split('/').filter(Boolean);
  const segments2 = path2.split('/').filter(Boolean);

  const maxLen = Math.max(segments1.length, segments2.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  for (let i = 0; i < Math.min(segments1.length, segments2.length); i++) {
    if (segments1[i] === segments2[i]) {
      matches++;
    }
  }

  return Math.round((matches / maxLen) * 100) / 100;
}

export default router;
