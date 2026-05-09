import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database.js';

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
  requestBody?: {
    contentType: string;
    schema?: any;
  };
  tags: string[];
  source: 'frontend' | 'backend';
  framework?: string;
  serviceName?: string;
}

interface ParsedModel {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey?: boolean;
    unique?: boolean;
    default?: string;
    comment?: string;
  }>;
  source: 'code' | 'database';
  description?: string;
}

interface ParsedTable {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    unique?: boolean;
    default?: string;
    comment?: string;
    foreignKey?: {
      table: string;
      column: string;
    };
  }>;
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
  source: 'sql' | 'connection';
}

interface Association {
  frontend?: string;
  backend?: string;
  table?: string;
  model?: string;
  modelFields?: string[];
  tableFields?: string[];
  confidence: number;
  matchType: 'exact' | 'path' | 'semantic' | 'field' | 'inferred';
  reasoning: string;
}

interface ProjectParseResult {
  interfaces: ParsedInterface[];
  models: ParsedModel[];
  tables: ParsedTable[];
  associations: Association[];
  parseStats: {
    frontendFiles: number;
    backendFiles: number;
    sqlFiles: number;
    parseTime: number;
    totalLines: number;
  };
}

router.post('/parse/project', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      frontendCode,
      backendCode,
      sqlStatements,
      options = {}
    } = req.body;

    const result: ProjectParseResult = {
      interfaces: [],
      models: [],
      tables: [],
      associations: [],
      parseStats: {
        frontendFiles: 0,
        backendFiles: 0,
        sqlFiles: 0,
        parseTime: 0,
        totalLines: 0
      }
    };

    const codeSnippets: { frontend: string[]; backend: string[]; sql: string[] } = {
      frontend: [],
      backend: [],
      sql: []
    };

    if (frontendCode) {
      const codeStr = typeof frontendCode === 'string' ? frontendCode : JSON.stringify(frontendCode);
      codeSnippets.frontend = codeStr.split(/\n(?=\s*(?:import|export|const|let|var|function|class|interface|type|\/\/|\/\*))/g);
      result.parseStats.frontendFiles = codeSnippets.frontend.length;
      result.parseStats.totalLines += codeStr.split('\n').length;
    }

    if (backendCode) {
      const codeStr = typeof backendCode === 'string' ? backendCode : JSON.stringify(backendCode);
      codeSnippets.backend = codeStr.split(/\n(?=\s*(?:import|export|class|interface|type|def |fn |func |public|private|@))/g);
      result.parseStats.backendFiles = codeSnippets.backend.length;
      result.parseStats.totalLines += codeStr.split('\n').length;
    }

    if (sqlStatements) {
      const sqlStr = typeof sqlStatements === 'string' ? sqlStatements : JSON.stringify(sqlStatements);
      const tables = parseEnhancedSQL(sqlStr, options.dialect || 'mysql');
      result.tables.push(...tables.map(t => ({ ...t, source: 'sql' as const })));
      const models = tablesToModels(tables);
      result.models.push(...models.map(m => ({ ...m, source: 'database' as const })));
      result.parseStats.sqlFiles = tables.length;
      result.parseStats.totalLines += sqlStr.split('\n').length;
    }

    for (const snippet of codeSnippets.frontend) {
      const interfaces = parseEnhancedFrontendCode(snippet);
      result.interfaces.push(...interfaces.map(i => ({ ...i, source: 'frontend' as const })));
    }

    for (const snippet of codeSnippets.backend) {
      const { interfaces, models } = parseEnhancedBackendCode(snippet);
      result.interfaces.push(...interfaces.map(i => ({ ...i, source: 'backend' as const })));
      result.models.push(...models.map(m => ({ ...m, source: 'code' as const })));
    }

    if (options.enableAutoAssociation !== false) {
      result.associations = generateDeepAssociations(result, options.matchSensitivity || 'normal');
    }

    result.parseStats.parseTime = Date.now() - startTime;

    res.json(result);
  } catch (error) {
    console.error('Parse project error:', error);
    res.status(500).json({ error: 'Failed to parse project', details: (error as Error).message });
  }
});

function generateDeepAssociations(result: ProjectParseResult, sensitivity: string): Association[] {
  const associations: Association[] = [];
  const { interfaces, models, tables } = result;

  const frontendInterfaces = interfaces.filter(i => i.source === 'frontend');
  const backendInterfaces = interfaces.filter(i => i.source === 'backend');

  for (const iface of [...frontendInterfaces, ...backendInterfaces]) {
    const matchedModels = findModelsForInterface(iface, models);
    const matchedTables = findTablesForInterface(iface, tables);

    for (const model of matchedModels) {
      const table = tables.find(t =>
        singularize(t.name).toLowerCase() === model.name.toLowerCase() ||
        t.name.toLowerCase().includes(model.name.toLowerCase()) ||
        model.name.toLowerCase().includes(singularize(t.name).toLowerCase())
      );

      const matchedFields = findMatchingFields(iface, model, table);

      associations.push({
        frontend: iface.source === 'frontend' ? `${iface.method} ${iface.path}` : undefined,
        backend: iface.source === 'backend' ? `${iface.method} ${iface.path}` : undefined,
        model: model.name,
        modelFields: matchedFields.modelFields,
        table: table?.name,
        tableFields: matchedFields.tableFields,
        confidence: matchedFields.confidence,
        matchType: matchedFields.matchType,
        reasoning: generateReasoning(iface, model, table)
      });
    }
  }

  for (const model of models) {
    const existing = associations.find(a => a.model === model.name);
    if (existing) continue;

    const table = findTableForModel(model, tables);

    if (table) {
      associations.push({
        table: table.name,
        model: model.name,
        modelFields: model.fields.map(f => f.name),
        tableFields: table.columns.map(c => c.name),
        confidence: 0.95,
        matchType: 'inferred',
        reasoning: `Model "${model.name}" maps to table "${table.name}" via naming convention`
      });
    }
  }

  return associations.sort((a, b) => b.confidence - a.confidence);
}

function findModelsForInterface(iface: ParsedInterface, models: ParsedModel[]): ParsedModel[] {
  const matched: ParsedModel[] = [];
  const pathResource = extractResourceFromPath(iface.path);
  const method = iface.method.toLowerCase();

  for (const model of models) {
    const modelNameLower = model.name.toLowerCase();
    const singularResource = singularize(pathResource).toLowerCase();
    const pluralResource = pluralize(pathResource).toLowerCase();

    if (modelNameLower === singularResource || modelNameLower === pluralResource) {
      matched.push(model);
      continue;
    }

    if (pathResource && (modelNameLower.includes(singularResource) || singularResource.includes(modelNameLower))) {
      matched.push(model);
      continue;
    }

    if (['list', 'get', 'add', 'create', 'edit', 'update', 'delete', 'remove'].includes(pathResource.toLowerCase())) {
      const baseResource = pathResource.replace(/list|get|add|create|edit|update|delete|remove/gi, '').trim();
      if (baseResource && (modelNameLower.includes(baseResource.toLowerCase()) || singularize(baseResource).toLowerCase() === modelNameLower)) {
        matched.push(model);
      }
    }
  }

  return matched;
}

function findTablesForInterface(iface: ParsedInterface, tables: ParsedTable[]): ParsedTable[] {
  const matched: ParsedTable[] = [];
  const pathResource = extractResourceFromPath(iface.path);

  for (const table of tables) {
    const tableNameLower = table.name.toLowerCase();
    const singularTable = singularize(tableNameLower);
    const pluralTable = pluralize(tableNameLower);
    const pathResourceLower = pathResource.toLowerCase();

    if (tableNameLower === pathResourceLower || singularTable === pathResourceLower || pluralTable === pathResourceLower) {
      matched.push(table);
      continue;
    }

    if (tableNameLower.includes(pathResourceLower) || singularTable.includes(pathResourceLower)) {
      matched.push(table);
    }
  }

  return matched;
}

function findMatchingFields(iface: ParsedInterface, model: ParsedModel, table?: ParsedTable): {
  modelFields: string[];
  tableFields: string[];
  confidence: number;
  matchType: Association['matchType'];
} {
  const modelFields: string[] = [];
  const tableFields: string[] = [];
  let matchCount = 0;
  let totalFields = 0;

  const paramNames = iface.parameters.map(p => p.name.toLowerCase());
  const bodyFields = extractBodyFieldsFromInterface(iface);

  for (const field of model.fields) {
    totalFields++;
    const fieldLower = field.name.toLowerCase();

    if (paramNames.includes(fieldLower) || bodyFields.includes(fieldLower)) {
      modelFields.push(field.name);
      matchCount++;
    }

    if (field.primaryKey && (paramNames.includes('id') || paramNames.includes(fieldLower))) {
      matchCount += 0.5;
    }
  }

  if (table) {
    for (const col of table.columns) {
      const colLower = col.name.toLowerCase();

      if (paramNames.some(p => p === colLower || p.includes(colLower) || colLower.includes(p))) {
        if (!tableFields.includes(col.name)) {
          tableFields.push(col.name);
        }
      }
    }
  }

  const baseConfidence = totalFields > 0 ? (matchCount / totalFields) : 0;
  const confidence = Math.min(0.95, baseConfidence + 0.3);

  return {
    modelFields: modelFields.length > 0 ? modelFields : model.fields.slice(0, 5).map(f => f.name),
    tableFields: tableFields.length > 0 ? tableFields : (table?.columns.slice(0, 5).map(c => c.name) || []),
    confidence,
    matchType: matchCount > 2 ? 'field' : matchCount > 0 ? 'semantic' : 'inferred'
  };
}

function findTableForModel(model: ParsedModel, tables: ParsedTable[]): ParsedTable | undefined {
  for (const table of tables) {
    const tableNameLower = table.name.toLowerCase();
    const modelNameLower = model.name.toLowerCase();
    const singularTable = singularize(tableNameLower);
    const pluralTable = pluralize(tableNameLower);

    if (modelNameLower === singularTable || modelNameLower === pluralTable || tableNameLower === modelNameLower) {
      return table;
    }

    const fieldMatch = model.fields.filter(f => {
      const fieldLower = f.name.toLowerCase();
      return table.columns.some(c =>
        c.name.toLowerCase() === fieldLower ||
        c.name.toLowerCase().replace(/_/g, '') === fieldLower.replace(/_/g, '') ||
        camelToSnake(c.name.toLowerCase()) === fieldLower ||
        snakeToCamel(fieldLower) === c.name.toLowerCase()
      );
    });

    if (fieldMatch.length >= Math.min(3, model.fields.length * 0.5)) {
      return table;
    }
  }

  return undefined;
}

function extractResourceFromPath(path: string): string {
  const parts = path.split('/').filter(p => p && !p.match(/^[:{]/));

  if (parts.length === 0) return '';

  const lastPart = parts[parts.length - 1];

  const actionWords = ['list', 'get', 'add', 'create', 'edit', 'update', 'delete', 'remove', 'detail', 'info', 'page'];
  const lastLower = lastPart.toLowerCase();

  for (const action of actionWords) {
    if (lastLower.startsWith(action)) {
      return lastPart.slice(action.length);
    }
  }

  return lastPart;
}

function extractBodyFieldsFromInterface(iface: ParsedInterface): string[] {
  const fields: string[] = [];

  if (iface.requestBody?.schema) {
    if (typeof iface.requestBody.schema === 'object') {
      Object.keys(iface.requestBody.schema).forEach(k => fields.push(k.toLowerCase()));
    }
  }

  const pathParams = iface.parameters.filter(p => p.location === 'body' || p.location === 'formData');
  pathParams.forEach(p => fields.push(p.name.toLowerCase()));

  return fields;
}

function generateReasoning(iface: ParsedInterface, model: ParsedModel, table?: ParsedTable): string {
  const parts: string[] = [];

  const pathResource = extractResourceFromPath(iface.path);
  const singularResource = singularize(pathResource).toLowerCase();
  const modelNameLower = model.name.toLowerCase();

  if (modelNameLower === singularResource) {
    parts.push(`Path resource "${pathResource}" matches model name`);
  } else if (modelNameLower.includes(singularResource) || singularResource.includes(modelNameLower)) {
    parts.push(`Path resource "${pathResource}" semantically matches model "${model.name}"`);
  }

  if (iface.method === 'GET') {
    parts.push('GET method indicates read operation');
  } else if (['POST', 'PUT', 'PATCH'].includes(iface.method)) {
    parts.push(`${iface.method} method indicates write operation`);
  } else if (iface.method === 'DELETE') {
    parts.push('DELETE method indicates delete operation');
  }

  if (table) {
    const tableMatch = singularize(table.name).toLowerCase() === modelNameLower;
    if (tableMatch) {
      parts.push(`Model "${model.name}" maps to table "${table.name}"`);
    }
  }

  const fieldMatches = iface.parameters.filter(p => {
    const paramLower = p.name.toLowerCase();
    return model.fields.some(f =>
      f.name.toLowerCase() === paramLower ||
      camelToSnake(f.name.toLowerCase()) === paramLower ||
      snakeToCamel(paramLower) === f.name.toLowerCase()
    );
  });

  if (fieldMatches.length > 0) {
    parts.push(`${fieldMatches.length} parameter(s) match model fields`);
  }

  return parts.join('; ') || 'Inferred based on naming conventions';
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function singularize(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  const irregulars: Record<string, string> = {
    people: 'person', men: 'man', women: 'woman', children: 'child',
    teeth: 'tooth', feet: 'foot', mice: 'mouse', lice: 'louse',
    oxen: 'ox', indices: 'index', matrices: 'matrix', vertices: 'vertex',
  };
  if (irregulars[lower]) return irregulars[lower];
  if (lower.endsWith('people')) return word.slice(0, -4) + 'person';
  if (lower.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (lower.endsWith('ves')) return word.slice(0, -3) + 'fe';
  if (lower.endsWith('oes')) return word.slice(0, -2);
  if (lower.endsWith('ses')) return word.slice(0, -2);
  if (lower.endsWith('es') && !lower.endsWith('ches') && !lower.endsWith('shes')) return word.slice(0, -2);
  if (lower.endsWith('s') && !lower.endsWith('ss') && word.length > 1) return word.slice(0, -1);
  return word;
}

function pluralize(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  const irregulars: Record<string, string> = {
    person: 'people', man: 'men', woman: 'women', child: 'children',
    tooth: 'teeth', foot: 'feet', mouse: 'mice', louse: 'lice',
    ox: 'oxen', index: 'indices', matrix: 'matrices', vertex: 'vertices',
    analysis: 'analyses', basis: 'bases', crisis: 'crises', diagnosis: 'diagnoses',
  };
  if (irregulars[lower]) {
    return word[0] === word[0].toUpperCase() ? irregulars[lower].charAt(0).toUpperCase() + irregulars[lower].slice(1) : irregulars[lower];
  }
  if (lower.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(lower[lower.length - 2])) return word.slice(0, -1) + 'ies';
  if (lower.endsWith('fe')) return word.slice(0, -2) + 'ves';
  if (lower.endsWith('f')) return word.slice(0, -1) + 'ves';
  if (lower.endsWith('o')) return word + 'es';
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') || lower.endsWith('ch') || lower.endsWith('sh')) return word + 'es';
  return word + 's';
}

function tablesToModels(tables: ParsedTable[]): ParsedModel[] {
  return tables.map(table => ({
    name: singularize(table.name),
    fields: table.columns.map(col => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      primaryKey: col.primaryKey,
      comment: col.comment
    })),
    source: 'database' as const
  }));
}

function parseEnhancedFrontendCode(code: string, frameworkHint?: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const detectedFrameworks = new Set<string>();

  const patterns: Array<{
    name: string;
    pattern: RegExp;
  }> = [
    { name: 'axios', pattern: /(?:axios|api|client|http|request)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'fetch', pattern: /fetch\s*\(\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'useQuery', pattern: /(?:useQuery|useMutation|useSWR|useAxios)\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  ];

  const seen = new Set<string>();

  for (const { name, pattern } of patterns) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      const path = (match[2] || '').trim();
      if (!path) continue;

      let method = 'GET';
      if (name !== 'fetch') {
        method = (match[0].match(/\.(get|post|put|delete|patch|head|options)/i)?.[1] || 'GET').toUpperCase();
      }

      const key = `${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      detectedFrameworks.add(name);

      interfaces.push({
        name: extractFrontendEndpointName(path),
        path: normalizePath(path),
        method,
        description: '',
        parameters: extractPathParams(path),
        tags: [name === 'fetch' ? 'Fetch API' : capitalize(name)],
        source: 'frontend',
        framework: name
      });
    }
  }

  if (frameworkHint) detectedFrameworks.add(frameworkHint);
  return interfaces;
}

function parseEnhancedBackendCode(code: string, frameworkHint?: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const springPatterns = parseSpringCode(code);
  interfaces.push(...springPatterns.interfaces);
  models.push(...springPatterns.models);

  const expressPatterns = parseExpressCode(code);
  interfaces.push(...expressPatterns);

  const flaskPatterns = parseFlaskCode(code);
  interfaces.push(...flaskPatterns);

  const fastapiPatterns = parseFastAPICode(code);
  interfaces.push(...fastapiPatterns);

  return { interfaces, models };
}

function parseSpringCode(code: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const annotations = [
    { pattern: /@(?:GetMapping|Get)\s*\(\s*(?:["']([^"']+)["'])?/gi, method: 'GET' },
    { pattern: /@(?:PostMapping|Post)\s*\(\s*(?:["']([^"']+)["'])?/gi, method: 'POST' },
    { pattern: /@(?:PutMapping|Put)\s*\(\s*(?:["']([^"']+)["'])?/gi, method: 'PUT' },
    { pattern: /@(?:DeleteMapping|Delete)\s*\(\s*(?:["']([^"']+)["'])?/gi, method: 'DELETE' },
  ];

  const seen = new Set<string>();

  for (const { pattern, method } of annotations) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      const path = match[1] || '/';
      const key = `${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: extractBackendMethodName(path),
        path: path.startsWith('/') ? path : '/' + path,
        method,
        description: '',
        parameters: extractSpringParams(code, match.index),
        tags: ['Spring Boot', 'Java'],
        source: 'backend',
        framework: 'spring'
      });
    }
  }

  const modelPattern = /(?:@Entity\s*)?(?:@Table\s*\([^)]+\)\s*)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([\s\S]*?)(?=\n\s*(?:@|class\s+\w|public|private|$))/g;
  let modelMatch;

  while ((modelMatch = modelPattern.exec(code)) !== null) {
    const className = modelMatch[1];
    if (className.endsWith('Controller') || className.endsWith('Service') || className.endsWith('Repository')) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(?:@Column\([^)]*\)\s*)?(?:@Id\s*)?(?:@GeneratedValue\([^)]*\)\s*)?private\s+(\w+)\s+(\w+)/g;
    let match;

    while ((match = fieldPattern.exec(modelMatch[2])) !== null) {
      const [, javaType, fieldName] = match;
      const isPrimaryKey = modelMatch[2].slice(Math.max(0, match.index - 100), match.index).includes('@Id');

      fields.push({
        name: fieldName,
        type: mapJavaTypeToTS(javaType),
        nullable: !isPrimaryKey && !javaType.match(/^(int|long|boolean|double|float|char)$/),
        primaryKey: isPrimaryKey || undefined
      });
    }

    if (fields.length > 0) {
      models.push({ name: className, fields, source: 'code' });
    }
  }

  return { interfaces, models };
}

function parseExpressCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const routerPattern = /(?:router|app)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*['"](\/[^'"]+)['"]/gi;
  const seen = new Set<string>();
  let match;

  while ((match = routerPattern.exec(code)) !== null) {
    const [, httpMethod, path] = match;
    const method = httpMethod.toUpperCase();
    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: '',
      parameters: extractExpressParams(path),
      tags: ['Express', 'Node.js'],
      source: 'backend',
      framework: 'express'
    });
  }

  return interfaces;
}

function parseFlaskCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const routePattern = /@(?:app|bp)\s*\.\s*(?:route|get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  const seen = new Set<string>();
  let match;

  while ((match = routePattern.exec(code)) !== null) {
    const [, path] = match;
    const httpMethod = 'GET';
    const key = `${httpMethod}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method: httpMethod,
      description: '',
      parameters: [],
      tags: ['Flask', 'Python'],
      source: 'backend',
      framework: 'flask'
    });
  }

  return interfaces;
}

function parseFastAPICode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const decoratorPattern = /@app\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
  const seen = new Set<string>();
  let match;

  while ((match = decoratorPattern.exec(code)) !== null) {
    const [, path] = match;
    const fullMatch = match[0];
    const method = fullMatch.match(/@(?:app)\s*\.\s*(\w+)/)?.[1]?.toUpperCase() || 'GET';
    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: '',
      parameters: [],
      tags: ['FastAPI', 'Python'],
      source: 'backend',
      framework: 'fastapi'
    });
  }

  return interfaces;
}

function parseEnhancedSQL(sql: string, dialect: string = 'mysql'): ParsedTable[] {
  const tables: ParsedTable[] = [];
  
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/gi;
  let createMatch;
  
  while ((createMatch = createTableRegex.exec(sql)) !== null) {
    const tableName = createMatch[1];
    const startPos = createMatch.index + createMatch[0].length;

    let parenDepth = 0;
    let startCol = -1;
    let endCol = -1;
    
    for (let i = startPos; i < sql.length; i++) {
      if (sql[i] === '(') {
        if (parenDepth === 0) startCol = i + 1;
        parenDepth++;
      } else if (sql[i] === ')') {
        parenDepth--;
        if (parenDepth === 0) {
          endCol = i;
          break;
        }
      }
    }

    if (startCol === -1 || endCol === -1) continue;
    
    const columnsStr = sql.slice(startCol, endCol).trim();
    if (!columnsStr) continue;

    const columns: ParsedTable['columns'] = [];
    const primaryKeys = new Set<string>();

    const pkMatch = columnsStr.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkMatch) {
      pkMatch[1].split(',').forEach(pk => {
        primaryKeys.add(pk.trim().replace(/[`"'\[\]]/g, ''));
      });
    }

    const parts = splitColumnDefs(columnsStr);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || /^(PRIMARY|FOREIGN|UNIQUE|INDEX|KEY|CONSTRAINT)/i.test(trimmed)) continue;

      const nameMatch = trimmed.match(/^[`"']?(\w+)[`"']?\s+/i);
      if (!nameMatch) continue;

      const name = nameMatch[1];
      const rest = trimmed.slice(nameMatch[0].length);
      const typeMatch = rest.match(/^(\w+(?:\([^)]+\))?)/i);
      if (!typeMatch) continue;

      const type = typeMatch[1].toUpperCase();
      const upperRest = rest.toUpperCase();

      let isPK = primaryKeys.has(name) || upperRest.includes('PRIMARY KEY') || name.toLowerCase() === 'id';

      const commentMatch = trimmed.match(/COMMENT\s+['"]([^'"]+)['"]/i);

      columns.push({
        name,
        type: mapSQLType(type, dialect),
        nullable: !upperRest.includes('NOT NULL') && !isPK,
        primaryKey: isPK,
        comment: commentMatch?.[1]
      });
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns, indexes: [], source: 'sql' });
    }
  }

  return tables;
}

function splitColumnDefs(columnsStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inParen = 0;

  for (const char of columnsStr) {
    if (char === '(') { inParen++; current += char; }
    else if (char === ')') { inParen--; current += char; }
    else if (char === ',' && inParen === 0) { parts.push(current); current = ''; }
    else current += char;
  }

  if (current.trim()) parts.push(current);
  return parts;
}

function extractPathParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const pattern = /:(\w+)|\{(\w+)\}/g;
  let match;

  while ((match = pattern.exec(path)) !== null) {
    params.push({
      name: match[1] || match[2],
      location: 'path',
      type: 'string',
      required: true
    });
  }

  return params;
}

function extractSpringParams(code: string, index: number): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const snippet = code.slice(index, index + 300);
  const paramPattern = /@(?:PathVariable|RequestParam|RequestBody)\s*(?:\([^)]*\))?/gi;
  let match;

  while ((match = paramPattern.exec(snippet)) !== null) {
    let location = 'query';
    if (match[0].includes('PathVariable')) location = 'path';
    else if (match[0].includes('RequestBody')) location = 'body';

    params.push({ name: 'param', location, type: 'string', required: true });
  }

  return params;
}

function extractExpressParams(path: string): ParsedInterface['parameters'] {
  return extractPathParams(path);
}

function extractFrontendEndpointName(path: string): string {
  const parts = path.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'));
  return parts.map(p => capitalize(p.replace(/[-_]/g, ''))).join('') || 'Index';
}

router.post('/import/project', async (req, res) => {
  try {
    const { interfaces, models, tables, options = {} } = req.body;
    const { overwrite = false } = options;

    const imported = {
      interfaces: 0,
      models: 0,
      tables: 0
    };

    for (const iface of interfaces || []) {
      try {
        const existingCheck = await query(
          'SELECT id FROM interfaces WHERE path = $1 AND method = $2',
          [iface.path, iface.method]
        );

        if (existingCheck.rows.length > 0) {
          if (overwrite) {
            await query(
              `UPDATE interfaces SET name = $1, description = $2, tags = $3, updated_at = NOW() WHERE path = $4 AND method = $5`,
              [iface.name, iface.description || '', JSON.stringify(iface.tags || []), iface.path, iface.method]
            );
            imported.interfaces++;
          }
        } else {
          const id = uuidv4();
          await query(
            `INSERT INTO interfaces (id, name, path, method, description, tags, status, version, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', '1.0.0', NOW(), NOW())`,
            [id, iface.name, iface.path, iface.method, iface.description || '', JSON.stringify(iface.tags || [])]
          );
          imported.interfaces++;
        }
      } catch (err) {
        console.error('Failed to import interface:', err);
      }
    }

    for (const model of models || []) {
      try {
        const existingCheck = await query(
          'SELECT name FROM data_models WHERE name = $1',
          [model.name]
        );

        if (existingCheck.rows.length > 0) {
          if (overwrite) {
            await query(
              `UPDATE data_models SET description = $1, schema = $2, updated_at = NOW() WHERE name = $3`,
              [model.description || '', JSON.stringify(model.fields), model.name]
            );
            await query('DELETE FROM fields WHERE model_name = $1', [model.name]);
            for (const field of model.fields || []) {
              await query(
                `INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [uuidv4(), model.name, field.name, field.name, field.type, field.nullable ? 1 : 0, field.primaryKey ? 1 : 0, field.default || null, field.comment || null]
              );
            }
            imported.models++;
          }
        } else {
          await query(
            `INSERT INTO data_models (name, table_name, description, schema, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [model.name, model.name.toLowerCase(), model.description || '', JSON.stringify(model.fields)]
          );
          for (const field of model.fields || []) {
            await query(
              `INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [uuidv4(), model.name, field.name, field.name, field.type, field.nullable ? 1 : 0, field.primaryKey ? 1 : 0, field.default || null, field.comment || null]
            );
          }
          imported.models++;
        }
      } catch (err) {
        console.error('Failed to import model:', err);
      }
    }

    for (const table of tables || []) {
      try {
        const existingCheck = await query(
          'SELECT name FROM data_models WHERE table_name = $1',
          [table.name]
        );

        if (existingCheck.rows.length === 0 || overwrite) {
          if (existingCheck.rows.length > 0 && overwrite) {
            await query('DELETE FROM fields WHERE model_name = $1', [existingCheck.rows[0].name]);
            await query('DELETE FROM data_models WHERE table_name = $1', [table.name]);
          }

          const modelName = models?.find(m => m.name.toLowerCase() === singularize(table.name).toLowerCase())?.name || singularize(table.name);
          
          await query(
            `INSERT INTO data_models (name, table_name, description, schema, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [modelName, table.name, `Imported from table ${table.name}`, JSON.stringify(table.columns)]
          );

          for (const col of table.columns || []) {
            await query(
              `INSERT INTO fields (id, model_name, name, column_name, type, nullable, primary_key, default_value, comment)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [uuidv4(), modelName, col.name, col.name, col.type, col.nullable ? 1 : 0, col.primaryKey ? 1 : 0, col.default || null, col.comment || null]
            );
          }
          imported.tables++;
        }
      } catch (err) {
        console.error('Failed to import table:', err);
      }
    }

    res.json({
      success: true,
      imported,
      message: `导入完成: ${imported.interfaces} 接口, ${imported.models} 模型, ${imported.tables} 表`
    });
  } catch (error) {
    console.error('Import project error:', error);
    res.status(500).json({ error: 'Failed to import project', details: (error as Error).message });
  }
});

function extractBackendMethodName(path: string): string {
  const parts = path.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'));
  return parts.map(p => capitalize(p.replace(/[-_]/g, ''))).join('') || 'Index';
}

function normalizePath(path: string): string {
  return path.replace(/:(\w+)/g, '{id}').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

function capitalize(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function mapJavaTypeToTS(javaType: string): string {
  const typeMap: Record<string, string> = {
    String: 'string', int: 'number', Integer: 'number', long: 'number', Long: 'number',
    short: 'number', double: 'number', Double: 'number', float: 'number', Float: 'number',
    boolean: 'boolean', Boolean: 'boolean', Date: 'string', LocalDate: 'string',
    LocalDateTime: 'string', List: 'array', ArrayList: 'array', Map: 'object', Object: 'object',
  };
  return typeMap[javaType] || 'string';
}

function mapSQLType(sqlType: string, dialect: string = 'mysql'): string {
  const upper = sqlType.toUpperCase();
  if (/^(INT|INTEGER|SERIAL|TINYINT|SMALLINT|BIGINT)/.test(upper)) return 'integer';
  if (/^(DECIMAL|NUMERIC|FLOAT|REAL|DOUBLE)/.test(upper)) return 'number';
  if (/^(VARCHAR|CHAR|TEXT)/.test(upper)) return 'string';
  if (/^(DATE|DATETIME|TIMESTAMP)/.test(upper)) return 'datetime';
  if (/^(BOOLEAN|BOOL)/.test(upper)) return 'boolean';
  if (/^(JSON|JSONB)/.test(upper)) return 'json';
  return 'string';
}

export default router;
