import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from './auth';

const router = Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    const { status } = req.query;

    let whereClause = role === 'admin' ? '1=1' : 'requester_id = ?';
    const params: any[] = role === 'admin' ? [] : [userId];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const approvals = db.prepare(
      `SELECT * FROM approvals WHERE ${whereClause} ORDER BY created_at DESC LIMIT 50`
    ).all(...params) as any[];

    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

router.post('/', authenticateToken, (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const userName = (req as any).user?.email || 'unknown';
    const { type, referenceId, reference_id, title, description } = req.body;
    const refId = referenceId || reference_id;

    if (!type || !refId || !title) {
      return res.status(400).json({ error: 'type, referenceId and title are required' });
    }

    const existing = db.prepare(
      'SELECT id FROM approvals WHERE reference_id = ? AND status = ?'
    ).get(refId, 'pending') as any;

    if (existing) {
      return res.status(409).json({ error: '该资源已有待审批的申请' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO approvals (id, type, reference_id, title, description, status, requester_id, requester_name, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, type, refId, title, description || '', userId, userName, now);

    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as any[];
    for (const admin of admins) {
      if (admin.id !== userId) {
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, message, reference_id, created_at)
          VALUES (?, ?, 'approval', ?, ?, ?, ?)
        `).run(uuidv4(), admin.id, '新的审批请求', `${userName} 提交了审批: ${title}`, id, now);
      }
    }

    res.status(201).json({
      id, type, reference_id: refId, title, description,
      status: 'pending', requester_id: userId, requester_name: userName, created_at: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create approval' });
  }
});

router.put('/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  try {
    const reviewerId = (req as any).user?.userId;
    const reviewerName = (req as any).user?.email || 'admin';
    const { comment } = req.body;
    const { id } = req.params;

    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as any;
    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: '该申请已处理' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE approvals SET status = 'approved', reviewer_id = ?, reviewer_name = ?, review_comment = ?, reviewed_at = ?
      WHERE id = ?
    `).run(reviewerId, reviewerName, comment || '', now, id);

    if (approval.type === 'publish' && approval.reference_id) {
      db.prepare("UPDATE interfaces SET status = 'published', updated_at = ? WHERE id = ?").run(now, approval.reference_id);
    }

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, reference_id, created_at)
      VALUES (?, ?, 'approval', ?, ?, ?, ?)
    `).run(uuidv4(), approval.requester_id, '审批已通过', `你的申请 "${approval.title}" 已通过`, id, now);

    res.json({ message: '审批已通过' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve' });
  }
});

router.put('/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  try {
    const reviewerId = (req as any).user?.userId;
    const reviewerName = (req as any).user?.email || 'admin';
    const { comment } = req.body;
    const { id } = req.params;

    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as any;
    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: '该申请已处理' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE approvals SET status = 'rejected', reviewer_id = ?, reviewer_name = ?, review_comment = ?, reviewed_at = ?
      WHERE id = ?
    `).run(reviewerId, reviewerName, comment || '', now, id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, reference_id, created_at)
      VALUES (?, ?, 'approval', ?, ?, ?, ?)
    `).run(uuidv4(), approval.requester_id, '审批已拒绝', `你的申请 "${approval.title}" 已被拒绝`, id, now);

    res.json({ message: '审批已拒绝' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject' });
  }
});

export default router;
