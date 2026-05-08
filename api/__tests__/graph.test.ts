import { query } from '../database.js';

describe('Graph API', () => {
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
      CREATE TABLE IF NOT EXISTS interface_model_mappings (
        id TEXT PRIMARY KEY,
        interface_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        mapping_type TEXT,
        description TEXT,
        created_at TEXT,
        FOREIGN KEY (interface_id) REFERENCES interfaces(id),
        FOREIGN KEY (model_id) REFERENCES data_models(id)
      )
    `);
  });

  test('should generate graph nodes for interfaces', async () => {
    const interfaces = (await query('SELECT * FROM interfaces LIMIT 10')).rows;
    expect(Array.isArray(interfaces)).toBe(true);

    const nodes = interfaces.map((iface: any) => ({
      id: `interface-${iface.id}`,
      type: 'interface',
      label: iface.name,
      data: {
        id: iface.id,
        name: iface.name,
        path: iface.path,
        method: iface.method,
        status: iface.status,
        category: iface.category,
      },
    }));

    expect(nodes.length).toBe(interfaces.length);
    nodes.forEach(node => {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('data');
      expect(node.type).toBe('interface');
    });
  });

  test('should generate graph nodes for database models', async () => {
    const models = (await query('SELECT * FROM data_models LIMIT 10')).rows;
    expect(Array.isArray(models)).toBe(true);

    const nodes = models.map((model: any) => ({
      id: `database-${model.id}`,
      type: 'database',
      label: model.name,
      data: {
        id: model.id,
        name: model.name,
        tableName: model.table_name,
        description: model.description,
      },
    }));

    expect(nodes.length).toBe(models.length);
    nodes.forEach(node => {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('data');
      expect(node.type).toBe('database');
    });
  });

  test('should generate graph edges from mappings', async () => {
    const mappings = (await query('SELECT * FROM interface_model_mappings')).rows;
    expect(Array.isArray(mappings)).toBe(true);

    const edges = mappings.map((mapping: any) => ({
      id: `edge-${mapping.id}`,
      source: `interface-${mapping.interface_id}`,
      target: `database-${mapping.model_id}`,
      type: mapping.mapping_type || 'uses',
      label: mapping.description,
    }));

    expect(edges.length).toBe(mappings.length);
    edges.forEach(edge => {
      expect(edge).toHaveProperty('id');
      expect(edge).toHaveProperty('source');
      expect(edge).toHaveProperty('target');
      expect(edge).toHaveProperty('type');
      expect(edge.source).toMatch(/^interface-/);
      expect(edge.target).toMatch(/^database-/);
    });
  });

  test('should create complete graph structure', async () => {
    const interfaces = (await query('SELECT * FROM interfaces LIMIT 10')).rows;
    const models = (await query('SELECT * FROM data_models LIMIT 10')).rows;
    const mappings = (await query('SELECT * FROM interface_model_mappings')).rows;

    const nodes = [
      ...interfaces.map((iface: any) => ({
        id: `interface-${iface.id}`,
        type: 'interface',
        label: iface.name,
      })),
      ...models.map((model: any) => ({
        id: `database-${model.id}`,
        type: 'database',
        label: model.name,
      })),
    ];

    const edges = mappings.map((mapping: any) => ({
      source: `interface-${mapping.interface_id}`,
      target: `database-${mapping.model_id}`,
    }));

    expect(nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(edges)).toBe(true);

    edges.forEach(edge => {
      const sourceExists = nodes.some(n => n.id === edge.source);
      const targetExists = nodes.some(n => n.id === edge.target);
      expect(sourceExists).toBe(true);
      expect(targetExists).toBe(true);
    });
  });
});
