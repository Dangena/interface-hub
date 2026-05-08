import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'interface-hub-secret-key-2026';
const JWT_EXPIRES_IN = '7d';

function generateToken(userId: string, email: string, role: string): string {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      res.status(400).json({ error: '邮箱、用户名和密码不能为空' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: '密码长度不能少于6位' });
      return;
    }

    const { rows: existingRows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingRows[0]) {
      res.status(409).json({ error: '该邮箱已被注册' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'developer', $5, $6)
    `, [id, email, name, passwordHash, now, now]);

    const token = generateToken(id, email, 'developer');

    res.status(201).json({
      token,
      user: { id, email, name, role: 'developer' },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: '邮箱和密码不能为空' });
      return;
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0] as any;
    if (!user) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    const token = generateToken(user.id, user.email, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

router.post('/logout', (req: Request, res: Response): void => {
  res.json({ message: '已成功登出' });
});

router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { rows } = await query('SELECT id, email, name, role, avatar, created_at FROM users WHERE id = $1', [userId]);
    const user = rows[0] as any;

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

router.put('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { name, avatar } = req.body;

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (name) { updates.push(`name = $${paramIdx++}`); values.push(name); }
    if (avatar) { updates.push(`avatar = $${paramIdx++}`); values.push(avatar); }

    if (updates.length === 0) {
      res.status(400).json({ error: '没有需要更新的字段' });
      return;
    }

    updates.push(`updated_at = $${paramIdx++}`);
    values.push(now);
    values.push(userId);

    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx++}`, values);

    const { rows } = await query('SELECT id, email, name, role, avatar FROM users WHERE id = $1', [userId]);
    res.json({ user: rows[0] });
  } catch (error) {
    res.status(500).json({ error: '更新个人信息失败' });
  }
});

router.put('/change-password', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: '当前密码和新密码不能为空' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: '新密码长度不能少于6位' });
      return;
    }

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const user = rows[0] as any;
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: '当前密码错误' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    const now = new Date().toISOString();

    await query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [passwordHash, now, userId]);

    res.json({ message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

export function authenticateToken(req: Request, res: Response, next: any): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: '认证令牌无效或已过期' });
  }
}

export function optionalAuth(req: Request, res: Response, next: any): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (req as any).user = decoded;
    } catch (_e) {}
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: any): void {
  const role = (req as any).user?.role;
  if (role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }
  next();
}

router.get('/users', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query('SELECT id, email, name, role, avatar, created_at, updated_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

router.put('/users/:id/role', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'developer', 'viewer'].includes(role)) {
      res.status(400).json({ error: '无效的角色' });
      return;
    }

    const currentUserId = (req as any).user?.userId;
    if (id === currentUserId) {
      res.status(400).json({ error: '不能修改自己的角色' });
      return;
    }

    const { rows: existingRows } = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (!existingRows[0]) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    await query('UPDATE users SET role = $1, updated_at = $2 WHERE id = $3', [role, new Date().toISOString(), id]);
    res.json({ message: '角色更新成功' });
  } catch (error) {
    res.status(500).json({ error: '更新角色失败' });
  }
});

router.delete('/users/:id', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const currentUserId = (req as any).user?.userId;

    if (id === currentUserId) {
      res.status(400).json({ error: '不能删除自己' });
      return;
    }

    const { rows: existingRows } = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (!existingRows[0]) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: '用户已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除用户失败' });
  }
});

router.post('/users/invite', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, role } = req.body;

    if (!email || !name) {
      res.status(400).json({ error: '邮箱和用户名不能为空' });
      return;
    }

    const { rows: existingRows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingRows[0]) {
      res.status(409).json({ error: '该邮箱已被注册' });
      return;
    }

    const tempPassword = Math.random().toString(36).slice(-12) + 'Aa1!';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, email, name, passwordHash, role || 'developer', now, now]);

    res.status(201).json({
      user: { id, email, name, role: role || 'developer' },
      tempPassword,
    });
  } catch (error) {
    res.status(500).json({ error: '邀请用户失败' });
  }
});

export default router;
