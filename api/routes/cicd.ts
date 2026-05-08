import { Router } from 'express';
import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

async function generateGitHubActions(baseUrl: string, interfaces: string[]): Promise<string> {
  const watchPaths = interfaces.length > 0
    ? (await Promise.all(interfaces.map(async id => {
        const iface = (await query('SELECT path FROM interfaces WHERE id = $1', [id])).rows[0] as any;
        return iface ? `          - "${iface.path}"` : null;
      }))).filter(Boolean).join('\n')
    : '          - "api/**"';

  return `name: API Test Pipeline
on:
  push:
    branches: [main, develop]
    paths:
${watchPaths}
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  api-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run API Tests
        env:
          API_BASE_URL: ${baseUrl}
        run: npm run test:api

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-results
          path: test-results/

      - name: Report Results
        if: always()
        run: |
          echo "API Test Results:"
          cat test-results/summary.json || echo "No summary available"
`;
}

function generateJenkins(baseUrl: string, interfaces: string[]): string {
  const interfaceFilter = interfaces.length > 0
    ? `\n    INTERFACE_IDS = '${interfaces.join(',')}'`
    : '';

  return `pipeline {
  agent any
  environment {
    API_BASE_URL = '${baseUrl}'${interfaceFilter}
  }
  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Install Dependencies') {
      steps {
        sh 'npm ci'
      }
    }
    stage('Run API Tests') {
      steps {
        sh 'npm run test:api'
      }
      post {
        always {
          junit 'test-results/*.xml' || true
        }
      }
    }
    stage('Report Results') {
      steps {
        echo 'API Test Results:'
        sh 'cat test-results/summary.json || echo "No summary available"'
      }
    }
  }
  post {
    failure {
      echo 'API Tests failed!'
    }
    success {
      echo 'API Tests passed!'
    }
  }
}`;
}

async function generateGitLabCI(baseUrl: string, interfaces: string[]): Promise<string> {
  const rules = interfaces.length > 0
    ? `    - if: '$CI_PIPELINE_SOURCE == "web"'
    - changes:
${(await Promise.all(interfaces.map(async id => {
      const iface = (await query('SELECT path FROM interfaces WHERE id = $1', [id])).rows[0] as any;
      return iface ? `        - "${iface.path}"` : null;
    }))).filter(Boolean).join('\n')}`
    : `    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_BRANCH == "develop"'`;

  return `stages:
  - test

api-test:
  stage: test
  image: node:20
  variables:
    API_BASE_URL: "${baseUrl}"
  rules:
${rules}
  script:
    - npm ci
    - npm run test:api
  artifacts:
    when: always
    paths:
      - test-results/
    reports:
      junit: test-results/*.xml
`;
}

router.post('/generate-config', async (req, res) => {
  try {
    const { type, baseUrl, interfaces } = req.body;

    if (!type || !baseUrl) {
      return res.status(400).json({ error: 'type and baseUrl are required' });
    }

    const validTypes = ['github-actions', 'jenkins', 'gitlab-ci'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const interfaceIds: string[] = interfaces || [];
    let config: string;

    switch (type) {
      case 'github-actions':
        config = await generateGitHubActions(baseUrl, interfaceIds);
        break;
      case 'jenkins':
        config = generateJenkins(baseUrl, interfaceIds);
        break;
      case 'gitlab-ci':
        config = await generateGitLabCI(baseUrl, interfaceIds);
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    res.json({ type, config });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate config' });
  }
});

router.get('/configs', async (req, res) => {
  try {
    const configs = (await query('SELECT * FROM ci_cd_configs ORDER BY created_at DESC')).rows as any[];
    res.json(configs.map(c => ({ ...c, enabled: Boolean(c.enabled) })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

router.post('/configs', async (req, res) => {
  try {
    const { name, type, config } = req.body;

    if (!name || !type || !config) {
      return res.status(400).json({ error: 'name, type and config are required' });
    }

    const validTypes = ['github-actions', 'jenkins', 'gitlab-ci'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO ci_cd_configs (id, name, type, config, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 1, $5, $6)
    `, [id, name, type, config, now, now]);

    res.status(201).json({ id, name, type, config, enabled: true, created_at: now, updated_at: now });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create config' });
  }
});

router.put('/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, config, enabled } = req.body;

    const existing = (await query('SELECT * FROM ci_cd_configs WHERE id = $1', [id])).rows[0] as any;
    if (!existing) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const now = new Date().toISOString();
    await query(`
      UPDATE ci_cd_configs SET name = $1, type = $2, config = $3, enabled = $4, updated_at = $5
      WHERE id = $6
    `, [
      name || existing.name,
      type || existing.type,
      config || existing.config,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      now, id
    ]);

    res.json({ message: 'Config updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

router.delete('/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM ci_cd_configs WHERE id = $1', [id]);
    res.json({ message: 'Config deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

router.get('/runs', async (req, res) => {
  try {
    const { status, configId } = req.query;
    let sql = 'SELECT * FROM pipeline_runs WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    if (configId) {
      sql += ` AND config_id = $${paramIdx++}`;
      params.push(configId);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const runs = (await query(sql, params)).rows as any[];
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

router.post('/runs', async (req, res) => {
  try {
    const { configId, triggerType, triggerData } = req.body;

    if (!configId || !triggerType) {
      return res.status(400).json({ error: 'configId and triggerType are required' });
    }

    const config = (await query('SELECT * FROM ci_cd_configs WHERE id = $1', [configId])).rows[0] as any;
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO pipeline_runs (id, config_id, status, trigger_type, trigger_data, started_at, created_at)
      VALUES ($1, $2, 'pending', $3, $4, $5, $6)
    `, [id, configId, triggerType, triggerData || null, now, now]);

    await query('UPDATE ci_cd_configs SET last_run_at = $1 WHERE id = $2', [now, configId]);

    res.status(201).json({
      id, config_id: configId, status: 'pending',
      trigger_type: triggerType, trigger_data: triggerData || null,
      started_at: now, created_at: now,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create run' });
  }
});

router.put('/runs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, result, finishedAt } = req.body;

    const existing = (await query('SELECT * FROM pipeline_runs WHERE id = $1', [id])).rows[0] as any;
    if (!existing) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const now = new Date().toISOString();
    const finishedAtValue = finishedAt || now;

    await query(`
      UPDATE pipeline_runs SET status = $1, result = $2, finished_at = $3
      WHERE id = $4
    `, [
      status || existing.status,
      result !== undefined ? result : existing.result,
      status === 'running' ? existing.finished_at : finishedAtValue,
      id
    ]);

    res.json({ message: 'Run updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update run' });
  }
});

router.get('/changes', async (req, res) => {
  try {
    const { since } = req.query;

    if (!since) {
      return res.status(400).json({ error: 'since query parameter (timestamp) is required' });
    }

    const changes = (await query(
      'SELECT * FROM change_history WHERE created_at > $1 ORDER BY created_at ASC',
      [since]
    )).rows as any[];

    const newInterfaces: any[] = [];
    const modifiedInterfaces: Map<string, any> = new Map();
    const deletedInterfaces: any[] = [];

    const seenInterfaceIds = new Set<string>();

    for (const change of changes) {
      const iface = (await query('SELECT * FROM interfaces WHERE id = $1', [change.interface_id])).rows[0] as any;

      if (change.action === 'create') {
        if (iface) {
          newInterfaces.push({ ...iface, tags: iface.tags ? JSON.parse(iface.tags) : [], detected_at: change.created_at });
        }
      } else if (change.action === 'delete') {
        deletedInterfaces.push({
          id: change.interface_id,
          name: change.old_value || 'Unknown',
          detected_at: change.created_at,
        });
      } else if (change.action === 'update') {
        if (!seenInterfaceIds.has(change.interface_id)) {
          seenInterfaceIds.add(change.interface_id);
          modifiedInterfaces.set(change.interface_id, {
            id: change.interface_id,
            name: iface ? iface.name : 'Unknown',
            path: iface ? iface.path : '',
            method: iface ? iface.method : '',
            diffs: [],
            detected_at: change.created_at,
          });
        }
        const entry = modifiedInterfaces.get(change.interface_id);
        entry.diffs.push({
          field: change.field_name,
          old_value: change.old_value,
          new_value: change.new_value,
          changed_at: change.created_at,
        });
      }
    }

    res.json({
      since,
      new: newInterfaces,
      modified: Array.from(modifiedInterfaces.values()),
      deleted: deletedInterfaces,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to detect changes' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const { eventType, data } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: 'eventType is required' });
    }

    const configs = (await query('SELECT * FROM ci_cd_configs WHERE enabled = 1')).rows as any[];
    if (configs.length === 0) {
      return res.status(200).json({ message: 'No enabled configs found', runId: null });
    }

    const config = configs[0];
    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO pipeline_runs (id, config_id, status, trigger_type, trigger_data, started_at, created_at)
      VALUES ($1, $2, 'pending', $3, $4, $5, $6)
    `, [id, config.id, eventType, data ? JSON.stringify(data) : null, now, now]);

    await query('UPDATE ci_cd_configs SET last_run_at = $1 WHERE id = $2', [now, config.id]);

    res.status(201).json({ runId: id, configId: config.id, status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
