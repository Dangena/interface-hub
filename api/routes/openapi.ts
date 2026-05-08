import { Router } from 'express';
import { pool, query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { cacheManager } from '../utils/cache';

const router = Router();

router.post('/parse', (req, res) => {
  try {
    const { spec } = req.body;
    if (!spec) {
      return res.status(400).json({ error: 'OpenAPI spec is required' });
    }

    const result = parseOpenApiSpec(spec);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse OpenAPI spec', details: (error as Error).message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const { spec, options } = req.body;
    if (!spec) {
      return res.status(400).json({ error: 'OpenAPI spec is required' });
    }

    const parsed = parseOpenApiSpec(spec);
    const now = new Date().toISOString();
    const imported = { interfaces: 0, parameters: 0, models: 0, skipped: 0 };
    const overwrite = options?.overwrite || false;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const iface of parsed.interfaces) {
        const existing = (await client.query('SELECT id FROM interfaces WHERE path = $1 AND method = $2', [iface.path, iface.method])).rows[0] as any;

        if (existing) {
          if (overwrite) {
            await client.query('DELETE FROM parameters WHERE interface_id = $1', [existing.id]);
            await client.query('DELETE FROM field_mappings WHERE interface_id = $1', [existing.id]);
            await client.query('DELETE FROM interfaces WHERE id = $1', [existing.id]);
          } else {
            imported.skipped++;
            continue;
          }
        }

        const id = uuidv4();
        await client.query(`
          INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, request_schema, response_schema, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          id,
          iface.name,
          iface.path,
          iface.method,
          iface.description || '',
          iface.category || '',
          JSON.stringify(iface.tags || []),
          'published',
          parsed.info?.version || '1.0.0',
          iface.requestSchema ? JSON.stringify(iface.requestSchema) : null,
          iface.responseSchema ? JSON.stringify(iface.responseSchema) : null,
          'openapi-import',
          now,
          now
        ]);

        for (const param of iface.parameters || []) {
          await client.query(`
            INSERT INTO parameters (id, interface_id, name, location, type, required, description, example)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            uuidv4(),
            id,
            param.name,
            param.location,
            param.type || 'string',
            param.required ? 1 : 0,
            param.description || '',
            param.example || ''
          ]);
          imported.parameters++;
        }

        imported.interfaces++;
      }

      for (const model of parsed.models || []) {
        const existing = (await client.query('SELECT name FROM data_models WHERE name = $1', [model.name])).rows[0];
        if (existing) {
          if (!overwrite) {
            continue;
          }
          await client.query('DELETE FROM fields WHERE model_name = $1', [model.name]);
          await client.query('DELETE FROM data_models WHERE name = $1', [model.name]);
        }

        await client.query(`
          INSERT INTO data_models (name, table_name, description, schema, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          model.name,
          model.name.toLowerCase(),
          model.description || `Imported from OpenAPI spec`,
          model.schema ? JSON.stringify(model.schema) : null,
          now,
          now
        ]);

        for (const field of model.fields || []) {
          await client.query(`
            INSERT INTO fields (id, model_name, name, column_name, type, nullable, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            uuidv4(),
            model.name,
            field.name,
            field.name.toLowerCase(),
            field.type || 'string',
            field.nullable ? 1 : 0,
            field.description || ''
          ]);
        }

        imported.models++;
      }

      await client.query('COMMIT');
    } catch (_e: any) {
      await client.query('ROLLBACK');
      throw _e;
    } finally {
      client.release();
    }

    cacheManager.invalidate('interfaces:');
    cacheManager.invalidate('models:');

    res.json({ success: true, imported, info: parsed.info });
  } catch (error) {
    res.status(500).json({ error: 'Failed to import OpenAPI spec', details: (error as Error).message });
  }
});

function parseOpenApiSpec(spec: any): {
  interfaces: any[];
  models: any[];
  info: any;
} {
  const info = {
    title: spec.info?.title || 'Untitled API',
    version: spec.info?.version || '1.0.0',
    description: spec.info?.description || '',
  };

  const models = extractModels(spec);
  const interfaces = extractInterfaces(spec);

  return { interfaces, models, info };
}

function extractModels(spec: any): any[] {
  const models: Record<string, any> = {};
  const schemas = spec.components?.schemas || spec.definitions || {};

  for (const [name, schema] of Object.entries(schemas) as any[]) {
    const fields: any[] = [];
    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const [propName, propSchema] of Object.entries(properties) as any[]) {
      fields.push({
        name: propName,
        type: resolveType(propSchema),
        nullable: !required.includes(propName),
        description: propSchema.description || '',
      });
    }

    models[name] = {
      name,
      fields,
      description: schema.description || '',
      schema: schema,
    };
  }

  return Object.values(models);
}

function extractInterfaces(spec: any): any[] {
  const interfaces: any[] = [];
  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths) as any[]) {
    for (const [method, operation] of Object.entries(methods) as any[]) {
      if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase())) continue;

      const parameters = extractParameters(operation, path);
      const requestSchema = extractRequestSchema(operation);
      const responseSchema = extractResponseSchema(operation);

      interfaces.push({
        name: operation.summary || operation.operationId || generateName(path, method),
        path,
        method: method.toUpperCase(),
        description: operation.description || operation.summary || '',
        category: operation.tags?.[0] || '',
        tags: operation.tags || [],
        parameters,
        requestSchema,
        responseSchema,
        deprecated: operation.deprecated || false,
      });
    }
  }

  return interfaces;
}

function extractParameters(operation: any, path: string): any[] {
  const params: any[] = [];

  const pathParamRegex = /\{(\w+)\}/g;
  let match;
  while ((match = pathParamRegex.exec(path)) !== null) {
    const defined = (operation.parameters || []).find(
      (p: any) => p.name === match[1] && p.in === 'path'
    );
    params.push({
      name: match[1],
      location: 'path',
      type: defined?.schema ? resolveType(defined.schema) : 'string',
      required: true,
      description: defined?.description || '',
      example: defined?.example || defined?.schema?.example || '',
    });
  }

  for (const param of operation.parameters || []) {
    if (param.in === 'path' && params.some((p) => p.name === param.name)) continue;

    params.push({
      name: param.name,
      location: param.in,
      type: param.schema ? resolveType(param.schema) : 'string',
      required: param.required || false,
      description: param.description || '',
      example: param.example || param.schema?.example || '',
    });
  }

  return params;
}

function extractRequestSchema(operation: any): any {
  const content = operation.requestBody?.content;
  if (!content) return null;

  const jsonContent = content['application/json'] || content['*/*'];
  if (!jsonContent?.schema) return null;

  return resolveSchema(jsonContent.schema);
}

function extractResponseSchema(operation: any): any {
  const successResp = operation.responses?.['200'] || operation.responses?.['201'] || operation.responses?.['default'];
  if (!successResp?.content) return null;

  const jsonContent = successResp.content['application/json'] || successResp.content['*/*'];
  if (!jsonContent?.schema) return null;

  return resolveSchema(jsonContent.schema);
}

function resolveSchema(schema: any): any {
  if (!schema) return null;

  if (schema.$ref) {
    return { $ref: schema.$ref };
  }

  if (schema.allOf) {
    return { allOf: schema.allOf.map(resolveSchema) };
  }

  if (schema.oneOf) {
    return { oneOf: schema.oneOf.map(resolveSchema) };
  }

  if (schema.anyOf) {
    return { anyOf: schema.anyOf.map(resolveSchema) };
  }

  const result: any = { type: schema.type || 'object' };

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties) as any[]) {
      result.properties[key] = resolveSchema(value);
    }
  }

  if (schema.items) {
    result.items = resolveSchema(schema.items);
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (schema.description) {
    result.description = schema.description;
  }

  return result;
}

function resolveType(schema: any): string {
  if (!schema) return 'string';

  if (schema.type) {
    const typeMap: Record<string, string> = {
      integer: 'integer',
      number: 'number',
      boolean: 'boolean',
      string: 'string',
      array: 'array',
      object: 'object',
    };

    let type = typeMap[schema.type] || 'string';

    if (schema.type === 'string' && schema.format) {
      const formatMap: Record<string, string> = {
        'date-time': 'string',
        date: 'string',
        email: 'string',
        uri: 'string',
        uuid: 'string',
        binary: 'file',
        byte: 'string',
      };
      type = formatMap[schema.format] || 'string';
    }

    if (schema.type === 'integer' && schema.format === 'int64') {
      type = 'integer';
    }

    return type;
  }

  if (schema.$ref) {
    const parts = schema.$ref.split('/');
    return parts[parts.length - 1];
  }

  return 'string';
}

function generateName(path: string, method: string): string {
  const segments = path.split('/').filter((s) => s && !s.startsWith('{'));
  const actionMap: Record<string, string> = {
    GET: 'Get',
    POST: 'Create',
    PUT: 'Update',
    DELETE: 'Delete',
    PATCH: 'Patch',
  };
  const action = actionMap[method.toUpperCase()] || method;
  const resource = segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return `${action}${resource || 'Root'}`;
}

router.get('/export', async (req, res) => {
  try {
    const { category, status } = req.query;

    let whereClause = '1=1';
    const params: any[] = [];
    let paramIdx = 1;
    if (category) {
      whereClause += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    if (status) {
      whereClause += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    const interfaces = (await query(`SELECT * FROM interfaces WHERE ${whereClause} ORDER BY path, method`, params)).rows as any[];
    const models = (await query('SELECT * FROM data_models ORDER BY name')).rows as any[];

    const spec: any = {
      openapi: '3.0.3',
      info: {
        title: 'Interface Hub API',
        version: '1.0.0',
        description: 'Auto-generated OpenAPI specification from Interface Hub',
      },
      paths: {},
      components: { schemas: {} },
    };

    const tags = new Set<string>();

    for (const iface of interfaces) {
      const path = iface.path;
      const method = iface.method.toLowerCase();

      if (!spec.paths[path]) {
        spec.paths[path] = {};
      }

      const operation: any = {
        summary: iface.name,
        description: iface.description || '',
        operationId: generateOperationId(iface.path, iface.method),
        tags: [],
      };

      if (iface.tags) {
        try {
          const parsedTags = typeof iface.tags === 'string' ? JSON.parse(iface.tags) : iface.tags;
          if (Array.isArray(parsedTags) && parsedTags.length > 0) {
            operation.tags = parsedTags;
            parsedTags.forEach((t: string) => tags.add(t));
          }
        } catch (_e) {}
      }

      if (iface.category && !operation.tags.length) {
        operation.tags = [iface.category];
        tags.add(iface.category);
      }

      const parameters = (await query('SELECT * FROM parameters WHERE interface_id = $1', [iface.id])).rows as any[];
      if (parameters.length > 0) {
        operation.parameters = parameters.map((p) => {
          const param: any = {
            name: p.name,
            in: p.location,
            required: Boolean(p.required),
            description: p.description || '',
            schema: { type: mapParamType(p.type) },
          };
          if (p.example) {
            param.example = p.example;
          }
          return param;
        });
      }

      if (iface.request_schema) {
        try {
          const requestSchema = typeof iface.request_schema === 'string' ? JSON.parse(iface.request_schema) : iface.request_schema;
          operation.requestBody = {
            content: {
              'application/json': {
                schema: requestSchema,
              },
            },
          };
        } catch (_e) {}
      }

      operation.responses = {
        '200': {
          description: 'Successful response',
        },
      };

      if (iface.response_schema) {
        try {
          const responseSchema = typeof iface.response_schema === 'string' ? JSON.parse(iface.response_schema) : iface.response_schema;
          operation.responses['200'].content = {
            'application/json': {
              schema: responseSchema,
            },
          };
        } catch (_e) {}
      }

      if (iface.status === 'deprecated') {
        operation.deprecated = true;
      }

      spec.paths[path][method] = operation;
    }

    for (const model of models) {
      const fields = (await query('SELECT * FROM fields WHERE model_name = $1', [model.name])).rows as any[];
      const schema: any = {
        type: 'object',
        properties: {},
        required: [],
      };

      if (model.description) {
        schema.description = model.description;
      }

      for (const field of fields) {
        schema.properties[field.name || field.column_name] = {
          type: mapParamType(field.type),
          description: field.comment || '',
        };
        if (!field.nullable) {
          schema.required.push(field.name || field.column_name);
        }
      }

      if (schema.required.length === 0) {
        delete schema.required;
      }

      spec.components.schemas[model.name] = schema;
    }

    if (tags.size > 0) {
      spec.tags = Array.from(tags).map((t) => ({ name: t }));
    }

    if (Object.keys(spec.components.schemas).length === 0) {
      delete spec.components;
    }

    const format = (req.query.format as string) || 'json';
    if (format === 'yaml') {
      res.setHeader('Content-Type', 'text/yaml');
      res.setHeader('Content-Disposition', 'attachment; filename="openapi.yaml"');
      const yaml = jsonToYaml(spec);
      res.send(yaml);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="openapi.json"');
      res.json(spec);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to export OpenAPI spec', details: (error as Error).message });
  }
});

function generateOperationId(path: string, method: string): string {
  const segments = path.split('/').filter((s) => s && !s.startsWith('{') && !s.startsWith(':'));
  const action = method.toLowerCase();
  const resource = segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return `${action}${resource || 'Root'}`;
}

function mapParamType(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    integer: 'integer',
    int: 'integer',
    number: 'number',
    float: 'number',
    double: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    array: 'array',
    object: 'object',
    file: 'string',
  };
  return typeMap[type?.toLowerCase()] || 'string';
}

function jsonToYaml(obj: any, indent: number = 0): string {
  const prefix = '  '.repeat(indent);
  let result = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `${prefix}-\n${jsonToYaml(item, indent + 1)}`;
      } else {
        result += `${prefix}- ${yamlValue(item)}\n`;
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      if (value === null) {
        result += `${prefix}${key}: null\n`;
      } else if (typeof value === 'object') {
        if (Object.keys(value).length === 0 && !Array.isArray(value)) {
          result += `${prefix}${key}: {}\n`;
        } else if (Array.isArray(value) && value.length === 0) {
          result += `${prefix}${key}: []\n`;
        } else {
          result += `${prefix}${key}:\n${jsonToYaml(value, indent + 1)}`;
        }
      } else {
        result += `${prefix}${key}: ${yamlValue(value)}\n`;
      }
    }
  }

  return result;
}

function yamlValue(value: any): string {
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes("'") || value.includes('"') || value.includes('\n') || value.includes('{') || value.includes('}') || value.includes('[') || value.includes(']') || value.includes(',') || value.includes('&') || value.includes('*') || value.includes('!') || value.includes('|') || value.includes('>') || value.includes('%') || value.includes('@') || value.includes('`') || value.trim() === '' || !isNaN(Number(value)) || value === 'true' || value === 'false' || value === 'null') {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return String(value);
}

export default router;
