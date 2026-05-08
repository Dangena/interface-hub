import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
  const spanId = uuidv4();

  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('X-Span-Id', spanId);

  const originalEnd = res.end.bind(res);
  res.end = function (this: Response, ...args: any[]): Response {
    const duration = Date.now() - startTime;
    const operationName = `${req.method} ${req.route?.path || req.path}`;

    const tags = JSON.stringify({
      query: req.query,
      contentType: req.get('content-type'),
    });

    const logs = JSON.stringify([]);

    const userId = (req as any).user?.id || null;
    const ipAddress = req.ip || req.socket.remoteAddress || null;

    try {
      db.prepare(`
        INSERT INTO traces (id, trace_id, span_id, parent_span_id, operation_name, service_name, method, path, status_code, duration, tags, logs, user_id, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        traceId,
        spanId,
        null,
        operationName,
        'interface-hub',
        req.method,
        req.originalUrl,
        res.statusCode,
        duration,
        tags,
        logs,
        userId,
        ipAddress
      );
    } catch (_e) {}

    return originalEnd.apply(res, args) as Response;
  } as any;

  next();
}

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { trace_id, method, path, status_code, start_time, end_time, limit = '50', offset = '0' } = req.query;

    let where = '1=1';
    const params: any[] = [];

    if (trace_id) {
      where += ' AND trace_id = ?';
      params.push(trace_id);
    }
    if (method) {
      where += ' AND method = ?';
      params.push(method);
    }
    if (path) {
      where += ' AND path LIKE ?';
      params.push(`%${path}%`);
    }
    if (status_code) {
      where += ' AND status_code = ?';
      params.push(Number(status_code));
    }
    if (start_time) {
      where += ' AND created_at >= ?';
      params.push(start_time);
    }
    if (end_time) {
      where += ' AND created_at <= ?';
      params.push(end_time);
    }

    const limitVal = Math.min(Math.max(Number(limit), 1), 500);
    const offsetVal = Math.max(Number(offset), 0);

    const rows = db.prepare(`
      SELECT trace_id,
             COUNT(*) as span_count,
             MIN(created_at) as started_at,
             MAX(created_at) as ended_at,
             SUM(duration) as total_duration,
             GROUP_CONCAT(DISTINCT method) as methods,
             GROUP_CONCAT(DISTINCT path) as paths
      FROM traces
      WHERE ${where}
      GROUP BY trace_id
      ORDER BY MIN(created_at) DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitVal, offsetVal) as any[];

    const totalResult = db.prepare(`
      SELECT COUNT(DISTINCT trace_id) as total
      FROM traces
      WHERE ${where}
    `).get(...params) as any;

    res.json({
      traces: rows,
      total: totalResult.total,
      limit: limitVal,
      offset: offsetVal,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list traces' });
  }
});

router.get('/stats/summary', (_req: Request, res: Response) => {
  try {
    const totalTraces = (db.prepare('SELECT COUNT(DISTINCT trace_id) as count FROM traces').get() as any).count;

    const avgResult = db.prepare(`
      SELECT AVG(total_duration) as avg_duration
      FROM (
        SELECT SUM(duration) as total_duration
        FROM traces
        GROUP BY trace_id
      )
    `).get() as any;

    const errorResult = db.prepare(`
      SELECT COUNT(DISTINCT trace_id) as count
      FROM traces
      WHERE status_code >= 400
    `).get() as any;

    const errorRate = totalTraces > 0 ? (errorResult.count / totalTraces) * 100 : 0;

    const slowestTraces = db.prepare(`
      SELECT trace_id,
             SUM(duration) as total_duration,
             COUNT(*) as span_count,
             MIN(created_at) as started_at
      FROM traces
      GROUP BY trace_id
      ORDER BY SUM(duration) DESC
      LIMIT 10
    `).all() as any[];

    res.json({
      totalTraces,
      avgDuration: avgResult?.avg_duration || 0,
      errorRate: Math.round(errorRate * 100) / 100,
      slowestTraces,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trace statistics' });
  }
});

router.get('/:traceId', (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;

    const spans = db.prepare(`
      SELECT * FROM traces
      WHERE trace_id = ?
      ORDER BY created_at ASC
    `).all(traceId) as any[];

    if (spans.length === 0) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    res.json({
      trace_id: traceId,
      spans,
      span_count: spans.length,
      total_duration: spans.reduce((sum: number, s: any) => sum + (s.duration || 0), 0),
      started_at: spans[0].created_at,
      ended_at: spans[spans.length - 1].created_at,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trace details' });
  }
});

router.delete('/', (req: Request, res: Response) => {
  try {
    const { before } = req.query;

    let cutoffDate: string;
    if (before) {
      cutoffDate = before as string;
    } else {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      cutoffDate = date.toISOString();
    }

    const result = db.prepare('DELETE FROM traces WHERE created_at < ?').run(cutoffDate);

    res.json({
      message: 'Old traces cleared successfully',
      deletedCount: result.changes,
      cutoffDate,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear traces' });
  }
});

export default router;
