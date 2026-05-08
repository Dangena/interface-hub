import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool, query } from '../database.js';
import { authenticateToken } from './auth';

const router = Router();

interface FieldInfo {
  name: string;
  column_name: string;
  type: string;
  nullable: number;
  primary_key: number;
  default_value: string | null;
  comment: string | null;
}

interface InterfaceInfo {
  id: string;
  name: string;
  path: string;
  method: string;
  request_schema: string | null;
  parameters: Array<{
    name: string;
    location: string;
    type: string;
  }>;
}

const GENERATORS: Record<string, () => string | number | boolean> = {
  email: () => {
    const names = ['john', 'jane', 'mike', 'sarah', 'david', 'lisa', 'tom', 'emma', 'alex', 'kate'];
    const domains = ['gmail.com', 'qq.com', '163.com', '126.com', 'outlook.com', 'example.com'];
    return `${names[Math.floor(Math.random() * names.length)]}${Math.floor(Math.random() * 1000)}@${domains[Math.floor(Math.random() * domains.length)]}`;
  },
  phone: () => {
    const prefixes = ['138', '139', '150', '151', '152', '180', '181', '186', '187', '188'];
    let phone = prefixes[Math.floor(Math.random() * prefixes.length)];
    for (let i = 0; i < 8; i++) {
      phone += Math.floor(Math.random() * 10);
    }
    return phone;
  },
  name: () => {
    const firstNames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗'];
    const lastNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英', '华', '平', '刚'];
    return firstNames[Math.floor(Math.random() * firstNames.length)] + lastNames[Math.floor(Math.random() * lastNames.length)];
  },
  username: () => {
    const prefixes = ['user', 'admin', 'test', 'demo', 'guest', 'member', 'vip'];
    const suffixes = ['123', '456', '789', '001', '002', '888', '999'];
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
  },
  password: () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  },
  title: () => {
    const titles = ['关于', '发布', '更新', '修复', '优化', '新增', '调整', '变更', '删除', '取消'];
    const subjects = ['用户权限', '接口文档', '数据同步', '系统配置', '功能模块', '数据库', 'API接口', '前端组件', '后端服务', '测试用例'];
    return `${titles[Math.floor(Math.random() * titles.length)]}${subjects[Math.floor(Math.random() * subjects.length)]}`;
  },
  description: () => {
    const templates = [
      '这是一条测试数据，用于模拟真实业务场景。',
      '系统自动生成的数据记录，请勿用于生产环境。',
      '根据业务规则自动创建的模拟数据。',
      '用于接口测试和系统集成的示例数据。',
      '模拟外部系统对接的测试数据记录。',
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  },
  address: () => {
    const provinces = ['北京市', '上海市', '广东省', '浙江省', '江苏省', '四川省', '湖北省', '湖南省'];
    const cities = ['朝阳区', '浦东新区', '广州市', '深圳市', '杭州市', '南京市', '成都市', '武汉市'];
    const streets = ['中关村大街1号', '陆家嘴金融中心', '科技园A座', '软件园B栋', '创业大厦', '商务中心', '产业园区', '开发区'];
    return `${provinces[Math.floor(Math.random() * provinces.length)]}${cities[Math.floor(Math.random() * cities.length)]}${streets[Math.floor(Math.random() * streets.length)]}`;
  },
  url: () => {
    const domains = ['example.com', 'test.com', 'demo.com', 'api.com', 'service.com'];
    const paths = ['/api/v1/users', '/api/v2/products', '/api/users/list', '/api/orders/search'];
    return `https://${domains[Math.floor(Math.random() * domains.length)]}${paths[Math.floor(Math.random() * paths.length)]}`;
  },
  ip: () => {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  },
  uuid: () => uuidv4(),
  id: () => Math.floor(Math.random() * 100000),
  code: () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },
  order_no: () => {
    const prefix = 'ORD';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${timestamp}${random}`;
  },
  price: () => Math.round(Math.random() * 10000) / 100,
  quantity: () => Math.floor(Math.random() * 100) + 1,
  rating: () => Math.round((Math.random() * 5) * 10) / 10,
  status: () => {
    const statuses = ['pending', 'active', 'inactive', 'suspended', 'deleted'];
    return statuses[Math.floor(Math.random() * statuses.length)];
  },
  gender: () => {
    const genders = ['male', 'female', 'other'];
    return genders[Math.floor(Math.random() * genders.length)];
  },
  age: () => Math.floor(Math.random() * 60) + 18,
  boolean: () => Math.random() > 0.5,
  true_or_false: () => Math.random() > 0.5,
};

function inferGenerator(fieldName: string, columnType: string, comment: string | null): () => string | number | boolean {
  const lowerName = fieldName.toLowerCase();
  const lowerType = columnType.toUpperCase();
  const lowerComment = (comment || '').toLowerCase();

  if (lowerName.includes('email')) return GENERATORS.email;
  if (lowerName.includes('phone') || lowerName.includes('mobile') || lowerName.includes('tel')) return GENERATORS.phone;
  if (lowerName === 'name' || lowerName === 'username' || lowerName.includes('nickname') || lowerName.includes('user_name')) return GENERATORS.name;
  if (lowerName.includes('password')) return GENERATORS.password;
  if (lowerName.includes('title') || lowerName.includes('subject')) return GENERATORS.title;
  if (lowerName.includes('desc') || lowerName.includes('summary') || lowerName.includes('content')) return GENERATORS.description;
  if (lowerName.includes('address')) return GENERATORS.address;
  if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('website')) return GENERATORS.url;
  if (lowerName.includes('ip')) return GENERATORS.ip;
  if (lowerName.includes('uuid') || lowerName.includes('guid')) return GENERATORS.uuid;
  if (lowerName.includes('id') && !lowerName.includes('user') && !lowerName.includes('product')) return GENERATORS.id;
  if (lowerName.includes('code') || lowerName.includes('no') || lowerName.includes('number')) return GENERATORS.code;
  if (lowerName.includes('order')) return GENERATORS.order_no;
  if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('cost')) return GENERATORS.price;
  if (lowerName.includes('quantity') || lowerName.includes('count') || lowerName.includes('stock')) return GENERATORS.quantity;
  if (lowerName.includes('rating') || lowerName.includes('score')) return GENERATORS.rating;
  if (lowerName.includes('status')) return GENERATORS.status;
  if (lowerName.includes('gender')) return GENERATORS.gender;
  if (lowerName.includes('age')) return GENERATORS.age;
  if (lowerName.includes('avatar') || lowerName.includes('image') || lowerName.includes('photo') || lowerName.includes('logo')) {
    return () => `https://picsum.photos/seed/${Math.random().toString(36).slice(2)}/200`;
  }
  if (lowerName.includes('enabled') || lowerName.includes('active') || lowerName.includes('valid')) return GENERATORS.boolean;

  if (lowerType.includes('INT') || lowerType.includes('FLOAT') || lowerType.includes('DOUBLE') || lowerType.includes('DECIMAL') || lowerType.includes('NUMERIC')) {
    return () => Math.floor(Math.random() * 1000);
  }

  if (lowerType.includes('BOOL')) return GENERATORS.boolean;
  if (lowerType.includes('DATE') || lowerType.includes('TIME')) {
    return () => {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 365));
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };
  }

  if (lowerComment.includes('邮箱')) return GENERATORS.email;
  if (lowerComment.includes('电话') || lowerComment.includes('手机')) return GENERATORS.phone;
  if (lowerComment.includes('名称') || lowerComment.includes('姓名')) return GENERATORS.name;

  return () => `test_${Math.random().toString(36).slice(2, 8)}`;
}

function generateDataForFields(fields: FieldInfo[]): Record<string, any> {
  const data: Record<string, any> = {};

  for (const field of fields) {
    const generator = inferGenerator(field.name, field.type, field.comment);
    const value = generator();

    if (field.nullable && Math.random() < 0.1) {
      data[field.column_name] = null;
    } else {
      data[field.column_name] = value;
    }
  }

  return data;
}

router.get('/fields/:modelName', authenticateToken, async (req, res) => {
  try {
    const { modelName } = req.params;
    const fields = (await query(`
      SELECT name, column_name, type, nullable, primary_key, default_value, comment
      FROM fields WHERE model_name = $1 ORDER BY name
    `, [modelName])).rows as FieldInfo[];

    if (!fields.length) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const tableNameRow = (await query('SELECT table_name FROM data_models WHERE name = $1', [modelName])).rows[0] as { table_name: string };

    res.json({
      modelName,
      tableName: tableNameRow,
      fields: fields.map(f => ({
        name: f.name,
        columnName: f.column_name,
        type: f.type,
        nullable: f.nullable === 1,
        primaryKey: f.primary_key === 1,
        defaultValue: f.default_value,
        comment: f.comment,
        suggestedGenerator: inferGenerator(f.name, f.type, f.comment).name || 'custom',
      })),
    });
  } catch (error) {
    console.error('Get fields error:', error);
    res.status(500).json({ error: 'Failed to get model fields' });
  }
});

router.get('/interface/:interfaceId', authenticateToken, async (req, res) => {
  try {
    const { interfaceId } = req.params;

    const iface = (await query(`
      SELECT id, name, path, method, description, request_schema, response_schema
      FROM interfaces WHERE id = $1
    `, [interfaceId])).rows[0] as any;

    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const parameters = (await query(`
      SELECT name, location, type FROM parameters WHERE interface_id = $1
    `, [interfaceId])).rows;

    let requestSchema = null;
    if (iface.request_schema) {
      try {
        requestSchema = JSON.parse(iface.request_schema);
      } catch (_e: any) {
        requestSchema = null;
      }
    }

    const mappings = (await query(`
      SELECT fm.interface_field, fm.model_field, fm.model_name, m.table_name
      FROM field_mappings fm
      JOIN data_models m ON fm.model_name = m.name
      WHERE fm.interface_id = $1
    `, [interfaceId])).rows as any[];

    let targetFields: FieldInfo[] = [];
    if (mappings.length > 0) {
      const modelName = mappings[0].model_name;
      targetFields = (await query(`
        SELECT name, column_name, type, nullable, primary_key, default_value, comment
        FROM fields WHERE model_name = $1
      `, [modelName])).rows as FieldInfo[];
    }

    res.json({
      interface: {
        id: iface.id,
        name: iface.name,
        path: iface.path,
        method: iface.method,
        description: iface.description,
        requestSchema,
        parameters,
      },
      mappings,
      targetFields,
    });
  } catch (error) {
    console.error('Get interface error:', error);
    res.status(500).json({ error: 'Failed to get interface' });
  }
});

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const {
      sourceType,
      modelName,
      interfaceId,
      count = 10,
      customFields,
    }: {
      sourceType: 'model' | 'interface' | 'custom';
      modelName?: string;
      interfaceId?: string;
      count?: number;
      customFields?: Array<{ name: string; type: string; generator?: string }>;
    } = req.body;

    if (count < 1 || count > 1000) {
      return res.status(400).json({ error: 'Count must be between 1 and 1000' });
    }

    const records: Record<string, any>[] = [];

    if (sourceType === 'model' && modelName) {
      const fields = (await query(`
        SELECT name, column_name, type, nullable, primary_key, default_value, comment
        FROM fields WHERE model_name = $1
      `, [modelName])).rows as FieldInfo[];

      for (let i = 0; i < count; i++) {
        records.push(generateDataForFields(fields));
      }
    } else if (sourceType === 'interface' && interfaceId) {
      const mappings = (await query(`
        SELECT fm.interface_field, fm.model_field, fm.model_name
        FROM field_mappings fm WHERE fm.interface_id = $1
      `, [interfaceId])).rows as any[];

      if (mappings.length > 0) {
        const fields = (await query(`
          SELECT name, column_name, type, nullable, primary_key, default_value, comment
          FROM fields WHERE model_name = $1
        `, [mappings[0].model_name])).rows as FieldInfo[];

        for (let i = 0; i < count; i++) {
          records.push(generateDataForFields(fields));
        }
      } else {
        const parameters = (await query(`
          SELECT name, location, type FROM parameters WHERE interface_id = $1
        `, [interfaceId])).rows as any[];

        const fakeFields: FieldInfo[] = parameters.map(p => ({
          name: p.name,
          column_name: p.name,
          type: p.type,
          nullable: 0,
          primary_key: 0,
          default_value: null,
          comment: null,
        }));

        for (let i = 0; i < count; i++) {
          records.push(generateDataForFields(fakeFields));
        }
      }
    } else if (sourceType === 'custom' && customFields) {
      const fields: FieldInfo[] = customFields.map(f => ({
        name: f.name,
        column_name: f.name,
        type: f.type,
        nullable: 0,
        primary_key: 0,
        default_value: null,
        comment: null,
      }));

      for (let i = 0; i < count; i++) {
        records.push(generateDataForFields(fields));
      }
    } else {
      return res.status(400).json({ error: 'Invalid source type or missing parameters' });
    }

    res.json({
      success: true,
      count: records.length,
      records,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Generate data error:', error);
    res.status(500).json({ error: 'Failed to generate data' });
  }
});

router.post('/push-to-database', authenticateToken, async (req, res) => {
  try {
    const { modelName, records }: { modelName: string; records: Record<string, any>[] } = req.body;

    if (!modelName || !records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const model = (await query('SELECT table_name FROM data_models WHERE name = $1', [modelName])).rows[0] as { table_name: string } | undefined;
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const fields = (await query(`
      SELECT column_name FROM fields WHERE model_name = $1
    `, [modelName])).rows as { column_name: string }[];

    const columns = fields.map(f => f.column_name);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      for (const record of records) {
        try {
          const values = columns.map(col => {
            const val = record[col];
            if (val === undefined || val === null) {
              return null;
            }
            return typeof val === 'object' ? JSON.stringify(val) : val;
          });
          await client.query(`INSERT INTO ${model.table_name} (${columns.join(', ')}) VALUES (${placeholders})`, values);
          inserted++;
        } catch (err) {
          console.error('Insert error:', err);
        }
      }
      await client.query('COMMIT');

      res.json({
        success: true,
        totalRecords: records.length,
        insertedRecords: inserted,
        failedRecords: records.length - inserted,
        tableName: model.table_name,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Push to database error:', error);
    res.status(500).json({ error: 'Failed to push data to database' });
  }
});

router.post('/push-to-api', authenticateToken, async (req, res) => {
  try {
    const { interfaceId, records, baseUrl }: {
      interfaceId: string;
      records: Record<string, any>[];
      baseUrl?: string;
    } = req.body;

    if (!interfaceId || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const iface = (await query(`
      SELECT id, path, method FROM interfaces WHERE id = $1
    `, [interfaceId])).rows[0] as any;

    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const targetUrl = baseUrl ? `${baseUrl}${iface.path}` : `http://localhost:3001${iface.path}`;
    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const record of records) {
      try {
        const response = await fetch(targetUrl, {
          method: iface.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization || '',
          },
          body: iface.method !== 'GET' ? JSON.stringify(record) : undefined,
        });

        const result = {
          status: response.status,
          ok: response.ok,
          data: null,
        };

        try {
          result.data = await response.json();
        } catch (_e: any) {
          result.data = await response.text();
        }

        results.push(result);
        if (response.ok) successCount++;
        else failCount++;
      } catch (err: any) {
        results.push({
          status: 0,
          ok: false,
          error: err.message,
        });
        failCount++;
      }
    }

    res.json({
      success: true,
      totalRecords: records.length,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    console.error('Push to API error:', error);
    res.status(500).json({ error: 'Failed to push data to API' });
  }
});

router.get('/generators', authenticateToken, (req, res) => {
  const generators = [
    { id: 'email', name: '邮箱', description: '生成随机邮箱地址' },
    { id: 'phone', name: '手机号', description: '生成随机中国手机号' },
    { id: 'name', name: '姓名', description: '生成随机中文姓名' },
    { id: 'username', name: '用户名', description: '生成随机用户名' },
    { id: 'password', name: '密码', description: '生成随机密码(12位)' },
    { id: 'title', name: '标题', description: '生成随机标题' },
    { id: 'description', name: '描述', description: '生成随机描述文本' },
    { id: 'address', name: '地址', description: '生成随机中国地址' },
    { id: 'url', name: '网址', description: '生成随机URL' },
    { id: 'ip', name: 'IP地址', description: '生成随机IP地址' },
    { id: 'uuid', name: 'UUID', description: '生成UUID' },
    { id: 'code', name: '编码', description: '生成随机编码(8位)' },
    { id: 'order_no', name: '订单号', description: '生成订单号' },
    { id: 'price', name: '价格', description: '生成随机价格' },
    { id: 'quantity', name: '数量', description: '生成随机数量' },
    { id: 'rating', name: '评分', description: '生成随机评分(0-5)' },
    { id: 'status', name: '状态', description: '生成随机状态' },
    { id: 'gender', name: '性别', description: '生成随机性别' },
    { id: 'age', name: '年龄', description: '生成随机年龄(18-78)' },
    { id: 'boolean', name: '布尔值', description: '生成随机布尔值' },
    { id: 'image', name: '图片URL', description: '生成随机图片URL' },
    { id: 'custom', name: '自定义', description: '用户自定义数据' },
  ];

  res.json(generators);
});

export default router;
