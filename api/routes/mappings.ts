import { Router } from 'express';
import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/smart-match', async (req, res) => {
  try {
    const { interfaceId, modelName } = req.body;

    const interfaceData = (await query('SELECT * FROM interfaces WHERE id = $1', [interfaceId])).rows[0];
    const modelData = (await query('SELECT * FROM data_models WHERE name = $1', [modelName])).rows[0];

    if (!interfaceData) {
      return res.status(404).json({ error: 'Interface not found' });
    }
    if (!modelData) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const params = (await query('SELECT * FROM parameters WHERE interface_id = $1', [interfaceId])).rows as any[];
    const fields = (await query('SELECT * FROM fields WHERE model_name = $1', [modelName])).rows as any[];

    const suggestions: Array<{
      interfaceField: string;
      modelField: string;
      score: number;
      matchType: string;
      confidence: 'high' | 'medium' | 'low';
    }> = [];

    for (const param of params) {
      for (const field of fields) {
        const matchResult = calculateFieldMatchScore(param.name, field.name, param.type, field.type);

        if (matchResult.score > 0) {
          suggestions.push({
            interfaceField: param.name,
            modelField: field.name,
            score: matchResult.score,
            matchType: matchResult.matchType,
            confidence: matchResult.confidence,
          });
        }
      }
    }

    suggestions.sort((a, b) => b.score - a.score);

    const uniqueSuggestions: typeof suggestions = [];
    const usedInterfaceFields = new Set<string>();
    const usedModelFields = new Set<string>();

    for (const suggestion of suggestions) {
      if (!usedInterfaceFields.has(suggestion.interfaceField) && !usedModelFields.has(suggestion.modelField)) {
        uniqueSuggestions.push(suggestion);
        usedInterfaceFields.add(suggestion.interfaceField);
        usedModelFields.add(suggestion.modelField);
      }
    }

    res.json({
      interface: interfaceData,
      model: modelData,
      suggestions: uniqueSuggestions,
    });
  } catch (error) {
    console.error('Smart match error:', error);
    res.status(500).json({ error: 'Failed to perform smart match' });
  }
});

function calculateFieldMatchScore(paramName: string, fieldName: string, paramType?: string, fieldType?: string) {
  let score = 0;
  let matchType = 'unknown';

  const normalize = (str: string) => {
    let normalized = str.toLowerCase()
      .replace(/_/g, '')
      .replace(/-/g, '')
      .replace(/\s+/g, '');
    return normalized;
  };
  
  const splitWords = (str: string) => {
    const normalized = str
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-\s]+/g, ' ')
      .toLowerCase();
    return normalized.split(' ').filter(w => w && w.length > 1);
  };

  const normalizedParam = normalize(paramName);
  const normalizedField = normalize(fieldName);

  if (normalizedParam === normalizedField) {
    score = 100;
    matchType = 'exact';
  } else if (normalizedParam.includes(normalizedField) || normalizedField.includes(normalizedParam)) {
    const len1 = normalizedParam.length;
    const len2 = normalizedField.length;
    const minLen = Math.min(len1, len2);
    const maxLen = Math.max(len1, len2);
    const overlap = normalizedParam.includes(normalizedField) ? len2 : len1;
    score = (overlap / maxLen) * 85;
    matchType = 'partial';
  } else {
    const paramWords = splitWords(paramName);
    const fieldWords = splitWords(fieldName);

    let commonWords = 0;
    for (const word of paramWords) {
      if (fieldWords.includes(word) || fieldWords.some(fw => word.includes(fw) || fw.includes(word))) {
        commonWords++;
      }
    }

    if (commonWords > 0) {
      const totalUniqueWords = new Set([...paramWords, ...fieldWords]).size;
      score = (commonWords / totalUniqueWords) * 65;
      matchType = 'word';
    } else {
      const distance = levenshteinDistance(normalizedParam, normalizedField);
      const maxLen = Math.max(normalizedParam.length, normalizedField.length);
      const similarity = 1 - (distance / maxLen);
      
      if (similarity > 0.5) {
        score = similarity * 35;
        matchType = 'fuzzy';
      }
    }
  }

  if (paramType && fieldType) {
    const paramTypeLower = paramType.toLowerCase();
    const fieldTypeLower = fieldType.toLowerCase();
    const typeSimilarities = [
      ['string', 'varchar', 'text', 'char'],
      ['int', 'integer', 'number', 'long', 'short', 'byte'],
      ['boolean', 'bool', 'bit'],
      ['date', 'datetime', 'time', 'timestamp'],
      ['decimal', 'double', 'float', 'number', 'real'],
      ['json', 'object', 'array'],
    ];
    for (const group of typeSimilarities) {
      const paramInGroup = group.some(t => paramTypeLower.includes(t));
      const fieldInGroup = group.some(t => fieldTypeLower.includes(t));
      if (paramInGroup && fieldInGroup) {
        score += 15;
        break;
      }
    }
  }

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (score >= 75) confidence = 'high';
  else if (score >= 35) confidence = 'medium';

  return {
    score: Math.min(score, 100),
    matchType,
    confidence,
  };
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

router.post('/apply-batch', async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ error: 'No mappings provided' });
    }

    const results = {
      created: [] as any[],
      skipped: [] as any[],
    };
    const now = new Date().toISOString();

    for (const mapping of mappings) {
      const existing = (await query(`
        SELECT * FROM field_mappings
        WHERE interface_id = $1 AND interface_field = $2 AND model_name = $3 AND model_field = $4
      `, [mapping.interfaceId, mapping.interfaceField, mapping.modelName, mapping.modelField])).rows[0];

      if (existing) {
        results.skipped.push(mapping);
        continue;
      }

      const id = uuidv4();
      await query(`
        INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, mapping.interfaceId, mapping.interfaceField, mapping.modelName, mapping.modelField, now]);

      const savedMapping = (await query('SELECT * FROM field_mappings WHERE id = $1', [id])).rows[0];
      results.created.push(savedMapping);
    }

    res.json({
      message: `Created ${results.created.length} mappings, skipped ${results.skipped.length} existing mappings`,
      results,
    });
  } catch (error) {
    console.error('Batch apply error:', error);
    res.status(500).json({ error: 'Failed to apply mappings' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { interfaceId, interfaceField, modelName, modelField } = req.body;

    const existing = (await query(`
      SELECT * FROM field_mappings
      WHERE interface_id = $1 AND interface_field = $2 AND model_name = $3 AND model_field = $4
    `, [interfaceId, interfaceField, modelName, modelField])).rows[0];

    if (existing) {
      return res.status(400).json({ error: 'Mapping already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO field_mappings (id, interface_id, interface_field, model_name, model_field, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, interfaceId, interfaceField, modelName, modelField, now]);

    const mapping = (await query('SELECT * FROM field_mappings WHERE id = $1', [id])).rows[0];

    res.status(201).json(mapping);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mapping' });
  }
});

router.get('/interface/:interfaceId', async (req, res) => {
  try {
    const { interfaceId } = req.params;
    const mappings = (await query(`
      SELECT fm.*, dm.table_name, f.column_name as model_column, f.type as model_type
      FROM field_mappings fm
      JOIN data_models dm ON fm.model_name = dm.name
      LEFT JOIN fields f ON fm.model_field = f.name AND f.model_name = fm.model_name
      WHERE fm.interface_id = $1
    `, [interfaceId])).rows;

    res.json(mappings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

router.get('/model/:modelName', async (req, res) => {
  try {
    const { modelName } = req.params;
    const mappings = (await query(`
      SELECT fm.*, i.name as interface_name, i.path as interface_path, i.method
      FROM field_mappings fm
      JOIN interfaces i ON fm.interface_id = i.id
      WHERE fm.model_name = $1
    `, [modelName])).rows;

    res.json(mappings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = (await query('SELECT * FROM field_mappings WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    await query('DELETE FROM field_mappings WHERE id = $1', [id]);

    res.json({ message: 'Mapping deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

export default router;
