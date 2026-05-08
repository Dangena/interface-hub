import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';

const router = Router();

function mapRuleRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    threshold: row.threshold,
    window: row.window,
    enabled: Boolean(row.enabled),
    lastTriggered: row.last_triggered,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHistoryRow(row: any) {
  return {
    id: row.id,
    alertId: row.rule_id,
    alertName: row.alert_name,
    type: row.alert_type,
    threshold: row.threshold,
    actualValue: row.metric_value,
    triggeredAt: row.triggered_at,
    message: row.message,
  };
}

router.get('/health', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    let dbStatus = 'ok';
    let dbResponseTime = 0;
    try {
      const start = Date.now();
      db.prepare('SELECT 1').get();
      dbResponseTime = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'healthy' : 'degraded';

    res.json({
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      uptimeFormatted: formatUptime(uptime),
      database: {
        status: dbStatus,
        responseTime: dbResponseTime,
      },
      memory: {
        rss: formatBytes(memUsage.rss),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsed: formatBytes(memUsage.heapUsed),
        external: formatBytes(memUsage.external),
        rssBytes: memUsage.rss,
        heapTotalBytes: memUsage.heapTotal,
        heapUsedBytes: memUsage.heapUsed,
        externalBytes: memUsage.external,
        heapUsagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform health check' });
  }
});

router.get('/metrics', (req, res) => {
  try {
    const totalRequests = db.prepare('SELECT COUNT(*) as count FROM api_logs').get() as any;
    const avgResponseTime = db.prepare('SELECT AVG(response_time) as avg FROM api_logs').get() as any;
    const errorCount = db.prepare('SELECT COUNT(*) as count FROM api_logs WHERE status_code >= 400').get() as any;

    const endpointMetrics = db.prepare(`
      SELECT method, path, COUNT(*) as request_count,
             AVG(response_time) as avg_response_time,
             SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM api_logs
      GROUP BY method, path
      ORDER BY request_count DESC
    `).all() as any[];

    const errorRate = totalRequests.count > 0
      ? Math.round((errorCount.count / totalRequests.count) * 10000) / 100
      : 0;

    res.json({
      totalRequests: totalRequests.count,
      avgResponseTime: Math.round((avgResponseTime.avg || 0) * 100) / 100,
      errorRate,
      errorCount: errorCount.count,
      requestsPerEndpoint: endpointMetrics.map((ep) => ({
        method: ep.method,
        path: ep.path,
        requestCount: ep.request_count,
        avgResponseTime: Math.round((ep.avg_response_time || 0) * 100) / 100,
        errorCount: ep.error_count,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/metrics/endpoints', (req, res) => {
  try {
    const endpointMetrics = db.prepare(`
      SELECT method, path,
             COUNT(*) as request_count,
             AVG(response_time) as avg_response_time,
             MIN(response_time) as min_response_time,
             MAX(response_time) as max_response_time,
             SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
             SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error_count
      FROM api_logs
      GROUP BY method, path
      ORDER BY request_count DESC
    `).all() as any[];

    res.json(
      endpointMetrics.map((ep) => ({
        method: ep.method,
        path: ep.path,
        requestCount: ep.request_count,
        avgResponseTime: Math.round((ep.avg_response_time || 0) * 100) / 100,
        minResponseTime: ep.min_response_time || 0,
        maxResponseTime: ep.max_response_time || 0,
        errorCount: ep.error_count,
        serverErrorCount: ep.server_error_count,
        errorRate: ep.request_count > 0
          ? Math.round((ep.error_count / ep.request_count) * 10000) / 100
          : 0,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch endpoint metrics' });
  }
});

router.get('/metrics/timeline', (req, res) => {
  try {
    const timeline = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', created_at) as hour,
             COUNT(*) as request_count,
             AVG(response_time) as avg_response_time,
             SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM api_logs
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY hour
      ORDER BY hour ASC
    `).all() as any[];

    res.json(
      timeline.map((entry) => ({
        hour: entry.hour,
        requestCount: entry.request_count,
        avgResponseTime: Math.round((entry.avg_response_time || 0) * 100) / 100,
        errorCount: entry.error_count,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline metrics' });
  }
});

router.get('/alerts', (req, res) => {
  try {
    const rules = db.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all() as any[];
    res.json(rules.map(mapRuleRow));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

router.post('/alerts', (req, res) => {
  try {
    const { name, type, threshold, window, enabled } = req.body;

    if (!name || !type || threshold === undefined) {
      return res.status(400).json({ error: 'name, type, and threshold are required' });
    }

    if (!['response_time', 'error_rate', 'health_check'].includes(type)) {
      return res.status(400).json({ error: 'type must be response_time, error_rate, or health_check' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const enabledVal = enabled !== undefined ? (Boolean(enabled) ? 1 : 0) : 1;
    const windowVal = Number(window) || 5;

    db.prepare(`
      INSERT INTO alert_rules (id, name, type, threshold, window, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, Number(threshold), windowVal, enabledVal, now, now);

    const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as any;
    res.status(201).json(mapRuleRow(rule));
  } catch (error) {
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

router.put('/alerts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    const { name, type, threshold, window, enabled } = req.body;

    if (type && !['response_time', 'error_rate', 'health_check'].includes(type)) {
      return res.status(400).json({ error: 'type must be response_time, error_rate, or health_check' });
    }

    const newName = name !== undefined ? name : existing.name;
    const newType = type !== undefined ? type : existing.type;
    const newThreshold = threshold !== undefined ? Number(threshold) : existing.threshold;
    const newWindow = window !== undefined ? Number(window) : existing.window;
    const newEnabled = enabled !== undefined ? (Boolean(enabled) ? 1 : 0) : existing.enabled;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alert_rules
      SET name = ?, type = ?, threshold = ?, window = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(newName, newType, newThreshold, newWindow, newEnabled, now, id);

    const updated = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as any;
    res.json(mapRuleRow(updated));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

router.delete('/alerts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    db.prepare('DELETE FROM alert_history WHERE rule_id = ?').run(id);
    db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id);

    res.json({ message: 'Alert rule deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

router.get('/alerts/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    const history = db.prepare(`
      SELECT ah.*, ar.name as alert_name, ar.type as alert_type
      FROM alert_history ah
      JOIN alert_rules ar ON ar.id = ah.rule_id
      WHERE ah.rule_id = ?
      ORDER BY ah.triggered_at DESC
    `).all(id) as any[];

    res.json(history.map(mapHistoryRow));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alert history' });
  }
});

router.post('/alerts/check', (req, res) => {
  try {
    const enabledRules = db.prepare('SELECT * FROM alert_rules WHERE enabled = 1').all() as any[];
    const triggeredAlerts: any[] = [];
    const now = new Date().toISOString();

    const insertHistory = db.prepare(`
      INSERT INTO alert_history (id, rule_id, triggered_at, metric_value, threshold, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateLastTriggered = db.prepare(`
      UPDATE alert_rules SET last_triggered = ?, updated_at = ? WHERE id = ?
    `);

    const checkAndTrigger = db.transaction(() => {
      for (const rule of enabledRules) {
        let actualValue = 0;
        let exceeded = false;
        let message = '';

        switch (rule.type) {
          case 'response_time': {
            const windowMinutes = rule.window;
            const result = db.prepare(`
              SELECT AVG(response_time) as avg_response_time
              FROM api_logs
              WHERE created_at >= datetime('now', '-' || ? || ' minutes')
            `).get(windowMinutes) as any;
            actualValue = Math.round((result?.avg_response_time || 0) * 100) / 100;
            exceeded = actualValue > rule.threshold;
            message = `Response time ${actualValue}ms exceeds threshold ${rule.threshold}ms`;
            break;
          }
          case 'error_rate': {
            const windowMinutes = rule.window;
            const result = db.prepare(`
              SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
              FROM api_logs
              WHERE created_at >= datetime('now', '-' || ? || ' minutes')
            `).get(windowMinutes) as any;
            actualValue = result?.total > 0
              ? Math.round((result.errors / result.total) * 10000) / 100
              : 0;
            exceeded = actualValue > rule.threshold;
            message = `Error rate ${actualValue}% exceeds threshold ${rule.threshold}%`;
            break;
          }
          case 'health_check': {
            try {
              const start = Date.now();
              db.prepare('SELECT 1').get();
              actualValue = Date.now() - start;
              exceeded = actualValue > rule.threshold;
              message = exceeded
                ? `Health check response time ${actualValue}ms exceeds threshold ${rule.threshold}ms`
                : '';
            } catch {
              actualValue = -1;
              exceeded = true;
              message = 'Health check failed - database unreachable';
            }
            break;
          }
        }

        if (exceeded) {
          const historyId = uuidv4();
          insertHistory.run(historyId, rule.id, now, actualValue, rule.threshold, message);
          updateLastTriggered.run(now, now, rule.id);

          triggeredAlerts.push({
            id: historyId,
            alertId: rule.id,
            alertName: rule.name,
            type: rule.type,
            threshold: rule.threshold,
            actualValue,
            triggeredAt: now,
            message,
          });
        }
      }
    });

    checkAndTrigger();

    res.json({
      checkedRules: enabledRules.length,
      triggeredCount: triggeredAlerts.length,
      triggeredAlerts,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check alerts' });
  }
});

router.get('/dashboard', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    let dbStatus = 'ok';
    let dbResponseTime = 0;
    try {
      const start = Date.now();
      db.prepare('SELECT 1').get();
      dbResponseTime = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    const health = {
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      uptimeFormatted: formatUptime(uptime),
      database: {
        status: dbStatus,
        responseTime: dbResponseTime,
      },
      memory: {
        rss: formatBytes(memUsage.rss),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsed: formatBytes(memUsage.heapUsed),
        external: formatBytes(memUsage.external),
        heapUsagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
    };

    const totalRequests = db.prepare('SELECT COUNT(*) as count FROM api_logs').get() as any;
    const avgResponseTime = db.prepare('SELECT AVG(response_time) as avg FROM api_logs').get() as any;
    const errorCount = db.prepare('SELECT COUNT(*) as count FROM api_logs WHERE status_code >= 400').get() as any;

    const metrics = {
      totalRequests: totalRequests.count,
      avgResponseTime: Math.round((avgResponseTime.avg || 0) * 100) / 100,
      errorRate: totalRequests.count > 0
        ? Math.round((errorCount.count / totalRequests.count) * 10000) / 100
        : 0,
      errorCount: errorCount.count,
    };

    const recentAlerts = db.prepare(`
      SELECT ah.*, ar.name as alert_name, ar.type as alert_type
      FROM alert_history ah
      JOIN alert_rules ar ON ar.id = ah.rule_id
      ORDER BY ah.triggered_at DESC
      LIMIT 10
    `).all() as any[];

    const alertRulesCount = (db.prepare('SELECT COUNT(*) as count FROM alert_rules').get() as any).count;
    const enabledAlertRulesCount = (db.prepare('SELECT COUNT(*) as count FROM alert_rules WHERE enabled = 1').get() as any).count;

    res.json({
      health,
      metrics,
      recentAlerts: recentAlerts.map(mapHistoryRow),
      alertRulesCount,
      enabledAlertRulesCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default router;
