import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool, query } from '../database.js';

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

    query(`
      INSERT INTO traces (id, trace_id, span_id, parent_span_id, operation_name, service_name, method, path, status_code, duration, tags, logs, user_id, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
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
    ]).catch(() => {});

    return originalEnd.apply(res, args) as Response;
  } as any;

  next();
}

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { trace_id, method, path, status_code, start_time, end_time, limit = '50', offset = '0' } = req.query;

    let where = '1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (trace_id) {
      where += ` AND trace_id = $${paramIdx++}`;
      params.push(trace_id);
    }
    if (method) {
      where += ` AND method = $${paramIdx++}`;
      params.push(method);
    }
    if (path) {
      where += ` AND path LIKE $${paramIdx++}`;
      params.push(`%${path}%`);
    }
    if (status_code) {
      where += ` AND status_code = $${paramIdx++}`;
      params.push(Number(status_code));
    }
    if (start_time) {
      where += ` AND created_at >= $${paramIdx++}`;
      params.push(start_time);
    }
    if (end_time) {
      where += ` AND created_at <= $${paramIdx++}`;
      params.push(end_time);
    }

    const limitVal = Math.min(Math.max(Number(limit), 1), 500);
    const offsetVal = Math.max(Number(offset), 0);

    params.push(limitVal, offsetVal);
    const rows = (await query(`
      SELECT trace_id,
             COUNT(*) as span_count,
             MIN(created_at) as started_at,
             MAX(created_at) as ended_at,
             SUM(duration) as total_duration,
             STRING_AGG(DISTINCT method, ',') as methods,
             STRING_AGG(DISTINCT path, ',') as paths
      FROM traces
      WHERE ${where}
      GROUP BY trace_id
      ORDER BY MIN(created_at) DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, params)).rows as any[];

    const totalResult = (await query(`
      SELECT COUNT(DISTINCT trace_id) as total
      FROM traces
      WHERE ${where}
    `, params.slice(0, -2))).rows[0] as any;

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

router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const totalTraces = ((await query('SELECT COUNT(DISTINCT trace_id) as count FROM traces')).rows[0] as any).count;

    const avgResult = (await query(`
      SELECT AVG(total_duration) as avg_duration
      FROM (
        SELECT SUM(duration) as total_duration
        FROM traces
        GROUP BY trace_id
      )
    `)).rows[0] as any;

    const errorResult = (await query(`
      SELECT COUNT(DISTINCT trace_id) as count
      FROM traces
      WHERE status_code >= 400
    `)).rows[0] as any;

    const errorRate = totalTraces > 0 ? (errorResult.count / totalTraces) * 100 : 0;

    const slowestTraces = (await query(`
      SELECT trace_id,
             SUM(duration) as total_duration,
             COUNT(*) as span_count,
             MIN(created_at) as started_at
      FROM traces
      GROUP BY trace_id
      ORDER BY SUM(duration) DESC
      LIMIT 10
    `)).rows as any[];

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

router.get('/:traceId', async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;

    const spans = (await query(`
      SELECT * FROM traces
      WHERE trace_id = $1
      ORDER BY created_at ASC
    `, [traceId])).rows as any[];

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

router.delete('/', async (req: Request, res: Response) => {
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

    const result = await query('DELETE FROM traces WHERE created_at < $1', [cutoffDate]);

    res.json({
      message: 'Old traces cleared successfully',
      deletedCount: result.rowCount,
      cutoffDate,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear traces' });
  }
});

export default router;
