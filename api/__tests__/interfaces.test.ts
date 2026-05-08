import { query } from '../database.js';

describe('Interfaces API', () => {
  beforeAll(async () => {
    await query(`
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
      )
    `);
  });

  afterAll(async () => {
    await query("DELETE FROM interfaces WHERE name LIKE 'Test Interface%'");
  });

  test('should be able to query interfaces', async () => {
    const interfaces = (await query('SELECT * FROM interfaces LIMIT 10')).rows;
    expect(Array.isArray(interfaces)).toBe(true);
  });

  test('should have valid interface structure', async () => {
    const interfaces = (await query('SELECT * FROM interfaces LIMIT 1')).rows;
    if (interfaces.length > 0) {
      const iface = interfaces[0] as any;
      expect(iface).toHaveProperty('id');
      expect(iface).toHaveProperty('name');
      expect(iface).toHaveProperty('path');
      expect(iface).toHaveProperty('method');
    }
  });

  test('should filter interfaces by method', async () => {
    const getInterfaces = (await query("SELECT * FROM interfaces WHERE method = 'GET'")).rows;
    expect(Array.isArray(getInterfaces)).toBe(true);
    getInterfaces.forEach((iface: any) => {
      expect(iface.method).toBe('GET');
    });
  });

  test('should filter interfaces by category', async () => {
    const userInterfaces = (await query("SELECT * FROM interfaces WHERE category = '用户管理'")).rows;
    expect(Array.isArray(userInterfaces)).toBe(true);
  });

  test('should search interfaces by name', async () => {
    const results = (await query("SELECT * FROM interfaces WHERE name LIKE '%用户%'")).rows;
    expect(Array.isArray(results)).toBe(true);
  });

  test('should get interface with parameters', async () => {
    const interfaces = (await query('SELECT * FROM interfaces LIMIT 5')).rows as any[];
    
    await query(`
      CREATE TABLE IF NOT EXISTS parameters (
        id TEXT PRIMARY KEY,
        interface_id TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        type TEXT,
        required INTEGER DEFAULT 0,
        description TEXT,
        FOREIGN KEY (interface_id) REFERENCES interfaces(id)
      )
    `);

    if (interfaces.length > 0) {
      const params = (await query('SELECT * FROM parameters WHERE interface_id = $1', [interfaces[0].id])).rows;
      expect(Array.isArray(params)).toBe(true);
    }
  });
});
