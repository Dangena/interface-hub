import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from './auth';
import { cacheManager } from '../utils/cache';

const router = Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as any[];
    res.json(webhooks.map(w => ({ ...w, events: JSON.parse(w.events), enabled: Boolean(w.enabled) })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    if (!name || !url || !events?.length) {
      return res.status(400).json({ error: 'name, url and events are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO webhooks (id, name, url, events, secret, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, name, url, JSON.stringify(events), secret || '', now, now);

    res.status(201).json({ id, name, url, events, enabled: true, created_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, events, secret, enabled } = req.body;

    const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE webhooks SET name = ?, url = ?, events = ?, secret = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name || (existing as any).name,
      url || (existing as any).url,
      JSON.stringify(events || JSON.parse((existing as any).events)),
      secret !== undefined ? secret : (existing as any).secret,
      enabled !== undefined ? (enabled ? 1 : 0) : (existing as any).enabled,
      now, id
    );

    res.json({ message: 'Webhook updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

router.post('/:id/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Test webhook from Interface Hub' },
    };

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {}),
      },
      body: JSON.stringify(testPayload),
    });

    res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

export function triggerWebhooks(event: string, data: any): void {
  try {
    const webhooks = db.prepare('SELECT * FROM webhooks WHERE enabled = 1').all() as any[];
    const matchingWebhooks = webhooks.filter(w => {
      try {
        const events = JSON.parse(w.events);
        return events.includes(event) || events.includes('*');
      } catch { return false; }
    });

    for (const webhook of matchingWebhooks) {
      fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {}),
        },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
      }).catch(() => {});
    }
  } catch {}
}

export default router;
