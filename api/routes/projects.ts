import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  try {
    const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as any[];

    const enriched = projects.map((project) => {
      const interfaceCount = db.prepare('SELECT COUNT(*) as count FROM interfaces WHERE category = ?').get(project.name) as any;
      return { ...project, interfaceCount: interfaceCount?.count || 0 };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO projects (id, name, description, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, description || '', color || '#3B82F6', now, now);

    res.status(201).json({ id, name, description: description || '', color: color || '#3B82F6', created_at: now, updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE projects SET name = ?, description = ?, color = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description || '', color || '#3B82F6', now, id);

    res.json({ id, name, description: description || '', color: color || '#3B82F6', updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
