import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

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
  createdAt: string;
}

interface RequestRecord {
  count: number;
  windowStart: number;
  tokens: number;
  lastRefill: number;
  prevCount: number;
  prevWindowStart: number;
}

const rules = new Map<string, RateLimitRule>();
const requestCounts = new Map<string, RequestRecord>();
let totalBlockedRequests = 0;

function getKey(ruleId: string, identifier: string): string {
  return `${ruleId}:${identifier}`;
}

function getOrCreateRecord(key: string, now: number, rule: RateLimitRule): RequestRecord {
  let record = requestCounts.get(key);
  if (!record) {
    record = {
      count: 0,
      windowStart: now,
      tokens: rule.limit,
      lastRefill: now,
      prevCount: 0,
      prevWindowStart: now - rule.windowMs,
    };
    requestCounts.set(key, record);
  }
  return record;
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
  const rule = rules.get(ruleId);
  if (!rule || !rule.enabled) {
    return { allowed: true, currentCount: 0, remaining: rule?.limit ?? 0, resetAt: new Date(Date.now() + (rule?.windowMs ?? 0)).toISOString() };
  }

  const now = Date.now();
  const key = getKey(ruleId, identifier);
  const record = getOrCreateRecord(key, now, rule);

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

  requestCounts.set(key, result.record);

  if (!result.allowed) {
    totalBlockedRequests++;
  }

  const currentCount = rule.strategy === 'token-bucket' ? rule.limit - Math.floor(result.record.tokens) : result.record.count;
  const remaining = rule.strategy === 'token-bucket' ? Math.floor(result.record.tokens) : Math.max(0, rule.limit - currentCount);
  const resetAt = new Date(result.record.windowStart + rule.windowMs).toISOString();

  return { allowed: result.allowed, currentCount, remaining, resetAt };
}

router.get('/rules', (_req: Request, res: Response) => {
  try {
    const allRules = Array.from(rules.values());
    res.json(allRules);
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
    const rule: RateLimitRule = {
      id,
      name,
      path,
      method: method.toUpperCase(),
      limit: Number(limit),
      windowMs: Number(windowMs),
      strategy,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      createdAt: new Date().toISOString(),
    };

    rules.set(id, rule);
    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create rate limit rule' });
  }
});

router.put('/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = rules.get(id);

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

    const updated: RateLimitRule = {
      ...existing,
      ...(name !== undefined && { name }),
      ...(path !== undefined && { path }),
      ...(method !== undefined && { method: method.toUpperCase() }),
      ...(limit !== undefined && { limit: Number(limit) }),
      ...(windowMs !== undefined && { windowMs: Number(windowMs) }),
      ...(strategy !== undefined && { strategy }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
    };

    rules.set(id, updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rate limit rule' });
  }
});

router.delete('/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!rules.has(id)) {
      return res.status(404).json({ error: 'Rate limit rule not found' });
    }

    rules.delete(id);

    for (const key of Array.from(requestCounts.keys())) {
      if (key.startsWith(`${id}:`)) {
        requestCounts.delete(key);
      }
    }

    res.json({ message: 'Rate limit rule deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rate limit rule' });
  }
});

router.get('/rules/:id/stats', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rule = rules.get(id);

    if (!rule) {
      return res.status(404).json({ error: 'Rate limit rule not found' });
    }

    const now = Date.now();
    let totalCurrentCount = 0;
    let minRemaining = rule.limit;
    let earliestResetAt = now + rule.windowMs;

    for (const [key, record] of Array.from(requestCounts.entries())) {
      if (key.startsWith(`${id}:`)) {
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

    const targetRuleIds = ruleIds && ruleIds.length > 0
      ? ruleIds
      : Array.from(rules.keys());

    const validRules = targetRuleIds
      .map((rid: string) => rules.get(rid))
      .filter((r: RateLimitRule | undefined): r is RateLimitRule => !!r && r.enabled);

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
    const allRules = Array.from(rules.values());
    const totalRules = allRules.length;
    const activeRules = allRules.filter(r => r.enabled).length;

    res.json({
      totalRules,
      activeRules,
      totalBlockedRequests,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch overall stats' });
  }
});

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const matchingRules = Array.from(rules.values()).filter(r => {
    if (!r.enabled) return false;
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

export { rules, requestCounts, totalBlockedRequests, checkRateLimit };
export default router;
