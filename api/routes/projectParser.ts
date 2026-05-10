import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database.js';
import {
  parseEnhancedFrontendCode,
  parseEnhancedBackendCode,
  parseEnhancedSQL,
  generateDeepAssociations,
  tablesToModels,
  singularize,
  type ParsedModel,
  type ProjectParseResult,
} from '../utils/projectParserUtils.js';

const router = Router();

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

          const modelName = models?.find((m: ParsedModel) => m.name.toLowerCase() === singularize(table.name).toLowerCase())?.name || singularize(table.name);

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

export default router;
