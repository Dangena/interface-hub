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

    const recentLogs = db.prepare(`
      SELECT * FROM api_logs
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    res.json({
      totalInterfaces: totalInterfaces.count,
      totalModels: totalModels.count,
      totalMappings: totalMappings.count,
      publishedInterfaces: publishedInterfaces.count,
      draftInterfaces: draftInterfaces.count,
      deprecatedInterfaces: deprecatedInterfaces.count,
      recentLogs,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
