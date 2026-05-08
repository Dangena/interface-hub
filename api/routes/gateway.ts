import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database.js';

const router = Router();

interface GatewayRoute {
  id: string;
  name: string;
  path: string;
  target: string;
  methods: string[];
  enabled: boolean;
  rateLimit: number;
  stripPrefix: boolean;
}

function rowToRoute(row: any): GatewayRoute {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    target: row.target,
    methods: JSON.parse(row.methods),
    enabled: Boolean(row.enabled),
    rateLimit: row.rate_limit,
    stripPrefix: Boolean(row.strip_prefix),
  };
}

router.get('/routes', async (_req: Request, res: Response) => {
  try {
    const rows = (await query('SELECT * FROM gateway_routes ORDER BY created_at DESC')).rows as any[];
    res.json(rows.map(rowToRoute));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gateway routes' });
  }
});

router.post('/routes', async (req: Request, res: Response) => {
  try {
    const { name, path, target, methods, enabled, rateLimit, stripPrefix } = req.body;

    if (!name || !path || !target || !methods) {
      return res.status(400).json({ error: 'name, path, target, and methods are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const normalizedMethods = methods.map((m: string) => m.toUpperCase());
    const enabledVal = enabled !== undefined ? (Boolean(enabled) ? 1 : 0) : 1;
    const rateLimitVal = rateLimit !== undefined ? Number(rateLimit) : 0;
    const stripPrefixVal = stripPrefix !== undefined ? (Boolean(stripPrefix) ? 1 : 0) : 0;

    await query(`
      INSERT INTO gateway_routes (id, name, path, target, methods, enabled, rate_limit, strip_prefix, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [id, name, path, target, JSON.stringify(normalizedMethods), enabledVal, rateLimitVal, stripPrefixVal, now, now]);

    const route: GatewayRoute = {
      id,
      name,
      path,
      target,
      methods: normalizedMethods,
      enabled: Boolean(enabledVal),
      rateLimit: rateLimitVal,
      stripPrefix: Boolean(stripPrefixVal),
    };

    res.status(201).json(route);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create gateway route' });
  }
});

router.put('/routes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = (await query('SELECT * FROM gateway_routes WHERE id = $1', [id])).rows[0] as any;

    if (!existing) {
      return res.status(404).json({ error: 'Gateway route not found' });
    }

    const { name, path, target, methods, enabled, rateLimit, stripPrefix } = req.body;
    const now = new Date().toISOString();

    const finalName = name !== undefined ? name : existing.name;
    const finalPath = path !== undefined ? path : existing.path;
    const finalTarget = target !== undefined ? target : existing.target;
    const finalMethods = methods !== undefined ? methods.map((m: string) => m.toUpperCase()) : JSON.parse(existing.methods);
    const finalEnabled = enabled !== undefined ? (Boolean(enabled) ? 1 : 0) : existing.enabled;
    const finalRateLimit = rateLimit !== undefined ? Number(rateLimit) : existing.rate_limit;
    const finalStripPrefix = stripPrefix !== undefined ? (Boolean(stripPrefix) ? 1 : 0) : existing.strip_prefix;

    await query(`
      UPDATE gateway_routes SET name = $1, path = $2, target = $3, methods = $4, enabled = $5, rate_limit = $6, strip_prefix = $7, updated_at = $8
      WHERE id = $9
    `, [finalName, finalPath, finalTarget, JSON.stringify(finalMethods), finalEnabled, finalRateLimit, finalStripPrefix, now, id]);

    const route: GatewayRoute = {
      id,
      name: finalName,
      path: finalPath,
      target: finalTarget,
      methods: finalMethods,
      enabled: Boolean(finalEnabled),
      rateLimit: finalRateLimit,
      stripPrefix: Boolean(finalStripPrefix),
    };

    res.json(route);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update gateway route' });
  }
});

router.delete('/routes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = (await query('SELECT * FROM gateway_routes WHERE id = $1', [id])).rows[0] as any;

    if (!existing) {
      return res.status(404).json({ error: 'Gateway route not found' });
    }

    await query('DELETE FROM gateway_stats WHERE route_id = $1', [id]);
    await query('DELETE FROM gateway_routes WHERE id = $1', [id]);

    res.json({ message: 'Gateway route deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete gateway route' });
  }
});

router.get('/routes/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const route = (await query('SELECT * FROM gateway_routes WHERE id = $1', [id])).rows[0] as any;

    if (!route) {
      return res.status(404).json({ error: 'Gateway route not found' });
    }

    const stats = (await query('SELECT * FROM gateway_stats WHERE route_id = $1', [id])).rows[0] as any;

    const totalRequests = stats ? stats.total_requests : 0;
    const totalResponseTime = stats ? stats.total_response_time : 0;
    const errorCount = stats ? stats.error_count : 0;
    const lastRequestAt = stats ? stats.last_request_at : null;

    const avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

    res.json({
      totalRequests,
      avgResponseTime,
      errorRate,
      lastRequest: lastRequestAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch route stats' });
  }
});

router.post('/proxy/*', async (req: Request, res: Response) => {
  try {
    const incomingPath = '/' + (req.params[0] || '');
    const method = req.method.toUpperCase();

    const rows = (await query('SELECT * FROM gateway_routes WHERE enabled = 1')).rows as any[];

    let matchedRoute: GatewayRoute | null = null;
    for (const row of rows) {
      const route = rowToRoute(row);
      if (!route.methods.includes(method) && !route.methods.includes('*')) continue;
      if (incomingPath.startsWith(route.path) || incomingPath === route.path) {
        matchedRoute = route;
        break;
      }
    }

    if (!matchedRoute) {
      return res.status(404).json({ error: 'No matching gateway route found' });
    }

    let targetPath = incomingPath;
    if (matchedRoute.stripPrefix) {
      targetPath = incomingPath.slice(matchedRoute.path.length) || '/';
    }

    const targetUrl = matchedRoute.target.replace(/\/$/, '') + targetPath;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'host') continue;
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }

    const start = Date.now();

    let body: BodyInit | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = JSON.stringify(req.body);
      headers['content-type'] = 'application/json';
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseTime = Date.now() - start;

    const existingStats = (await query('SELECT * FROM gateway_stats WHERE route_id = $1', [matchedRoute.id])).rows[0] as any;
    const now = new Date().toISOString();

    if (existingStats) {
      const newTotal = existingStats.total_requests + 1;
      const newSuccess = existingStats.success_count + (response.status < 400 ? 1 : 0);
      const newErrors = existingStats.error_count + (response.status >= 400 ? 1 : 0);
      const newResponseTime = existingStats.total_response_time + responseTime;

      await query(`
        UPDATE gateway_stats SET total_requests = $1, success_count = $2, error_count = $3, total_response_time = $4, last_request_at = $5
        WHERE route_id = $6
      `, [newTotal, newSuccess, newErrors, newResponseTime, now, matchedRoute.id]);
    } else {
      const statsId = uuidv4();
      await query(`
        INSERT INTO gateway_stats (id, route_id, total_requests, success_count, error_count, total_response_time, last_request_at)
        VALUES ($1, $2, 1, $3, $4, $5, $6)
      `, [
        statsId,
        matchedRoute.id,
        response.status < 400 ? 1 : 0,
        response.status >= 400 ? 1 : 0,
        responseTime,
        now
      ]);
    }

    const responseBody = await response.text();

    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'transfer-encoding') continue;
      res.setHeader(key, value);
    }

    res.status(response.status).send(responseBody);
  } catch (error) {
    res.status(502).json({ error: 'Proxy request failed' });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const routeRows = (await query('SELECT * FROM gateway_routes')).rows as any[];
    const totalRoutes = routeRows.length;
    const activeRoutes = routeRows.filter(r => r.enabled).length;

    const statsRows = (await query('SELECT * FROM gateway_stats')).rows as any[];

    let totalRequests = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;

    for (const stats of statsRows) {
      totalRequests += stats.total_requests;
      totalSuccess += stats.success_count;
      totalErrors += stats.error_count;
      totalResponseTime += stats.total_response_time;
    }

    const avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    res.json({
      totalRoutes,
      activeRoutes,
      totalRequests,
      totalSuccess,
      totalErrors,
      avgResponseTime,
      errorRate,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gateway stats' });
  }
});

export default router;
