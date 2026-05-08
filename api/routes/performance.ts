import { Router } from 'express';
import { performanceMonitor, getCacheStats } from '../utils/performance';
import { cacheManager } from '../utils/cache';

const router = Router();

router.get('/stats', (req, res) => {
  try {
    const summary = performanceMonitor.getSummary();
    const cacheStats = cacheManager.getStats();
    
    res.json({
      performance: summary,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get performance stats' });
  }
});

router.get('/metrics', (req, res) => {
  try {
    const { path, method, limit } = req.query;
    let metrics = performanceMonitor.getMetrics(
      path as string | undefined,
      method as string | undefined
    );
    
    if (limit) {
      metrics = metrics.slice(-parseInt(limit as string));
    }
    
    res.json({
      metrics,
      count: metrics.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

router.get('/slowest', (req, res) => {
  try {
    const { limit } = req.query;
    const slowest = performanceMonitor.getSlowestEndpoints(
      limit ? parseInt(limit as string) : 10
    );
    
    res.json({
      slowestEndpoints: slowest,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get slowest endpoints' });
  }
});

router.delete('/metrics', (req, res) => {
  try {
    performanceMonitor.clear();
    res.json({ message: 'Performance metrics cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear metrics' });
  }
});

router.get('/cache', (req, res) => {
  try {
    const stats = cacheManager.getStats();
    const perfSummary = performanceMonitor.getSummary();
    const overall = perfSummary.overallStats;
    
    res.json({
      totalEntries: stats.total,
      validEntries: stats.valid,
      hitRate: overall.count > 0 ? (stats.valid / (stats.total || 1)) : 0,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

router.delete('/cache', (req, res) => {
  try {
    cacheManager.clear();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
