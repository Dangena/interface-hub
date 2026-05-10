import { Router } from 'express';
import { query } from '../database';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  classifyFile,
  parseEnhancedFrontendCode,
  parseEnhancedBackendCode,
  parseEnhancedSQL,
  generateDeepAssociations,
  tablesToModels,
  singularize,
  type ParsedModel,
  type ProjectParseResult,
} from '../utils/projectParserUtils';

const router = Router();
const execAsync = promisify(exec);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.sql', '.graphql', '.proto', '.prisma',
  '.json', '.yaml', '.yml', '.toml',
  '.html', '.css', '.scss', '.less',
  '.md', '.txt', '.kt', '.groovy', '.cs',
  '.mts', '.cts',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', 'dist', 'build',
  '.next', '.nuxt', 'coverage', '.cache', 'vendor', 'target',
  '.idea', '.vscode', 'bin', 'obj', 'out',
]);

router.get('/', async (req, res) => {
  try {
    const { rows: projects } = await query('SELECT * FROM projects ORDER BY updated_at DESC');

    const enriched = [];
    for (const project of projects) {
      const { rows: countRows } = await query('SELECT COUNT(*) as count FROM interfaces WHERE category = $1', [project.name]);

      let codeFiles = null;
      if ((project as any).code_files) {
        try { codeFiles = JSON.parse((project as any).code_files); } catch { codeFiles = null; }
      }

      let parsedResult = null;
      if ((project as any).parsed_result) {
        try { parsedResult = JSON.parse((project as any).parsed_result); } catch { parsedResult = null; }
      }

      enriched.push({
        ...project,
        code_files: codeFiles,
        parsed_result: parsedResult,
        interfaceCount: (countRows[0] as any)?.count || 0,
      });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);

    if (!rows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = rows[0] as any;

    const { rows: interfaces } = await query(
      'SELECT * FROM interfaces WHERE category = $1 ORDER BY updated_at DESC',
      [project.name]
    );

    const { rows: models } = await query(
      'SELECT * FROM data_models ORDER BY updated_at DESC'
    );

    const projectModels = [];
    for (const model of models) {
      const { rows: fields } = await query(
        'SELECT * FROM fields WHERE model_name = $1',
        [(model as any).name]
      );
      projectModels.push({ ...(model as any), fields });
    }

    const { rows: mappings } = await query(
      `SELECT fm.* FROM field_mappings fm
       JOIN interfaces i ON fm.interface_id = i.id
       WHERE i.category = $1`,
      [project.name]
    );

    let codeFiles = null;
    if (project.code_files) {
      try {
        codeFiles = JSON.parse(project.code_files);
      } catch {
        codeFiles = null;
      }
    }

    let parsedResult = null;
    if (project.parsed_result) {
      try {
        parsedResult = JSON.parse(project.parsed_result);
      } catch {
        parsedResult = null;
      }
    }

    res.json({
      ...project,
      code_files: codeFiles,
      parsed_result: parsedResult,
      interfaces,
      models: projectModels,
      mappings,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project detail' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO projects (id, name, description, color, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, name, description || '', color || '#3B82F6', now, now]);

    res.status(201).json({ id, name, description: description || '', color: color || '#3B82F6', created_at: now, updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const now = new Date().toISOString();
    await query(`
      UPDATE projects SET name = $1, description = $2, color = $3, updated_at = $4
      WHERE id = $5
    `, [name, description || '', color || '#3B82F6', now, id]);

    res.json({ id, name, description: description || '', color: color || '#3B82F6', updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await query('DELETE FROM projects WHERE id = $1', [id]);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.post('/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    const codeFiles: Record<string, string> = {};
    let totalFiles = 0;
    let totalSize = 0;

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const entryPath = entry.entryName;
      const pathParts = entryPath.split('/');

      const hasIgnoredDir = pathParts.some(part => IGNORE_DIRS.has(part));
      if (hasIgnoredDir) continue;

      const ext = path.extname(entryPath).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;

      const maxSize = 500 * 1024;
      if (entry.header.size > maxSize) continue;

      try {
        const content = entry.getData().toString('utf-8');
        if (content.trim().length === 0) continue;

        codeFiles[entryPath] = content;
        totalFiles++;
        totalSize += content.length;
      } catch {
        continue;
      }
    }

    const now = new Date().toISOString();
    await query(
      'UPDATE projects SET code_files = $1, parsed_result = NULL, updated_at = $2 WHERE id = $3',
      [JSON.stringify(codeFiles), now, id]
    );

    res.json({
      success: true,
      fileCount: totalFiles,
      totalSize,
      files: Object.keys(codeFiles),
      message: `成功读取 ${totalFiles} 个代码文件`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload and extract file', details: (error as Error).message });
  }
});

router.post('/:id/fetch-url', async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isGitRepo = url.endsWith('.git') || /github\.com|gitlab\.com|bitbucket\.org/.test(url);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fetch-'));

    try {
      if (isGitRepo) {
        const cloneUrl = url.endsWith('.git') ? url : `${url}.git`;
        await execAsync(`git clone --depth 1 ${cloneUrl} ${tmpDir}/repo`, {
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
        });

        const codeFiles = await readCodeFilesFromDir(path.join(tmpDir, 'repo'));

        const now = new Date().toISOString();
        await query(
          'UPDATE projects SET code_files = $1, parsed_result = NULL, updated_at = $2 WHERE id = $3',
          [JSON.stringify(codeFiles.files), now, id]
        );

        res.json({
          success: true,
          type: 'git',
          fileCount: codeFiles.fileCount,
          totalSize: codeFiles.totalSize,
          files: Object.keys(codeFiles.files),
          message: `成功从 Git 仓库克隆并读取 ${codeFiles.fileCount} 个代码文件`,
        });
      } else {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'InterfaceHub/1.0' },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          return res.status(400).json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` });
        }

        const contentType = response.headers.get('content-type') || '';
        const content = await response.text();

        const codeFiles: Record<string, string> = {};

        if (contentType.includes('text/html')) {
          codeFiles['index.html'] = content;

          const scriptMatches = content.matchAll(/<script[^>]*src=["']([^"']+)["']/gi);
          const linkMatches = content.matchAll(/<link[^>]*href=["']([^"']+\.css)["']/gi);

          for (const m of scriptMatches) {
            try {
              const scriptUrl = new URL(m[1], url).href;
              const scriptRes = await fetch(scriptUrl, {
                headers: { 'User-Agent': 'InterfaceHub/1.0' },
                signal: AbortSignal.timeout(10000),
              });
              if (scriptRes.ok) {
                const scriptContent = await scriptRes.text();
                codeFiles[m[1]] = scriptContent;
              }
            } catch {
              continue;
            }
          }

          for (const m of linkMatches) {
            try {
              const cssUrl = new URL(m[1], url).href;
              const cssRes = await fetch(cssUrl, {
                headers: { 'User-Agent': 'InterfaceHub/1.0' },
                signal: AbortSignal.timeout(10000),
              });
              if (cssRes.ok) {
                const cssContent = await cssRes.text();
                codeFiles[m[1]] = cssContent;
              }
            } catch {
              continue;
            }
          }
        } else {
          const urlPath = new URL(url).pathname;
          const filename = path.basename(urlPath) || 'content.txt';
          codeFiles[filename] = content;
        }

        const now = new Date().toISOString();
        await query(
          'UPDATE projects SET code_files = $1, parsed_result = NULL, updated_at = $2 WHERE id = $3',
          [JSON.stringify(codeFiles), now, id]
        );

        res.json({
          success: true,
          type: 'website',
          fileCount: Object.keys(codeFiles).length,
          totalSize: Object.values(codeFiles).reduce((sum, c) => sum + c.length, 0),
          files: Object.keys(codeFiles),
          message: `成功从网站获取 ${Object.keys(codeFiles).length} 个文件`,
        });
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    console.error('Fetch URL error:', error);
    res.status(500).json({ error: 'Failed to fetch URL', details: (error as Error).message });
  }
});

router.post('/:id/parse', async (req, res) => {
  try {
    const { id } = req.params;
    const { options = {} } = req.body;

    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = rows[0] as any;

    if (!project.code_files) {
      return res.status(400).json({ error: 'No code files found. Please upload or fetch code first.' });
    }

    let codeFiles: Record<string, string>;
    try {
      codeFiles = JSON.parse(project.code_files);
    } catch {
      return res.status(400).json({ error: 'Invalid code files data in project' });
    }

    const startTime = Date.now();

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
        totalLines: 0,
      },
    };

    const frontendCode: string[] = [];
    const backendCode: string[] = [];
    const sqlCode: string[] = [];

    for (const [filePath, content] of Object.entries(codeFiles)) {
      const lineCount = content.split('\n').length;
      result.parseStats.totalLines += lineCount;

      const category = classifyFile(filePath, content);

      if (category === 'sql') {
        sqlCode.push(content);
        result.parseStats.sqlFiles++;
      } else if (category === 'backend') {
        backendCode.push(content);
        result.parseStats.backendFiles++;
      } else if (category === 'frontend') {
        frontendCode.push(content);
        result.parseStats.frontendFiles++;
      }
    }

    for (const code of frontendCode) {
      const interfaces = parseEnhancedFrontendCode(code);
      result.interfaces.push(...interfaces.map(i => ({ ...i, source: 'frontend' as const })));
    }

    for (const code of backendCode) {
      const { interfaces, models } = parseEnhancedBackendCode(code);
      result.interfaces.push(...interfaces.map(i => ({ ...i, source: 'backend' as const })));
      result.models.push(...models.map(m => ({ ...m, source: 'code' as const })));
    }

    for (const code of sqlCode) {
      const tables = parseEnhancedSQL(code, options.dialect || 'mysql');
      result.tables.push(...tables.map(t => ({ ...t, source: 'sql' as const })));
      const models = tablesToModels(tables);
      result.models.push(...models.map(m => ({ ...m, source: 'database' as const })));
    }

    if (options.enableAutoAssociation !== false) {
      result.associations = generateDeepAssociations(result, options.matchSensitivity || 'normal');
    }

    result.parseStats.parseTime = Date.now() - startTime;

    const now = new Date().toISOString();
    await query(
      'UPDATE projects SET parsed_result = $1, updated_at = $2 WHERE id = $3',
      [JSON.stringify(result), now, id]
    );

    res.json({
      success: true,
      result,
      message: `解析完成: ${result.interfaces.length} 接口, ${result.models.length} 模型, ${result.tables.length} 表, ${result.associations.length} 关联`,
    });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: 'Failed to parse project code', details: (error as Error).message });
  }
});

router.post('/:id/import', async (req, res) => {
  try {
    const { id } = req.params;
    const { options = {} } = req.body;
    const { overwrite = false, category } = options;

    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = rows[0] as any;

    if (!project.parsed_result) {
      return res.status(400).json({ error: 'No parsed result found. Please parse code first.' });
    }

    let parsedResult: ProjectParseResult;
    try {
      parsedResult = JSON.parse(project.parsed_result);
    } catch {
      return res.status(400).json({ error: 'Invalid parsed result data in project' });
    }

    const importCategory = category || project.name;
    const imported = {
      interfaces: 0,
      models: 0,
      tables: 0,
      mappings: 0,
    };

    for (const iface of parsedResult.interfaces || []) {
      try {
        const existingCheck = await query(
          'SELECT id FROM interfaces WHERE path = $1 AND method = $2 AND category = $3',
          [iface.path, iface.method, importCategory]
        );

        if (existingCheck.rows.length > 0) {
          if (overwrite) {
            await query(
              `UPDATE interfaces SET name = $1, description = $2, tags = $3, category = $4, updated_at = NOW() WHERE path = $5 AND method = $6 AND category = $7`,
              [iface.name, iface.description || '', JSON.stringify(iface.tags || []), importCategory, iface.path, iface.method, importCategory]
            );
            imported.interfaces++;
          }
        } else {
          const interfaceId = uuidv4();
          await query(
            `INSERT INTO interfaces (id, name, path, method, description, category, tags, status, version, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', '1.0.0', NOW(), NOW())`,
            [interfaceId, iface.name, iface.path, iface.method, iface.description || '', importCategory, JSON.stringify(iface.tags || [])]
          );

          for (const param of iface.parameters || []) {
            await query(
              `INSERT INTO parameters (id, interface_id, name, location, type, required, description)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [uuidv4(), interfaceId, param.name, param.location, param.type, param.required ? 1 : 0, '']
            );
          }

          imported.interfaces++;
        }
      } catch (err) {
        console.error('Failed to import interface:', err);
      }
    }

    for (const model of parsedResult.models || []) {
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

    for (const table of parsedResult.tables || []) {
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

          const modelName = parsedResult.models?.find(
            (m: ParsedModel) => m.name.toLowerCase() === singularize(table.name).toLowerCase()
          )?.name || singularize(table.name);

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

    for (const assoc of parsedResult.associations || []) {
      try {
        if (!assoc.model) continue;

        const { rows: modelRows } = await query(
          'SELECT name FROM data_models WHERE name = $1',
          [assoc.model]
        );
        if (modelRows.length === 0) continue;

        const interfaceConditions = [];
        const interfaceParams: any[] = [];

        if (assoc.frontend) {
          const [method, ...pathParts] = assoc.frontend.split(' ');
          const ifacePath = pathParts.join(' ');
          interfaceConditions.push('(i.method = $' + (interfaceParams.length + 1) + ' AND i.path = $' + (interfaceParams.length + 2) + ')');
          interfaceParams.push(method, ifacePath);
        }

        if (assoc.backend) {
          const [method, ...pathParts] = assoc.backend.split(' ');
          const ifacePath = pathParts.join(' ');
          interfaceConditions.push('(i.method = $' + (interfaceParams.length + 1) + ' AND i.path = $' + (interfaceParams.length + 2) + ')');
          interfaceParams.push(method, ifacePath);
        }

        if (interfaceConditions.length === 0) continue;

        const { rows: interfaceRows } = await query(
          `SELECT i.id FROM interfaces i WHERE i.category = $1 AND (${interfaceConditions.join(' OR ')})`,
          [importCategory, ...interfaceParams]
        );

        for (const ifaceRow of interfaceRows) {
          const modelFields = assoc.modelFields || [];
          const tableFields = assoc.tableFields || [];
          const maxFields = Math.max(modelFields.length, tableFields.length);

          for (let fi = 0; fi < maxFields; fi++) {
            const modelField = modelFields[fi] || '';
            const tableField = tableFields[fi] || modelField;
            if (!modelField && !tableField) continue;

            const existingMapping = await query(
              'SELECT id FROM field_mappings WHERE interface_id = $1 AND model_name = $2 AND model_field = $3',
              [(ifaceRow as any).id, assoc.model, modelField || tableField]
            );

            if (existingMapping.rows.length === 0) {
              await query(
                `INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [uuidv4(), (ifaceRow as any).id, tableField || modelField, assoc.model, modelField || tableField]
              );
              imported.mappings++;
            }
          }
        }
      } catch (err) {
        console.error('Failed to import association:', err);
      }
    }

    const now = new Date().toISOString();
    await query('UPDATE projects SET updated_at = $1 WHERE id = $2', [now, id]);

    res.json({
      success: true,
      imported,
      message: `导入完成: ${imported.interfaces} 接口, ${imported.models} 模型, ${imported.tables} 表, ${imported.mappings} 字段映射`,
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import parsed results', details: (error as Error).message });
  }
});

async function readCodeFilesFromDir(dirPath: string): Promise<{
  files: Record<string, string>;
  fileCount: number;
  totalSize: number;
}> {
  const files: Record<string, string> = {};
  let fileCount = 0;
  let totalSize = 0;

  async function walkDir(currentPath: string, relativeTo: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(relativeTo, fullPath);

      if (entry.isDirectory()) {
        await walkDir(fullPath, relativeTo);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > 500 * 1024) continue;

          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.trim().length === 0) continue;

          files[relativePath] = content;
          fileCount++;
          totalSize += content.length;
        } catch {
          continue;
        }
      }
    }
  }

  await walkDir(dirPath, dirPath);
  return { files, fileCount, totalSize };
}

export default router;
