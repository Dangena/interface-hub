import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from './auth';

const router = Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const { unreadOnly } = req.query;

    let whereClause = 'user_id = ?';
    const params: any[] = [userId];

    if (unreadOnly === 'true') {
      whereClause += ' AND read = 0';
    }

    const notifications = db.prepare(
      `SELECT * FROM notifications WHERE ${whereClause} ORDER BY created_at DESC LIMIT 50`
    ).all(...params) as any[];

    const unreadCount = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
    ).get(userId) as any;

    res.json({ data: notifications, unreadCount: unreadCount.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.put('/:id/read', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.put('/read-all', authenticateToken, (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
