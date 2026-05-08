import { Router } from 'express';
import { query } from '../database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const totalInterfaces = (await query('SELECT COUNT(*) as count FROM interfaces')).rows[0] as any;
    const totalModels = (await query('SELECT COUNT(*) as count FROM data_models')).rows[0] as any;
    const totalMappings = (await query('SELECT COUNT(*) as count FROM field_mappings')).rows[0] as any;

    const publishedInterfaces = (await query("SELECT COUNT(*) as count FROM interfaces WHERE status = 'published'")).rows[0] as any;
    const draftInterfaces = (await query("SELECT COUNT(*) as count FROM interfaces WHERE status = 'draft'")).rows[0] as any;
    const deprecatedInterfaces = (await query("SELECT COUNT(*) as count FROM interfaces WHERE status = 'deprecated'")).rows[0] as any;

    const categoryStats = (await query(`
      SELECT category, COUNT(*) as count FROM interfaces
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category ORDER BY count DESC LIMIT 10
    `)).rows as any[];

    const methodStats = (await query(`
      SELECT method, COUNT(*) as count FROM interfaces GROUP BY method ORDER BY count DESC
    `)).rows as any[];

    const totalParameters = (await query('SELECT COUNT(*) as count FROM parameters')).rows[0] as any;
    const totalMockConfigs = (await query('SELECT COUNT(*) as count FROM mock_configs')).rows[0] as any;

    const recentChanges = (await query(`
      SELECT ch.*, i.name as interface_name
      FROM change_history ch
      LEFT JOIN interfaces i ON ch.interface_id = i.id
      ORDER BY ch.created_at DESC
      LIMIT 10
    `)).rows as any[];

    const recentInterfaces = (await query(`
      SELECT id, name, path, method, status, category, updated_at
      FROM interfaces ORDER BY updated_at DESC LIMIT 5
    `)).rows as any[];

    const recentLogs = (await query(`
      SELECT * FROM api_logs
      ORDER BY created_at DESC
      LIMIT 10
    `)).rows;

    res.json({
      totalInterfaces: totalInterfaces.count,
      totalModels: totalModels.count,
      totalMappings: totalMappings.count,
      totalParameters: totalParameters.count,
      totalMockConfigs: totalMockConfigs.count,
      publishedInterfaces: publishedInterfaces.count,
      draftInterfaces: draftInterfaces.count,
      deprecatedInterfaces: deprecatedInterfaces.count,
      categoryStats,
      methodStats,
      recentChanges,
      recentInterfaces,
      recentLogs,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
