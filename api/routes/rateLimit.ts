import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';

const router = Router();

interface RateLimitRule {
  id: string;
  name: string;
  path: string;
  method: string;
  limit: number;
  windowMs: number;
  strategy: 'fixed-window' | 'sliding-window' | 'token-bucket';
  enabled: boolean;
  blockedCount: number;
  createdAt: string;
  updatedAt: string;
}

interface RequestRecord {
  id: string;
  ruleId: string;
  identifier: string;
  count: number;
  windowStart: number;
  tokens: number;
  lastRefill: number;
  prevCount: number;
  prevWindowStart: number;
}

function rowToRule(row: any): RateLimitRule {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    method: row.method,
    limit: row.limit_count,
    windowMs: row.window_ms,
    strategy: row.strategy,
    enabled: Boolean(row.enabled),
    blockedCount: row.blocked_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRecord(row: any): RequestRecord {
  return {
    id: row.id,
    ruleId: row.rule_id,
    identifier: row.identifier,
    count: row.count,
    windowStart: row.window_start,
    tokens: row.tokens,
    lastRefill: row.last_refill,
    prevCount: row.prev_count,
    prevWindowStart: row.prev_window_start,
  };
}

function getRuleById(id: string): RateLimitRule | undefined {
  const row = db.prepare('SELECT * FROM rate_limit_rules WHERE id = ?').get(id);
  return row ? rowToRule(row) : undefined;
}

function getOrCreateRecord(ruleId: string, identifier: string, now: number, rule: RateLimitRule): RequestRecord {
  const existing = db.prepare('SELECT * FROM rate_limit_counts WHERE rule_id = ? AND identifier = ?').get(ruleId, identifier);
  if (existing) {
    return rowToRecord(existing);
  }
  const id = uuidv4();
  db.prepare(
    'INSERT INTO rate_limit_counts (id, rule_id, identifier, count, window_start, tokens, last_refill, prev_count, prev_window_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, ruleId, identifier, 0, now, rule.limit, now, 0, now - rule.windowMs);
  return {
    id,
    ruleId,
    identifier,
    count: 0,
    windowStart: now,
    tokens: rule.limit,
    lastRefill: now,
    prevCount: 0,
    prevWindowStart: now - rule.windowMs,
  };
}

function saveRecord(record: RequestRecord): void {
  db.prepare(
    'UPDATE rate_limit_counts SET count = ?, window_start = ?, tokens = ?, last_refill = ?, prev_count = ?, prev_window_start = ? WHERE id = ?'
  ).run(record.count, record.windowStart, record.tokens, record.lastRefill, record.prevCount, record.prevWindowStart, record.id);
}

function checkFixedWindow(record: RequestRecord, rule: RateLimitRule, now: number): { allowed: boolean; record: RequestRecord } {
  if (now - record.windowStart >= rule.windowMs) {
    record.prevCount = record.count;
    record.prevWindowStart = record.windowStart;
    record.count = 0;
    record.windowStart = now;
  }
  record.count++;
  const allowed = record.count <= rule.limit;
  return { allowed, record };
}

function checkSlidingWindow(record: RequestRecord, rule: RateLimitRule, now: number): { allowed: boolean; record: RequestRecord } {
  if (now - record.windowStart >= rule.windowMs) {
    record.prevCount = record.count;
    record.prevWindowStart = record.windowStart;
    record.count = 0;
    record.windowStart = now;
  }
  const elapsed = now - record.windowStart;
  const weight = elapsed / rule.windowMs;
  const estimated = Math.floor(record.prevCount * (1 - weight)) + record.count;
  record.count++;
  const allowed = (estimated + 1) <= rule.limit;
  return { allowed, record };
}

function checkTokenBucket(record: RequestRecord, rule: RateLimitRule, now: number): { allowed: boolean; record: RequestRecord } {
  const refillRate = rule.limit / rule.windowMs;
  const elapsed = now - record.lastRefill;
  record.tokens = Math.min(rule.limit, record.tokens + elapsed * refillRate);
  record.lastRefill = now;
  if (record.tokens >= 1) {
    record.tokens -= 1;
    return { allowed: true, record };
  }
  return { allowed: false, record };
}

function checkRateLimit(ruleId: string, identifier: string): { allowed: boolean; currentCount: number; remaining: number; resetAt: string } {
  const rule = getRuleById(ruleId);
  if (!rule || !rule.enabled) {
    return { allowed: true, currentCount: 0, remaining: rule?.limit ?? 0, resetAt: new Date(Date.now() + (rule?.windowMs ?? 0)).toISOString() };
  }

  const now = Date.now();
  const record = getOrCreateRecord(ruleId, identifier, now, rule);

  let result: { allowed: boolean; record: RequestRecord };

  switch (rule.strategy) {
    case 'sliding-window':
      result = checkSlidingWindow(record, rule, now);
      break;
    case 'token-bucket':
      result = checkTokenBucket(record, rule, now);
      break;
    default:
      result = checkFixedWindow(record, rule, now);
  }

  saveRecord(result.record);

  if (!result.allowed) {
    db.prepare('UPDATE rate_limit_rules SET blocked_count = blocked_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ruleId);
  }

  const currentCount = rule.strategy === 'token-bucket' ? rule.limit - Math.floor(result.record.tokens) : result.record.count;
  const remaining = rule.strategy === 'token-bucket' ? Math.floor(result.record.tokens) : Math.max(0, rule.limit - currentCount);
  const resetAt = new Date(result.record.windowStart + rule.windowMs).toISOString();

  return { allowed: result.allowed, currentCount, remaining, resetAt };
}

router.get('/rules', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM rate_limit_rules ORDER BY created_at DESC').all();
    res.json(rows.map(rowToRule));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rate limit rules' });
  }
});

router.post('/rules', (req: Request, res: Response) => {
  try {
    const { name, path, method, limit, windowMs, strategy, enabled } = req.body;

    if (!name || !path || !method || limit === undefined || windowMs === undefined || !strategy) {
      return res.status(400).json({ error: 'name, path, method, limit, windowMs, and strategy are required' });
    }

    const validStrategies: RateLimitRule['strategy'][] = ['fixed-window', 'sliding-window', 'token-bucket'];
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({ error: 'strategy must be one of: fixed-window, sliding-window, token-bucket' });
    }

    const id = uuidv4();
    const enabledVal = enabled !== undefined ? (Boolean(enabled) ? 1 : 0) : 1;

    db.prepare(
      'INSERT INTO rate_limit_rules (id, name, path, method, limit_count, window_ms, strategy, enabled, blocked_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
    ).run(id, name, path, method.toUpperCase(), Number(limit), Number(windowMs), strategy, enabledVal);

    const rule = getRuleById(id);
    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create rate limit rule' });
  }
});

router.put('/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = getRuleById(id);

    if (!existing) {
      return res.status(404).json({ error: 'Rate limit rule not found' });
    }

    const { name, path, method, limit, windowMs, strategy, enabled } = req.body;

    if (strategy !== undefined) {
      const validStrategies: RateLimitRule['strategy'][] = ['fixed-window', 'sliding-window', 'token-bucket'];
      if (!validStrategies.includes(strategy)) {
        return res.status(400).json({ error: 'strategy must be one of: fixed-window, sliding-window, token-bucket' });
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (path !== undefined) { updates.push('path = ?'); values.push(path); }
    if (method !== undefined) { updates.push('method = ?'); values.push(method.toUpperCase()); }
    if (limit !== undefined) { updates.push('limit_count = ?'); values.push(Number(limit)); }
    if (windowMs !== undefined) { updates.push('window_ms = ?'); values.push(Number(windowMs)); }
    if (strategy !== undefined) { updates.push('strategy = ?'); values.push(strategy); }
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(Boolean(enabled) ? 1 : 0); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      db.prepare(`UPDATE rate_limit_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = getRuleById(id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rate limit rule' });
  }
});

router.delete('/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = getRuleById(id);

    if (!existing) {
      return res.status(404).json({ error: 'Rate limit rule not found' });
    }

    db.prepare('DELETE FROM rate_limit_counts WHERE rule_id = ?').run(id);
    db.prepare('DELETE FROM rate_limit_rules WHERE id = ?').run(id);

    res.json({ message: 'Rate limit rule deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rate limit rule' });
  }
});

router.get('/rules/:id/stats', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rule = getRuleById(id);

    if (!rule) {
      return res.status(404).json({ error: 'Rate limit rule not found' });
    }

    const rows = db.prepare('SELECT * FROM rate_limit_counts WHERE rule_id = ?').all(id);
    const now = Date.now();
    let totalCurrentCount = 0;
    let minRemaining = rule.limit;
    let earliestResetAt = now + rule.windowMs;

    for (const row of rows) {
      const record = rowToRecord(row);
      const currentCount = rule.strategy === 'token-bucket'
        ? rule.limit - Math.floor(record.tokens)
        : record.count;
      const remaining = rule.strategy === 'token-bucket'
        ? Math.floor(record.tokens)
        : Math.max(0, rule.limit - currentCount);
      const resetAt = record.windowStart + rule.windowMs;

      totalCurrentCount += currentCount;
      if (remaining < minRemaining) minRemaining = remaining;
      if (resetAt < earliestResetAt) earliestResetAt = resetAt;
    }

    res.json({
      currentCount: totalCurrentCount,
      remaining: minRemaining,
      resetAt: new Date(earliestResetAt).toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rule stats' });
  }
});

router.post('/middleware', (req: Request, res: Response) => {
  try {
    const { ruleIds } = req.body as { ruleIds?: string[] };

    let validRules: RateLimitRule[];

    if (ruleIds && ruleIds.length > 0) {
      const placeholders = ruleIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT * FROM rate_limit_rules WHERE id IN (${placeholders}) AND enabled = 1`).all(...ruleIds);
      validRules = rows.map(rowToRule);
    } else {
      const rows = db.prepare('SELECT * FROM rate_limit_rules WHERE enabled = 1').all();
      validRules = rows.map(rowToRule);
    }

    const middlewareConfig = {
      rules: validRules.map(r => ({
        id: r.id,
        name: r.name,
        path: r.path,
        method: r.method,
        limit: r.limit,
        windowMs: r.windowMs,
        strategy: r.strategy,
      })),
      handler: 'rateLimitMiddleware',
    };

    res.json(middlewareConfig);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate middleware config' });
  }
});

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const totalRules = db.prepare('SELECT COUNT(*) as count FROM rate_limit_rules').get() as any;
    const activeRules = db.prepare('SELECT COUNT(*) as count FROM rate_limit_rules WHERE enabled = 1').get() as any;
    const blockedResult = db.prepare('SELECT COALESCE(SUM(blocked_count), 0) as total FROM rate_limit_rules').get() as any;

    res.json({
      totalRules: totalRules.count,
      activeRules: activeRules.count,
      totalBlockedRequests: blockedResult.total,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch overall stats' });
  }
});

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rows = db.prepare('SELECT * FROM rate_limit_rules WHERE enabled = 1').all();
  const allRules = rows.map(rowToRule);

  const matchingRules = allRules.filter(r => {
    if (r.method !== '*' && r.method !== req.method.toUpperCase()) return false;
    return req.path.startsWith(r.path) || r.path === '*';
  });

  if (matchingRules.length === 0) {
    return next();
  }

  const identifier = req.ip || 'unknown';

  for (const rule of matchingRules) {
    const result = checkRateLimit(rule.id, identifier);

    res.setHeader('X-RateLimit-Limit', rule.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(rule.windowMs / 1000).toString());
      res.status(429).json({
        error: 'Too many requests',
        rule: rule.name,
        limit: rule.limit,
        windowMs: rule.windowMs,
        retryAfter: Math.ceil(rule.windowMs / 1000),
      });
      return;
    }
  }

  next();
}

export { checkRateLimit };
export default router;
