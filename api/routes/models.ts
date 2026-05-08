import { Router } from 'express';
import { pool, query } from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows: models } = await query('SELECT * FROM data_models ORDER BY updated_at DESC');

    const formattedModels = [];
    for (const model of models) {
      const { rows: fields } = await query('SELECT * FROM fields WHERE model_name = $1', [model.name]);
      formattedModels.push({
        ...model,
        fields: fields.map((field: any) => ({
          ...field,
          nullable: Boolean(field.nullable),
          primaryKey: Boolean(field.primary_key),
        })),
      });
    }

    res.json(formattedModels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { rows: modelRows } = await query('SELECT * FROM data_models WHERE name = $1', [name]);
    const model = modelRows[0];

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const { rows: fields } = await query('SELECT * FROM fields WHERE model_name = $1', [name]);

    const { rows: mappings } = await query(`
      SELECT fm.*, i.name as interface_name, i.path as interface_path
      FROM field_mappings fm
      JOIN interfaces i ON fm.interface_id = i.id
      WHERE fm.model_name = $1
    `, [name]);

    res.json({
      ...(model as Record<string, any>),
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

router.post('/', async (req, res) => {
  try {
    const { name, tableName, description, fields } = req.body;

    const { rows: existingRows } = await query('SELECT * FROM data_models WHERE name = $1', [name]);
    if (existingRows[0]) {
      return res.status(400).json({ error: 'Model with this name already exists' });
    }

    const now = new Date().toISOString();

    await query(`
      INSERT INTO data_models (name, table_name, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [name, tableName, description, now, now]);

    if (fields && Array.isArray(fields)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const field of fields) {
          await client.query(`
            INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            uuidv4(),
            name,
            field.name,
            field.columnName,
            field.type,
            field.nullable ? 1 : 0,
            field.primaryKey ? 1 : 0,
            field.defaultValue || null,
            field.comment || null
          ]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    const { rows: modelRows } = await query('SELECT * FROM data_models WHERE name = $1', [name]);
    const model = modelRows[0] as Record<string, any>;
    const { rows: modelFields } = await query('SELECT * FROM fields WHERE model_name = $1', [name]);

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

router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { tableName, description, fields } = req.body;

    const { rows: existingRows } = await query('SELECT * FROM data_models WHERE name = $1', [name]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const now = new Date().toISOString();

    await query(`
      UPDATE data_models
      SET table_name = $1, description = $2, updated_at = $3
      WHERE name = $4
    `, [tableName, description, now, name]);

    if (fields !== undefined && Array.isArray(fields)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM fields WHERE model_name = $1', [name]);
        for (const field of fields) {
          await client.query(`
            INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            uuidv4(),
            name,
            field.name,
            field.columnName,
            field.type,
            field.nullable ? 1 : 0,
            field.primaryKey ? 1 : 0,
            field.defaultValue || null,
            field.comment || null
          ]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    const { rows: modelRows } = await query('SELECT * FROM data_models WHERE name = $1', [name]);
    const model = modelRows[0] as Record<string, any>;
    const { rows: modelFields } = await query('SELECT * FROM fields WHERE model_name = $1', [name]);

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

router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const { rows: existingRows } = await query('SELECT * FROM data_models WHERE name = $1', [name]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Model not found' });
    }

    await query('DELETE FROM data_models WHERE name = $1', [name]);

    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

export default router;
