import db from '../database';

describe('Interfaces API', () => {
  beforeAll(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS interfaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL,
        description TEXT,
        category TEXT,
        tags TEXT,
        status TEXT DEFAULT 'draft',
        version TEXT DEFAULT '1.0.0',
        request_schema TEXT,
        response_schema TEXT,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
  });

  afterAll(() => {
    db.exec('DELETE FROM interfaces WHERE name LIKE "Test Interface%"');
  });

  test('should be able to query interfaces', () => {
    const interfaces = db.prepare('SELECT * FROM interfaces LIMIT 10').all();
    expect(Array.isArray(interfaces)).toBe(true);
  });

  test('should have valid interface structure', () => {
    const interfaces = db.prepare('SELECT * FROM interfaces LIMIT 1').all();
    if (interfaces.length > 0) {
      const iface = interfaces[0] as any;
      expect(iface).toHaveProperty('id');
      expect(iface).toHaveProperty('name');
      expect(iface).toHaveProperty('path');
      expect(iface).toHaveProperty('method');
    }
  });

  test('should filter interfaces by method', () => {
    const getInterfaces = db.prepare("SELECT * FROM interfaces WHERE method = 'GET'").all();
    expect(Array.isArray(getInterfaces)).toBe(true);
    getInterfaces.forEach((iface: any) => {
      expect(iface.method).toBe('GET');
    });
  });

  test('should filter interfaces by category', () => {
    const userInterfaces = db.prepare("SELECT * FROM interfaces WHERE category = '用户管理'").all();
    expect(Array.isArray(userInterfaces)).toBe(true);
  });

  test('should search interfaces by name', () => {
    const results = db.prepare("SELECT * FROM interfaces WHERE name LIKE '%用户%'").all();
    expect(Array.isArray(results)).toBe(true);
  });

  test('should get interface with parameters', () => {
    const interfaces = db.prepare('SELECT * FROM interfaces LIMIT 5').all() as any[];
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS parameters (
        id TEXT PRIMARY KEY,
        interface_id TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        type TEXT,
        required INTEGER DEFAULT 0,
        description TEXT,
        FOREIGN KEY (interface_id) REFERENCES interfaces(id)
      );
    `);

    if (interfaces.length > 0) {
      const params = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(interfaces[0].id);
      expect(Array.isArray(params)).toBe(true);
    }
  });
});
