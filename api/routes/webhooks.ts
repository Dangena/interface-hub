import { Router } from 'express';
import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from './auth';
import { cacheManager } from '../utils/cache';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const webhooks = (await query('SELECT * FROM webhooks ORDER BY created_at DESC')).rows as any[];
    res.json(webhooks.map(w => ({ ...w, events: JSON.parse(w.events), enabled: Boolean(w.enabled) })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    if (!name || !url || !events?.length) {
      return res.status(400).json({ error: 'name, url and events are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO webhooks (id, name, url, events, secret, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 1, $6, $7)
    `, [id, name, url, JSON.stringify(events), secret || '', now, now]);

    res.status(201).json({ id, name, url, events, enabled: true, created_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, events, secret, enabled } = req.body;

    const existing = (await query('SELECT * FROM webhooks WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const now = new Date().toISOString();
    await query(`
      UPDATE webhooks SET name = $1, url = $2, events = $3, secret = $4, enabled = $5, updated_at = $6
      WHERE id = $7
    `, [
      name || (existing as any).name,
      url || (existing as any).url,
      JSON.stringify(events || JSON.parse((existing as any).events)),
      secret !== undefined ? secret : (existing as any).secret,
      enabled !== undefined ? (enabled ? 1 : 0) : (existing as any).enabled,
      now, id
    ]);

    res.json({ message: 'Webhook updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM webhooks WHERE id = $1', [id]);
    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

router.post('/:id/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const webhook = (await query('SELECT * FROM webhooks WHERE id = $1', [id])).rows[0] as any;
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

export async function triggerWebhooks(event: string, data: any): Promise<void> {
  try {
    const webhooks = (await query('SELECT * FROM webhooks WHERE enabled = 1')).rows as any[];
    const matchingWebhooks = webhooks.filter(w => {
      try {
        const events = JSON.parse(w.events);
        return events.includes(event) || events.includes('*');
      } catch (_e) { return false; }
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
  } catch (_e) {}
}

export default router;
