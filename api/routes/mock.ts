import { Router } from 'express';
import { query } from '../database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows: mocks } = await query('SELECT * FROM mock_configs ORDER BY created_at DESC');
    res.json(mocks.map((m: any) => ({
      ...m,
      responseConfig: m.response_config ? JSON.parse(m.response_config) : null,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mock configs' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { interfaceId, path, method, statusCode, delay, responseConfig, enabled } = req.body;

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO mock_configs (id, interface_id, path, method, status_code, delay, response_config, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      interfaceId || null,
      path,
      method || 'GET',
      statusCode || 200,
      delay || 0,
      responseConfig ? JSON.stringify(responseConfig) : null,
      enabled ? 1 : 0,
      now,
      now
    ]);

    const { rows } = await query('SELECT * FROM mock_configs WHERE id = $1', [id]);
    const mock = rows[0] as Record<string, any>;
    res.status(201).json({
      ...mock,
      responseConfig: responseConfig || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mock config' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { path, method, statusCode, delay, responseConfig, enabled } = req.body;

    const now = new Date().toISOString();

    await query(`
      UPDATE mock_configs
      SET path = $1, method = $2, status_code = $3, delay = $4, response_config = $5, enabled = $6, updated_at = $7
      WHERE id = $8
    `, [
      path,
      method || 'GET',
      statusCode || 200,
      delay || 0,
      responseConfig ? JSON.stringify(responseConfig) : null,
      enabled ? 1 : 0,
      now,
      id
    ]);

    const { rows } = await query('SELECT * FROM mock_configs WHERE id = $1', [id]);
    const mock = rows[0] as Record<string, any>;
    res.json({
      ...mock,
      responseConfig: responseConfig || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mock config' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM mock_configs WHERE id = $1', [id]);
    res.json({ message: 'Mock config deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mock config' });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { interfaceId, count = 1 } = req.body;

    let interfaceData = null;
    let modelMappings: any[] = [];

    if (interfaceId) {
      const { rows: ifaceRows } = await query('SELECT * FROM interfaces WHERE id = $1', [interfaceId]);
      interfaceData = ifaceRows[0] || null;
      const { rows: mappingRows } = await query(`
        SELECT fm.*, f.*
        FROM field_mappings fm
        LEFT JOIN fields f ON fm.model_field = f.name AND fm.model_name = f.model_name
        WHERE fm.interface_id = $1
      `, [interfaceId]);
      modelMappings = mappingRows;
    }

    const generatedData = [];
    for (let i = 0; i < count; i++) {
      const mockData: any = {};

      for (const mapping of modelMappings) {
        if (mapping.interface_field && mapping.name) {
          mockData[mapping.interface_field] = generateMockValue(mapping.name, mapping.type, i);
        }
      }

      generatedData.push(mockData);
    }

    res.json({
      interface: interfaceData,
      mappings: modelMappings,
      generated: generatedData,
      template: generateTemplate(modelMappings),
    });
  } catch (error) {
    console.error('Generate mock error:', error);
    res.status(500).json({ error: 'Failed to generate mock data' });
  }
});

router.post('/generate-from-model', async (req, res) => {
  try {
    const { modelName, count = 1 } = req.body;

    const { rows: modelRows } = await query('SELECT * FROM data_models WHERE name = $1', [modelName]);
    const model = modelRows[0];
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const { rows: fields } = await query('SELECT * FROM fields WHERE model_name = $1', [modelName]);

    const generatedData = [];
    for (let i = 0; i < count; i++) {
      const record: any = {};
      for (const field of fields) {
        record[field.name] = generateMockValue(field.name, field.type, i);
      }
      generatedData.push(record);
    }

    res.json({
      model,
      fields,
      generated: generatedData,
    });
  } catch (error) {
    console.error('Generate from model error:', error);
    res.status(500).json({ error: 'Failed to generate mock data from model' });
  }
});

function generateMockValue(fieldName: string, fieldType: string | null, index: number): any {
  const lowerName = (fieldName || '').toLowerCase();
  const type = (fieldType || 'varchar').toLowerCase();

  if (lowerName.includes('id')) {
    return index + 1;
  }

  if (lowerName.includes('uuid') || lowerName.includes('guid')) {
    return uuidv4();
  }

  if (lowerName.includes('email')) {
    return `user${index + 1}@example.com`;
  }

  if (lowerName.includes('phone') || lowerName.includes('mobile') || lowerName.includes('tel')) {
    return `138${String(index + 1).padStart(8, '0')}`;
  }

  if (lowerName.includes('name') && lowerName.includes('first')) {
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Zhang', 'Li'];
    return firstNames[index % firstNames.length];
  }

  if (lowerName.includes('name') && lowerName.includes('last')) {
    const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wang', 'Zhang', 'Lee', 'Chen'];
    return lastNames[index % lastNames.length];
  }

  if (lowerName.includes('name')) {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    return names[index % names.length];
  }

  if (lowerName.includes('age')) {
    return Math.floor(Math.random() * 50) + 18;
  }

  if (lowerName.includes('gender')) {
    return index % 2 === 0 ? 'male' : 'female';
  }

  if (lowerName.includes('date') || lowerName.includes('_at') || lowerName.includes('_on')) {
    if (type.includes('date') && !type.includes('time')) {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 365));
      return date.toISOString().split('T')[0];
    }
    const date = new Date();
    date.setHours(date.getHours() - Math.floor(Math.random() * 8760));
    return date.toISOString();
  }

  if (lowerName.includes('time') || lowerName.includes('timestamp')) {
    return new Date().toISOString();
  }

  if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('cost')) {
    return (Math.random() * 1000).toFixed(2);
  }

  if (lowerName.includes('count') || lowerName.includes('quantity') || lowerName.includes('number')) {
    return Math.floor(Math.random() * 100) + 1;
  }

  if (lowerName.includes('active') || lowerName.includes('enabled') || lowerName.includes('status')) {
    return index % 3 !== 0;
  }

  if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('href')) {
    return `https://example.com/item/${index + 1}`;
  }

  if (lowerName.includes('avatar') || lowerName.includes('image') || lowerName.includes('photo')) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${index + 1}`;
  }

  if (lowerName.includes('description') || lowerName.includes('desc') || lowerName.includes('content')) {
    const descriptions = [
      'This is a sample description for testing purposes.',
      'Product description with detailed information.',
      'User generated content for demonstration.',
      'Brief overview of the item features.',
      'Comprehensive guide and instructions.',
    ];
    return descriptions[index % descriptions.length];
  }

  if (lowerName.includes('title') || lowerName.includes('subject')) {
    const titles = [
      'Introduction to Programming',
      'Advanced Software Design',
      'Database Management Systems',
      'Web Development Basics',
      'Cloud Computing Essentials',
    ];
    return titles[index % titles.length];
  }

  if (lowerName.includes('category') || lowerName.includes('type')) {
    const categories = ['Electronics', 'Books', 'Clothing', 'Food', 'Sports'];
    return categories[index % categories.length];
  }

  if (lowerName.includes('address')) {
    const addresses = [
      '123 Main St, City, Country',
      '456 Oak Ave, Town, Region',
      '789 Pine Rd, Village, State',
    ];
    return addresses[index % addresses.length];
  }

  if (lowerName.includes('city')) {
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
    return cities[index % cities.length];
  }

  if (lowerName.includes('country')) {
    const countries = ['USA', 'China', 'Japan', 'Germany', 'France'];
    return countries[index % countries.length];
  }

  if (type.includes('int') || type.includes('integer') || type.includes('number')) {
    return index + 1;
  }

  if (type.includes('decimal') || type.includes('float') || type.includes('double')) {
    return (Math.random() * 100).toFixed(2);
  }

  if (type.includes('boolean') || type.includes('bool')) {
    return index % 2 === 0;
  }

  return `sample_${fieldName}_${index + 1}`;
}

function generateTemplate(mappings: any[]): any {
  const template: any = {};

  for (const mapping of mappings) {
    if (mapping.interface_field && mapping.name) {
      const type = (mapping.type || 'varchar').toLowerCase();

      if (type.includes('int') || type.includes('integer')) {
        template[mapping.interface_field] = {
          type: 'integer',
          description: `Generated integer for ${mapping.interface_field}`,
        };
      } else if (type.includes('decimal') || type.includes('float')) {
        template[mapping.interface_field] = {
          type: 'number',
          description: `Generated number for ${mapping.interface_field}`,
        };
      } else if (type.includes('boolean')) {
        template[mapping.interface_field] = {
          type: 'boolean',
          description: `Generated boolean for ${mapping.interface_field}`,
        };
      } else if (type.includes('date')) {
        template[mapping.interface_field] = {
          type: 'string',
          format: type.includes('datetime') || type.includes('timestamp') ? 'date-time' : 'date',
          description: `Generated date for ${mapping.interface_field}`,
        };
      } else {
        template[mapping.interface_field] = {
          type: 'string',
          description: `Generated string for ${mapping.interface_field}`,
        };
      }
    }
  }

  return template;
}

router.all('/proxy/*', async (req, res) => {
  try {
    const mockPath = req.params[0];
    const method = req.method;
    const requestPath = `/${mockPath}`;

    const { rows: allMocks } = await query(`
      SELECT * FROM mock_configs WHERE method = $1 AND enabled = 1
    `, [method]);

    let matchedMock: any = null;
    let pathParams: Record<string, string> = {};

    for (const mock of allMocks) {
      const pattern = mock.path;
      const patternSegments = pattern.split('/');
      const requestSegments = requestPath.split('/');

      if (patternSegments.length !== requestSegments.length) continue;

      let isMatch = true;
      const params: Record<string, string> = {};

      for (let i = 0; i < patternSegments.length; i++) {
        const patternSeg = patternSegments[i];
        const requestSeg = requestSegments[i];

        if (patternSeg.startsWith(':') || patternSeg.startsWith('{') && patternSeg.endsWith('}')) {
          const paramName = patternSeg.startsWith(':')
            ? patternSeg.slice(1)
            : patternSeg.slice(1, -1);
          params[paramName] = requestSeg;
        } else if (patternSeg !== requestSeg) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        matchedMock = mock;
        pathParams = params;
        break;
      }
    }

    if (!matchedMock) {
      const { rows: exactRows } = await query(`
        SELECT * FROM mock_configs
        WHERE path = $1 AND method = $2 AND enabled = 1
      `, [requestPath, method]);

      if (!exactRows[0]) {
        return res.status(404).json({ error: 'Mock not found', path: requestPath, method });
      }
      matchedMock = exactRows[0];
    }

    const delay = matchedMock.delay || 0;
    const statusCode = matchedMock.status_code || 200;
    let responseConfig = matchedMock.response_config ? JSON.parse(matchedMock.response_config) : {};

    if (Object.keys(pathParams).length > 0) {
      responseConfig = replacePathParams(responseConfig, pathParams);
    }

    setTimeout(() => {
      res.status(statusCode).json(responseConfig);
    }, delay);
  } catch (error) {
    res.status(500).json({ error: 'Mock proxy error' });
  }
});

function replacePathParams(obj: any, params: Record<string, string>): any {
  if (typeof obj === 'string') {
    let result = obj;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}|:${key}`, 'g'), value);
    }
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => replacePathParams(item, params));
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replacePathParams(value, params);
    }
    return result;
  }
  return obj;
}

export default router;
