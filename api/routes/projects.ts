import { Router } from 'express';
import { query } from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows: projects } = await query('SELECT * FROM projects ORDER BY updated_at DESC');

    const enriched = [];
    for (const project of projects) {
      const { rows: countRows } = await query('SELECT COUNT(*) as count FROM interfaces WHERE category = $1', [project.name]);
      enriched.push({ ...project, interfaceCount: (countRows[0] as any)?.count || 0 });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO projects (id, name, description, color, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, name, description || '', color || '#3B82F6', now, now]);

    res.status(201).json({ id, name, description: description || '', color: color || '#3B82F6', created_at: now, updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const now = new Date().toISOString();
    await query(`
      UPDATE projects SET name = $1, description = $2, color = $3, updated_at = $4
      WHERE id = $5
    `, [name, description || '', color || '#3B82F6', now, id]);

    res.json({ id, name, description: description || '', color: color || '#3B82F6', updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await query('DELETE FROM projects WHERE id = $1', [id]);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
