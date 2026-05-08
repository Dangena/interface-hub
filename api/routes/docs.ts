import { Router } from 'express';
import db from '../database';

const router = Router();

interface InterfaceInfo {
  id: string;
  name: string;
  path: string;
  method: string;
  description: string;
  category: string;
  tags: string;
  status: string;
  version: string;
  parameters?: any[];
  request_schema?: string;
  response_schema?: string;
}

interface ModelInfo {
  name: string;
  table_name: string;
  description: string;
  fields?: any[];
}

router.get('/generate/:interfaceId', (req, res) => {
  try {
    const { interfaceId } = req.params;

    const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(interfaceId) as InterfaceInfo | undefined;
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const params = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(interfaceId);
    const mappings = db.prepare(`
      SELECT fm.*, dm.name as model_name, dm.table_name 
      FROM field_mappings fm
      LEFT JOIN data_models dm ON fm.model_name = dm.name
      WHERE fm.interface_id = ?
    `).all(interfaceId);

    const doc = {
      title: iface.name,
      version: iface.version || '1.0.0',
      overview: generateOverview(iface),
      endpoint: generateEndpoint(iface),
      parameters: generateParameters(params as any[]),
      requestBody: generateRequestBody(iface, mappings as any[]),
      responseBody: generateResponseBody(iface, mappings as any[]),
      mappings: generateMappingsTable(mappings as any[]),
      examples: generateExamples(iface, mappings as any[]),
      markdown: generateMarkdown(iface, params as any[], mappings as any[]),
    };

    res.json(doc);
  } catch (error) {
    console.error('Generate doc error:', error);
    res.status(500).json({ error: 'Failed to generate documentation' });
  }
});

router.get('/export/:interfaceId', (req, res) => {
  try {
    const { interfaceId } = req.params;

    const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(interfaceId) as InterfaceInfo | undefined;
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const params = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(interfaceId);
    const mappings = db.prepare(`
      SELECT fm.*, dm.name as model_name, dm.table_name 
      FROM field_mappings fm
      LEFT JOIN data_models dm ON fm.model_name = dm.name
      WHERE fm.interface_id = ?
    `).all(interfaceId);

    const markdown = generateMarkdown(iface, params as any[], mappings as any[]);

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${iface.name.replace(/\s+/g, '_')}_API.md"`);
    res.send(markdown);
  } catch (error) {
    console.error('Export doc error:', error);
    res.status(500).json({ error: 'Failed to export documentation' });
  }
});

router.get('/export-all', (req, res) => {
  try {
    const interfaces = db.prepare('SELECT * FROM interfaces ORDER BY category, name').all() as InterfaceInfo[];
    const models = db.prepare('SELECT * FROM data_models ORDER BY name').all() as ModelInfo[];

    let markdown = `# API Documentation\n\n`;
    markdown += `Generated at: ${new Date().toISOString()}\n\n`;
    markdown += `## Table of Contents\n\n`;
    markdown += `- [Overview](#overview)\n`;
    markdown += `- [Interfaces](#interfaces)\n`;
    markdown += `- [Data Models](#data-models)\n\n`;

    markdown += `## Overview\n\n`;
    markdown += `- Total Interfaces: ${interfaces.length}\n`;
    markdown += `- Total Data Models: ${models.length}\n\n`;

    const categories = [...new Set(interfaces.map(i => i.category).filter(Boolean))];
    markdown += `## Interfaces\n\n`;
    
    for (const category of categories) {
      markdown += `### ${category}\n\n`;
      const categoryInterfaces = interfaces.filter(i => i.category === category);
      
      for (const iface of categoryInterfaces) {
        const params = db.prepare('SELECT * FROM parameters WHERE interface_id = ?').all(iface.id);
        const mappings = db.prepare(`
          SELECT fm.*, dm.name as model_name 
          FROM field_mappings fm
          LEFT JOIN data_models dm ON fm.model_name = dm.name
          WHERE fm.interface_id = ?
        `).all(iface.id);

        markdown += `#### ${iface.name}\n\n`;
        markdown += `- **Method**: ${iface.method}\n`;
        markdown += `- **Path**: ${iface.path}\n`;
        markdown += `- **Description**: ${iface.description || 'N/A'}\n`;
        markdown += `- **Status**: ${iface.status}\n`;
        markdown += `- **Version**: ${iface.version}\n\n`;

        if (params.length > 0) {
          markdown += `**Parameters:**\n\n`;
          markdown += `| Name | Location | Type | Required |\n`;
          markdown += `|------|----------|------|----------|\n`;
          for (const param of params as any[]) {
            markdown += `| ${param.name} | ${param.location} | ${param.type} | ${param.required ? 'Yes' : 'No'} |\n`;
          }
          markdown += `\n`;
        }

        if (mappings.length > 0) {
          markdown += `**Field Mappings:**\n\n`;
          markdown += `| Interface Field | Model | Model Field |\n`;
          markdown += `|-----------------|-------|-------------|\n`;
          for (const mapping of mappings as any[]) {
            markdown += `| ${mapping.interface_field} | ${mapping.model_name} | ${mapping.model_field} |\n`;
          }
          markdown += `\n`;
        }

        markdown += `---\n\n`;
      }
    }

    markdown += `## Data Models\n\n`;
    for (const model of models) {
      const fields = db.prepare('SELECT * FROM fields WHERE model_name = ?').all(model.name);
      
      markdown += `### ${model.name}\n\n`;
      markdown += `- **Table Name**: ${model.table_name}\n`;
      markdown += `- **Description**: ${model.description || 'N/A'}\n\n`;

      if (fields.length > 0) {
        markdown += `**Fields:**\n\n`;
        markdown += `| Name | Column | Type | Nullable | Primary Key |\n`;
        markdown += `|------|--------|------|----------|-------------|\n`;
        for (const field of fields as any[]) {
          markdown += `| ${field.name} | ${field.column_name} | ${field.type} | ${field.nullable ? 'Yes' : 'No'} | ${field.primary_key ? 'Yes' : 'No'} |\n`;
        }
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    }

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="API_Documentation.md"');
    res.send(markdown);
  } catch (error) {
    console.error('Export all docs error:', error);
    res.status(500).json({ error: 'Failed to export all documentation' });
  }
});

function generateOverview(iface: InterfaceInfo): string {
  return `${iface.description || 'No description available'}

**Category**: ${iface.category || 'Uncategorized'}
**Tags**: ${iface.tags ? JSON.parse(iface.tags).join(', ') : 'None'}
**Status**: ${iface.status}
**Version**: ${iface.version || '1.0.0'}`;
}

function generateEndpoint(iface: InterfaceInfo): string {
  return `**Method**: ${iface.method}
**Path**: ${iface.path}
**URL**: \`${iface.path}\``;
}

function generateParameters(params: any[]): any[] {
  if (!params || params.length === 0) {
    return [];
  }

  return params.map(p => ({
    name: p.name,
    in: p.location,
    type: p.type,
    required: p.required === 1,
    description: p.description || '',
  }));
}

function generateRequestBody(iface: InterfaceInfo, mappings: any[]): any {
  const bodyMappings = mappings.filter(m => m.interface_field);
  
  if (bodyMappings.length === 0) {
    return null;
  }

  const properties: any = {};
  const required: string[] = [];

  for (const mapping of bodyMappings) {
    properties[mapping.interface_field] = {
      type: 'string',
      description: `Maps to ${mapping.model_name}.${mapping.model_field}`,
    };
    required.push(mapping.interface_field);
  }

  return {
    contentType: 'application/json',
    schema: {
      type: 'object',
      properties,
      required,
    },
    example: generateExampleFromMappings(bodyMappings),
  };
}

function generateResponseBody(iface: InterfaceInfo, mappings: any[]): any {
  const responseMappings = mappings.filter(m => m.interface_field);
  
  if (responseMappings.length === 0) {
    return {
      contentType: 'application/json',
      schema: { type: 'object' },
      example: {},
    };
  }

  const properties: any = {};
  const required: string[] = [];

  for (const mapping of responseMappings) {
    properties[mapping.interface_field] = {
      type: 'string',
      description: `From ${mapping.model_name}.${mapping.model_field}`,
    };
  }

  return {
    contentType: 'application/json',
    schema: {
      type: 'object',
      properties,
      required,
    },
    example: generateExampleFromMappings(responseMappings),
  };
}

function generateMappingsTable(mappings: any[]): any[] {
  return mappings.map(m => ({
    interfaceField: m.interface_field,
    modelName: m.model_name,
    modelField: m.model_field,
    mappingType: m.mapping_type || 'field',
  }));
}

function generateExamples(iface: InterfaceInfo, mappings: any[]): any {
  const example: any = {};

  if (iface.method === 'GET') {
    const pathParams = mappings.filter(m => m.interface_field);
    for (const param of pathParams) {
      if (param.interface_field) {
        example[param.interface_field] = generateMockValue(param.model_field);
      }
    }
  } else if (iface.method === 'POST' || iface.method === 'PUT' || iface.method === 'PATCH') {
    for (const mapping of mappings) {
      if (mapping.interface_field) {
        example[mapping.interface_field] = generateMockValue(mapping.model_field);
      }
    }
  }

  return {
    request: iface.method !== 'GET' ? example : null,
    response: example,
    curl: generateCurlCommand(iface, example),
  };
}

function generateMockValue(fieldName: string): any {
  const lowerName = (fieldName || '').toLowerCase();
  
  if (lowerName.includes('id')) return 1;
  if (lowerName.includes('name')) return 'Sample Name';
  if (lowerName.includes('email')) return 'user@example.com';
  if (lowerName.includes('phone')) return '1234567890';
  if (lowerName.includes('age')) return 25;
  if (lowerName.includes('date') || lowerName.includes('time')) return new Date().toISOString();
  if (lowerName.includes('price') || lowerName.includes('amount')) return 99.99;
  if (lowerName.includes('count') || lowerName.includes('quantity')) return 10;
  if (lowerName.includes('active') || lowerName.includes('enabled')) return true;
  if (lowerName.includes('description') || lowerName.includes('content')) return 'Sample description text';
  
  return 'sample_value';
}

function generateCurlCommand(iface: InterfaceInfo, example: any): string {
  let curl = `curl -X ${iface.method} 'http://localhost:3001${iface.path}'`;
  
  if (iface.method !== 'GET' && Object.keys(example).length > 0) {
    curl += ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(example, null, 2)}'`;
  }
  
  const queryParams = Object.keys(example).filter(k => !iface.path.includes(`:${k}`));
  if (queryParams.length > 0) {
    const queryString = queryParams.map(k => `${k}=${example[k]}`).join('&');
    curl += ` \\\n  'http://localhost:3001${iface.path}?${queryString}'`;
  }
  
  return curl;
}

function generateExampleFromMappings(mappings: any[]): any {
  const example: any = {};
  for (const mapping of mappings) {
    if (mapping.interface_field) {
      example[mapping.interface_field] = generateMockValue(mapping.model_field);
    }
  }
  return example;
}

function generateMarkdown(iface: InterfaceInfo, params: any[], mappings: any[]): string {
  let md = `# ${iface.name}\n\n`;
  md += `> ${iface.description || 'No description'}\n\n`;
  
  md += `## Basic Information\n\n`;
  md += `- **Method**: \`${iface.method}\`\n`;
  md += `- **Path**: \`${iface.path}\`\n`;
  md += `- **Category**: ${iface.category || 'Uncategorized'}\n`;
  md += `- **Status**: ${iface.status}\n`;
  md += `- **Version**: ${iface.version || '1.0.0'}\n`;
  
  if (iface.tags) {
    const tags = Array.isArray(iface.tags) ? iface.tags : JSON.parse(iface.tags);
    md += `- **Tags**: ${tags.map((t: string) => `\`${t}\``).join(', ')}\n`;
  }
  
  md += `\n## Endpoint\n\n`;
  md += `\`\`\`\n`;
  md += `${iface.method} ${iface.path}\n`;
  md += `\`\`\`\n\n`;
  
  if (params && params.length > 0) {
    md += `## Parameters\n\n`;
    md += `| Name | Location | Type | Required | Description |\n`;
    md += `|------|----------|------|----------|-------------|\n`;
    for (const param of params) {
      md += `| ${param.name} | ${param.location} | \`${param.type}\` | ${param.required ? '✓' : '✗'} | ${param.description || '-'} |\n`;
    }
    md += `\n`;
  }
  
  if (mappings && mappings.length > 0) {
    md += `## Field Mappings\n\n`;
    md += `| Interface Field | Model | Model Field |\n`;
    md += `|-----------------|-------|-------------|\n`;
    for (const mapping of mappings) {
      md += `| ${mapping.interface_field} | ${mapping.model_name || '-'} | ${mapping.model_field} |\n`;
    }
    md += `\n`;
  }
  
  const examples = generateExamples(iface, mappings);
  if (examples.request) {
    md += `## Request Example\n\n`;
    md += `\`\`\`json\n`;
    md += JSON.stringify(examples.request, null, 2) + '\n';
    md += `\`\`\`\n\n`;
  }
  
  if (examples.response) {
    md += `## Response Example\n\n`;
    md += `\`\`\`json\n`;
    md += JSON.stringify(examples.response, null, 2) + '\n';
    md += `\`\`\`\n\n`;
  }
  
  md += `## cURL Example\n\n`;
  md += `\`\`\`bash\n`;
  md += examples.curl + '\n';
  md += `\`\`\`\n\n`;
  
  md += `---\n\n`;
  md += `*Documentation generated on ${new Date().toLocaleString()}*\n`;
  
  return md;
}

export default router;
