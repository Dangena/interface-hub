import { Router } from 'express';
import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from './auth';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const { unreadOnly } = req.query;

    let whereClause = 'user_id = $1';
    const params: any[] = [userId];

    if (unreadOnly === 'true') {
      whereClause += ' AND read = 0';
    }

    const notifications = (await query(
      `SELECT * FROM notifications WHERE ${whereClause} ORDER BY created_at DESC LIMIT 50`,
      params
    )).rows as any[];

    const unreadCount = (await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = 0',
      [userId]
    )).rows[0] as any;

    res.json({ data: notifications, unreadCount: unreadCount.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    await query('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    await query('UPDATE notifications SET read = 1 WHERE user_id = $1', [userId]);
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
