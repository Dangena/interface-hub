import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

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

interface RouteStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalResponseTime: number;
  lastRequestAt: string | null;
}

const routes = new Map<string, GatewayRoute>();
const routeStats = new Map<string, RouteStats>();

function getOrCreateStats(routeId: string): RouteStats {
  let stats = routeStats.get(routeId);
  if (!stats) {
    stats = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      lastRequestAt: null,
    };
    routeStats.set(routeId, stats);
  }
  return stats;
}

function recordStats(routeId: string, responseTime: number, statusCode: number): void {
  const stats = getOrCreateStats(routeId);
  stats.totalRequests++;
  stats.totalResponseTime += responseTime;
  stats.lastRequestAt = new Date().toISOString();
  if (statusCode >= 400) {
    stats.errorCount++;
  } else {
    stats.successCount++;
  }
}

router.get('/routes', (_req: Request, res: Response) => {
  try {
    const allRoutes = Array.from(routes.values());
    res.json(allRoutes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gateway routes' });
  }
});

router.post('/routes', (req: Request, res: Response) => {
  try {
    const { name, path, target, methods, enabled, rateLimit, stripPrefix } = req.body;

    if (!name || !path || !target || !methods) {
      return res.status(400).json({ error: 'name, path, target, and methods are required' });
    }

    const id = uuidv4();
    const route: GatewayRoute = {
      id,
      name,
      path,
      target,
      methods: methods.map((m: string) => m.toUpperCase()),
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      rateLimit: rateLimit !== undefined ? Number(rateLimit) : 0,
      stripPrefix: stripPrefix !== undefined ? Boolean(stripPrefix) : false,
    };

    routes.set(id, route);
    getOrCreateStats(id);
    res.status(201).json(route);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create gateway route' });
  }
});

router.put('/routes/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = routes.get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Gateway route not found' });
    }

    const { name, path, target, methods, enabled, rateLimit, stripPrefix } = req.body;

    const updated: GatewayRoute = {
      ...existing,
      ...(name !== undefined && { name }),
      ...(path !== undefined && { path }),
      ...(target !== undefined && { target }),
      ...(methods !== undefined && { methods: methods.map((m: string) => m.toUpperCase()) }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      ...(rateLimit !== undefined && { rateLimit: Number(rateLimit) }),
      ...(stripPrefix !== undefined && { stripPrefix: Boolean(stripPrefix) }),
    };

    routes.set(id, updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update gateway route' });
  }
});

router.delete('/routes/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!routes.has(id)) {
      return res.status(404).json({ error: 'Gateway route not found' });
    }

    routes.delete(id);
    routeStats.delete(id);
    res.json({ message: 'Gateway route deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete gateway route' });
  }
});

router.get('/routes/:id/stats', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const route = routes.get(id);

    if (!route) {
      return res.status(404).json({ error: 'Gateway route not found' });
    }

    const stats = getOrCreateStats(id);
    const avgResponseTime = stats.totalRequests > 0
      ? stats.totalResponseTime / stats.totalRequests
      : 0;
    const errorRate = stats.totalRequests > 0
      ? stats.errorCount / stats.totalRequests
      : 0;

    res.json({
      totalRequests: stats.totalRequests,
      avgResponseTime,
      errorRate,
      lastRequest: stats.lastRequestAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch route stats' });
  }
});

router.post('/proxy/*', async (req: Request, res: Response) => {
  try {
    const incomingPath = '/' + (req.params[0] || '');
    const method = req.method.toUpperCase();

    let matchedRoute: GatewayRoute | null = null;
    for (const route of routes.values()) {
      if (!route.enabled) continue;
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
    recordStats(matchedRoute.id, responseTime, response.status);

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

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const allRoutes = Array.from(routes.values());
    const totalRoutes = allRoutes.length;
    const activeRoutes = allRoutes.filter(r => r.enabled).length;

    let totalRequests = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;

    for (const stats of routeStats.values()) {
      totalRequests += stats.totalRequests;
      totalSuccess += stats.successCount;
      totalErrors += stats.errorCount;
      totalResponseTime += stats.totalResponseTime;
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
