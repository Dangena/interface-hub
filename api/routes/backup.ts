import { Router } from 'express';
import { pool, query } from '../database.js';
import { authenticateToken, requireAdmin } from './auth';

const router = Router();

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const backup = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        interfaces: (await query('SELECT * FROM interfaces')).rows,
        parameters: (await query('SELECT * FROM parameters')).rows,
        data_models: (await query('SELECT * FROM data_models')).rows,
        fields: (await query('SELECT * FROM fields')).rows,
        field_mappings: (await query('SELECT * FROM field_mappings')).rows,
        mock_configs: (await query('SELECT * FROM mock_configs')).rows,
        api_logs: (await query('SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 1000')).rows,
        change_history: (await query('SELECT * FROM change_history')).rows,
        interface_versions: (await query('SELECT * FROM interface_versions')).rows,
        projects: (await query('SELECT * FROM projects')).rows,
        approvals: (await query('SELECT * FROM approvals')).rows,
        webhooks: (await query('SELECT * FROM webhooks')).rows,
        notifications: (await query('SELECT * FROM notifications')).rows,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="interface-hub-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

router.post('/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'No backup data provided' });
    }

    const tables = [
      { name: 'interfaces', data: data.interfaces },
      { name: 'parameters', data: data.parameters },
      { name: 'data_models', data: data.data_models },
      { name: 'fields', data: data.fields },
      { name: 'field_mappings', data: data.field_mappings },
      { name: 'mock_configs', data: data.mock_configs },
      { name: 'change_history', data: data.change_history },
      { name: 'interface_versions', data: data.interface_versions },
      { name: 'projects', data: data.projects },
      { name: 'approvals', data: data.approvals },
      { name: 'webhooks', data: data.webhooks },
      { name: 'notifications', data: data.notifications },
    ];

    let restored = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const table of tables) {
        if (!table.data || !Array.isArray(table.data)) continue;

        await client.query(`DELETE FROM ${table.name}`);

        if (table.data.length === 0) continue;

        const sample = table.data[0];
        const columns = Object.keys(sample);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        for (const row of table.data) {
          const values = columns.map((col) => row[col] ?? null);
          await client.query(
            `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          restored++;
        }
      }

      await client.query('COMMIT');
    } catch (_e: any) {
      await client.query('ROLLBACK');
      throw _e;
    } finally {
      client.release();
    }

    res.json({ success: true, restored, message: `成功恢复 ${restored} 条记录` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore backup', details: (error as Error).message });
  }
});

export default router;
