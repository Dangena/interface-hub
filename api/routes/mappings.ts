import { Router } from 'express';
import db from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/', (req, res) => {
  try {
    const { interfaceId, interfaceField, modelName, modelField } = req.body;

    const existing = db.prepare(`
      SELECT * FROM field_mappings
      WHERE interface_id = ? AND interface_field = ? AND model_name = ? AND model_field = ?
    `).get(interfaceId, interfaceField, modelName, modelField);

    if (existing) {
      return res.status(400).json({ error: 'Mapping already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, interfaceId, interfaceField, modelName, modelField, now);

    const mapping = db.prepare('SELECT * FROM field_mappings WHERE id = ?').get(id);

    res.status(201).json(mapping);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mapping' });
  }
});

router.get('/interface/:interfaceId', (req, res) => {
  try {
    const { interfaceId } = req.params;
    const mappings = db.prepare(`
      SELECT fm.*, dm.table_name, f.column_name as model_column, f.type as model_type
      FROM field_mappings fm
      JOIN data_models dm ON fm.model_name = dm.name
      LEFT JOIN fields f ON fm.model_field = f.name AND f.model_name = fm.model_name
      WHERE fm.interface_id = ?
    `).all(interfaceId);

    res.json(mappings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

router.get('/model/:modelName', (req, res) => {
  try {
    const { modelName } = req.params;
    const mappings = db.prepare(`
      SELECT fm.*, i.name as interface_name, i.path as interface_path, i.method
      FROM field_mappings fm
      JOIN interfaces i ON fm.interface_id = i.id
      WHERE fm.model_name = ?
    `).all(modelName);

    res.json(mappings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM field_mappings WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    db.prepare('DELETE FROM field_mappings WHERE id = ?').run(id);

    res.json({ message: 'Mapping deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

export default router;
