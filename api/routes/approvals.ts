import { Router } from 'express';
import { query } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from './auth';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    const { status } = req.query;

    let whereClause: string;
    const params: any[] = [];
    let paramIdx = 1;

    if (role === 'admin') {
      whereClause = '1=1';
    } else {
      whereClause = `requester_id = $${paramIdx++}`;
      params.push(userId);
    }

    if (status) {
      whereClause += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    const { rows: approvals } = await query(
      `SELECT * FROM approvals WHERE ${whereClause} ORDER BY created_at DESC LIMIT 50`,
      params
    );

    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const userName = (req as any).user?.email || 'unknown';
    const { type, referenceId, reference_id, title, description } = req.body;
    const refId = referenceId || reference_id;

    if (!type || !refId || !title) {
      return res.status(400).json({ error: 'type, referenceId and title are required' });
    }

    const { rows: existingRows } = await query(
      'SELECT id FROM approvals WHERE reference_id = $1 AND status = $2',
      [refId, 'pending']
    );

    if (existingRows[0]) {
      return res.status(409).json({ error: '该资源已有待审批的申请' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO approvals (id, type, reference_id, title, description, status, requester_id, requester_name, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
    `, [id, type, refId, title, description || '', userId, userName, now]);

    const { rows: admins } = await query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      if (admin.id !== userId) {
        await query(`
          INSERT INTO notifications (id, user_id, type, title, message, reference_id, created_at)
          VALUES ($1, $2, 'approval', $3, $4, $5, $6)
        `, [uuidv4(), admin.id, '新的审批请求', `${userName} 提交了审批: ${title}`, id, now]);
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

router.put('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reviewerId = (req as any).user?.userId;
    const reviewerName = (req as any).user?.email || 'admin';
    const { comment } = req.body;
    const { id } = req.params;

    const { rows: approvalRows } = await query('SELECT * FROM approvals WHERE id = $1', [id]);
    const approval = approvalRows[0] as any;
    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: '该申请已处理' });
    }

    const now = new Date().toISOString();
    await query(`
      UPDATE approvals SET status = 'approved', reviewer_id = $1, reviewer_name = $2, review_comment = $3, reviewed_at = $4
      WHERE id = $5
    `, [reviewerId, reviewerName, comment || '', now, id]);

    if (approval.type === 'publish' && approval.reference_id) {
      await query("UPDATE interfaces SET status = 'published', updated_at = $1 WHERE id = $2", [now, approval.reference_id]);
    }

    await query(`
      INSERT INTO notifications (id, user_id, type, title, message, reference_id, created_at)
      VALUES ($1, $2, 'approval', $3, $4, $5, $6)
    `, [uuidv4(), approval.requester_id, '审批已通过', `你的申请 "${approval.title}" 已通过`, id, now]);

    res.json({ message: '审批已通过' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve' });
  }
});

router.put('/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reviewerId = (req as any).user?.userId;
    const reviewerName = (req as any).user?.email || 'admin';
    const { comment } = req.body;
    const { id } = req.params;

    const { rows: approvalRows } = await query('SELECT * FROM approvals WHERE id = $1', [id]);
    const approval = approvalRows[0] as any;
    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: '该申请已处理' });
    }

    const now = new Date().toISOString();
    await query(`
      UPDATE approvals SET status = 'rejected', reviewer_id = $1, reviewer_name = $2, review_comment = $3, reviewed_at = $4
      WHERE id = $5
    `, [reviewerId, reviewerName, comment || '', now, id]);

    await query(`
      INSERT INTO notifications (id, user_id, type, title, message, reference_id, created_at)
      VALUES ($1, $2, 'approval', $3, $4, $5, $6)
    `, [uuidv4(), approval.requester_id, '审批已拒绝', `你的申请 "${approval.title}" 已被拒绝`, id, now]);

    res.json({ message: '审批已拒绝' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject' });
  }
});

export default router;
