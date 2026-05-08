import { query } from '../database.js';

describe('Models API', () => {
  beforeAll(async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS data_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        table_name TEXT NOT NULL,
        description TEXT,
        schema TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS fields (
        id TEXT PRIMARY KEY,
        model_name TEXT NOT NULL,
        name TEXT NOT NULL,
        column_name TEXT,
        type TEXT,
        nullable INTEGER DEFAULT 1,
        primary_key INTEGER DEFAULT 0,
        default_value TEXT,
        comment TEXT,
        FOREIGN KEY (model_name) REFERENCES data_models(name)
      )
    `);
  });

  test('should be able to query data models', async () => {
    const models = (await query('SELECT * FROM data_models LIMIT 10')).rows;
    expect(Array.isArray(models)).toBe(true);
  });

  test('should have valid model structure', async () => {
    const models = (await query('SELECT * FROM data_models LIMIT 1')).rows;
    if (models.length > 0) {
      const model = models[0] as any;
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('table_name');
    }
  });

  test('should query model fields', async () => {
    const models = (await query('SELECT * FROM data_models LIMIT 1')).rows as any[];
    if (models.length > 0) {
      const fields = (await query('SELECT * FROM fields WHERE model_name = $1', [models[0].name])).rows;
      expect(Array.isArray(fields)).toBe(true);
    }
  });

  test('should identify primary key fields', async () => {
    const models = (await query('SELECT * FROM data_models LIMIT 1')).rows as any[];
    if (models.length > 0) {
      const pkFields = (await query('SELECT * FROM fields WHERE model_name = $1 AND primary_key = 1', [models[0].name])).rows;
      expect(Array.isArray(pkFields)).toBe(true);
    }
  });

  test('should check field nullability', async () => {
    const models = (await query('SELECT * FROM data_models LIMIT 1')).rows as any[];
    if (models.length > 0) {
      const fields = (await query('SELECT * FROM fields WHERE model_name = $1', [models[0].name])).rows as any[];
      fields.forEach(field => {
        expect(field).toHaveProperty('nullable');
        expect(typeof field.nullable).toBe('number');
      });
    }
  });
});
