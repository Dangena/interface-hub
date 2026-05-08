import { query } from './database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export async function initializeSampleData() {
  const count = (await query('SELECT COUNT(*) as count FROM interfaces')).rows[0] as any;
  
  if (count.count > 0) {
    return;
  }

  console.log('Initializing sample data...');

  const now = new Date().toISOString();

  const adminId = uuidv4();
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  await query(`
    INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [adminId, 'admin@test.com', 'Admin', hashedPassword, 'admin', now, now]);

  const interfaces = [
    {
      id: uuidv4(),
      name: '获取用户列表',
      path: '/api/v1/users',
      method: 'GET',
      description: '获取系统中所有用户的列表，支持分页和筛选',
      category: '用户管理',
      tags: JSON.stringify(['用户', '列表', '分页']),
      status: 'published',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '创建用户',
      path: '/api/v1/users',
      method: 'POST',
      description: '创建新用户账号',
      category: '用户管理',
      tags: JSON.stringify(['用户', '创建']),
      status: 'published',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '获取用户详情',
      path: '/api/v1/users/:id',
      method: 'GET',
      description: '根据ID获取用户的详细信息',
      category: '用户管理',
      tags: JSON.stringify(['用户', '详情']),
      status: 'published',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '更新用户',
      path: '/api/v1/users/:id',
      method: 'PUT',
      description: '更新用户信息',
      category: '用户管理',
      tags: JSON.stringify(['用户', '更新']),
      status: 'draft',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '删除用户',
      path: '/api/v1/users/:id',
      method: 'DELETE',
      description: '删除指定用户',
      category: '用户管理',
      tags: JSON.stringify(['用户', '删除']),
      status: 'deprecated',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '获取订单列表',
      path: '/api/v1/orders',
      method: 'GET',
      description: '获取订单列表',
      category: '订单管理',
      tags: JSON.stringify(['订单', '列表']),
      status: 'published',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '创建订单',
      path: '/api/v1/orders',
      method: 'POST',
      description: '创建新订单',
      category: '订单管理',
      tags: JSON.stringify(['订单', '创建']),
      status: 'published',
      version: '1.0.0',
    },
    {
      id: uuidv4(),
      name: '获取产品列表',
      path: '/api/v1/products',
      method: 'GET',
      description: '获取产品列表',
      category: '产品管理',
      tags: JSON.stringify(['产品', '列表']),
      status: 'published',
      version: '1.0.0',
    },
  ];

  for (const iface of interfaces) {
    await query(`
      INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      iface.id,
      iface.name,
      iface.path,
      iface.method,
      iface.description,
      iface.category,
      iface.tags,
      iface.status,
      iface.version,
      adminId,
      now,
      now
    ]);
  }

  const models = [
    {
      name: 'User',
      tableName: 'users',
      description: '用户信息表',
      fields: [
        { id: uuidv4(), name: 'id', columnName: 'id', type: 'INT', nullable: false, primaryKey: true, comment: '用户ID' },
        { id: uuidv4(), name: 'username', columnName: 'username', type: 'VARCHAR', nullable: false, primaryKey: false, comment: '用户名' },
        { id: uuidv4(), name: 'email', columnName: 'email', type: 'VARCHAR', nullable: false, primaryKey: false, comment: '邮箱' },
        { id: uuidv4(), name: 'password', columnName: 'password', type: 'VARCHAR', nullable: false, primaryKey: false, comment: '密码' },
        { id: uuidv4(), name: 'createdAt', columnName: 'created_at', type: 'DATETIME', nullable: false, primaryKey: false, comment: '创建时间' },
        { id: uuidv4(), name: 'updatedAt', columnName: 'updated_at', type: 'DATETIME', nullable: true, primaryKey: false, comment: '更新时间' },
      ],
    },
    {
      name: 'Order',
      tableName: 'orders',
      description: '订单信息表',
      fields: [
        { id: uuidv4(), name: 'id', columnName: 'id', type: 'INT', nullable: false, primaryKey: true, comment: '订单ID' },
        { id: uuidv4(), name: 'userId', columnName: 'user_id', type: 'INT', nullable: false, primaryKey: false, comment: '用户ID' },
        { id: uuidv4(), name: 'totalAmount', columnName: 'total_amount', type: 'DECIMAL', nullable: false, primaryKey: false, comment: '总金额' },
        { id: uuidv4(), name: 'status', columnName: 'status', type: 'VARCHAR', nullable: false, primaryKey: false, comment: '订单状态' },
        { id: uuidv4(), name: 'createdAt', columnName: 'created_at', type: 'DATETIME', nullable: false, primaryKey: false, comment: '创建时间' },
      ],
    },
    {
      name: 'Product',
      tableName: 'products',
      description: '产品信息表',
      fields: [
        { id: uuidv4(), name: 'id', columnName: 'id', type: 'INT', nullable: false, primaryKey: true, comment: '产品ID' },
        { id: uuidv4(), name: 'name', columnName: 'name', type: 'VARCHAR', nullable: false, primaryKey: false, comment: '产品名称' },
        { id: uuidv4(), name: 'price', columnName: 'price', type: 'DECIMAL', nullable: false, primaryKey: false, comment: '价格' },
        { id: uuidv4(), name: 'stock', columnName: 'stock', type: 'INT', nullable: false, primaryKey: false, comment: '库存' },
        { id: uuidv4(), name: 'description', columnName: 'description', type: 'TEXT', nullable: true, primaryKey: false, comment: '描述' },
      ],
    },
  ];

  for (const model of models) {
    await query(`
      INSERT INTO data_models (name, table_name, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [model.name, model.tableName, model.description, now, now]);

    for (const field of model.fields) {
      await query(`
        INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        field.id,
        model.name,
        field.name,
        field.columnName,
        field.type,
        field.nullable ? 1 : 0,
        field.primaryKey ? 1 : 0,
        field.comment
      ]);
    }
  }

  const mappings = [
    { id: uuidv4(), interfaceId: interfaces[0].id, interfaceField: 'id', modelName: 'User', modelField: 'id' },
    { id: uuidv4(), interfaceId: interfaces[0].id, interfaceField: 'username', modelName: 'User', modelField: 'username' },
    { id: uuidv4(), interfaceId: interfaces[0].id, interfaceField: 'email', modelName: 'User', modelField: 'email' },
    { id: uuidv4(), interfaceId: interfaces[1].id, interfaceField: 'username', modelName: 'User', modelField: 'username' },
    { id: uuidv4(), interfaceId: interfaces[1].id, interfaceField: 'email', modelName: 'User', modelField: 'email' },
    { id: uuidv4(), interfaceId: interfaces[1].id, interfaceField: 'password', modelName: 'User', modelField: 'password' },
    { id: uuidv4(), interfaceId: interfaces[5].id, interfaceField: 'id', modelName: 'Order', modelField: 'id' },
    { id: uuidv4(), interfaceId: interfaces[5].id, interfaceField: 'userId', modelName: 'Order', modelField: 'user_id' },
    { id: uuidv4(), interfaceId: interfaces[5].id, interfaceField: 'totalAmount', modelName: 'Order', modelField: 'total_amount' },
    { id: uuidv4(), interfaceId: interfaces[7].id, interfaceField: 'id', modelName: 'Product', modelField: 'id' },
    { id: uuidv4(), interfaceId: interfaces[7].id, interfaceField: 'name', modelName: 'Product', modelField: 'name' },
    { id: uuidv4(), interfaceId: interfaces[7].id, interfaceField: 'price', modelName: 'Product', modelField: 'price' },
  ];

  for (const mapping of mappings) {
    await query(`
      INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [mapping.id, mapping.interfaceId, mapping.interfaceField, mapping.modelName, mapping.modelField, now]);
  }

  const mockConfigs = [
    {
      id: uuidv4(),
      path: '/api/users',
      method: 'GET',
      statusCode: 200,
      delay: 100,
      responseConfig: JSON.stringify({
        code: 200,
        message: 'success',
        data: [
          { id: 1, username: 'admin', email: 'admin@example.com' },
          { id: 2, username: 'user', email: 'user@example.com' },
        ],
      }),
      enabled: 1,
    },
    {
      id: uuidv4(),
      path: '/api/user/:id',
      method: 'GET',
      statusCode: 200,
      delay: 50,
      responseConfig: JSON.stringify({
        code: 200,
        message: 'success',
        data: { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' },
      }),
      enabled: 1,
    },
    {
      id: uuidv4(),
      path: '/api/orders',
      method: 'GET',
      statusCode: 200,
      delay: 200,
      responseConfig: JSON.stringify({
        code: 200,
        message: 'success',
        data: [
          { id: 1, userId: 1, totalAmount: 99.99, status: 'completed' },
          { id: 2, userId: 2, totalAmount: 199.99, status: 'pending' },
        ],
      }),
      enabled: 1,
    },
  ];

  for (const mock of mockConfigs) {
    await query(`
      INSERT INTO mock_configs (id, path, method, status_code, delay, response_config, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      mock.id,
      mock.path,
      mock.method,
      mock.statusCode,
      mock.delay,
      mock.responseConfig,
      mock.enabled,
      now,
      now
    ]);
  }

  console.log('Sample data initialized successfully!');
}
