import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';

const router = Router();

const FENCE = String.fromCharCode(96).repeat(3);

interface InterfaceData {
  id: string;
  name: string;
  path: string;
  method: string;
  description: string;
  category: string;
  tags: string;
  status: string;
  version: string;
  request_schema: string | null;
  response_schema: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ParameterData {
  id: string;
  interface_id: string;
  name: string;
  location: string;
  type: string;
  required: number;
  description: string;
  example: string;
}

function resolveInterface(body: any): { iface: InterfaceData | null; params: ParameterData[] } {
  if (body.interfaceId) {
    const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(body.interfaceId) as InterfaceData | undefined;
    if (!iface) return { iface: null, params: [] };
    const params = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(body.interfaceId) as ParameterData[];
    return { iface, params };
  }
  if (body.interface) {
    const raw = body.interface;
    const iface: InterfaceData = {
      id: raw.id || uuidv4(),
      name: raw.name || 'Unnamed',
      path: raw.path || '/',
      method: raw.method || 'GET',
      description: raw.description || '',
      category: raw.category || '',
      tags: typeof raw.tags === 'string' ? raw.tags : JSON.stringify(raw.tags || []),
      status: raw.status || 'draft',
      version: raw.version || '1.0.0',
      request_schema: raw.request_schema ? (typeof raw.request_schema === 'string' ? raw.request_schema : JSON.stringify(raw.request_schema)) : null,
      response_schema: raw.response_schema ? (typeof raw.response_schema === 'string' ? raw.response_schema : JSON.stringify(raw.response_schema)) : null,
      created_by: raw.created_by || 'system',
      created_at: raw.created_at || new Date().toISOString(),
      updated_at: raw.updated_at || new Date().toISOString(),
    };
    const params = (raw.parameters || []).map((p: any) => ({
      id: p.id || uuidv4(),
      interface_id: iface.id,
      name: p.name || '',
      location: p.location || 'query',
      type: p.type || 'string',
      required: p.required ? 1 : 0,
      description: p.description || '',
      example: p.example || '',
    }));
    return { iface, params };
  }
  return { iface: null, params: [] };
}

function parseSchema(schemaStr: string | null): any {
  if (!schemaStr) return null;
  try {
    return JSON.parse(schemaStr);
  } catch {
    return null;
  }
}

router.post('/generate-doc', (req, res) => {
  try {
    const { iface, params } = resolveInterface(req.body);
    if (!iface) {
      return res.status(400).json({ error: 'interfaceId or interface object is required' });
    }

    const method = iface.method.toUpperCase();
    const tags = iface.tags ? JSON.parse(iface.tags) : [];
    const requestSchema = parseSchema(iface.request_schema);
    const responseSchema = parseSchema(iface.response_schema);

    let markdown = `# ${iface.name}\n\n`;
    markdown += `## Overview\n\n`;
    markdown += `${iface.description || 'No description provided.'}\n\n`;
    markdown += `- **Version**: ${iface.version || '1.0.0'}\n`;
    markdown += `- **Status**: ${iface.status || 'draft'}\n`;
    if (iface.category) markdown += `- **Category**: ${iface.category}\n`;
    if (tags.length > 0) markdown += `- **Tags**: ${tags.join(', ')}\n`;
    markdown += `\n`;

    markdown += `## Endpoint\n\n`;
    markdown += `\`${method} ${iface.path}\`\n\n`;

    if (params.length > 0) {
      markdown += `## Parameters\n\n`;
      markdown += `| Name | Location | Type | Required | Description | Example |\n`;
      markdown += `|------|----------|------|----------|-------------|--------|\n`;
      for (const p of params) {
        markdown += `| ${p.name} | ${p.location} | ${p.type} | ${p.required ? 'Yes' : 'No'} | ${p.description || '-'} | ${p.example || '-'} |\n`;
      }
      markdown += `\n`;
    }

    if (requestSchema && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      markdown += `## Request Body\n\n`;
      markdown += FENCE + 'json\n';
      markdown += JSON.stringify(requestSchema, null, 2);
      markdown += '\n' + FENCE + '\n\n';
    }

    if (responseSchema) {
      markdown += `## Response\n\n`;
      markdown += FENCE + 'json\n';
      markdown += JSON.stringify(responseSchema, null, 2);
      markdown += '\n' + FENCE + '\n\n';
    }

    markdown += `## Example Request\n\n`;
    markdown += FENCE + 'bash\n';
    const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
    if (hasBody) {
      markdown += `curl -X ${method} https://api.example.com${iface.path} \\\n`;
      markdown += `  -H "Content-Type: application/json" \\\n`;
      if (requestSchema) {
        markdown += `  -d '${JSON.stringify(requestSchema, null, 0)}'\n`;
      } else {
        markdown += `  -d '{}'\n`;
      }
    } else {
      const queryParams = params.filter(p => p.location === 'query');
      const queryString = queryParams.length > 0
        ? '?' + queryParams.map(p => `${p.name}=${p.example || 'value'}`).join('&')
        : '';
      markdown += `curl -X ${method} https://api.example.com${iface.path}${queryString}\n`;
    }
    markdown += FENCE + '\n\n';

    markdown += `## Example Response\n\n`;
    markdown += FENCE + 'json\n';
    if (responseSchema) {
      markdown += JSON.stringify(responseSchema, null, 2);
    } else {
      markdown += JSON.stringify({ success: true, data: {} }, null, 2);
    }
    markdown += '\n' + FENCE + '\n';

    res.json({
      interfaceId: iface.id,
      interfaceName: iface.name,
      markdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Generate doc error:', error);
    res.status(500).json({ error: 'Failed to generate documentation' });
  }
});

router.post('/generate-test', (req, res) => {
  try {
    const { iface, params } = resolveInterface(req.body);
    if (!iface) {
      return res.status(400).json({ error: 'interfaceId or interface object is required' });
    }

    const method = iface.method.toUpperCase();
    const requestSchema = parseSchema(iface.request_schema);
    const responseSchema = parseSchema(iface.response_schema);
    const pathParams = params.filter(p => p.location === 'path');
    const queryParams = params.filter(p => p.location === 'query');
    const bodyParams = params.filter(p => p.location === 'body');
    const headerParams = params.filter(p => p.location === 'header');

    const testCases: any[] = [];

    testCases.push({
      id: uuidv4(),
      name: `${method} ${iface.path} - Happy path`,
      description: 'Successful request with valid parameters',
      method,
      path: iface.path,
      request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'valid'),
      expectedStatus: method === 'POST' ? 201 : 200,
      expectedBehavior: 'Returns successful response with expected data structure',
      category: 'happy_path',
    });

    testCases.push({
      id: uuidv4(),
      name: `${method} ${iface.path} - Missing required fields`,
      description: 'Request without required parameters should return validation error',
      method,
      path: iface.path,
      request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'missing_required'),
      expectedStatus: 400,
      expectedBehavior: 'Returns 400 with validation error message indicating missing required fields',
      category: 'error_case',
    });

    const requiredParams = params.filter(p => p.required);
    if (requiredParams.length > 0) {
      testCases.push({
        id: uuidv4(),
        name: `${method} ${iface.path} - Invalid parameter types`,
        description: 'Send wrong types for parameters to test type validation',
        method,
        path: iface.path,
        request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'invalid_types'),
        expectedStatus: 400,
        expectedBehavior: 'Returns 400 with type validation error',
        category: 'error_case',
      });
    }

    const numericParams = params.filter(p => ['integer', 'number', 'int', 'float', 'double'].includes(p.type.toLowerCase()));
    if (numericParams.length > 0) {
      testCases.push({
        id: uuidv4(),
        name: `${method} ${iface.path} - Boundary values`,
        description: 'Test with boundary values: zero, negative, max integer, min integer',
        method,
        path: iface.path,
        request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'boundary'),
        expectedStatus: 200,
        expectedBehavior: 'Handles boundary values correctly or returns appropriate error for out-of-range values',
        category: 'boundary',
      });
    }

    const stringParams = params.filter(p => p.type.toLowerCase() === 'string');
    if (stringParams.length > 0) {
      testCases.push({
        id: uuidv4(),
        name: `${method} ${iface.path} - Empty string parameters`,
        description: 'Send empty strings where values are expected',
        method,
        path: iface.path,
        request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'empty_strings'),
        expectedStatus: requiredParams.length > 0 ? 400 : 200,
        expectedBehavior: 'Returns validation error for required empty fields or accepts optional empty fields',
        category: 'edge_case',
      });

      testCases.push({
        id: uuidv4(),
        name: `${method} ${iface.path} - Extra long strings`,
        description: 'Send strings exceeding typical length limits',
        method,
        path: iface.path,
        request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'long_strings'),
        expectedStatus: 400,
        expectedBehavior: 'Returns 400 if length limits are enforced, otherwise processes normally',
        category: 'boundary',
      });
    }

    testCases.push({
      id: uuidv4(),
      name: `${method} ${iface.path} - Unauthorized access`,
      description: 'Request without authentication credentials',
      method,
      path: iface.path,
      request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'unauthorized'),
      expectedStatus: 401,
      expectedBehavior: 'Returns 401 Unauthorized when auth is required',
      category: 'error_case',
    });

    if (method === 'GET') {
      testCases.push({
        id: uuidv4(),
        name: `${method} ${iface.path} - Not found resource`,
        description: 'Request for a non-existent resource',
        method,
        path: iface.path,
        request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'not_found'),
        expectedStatus: 404,
        expectedBehavior: 'Returns 404 Not Found for non-existent resource',
        category: 'error_case',
      });
    }

    testCases.push({
      id: uuidv4(),
      name: `${method} ${iface.path} - Special characters in parameters`,
      description: 'Send special characters and SQL injection patterns',
      method,
      path: iface.path,
      request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'special_chars'),
      expectedStatus: 200,
      expectedBehavior: 'Properly sanitizes input, no injection vulnerabilities',
      category: 'edge_case',
    });

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      testCases.push({
        id: uuidv4(),
        name: `${method} ${iface.path} - Malformed JSON body`,
        description: 'Send invalid JSON in request body',
        method,
        path: iface.path,
        request: buildRequest(iface.path, method, pathParams, queryParams, headerParams, bodyParams, 'malformed_json'),
        expectedStatus: 400,
        expectedBehavior: 'Returns 400 Bad Request for malformed JSON',
        category: 'error_case',
      });
    }

    res.json({
      interfaceId: iface.id,
      interfaceName: iface.name,
      method,
      path: iface.path,
      testCases,
      summary: {
        total: testCases.length,
        happyPath: testCases.filter(t => t.category === 'happy_path').length,
        edgeCases: testCases.filter(t => t.category === 'edge_case').length,
        errorCases: testCases.filter(t => t.category === 'error_case').length,
        boundary: testCases.filter(t => t.category === 'boundary').length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Generate test error:', error);
    res.status(500).json({ error: 'Failed to generate test cases' });
  }
});

function buildRequest(
  path: string,
  method: string,
  pathParams: ParameterData[],
  queryParams: ParameterData[],
  headerParams: ParameterData[],
  bodyParams: ParameterData[],
  mode: string
): any {
  let resolvedPath = path;
  const query: Record<string, any> = {};
  const headers: Record<string, string> = {};
  const body: Record<string, any> = {};

  if (mode === 'valid' || mode === 'boundary') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, p.example || generateExampleValue(p.type, p.name));
    }
    for (const p of queryParams) {
      query[p.name] = p.example || generateExampleValue(p.type, p.name);
    }
    for (const p of headerParams) {
      headers[p.name] = p.example || generateExampleValue(p.type, p.name);
    }
    for (const p of bodyParams) {
      body[p.name] = generateExampleValue(p.type, p.name);
    }
    if (mode === 'boundary') {
      for (const p of [...pathParams, ...queryParams, ...bodyParams]) {
        const t = p.type.toLowerCase();
        if (['integer', 'number', 'int', 'float', 'double'].includes(t)) {
          if (p.location === 'query') query[p.name] = 0;
          else if (p.location === 'body') body[p.name] = 0;
        }
      }
    }
  } else if (mode === 'missing_required') {
    for (const p of pathParams) {
      if (!p.required) resolvedPath = resolvedPath.replace(`:${p.name}`, p.example || '1');
    }
    for (const p of queryParams) {
      if (!p.required) query[p.name] = p.example || generateExampleValue(p.type, p.name);
    }
    for (const p of headerParams) {
      if (!p.required) headers[p.name] = p.example || 'value';
    }
  } else if (mode === 'invalid_types') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, 'not_a_number');
    }
    for (const p of queryParams) {
      const t = p.type.toLowerCase();
      if (['integer', 'number', 'int', 'float', 'double'].includes(t)) {
        query[p.name] = 'not_a_number';
      } else if (t === 'boolean') {
        query[p.name] = 'not_a_boolean';
      } else {
        query[p.name] = p.example || 'value';
      }
    }
    for (const p of bodyParams) {
      const t = p.type.toLowerCase();
      if (['integer', 'number', 'int', 'float', 'double'].includes(t)) {
        body[p.name] = 'not_a_number';
      } else if (t === 'boolean') {
        body[p.name] = 'not_a_boolean';
      } else {
        body[p.name] = p.example || 'value';
      }
    }
  } else if (mode === 'empty_strings') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, p.example || '1');
    }
    for (const p of queryParams) {
      query[p.name] = '';
    }
    for (const p of bodyParams) {
      body[p.name] = '';
    }
  } else if (mode === 'long_strings') {
    const longStr = 'a'.repeat(10001);
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, p.example || '1');
    }
    for (const p of queryParams) {
      if (p.type.toLowerCase() === 'string') query[p.name] = longStr;
      else query[p.name] = p.example || 'value';
    }
    for (const p of bodyParams) {
      if (p.type.toLowerCase() === 'string') body[p.name] = longStr;
      else body[p.name] = generateExampleValue(p.type, p.name);
    }
  } else if (mode === 'unauthorized') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, p.example || '1');
    }
    for (const p of queryParams) {
      query[p.name] = p.example || generateExampleValue(p.type, p.name);
    }
    for (const p of bodyParams) {
      body[p.name] = generateExampleValue(p.type, p.name);
    }
  } else if (mode === 'not_found') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, '99999999');
    }
    for (const p of queryParams) {
      query[p.name] = p.example || generateExampleValue(p.type, p.name);
    }
  } else if (mode === 'special_chars') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, encodeURIComponent("'; DROP TABLE--"));
    }
    for (const p of queryParams) {
      query[p.name] = "'; DROP TABLE--";
    }
    for (const p of bodyParams) {
      body[p.name] = "'; DROP TABLE--";
    }
  } else if (mode === 'malformed_json') {
    for (const p of pathParams) {
      resolvedPath = resolvedPath.replace(`:${p.name}`, p.example || '1');
    }
    return { path: resolvedPath, method, headers: { 'Content-Type': 'application/json' }, rawBody: '{invalid json}' };
  }

  const result: any = { path: resolvedPath, method, query, headers };
  if (Object.keys(body).length > 0) result.body = body;
  return result;
}

function generateExampleValue(type: string, name: string): any {
  const t = (type || 'string').toLowerCase();
  const n = (name || '').toLowerCase();

  if (n.includes('id')) return 1;
  if (n.includes('email')) return 'user@example.com';
  if (n.includes('phone') || n.includes('mobile')) return '13800000001';
  if (n.includes('name')) return 'sample_name';
  if (n.includes('date') || n.includes('_at')) return new Date().toISOString();
  if (n.includes('url') || n.includes('link')) return 'https://example.com';
  if (n.includes('page')) return 1;
  if (n.includes('limit') || n.includes('size') || n.includes('per_page')) return 20;
  if (n.includes('sort')) return 'created_at';
  if (n.includes('order')) return 'desc';

  if (['integer', 'int', 'number'].includes(t)) return 1;
  if (['float', 'double', 'decimal'].includes(t)) return 1.5;
  if (t === 'boolean') return true;
  if (t.includes('array')) return [];
  if (t.includes('object')) return {};
  return 'sample_value';
}

router.post('/generate-mock', (req, res) => {
  try {
    const { schema, interfaceId, count = 1 } = req.body;

    let resolvedSchema = schema || null;
    let iface: InterfaceData | null = null;

    if (!resolvedSchema && interfaceId) {
      const dbIface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(interfaceId) as InterfaceData | undefined;
      if (!dbIface) {
        return res.status(404).json({ error: 'Interface not found' });
      }
      iface = dbIface;
      resolvedSchema = parseSchema(dbIface.response_schema);
    }

    if (!resolvedSchema) {
      return res.status(400).json({ error: 'schema or interfaceId is required' });
    }

    const countNum = Math.min(100, Math.max(1, Number(count) || 1));
    const generated: any[] = [];

    for (let i = 0; i < countNum; i++) {
      generated.push(generateMockFromSchema(resolvedSchema, i));
    }

    res.json({
      interfaceId: interfaceId || null,
      interfaceName: iface?.name || null,
      schema: resolvedSchema,
      generated,
      count: generated.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Generate mock error:', error);
    res.status(500).json({ error: 'Failed to generate mock data' });
  }
});

function generateMockFromSchema(schema: any, index: number): any {
  if (schema === null || schema === undefined) return null;

  if (Array.isArray(schema)) {
    if (schema.length > 0) {
      return [generateMockFromSchema(schema[0], index)];
    }
    return [];
  }

  if (typeof schema === 'object') {
    if (schema.type === 'array' && schema.items) {
      const items = [];
      const len = schema.minItems || 1;
      for (let i = 0; i < len; i++) {
        items.push(generateMockFromSchema(schema.items, index));
      }
      return items;
    }

    if (schema.type === 'string') {
      return generateMockString(schema, index);
    }

    if (schema.type === 'integer' || schema.type === 'number') {
      return generateMockNumber(schema, index);
    }

    if (schema.type === 'boolean') {
      return index % 2 === 0;
    }

    if (schema.properties) {
      const result: any = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result[key] = generateMockFromSchema(value, index);
      }
      return result;
    }

    if (schema.example !== undefined) {
      return schema.example;
    }

    const result: any = {};
    for (const [key, value] of Object.entries(schema)) {
      if (['type', 'format', 'description', 'example', 'enum', 'minimum', 'maximum', 'minItems', 'items'].includes(key)) continue;
      if (typeof value === 'object' && value !== null) {
        result[key] = generateMockFromSchema(value, index);
      }
    }
    if (Object.keys(result).length === 0) {
      for (const [key, value] of Object.entries(schema)) {
        if (typeof value !== 'object') continue;
        result[key] = generateMockFromSchema(value, index);
      }
    }
    return result;
  }

  if (typeof schema === 'string') {
    if (schema === 'string') return `sample_${index + 1}`;
    if (schema === 'integer' || schema === 'number') return index + 1;
    if (schema === 'boolean') return true;
    return schema;
  }

  if (typeof schema === 'number') return schema + index;
  if (typeof schema === 'boolean') return schema;

  return schema;
}

function generateMockString(schema: any, index: number): string {
  if (schema.example) return schema.example;
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[index % schema.enum.length];
  }

  const format = schema.format || '';
  const desc = (schema.description || '').toLowerCase();

  if (format === 'date') {
    const d = new Date();
    d.setDate(d.getDate() - index);
    return d.toISOString().split('T')[0];
  }
  if (format === 'date-time' || format === 'datetime') {
    const d = new Date();
    d.setHours(d.getHours() - index * 24);
    return d.toISOString();
  }
  if (format === 'email') return `user${index + 1}@example.com`;
  if (format === 'uri' || format === 'url') return `https://example.com/resource/${index + 1}`;
  if (format === 'uuid') return uuidv4();
  if (format === 'ipv4') return `192.168.1.${(index % 254) + 1}`;
  if (format === 'ipv6') return `::${(index + 1).toString(16).padStart(4, '0')}`;

  if (desc.includes('email')) return `user${index + 1}@example.com`;
  if (desc.includes('phone') || desc.includes('mobile') || desc.includes('tel')) return `138${String(index + 1).padStart(8, '0')}`;
  if (desc.includes('name') && desc.includes('first')) {
    const names = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Wei', 'Mei'];
    return names[index % names.length];
  }
  if (desc.includes('name') && desc.includes('last')) {
    const names = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wang', 'Zhang', 'Lee', 'Chen'];
    return names[index % names.length];
  }
  if (desc.includes('name')) {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    return names[index % names.length];
  }
  if (desc.includes('address')) {
    const addresses = ['123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Elm Blvd', '654 Maple Dr'];
    return addresses[index % addresses.length];
  }
  if (desc.includes('city')) {
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Beijing', 'Shanghai'];
    return cities[index % cities.length];
  }
  if (desc.includes('country')) {
    const countries = ['USA', 'China', 'Japan', 'Germany', 'France', 'UK'];
    return countries[index % countries.length];
  }
  if (desc.includes('url') || desc.includes('link')) return `https://example.com/resource/${index + 1}`;
  if (desc.includes('avatar') || desc.includes('image')) return `https://api.dicebear.com/7.x/avataaars/svg?seed=${index + 1}`;
  if (desc.includes('description') || desc.includes('desc')) {
    const descs = ['Sample description for testing', 'Detailed information about the resource', 'Brief overview of the item'];
    return descs[index % descs.length];
  }
  if (desc.includes('title')) {
    const titles = ['Introduction', 'Advanced Guide', 'Getting Started', 'Best Practices'];
    return titles[index % titles.length];
  }
  if (desc.includes('status')) {
    const statuses = ['active', 'inactive', 'pending', 'archived'];
    return statuses[index % statuses.length];
  }
  if (desc.includes('color') || desc.includes('colour')) {
    const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];
    return colors[index % colors.length];
  }

  return `sample_${index + 1}`;
}

function generateMockNumber(schema: any, index: number): number {
  if (schema.example !== undefined) return schema.example;

  const min = schema.minimum ?? 0;
  const max = schema.maximum ?? 1000;
  const range = max - min;

  if (schema.type === 'integer') {
    return min + ((index * 7 + 3) % (range + 1));
  }
  return Number((min + ((index * 7.3 + 3.1) % range)).toFixed(2));
}

router.post('/suggest-params', (req, res) => {
  try {
    const { path, method } = req.body;
    if (!path) {
      return res.status(400).json({ error: 'path is required' });
    }

    const m = (method || 'GET').toUpperCase();
    const suggestions: any[] = [];
    const segments = path.split('/').filter(Boolean);

    for (const seg of segments) {
      if (seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}'))) {
        const paramName = seg.startsWith(':') ? seg.slice(1) : seg.slice(1, -1);
        suggestions.push({
          name: paramName,
          location: 'path',
          type: inferPathParamType(paramName),
          required: true,
          description: `Path parameter: ${paramName}`,
          example: inferPathParamExample(paramName),
        });
      }
    }

    if (m === 'GET') {
      suggestions.push(
        { name: 'page', location: 'query', type: 'integer', required: false, description: 'Page number for pagination', example: 1 },
        { name: 'limit', location: 'query', type: 'integer', required: false, description: 'Number of items per page', example: 20 },
        { name: 'sort', location: 'query', type: 'string', required: false, description: 'Field to sort by', example: 'created_at' },
        { name: 'order', location: 'query', type: 'string', required: false, description: 'Sort direction (asc or desc)', example: 'desc' },
      );

      if (path.includes('search') || path.includes('query') || path.includes('list')) {
        suggestions.push({ name: 'keyword', location: 'query', type: 'string', required: false, description: 'Search keyword', example: '' });
      }

      suggestions.push(
        { name: 'fields', location: 'query', type: 'string', required: false, description: 'Comma-separated list of fields to return', example: 'id,name' },
      );
    }

    if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
      suggestions.push(
        { name: 'Content-Type', location: 'header', type: 'string', required: true, description: 'Request content type', example: 'application/json' },
      );
    }

    suggestions.push(
      { name: 'Authorization', location: 'header', type: 'string', required: false, description: 'Bearer token for authentication', example: 'Bearer <token>' },
    );

    if (m === 'GET') {
      suggestions.push(
        { name: 'If-None-Match', location: 'header', type: 'string', required: false, description: 'ETag for conditional requests', example: '"etag_value"' },
        { name: 'If-Modified-Since', location: 'header', type: 'string', required: false, description: 'Date for conditional requests', example: 'Wed, 01 Jan 2025 00:00:00 GMT' },
      );
    }

    if (path.includes('export') || path.includes('download')) {
      suggestions.push({ name: 'format', location: 'query', type: 'string', required: false, description: 'Export format (json, csv, xlsx)', example: 'json' });
    }

    if (path.includes('filter') || path.includes('search')) {
      suggestions.push({ name: 'status', location: 'query', type: 'string', required: false, description: 'Filter by status', example: 'active' });
    }

    res.json({
      path,
      method: m,
      suggestions,
      totalSuggestions: suggestions.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Suggest params error:', error);
    res.status(500).json({ error: 'Failed to suggest parameters' });
  }
});

function inferPathParamType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('id')) return 'integer';
  if (n.includes('code') || n.includes('slug')) return 'string';
  if (n.includes('date') || n.includes('year') || n.includes('month')) return 'string';
  if (n.includes('uuid')) return 'string';
  return 'string';
}

function inferPathParamExample(name: string): any {
  const n = name.toLowerCase();
  if (n.includes('id')) return 1;
  if (n.includes('uuid')) return '550e8400-e29b-41d4-a716-446655440000';
  if (n.includes('year')) return new Date().getFullYear();
  if (n.includes('month')) return String(new Date().getMonth() + 1).padStart(2, '0');
  if (n.includes('date')) return new Date().toISOString().split('T')[0];
  if (n.includes('code') || n.includes('slug')) return 'example-code';
  return 'sample_value';
}

router.post('/analyze', (req, res) => {
  try {
    const { interfaces } = req.body;
    if (!interfaces || !Array.isArray(interfaces) || interfaces.length === 0) {
      return res.status(400).json({ error: 'interfaces array is required' });
    }

    const resolvedInterfaces: any[] = [];

    for (const item of interfaces) {
      if (typeof item === 'string') {
        const dbIface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(item) as InterfaceData | undefined;
        if (dbIface) {
          const params = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(item) as ParameterData[];
          resolvedInterfaces.push({ ...dbIface, parameters: params, tags: dbIface.tags ? JSON.parse(dbIface.tags) : [] });
        }
      } else {
        resolvedInterfaces.push(item);
      }
    }

    const issues: any[] = [];
    const suggestions: any[] = [];
    const warnings: any[] = [];
    const score = { naming: 100, rest: 100, errors: 100, security: 100 };

    const allPaths = new Set<string>();
    const methodPathMap = new Map<string, any[]>();

    for (const iface of resolvedInterfaces) {
      const method = (iface.method || 'GET').toUpperCase();
      const path = iface.path || '/';
      const key = `${method} ${path}`;

      if (allPaths.has(key)) {
        issues.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'duplicate',
          severity: 'error',
          message: `Duplicate endpoint: ${key}`,
          suggestion: 'Combine duplicate endpoints or differentiate by path',
        });
        score.rest -= 10;
      }
      allPaths.add(key);

      if (!methodPathMap.has(path)) methodPathMap.set(path, []);
      methodPathMap.get(path)!.push(iface);

      if (iface.name) {
        const name = iface.name;
        if (name !== name.trim()) {
          issues.push({
            interfaceId: iface.id,
            interfaceName: name,
            type: 'naming',
            severity: 'warning',
            message: `Interface name has leading/trailing whitespace: "${name}"`,
            suggestion: 'Remove extra whitespace from the name',
          });
          score.naming -= 5;
        }
        if (name.length > 100) {
          issues.push({
            interfaceId: iface.id,
            interfaceName: name,
            type: 'naming',
            severity: 'warning',
            message: `Interface name is too long (${name.length} characters)`,
            suggestion: 'Keep interface names concise (under 100 characters)',
          });
          score.naming -= 5;
        }
        if (/^[a-z]/.test(name) && !name.includes(' ') && /[A-Z]/.test(name)) {
          // camelCase - acceptable
        } else if (/^[A-Z]/.test(name) && !name.includes(' ')) {
          // PascalCase - acceptable
        } else if (name.includes('_') && name === name.toLowerCase()) {
          // snake_case - acceptable
        } else if (name.includes('-') && name === name.toLowerCase()) {
          // kebab-case - acceptable
        } else if (name.includes(' ')) {
          issues.push({
            interfaceId: iface.id,
            interfaceName: name,
            type: 'naming',
            severity: 'info',
            message: `Interface name uses spaces: "${name}"`,
            suggestion: 'Consider using camelCase, PascalCase, snake_case, or kebab-case for consistency',
          });
          score.naming -= 3;
        }
      }

      if (!path.startsWith('/')) {
        issues.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'error',
          message: `Path does not start with /: ${path}`,
          suggestion: 'All API paths should start with a forward slash',
        });
        score.rest -= 15;
      }

      if (path.includes(' ') || path.includes('//')) {
        issues.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'error',
          message: `Path contains spaces or double slashes: ${path}`,
          suggestion: 'Remove spaces and double slashes from the path',
        });
        score.rest -= 10;
      }

      if (path.toLowerCase() !== path && !path.includes(':') && !path.includes('{')) {
        issues.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'naming',
          severity: 'warning',
          message: `Path uses uppercase letters: ${path}`,
          suggestion: 'REST paths should use lowercase with hyphens (kebab-case)',
        });
        score.naming -= 5;
      }

      if (path.includes('_')) {
        suggestions.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'naming',
          severity: 'info',
          message: `Path uses underscores: ${path}`,
          suggestion: 'Consider using hyphens instead of underscores in paths (kebab-case)',
        });
        score.naming -= 2;
      }

      if (method === 'GET') {
        if (path.includes('create') || path.includes('add') || path.includes('new') || path.includes('insert')) {
          issues.push({
            interfaceId: iface.id,
            interfaceName: iface.name,
            type: 'rest',
            severity: 'warning',
            message: `GET method used for what appears to be a create operation: ${path}`,
            suggestion: 'Use POST method for create operations',
          });
          score.rest -= 10;
        }
        if (path.includes('delete') || path.includes('remove')) {
          issues.push({
            interfaceId: iface.id,
            interfaceName: iface.name,
            type: 'rest',
            severity: 'warning',
            message: `GET method used for what appears to be a delete operation: ${path}`,
            suggestion: 'Use DELETE method for delete operations',
          });
          score.rest -= 10;
        }
        if (path.includes('update') || path.includes('edit') || path.includes('modify')) {
          issues.push({
            interfaceId: iface.id,
            interfaceName: iface.name,
            type: 'rest',
            severity: 'warning',
            message: `GET method used for what appears to be an update operation: ${path}`,
            suggestion: 'Use PUT or PATCH method for update operations',
          });
          score.rest -= 10;
        }
      }

      if (method === 'POST' && (path.includes('delete') || path.includes('remove'))) {
        suggestions.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'info',
          message: `POST method used for delete operation: ${path}`,
          suggestion: 'Consider using DELETE method for delete operations',
        });
        score.rest -= 5;
      }

      if (method === 'PUT' && !path.includes(':') && !path.includes('{') && path.split('/').length <= 2) {
        suggestions.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'info',
          message: `PUT on collection-level path without identifier: ${path}`,
          suggestion: 'PUT should typically target a specific resource with an ID in the path',
        });
        score.rest -= 5;
      }

      if (path.includes('action') || path.includes('do')) {
        suggestions.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'info',
          message: `Path uses RPC-style naming: ${path}`,
          suggestion: 'Consider using RESTful resource-based naming instead of action verbs',
        });
        score.rest -= 5;
      }

      const pathSegments = path.split('/').filter(Boolean);
      const lastSegment = pathSegments[pathSegments.length - 1] || '';
      if (method === 'GET' && lastSegment && !lastSegment.startsWith(':') && !lastSegment.startsWith('{') && lastSegment.endsWith('s') && pathSegments.length > 1) {
        // Plural resource name - good
      } else if (method === 'GET' && lastSegment && !lastSegment.startsWith(':') && !lastSegment.startsWith('{') && !lastSegment.endsWith('s') && pathSegments.length > 1) {
        suggestions.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'info',
          message: `Resource name may not be plural: ${lastSegment}`,
          suggestion: 'RESTful convention uses plural nouns for collection resources (e.g., /users instead of /user)',
        });
        score.rest -= 3;
      }

      const params = iface.parameters || [];
      const hasBodyParams = params.some((p: any) => p.location === 'body');
      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !hasBodyParams && !iface.request_schema) {
        warnings.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'missing_body',
          severity: 'warning',
          message: `${method} endpoint has no request body defined`,
          suggestion: 'Define a request body schema or add body parameters',
        });
        score.errors -= 5;
      }

      if (!iface.description || iface.description.trim() === '') {
        warnings.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'missing_description',
          severity: 'info',
          message: `Interface "${iface.name}" has no description`,
          suggestion: 'Add a clear description explaining what this endpoint does',
        });
        score.errors -= 3;
      }

      if (!iface.response_schema) {
        warnings.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'missing_response',
          severity: 'info',
          message: `Interface "${iface.name}" has no response schema defined`,
          suggestion: 'Define a response schema for better documentation and mock generation',
        });
        score.errors -= 3;
      }

      if (path.includes('password') || path.includes('secret') || path.includes('token') || path.includes('key')) {
        issues.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'security',
          severity: 'error',
          message: `Path may expose sensitive data: ${path}`,
          suggestion: 'Avoid including sensitive field names in URL paths; use request body instead',
        });
        score.security -= 20;
      }

      if (method === 'GET' && hasBodyParams) {
        issues.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'rest',
          severity: 'warning',
          message: 'GET request should not have a request body',
          suggestion: 'Use query parameters instead of body for GET requests',
        });
        score.rest -= 10;
      }

      const hasAuthParam = params.some((p: any) =>
        p.name.toLowerCase().includes('auth') || p.name.toLowerCase().includes('token') || p.name.toLowerCase().includes('key')
      );
      if (!hasAuthParam && method !== 'GET') {
        suggestions.push({
          interfaceId: iface.id,
          interfaceName: iface.name,
          type: 'security',
          severity: 'info',
          message: `No authentication parameter defined for ${method} endpoint`,
          suggestion: 'Consider adding authentication (Authorization header) for write operations',
        });
        score.security -= 5;
      }
    }

    const namingPatterns = new Set<string>();
    for (const iface of resolvedInterfaces) {
      const name = iface.name || '';
      if (/^[a-z][a-zA-Z0-9]*$/.test(name)) namingPatterns.add('camelCase');
      else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) namingPatterns.add('PascalCase');
      else if (/^[a-z][a-z0-9_]*$/.test(name)) namingPatterns.add('snake_case');
      else if (/^[a-z][a-z0-9-]*$/.test(name)) namingPatterns.add('kebab-case');
      else if (name.includes(' ')) namingPatterns.add('spaced');
    }
    if (namingPatterns.size > 1) {
      issues.push({
        type: 'naming_consistency',
        severity: 'warning',
        message: `Inconsistent naming conventions detected: ${Array.from(namingPatterns).join(', ')}`,
        suggestion: 'Use a single naming convention across all interfaces for consistency',
      });
      score.naming -= 10;
    }

    methodPathMap.forEach((ifaces, path) => {
      if (ifaces.length > 1) {
        const methods = ifaces.map(i => (i.method || 'GET').toUpperCase());
        if (new Set(methods).size === methods.length) {
        }
      }
    });

    score.naming = Math.max(0, score.naming);
    score.rest = Math.max(0, score.rest);
    score.errors = Math.max(0, score.errors);
    score.security = Math.max(0, score.security);

    const overallScore = Math.round((score.naming + score.rest + score.errors + score.security) / 4);

    res.json({
      totalAnalyzed: resolvedInterfaces.length,
      score: { ...score, overall: overallScore },
      issues,
      suggestions,
      warnings,
      summary: {
        totalFindings: issues.length + suggestions.length + warnings.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length + warnings.length,
        info: suggestions.length + issues.filter(i => i.severity === 'info').length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze interfaces' });
  }
});

router.post('/chat', (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const lowerMsg = message.toLowerCase().trim();
    let response = '';
    let relatedTopics: string[] = [];

    if (lowerMsg.includes('rest') && (lowerMsg.includes('best practice') || lowerMsg.includes('convention') || lowerMsg.includes('guideline'))) {
      response = `REST API Best Practices:\n\n` +
        `1. **Use nouns for resources**: Paths should represent resources (e.g., /users, /orders), not actions.\n` +
        `2. **Use plural nouns**: /users instead of /user for collection endpoints.\n` +
        `3. **Use proper HTTP methods**: GET (read), POST (create), PUT (full update), PATCH (partial update), DELETE (remove).\n` +
        `4. **Use proper status codes**: 200 (OK), 201 (Created), 204 (No Content), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Server Error).\n` +
        `5. **Version your API**: Use URL versioning (/api/v1/) or header versioning.\n` +
        `6. **Support pagination**: Add page/limit or cursor-based pagination for list endpoints.\n` +
        `7. **Use consistent error format**: Return errors in a consistent JSON structure.\n` +
        `8. **Filter and sort**: Support query parameters for filtering, sorting, and field selection.\n` +
        `9. **HATEOAS**: Consider including links to related resources in responses.\n` +
        `10. **Documentation**: Always document your endpoints with OpenAPI/Swagger.`;
      relatedTopics = ['naming', 'status-codes', 'versioning', 'pagination'];
    } else if (lowerMsg.includes('status code') || lowerMsg.includes('http code') || lowerMsg.includes('response code')) {
      response = `Common HTTP Status Codes for APIs:\n\n` +
        `**Success (2xx):**\n` +
        `- 200 OK: Successful GET, PUT, PATCH, or DELETE\n` +
        `- 201 Created: Successful POST (resource created)\n` +
        `- 202 Accepted: Request accepted for async processing\n` +
        `- 204 No Content: Successful DELETE or empty response\n\n` +
        `**Client Errors (4xx):**\n` +
        `- 400 Bad Request: Invalid input, validation errors\n` +
        `- 401 Unauthorized: Missing or invalid authentication\n` +
        `- 403 Forbidden: Authenticated but not authorized\n` +
        `- 404 Not Found: Resource does not exist\n` +
        `- 409 Conflict: Resource already exists or state conflict\n` +
        `- 422 Unprocessable Entity: Validation failure\n` +
        `- 429 Too Many Requests: Rate limit exceeded\n\n` +
        `**Server Errors (5xx):**\n` +
        `- 500 Internal Server Error: Unexpected server failure\n` +
        `- 502 Bad Gateway: Invalid upstream response\n` +
        `- 503 Service Unavailable: Server temporarily unavailable`;
      relatedTopics = ['rest', 'error-handling', 'best-practices'];
    } else if (lowerMsg.includes('naming') || lowerMsg.includes('name convention') || lowerMsg.includes('name style')) {
      response = `API Naming Conventions:\n\n` +
        `**Path Naming:**\n` +
        `- Use lowercase letters with hyphens (kebab-case): /user-profile, /order-items\n` +
        `- Use plural nouns for collections: /users, /orders\n` +
        `- Avoid verbs in paths: /users instead of /getUsers\n` +
        `- Use consistent naming across the API\n\n` +
        `**Parameter Naming:**\n` +
        `- Use camelCase or snake_case consistently\n` +
        `- Be descriptive: createdAt instead of ca\n` +
        `- Use consistent boolean prefixes: isActive, hasPermission\n\n` +
        `**Interface Naming:**\n` +
        `- Choose one convention and stick to it: camelCase, PascalCase, or snake_case\n` +
        `- Include the resource and action: getUserList, createOrder\n` +
        `- Avoid abbreviations unless universally understood`;
      relatedTopics = ['rest', 'consistency', 'best-practices'];
    } else if (lowerMsg.includes('pagination') || lowerMsg.includes('page') || lowerMsg.includes('list') && lowerMsg.includes('api')) {
      response = `API Pagination Strategies:\n\n` +
        `**Offset-based Pagination:**\n` +
        `- Parameters: page (or offset) and limit (or pageSize)\n` +
        `- Simple to implement and understand\n` +
        `- Works well for small-to-medium datasets\n` +
        `- Example: GET /users?page=2&limit=20\n\n` +
        `**Cursor-based Pagination:**\n` +
        `- Parameters: cursor (or after/before) and limit\n` +
        `- More efficient for large datasets\n` +
        `- Consistent results even with data changes\n` +
        `- Example: GET /users?cursor=abc123&limit=20\n\n` +
        `**Keyset Pagination:**\n` +
        `- Uses the last seen value as a filter\n` +
        `- Best performance for ordered data\n` +
        `- Example: GET /users?created_after=2025-01-01&limit=20\n\n` +
        `**Response Format:**\n` +
        `Include metadata: total count, current page, has_more/next_cursor`;
      relatedTopics = ['rest', 'performance', 'best-practices'];
    } else if (lowerMsg.includes('version') || lowerMsg.includes('versioning')) {
      response = `API Versioning Strategies:\n\n` +
        `**URL Path Versioning:**\n` +
        `- /api/v1/users, /api/v2/users\n` +
        `- Most visible and commonly used\n` +
        `- Easy to understand and implement\n\n` +
        `**Header Versioning:**\n` +
        `- Accept: application/vnd.api.v1+json\n` +
        `- API-Version: 2\n` +
        `- Cleaner URLs but less visible\n\n` +
        `**Query Parameter Versioning:**\n` +
        `- /api/users?version=1\n` +
        `- Simple but less RESTful\n\n` +
        `**Best Practices:**\n` +
        `- Start with versioning from day one\n` +
        `- Support at least 2 versions simultaneously\n` +
        `- Plan a deprecation timeline for old versions\n` +
        `- Document breaking vs. non-breaking changes`;
      relatedTopics = ['rest', 'best-practices', 'migration'];
    } else if (lowerMsg.includes('security') || lowerMsg.includes('auth') || lowerMsg.includes('authentication') || lowerMsg.includes('authorization')) {
      response = `API Security Best Practices:\n\n` +
        `**Authentication:**\n` +
        `- Use OAuth 2.0 / OpenID Connect for user authentication\n` +
        `- Use API keys for service-to-service communication\n` +
        `- Implement JWT tokens with proper expiration\n` +
        `- Store tokens securely (httpOnly cookies for web)\n\n` +
        `**Authorization:**\n` +
        `- Implement role-based access control (RBAC)\n` +
        `- Check permissions on every request\n` +
        `- Use the principle of least privilege\n\n` +
        `**Input Validation:**\n` +
        `- Validate all input parameters (type, length, format)\n` +
        `- Sanitize input to prevent injection attacks\n` +
        `- Use parameterized queries for database access\n\n` +
        `**Other Security Measures:**\n` +
        `- Use HTTPS everywhere\n` +
        `- Implement rate limiting\n` +
        `- Add CORS headers properly\n` +
        `- Never expose sensitive data in URLs\n` +
        `- Log security events for auditing`;
      relatedTopics = ['rest', 'best-practices', 'error-handling'];
    } else if (lowerMsg.includes('error') && (lowerMsg.includes('handle') || lowerMsg.includes('format') || lowerMsg.includes('design'))) {
      response = `API Error Handling Best Practices:\n\n` +
        `**Consistent Error Format:**\n` +
        `{\n` +
        `  "error": {\n` +
        `    "code": "VALIDATION_ERROR",\n` +
        `    "message": "Invalid request parameters",\n` +
        `    "details": [\n` +
        `      { "field": "email", "message": "Invalid email format" }\n` +
        `    ]\n` +
        `  }\n` +
        `}\n\n` +
        `**Error Code Strategy:**\n` +
        `- Use machine-readable error codes (not just HTTP status)\n` +
        `- Include human-readable messages\n` +
        `- Provide field-level validation details\n` +
        `- Include a documentation link for error resolution\n\n` +
        `**Common Error Patterns:**\n` +
        `- 400: Input validation errors with field details\n` +
        `- 401: Missing/invalid auth with login hint\n` +
        `- 403: Permission denied with required role info\n` +
        `- 404: Resource not found with resource type\n` +
        `- 409: Conflict with conflicting resource info\n` +
        `- 429: Rate limit with retry-after header\n` +
        `- 500: Generic message (never expose stack traces)`;
      relatedTopics = ['rest', 'status-codes', 'security'];
    } else if (lowerMsg.includes('mock') || lowerMsg.includes('test data') || lowerMsg.includes('fake data')) {
      response = `Mock Data Generation Tips:\n\n` +
        `**Realistic Test Data:**\n` +
        `- Use realistic names, emails, and addresses\n` +
        `- Generate data that matches your schema constraints\n` +
        `- Include edge cases: empty strings, max lengths, special characters\n` +
        `- Test with both valid and invalid data\n\n` +
        `**Mock Server Benefits:**\n` +
        `- Develop frontend without waiting for backend\n` +
        `- Test error scenarios reliably\n` +
        `- Demo with consistent data\n` +
        `- Automated testing with predictable responses\n\n` +
        `**Using Interface Hub Mock:**\n` +
        `- Create mock configs for each interface\n` +
        `- Define response templates with realistic data\n` +
        `- Set delays to simulate network latency\n` +
        `- Use the /api/mock/proxy/* endpoint to test`;
      relatedTopics = ['testing', 'development', 'best-practices'];
    } else if (lowerMsg.includes('test') || lowerMsg.includes('testing')) {
      response = `API Testing Strategies:\n\n` +
        `**Test Categories:**\n` +
        `- **Happy path**: Valid inputs, expected outputs\n` +
        `- **Edge cases**: Boundary values, empty inputs, null values\n` +
        `- **Error cases**: Invalid types, missing required fields, unauthorized access\n` +
        `- **Security tests**: SQL injection, XSS, auth bypass\n\n` +
        `**Test Automation:**\n` +
        `- Unit tests for business logic\n` +
        `- Integration tests for API endpoints\n` +
        `- Contract tests for API compatibility\n` +
        `- Load/performance tests for scalability\n\n` +
        `**Using Interface Hub Test Generation:**\n` +
        `- Use POST /api/ai/generate-test to auto-generate test cases\n` +
        `- Review and customize generated tests\n` +
        `- Add project-specific test scenarios\n` +
        `- Integrate with your CI/CD pipeline`;
      relatedTopics = ['mock', 'security', 'automation'];
    } else if (lowerMsg.includes('documentation') || lowerMsg.includes('doc') || lowerMsg.includes('readme')) {
      response = `API Documentation Best Practices:\n\n` +
        `**Essential Documentation Elements:**\n` +
        `- Clear endpoint descriptions\n` +
        `- Parameter tables with types and requirements\n` +
        `- Request/response examples\n` +
        `- Error response documentation\n` +
        `- Authentication requirements\n\n` +
        `**Documentation Formats:**\n` +
        `- OpenAPI/Swagger for machine-readable docs\n` +
        `- Markdown for human-readable guides\n` +
        `- Interactive docs (Swagger UI, Redoc)\n\n` +
        `**Using Interface Hub Doc Generation:**\n` +
        `- Use POST /api/ai/generate-doc to auto-generate markdown docs\n` +
        `- Use GET /api/docs/generate/:interfaceId for structured docs\n` +
        `- Export to OpenAPI format with /api/openapi endpoints\n` +
        `- Keep docs in sync with interface definitions`;
      relatedTopics = ['rest', 'openapi', 'best-practices'];
    } else if (lowerMsg.includes('openapi') || lowerMsg.includes('swagger')) {
      response = `OpenAPI/Swagger Specification:\n\n` +
        `**OpenAPI 3.0 Key Concepts:**\n` +
        `- **Paths**: Define your endpoints (URL paths + methods)\n` +
        `- **Operations**: HTTP methods on each path\n` +
        `- **Schemas**: Data models using JSON Schema\n` +
        `- **Parameters**: Path, query, header, cookie params\n` +
        `- **Request Bodies**: Input payloads with content types\n` +
        `- **Responses**: Status codes with response schemas\n\n` +
        `**Best Practices:**\n` +
        `- Use $ref for reusable schemas\n` +
        `- Add examples to schemas and parameters\n` +
        `- Document all error responses\n` +
        `- Use tags to organize endpoints\n` +
        `- Include server configurations\n\n` +
        `**Interface Hub Support:**\n` +
        `- Import OpenAPI specs via /api/openapi/import\n` +
        `- Export interfaces as OpenAPI via /api/openapi/export`;
      relatedTopics = ['documentation', 'rest', 'import'];
    } else if (lowerMsg.includes('how many') && (lowerMsg.includes('interface') || lowerMsg.includes('api'))) {
      const total = db.prepare('SELECT COUNT(*) as count FROM interfaces').get() as any;
      const byMethod = db.prepare('SELECT method, COUNT(*) as count FROM interfaces GROUP BY method').all() as any[];
      const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM interfaces GROUP BY status').all() as any[];
      response = `You currently have **${total.count} interfaces** in your project.\n\n` +
        `**By Method:**\n` +
        byMethod.map(m => `- ${m.method}: ${m.count}`).join('\n') + '\n\n' +
        `**By Status:**\n` +
        byStatus.map(s => `- ${s.status}: ${s.count}`).join('\n');
      relatedTopics = ['stats', 'overview'];
    } else if (lowerMsg.includes('help') || lowerMsg.includes('what can you') || lowerMsg.includes('what do you')) {
      response = `I'm an AI assistant for API design in Interface Hub. Here's what I can help with:\n\n` +
        `**Generate Documentation** (POST /api/ai/generate-doc)\n` +
        `Auto-generate markdown API docs from interface definitions.\n\n` +
        `**Generate Test Cases** (POST /api/ai/generate-test)\n` +
        `Create test cases covering happy path, edge cases, errors, and boundaries.\n\n` +
        `**Generate Mock Data** (POST /api/ai/generate-mock)\n` +
        `Produce realistic mock response data based on schemas.\n\n` +
        `**Suggest Parameters** (POST /api/ai/suggest-params)\n` +
        `Get parameter suggestions based on REST conventions and path analysis.\n\n` +
        `**Analyze API Design** (POST /api/ai/analyze)\n` +
        `Review interfaces for naming, REST compliance, security, and completeness.\n\n` +
        `**Chat** (POST /api/ai/chat)\n` +
        `Ask me about API design best practices, REST conventions, status codes, and more!\n\n` +
        `Try asking about: REST best practices, status codes, naming conventions, pagination, versioning, security, error handling, testing, or documentation.`;
      relatedTopics = ['overview', 'features'];
    } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
      response = `Hello! I'm your API design assistant in Interface Hub. I can help you with:\n\n` +
        `- REST API best practices and conventions\n` +
        `- HTTP status code guidance\n` +
        `- Naming conventions for APIs\n` +
        `- Pagination, versioning, and security strategies\n` +
        `- Error handling patterns\n` +
        `- Testing and mock data generation\n` +
        `- Documentation best practices\n\n` +
        `What would you like to know about?`;
      relatedTopics = ['greeting'];
    } else {
      const keywords = lowerMsg.split(/\s+/);
      const keywordMap: Record<string, string> = {
        'rest': 'rest', 'api': 'rest', 'endpoint': 'rest', 'resource': 'rest',
        'get': 'rest', 'post': 'rest', 'put': 'rest', 'patch': 'rest', 'delete': 'rest',
        'status': 'status-codes', 'code': 'status-codes', '200': 'status-codes', '400': 'status-codes', '404': 'status-codes', '500': 'status-codes',
        'name': 'naming', 'convention': 'naming', 'style': 'naming', 'camel': 'naming', 'snake': 'naming',
        'page': 'pagination', 'pagination': 'pagination', 'cursor': 'pagination', 'offset': 'pagination',
        'version': 'versioning', 'v1': 'versioning', 'v2': 'versioning',
        'security': 'security', 'auth': 'security', 'token': 'security', 'oauth': 'security', 'jwt': 'security',
        'error': 'error-handling', 'exception': 'error-handling', 'fail': 'error-handling',
        'mock': 'mock', 'fake': 'mock', 'stub': 'mock',
        'test': 'testing', 'spec': 'testing', 'assert': 'testing',
        'doc': 'documentation', 'readme': 'documentation', 'swagger': 'documentation', 'openapi': 'documentation',
      };

      let matchedTopic = '';
      for (const kw of keywords) {
        if (keywordMap[kw]) {
          matchedTopic = keywordMap[kw];
          break;
        }
      }

      if (matchedTopic) {
        response = `I detected you might be asking about **${matchedTopic}**. Here are some tips:\n\n` +
          `Could you be more specific? For example:\n` +
          `- "What are REST best practices?"\n` +
          `- "How should I handle API errors?"\n` +
          `- "What status codes should I use?"\n` +
          `- "How do I version my API?"\n` +
          `- "What naming conventions should I follow?"\n\n` +
          `Type "help" to see all the topics I can assist with.`;
        relatedTopics = [matchedTopic];
      } else {
        response = `I'm not sure I understand your question. I specialize in API design topics such as:\n\n` +
          `- REST best practices and conventions\n` +
          `- HTTP status codes\n` +
          `- Naming conventions\n` +
          `- Pagination strategies\n` +
          `- API versioning\n` +
          `- Security and authentication\n` +
          `- Error handling patterns\n` +
          `- Testing and mock data\n` +
          `- Documentation\n\n` +
          `Try rephrasing your question or type "help" for a full list of what I can do.`;
        relatedTopics = ['help'];
      }
    }

    if (context && typeof context === 'object') {
      if (context.interfaceId) {
        const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(context.interfaceId) as InterfaceData | undefined;
        if (iface) {
          response += `\n\n---\n*Context: You're asking about interface "${iface.name}" (${iface.method} ${iface.path})*`;
        }
      }
      if (context.projectName) {
        const projectInterfaces = db.prepare('SELECT COUNT(*) as count FROM interfaces WHERE category = ?').get(context.projectName) as any;
        if (projectInterfaces.count > 0) {
          response += `\n\n*Context: Project "${context.projectName}" has ${projectInterfaces.count} interfaces.*`;
        }
      }
    }

    res.json({
      message: response,
      relatedTopics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;
