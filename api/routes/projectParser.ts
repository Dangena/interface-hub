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
  tags: string[];
  source: 'frontend' | 'backend';
  framework?: string;
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
  frontend: string;
  backend: string;
  table?: string;
  model?: string;
  confidence: number;
  matchType: 'exact' | 'path' | 'semantic' | 'partial';
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

interface ParseOptions {
  enableAutoAssociation?: boolean;
  matchSensitivity?: 'strict' | 'normal' | 'loose';
  includeDeprecated?: boolean;
  dialect?: 'mysql' | 'postgresql' | 'sqlite' | 'mssql';
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
      codeSnippets.sql = sqlStr.split(/;\s*\n|CREATE\s+TABLE/gi).filter(s => s.trim());
      result.parseStats.sqlFiles = codeSnippets.sql.length;
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

    for (const snippet of codeSnippets.sql) {
      const tables = parseEnhancedSQL(snippet, options.dialect || 'mysql');
      result.tables.push(...tables.map(t => ({ ...t, source: 'sql' as const })));
      const models = tablesToModels(tables);
      result.models.push(...models.map(m => ({ ...m, source: 'database' as const })));
    }

    if (options.enableAutoAssociation !== false) {
      result.associations = generateEnhancedAssociations(
        result,
        options.matchSensitivity || 'normal'
      );
    }

    result.parseStats.parseTime = Date.now() - startTime;

    res.json(result);
  } catch (error) {
    console.error('Parse project error:', error);
    res.status(500).json({ error: 'Failed to parse project', details: (error as Error).message });
  }
});

router.post('/parse/frontend', (req, res) => {
  try {
    const { code, framework } = req.body;
    const interfaces = parseEnhancedFrontendCode(code, framework);
    res.json({ interfaces });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse frontend code' });
  }
});

router.post('/parse/backend', (req, res) => {
  try {
    const { code, framework } = req.body;
    const { interfaces, models } = parseEnhancedBackendCode(code, framework);
    res.json({ interfaces, models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse backend code' });
  }
});

router.post('/parse/sql', (req, res) => {
  try {
    const { sql, dialect } = req.body;
    const tables = parseEnhancedSQL(sql, dialect || 'mysql');
    const models = tablesToModels(tables);
    res.json({ tables, models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse SQL', details: (error as Error).message });
  }
});

router.post('/parse/file', (req, res) => {
  try {
    const { filename, content } = req.body;
    const ext = filename.split('.').pop()?.toLowerCase();

    if (['ts', 'tsx', 'js', 'jsx', 'vue'].includes(ext || '')) {
      const interfaces = parseEnhancedFrontendCode(content);
      res.json({ type: 'frontend', interfaces });
    } else if (['java', 'py', 'go'].includes(ext || '')) {
      const { interfaces, models } = parseEnhancedBackendCode(content);
      res.json({ type: 'backend', interfaces, models });
    } else if (ext === 'sql') {
      const tables = parseEnhancedSQL(content, 'mysql');
      res.json({ type: 'sql', tables });
    } else {
      res.status(400).json({ error: 'Unsupported file type' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse file' });
  }
});

router.post('/import/project', async (req, res) => {
  try {
    const { interfaces, models, tables, options = {} } = req.body;
    const { projectId, overwrite, createProject } = options;
    const now = new Date().toISOString();
    const imported = { interfaces: 0, models: 0, tables: 0, skipped: 0 };

    let projectUuid = projectId;
    if (createProject && !projectId) {
      projectUuid = uuidv4();
      await query(`
        INSERT INTO projects (id, name, description, color, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [projectUuid, createProject.name || 'Imported Project', createProject.description || '', '#3B82F6', now, now]);
    }

    for (const iface of interfaces) {
      const existing = (await query('SELECT * FROM interfaces WHERE path = $1 AND method = $2', [iface.path, iface.method])).rows[0];
      if (existing && !overwrite) {
        imported.skipped++;
        continue;
      }

      const id = existing ? (existing as any).id : uuidv4();

      if (existing && overwrite) {
        await query(`
          UPDATE interfaces SET name = $1, description = $2, category = $3, tags = $4, updated_at = $5
          WHERE id = $6
        `, [
          iface.name,
          iface.description,
          projectUuid || iface.tags[0] || 'Imported',
          JSON.stringify([...(iface.tags || []), iface.framework].filter(Boolean)),
          now,
          id
        ]);
      } else {
        await query(`
          INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          id,
          iface.name,
          iface.path,
          iface.method,
          iface.description,
          projectUuid || iface.tags[0] || 'Imported',
          JSON.stringify([...(iface.tags || []), iface.framework].filter(Boolean)),
          'published',
          '1.0.0',
          now,
          now
        ]);
      }

      if (iface.parameters?.length > 0) {
        await query('DELETE FROM parameters WHERE interface_id = $1', [id]);
        for (const param of iface.parameters) {
          await query(`
            INSERT INTO parameters (id, interface_id, name, location, type, required, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [uuidv4(), id, param.name, param.location, param.type, param.required ? 1 : 0, '']);
        }
      }

      imported.interfaces++;
    }

    for (const model of models) {
      const existing = (await query('SELECT * FROM data_models WHERE name = $1', [model.name])).rows[0];
      if (existing && !overwrite) {
        imported.skipped++;
        continue;
      }

      const tableName = model.name.toLowerCase().replace(/([A-Z])/g, '_$1').replace(/^_/, '') + 's';

      if (existing && overwrite) {
        await query(`
          UPDATE data_models SET description = $1, table_name = $2, updated_at = $3
          WHERE name = $4
        `, [model.description || '', tableName, now, model.name]);
        await query('DELETE FROM fields WHERE model_name = $1', [model.name]);
      } else if (!existing) {
        await query(`
          INSERT INTO data_models (name, table_name, description, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [model.name, tableName, model.description || '', now, now]);
      }

      for (const field of model.fields) {
        const columnName = field.name.toLowerCase().replace(/([A-Z])/g, '_$1').replace(/^_/, '');
        await query(`
          INSERT INTO fields (id, model_name, name, column_name, type, nullable, comment)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          uuidv4(),
          model.name,
          field.name,
          columnName,
          field.type,
          field.nullable ? 1 : 0,
          field.comment || ''
        ]);
      }

      imported.models++;
    }

    for (const table of tables) {
      const modelName = singularize(table.name);
      const existing = (await query('SELECT * FROM data_models WHERE table_name = $1 OR name = $2', [table.name, modelName])).rows[0];
      if (existing && !overwrite) {
        imported.skipped++;
        continue;
      }

      if (!existing) {
        await query(`
          INSERT INTO data_models (name, table_name, description, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [modelName, table.name, `Imported from ${table.source}`, now, now]);

        for (const column of table.columns) {
          await query(`
            INSERT INTO fields (id, model_name, name, column_name, type, nullable, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            uuidv4(),
            modelName,
            column.name,
            column.name,
            column.type,
            column.nullable ? 1 : 0,
            column.comment || ''
          ]);
        }

        imported.tables++;
      }
    }

    if (interfaces.length > 0 && models.length > 0) {
      const mappings = generateAutoMappings(interfaces, models);
      for (const mapping of mappings) {
        const iface = (await query('SELECT id FROM interfaces WHERE path = $1 AND method = $2', [mapping.interfacePath, mapping.interfaceMethod])).rows[0] as any;
        const model = (await query('SELECT name FROM data_models WHERE name = $1', [mapping.modelName])).rows[0] as any;

        if (iface && model) {
          const existing = (await query('SELECT * FROM field_mappings WHERE interface_id = $1 AND interface_field = $2 AND model_name = $3', [iface.id, mapping.interfaceField, mapping.modelName])).rows[0];
          if (!existing) {
            await query(`
              INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [uuidv4(), iface.id, mapping.interfaceField, mapping.modelName, mapping.modelField, now]);
          }
        }
      }
    }

    res.json({ success: true, imported });
  } catch (error) {
    console.error('Import project error:', error);
    res.status(500).json({ error: 'Failed to import project', details: (error as Error).message });
  }
});

function parseEnhancedFrontendCode(code: string, frameworkHint?: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const detectedFrameworks = new Set<string>();

  const patterns: Array<{
    name: string;
    pattern: RegExp;
    methodExtractor?: (match: RegExpMatchArray) => string;
  }> = [
    { name: 'axios', pattern: /(?:axios|api|client|http|request)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*(?:['"`](\/[^'"`]*)|`([^`]+)`)/gi },
    { name: 'fetch', pattern: /fetch\s*\(\s*(?:['"`](\/[^'"`]*)|`([^`]+)`)/gi, methodExtractor: (m) => extractFetchMethod(code, m.index || 0) },
    { name: 'useQuery', pattern: /(?:useQuery|useMutation|useSWR|useAxios)\s*\(\s*(?:['"`](\/[^'"`]*)|`([^`]+)`)/gi, methodExtractor: (m) => inferMethodFromKey(m[0]) },
    { name: 'vue-resource', pattern: /this\s*\$\s*(?:http|resource)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"](\/[^'"]+)/gi },
    { name: 'angular', pattern: /this\s*\.\s*(?:http| HttpClient)\s*\.\s*(?:get|post|put|delete|patch|head|json)\s*\(\s*(?:['"`](\/[^'"`]*)|[`'"][^'"`]+\.pipe\()/gi },
    { name: 'trpc', pattern: /trpc\s*\.\s*(?:router|query|mutation)\s*\.\s*(\w+)\s*\.(?:useQuery|useMutation|query|mutate)/gi },
    { name: 'ky', pattern: /(?:ky|Ky)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"`]+)/gi },
    { name: 'superagent', pattern: /(?:request|superagent|agent)\s*\.\s*(get|post|put|delete|patch|head)\s*\(\s*['"`](\/[^'"`]+)/gi },
    { name: 'node-fetch', pattern: /\(\s*await\s+\)?fetch\s*\(\s*['"`](\/[^\s'"`]+)/gi, methodExtractor: (m) => extractFetchMethod(code, m.index || 0) },
    { name: 'react-query', pattern: /use(\w+)\s*\(\s*\[?\s*(?:['"`](\/[^'"`]+)|`([^`]+)`)/gi, methodExtractor: (m) => inferMethodFromKey(m[0]) },
    { name: 'swr', pattern: /useSWR\s*\(\s*(?:['"`](\/[^'"`]+)|`([^`]+)`)/gi },
    { name: 'apollo', pattern: /(?:apollo|useQuery|useMutation)\s*\(\s*(?:gql`[^`]*|['"`](\/\w+))/gi },
    { name: 'urql', pattern: /(?:useQuery|useMutation|client)\s*\.\s*(?:query|mutation)\s*\(\s*(?:['"`](\/\w+))/gi },
    { name: 'zod-fetch', pattern: /zodFetch\s*\(\s*(?:['"`](\/[^'"`]+)|`([^`]+)`)/gi },
    { name: 'umi-request', pattern: /(?:request|umiRequest)\s*\(\s*(?:['"`](\/[^'"`]+)|`([^`]+)`)/gi, methodExtractor: (m) => extractRequestOptions(code, m.index || 0) },
    { name: 'taro-request', pattern: /Taro\s*\.\s*(?:request|get|post|put|delete)\s*\(\s*(?:['"`](\/[^'"`]+)|`([^`]+)`)/gi },
    { name: 'uni-request', pattern: /uni\s*\.\s*(?:request|downloadFile|uploadFile)\s*\(\s*\{?\s*url\s*:\s*(?:['"`](\/[^'"`]+)|`([^`]+)`)/gi },
  ];

  const seen = new Set<string>();

  for (const { name, pattern, methodExtractor } of patterns) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      const path = (match[1] || match[2] || '').trim();
      if (!path) continue;

      let method = 'GET';
      if (methodExtractor) {
        method = methodExtractor(match);
      } else if (name !== 'fetch' && name !== 'node-fetch') {
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
        description: extractCodeComment(code, match.index),
        parameters: extractPathParams(path),
        tags: [name === 'fetch' || name === 'node-fetch' ? 'Fetch API' : capitalize(name)],
        source: 'frontend',
        framework: name
      });
    }
  }

  if (frameworkHint) {
    detectedFrameworks.add(frameworkHint);
  }

  return interfaces;
}

function extractFetchMethod(code: string, index: number): string {
  const slice = code.slice(Math.max(0, index - 200), index);
  const methodMatch = slice.match(/method\s*:\s*['"](\w+)['"]/i);
  return methodMatch ? methodMatch[1].toUpperCase() : 'GET';
}

function extractRequestOptions(code: string, index: number): string {
  const slice = code.slice(index, index + 500);
  const methodMatch = slice.match(/method\s*:\s*['"](\w+)['"]/i);
  return methodMatch ? methodMatch[1].toUpperCase() : 'POST';
}

function inferMethodFromKey(code: string): string {
  const lower = code.toLowerCase();
  if (lower.includes('create') || lower.includes('add') || lower.includes('post')) return 'POST';
  if (lower.includes('update') || lower.includes('edit') || lower.includes('put') || lower.includes('patch')) return 'PUT';
  if (lower.includes('delete') || lower.includes('remove')) return 'DELETE';
  return 'GET';
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

  const djangoPatterns = parseDjangoCode(code);
  interfaces.push(...djangoPatterns);

  const goPatterns = parseGoCode(code);
  interfaces.push(...goPatterns.interfaces);
  models.push(...goPatterns.models);

  const nestJSPatterns = parseNestJSCode(code);
  interfaces.push(...nestJSPatterns.interfaces);
  models.push(...nestJSPatterns.models);

  const railsPatterns = parseRailsCode(code);
  interfaces.push(...railsPatterns);

  const railsModelPattern = parseRailsModels(code);
  models.push(...railsModelPattern);

  return { interfaces, models };
}

function parseSpringCode(code: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const annotations = [
    { pattern: /@(?:GetMapping|Get)\s*\(\s*(?:["']([^"']+)["']\s*)?(?:,\s*)?(?:,\s*produces\s*=\s*\[[^\]]+\])?\s*\)/gi, method: 'GET' },
    { pattern: /@(?:PostMapping|Post)\s*\(\s*(?:["']([^"']+)["']\s*)?/gi, method: 'POST' },
    { pattern: /@(?:PutMapping|Put)\s*\(\s*(?:["']([^"']+)["']\s*)?/gi, method: 'PUT' },
    { pattern: /@(?:DeleteMapping|Delete)\s*\(\s*(?:["']([^"']+)["']\s*)?/gi, method: 'DELETE' },
    { pattern: /@(?:PatchMapping|Patch)\s*\(\s*(?:["']([^"']+)["']\s*)?/gi, method: 'PATCH' },
    { pattern: /@(?:RequestMapping|Request)\s*\(\s*(?:["']([^"']+)["']|method\s*=\s*RequestMethod\.(\w+))/gi, method: 'GET' },
  ];

  const seen = new Set<string>();

  for (const { pattern, method } of annotations) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      let path = match[1] || '/';
      let actualMethod = method;

      if (match[2]) {
        actualMethod = match[2].toUpperCase();
      }

      const key = `${actualMethod}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: extractBackendMethodName(path),
        path: path.startsWith('/') ? path : '/' + path,
        method: actualMethod,
        description: extractJavaDoc(code, match.index),
        parameters: extractSpringParams(code, match.index),
        tags: ['Spring Boot', 'Java'],
        source: 'backend',
        framework: 'spring'
      });
    }
  }

  const modelPattern = /(?:@Entity\s*)?(?:@Table\s*\([^)]+\)\s*)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{([\s\S]*?)(?=\n\s*(?:@|class\s+\w|public|private|$))/g;
  let modelMatch;

  while ((modelMatch = modelPattern.exec(code)) !== null) {
    const className = modelMatch[1];
    if (className.endsWith('Controller') || className.endsWith('Service') || className.endsWith('Repository')) continue;

    const fields = extractJavaModelFields(className, modelMatch[2]);
    if (fields.length > 0) {
      models.push({
        name: className,
        fields,
        source: 'code',
        description: extractClassJavaDoc(modelMatch[2])
      });
    }
  }

  const interfacePattern = /(?:@Schema\s*\([^)]*\)\s*)?record\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:\{[\s\S]*?\})?/g;
  let recordMatch;

  while ((recordMatch = interfacePattern.exec(code)) !== null) {
    const recordName = recordMatch[1];
    const recordFields = extractRecordFields(recordMatch[2]);
    models.push({
      name: recordName,
      fields: recordFields,
      source: 'code',
      description: ''
    });
  }

  return { interfaces, models };
}

function extractJavaModelFields(classBody: string, className: string): ParsedModel['fields'] {
  const fields: ParsedModel['fields'] = [];

  const fieldPattern = /(?:@Column\([^)]*\)\s*)?(?:@Id\s*)?(?:@GeneratedValue\([^)]*\)\s*)?(?:@JsonProperty\([^)]*\)\s*)?(?:private|public|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:=\s*([^;]+))?;/g;
  let match;

  while ((match = fieldPattern.exec(classBody)) !== null) {
    const [, javaType, fieldName, defaultValue] = match;
    const isPrimaryKey = classBody.slice(Math.max(0, match.index - 100), match.index).includes('@Id');

    fields.push({
      name: fieldName,
      type: mapJavaTypeToTS(javaType),
      nullable: !isPrimaryKey && !javaType.match(/^(int|long|boolean|double|float|char)$/),
      primaryKey: isPrimaryKey || undefined,
      default: defaultValue?.trim()
    });
  }

  return fields;
}

function extractRecordFields(params: string): ParsedModel['fields'] {
  const fields: ParsedModel['fields'] = [];

  const paramPattern = /(\w+)\s+(\w+)/g;
  let match;

  while ((match = paramPattern.exec(params)) !== null) {
    fields.push({
      name: match[2],
      type: mapJavaTypeToTS(match[1]),
      nullable: false
    });
  }

  return fields;
}

function extractSpringParams(code: string, annotationIndex: number): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const snippet = code.slice(annotationIndex, annotationIndex + 300);

  const paramPattern = /@(?:PathVariable|RequestParam|RequestBody|RequestHeader|CookieValue)\s*(?:\((\w+)\s*\.\s*(\w+)|(?:\(\s*["']?(\w+)["']?\s*(?:,\s*(?:value|name)\s*=\s*["']?(\w+)["']?)?\s*)?\))?/gi;
  let match;

  while ((match = paramPattern.exec(snippet)) !== null) {
    const paramName = match[3] || match[4] || 'param';
    const paramType = match[1] || 'string';
    let location = 'query';

    if (match[0].includes('PathVariable')) location = 'path';
    else if (match[0].includes('RequestBody')) location = 'body';
    else if (match[0].includes('RequestHeader')) location = 'header';
    else if (match[0].includes('CookieValue')) location = 'cookie';

    params.push({
      name: paramName,
      location,
      type: paramType.toLowerCase(),
      required: !match[0].includes('required=false')
    });
  }

  return params;
}

function parseExpressCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const routerPattern = /(?:router|app)\s*\.\s*(get|post|put|delete|patch|head|options|all)\s*\(\s*(?:['"`](\/[^'"`\)]+)|`([^`\)]+)`)/gi;
  const seen = new Set<string>();
  let match;

  while ((match = routerPattern.exec(code)) !== null) {
    const [, httpMethod, path1, path2] = match;
    const path = path1 || path2;
    const method = httpMethod.toUpperCase();

    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: extractJSComment(code, match.index),
      parameters: extractExpressParams(path),
      tags: ['Express', 'Node.js'],
      source: 'backend',
      framework: 'express'
    });
  }

  const fastifyPattern = /fastify\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*(?:['"`](\/[^'"`\)]+)|`([^`\)]+)`)/gi;
  while ((match = fastifyPattern.exec(code)) !== null) {
    const [, httpMethod, path1, path2] = match;
    const path = path1 || path2;
    const method = httpMethod.toUpperCase();

    const key = `fastify-${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: '',
      parameters: extractExpressParams(path),
      tags: ['Fastify', 'Node.js'],
      source: 'backend',
      framework: 'fastify'
    });
  }

  return interfaces;
}

function parseFlaskCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const routePattern = /@(?:app|bp|blueprint)\s*\.\s*(?:route|get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  const seen = new Set<string>();
  let match;

  while ((match = routePattern.exec(code)) !== null) {
    const [, path] = match;
    const httpMethod = extractFlaskMethod(code, match.index);
    const method = httpMethod.toUpperCase();

    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: extractPythonDocstring(code, match.index),
      parameters: extractFlaskParams(path),
      tags: ['Flask', 'Python'],
      source: 'backend',
      framework: 'flask'
    });
  }

  return interfaces;
}

function extractFlaskMethod(code: string, index: number): string {
  const before = code.slice(Math.max(0, index - 50), index + 100);
  const decoratorMatch = before.match(/@(?:app|bp)\s*\.\s*(get|post|put|delete|patch)\s*\(/i);
  if (decoratorMatch) return decoratorMatch[1];

  const methodsMatch = before.match(/methods\s*=\s*\[([^\]]+)\]/i);
  if (methodsMatch) {
    const firstMethod = methodsMatch[1].match(/['"](\w+)['"]/);
    return firstMethod ? firstMethod[1] : 'GET';
  }

  return 'GET';
}

function extractFlaskParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const paramPattern = /<(\w+)(?::(\w+))?>/g;
  let match;

  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: mapPythonType(match[2] || 'string'),
      required: true
    });
  }

  return params;
}

function parseFastAPICode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const decoratorPattern = /@app\s*\.\s*(?:get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*response_model\s*=\s*(\w+))?(?:\s*,\s*status_code\s*=\s*\d+)?(?:\s*,\s*tags\s*=\s*\[[^\]]+\])?\s*(?:->\s*\w+)?/gi;
  const seen = new Set<string>();
  let match;

  while ((match = decoratorPattern.exec(code)) !== null) {
    const [fullMatch, path, responseModel] = match;
    const method = fullMatch.match(/@(?:app)\s*\.\s*(\w+)\s*\(/)?.[1]?.toUpperCase() || 'GET';

    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: extractPythonDocstring(code, match.index),
      parameters: extractFastAPIParams(code, match.index),
      tags: ['FastAPI', 'Python'],
      source: 'backend',
      framework: 'fastapi'
    });
  }

  const routerPattern = /@(\w+)\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = routerPattern.exec(code)) !== null) {
    const [fullMatch, routerName, path] = match;
    const method = fullMatch.match(/\.(\w+)\s*\(/)?.[1]?.toUpperCase() || 'GET';

    const key = `${routerName}-${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path,
      method,
      description: '',
      parameters: extractFastAPIParams(code, match.index),
      tags: ['FastAPI', 'Python', routerName],
      source: 'backend',
      framework: 'fastapi'
    });
  }

  return interfaces;
}

function extractFastAPIParams(code: string, index: number): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const snippet = code.slice(index, index + 500);

  const paramPattern = /(\w+)\s*:\s*(?:(\w+)\s*=\s*[^,)]+|Query\([^)]*\)|Path\([^)]*\)|Body\([^)]*\))/g;
  let match;

  while ((match = paramPattern.exec(snippet)) !== null) {
    const [, paramName, paramType] = match;
    if (['self', 'cls', 'return'].includes(paramName)) continue;

    let location = 'query';
    let required = true;
    let type = paramType || 'string';

    if (match[0].includes('Path(')) {
      location = 'path';
      required = true;
    } else if (match[0].includes('Body(')) {
      location = 'body';
      required = true;
    } else if (match[0].includes('Query(')) {
      location = 'query';
      required = !match[0].includes('None');
    }

    params.push({
      name: paramName,
      location,
      type: type.toLowerCase(),
      required
    });
  }

  return params;
}

function parseDjangoCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const pathPattern = /path\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:(\w+)\s*\.\s*)?(\w+)\s*(?:,\s*name\s*=\s*['"](\w+)['"])?\s*\)/gi;
  const seen = new Set<string>();
  let match;

  while ((match = pathPattern.exec(code)) !== null) {
    const [, path, viewModule, viewName, urlName] = match;
    const viewFunction = viewModule ? `${viewModule}.${viewName}` : viewName;

    const key = `django:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: urlName || extractBackendMethodName(path),
      path: path.startsWith('/') ? path : '/' + path,
      method: 'GET',
      description: `Django view: ${viewFunction}`,
      parameters: extractDjangoParams(path),
      tags: ['Django', 'Python'],
      source: 'backend',
      framework: 'django'
    });
  }

  const decoratorPattern = /@(?:login_required|permission_required|require_http_methods|require_GET|require_POST)\s*(?:\([^)]*\))?\s*$/gm;
  let decoratorIndex;
  let lastIndex = 0;

  while ((decoratorIndex = decoratorPattern.exec(code)) !== null) {
    const snippet = code.slice(decoratorIndex.index, decoratorIndex.index + 300);
    const funcMatch = snippet.match(/def\s+(\w+)\s*\(/);
    if (funcMatch) {
      const method = snippet.includes('require_POST') ? 'POST' :
                     snippet.includes('require_GET') ? 'GET' : 'GET';
      interfaces.push({
        name: funcMatch[1],
        path: '/',
        method,
        description: '',
        parameters: [],
        tags: ['Django', 'Python'],
        source: 'backend',
        framework: 'django'
      });
    }
  }

  return interfaces;
}

function extractDjangoParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const paramPattern = /<(\w+)(?::[\w]+)?>/g;
  let match;

  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: 'string',
      required: true
    });
  }

  return params;
}

function parseGoCode(code: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const routerPatterns = [
    /(?:r|router|mux|Engine|ServeMux)\s*\.\s*(?:HandleFunc|Handle)\s*\(\s*["']([^"']+)["']\s*,\s*(\w+)/gi,
    /(?:r|router|mux)\s*\.\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*["']([^"']+)["']\s*,\s*(\w+)/gi,
    /chi\s*\.\s*NewRouter\(\)\s*\.\s*(?:Get|Post|Put|Delete|Patch)\s*\(\s*["']([^"']+)["']\s*,\s*(\w+)/gi,
    /gorilla\s*\.\s*mux\s*\.\s*NewRouter\(\)\s*\.\s*HandleFunc\s*\(\s*["']([^"']+)["']/gi,
    /gin\s*\.\s*(?:Engine|Group)\s*\.\s*(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*["']([^"']+)["']\s*,\s*(?:\w+\s*\.\s*)?(\w+)/gi,
  ];

  const seen = new Set<string>();

  for (const pattern of routerPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      let path = match[1];
      let method = 'GET';
      let handler = match[2] || '';

      if (['HandleFunc', 'Handle'].includes(match[0].match(/\.(HandleFunc|Handle)\s*\(/)?.[1] || '')) {
        method = extractGoMethod(code, match.index);
      } else {
        method = path.match(/^(GET|POST|PUT|DELETE|PATCH)/)?.[1] || 'GET';
        path = path.replace(/^(GET|POST|PUT|DELETE|PATCH):?\s*/, '');
      }

      const key = `go:${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: handler || extractBackendMethodName(path),
        path: path.startsWith('/') ? path : '/' + path,
        method,
        description: extractGoComment(code, handler),
        parameters: extractGoParams(path),
        tags: ['Go', extractGoFramework(code, match.index)],
        source: 'backend',
        framework: extractGoFramework(code, match.index).toLowerCase()
      });
    }
  }

  const structPattern = /type\s+(\w+)\s+struct\s*\{([^}]+)\}/g;
  let match;

  while ((match = structPattern.exec(code)) !== null) {
    const structName = match[1];
    const structBody = match[2];

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(\w+)\s+(?:\*?)(\w+(?:\[\d*\])?)\s*(?:`([^`]+)`)?/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(structBody)) !== null) {
      const [, fieldName, fieldType, jsonTag] = fieldMatch;
      if (!fieldName.match(/^[A-Z]/) || fieldName === '_') continue;

      const jsonName = jsonTag?.match(/json:"([^,"]+)/)?.[1];

      fields.push({
        name: jsonName || fieldName,
        type: mapGoType(fieldType.replace(/\[\]/g, 'Array')),
        nullable: fieldType.startsWith('*') || fieldType.includes('null')
      });
    }

    if (fields.length > 0) {
      models.push({
        name: structName,
        fields,
        source: 'code'
      });
    }
  }

  return { interfaces, models };
}

function extractGoMethod(code: string, index: number): string {
  const slice = code.slice(Math.max(0, index - 300), index);
  const methodMatch = slice.match(/methods?\s*=\s*\[([^\]]+)\]/i);
  if (methodMatch) {
    const firstMethod = methodMatch[1].match(/["'](\w+)["']/);
    return firstMethod ? firstMethod[1].toUpperCase() : 'GET';
  }
  return 'GET';
}

function extractGoFramework(code: string, index: number): string {
  const slice = code.slice(Math.max(0, index - 500), index);

  if (slice.includes('gin-gonic/gin') || slice.includes('gin.')) return 'Gin';
  if (slice.includes('chi-mondie') || slice.includes('go-chi/chi')) return 'Chi';
  if (slice.includes('gorilla/mux') || slice.includes('gorilla')) return 'Gorilla';
  if (slice.includes('echo.lab') || slice.includes('echo.')) return 'Echo';
  if (slice.includes('fiber')) return 'Fiber';

  return 'net/http';
}

function extractGoParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];

  const bracePattern = /\{(\w+)\}/g;
  let match;

  while ((match = bracePattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: 'string',
      required: true
    });
  }

  const colonPattern = /:(\w+)/g;
  while ((match = colonPattern.exec(path)) !== null) {
    if (!params.some(p => p.name === match[1])) {
      params.push({
        name: match[1],
        location: 'path',
        type: 'string',
        required: true
      });
    }
  }

  return params;
}

function parseNestJSCode(code: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const decoratorPattern = /@(?:Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*(?:['"]([^'"]+)['"]|statusCode\s*=\s*\d+)?\s*\)/gi;
  const seen = new Set<string>();
  let match;

  const methodMap: Record<string, string> = {
    Get: 'GET', Post: 'POST', Put: 'PUT', Delete: 'DELETE', Patch: 'PATCH',
    Options: 'OPTIONS', Head: 'HEAD', All: 'GET'
  };

  while ((match = decoratorPattern.exec(code)) !== null) {
    const decoratorName = match[0].match(/@(Get|Post|Put|Delete|Patch|Options|Head|All)/)?.[1] || 'Get';
    const path = match[1] || '/';
    const method = methodMap[decoratorName] || 'GET';

    const key = `nest:${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractBackendMethodName(path),
      path: path.startsWith('/') ? path : '/' + path,
      method,
      description: extractTSComment(code, match.index),
      parameters: extractNestJSParams(code, match.index),
      tags: ['NestJS', 'TypeScript'],
      source: 'backend',
      framework: 'nestjs'
    });
  }

  const classPattern = /(?:@Schema|@ObjectType)\s*\([^)]*\)\s*class\s+(\w+)/gi;
  while ((match = classPattern.exec(code)) !== null) {
    const className = match[1];
    const classBody = extractNestJSClassBody(code, match.index);

    if (classBody) {
      const fields: ParsedModel['fields'] = [];
      const fieldPattern = /(?:@(?:Prop|Field|Column)\s*(?:\([^)]*\))?\s*)?(\w+)\s*\??:\s*(\w+)/gi;
      let fieldMatch;

      while ((fieldMatch = fieldPattern.exec(classBody)) !== null) {
        const [, fieldName, fieldType] = fieldMatch;
        if (['constructor', 'ngOnInit', 'ngOnDestroy'].includes(fieldName)) continue;

        fields.push({
          name: fieldName,
          type: mapTsType(fieldType),
          nullable: classBody.includes(fieldName + '?')
        });
      }

      if (fields.length > 0) {
        models.push({
          name: className,
          fields,
          source: 'code'
        });
      }
    }
  }

  const dtoPattern = /class\s+(\w+(?:Dto|Input|Payload|Request|Response))\s*(?:extends\s+\w+)?\s*\{([^}]+)\}/gi;
  while ((match = dtoPattern.exec(code)) !== null) {
    const [, dtoName, dtoBody] = match;

    if (!models.some(m => m.name === dtoName)) {
      const fields: ParsedModel['fields'] = [];
      const fieldPattern = /(?:@(?:IsString|IsNumber|IsBoolean|IsEmail|IsOptional)\s*(?:\([^)]*\))?\s*)?(\w+)\s*\??:\s*(\w+)/gi;
      let fieldMatch;

      while ((fieldMatch = fieldPattern.exec(dtoBody)) !== null) {
        fields.push({
          name: fieldMatch[1],
          type: mapTsType(fieldMatch[2]),
          nullable: dtoBody.includes(fieldMatch[1] + '?')
        });
      }

      if (fields.length > 0) {
        models.push({
          name: dtoName,
          fields,
          source: 'code'
        });
      }
    }
  }

  return { interfaces, models };
}

function extractNestJSClassBody(code: string, index: number): string | null {
  const slice = code.slice(index, index + 2000);
  const openBrace = slice.indexOf('{');
  if (openBrace === -1) return null;

  let braceCount = 0;
  for (let i = openBrace; i < slice.length; i++) {
    if (slice[i] === '{') braceCount++;
    else if (slice[i] === '}') {
      braceCount--;
      if (braceCount === 0) return slice.slice(openBrace + 1, i);
    }
  }

  return null;
}

function extractNestJSParams(code: string, index: number): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const snippet = code.slice(index, index + 500);

  const paramPattern = /@(?:Param|Query|Body|Headers|Cookies)\s*(?:\(([^)]*)\))?\s*\(\s*\)/g;
  let match;

  while ((match = paramPattern.exec(snippet)) !== null) {
    const decoratorContent = match[1] || '';
    const paramMatch = decoratorContent.match(/['"](\w+)['"]/);
    const paramName = paramMatch ? paramMatch[1] : 'param';

    let location = 'query';
    if (match[0].includes('Param')) location = 'path';
    else if (match[0].includes('Body')) location = 'body';
    else if (match[0].includes('Headers')) location = 'header';
    else if (match[0].includes('Cookies')) location = 'cookie';

    params.push({
      name: paramName,
      location,
      type: 'string',
      required: !snippet.includes(paramName + '?')
    });
  }

  return params;
}

function parseRailsCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];

  const resourcesPattern = /resources\s+:(\w+)(?:\s*,\s*only\s*:\s*\[([^\]]+)\])?(?:\s*,\s*except\s*:\s*\[([^\]]+)\])?/gi;
  const seen = new Set<string>();
  let match;

  const restfulActions: Record<string, string> = {
    index: 'GET', show: 'GET', new: 'GET', create: 'POST',
    edit: 'GET', update: 'PUT', destroy: 'DELETE'
  };

  while ((match = resourcesPattern.exec(code)) !== null) {
    const resourceName = match[1];
    const onlyActions = match[2] ? match[2].split(',').map(a => a.trim()) : null;
    const exceptActions = match[3] ? match[3].split(',').map(a => a.trim()) : null;

    const actions = onlyActions || Object.keys(restfulActions);
    const filteredActions = exceptActions
      ? actions.filter(a => !exceptActions.includes(a))
      : actions;

    for (const action of filteredActions) {
      const method = restfulActions[action];
      if (!method) continue;

      let path: string;
      if (action === 'index') path = `/${resourceName}`;
      else if (action === 'new') path = `/${resourceName}/new`;
      else if (['create', 'index'].includes(action)) path = `/${resourceName}`;
      else path = `/${resourceName}/:id`;

      const key = `rails:${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: `${resourceName}#${action}`,
        path,
        method,
        description: `Rails RESTful action: ${action}`,
        parameters: action !== 'index' && action !== 'create' ? [{ name: 'id', location: 'path', type: 'integer', required: true }] : [],
        tags: ['Rails', 'Ruby'],
        source: 'backend',
        framework: 'rails'
      });
    }
  }

  const memberPattern = /member\s+do\s*\n([\s\S]*?)end\s*\n\s*end/gi;
  while ((match = memberPattern.exec(code)) !== null) {
    const memberBlock = match[1];
    const memberActions = memberBlock.match(/(?:get|post|put|patch|delete)\s+['"](\w+)['"]/gi);

    if (memberActions) {
      for (const action of memberActions) {
        const [, httpMethod, actionName] = action.match(/(get|post|put|patch|delete)\s+['"](\w+)['"]/) || [];
        if (!httpMethod) continue;

        interfaces.push({
          name: `member#${actionName}`,
          path: '/resources/:id',
          method: httpMethod.toUpperCase(),
          description: `Rails member action: ${actionName}`,
          parameters: [{ name: 'id', location: 'path', type: 'integer', required: true }],
          tags: ['Rails', 'Ruby'],
          source: 'backend',
          framework: 'rails'
        });
      }
    }
  }

  return interfaces;
}

function parseRailsModels(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const modelPattern = /class\s+(\w+)(?:\s+<\s*\w+)?(?:\s+<<\s*self)?\s*\n([\s\S]*?)(?=\n\s*(?:class\s+\w|module\s+\w|end\s*$|$))/gi;
  let match;

  while ((match = modelPattern.exec(code)) !== null) {
    const className = match[1];
    const classBody = match[2];

    if (className.match(/^[A-Z].*[^s]$/) || className === 'ApplicationRecord') continue;

    const fields: ParsedModel['fields'] = [];

    const attrPattern = /(?::)(\w+)(?:\s*,\s*(?:string|integer|text|boolean|datetime|float|decimal|references)\s*(?:\[\d+\])?)?/gi;
    let attrMatch;

    while ((attrMatch = attrPattern.exec(classBody)) !== null) {
      const fieldName = attrMatch[1];
      const fieldTypeMatch = classBody.slice(attrMatch.index, attrMatch.index + 100).match(/(?:string|integer|text|boolean|datetime|float|decimal|references)/i);
      const fieldType = fieldTypeMatch ? fieldTypeMatch[0].toLowerCase() : 'string';

      fields.push({
        name: fieldName,
        type: mapRubyType(fieldType),
        nullable: !classBody.includes(`validates :${fieldName}, presence: true`)
      });
    }

    if (fields.length > 0) {
      models.push({
        name: className,
        fields,
        source: 'code'
      });
    }
  }

  return models;
}

function parseEnhancedSQL(sql: string, dialect: string = 'mysql'): ParsedTable[] {
  const tables: ParsedTable[] = [];

  const createTablePatterns: Record<string, RegExp> = {
    mysql: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)(?:\s*(?:ENGINE|CHARSET|COLLATE|AUTO_INCREMENT)=[^\n;]*)?;?/gi,
    postgresql: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(([\s\S]*?)\)(?:\s+RETURNS\s+\w+)?;?/gi,
    sqlite: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(([\s\S]*?)\)\s*;?/gi,
    mssql: /CREATE\s+TABLE\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?\s*\(([\s\S]*?)\)(?:\s+ON\s+\[PRIMARY\])?;?/gi,
  };

  const pattern = createTablePatterns[dialect] || createTablePatterns.mysql;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsStr = match[2];

    const columns: ParsedTable['columns'] = [];
    const indexes: ParsedTable['indexes'] = [];
    const primaryKeys = new Set<string>();

    const pkConstraint = columnsStr.match(/\bPRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkConstraint) {
      pkConstraint[1].split(',').forEach(pk => {
        primaryKeys.add(pk.trim().replace(/[`"'\[\]]/g, ''));
      });
    }

    const uniqueConstraints: Record<string, string[]> = {};
    const uniqueMatch = columnsStr.matchAll(/\bUNIQUE\s*(?:KEY|INDEX)?\s*(?:[`"']?(\w+)[`"']?)?\s*\(([^)]+)\)/gi);
    for (const um of uniqueMatch) {
      const indexName = um[1] || `unique_${Object.keys(uniqueConstraints).length}`;
      uniqueConstraints[indexName] = um[2].split(',').map(c => c.trim().replace(/[`"'\[\]]/g, ''));
    }

    const fkConstraints: Record<string, { table: string; column: string }> = {};
    const fkMatch = columnsStr.matchAll(/\bFOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+"?(\w+)"?\s*\(([^)]+)\)/gi);
    for (const fm of fkMatch) {
      fkConstraints[fm[1].trim().replace(/[`"'\[\]]/g, '')] = {
        table: fm[2],
        column: fm[3]
      };
    }

    const columnDefs = splitColumnDefs(columnsStr, dialect);

    for (const colDef of columnDefs) {
      const trimmed = colDef.trim();
      if (!trimmed || /^(PRIMARY|FOREIGN|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK)/i.test(trimmed)) continue;

      const parsed = parseColumnDefinition(trimmed, dialect, primaryKeys, uniqueConstraints, fkConstraints);
      if (parsed) {
        columns.push(parsed);
      }
    }

    const indexMatch = columnsStr.matchAll(/\b(INDEX|KEY)\s*(?:[`"']?(\w+)[`"']?)?\s*\(([^)]+)\)/gi);
    for (const im of indexMatch) {
      const indexName = im[2] || `index_${im[3].split(',')[0].trim().replace(/[`"'\[\]]/g, '')}`;
      indexes.push({
        name: indexName,
        columns: im[3].split(',').map(c => c.trim().replace(/[`"'\[\]]/g, '')),
        unique: false
      });
    }

    if (columns.length > 0) {
      tables.push({
        name: tableName,
        columns,
        indexes,
        source: 'sql'
      });
    }
  }

  return tables;
}

function splitColumnDefs(columnsStr: string, dialect: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inParen = 0;

  for (let i = 0; i < columnsStr.length; i++) {
    const char = columnsStr[i];

    if (char === '(') {
      inParen++;
      current += char;
    } else if (char === ')') {
      inParen--;
      current += char;
    } else if (char === ',' && inParen === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

function parseColumnDefinition(
  colDef: string,
  dialect: string,
  primaryKeys: Set<string>,
  uniqueConstraints: Record<string, string[]>,
  fkConstraints: Record<string, { table: string; column: string }>
): ParsedTable['columns'][0] | null {
  const nameMatch = colDef.match(/^[`"']?(\w+)[`"']?\s+/i);
  if (!nameMatch) return null;

  const name = nameMatch[1].replace(/[`"'\[\]]/g, '');
  const rest = colDef.slice(nameMatch[0].length);

  const typeMatch = rest.match(/^(\w+(?:\([^)]+\))?)/i);
  if (!typeMatch) return null;

  const type = typeMatch[1].toUpperCase();
  const restAfterType = rest.slice(typeMatch[0].length);

  const upperRest = restAfterType.toUpperCase();
  const isPrimaryKey = primaryKeys.has(name) ||
    upperRest.includes('PRIMARY KEY') ||
    name.toLowerCase() === 'id' ||
    typeMatch[0].toUpperCase().includes('SERIAL') ||
    typeMatch[0].toUpperCase().includes('AUTO_INCREMENT');

  const isNullable = !upperRest.includes('NOT NULL') && !isPrimaryKey;
  const isUnique = Object.values(uniqueConstraints).some(cols => cols.includes(name));

  const defaultMatch = restAfterType.match(/DEFAULT\s+([^\s,]+)/i);
  const commentMatch = restAfterType.match(/COMMENT\s+['"]([^'"]+)['"]/i);

  let foreignKey: ParsedTable['columns'][0]['foreignKey'] | undefined;
  if (fkConstraints[name]) {
    foreignKey = fkConstraints[name];
  }

  return {
    name,
    type: mapSQLType(type, dialect),
    nullable: isNullable,
    primaryKey: isPrimaryKey || undefined,
    unique: isUnique || undefined,
    default: defaultMatch?.[1],
    comment: commentMatch?.[1],
    foreignKey
  };
}

function generateEnhancedAssociations(result: ProjectParseResult, sensitivity: string): Association[] {
  const associations: Association[] = [];
  const frontendInterfaces = result.interfaces.filter(i => i.source === 'frontend');
  const backendInterfaces = result.interfaces.filter(i => i.source === 'backend');
  const allModels = result.models;

  for (const frontend of frontendInterfaces) {
    const matches = findMatchingBackends(frontend, backendInterfaces, sensitivity);

    for (const match of matches) {
      const model = findRelatedModel(frontend.path, allModels);
      const table = result.tables.find(t =>
        singularize(t.name).toLowerCase() === (model?.name || '').toLowerCase() ||
        t.name.toLowerCase().includes((model?.name || '').toLowerCase())
      );

      associations.push({
        frontend: `${frontend.method} ${frontend.path}`,
        backend: `${match.backend.method} ${match.backend.path}`,
        model: model?.name,
        table: table?.name,
        confidence: match.confidence,
        matchType: match.type
      });
    }
  }

  for (const model of allModels) {
    const existing = associations.find(a => a.model === model.name);
    if (existing) continue;

    const table = result.tables.find(t => {
      const modelLower = model.name.toLowerCase();
      const tableLower = t.name.toLowerCase();
      const singularLower = singularize(tableLower);
      const pluralLower = pluralize(tableLower);

      return modelLower === singularLower ||
             modelLower === pluralLower ||
             modelLower === tableLower ||
             singularLower === modelLower ||
             pluralLower === modelLower;
    });

    if (table) {
      associations.push({
        frontend: '',
        backend: '',
        table: table.name,
        model: model.name,
        confidence: 0.95,
        matchType: 'exact'
      });
    }
  }

  return associations.sort((a, b) => b.confidence - a.confidence);
}

function findMatchingBackends(
  frontend: ParsedInterface,
  backends: ParsedInterface[],
  sensitivity: string
): Array<{ backend: ParsedInterface; confidence: number; type: Association['matchType'] }> {
  const matches: Array<{ backend: ParsedInterface; confidence: number; type: Association['matchType'] }> = [];

  for (const backend of backends) {
    const fPath = normalizePath(frontend.path);
    const bPath = normalizePath(backend.path);

    if (fPath === bPath) {
      const sameMethod = frontend.method === backend.method;
      matches.push({
        backend,
        confidence: sameMethod ? 1.0 : 0.9,
        type: 'exact'
      });
      continue;
    }

    const fParts = fPath.split('/').filter(Boolean);
    const bParts = bPath.split('/').filter(Boolean);

    if (fParts.length === bParts.length) {
      let matchCount = 0;
      let paramCount = 0;

      for (let i = 0; i < fParts.length; i++) {
        if (fParts[i] === bParts[i]) {
          matchCount++;
        } else if (fParts[i].startsWith(':') || fParts[i].startsWith('{') || bParts[i].startsWith(':') || bParts[i].startsWith('{')) {
          paramCount++;
        }
      }

      const similarity = matchCount / fParts.length;
      if (similarity >= (sensitivity === 'strict' ? 1.0 : sensitivity === 'loose' ? 0.5 : 0.75)) {
        matches.push({
          backend,
          confidence: similarity + (paramCount * 0.05),
          type: 'path'
        });
      }
    }

    if (fPath.endsWith(bPath) || bPath.endsWith(fPath)) {
      matches.push({
        backend,
        confidence: 0.7,
        type: 'partial'
      });
    }

    const fLast = fParts[fParts.length - 1]?.replace(/[:{}]/g, '');
    const bLast = bParts[bParts.length - 1]?.replace(/[:{}]/g, '');

    if (fLast && bLast && isSemanticMatch(fLast, bLast)) {
      matches.push({
        backend,
        confidence: 0.6,
        type: 'semantic'
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

function isSemanticMatch(str1: string, str2: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[_-]/g, '');

  const n1 = normalize(str1);
  const n2 = normalize(str2);

  if (n1 === n2) return true;

  const commonPrefixes = ['user', 'product', 'order', 'item', 'category', 'tag', 'role', 'perm', 'config', 'setting'];
  for (const prefix of commonPrefixes) {
    if ((n1.startsWith(prefix) && n2.startsWith(prefix)) ||
        (n1.endsWith(prefix) && n2.endsWith(prefix))) {
      return true;
    }
  }

  const inflections: Record<string, string[]> = {
    'user': ['users', 'user', 'username', 'account'],
    'product': ['products', 'product', 'item', 'goods'],
    'order': ['orders', 'order', 'transaction'],
    'category': ['categories', 'category', 'cat', 'type', 'kind'],
  };

  for (const [base, variants] of Object.entries(inflections)) {
    if ((variants.includes(n1) && variants.includes(n2)) ||
        (n1.includes(base) && n2.includes(base))) {
      return true;
    }
  }

  return false;
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
    if (word[0] === word[0].toUpperCase()) {
      return irregulars[lower].charAt(0).toUpperCase() + irregulars[lower].slice(1);
    }
    return irregulars[lower];
  }

  if (lower.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(lower[lower.length - 2])) {
    return word.slice(0, -1) + 'ies';
  }

  if (lower.endsWith('fe')) return word.slice(0, -2) + 'ves';
  if (lower.endsWith('f')) return word.slice(0, -1) + 'ves';
  if (lower.endsWith('o')) return word + 'es';
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') ||
      lower.endsWith('ch') || lower.endsWith('sh')) {
    return word + 'es';
  }

  return word + 's';
}

function normalizePath(path: string): string {
  return path
    .replace(/:(\w+)/g, '{id}')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
    || '/';
}

function extractFrontendEndpointName(path: string): string {
  const cleanPath = path.replace(/^(GET|POST|PUT|DELETE|PATCH):?\s*/, '');
  const parts = cleanPath.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'));
  if (parts.length === 0) return 'Root';
  return parts.map(p => capitalize(p.replace(/[-_]/g, ''))).join('');
}

function extractBackendMethodName(path: string): string {
  const parts = path.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'));
  return parts.map(p => capitalize(p.replace(/[-_]/g, ''))).join('') || 'Index';
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractCodeComment(code: string, index: number): string {
  const lines = code.substring(0, index).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.includes('//')) {
      return line.replace(/^\s*\/\//, '').replace(/^\s*\/\*\*?\s*/, '').trim();
    }
    if (line.includes('/*')) {
      const commentStart = line.indexOf('/*');
      const commentEnd = line.indexOf('*/');
      if (commentEnd > commentStart) {
        return line.slice(commentStart + 2, commentEnd).replace(/^\s*\*\s*/, '').trim();
      }
    }
    if (line && !line.startsWith('//') && !line.startsWith('*')) {
      break;
    }
  }
  return '';
}

function extractJavaDoc(code: string, index: number): string {
  const slice = code.slice(Math.max(0, index - 300), index);
  const javadocMatch = slice.match(/\/\*\*([\s\S]*?)\*\//);
  if (javadocMatch) {
    const lines = javadocMatch[1].split('\n');
    const description = lines
      .map(l => l.replace(/^\s*\*\s*/, '').trim())
      .filter(l => l && !l.startsWith('@'))
      .join(' ');
    return description;
  }
  return '';
}

function extractClassJavaDoc(classBody: string): string {
  const javadocMatch = classBody.match(/\/\*\*([\s\S]*?)\*\//);
  if (javadocMatch) {
    const firstLine = javadocMatch[1].split('\n')[0];
    return firstLine.replace(/^\s*\*\s*/, '').trim();
  }
  return '';
}

function extractPythonDocstring(code: string, index: number): string {
  const slice = code.slice(Math.max(0, index - 100), index + 500);
  const docstringMatch = slice.match(/"""\s*([\s\S]*?)"""\s*$/m) || slice.match(/'''\s*([\s\S]*?)'''\s*$/m);
  if (docstringMatch) {
    return docstringMatch[1].split('\n')[0].trim();
  }
  return '';
}

function extractJSComment(code: string, index: number): string {
  const lines = code.substring(0, index).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('//')) {
      return line.replace(/^\s*\/\//, '').trim();
    }
    if (line && !line.startsWith('//')) {
      break;
    }
  }
  return '';
}

function extractTSComment(code: string, index: number): string {
  return extractJSComment(code, index);
}

function extractGoComment(code: string, funcName: string): string {
  const funcPattern = new RegExp(`func\\s+${funcName}\\s*\\(`);
  const funcIndex = code.search(funcPattern);
  if (funcIndex === -1) return '';

  const before = code.slice(Math.max(0, funcIndex - 300), funcIndex);
  const commentMatch = before.match(/\/\*\s*([\s\S]*?)\s*\*\/\s*$/);
  if (commentMatch) {
    return commentMatch[1].split('\n')[0].replace(/^\s*\*\s*/, '').trim();
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

function extractExpressParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];
  const paramPattern = /:(\w+)/g;
  let match;

  while ((match = paramPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: 'string',
      required: true
    });
  }

  return params;
}

function extractPathParams(path: string): ParsedInterface['parameters'] {
  const params: ParsedInterface['parameters'] = [];

  const colonPattern = /:(\w+)/g;
  let match;

  while ((match = colonPattern.exec(path)) !== null) {
    params.push({
      name: match[1],
      location: 'path',
      type: 'string',
      required: true
    });
  }

  const bracePattern = /\{(\w+)\}/g;
  while ((match = bracePattern.exec(path)) !== null) {
    if (!params.some(p => p.name === match[1])) {
      params.push({
        name: match[1],
        location: 'path',
        type: 'string',
        required: true
      });
    }
  }

  return params;
}

function mapJavaTypeToTS(javaType: string): string {
  const typeMap: Record<string, string> = {
    String: 'string', StringBuilder: 'string',
    int: 'number', Integer: 'number', long: 'number', Long: 'number',
    short: 'number', Short: 'number', byte: 'number', Byte: 'number',
    double: 'number', Double: 'number', float: 'number', Float: 'number',
    BigDecimal: 'number',
    boolean: 'boolean', Boolean: 'boolean',
    char: 'string', Character: 'string',
    Date: 'string', LocalDate: 'string', LocalDateTime: 'string',
    Timestamp: 'string', Instant: 'string', LocalTime: 'string',
    List: 'array', ArrayList: 'array', Set: 'array', HashSet: 'array',
    Map: 'object', HashMap: 'object', LinkedHashMap: 'object',
    Object: 'object',
    UUID: 'string', BigInteger: 'string',
  };

  const cleanType = javaType.replace(/^java\.lang\./, '').replace(/^java\.util\./, '').replace(/<[^>]+>/g, '');

  return typeMap[cleanType] || cleanType.toLowerCase();
}

function mapTsType(tsType: string): string {
  const typeMap: Record<string, string> = {
    String: 'string', number: 'number', Number: 'number',
    Boolean: 'boolean', boolean: 'boolean',
    Object: 'object', object: 'object',
    Array: 'array', any: 'any', unknown: 'unknown',
    void: 'void', null: 'null', undefined: 'undefined',
    Promise: 'any', Observable: 'any',
    'Record<string, any>': 'object', 'Partial<T>': 'object',
  };

  const cleanType = tsType.replace(/<[^>]+>/g, '').replace(/\[\]/g, 'Array');

  return typeMap[cleanType] || cleanType.toLowerCase();
}

function mapPythonType(pyType: string): string {
  const typeMap: Record<string, string> = {
    str: 'string', int: 'number', float: 'number', decimal: 'number',
    bool: 'boolean', datetime: 'string', date: 'string', time: 'string',
    list: 'array', dict: 'object', tuple: 'array', set: 'array',
    bytes: 'string', bytearray: 'string',
    None: 'null', Optional: 'any', Any: 'any',
    Text: 'string', CharField: 'string', EmailField: 'string',
    IntegerField: 'number', FloatField: 'number', DecimalField: 'number',
    BooleanField: 'boolean', DateTimeField: 'string', DateField: 'string',
    JSONField: 'object', ForeignKey: 'number',
    UUID: 'string', URL: 'string', Slug: 'string',
  };

  const cleanType = pyType.replace(/^typing\./, '').replace(/^Optional\[/, '').replace(/\]/, '');

  return typeMap[cleanType] || cleanType.toLowerCase();
}

function mapRubyType(rubyType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string', text: 'string',
    integer: 'number', decimal: 'number', float: 'number',
    boolean: 'boolean', datetime: 'string', date: 'string',
    time: 'string', timestamp: 'string',
    binary: 'string', json: 'object',
  };

  return typeMap[rubyType.toLowerCase()] || rubyType.toLowerCase();
}

function mapGoType(goType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    int: 'number', int8: 'number', int16: 'number', int32: 'number', int64: 'number',
    uint: 'number', uint8: 'number', uint16: 'number', uint32: 'number', uint64: 'number',
    float32: 'number', float64: 'number',
    bool: 'boolean',
    byte: 'number', rune: 'number',
    error: 'string',
    time: 'string', Time: 'string',
    json: 'string', RawMessage: 'string',
    interface: 'object', any: 'any',
  };

  const cleanType = goType.replace(/^\*/, '').replace(/\[\]/g, 'Array');

  return typeMap[cleanType] || cleanType.toLowerCase();
}

function mapSQLType(sqlType: string, dialect: string = 'mysql'): string {
  const upper = sqlType.toUpperCase();

  const typeMap: Record<string, string> = {
    INT: 'integer', INTEGER: 'integer', TINYINT: 'integer', SMALLINT: 'integer',
    MEDIUMINT: 'integer', BIGINT: 'integer', SERIAL: 'integer',
    DECIMAL: 'decimal', NUMERIC: 'decimal', NUMBER: 'decimal',
    FLOAT: 'float', REAL: 'float', DOUBLE: 'double', MONEY: 'decimal',
    VARCHAR: 'string', CHAR: 'string', NVARCHAR: 'string', NCHAR: 'string',
    TEXT: 'text', MEDIUMTEXT: 'text', LONGTEXT: 'text', TINYTEXT: 'text',
    DATE: 'date', DATETIME: 'datetime', TIMESTAMP: 'datetime', TIME: 'time',
    YEAR: 'number',
    BOOLEAN: 'boolean', BOOL: 'boolean', BIT: 'boolean',
    JSON: 'json', JSONB: 'json',
    BLOB: 'binary', BINARY: 'binary', VARBINARY: 'binary', TINYBLOB: 'binary',
    ENUM: 'enum', SET: 'set',
    UUID: 'string', UNIQUEIDENTIFIER: 'string',
  };

  if (dialect === 'postgresql') {
    const pgMap: Record<string, string> = {
      SERIAL: 'integer', BIGSERIAL: 'integer', SMALLSERIAL: 'integer',
      INT2: 'integer', INT4: 'integer', INT8: 'integer',
      FLOAT4: 'float', FLOAT8: 'float',
      BOOL: 'boolean', VARBIT: 'string', BPCHAR: 'string',
      BYTEA: 'binary', OID: 'number',
      XML: 'string', POINT: 'string', LINE: 'string',
      CIDR: 'string', INET: 'string', MACADDR: 'string',
    };
    Object.assign(typeMap, pgMap);
  }

  if (dialect === 'sqlite') {
    const sqliteMap: Record<string, string> = {
      INTEGER: 'integer', REAL: 'float', TEXT: 'string', BLOB: 'binary', NUMERIC: 'number',
    };
    Object.assign(typeMap, sqliteMap);
  }

  if (dialect === 'mssql') {
    const mssqlMap: Record<string, string> = {
      BIGINT: 'number', SMALLINT: 'number', TINYINT: 'number',
      SMALLMONEY: 'decimal', MONEY: 'decimal',
      DATETIME2: 'datetime', DATETIMEOFFSET: 'datetime', SMALLDATETIME: 'datetime',
      UNIQUEIDENTIFIER: 'string', ROWVERSION: 'binary', HIERARCHYID: 'string',
      SQL_VARIANT: 'any', NTEXT: 'text', IMAGE: 'binary',
    };
    Object.assign(typeMap, mssqlMap);
  }

  for (const [key, value] of Object.entries(typeMap)) {
    if (upper.startsWith(key)) {
      return value;
    }
  }

  return 'string';
}

function findRelatedModel(path: string, models: ParsedModel[]): ParsedModel | undefined {
  const pathParts = path.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'));
  const lastPart = pathParts[pathParts.length - 1];

  if (lastPart) {
    const singular = singularize(lastPart);
    const model = models.find(m =>
      m.name.toLowerCase() === singular.toLowerCase() ||
      m.name.toLowerCase() === lastPart.toLowerCase() ||
      m.name.toLowerCase() === singularize(lastPart).toLowerCase()
    );
    if (model) return model;
  }

  for (const model of models) {
    const modelLower = model.name.toLowerCase();
    const pathLower = path.toLowerCase().replace(/[:{}]/g, '');

    if (pathLower.includes(modelLower) || modelLower.includes(pathParts.join('').toLowerCase())) {
      return model;
    }
  }

  return undefined;
}

function generateAutoMappings(interfaces: ParsedInterface[], models: ParsedModel[]): Array<{
  interfacePath: string;
  interfaceMethod: string;
  interfaceField: string;
  modelName: string;
  modelField: string;
}> {
  const mappings: Array<{
    interfacePath: string;
    interfaceMethod: string;
    interfaceField: string;
    modelName: string;
    modelField: string;
  }> = [];

  for (const iface of interfaces) {
    const model = findRelatedModel(iface.path, models);
    if (!model) continue;

    for (const param of iface.parameters) {
      for (const field of model.fields) {
        if (isFieldMatch(param.name, field.name)) {
          mappings.push({
            interfacePath: iface.path,
            interfaceMethod: iface.method,
            interfaceField: param.name,
            modelName: model.name,
            modelField: field.name
          });
        }
      }
    }
  }

  return mappings;
}

function isFieldMatch(field1: string, field2: string): boolean {
  const n1 = field1.toLowerCase().replace(/[_-]/g, '');
  const n2 = field2.toLowerCase().replace(/[_-]/g, '');

  if (n1 === n2) return true;

  const commonFields: Record<string, string[]> = {
    id: ['id', 'uuid', 'key', 'pk'],
    name: ['name', 'title', 'label', 'username', 'display'],
    email: ['email', 'mail', 'emailAddress'],
    phone: ['phone', 'mobile', 'tel', 'telephone', 'cell'],
    address: ['address', 'location', 'addr', 'street'],
    created: ['created', 'createdAt', 'created_at', 'createdDate', 'dateCreated'],
    updated: ['updated', 'updatedAt', 'updated_at', 'modified', 'modifiedAt'],
  };

  for (const [canonical, variants] of Object.entries(commonFields)) {
    if ((n1 === canonical || variants.includes(n1)) &&
        (n2 === canonical || variants.includes(n2))) {
      return true;
    }
  }

  const n1HasN2 = n1.includes(n2) || n2.includes(n1);
  if (n1HasN2 && (n1.length > 2 && n2.length > 2)) return true;

  return false;
}

export default router;
