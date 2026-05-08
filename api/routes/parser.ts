import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';

const router = Router();

interface ParsedInterface {
  name: string;
  path: string;
  method: string;
  description: string;
  parameters: Array<{
    name: string;
    location: string;
    type: string;
    required: boolean;
  }>;
  requestBody?: string;
  responseBody?: string;
  tags: string[];
}

interface ParsedModel {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    comment?: string;
  }>;
}

router.post('/parse/java', (req, res) => {
  try {
    const { code } = req.body;
    const interfaces = parseJavaController(code);
    const models = parseJavaModels(code);
    res.json({ interfaces, models });
  } catch (error) {
    console.error('Parse Java error:', error);
    res.status(500).json({ error: 'Failed to parse Java code', details: (error as Error).message });
  }
});

router.post('/parse/node', (req, res) => {
  try {
    const { code } = req.body;
    const interfaces = parseNodeExpress(code);
    res.json({ interfaces });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse Node.js code' });
  }
});

router.post('/parse/python', (req, res) => {
  try {
    const { code } = req.body;
    const interfaces = parsePythonFlask(code);
    const models = parsePythonModels(code);
    res.json({ interfaces, models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse Python code', details: (error as Error).message });
  }
});

router.post('/parse/go', (req, res) => {
  try {
    const { code } = req.body;
    const interfaces = parseGoHandlers(code);
    const models = parseGoStructs(code);
    res.json({ interfaces, models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse Go code', details: (error as Error).message });
  }
});

router.post('/parse/files', (req, res) => {
  try {
    const { files } = req.body;
    const allInterfaces: ParsedInterface[] = [];
    const allModels: ParsedModel[] = [];

    files.forEach((file: any) => {
      const { filename, content } = file;
      
      if (filename.endsWith('.java')) {
        if (filename.includes('Controller') || filename.includes('controller')) {
          const interfaces = parseJavaController(content);
          allInterfaces.push(...interfaces);
        } else if (filename.includes('DTO') || filename.includes('Model') || filename.includes('Entity')) {
          const models = parseJavaModels(content);
          allModels.push(...models);
        }
      } else if (filename.endsWith('.ts') || filename.endsWith('.js')) {
        const interfaces = parseNodeExpress(content);
        allInterfaces.push(...interfaces);
        
        const models = parseNodeModels(content);
        allModels.push(...models);
      } else if (filename.endsWith('.py')) {
        const interfaces = parsePythonFlask(content);
        allInterfaces.push(...interfaces);
        const models = parsePythonModels(content);
        allModels.push(...models);
      } else if (filename.endsWith('.go')) {
        const interfaces = parseGoHandlers(content);
        allInterfaces.push(...interfaces);
        const models = parseGoStructs(content);
        allModels.push(...models);
      }
    });

    res.json({ interfaces: allInterfaces, models: allModels });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse files' });
  }
});

router.post('/import/parsed', async (req, res) => {
  try {
    const { interfaces, models } = req.body;
    const now = new Date().toISOString();
    const imported = { interfaces: 0, models: 0, mappings: 0 };

    for (const iface of interfaces) {
      const existing = db.prepare('SELECT * FROM interfaces WHERE path = ? AND method = ?').get(iface.path, iface.method);
      if (existing) continue;

      const id = uuidv4();
      db.prepare(`
        INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        iface.name,
        iface.path,
        iface.method,
        iface.description,
        iface.tags[0] || 'Uncategorized',
        JSON.stringify(iface.tags),
        'published',
        '1.0.0',
        now,
        now
      );

      for (const param of iface.parameters) {
        db.prepare(`
          INSERT INTO parameters (id, interface_id, name, location, type, required, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), id, param.name, param.location, param.type, param.required ? 1 : 0, '');
      }

      imported.interfaces++;
    }

    for (const model of models) {
      const existing = db.prepare('SELECT * FROM data_models WHERE name = ?').get(model.name);
      if (existing) continue;

      db.prepare(`
        INSERT INTO data_models (name, table_name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(model.name, model.name.toLowerCase() + 's', 'Auto imported from code', now, now);

      for (const field of model.fields) {
        db.prepare(`
          INSERT INTO fields (id, model_name, name, column_name, type, nullable, comment)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          model.name,
          field.name,
          snakeCase(field.name),
          convertJavaType(field.type),
          field.nullable ? 1 : 0,
          field.comment || ''
        );
      }

      imported.models++;
    }

    if (interfaces.length > 0 && models.length > 0) {
      const mappings = generateAutoMappings(interfaces, models);
      for (const mapping of mappings) {
        const existing = db.prepare('SELECT * FROM field_mappings WHERE interface_id = ? AND interface_field = ? AND model_name = ?').get(mapping.interfaceId, mapping.interfaceField, mapping.modelName);
        if (existing) continue;

        db.prepare(`
          INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), mapping.interfaceId, mapping.interfaceField, mapping.modelName, mapping.modelField, now);

        imported.mappings++;
      }
    }

    res.json({ success: true, imported });
  } catch (error) {
    res.status(500).json({ error: 'Failed to import parsed data' });
  }
});

function parseJavaController(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  
  const classAnnotation = /@RestController|@Controller/g;
  if (!classAnnotation.test(code)) return interfaces;

  const methodPattern = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:["']([^"']+)["']\s*)?\)\s*\n?\s*(?:@ResponseBody\s*\n)?\s*(?:public\s+(\w+)\s+(\w+)\s*\()/g;
  
  let match;
  while ((match = methodPattern.exec(code)) !== null) {
    const [, annotation, path, returnType, methodName] = match;
    
    const methodMap: Record<string, string> = {
      GetMapping: 'GET',
      PostMapping: 'POST',
      PutMapping: 'PUT',
      DeleteMapping: 'DELETE',
      PatchMapping: 'PATCH',
    };

    const params = parseMethodParameters(code, methodName);
    const requestBody = parseRequestBody(code, methodName);
    const description = parseJavaDoc(code, methodName);
    const tags = extractTags(code, methodName);

    const resolvedPath = path || '/';

    interfaces.push({
      name: methodName,
      path: resolvedPath,
      method: methodMap[annotation],
      description: description,
      parameters: params,
      requestBody: requestBody,
      responseBody: returnType,
      tags: tags,
    });
  }

  return interfaces;
}

function parseMethodParameters(code: string, methodName: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const methodPattern = new RegExp(`${methodName}\\s*\\(([^)]+)\\)`, 'g');
  const match = methodPattern.exec(code);
  
  if (match) {
    const paramStr = match[1];
    const paramPattern = /(@(RequestParam|PathVariable|RequestBody|RequestHeader)\s*(?:\(.*?\))?\s*)?\s*(\w+)\s+(\w+)/g;
    
    let paramMatch;
    while ((paramMatch = paramPattern.exec(paramStr)) !== null) {
      const [, annotation, paramType, javaType, paramName] = paramMatch;
      
      params.push({
        name: paramName,
        location: annotation ? 
          (annotation.includes('PathVariable') ? 'path' : 
           annotation.includes('RequestParam') ? 'query' :
           annotation.includes('RequestHeader') ? 'header' : 'body') : 'query',
        type: javaType,
        required: annotation?.includes('required=true') || annotation?.includes('@PathVariable'),
      });
    }
  }

  return params;
}

function parseRequestBody(code: string, methodName: string): string | undefined {
  const pattern = new RegExp(`${methodName}\\s*\\([^)]*@RequestBody[^)]*\\)`, 'g');
  const match = pattern.exec(code);
  if (match) {
    const bodyPattern = /@RequestBody\s*(?:\([^)]*\))?\s*(\w+)/;
    const bodyMatch = match[0].match(bodyPattern);
    return bodyMatch ? bodyMatch[1] : undefined;
  }
  return undefined;
}

function parseJavaDoc(code: string, methodName: string): string {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`public ${methodName}`) || lines[i].includes(`@${methodName}`)) {
      let doc = '';
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].includes('/**')) break;
        if (lines[j].includes('*')) {
          doc = lines[j].replace(/^\s*\*\s*/, '') + ' ' + doc;
        }
      }
      return doc.trim();
    }
  }
  return '';
}

function extractTags(code: string, methodName: string): string[] {
  const pattern = new RegExp(`@Tag\\(name\\s*=\\s*["']([^"']+)["']\\)`, 'g');
  const tags: string[] = [];
  let match;
  while ((match = pattern.exec(code)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function parseJavaModels(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  const classPattern = /(?:public\s+)?class\s+(\w+)\s*(?:extends\s+\w+)?\s*\{/g;
  
  let classMatch;
  while ((classMatch = classPattern.exec(code)) !== null) {
    const className = classMatch[1];
    if (className.endsWith('Controller') || className.endsWith('Service')) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(?:private|public|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*([=;])/g;
    
    let fieldMatch;
    const classStart = classMatch.index;
    const nextClassMatch = classPattern.exec(code);
    const classEnd = nextClassMatch ? nextClassMatch.index : code.length;
    
    const classContent = code.substring(classStart, classEnd);
    
    while ((fieldMatch = fieldPattern.exec(classContent)) !== null) {
      const [, type, name, separator] = fieldMatch;
      
      fields.push({
        name: name,
        type: type,
        nullable: !type.startsWith('final') && !type.includes('int') && !type.includes('long') && !type.includes('boolean'),
        comment: extractFieldComment(classContent, name),
      });
    }

    if (fields.length > 0) {
      models.push({
        name: className,
        fields: fields,
      });
    }
  }

  return models;
}

function extractFieldComment(code: string, fieldName: string): string | undefined {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(fieldName) && lines[i].includes(';')) {
      if (i > 0 && lines[i - 1].includes('//')) {
        return lines[i - 1].replace(/^\s*\/\//, '').trim();
      }
    }
  }
  return undefined;
}

function parseNodeExpress(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  
  const routerPattern = /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']\s*,\s*(?:async\s*)?(?:\([^)]+\)\s*=>|function\s*\([^)]+\))/g;
  
  let match;
  while ((match = routerPattern.exec(code)) !== null) {
    const [, method, path] = match;
    
    interfaces.push({
      name: extractRouteName(path),
      path: path,
      method: method.toUpperCase(),
      description: extractRouteComment(code, match.index),
      parameters: extractNodeParameters(path),
      tags: ['API'],
    });
  }

  return interfaces;
}

function extractRouteName(path: string): string {
  const parts = path.split('/').filter(p => p);
  return parts.map(p => p.startsWith(':') ? 'byId' : capitalize(p)).join('');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractRouteComment(code: string, index: number): string {
  const lines = code.substring(0, index).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('//')) {
      return lines[i].replace(/^\s*\/\//, '').trim();
    }
    if (lines[i].trim() && !lines[i].includes('//')) {
      break;
    }
  }
  return '';
}

function extractNodeParameters(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const paramPattern = /:(\w+)/g;
  
  let match;
  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: 'string',
      required: true,
    });
  }
  
  return params;
}

function parseNodeModels(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  
  const interfacePattern = /interface\s+(\w+)\s*\{([^}]+)\}/g;
  const classPattern = /class\s+(\w+)\s*\{([^}]+)\}/g;
  
  let match;
  while ((match = interfacePattern.exec(code)) !== null) {
    const [, name, content] = match;
    models.push({
      name: name,
      fields: parseTypeScriptFields(content),
    });
  }
  
  while ((match = classPattern.exec(code)) !== null) {
    const [, name, content] = match;
    models.push({
      name: name,
      fields: parseTypeScriptFields(content),
    });
  }
  
  return models;
}

function parseTypeScriptFields(content: string): ParsedModel['fields'] {
  const fields: ParsedModel['fields'] = [];
  const fieldPattern = /(\w+)\s*[?:]?\s*([^=;]+)/g;
  
  let match;
  while ((match = fieldPattern.exec(content)) !== null) {
    const [, name, type] = match;
    fields.push({
      name: name,
      type: type.trim(),
      nullable: content.includes(name + '?'),
    });
  }
  
  return fields;
}

function snakeCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function convertJavaType(type: string): string {
  const typeMap: Record<string, string> = {
    String: 'VARCHAR',
    int: 'INT',
    Integer: 'INT',
    long: 'BIGINT',
    Long: 'BIGINT',
    boolean: 'BOOLEAN',
    Boolean: 'BOOLEAN',
    double: 'DOUBLE',
    Double: 'DOUBLE',
    float: 'FLOAT',
    Float: 'FLOAT',
    Date: 'DATETIME',
    LocalDate: 'DATE',
    LocalDateTime: 'DATETIME',
    List: 'JSON',
    Map: 'JSON',
    Set: 'JSON',
  };
  
  for (const [javaType, sqlType] of Object.entries(typeMap)) {
    if (type.startsWith(javaType)) {
      return sqlType;
    }
  }
  
  return 'VARCHAR';
}

function generateAutoMappings(interfaces: ParsedInterface[], models: ParsedModel[]): Array<{
  interfaceId: string;
  interfaceField: string;
  modelName: string;
  modelField: string;
}> {
  const mappings: Array<{
    interfaceId: string;
    interfaceField: string;
    modelName: string;
    modelField: string;
  }> = [];

  for (const iface of interfaces) {
    for (const param of iface.parameters) {
      for (const model of models) {
        for (const field of model.fields) {
          if (isFieldMatch(param.name, field.name)) {
            mappings.push({
              interfaceId: uuidv4(),
              interfaceField: param.name,
              modelName: model.name,
              modelField: field.name,
            });
          }
        }
      }
    }
  }

  return mappings;
}

function isFieldMatch(field1: string, field2: string): boolean {
  const normalized1 = field1.toLowerCase().replace(/_/g, '');
  const normalized2 = field2.toLowerCase().replace(/_/g, '');
  
  return normalized1 === normalized2 ||
         normalized1.includes(normalized2) ||
         normalized2.includes(normalized1);
}

function parsePythonFlask(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const routePattern = /@(?:app|bp|blueprint|router)\s*\.\s*(?:route|get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?\s*(?:,\s*(?:endpoint|name)\s*=\s*["']([^"']+)["'])?\s*\)/g;

  let match;
  while ((match = routePattern.exec(code)) !== null) {
    const path = match[1];
    const methodsStr = match[2];
    const endpointName = match[3];

    let methods: string[] = ['GET'];
    if (methodsStr) {
      methods = methodsStr.match(/["'](\w+)["']/g)?.map((m) => m.replace(/["']/g, '').toUpperCase()) || ['GET'];
    }

    const decoratorMethod = /@(?:app|bp|blueprint|router)\s*\.\s*(get|post|put|delete|patch)\s*\(/.exec(match[0]);
    if (decoratorMethod) {
      methods = [decoratorMethod[1].toUpperCase()];
    }

    for (const method of methods) {
      const funcName = endpointName || extractPythonFuncName(code, match.index);
      const description = extractPythonDocstring(code, funcName);
      const params = extractPythonPathParams(path);

      interfaces.push({
        name: funcName || extractRouteName(path),
        path,
        method,
        description,
        parameters: params,
        tags: ['Flask'],
      });
    }
  }

  return interfaces;
}

function extractPythonFuncName(code: string, routeIndex: number): string {
  const afterRoute = code.substring(routeIndex);
  const funcMatch = afterRoute.match(/def\s+(\w+)\s*\(/);
  return funcMatch ? funcMatch[1] : '';
}

function extractPythonDocstring(code: string, funcName: string): string {
  if (!funcName) return '';
  const funcPattern = new RegExp(`def\\s+${funcName}\\s*\\([^)]*\\)\\s*:\\s*\\n\\s*["']{3}([\\s\\S]*?)["']{3}`);
  const match = funcPattern.exec(code);
  return match ? match[1].trim().split('\n')[0] : '';
}

function extractPythonPathParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const paramPattern = /<(\w+)(?::(\w+))?>/g;
  let match;
  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: match[2] || 'string',
      required: true,
    });
  }
  return params;
}

function parsePythonModels(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const classPattern = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*\n((?:\s{4,}\w+\s*[=:]\s*[^\n]+\n?)+)/g;
  let match;
  while ((match = classPattern.exec(code)) !== null) {
    const className = match[1];
    if (className.endsWith('View') || className.endsWith('Resource') || className.endsWith('Test')) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /^\s+(\w+)\s*[=:]\s*(.+)$/gm;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(match[2])) !== null) {
      const fieldName = fieldMatch[1];
      if (fieldName.startsWith('_') || ['Meta', 'objects', 'DoesNotExist', 'MultipleObjectsReturned'].includes(fieldName)) continue;

      const fieldType = fieldMatch[2].trim().split(/[,(]/)[0].trim();
      fields.push({
        name: fieldName,
        type: mapPythonType(fieldType),
        nullable: !fieldType.includes('primary_key') && !fieldType.includes('null=False'),
      });
    }

    if (fields.length > 0) {
      models.push({ name: className, fields });
    }
  }

  return models;
}

function mapPythonType(type: string): string {
  const typeMap: Record<string, string> = {
    'str': 'string',
    'int': 'integer',
    'float': 'number',
    'bool': 'boolean',
    'list': 'array',
    'dict': 'object',
    'CharField': 'string',
    'IntegerField': 'integer',
    'FloatField': 'number',
    'BooleanField': 'boolean',
    'TextField': 'text',
    'DateTimeField': 'datetime',
    'DateField': 'date',
    'ForeignKey': 'integer',
    'ManyToManyField': 'array',
    'JSONField': 'object',
    'EmailField': 'string',
    'URLField': 'string',
    'UUIDField': 'string',
    'DecimalField': 'number',
    'AutoField': 'integer',
    'BigAutoField': 'integer',
    'BigIntegerField': 'integer',
    'SmallIntegerField': 'integer',
    'PositiveIntegerField': 'integer',
    'SlugField': 'string',
    'FileField': 'string',
    'ImageField': 'string',
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (type.includes(key)) return value;
  }
  return 'string';
}

function parseGoHandlers(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const routePattern = /(?:r|router|mux|e|engine)\s*\.\s*(?:HandleFunc|GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']\s*,\s*(\w+)/g;
  let match;
  while ((match = routePattern.exec(code)) !== null) {
    const path = match[1];
    const handlerName = match[2];

    const methodMatch = /(?:r|router|mux|e|engine)\s*\.\s*(GET|POST|PUT|DELETE|PATCH|HandleFunc)\s*\(/.exec(match[0]);
    let method = 'GET';
    if (methodMatch) {
      method = methodMatch[1] === 'HandleFunc' ? 'GET' : methodMatch[1];
    }

    const params = extractGoPathParams(path);

    interfaces.push({
      name: handlerName,
      path,
      method,
      description: extractGoComment(code, handlerName),
      parameters: params,
      tags: ['Go'],
    });
  }

  return interfaces;
}

function extractGoPathParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const paramPattern = /:(\w+)/g;
  let match;
  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: 'string',
      required: true,
    });
  }

  const braceParamPattern = /\{(\w+)\}/g;
  while ((match = braceParamPattern.exec(path)) !== null) {
    if (!params.some(p => p.name === match[1])) {
      params.push({
        name: match[1],
        location: 'path',
        type: 'string',
        required: true,
      });
    }
  }

  return params;
}

function extractGoComment(code: string, funcName: string): string {
  const funcPattern = new RegExp(`func\\s+${funcName}\\s*\\(`);
  const funcIndex = code.search(funcPattern);
  if (funcIndex === -1) return '';

  const before = code.substring(Math.max(0, funcIndex - 500), funcIndex);
  const commentMatch = before.match(/\/\*\s*([\s\S]*?)\s*\*\/\s*$/);
  if (commentMatch) {
    return commentMatch[1].split('\n')[0].trim();
  }

  const lines = before.split('\n');
  const commentLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('//')) {
      commentLines.unshift(line.replace(/^\/\/\s?/, ''));
    } else if (line === '') {
      continue;
    } else {
      break;
    }
  }

  return commentLines.join(' ').trim();
}

function parseGoStructs(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const structPattern = /type\s+(\w+)\s+struct\s*\{([^}]+)\}/g;
  let match;
  while ((match = structPattern.exec(code)) !== null) {
    const structName = match[1];
    const fields: ParsedModel['fields'] = [];

    const fieldPattern = /(\w+)\s+(?:\*?)(\w+(?:\[\w+\])?)\s*(?:`[^`]*`)?/g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(match[2])) !== null) {
      const fieldName = fieldMatch[1];
      if (fieldName === '_' || !fieldName.match(/^[A-Z]/)) continue;

      fields.push({
        name: fieldName,
        type: mapGoType(fieldMatch[2]),
        nullable: fieldMatch[2].startsWith('*') || fieldMatch[2].startsWith('[]'),
      });
    }

    if (fields.length > 0) {
      models.push({ name: structName, fields });
    }
  }

  return models;
}

function mapGoType(type: string): string {
  const cleanType = type.replace(/^\*|\[\]/g, '');
  const typeMap: Record<string, string> = {
    'string': 'string',
    'int': 'integer',
    'int8': 'integer',
    'int16': 'integer',
    'int32': 'integer',
    'int64': 'integer',
    'uint': 'integer',
    'uint8': 'integer',
    'uint16': 'integer',
    'uint32': 'integer',
    'uint64': 'integer',
    'float32': 'number',
    'float64': 'number',
    'bool': 'boolean',
    'byte': 'integer',
    'rune': 'integer',
    'error': 'string',
    'time.Time': 'datetime',
    'Time': 'datetime',
  };

  return typeMap[cleanType] || 'string';
}

export default router;
