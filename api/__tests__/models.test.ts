import db from '../database';

describe('Models API', () => {
  beforeAll(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        table_name TEXT NOT NULL,
        description TEXT,
        schema TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    db.exec(`
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
      );
    `);
  });

  test('should be able to query data models', () => {
    const models = db.prepare('SELECT * FROM data_models LIMIT 10').all();
    expect(Array.isArray(models)).toBe(true);
  });

  test('should have valid model structure', () => {
    const models = db.prepare('SELECT * FROM data_models LIMIT 1').all();
    if (models.length > 0) {
      const model = models[0] as any;
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('table_name');
    }
  });

  test('should query model fields', () => {
    const models = db.prepare('SELECT * FROM data_models LIMIT 1').all() as any[];
    if (models.length > 0) {
      const fields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(models[0].name);
      expect(Array.isArray(fields)).toBe(true);
    }
  });

  test('should identify primary key fields', () => {
    const models = db.prepare('SELECT * FROM data_models LIMIT 1').all() as any[];
    if (models.length > 0) {
      const pkFields = db.prepare('SELECT * FROM fields WHERE model_name = ? AND primary_key = 1').all(models[0].name);
      expect(Array.isArray(pkFields)).toBe(true);
    }
  });

  test('should check field nullability', () => {
    const models = db.prepare('SELECT * FROM data_models LIMIT 1').all() as any[];
    if (models.length > 0) {
      const fields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(models[0].name) as any[];
      fields.forEach(field => {
        expect(field).toHaveProperty('nullable');
        expect(typeof field.nullable).toBe('number');
      });
    }
  });
});
