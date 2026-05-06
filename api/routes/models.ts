import { Router } from 'express';
import db from './database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  try {
    const models = db.prepare('SELECT * FROM data_models ORDER BY updated_at DESC').all();

    const formattedModels = models.map((model: any) => {
      const fields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(model.name);
      return {
        ...model,
        fields: fields.map((field: any) => ({
          ...field,
          nullable: Boolean(field.nullable),
          primaryKey: Boolean(field.primary_key),
        })),
      };
    });

    res.json(formattedModels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

router.get('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const model = db.prepare('SELECT * FROM data_models WHERE name = ?').get(name);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const fields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(name);

    const mappings = db.prepare(`
      SELECT fm.*, i.name as interface_name, i.path as interface_path
      FROM field_mappings fm
      JOIN interfaces i ON fm.interface_id = i.id
      WHERE fm.model_name = ?
    `).all(name);

    res.json({
      ...model,
      fields: fields.map((field: any) => ({
        ...field,
        nullable: Boolean(field.nullable),
        primaryKey: Boolean(field.primary_key),
      })),
      mappings,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch model' });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, tableName, description, fields } = req.body;

    const existing = db.prepare('SELECT * FROM data_models WHERE name = ?').get(name);
    if (existing) {
      return res.status(400).json({ error: 'Model with this name already exists' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO data_models (name, table_name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, tableName, description, now, now);

    if (fields && Array.isArray(fields)) {
      const insertField = db.prepare(`
        INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      fields.forEach((field: any) => {
        insertField.run(
          uuidv4(),
          name,
          field.name,
          field.columnName,
          field.type,
          field.nullable ? 1 : 0,
          field.primaryKey ? 1 : 0,
          field.defaultValue || null,
          field.comment || null
        );
      });
    }

    const model = db.prepare('SELECT * FROM data_models WHERE name = ?').get(name);
    const modelFields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(name);

    res.status(201).json({
      ...model,
      fields: modelFields.map((field: any) => ({
        ...field,
        nullable: Boolean(field.nullable),
        primaryKey: Boolean(field.primary_key),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create model' });
  }
});

router.put('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { tableName, description, fields } = req.body;

    const existing = db.prepare('SELECT * FROM data_models WHERE name = ?').get(name);
    if (!existing) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE data_models
      SET table_name = ?, description = ?, updated_at = ?
      WHERE name = ?
    `).run(tableName, description, now, name);

    if (fields !== undefined && Array.isArray(fields)) {
      db.prepare('DELETE FROM fields WHERE model_name = ?').run(name);

      const insertField = db.prepare(`
        INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      fields.forEach((field: any) => {
        insertField.run(
          uuidv4(),
          name,
          field.name,
          field.columnName,
          field.type,
          field.nullable ? 1 : 0,
          field.primaryKey ? 1 : 0,
          field.defaultValue || null,
          field.comment || null
        );
      });
    }

    const model = db.prepare('SELECT * FROM data_models WHERE name = ?').get(name);
    const modelFields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(name);

    res.json({
      ...model,
      fields: modelFields.map((field: any) => ({
        ...field,
        nullable: Boolean(field.nullable),
        primaryKey: Boolean(field.primary_key),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update model' });
  }
});

router.delete('/:name', (req, res) => {
  try {
    const { name } = req.params;

    const existing = db.prepare('SELECT * FROM data_models WHERE name = ?').get(name);
    if (!existing) {
      return res.status(404).json({ error: 'Model not found' });
    }

    db.prepare('DELETE FROM data_models WHERE name = ?').run(name);

    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

export default router;
