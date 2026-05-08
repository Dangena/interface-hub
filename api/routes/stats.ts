import { Router } from 'express';
import db from '../database';

const router = Router();

router.get('/', (req, res) => {
  try {
    const totalInterfaces = db.prepare('SELECT COUNT(*) as count FROM interfaces').get() as any;
    const totalModels = db.prepare('SELECT COUNT(*) as count FROM data_models').get() as any;
    const totalMappings = db.prepare('SELECT COUNT(*) as count FROM field_mappings').get() as any;

    const publishedInterfaces = db.prepare("SELECT COUNT(*) as count FROM interfaces WHERE status = 'published'").get() as any;
    const draftInterfaces = db.prepare("SELECT COUNT(*) as count FROM interfaces WHERE status = 'draft'").get() as any;
    const deprecatedInterfaces = db.prepare("SELECT COUNT(*) as count FROM interfaces WHERE status = 'deprecated'").get() as any;

    const categoryStats = db.prepare(`
      SELECT category, COUNT(*) as count FROM interfaces
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category ORDER BY count DESC LIMIT 10
    `).all() as any[];

    const methodStats = db.prepare(`
      SELECT method, COUNT(*) as count FROM interfaces GROUP BY method ORDER BY count DESC
    `).all() as any[];

    const totalParameters = db.prepare('SELECT COUNT(*) as count FROM parameters').get() as any;
    const totalMockConfigs = db.prepare('SELECT COUNT(*) as count FROM mock_configs').get() as any;

    const recentChanges = db.prepare(`
      SELECT ch.*, i.name as interface_name
      FROM change_history ch
      LEFT JOIN interfaces i ON ch.interface_id = i.id
      ORDER BY ch.created_at DESC
      LIMIT 10
    `).all() as any[];

    const recentInterfaces = db.prepare(`
      SELECT id, name, path, method, status, category, updated_at
      FROM interfaces ORDER BY updated_at DESC LIMIT 5
    `).all() as any[];

    const recentLogs = db.prepare(`
      SELECT * FROM api_logs
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

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
