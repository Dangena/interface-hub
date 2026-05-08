import { Router } from 'express';
import db from '../database';
import { authenticateToken, requireAdmin } from './auth';

const router = Router();

router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const backup = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        interfaces: db.prepare('SELECT * FROM interfaces').all(),
        parameters: db.prepare('SELECT * FROM parameters').all(),
        data_models: db.prepare('SELECT * FROM data_models').all(),
        fields: db.prepare('SELECT * FROM fields').all(),
        field_mappings: db.prepare('SELECT * FROM field_mappings').all(),
        mock_configs: db.prepare('SELECT * FROM mock_configs').all(),
        api_logs: db.prepare('SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 1000').all(),
        change_history: db.prepare('SELECT * FROM change_history').all(),
        interface_versions: db.prepare('SELECT * FROM interface_versions').all(),
        projects: db.prepare('SELECT * FROM projects').all(),
        approvals: db.prepare('SELECT * FROM approvals').all(),
        webhooks: db.prepare('SELECT * FROM webhooks').all(),
        notifications: db.prepare('SELECT * FROM notifications').all(),
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="interface-hub-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

router.post('/restore', authenticateToken, requireAdmin, (req, res) => {
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

    for (const table of tables) {
      if (!table.data || !Array.isArray(table.data)) continue;

      db.prepare(`DELETE FROM ${table.name}`).run();

      if (table.data.length === 0) continue;

      const sample = table.data[0];
      const columns = Object.keys(sample);
      const placeholders = columns.map(() => '?').join(', ');
      const insertStmt = db.prepare(`INSERT OR IGNORE INTO ${table.name} (${columns.join(', ')}) VALUES (${placeholders})`);

      const transaction = db.transaction(() => {
        for (const row of table.data) {
          const values = columns.map((col) => row[col] ?? null);
          insertStmt.run(...values);
          restored++;
        }
      });
      transaction();
    }

    res.json({ success: true, restored, message: `成功恢复 ${restored} 条记录` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore backup', details: (error as Error).message });
  }
});

export default router;
