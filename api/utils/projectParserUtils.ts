export interface ParsedInterface {
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
    schema?: Record<string, unknown>;
  };
  tags: string[];
  source: 'frontend' | 'backend';
  framework?: string;
  serviceName?: string;
}

export interface ParsedModel {
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
  tableName?: string;
}

export interface ParsedTable {
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

export interface Association {
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

export interface ProjectParseResult {
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

export type FileCategory = 'frontend' | 'backend' | 'sql' | 'config' | 'unknown';

export function classifyFile(filePath: string, content: string): FileCategory {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const pathLower = filePath.toLowerCase();

  if (ext === 'sql') return 'sql';

  if (['vue', 'svelte'].includes(ext)) return 'frontend';
  if (['tsx', 'jsx'].includes(ext)) return 'frontend';
  if (['java', 'kt', 'groovy'].includes(ext)) return 'backend';
  if (['py'].includes(ext)) return 'backend';
  if (['go', 'rs', 'rb', 'php', 'cs'].includes(ext)) return 'backend';

  if (['html', 'css', 'scss', 'less', 'sass'].includes(ext)) return 'frontend';

  if (['ts', 'js', 'mts', 'cts'].includes(ext)) {
    return classifyAmbiguousFile(pathLower, content);
  }

  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) {
    if (pathLower.includes('flyway') || pathLower.includes('migration') || pathLower.includes('liquibase')) return 'sql';
    if (pathLower.includes('swagger') || pathLower.includes('openapi')) return 'backend';
    if (pathLower.includes('prisma') && ext !== 'json') return 'backend';
    return 'config';
  }

  if (ext === 'prisma') return 'backend';

  return 'unknown';
}

function classifyAmbiguousFile(pathLower: string, content: string): FileCategory {
  const backendPathPatterns = [
    '/server/', '/backend/', '/routes/', '/router/',
    '/controllers/', '/middleware/', '/models/',
    '/repositories/', '/dao/', '/migrations/', '/db/',
    '/entity/', '/entities/', '/schema/', '/schemas/',
    '/prisma/', '/knex/', '/sequelize/', '/typeorm/',
  ];

  const frontendPathPatterns = [
    '/components/', '/pages/', '/views/', '/layouts/',
    '/composables/', '/hooks/', '/stores/', '/store/',
    '/assets/', '/styles/', '/public/', '/static/',
    '/client/', '/frontend/', '/web/',
  ];

  const frontendApiPatterns = [
    '/src/api/', '/src/services/', '/src/service/',
    '/src/utils/request', '/src/lib/request',
    '/src/helpers/request', '/src/plugins/',
  ];

  for (const p of frontendApiPatterns) {
    if (pathLower.includes(p)) return 'frontend';
  }

  for (const p of backendPathPatterns) {
    if (pathLower.includes(p)) {
      const hasFrontendMarkers = /import\s+.*from\s+['"](@\/|vue|react|axios)/.test(content) ||
        /request\s*\(\s*\{\s*url\s*:/.test(content);
      if (hasFrontendMarkers) return 'frontend';
      return 'backend';
    }
  }

  for (const p of frontendPathPatterns) {
    if (pathLower.includes(p)) return 'frontend';
  }

  const backendScore = scoreBackendContent(content);
  const frontendScore = scoreFrontendContent(content);

  if (backendScore > frontendScore && backendScore > 0) return 'backend';
  if (frontendScore > backendScore && frontendScore > 0) return 'frontend';

  if (backendScore === 0 && frontendScore === 0) return 'unknown';

  return 'frontend';
}

function scoreBackendContent(content: string): number {
  let score = 0;
  const patterns: [RegExp, number][] = [
    [/(?:router|app|server)\s*\.\s*(get|post|put|delete|patch|all|use)\s*\(/gi, 3],
    [/@(?:GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping|PatchMapping)/g, 3],
    [/@(?:app|router|bp)\s*\.\s*(?:route|get|post|put|delete)\s*\(/gi, 3],
    [/(?:app|router)\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]/gi, 3],
    [/@Entity\s*\(/g, 4],
    [/@Table\s*\(/g, 3],
    [/(?:sequelize|Sequelize)\s*\.\s*define\s*\(/g, 4],
    [/(?:mongoose|Mongoose)\s*\.\s*model\s*\(/g, 4],
    [/new\s+Schema\s*\(/g, 4],
    [/@Column\s*\(/g, 3],
    [/@PrimaryGeneratedColumn\s*\(/g, 4],
    [/CREATE\s+TABLE\s+/gi, 5],
    [/INSERT\s+INTO\s+/gi, 2],
    [/SELECT\s+.*\s+FROM\s+/gi, 2],
    [/export\s+(?:default\s+)?(?:class|interface|type|enum)\s+\w+(?:Entity|Model|Repository|Service|Controller|Dao)/g, 3],
    [/import\s+.*from\s+['"]express['"]/g, 3],
    [/import\s+.*from\s+['"]koa['"]/g, 3],
    [/import\s+.*from\s+['"]fastify['"]/g, 3],
    [/import\s+.*from\s+['"]typeorm['"]/g, 3],
    [/import\s+.*from\s+['"]sequelize['"]/g, 3],
    [/import\s+.*from\s+['"]mongoose['"]/g, 3],
    [/import\s+.*from\s+['"]@prisma\/client['"]/g, 3],
    [/import\s+.*from\s+['"]pg['"]/g, 2],
    [/import\s+.*from\s+['"]mysql2['"]/g, 2],
    [/pool\s*\.\s*query\s*\(/g, 2],
    [/knex\s*\(/g, 2],
    [/module\.exports\s*=\s*(?:function|class|router|app)/g, 2],
    [/exports\s*\.\s*(?:handler|handlerFunc|main)/g, 2],
    [/app\s*\.\s*listen\s*\(/g, 2],
    [/const\s+port\s*=\s*(?:process\.env\.PORT|\d{4})/g, 1],
  ];

  for (const [pattern, weight] of patterns) {
    const matches = content.match(pattern);
    if (matches) score += matches.length * weight;
  }

  return score;
}

function scoreFrontendContent(content: string): number {
  let score = 0;
  const patterns: [RegExp, number][] = [
    [/import\s+.*from\s+['"]react['"]/g, 4],
    [/import\s+.*from\s+['"]vue['"]/g, 4],
    [/import\s+.*from\s+['"]@angular/g, 3],
    [/import\s+.*from\s+['"]svelte['"]/g, 3],
    [/import\s+.*from\s+['"]next['"]/g, 3],
    [/import\s+.*from\s+['"]nuxt3?['"]/g, 3],
    [/(?:React|ReactDOM)\s*\./g, 2],
    [/use[A-Z]\w+\s*\(/g, 2],
    [/<(?:div|span|button|input|form|table|ul|ol|li|a|img|nav|header|footer|main|section|article|aside|h[1-6])[\s>]/gi, 3],
    [/className\s*=/g, 3],
    [/(?:v-if|v-for|v-model|v-bind|v-on|@click|:class)/g, 3],
    [/export\s+default\s+(?:function\s+)?(?:\w+Page|\w+View|\w+Component|\w+Layout|\w+Widget)/g, 2],
    [/(?:useState|useEffect|useCallback|useMemo|useRef|useContext)\s*\(/g, 2],
    [/(?:computed|watch|ref|reactive|onMounted|onUnmounted)\s*\(/g, 2],
    [/document\.(?:getElementById|querySelector|createElement)/g, 2],
    [/window\.(?:addEventListener|location|history)/g, 1],
  ];

  for (const [pattern, weight] of patterns) {
    const matches = content.match(pattern);
    if (matches) score += matches.length * weight;
  }

  return score;
}

export function parseEnhancedFrontendCode(code: string, frameworkHint?: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const detectedFrameworks = new Set<string>();

  const enumApiMap = extractEnumApiPaths(code);

  const patterns: Array<{
    name: string;
    pattern: RegExp;
  }> = [
    { name: 'axios', pattern: /(?:axios|api|client|http|request|service)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'fetch', pattern: /fetch\s*\(\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'useQuery', pattern: /(?:useQuery|useMutation|useSWR|useAxios)\s*\(\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'axios-full', pattern: /(?:axios|api|client|http|request|service)\s*\(\s*\{\s*method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)['"`]\s*,\s*url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'uni-request', pattern: /uni\.(?:request|get|post|put|delete)\s*\(\s*\{\s*url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'wx-request', pattern: /wx\.(?:request|get|post|put|delete)\s*\(\s*\{\s*url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'taro-request', pattern: /Taro\.(?:request|get|post|put|delete)\s*\(\s*\{\s*url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'defHttp', pattern: /defHttp\s*\.\s*(get|post|put|delete|patch|uploadFile)\s*\(\s*\{\s*url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'defHttp-var', pattern: /defHttp\s*\.\s*(get|post|put|delete|patch|uploadFile)\s*\(\s*\{\s*url\s*:\s*(Api\.\w+|API\.\w+)/gi },
    { name: 'http-var', pattern: /(?:http|Http|HTTP)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*\{\s*url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'request-obj', pattern: /(?:request|Request)\s*\(\s*\{\s*(?:method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]\s*,\s*)?url\s*:\s*['"`]([^'"`]+)['"`]/gi },
    { name: 'request-obj-url-first', pattern: /(?:request|Request)\s*\(\s*\{[\s\S]*?url\s*:\s*['"`]([^'"`]+)['"`][\s\S]*?method\s*:\s*['"`](get|post|put|delete|patch|GET|POST|PUT|DELETE|PATCH)['"`]/gi },
  ];

  const seen = new Set<string>();

  for (const { name, pattern } of patterns) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      let method = 'GET';
      let apiPath = '';

      if (name === 'defHttp-var') {
        method = (match[1] || 'GET').toUpperCase();
        if (method === 'UPLOADFILE') method = 'POST';
        const varRef = match[2];
        const resolved = enumApiMap.get(varRef);
        if (resolved) {
          apiPath = resolved;
        } else {
          continue;
        }
      } else if (name === 'fetch' || name === 'uni-request' || name === 'wx-request' || name === 'taro-request') {
        apiPath = match[1];
        const methodMatch = code.slice(match.index, match.index + 200).match(/method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)['"`]/i);
        if (methodMatch) method = methodMatch[1].toUpperCase();
      } else if (name === 'axios-full') {
        method = (match[1] || 'GET').toUpperCase();
        apiPath = match[2];
      } else if (name === 'defHttp') {
        method = (match[1] || 'GET').toUpperCase();
        if (method === 'UPLOADFILE') method = 'POST';
        apiPath = match[2];
      } else if (name === 'request-obj') {
        if (match[1]) method = match[1].toUpperCase();
        apiPath = match[2] || match[1] || '';
      } else if (name === 'request-obj-url-first') {
        apiPath = match[1] || '';
        method = (match[2] || 'GET').toUpperCase();
      } else {
        method = (match[0].match(/\.(get|post|put|delete|patch|head|options)/i)?.[1] || 'GET').toUpperCase();
        apiPath = match[2] || match[1] || '';
      }

      if (!apiPath || (!apiPath.startsWith('/') && apiPath.startsWith('http') && !apiPath.includes('/api/'))) continue;
      if (apiPath.startsWith('Api.') || apiPath.startsWith('API.')) continue;

      const key = `${method}:${apiPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      detectedFrameworks.add(name.replace(/-var$/, '').replace(/-obj$/, ''));

      interfaces.push({
        name: extractFrontendEndpointName(apiPath),
        path: normalizePath(apiPath),
        method,
        description: '',
        parameters: extractPathParams(apiPath),
        tags: [name === 'fetch' ? 'Fetch API' : capitalize(name.replace(/-full$/, '').replace(/-var$/, '').replace(/-obj$/, ''))],
        source: 'frontend',
        framework: name.replace(/-full$/, '').replace(/-var$/, '').replace(/-obj$/, '')
      });
    }
  }

  for (const [varName, path] of enumApiMap) {
    const method = inferMethodFromName(varName);
    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    interfaces.push({
      name: extractFrontendEndpointName(path),
      path: normalizePath(path),
      method,
      description: '',
      parameters: extractPathParams(path),
      tags: ['Enum API'],
      source: 'frontend',
      framework: 'enum'
    });
  }

  if (frameworkHint) detectedFrameworks.add(frameworkHint);
  return interfaces;
}

function extractEnumApiPaths(code: string): Map<string, string> {
  const result = new Map<string, string>();

  const enumPattern = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let enumMatch;

  while ((enumMatch = enumPattern.exec(code)) !== null) {
    const enumName = enumMatch[1];
    const body = enumMatch[2];

    if (!enumName.includes('Api') && !enumName.includes('API') && !enumName.includes('Url') && !enumName.includes('URL')) continue;

    const entryPattern = /(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g;
    let entryMatch;

    while ((entryMatch = entryPattern.exec(body)) !== null) {
      const key = entryMatch[1];
      const value = entryMatch[2];
      if (value.startsWith('/') || value.startsWith('http')) {
        result.set(`${enumName}.${key}`, value);
      }
    }
  }

  const constPattern = /(?:const|export\s+const)\s+(\w+Api|\w+URL|\w+Url)\s*=\s*['"`]([^'"`]+)['"`]/gi;
  let constMatch;

  while ((constMatch = constPattern.exec(code)) !== null) {
    if (constMatch[2].startsWith('/') || constMatch[2].startsWith('http')) {
      result.set(constMatch[1], constMatch[2]);
    }
  }

  return result;
}

function inferMethodFromName(varName: string): string {
  const lower = varName.toLowerCase();
  if (lower.includes('delete') || lower.includes('remove')) return 'DELETE';
  if (lower.includes('add') || lower.includes('create') || lower.includes('save') || lower.includes('import')) return 'POST';
  if (lower.includes('edit') || lower.includes('update') || lower.includes('put') || lower.includes('modify')) return 'PUT';
  if (lower.includes('export') || lower.includes('download') || lower.includes('list') || lower.includes('query') || lower.includes('get') || lower.includes('search')) return 'GET';
  return 'GET';
}

export function parseEnhancedBackendCode(code: string, _frameworkHint?: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const springResult = parseSpringCode(code);
  interfaces.push(...springResult.interfaces);
  models.push(...springResult.models);

  const expressResult = parseExpressCode(code);
  interfaces.push(...expressResult);

  const flaskResult = parseFlaskCode(code);
  interfaces.push(...flaskResult);

  const fastapiResult = parseFastAPICode(code);
  interfaces.push(...fastapiResult);

  const typeormModels = parseTypeORMCode(code);
  models.push(...typeormModels);

  const sequelizeModels = parseSequelizeCode(code);
  models.push(...sequelizeModels);

  const mongooseModels = parseMongooseCode(code);
  models.push(...mongooseModels);

  const tsModels = parseTypeScriptModels(code);
  models.push(...tsModels);

  const prismaModels = parsePrismaCode(code);
  models.push(...prismaModels);

  const goModels = parseGoStructs(code);
  models.push(...goModels);

  return { interfaces, models };
}

export function parseEnhancedSQL(sql: string, dialect: string = 'mysql'): ParsedTable[] {
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
        primaryKeys.add(pk.trim().replace(/[`"'\][]]/g, ''));
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

      const isPK = primaryKeys.has(name) || upperRest.includes('PRIMARY KEY') || name.toLowerCase() === 'id';

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

export function generateDeepAssociations(result: ProjectParseResult, _sensitivity: string): Association[] {
  const associations: Association[] = [];
  const { interfaces, models, tables } = result;

  const frontendInterfaces = interfaces.filter(i => i.source === 'frontend');
  const backendInterfaces = interfaces.filter(i => i.source === 'backend');

  const pathToBackendMap = new Map<string, ParsedInterface>();
  for (const bi of backendInterfaces) {
    pathToBackendMap.set(`${bi.method} ${bi.path}`, bi);
  }

  for (const fi of frontendInterfaces) {
    const matchedBackend = findMatchingBackendInterface(fi, backendInterfaces);
    const matchedModels = findModelsForInterface(fi, models);
    const matchedTables = findTablesForInterface(fi, tables);

    for (const model of matchedModels) {
      const table = matchedTables.find(t =>
        singularize(t.name).toLowerCase() === model.name.toLowerCase() ||
        t.name.toLowerCase().includes(model.name.toLowerCase()) ||
        model.name.toLowerCase().includes(singularize(t.name).toLowerCase())
      ) || findTableForModel(model, tables);

      const matchedFields = findMatchingFields(fi, model, table);

      associations.push({
        frontend: `${fi.method} ${fi.path}`,
        backend: matchedBackend ? `${matchedBackend.method} ${matchedBackend.path}` : undefined,
        model: model.name,
        modelFields: matchedFields.modelFields,
        table: table?.name,
        tableFields: matchedFields.tableFields,
        confidence: matchedFields.confidence,
        matchType: matchedFields.matchType,
        reasoning: generateReasoning(fi, model, table)
      });
    }

    if (matchedModels.length === 0 && matchedTables.length > 0) {
      for (const table of matchedTables) {
        associations.push({
          frontend: `${fi.method} ${fi.path}`,
          backend: matchedBackend ? `${matchedBackend.method} ${matchedBackend.path}` : undefined,
          table: table.name,
          model: singularize(table.name),
          modelFields: table.columns.slice(0, 5).map(c => c.name),
          tableFields: table.columns.slice(0, 5).map(c => c.name),
          confidence: 0.6,
          matchType: 'inferred',
          reasoning: `Frontend API "${fi.method} ${fi.path}" inferred to relate to table "${table.name}" via path naming`
        });
      }
    }
  }

  for (const bi of backendInterfaces) {
    const alreadyLinked = associations.some(a => a.backend === `${bi.method} ${bi.path}`);
    if (alreadyLinked) continue;

    const matchedModels = findModelsForInterface(bi, models);
    const matchedTables = findTablesForInterface(bi, tables);

    for (const model of matchedModels) {
      const table = matchedTables.find(t =>
        singularize(t.name).toLowerCase() === model.name.toLowerCase() ||
        t.name.toLowerCase().includes(model.name.toLowerCase()) ||
        model.name.toLowerCase().includes(singularize(t.name).toLowerCase())
      ) || findTableForModel(model, tables);

      const matchedFields = findMatchingFields(bi, model, table);

      associations.push({
        backend: `${bi.method} ${bi.path}`,
        model: model.name,
        modelFields: matchedFields.modelFields,
        table: table?.name,
        tableFields: matchedFields.tableFields,
        confidence: matchedFields.confidence,
        matchType: matchedFields.matchType,
        reasoning: generateReasoning(bi, model, table)
      });
    }

    if (matchedModels.length === 0 && matchedTables.length > 0) {
      for (const table of matchedTables) {
        associations.push({
          backend: `${bi.method} ${bi.path}`,
          table: table.name,
          model: singularize(table.name),
          modelFields: table.columns.slice(0, 5).map(c => c.name),
          tableFields: table.columns.slice(0, 5).map(c => c.name),
          confidence: 0.6,
          matchType: 'inferred',
          reasoning: `Backend API "${bi.method} ${bi.path}" inferred to relate to table "${table.name}" via path naming`
        });
      }
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

export function tablesToModels(tables: ParsedTable[]): ParsedModel[] {
  return tables.map(table => ({
    name: singularize(table.name),
    fields: table.columns.map(col => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      primaryKey: col.primaryKey,
      comment: col.comment
    })),
    source: 'database' as const,
    tableName: table.name
  }));
}

export function singularize(word: string): string {
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

export function pluralize(word: string): string {
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

function parseSpringCode(code: string): { interfaces: ParsedInterface[]; models: ParsedModel[] } {
  const interfaces: ParsedInterface[] = [];
  const models: ParsedModel[] = [];

  const classRequestMapping = code.match(/@(?:RequestMapping|Router)\s*\(\s*(?:path\s*=\s*)?["']([^"']+)["']/);
  const basePath = classRequestMapping ? classRequestMapping[1] : '';

  const annotations = [
    { pattern: /@(?:GetMapping|Get)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/gi, method: 'GET' },
    { pattern: /@(?:PostMapping|Post)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/gi, method: 'POST' },
    { pattern: /@(?:PutMapping|Put)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/gi, method: 'PUT' },
    { pattern: /@(?:DeleteMapping|Delete)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/gi, method: 'DELETE' },
    { pattern: /@(?:PatchMapping|Patch)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/gi, method: 'PATCH' },
    { pattern: /@(?:RequestMapping)\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']\s*,\s*(?:method\s*=\s*RequestMethod\.|method\s*=\s*\{?\s*RequestMethod\.)(GET|POST|PUT|DELETE|PATCH)/gi, method: 'DYNAMIC' },
  ];

  const seen = new Set<string>();

  for (const { pattern, method } of annotations) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      const path = match[1] || '/';
      const resolvedMethod = method === 'DYNAMIC' ? (match[2] || 'GET').toUpperCase() : method;
      const fullPath = basePath + (path.startsWith('/') ? path : '/' + path);
      const key = `${resolvedMethod}:${fullPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: extractBackendMethodName(fullPath),
        path: fullPath.startsWith('/') ? fullPath : '/' + fullPath,
        method: resolvedMethod,
        description: '',
        parameters: extractSpringParams(code, match.index),
        tags: ['Spring Boot', 'Java'],
        source: 'backend',
        framework: 'spring'
      });
    }
  }

  const noPathAnnotations = [
    { pattern: /@(?:GetMapping|Get)\s*\(\s*\)/gi, method: 'GET' },
    { pattern: /@(?:PostMapping|Post)\s*\(\s*\)/gi, method: 'POST' },
    { pattern: /@(?:PutMapping|Put)\s*\(\s*\)/gi, method: 'PUT' },
    { pattern: /@(?:DeleteMapping|Delete)\s*\(\s*\)/gi, method: 'DELETE' },
  ];

  for (const { pattern, method } of noPathAnnotations) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
      const fullPath = basePath || '/';
      const key = `${method}:${fullPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: extractBackendMethodName(fullPath),
        path: fullPath.startsWith('/') ? fullPath : '/' + fullPath,
        method,
        description: '',
        parameters: extractSpringParams(code, match.index),
        tags: ['Spring Boot', 'Java'],
        source: 'backend',
        framework: 'spring'
      });
    }
  }

  const modelPattern = /(?:@Entity\s*(?:\([^)]*\))?\s*)?(?:@Table\s*\([^)]*\)\s*)?(?:public\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([\s\S]*?)(?=\n\s*(?:@|class\s+\w|public\s+class|private\s+class|$))/g;
  let modelMatch;

  while ((modelMatch = modelPattern.exec(code)) !== null) {
    const className = modelMatch[1];
    if (className.endsWith('Controller') || className.endsWith('Service') || className.endsWith('Repository') ||
        className.endsWith('Dto') || className.endsWith('DTO') || className.endsWith('Vo') || className.endsWith('VO') ||
        className.endsWith('Request') || className.endsWith('Response') || className.endsWith('Config') ||
        className.endsWith('Exception') || className.endsWith('Handler') || className.endsWith('Interceptor') ||
        className.endsWith('Filter') || className.endsWith('Aspect') || className.endsWith('Utils') ||
        className.endsWith('Util') || className.endsWith('Helper') || className.endsWith('Converter') ||
        className.endsWith('Wrapper') || className.endsWith('Adapter')) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(?:@(?:Column|Id|GeneratedValue|OneToMany|ManyToOne|ManyToMany|OneToOne)\s*(?:\([^)]*\))?\s*)*(?:private|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(modelMatch[2])) !== null) {
      const [, javaType, fieldName] = fieldMatch;
      const isPrimaryKey = modelMatch[2].slice(Math.max(0, fieldMatch.index - 200), fieldMatch.index).includes('@Id');

      fields.push({
        name: fieldName,
        type: mapJavaTypeToTS(javaType),
        nullable: !isPrimaryKey && !javaType.match(/^(int|long|boolean|double|float|char|short|byte)$/),
        primaryKey: isPrimaryKey || undefined
      });
    }

    if (fields.length > 0) {
      const tableAnnotation = code.slice(Math.max(0, modelMatch.index - 200), modelMatch.index).match(/@Table\s*\(\s*(?:name\s*=\s*)?["'](\w+)["']/);
      models.push({
        name: className,
        fields,
        source: 'code',
        tableName: tableAnnotation ? tableAnnotation[1] : undefined
      });
    }
  }

  return { interfaces, models };
}

function parseExpressCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const patterns = [
    /(?:router|app|server|Route)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*['"](\/[^'"]+)['"]/gi,
    /(?:router|app|server|Route)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*`([^`]+)`/gi,
  ];

  const seen = new Set<string>();

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(code)) !== null) {
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
  }

  return interfaces;
}

function parseFlaskCode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const routePattern = /@(?:app|bp|blueprint)\s*\.\s*(?:route|get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/gi;
  const seen = new Set<string>();
  let match;

  while ((match = routePattern.exec(code)) !== null) {
    const [, path, methodsStr] = match;
    let methods = ['GET'];
    if (methodsStr) {
      methods = methodsStr.match(/['"](\w+)['"]/g)?.map(m => m.replace(/['"]/g, '').toUpperCase()) || ['GET'];
    } else {
      const methodHint = match[0].match(/@\w+\.\s*(get|post|put|delete|patch)/i);
      if (methodHint) methods = [methodHint[1].toUpperCase()];
    }

    for (const method of methods) {
      const key = `${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      interfaces.push({
        name: extractBackendMethodName(path),
        path,
        method,
        description: '',
        parameters: [],
        tags: ['Flask', 'Python'],
        source: 'backend',
        framework: 'flask'
      });
    }
  }

  return interfaces;
}

function parseFastAPICode(code: string): ParsedInterface[] {
  const interfaces: ParsedInterface[] = [];
  const decoratorPattern = /@(?:app|router)\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
  const seen = new Set<string>();
  let match;

  while ((match = decoratorPattern.exec(code)) !== null) {
    const [, path] = match;
    const fullMatch = match[0];
    const method = fullMatch.match(/@(?:app|router)\s*\.\s*(\w+)/)?.[1]?.toUpperCase() || 'GET';
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

function parseTypeORMCode(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const entityPattern = /@Entity\s*\(\s*(?:['"](\w+)['"]\s*)?\)[\s\S]*?(?:export\s+)?class\s+(\w+)/gi;
  let entityMatch;

  while ((entityMatch = entityPattern.exec(code)) !== null) {
    const tableName = entityMatch[1];
    const className = entityMatch[2];

    const classBody = extractClassBody(code, entityMatch.index + entityMatch[0].length);
    if (!classBody) continue;

    const fields: ParsedModel['fields'] = [];
    const columnPattern = /@(?:PrimaryGeneratedColumn|PrimaryColumn|Column|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)\s*(?:\([^)]*\))?\s*(?:public\s+)?(?:readonly\s+)?(\w+)\s*:\s*(\w+(?:<[^>]+>)?)/g;
    let colMatch;

    while ((colMatch = columnPattern.exec(classBody)) !== null) {
      const [, fieldName, fieldType] = colMatch;
      const isPK = classBody.slice(Math.max(0, colMatch.index - 200), colMatch.index).includes('@PrimaryGeneratedColumn') ||
                   classBody.slice(Math.max(0, colMatch.index - 200), colMatch.index).includes('@PrimaryColumn');

      fields.push({
        name: fieldName,
        type: mapTSType(fieldType),
        nullable: !isPK,
        primaryKey: isPK || undefined
      });
    }

    if (fields.length > 0) {
      models.push({
        name: className,
        fields,
        source: 'code',
        tableName: tableName || className.toLowerCase()
      });
    }
  }

  return models;
}

function parseSequelizeCode(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const definePattern = /(?:sequelize|Sequelize)\s*\.\s*define\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  let defineMatch;

  while ((defineMatch = definePattern.exec(code)) !== null) {
    const modelName = defineMatch[1];
    const fieldsStr = defineMatch[2];

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(\w+)\s*:\s*\{\s*type\s*:\s*(?:DataTypes\.|Sequelize\.)?(\w+)/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(fieldsStr)) !== null) {
      const [, fieldName, fieldType] = fieldMatch;
      if (fieldName === 'createdAt' || fieldName === 'updatedAt') continue;

      fields.push({
        name: fieldName,
        type: mapSequelizeType(fieldType),
        nullable: true
      });
    }

    if (fields.length > 0) {
      models.push({
        name: modelName,
        fields,
        source: 'code',
        tableName: modelName.toLowerCase()
      });
    }
  }

  const initPattern = /(\w+)\.init\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\s*,/g;
  let initMatch;

  while ((initMatch = initPattern.exec(code)) !== null) {
    const modelName = initMatch[1];
    const fieldsStr = initMatch[2];

    if (['Object', 'Array', 'Promise', 'Model', 'Sequelize'].includes(modelName)) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(\w+)\s*:\s*\{\s*type\s*:\s*(?:DataTypes\.|Sequelize\.)?(\w+)/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(fieldsStr)) !== null) {
      const [, fieldName, fieldType] = fieldMatch;
      if (fieldName === 'createdAt' || fieldName === 'updatedAt') continue;

      fields.push({
        name: fieldName,
        type: mapSequelizeType(fieldType),
        nullable: true
      });
    }

    if (fields.length > 0) {
      const existing = models.find(m => m.name === modelName);
      if (!existing) {
        models.push({
          name: modelName,
          fields,
          source: 'code',
          tableName: modelName.toLowerCase()
        });
      }
    }
  }

  return models;
}

function parseMongooseCode(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const schemaPattern = /new\s+(?:mongoose\.)?Schema\s*<\w*>\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
  let schemaMatch;

  while ((schemaMatch = schemaPattern.exec(code)) !== null) {
    const fieldsStr = schemaMatch[1];
    const fields: ParsedModel['fields'] = [];

    const fieldPattern = /(\w+)\s*:\s*\{\s*type\s*:\s*(\w+)/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(fieldsStr)) !== null) {
      const [, fieldName, fieldType] = fieldMatch;
      if (fieldName === '_id' || fieldName === '__v' || fieldName === 'createdAt' || fieldName === 'updatedAt') continue;

      fields.push({
        name: fieldName,
        type: mapMongooseType(fieldType),
        nullable: true
      });
    }

    if (fields.length > 0) {
      const modelMatch = code.slice(schemaMatch.index, schemaMatch.index + 500).match(/(?:mongoose\.)?model\s*\(\s*['"](\w+)['"]/);
      const modelName = modelMatch ? modelMatch[1] : `Model${models.length + 1}`;

      models.push({
        name: modelName,
        fields,
        source: 'code',
        tableName: modelName.toLowerCase()
      });
    }
  }

  const modelPattern = /(?:mongoose\.)?model\s*\(\s*['"](\w+)['"]\s*,/g;
  let modelMatch2;

  while ((modelMatch2 = modelPattern.exec(code)) !== null) {
    const modelName = modelMatch2[1];
    const existing = models.find(m => m.name === modelName);
    if (!existing && modelName !== 'Model') {
      models.push({
        name: modelName,
        fields: [],
        source: 'code',
        tableName: modelName.toLowerCase()
      });
    }
  }

  return models;
}

function parseTypeScriptModels(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const interfacePattern = /(?:export\s+)?(?:interface|type)\s+(\w+)(?:\s+extends\s+\w+)?\s*(?:=\s*)?\{([\s\S]*?)\}/g;
  let match;

  while ((match = interfacePattern.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];

    if (name.endsWith('Props') || name.endsWith('State') || name.endsWith('Event') ||
        name.endsWith('Handler') || name.endsWith('Callback') || name.endsWith('Context') ||
        name.endsWith('Ref') || name.endsWith('Style') || name.endsWith('Config') && !name.includes('Model') ||
        name.endsWith('Options') || name.endsWith('Action') || name.endsWith('Reducer') ||
        name.endsWith('Store') || name.endsWith('Dispatch') || name.endsWith('Payload') ||
        name === 'IProps' || name === 'IState') continue;

    const dataModelSuffixes = ['Model', 'Entity', 'DTO', 'Dto', 'VO', 'Vo', 'Schema', 'Record', 'Item', 'Data', 'Type', 'Interface'];
    const isLikelyDataModel = dataModelSuffixes.some(suffix => name.endsWith(suffix)) ||
      body.match(/(?:id|name|title|description|email|phone|address|status|type|created|updated|deleted|price|count|amount|quantity)/i);

    if (!isLikelyDataModel) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(?:readonly\s+)?(\w+)(?:\?)?\s*:\s*(\w+(?:<[^>]+>)?(?:\[\])?)/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(body)) !== null) {
      const [, fieldName, fieldType] = fieldMatch;
      if (fieldName.startsWith('__')) continue;

      fields.push({
        name: fieldName,
        type: mapTSType(fieldType),
        nullable: !fieldType.includes('!') && fieldMatch[0].includes('?'),
        primaryKey: fieldName.toLowerCase() === 'id'
      });
    }

    if (fields.length >= 2) {
      models.push({
        name,
        fields,
        source: 'code'
      });
    }
  }

  return models;
}

function parsePrismaCode(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];

  const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = modelPattern.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];

    const fields: ParsedModel['fields'] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('@@') || trimmed.startsWith('//')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const fieldName = parts[0];
      const fieldType = parts[1];

      if (fieldName.startsWith('@@') || fieldName.startsWith('@')) continue;
      if (['id', 'createdAt', 'updatedAt', 'deletedAt'].includes(fieldName) && parts.length < 3) {
        fields.push({
          name: fieldName,
          type: mapPrismaType(fieldType),
          nullable: false,
          primaryKey: fieldName === 'id'
        });
        continue;
      }

      const isId = parts.some(p => p === '@id');
      const isOptional = fieldType.endsWith('?');

      fields.push({
        name: fieldName,
        type: mapPrismaType(fieldType.replace('?', '')),
        nullable: isOptional && !isId,
        primaryKey: isId
      });
    }

    if (fields.length > 0) {
      models.push({
        name,
        fields,
        source: 'code',
        tableName: name.toLowerCase()
      });
    }
  }

  return models;
}

function parseGoStructs(code: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  const structPattern = /type\s+(\w+)\s+struct\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = structPattern.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];

    if (name.endsWith('Handler') || name.endsWith('Service') || name.endsWith('Repository') ||
        name.endsWith('Controller') || name.endsWith('Router') || name.endsWith('Config') ||
        name.endsWith('Request') || name.endsWith('Response')) continue;

    const fields: ParsedModel['fields'] = [];
    const fieldPattern = /(\w+)\s+(\w+(?:\[\])?)\s+(?:`[^`]*`)?/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(body)) !== null) {
      const [, fieldName, fieldType] = fieldMatch;
      if (!fieldName.match(/^[A-Z]/)) continue;

      const isPrimaryKey = body.slice(Math.max(0, fieldMatch.index - 50), fieldMatch.index + fieldMatch[0].length).includes('primaryKey') ||
                           fieldName === 'ID' || fieldName === 'Id';

      fields.push({
        name: fieldName.charAt(0).toLowerCase() + fieldName.slice(1),
        type: mapGoType(fieldType),
        nullable: !isPrimaryKey,
        primaryKey: isPrimaryKey
      });
    }

    if (fields.length > 0) {
      models.push({
        name,
        fields,
        source: 'code'
      });
    }
  }

  return models;
}

function extractClassBody(code: string, startIndex: number): string | null {
  let braceCount = 0;
  let bodyStart = -1;

  for (let i = startIndex; i < code.length; i++) {
    if (code[i] === '{') {
      if (braceCount === 0) bodyStart = i + 1;
      braceCount++;
    } else if (code[i] === '}') {
      braceCount--;
      if (braceCount === 0 && bodyStart !== -1) {
        return code.slice(bodyStart, i);
      }
    }
  }

  return null;
}

function findMatchingBackendInterface(frontendIface: ParsedInterface, backendInterfaces: ParsedInterface[]): ParsedInterface | undefined {
  for (const bi of backendInterfaces) {
    if (bi.method === frontendIface.method && bi.path === frontendIface.path) return bi;

    const fePath = frontendIface.path.replace(/\{[^}]+\}/g, ':param');
    const bePath = bi.path.replace(/\{[^}]+\}/g, ':param');
    if (bi.method === frontendIface.method && fePath === bePath) return bi;

    const feParts = frontendIface.path.split('/').filter(p => p && !p.match(/^\{/));
    const beParts = bi.path.split('/').filter(p => p && !p.match(/^\{/));
    if (bi.method === frontendIface.method && feParts.length === beParts.length) {
      const matchCount = feParts.filter((p, i) => p === beParts[i]).length;
      if (matchCount >= Math.max(feParts.length - 1, 1)) return bi;
    }
  }

  return undefined;
}

function findModelsForInterface(iface: ParsedInterface, models: ParsedModel[]): ParsedModel[] {
  const matched: ParsedModel[] = [];
  const pathResource = extractResourceFromPath(iface.path);

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

    if (model.tableName) {
      const tableNameLower = model.tableName.toLowerCase();
      if (tableNameLower === pathResource.toLowerCase() ||
          singularize(tableNameLower) === singularResource ||
          pluralize(tableNameLower) === pluralResource) {
        matched.push(model);
        continue;
      }
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

    if (model.tableName && model.tableName.toLowerCase() === tableNameLower) {
      return table;
    }
  }

  for (const table of tables) {
    const tableNameLower = table.name.toLowerCase();
    const modelNameLower = model.name.toLowerCase();

    if (tableNameLower.includes(modelNameLower) || modelNameLower.includes(tableNameLower)) {
      const modelFields = model.fields.map(f => f.name.toLowerCase());
      const tableColumns = table.columns.map(c => c.name.toLowerCase());
      const matchCount = modelFields.filter(mf =>
        tableColumns.some(tc => tc === mf || tc === camelToSnake(mf) || snakeToCamel(tc) === mf)
      ).length;
      if (matchCount >= 3) return table;
    }
  }

  return undefined;
}

function extractResourceFromPath(path: string): string {
  const parts = path.split('/').filter(p => p && !p.match(/^[:{]/));

  if (parts.length === 0) return '';

  const lastPart = parts[parts.length - 1];
  const actionWords = ['list', 'get', 'add', 'create', 'edit', 'update', 'delete', 'remove', 'detail', 'info', 'page', 'query', 'search', 'export', 'import', 'download', 'upload', 'save', 'check', 'verify', 'send', 'receive'];
  const lastLower = lastPart.toLowerCase();

  for (const action of actionWords) {
    if (lastLower.startsWith(action)) {
      const remainder = lastPart.slice(action.length);
      if (remainder) return remainder;
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
  const snippet = code.slice(index, index + 500);
  const paramPattern = /@(?:PathVariable|RequestParam|RequestBody)\s*(?:\([^)]*\))?\s*(?:private\s+)?(\w+)\s+(\w+)/g;
  let match;

  while ((match = paramPattern.exec(snippet)) !== null) {
    let location = 'query';
    if (snippet.slice(Math.max(0, match.index - 50), match.index).includes('PathVariable')) location = 'path';
    else if (snippet.slice(Math.max(0, match.index - 50), match.index).includes('RequestBody')) location = 'body';

    params.push({ name: match[2], location, type: mapJavaTypeToTS(match[1]), required: true });
  }

  if (params.length === 0) {
    const simplePattern = /@(?:PathVariable|RequestParam|RequestBody)\s*(?:\([^)]*\))?/gi;
    let simpleMatch;
    while ((simpleMatch = simplePattern.exec(snippet)) !== null) {
      let location = 'query';
      if (simpleMatch[0].includes('PathVariable')) location = 'path';
      else if (simpleMatch[0].includes('RequestBody')) location = 'body';

      params.push({ name: 'param', location, type: 'string', required: true });
    }
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

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function mapJavaTypeToTS(javaType: string): string {
  const typeMap: Record<string, string> = {
    String: 'string', int: 'number', Integer: 'number', long: 'number', Long: 'number',
    short: 'number', double: 'number', Double: 'number', float: 'number', Float: 'number',
    boolean: 'boolean', Boolean: 'boolean', Date: 'string', LocalDate: 'string',
    LocalDateTime: 'string', List: 'array', ArrayList: 'array', Map: 'object', Object: 'object',
    BigDecimal: 'number', BigInteger: 'number', byte: 'number', Byte: 'number',
    char: 'string', Character: 'string', Timestamp: 'string',
  };
  if (javaType.includes('<')) {
    const baseType = javaType.match(/^(\w+)</)?.[1];
    if (baseType === 'List' || baseType === 'ArrayList' || baseType === 'Set') return 'array';
    if (baseType === 'Map') return 'object';
    if (baseType === 'Optional') return mapJavaTypeToTS(javaType.match(/<(\w+)>/)?.[1] || 'Object');
  }
  return typeMap[javaType] || 'string';
}

function mapTSType(tsType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string', number: 'number', boolean: 'boolean', Date: 'datetime',
    object: 'object', any: 'any', unknown: 'any', void: 'void',
    Array: 'array', Record: 'object', Map: 'object', Set: 'array',
  };
  if (tsType.endsWith('[]')) return 'array';
  if (tsType.includes('<')) {
    const base = tsType.match(/^(\w+)</)?.[1];
    if (base === 'Array') return 'array';
    if (base === 'Record' || base === 'Map') return 'object';
  }
  return typeMap[tsType] || 'string';
}

function mapSequelizeType(type: string): string {
  const typeMap: Record<string, string> = {
    STRING: 'string', TEXT: 'string', CHAR: 'string',
    INTEGER: 'integer', BIGINT: 'integer', SMALLINT: 'integer', TINYINT: 'integer',
    FLOAT: 'number', DOUBLE: 'number', DECIMAL: 'number', REAL: 'number',
    BOOLEAN: 'boolean',
    DATE: 'datetime', DATEONLY: 'string', TIME: 'string',
    UUID: 'string', UUIDV4: 'string',
    JSON: 'json', JSONB: 'json',
    BLOB: 'binary', BYTEA: 'binary',
    ARRAY: 'array', VIRTUAL: 'any',
  };
  return typeMap[type.toUpperCase()] || 'string';
}

function mapMongooseType(type: string): string {
  const typeMap: Record<string, string> = {
    String: 'string', Number: 'number', Boolean: 'boolean',
    Date: 'datetime', Object: 'object', Mixed: 'any',
    Array: 'array', Buffer: 'binary', Decimal128: 'number',
    ObjectId: 'string', Map: 'object',
  };
  return typeMap[type] || 'string';
}

function mapPrismaType(type: string): string {
  const typeMap: Record<string, string> = {
    String: 'string', Int: 'integer', BigInt: 'integer', Float: 'number', Decimal: 'number',
    Boolean: 'boolean', DateTime: 'datetime', Json: 'json', Bytes: 'binary',
    Unsupported: 'any',
  };
  return typeMap[type] || 'string';
}

function mapGoType(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'string', int: 'integer', int8: 'integer', int16: 'integer', int32: 'integer', int64: 'integer',
    uint: 'integer', uint8: 'integer', uint16: 'integer', uint32: 'integer', uint64: 'integer',
    float32: 'number', float64: 'number', bool: 'boolean',
    timeTime: 'datetime', timeDuration: 'number',
  };
  if (type.startsWith('*')) return mapGoType(type.slice(1));
  if (type.startsWith('[]')) return 'array';
  return typeMap[type] || 'string';
}

function mapSQLType(sqlType: string, _dialect: string = 'mysql'): string {
  const upper = sqlType.toUpperCase();
  if (/^(INT|INTEGER|SERIAL|TINYINT|SMALLINT|BIGINT|MEDIUMINT)/.test(upper)) return 'integer';
  if (/^(DECIMAL|NUMERIC|FLOAT|REAL|DOUBLE)/.test(upper)) return 'number';
  if (/^(VARCHAR|CHAR|TEXT|MEDIUMTEXT|LONGTEXT|TINYTEXT|NVARCHAR|NCHAR|CLOB)/.test(upper)) return 'string';
  if (/^(DATE|DATETIME|TIMESTAMP|TIME)/.test(upper)) return 'datetime';
  if (/^(BOOLEAN|BOOL)/.test(upper)) return 'boolean';
  if (/^(JSON|JSONB)/.test(upper)) return 'json';
  if (/^(BLOB|BYTEA|BINARY|VARBINARY)/.test(upper)) return 'binary';
  return 'string';
}
