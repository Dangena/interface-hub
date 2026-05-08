import { Router } from 'express';
import { query } from '../database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const interfaces = (await query('SELECT * FROM interfaces')).rows;
    const models = (await query('SELECT * FROM data_models')).rows;
    const mappings = (await query('SELECT * FROM field_mappings')).rows;

    const nodes: any[] = [];
    const edges: any[] = [];

    interfaces.forEach((iface: any) => {
      nodes.push({
        id: `interface-${iface.id}`,
        type: 'interface',
        label: iface.name,
        data: {
          id: iface.id,
          name: iface.name,
          path: iface.path,
          method: iface.method,
          status: iface.status,
          category: iface.category,
        },
      });
    });

    models.forEach((model: any) => {
      nodes.push({
        id: `model-${model.name}`,
        type: 'database',
        label: model.name,
        data: {
          name: model.name,
          tableName: model.table_name,
          description: model.description,
        },
      });
    });

    const addedEdges = new Set();

    mappings.forEach((mapping: any) => {
      const edgeId = `${mapping.interface_id}-${mapping.model_name}`;
      if (!addedEdges.has(edgeId)) {
        addedEdges.add(edgeId);
        edges.push({
          id: `edge-${edgeId}`,
          source: `interface-${mapping.interface_id}`,
          target: `model-${mapping.model_name}`,
          type: 'maps_to',
          label: '映射',
        });
      }
    });

    res.json({
      nodes,
      edges,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch graph data' });
  }
});

export default router;
