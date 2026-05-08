import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';

const router = Router();

interface WorkflowStep {
  id: string;
  type: 'api-call' | 'condition' | 'transform' | 'delay';
  config: Record<string, any>;
  nextStep?: string | null;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  data: any;
  error?: string;
  duration: number;
}

interface Execution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  stepResults: StepResult[];
  error?: string;
}

const templates: Workflow[] = [
  {
    id: 'template-data-sync',
    name: 'Data Sync',
    description: 'Synchronize data between two API endpoints with transformation',
    steps: [
      {
        id: 'fetch-source',
        type: 'api-call',
        config: { url: '', method: 'GET', headers: {} },
        nextStep: 'transform-data',
      },
      {
        id: 'transform-data',
        type: 'transform',
        config: { mapping: {} },
        nextStep: 'push-target',
      },
      {
        id: 'push-target',
        type: 'api-call',
        config: { url: '', method: 'POST', headers: {} },
        nextStep: null,
      },
    ],
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template-api-chaining',
    name: 'API Chaining',
    description: 'Chain multiple API calls where each step uses output from the previous',
    steps: [
      {
        id: 'step-1',
        type: 'api-call',
        config: { url: '', method: 'GET', headers: {} },
        nextStep: 'step-2',
      },
      {
        id: 'step-2',
        type: 'api-call',
        config: { url: '', method: 'POST', headers: {}, body: { usePreviousOutput: true } },
        nextStep: 'step-3',
      },
      {
        id: 'step-3',
        type: 'api-call',
        config: { url: '', method: 'PUT', headers: {}, body: { usePreviousOutput: true } },
        nextStep: null,
      },
    ],
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template-error-retry',
    name: 'Error Retry',
    description: 'Execute an API call with conditional retry on failure',
    steps: [
      {
        id: 'call-api',
        type: 'api-call',
        config: { url: '', method: 'GET', headers: {}, retries: 3 },
        nextStep: 'check-result',
      },
      {
        id: 'check-result',
        type: 'condition',
        config: { expression: 'data.status >= 200 && data.status < 300' },
        nextStep: null,
      },
    ],
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template-batch-processing',
    name: 'Batch Processing',
    description: 'Process items in batches with delay between each batch',
    steps: [
      {
        id: 'fetch-batch',
        type: 'api-call',
        config: { url: '', method: 'GET', headers: {} },
        nextStep: 'transform-batch',
      },
      {
        id: 'transform-batch',
        type: 'transform',
        config: { mapping: {} },
        nextStep: 'delay-between-batches',
      },
      {
        id: 'delay-between-batches',
        type: 'delay',
        config: { milliseconds: 1000 },
        nextStep: null,
      },
    ],
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function rowToWorkflow(row: any): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: JSON.parse(row.steps),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToExecution(row: any): Execution {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    stepResults: row.step_results ? JSON.parse(row.step_results) : [],
    error: row.error ?? undefined,
  };
}

async function executeStep(
  step: WorkflowStep,
  context: Record<string, any>,
): Promise<{ data: any; error?: string }> {
  switch (step.type) {
    case 'api-call': {
      const { url, method = 'GET', headers = {}, body } = step.config;
      const resolvedUrl = typeof url === 'string' ? url : '';
      const resolvedBody = body?.usePreviousOutput ? context.previousOutput : body;
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
        };
        if (resolvedBody && method !== 'GET' && method !== 'HEAD') {
          fetchOptions.body = JSON.stringify(resolvedBody);
        }
        const response = await fetch(resolvedUrl, fetchOptions);
        let responseData: any;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
        return { data: { status: response.status, body: responseData } };
      } catch (err: any) {
        return { data: null, error: err.message || 'API call failed' };
      }
    }
    case 'condition': {
      const { expression } = step.config;
      try {
        const safeExpression = expression || 'true';
        const fn = new Function('data', 'context', `"use strict"; return (${safeExpression});`);
        const result = fn(context.previousOutput, context);
        return { data: { evaluated: Boolean(result), result } };
      } catch (err: any) {
        return { data: null, error: err.message || 'Condition evaluation failed' };
      }
    }
    case 'transform': {
      const { mapping } = step.config;
      try {
        const source = context.previousOutput || {};
        if (!mapping || Object.keys(mapping).length === 0) {
          return { data: source };
        }
        const transformed: Record<string, any> = {};
        for (const [targetKey, sourcePath] of Object.entries(mapping)) {
          if (typeof sourcePath === 'string') {
            const parts = sourcePath.split('.');
            let value: any = source;
            for (const part of parts) {
              if (value && typeof value === 'object' && part in value) {
                value = value[part];
              } else {
                value = undefined;
                break;
              }
            }
            transformed[targetKey] = value;
          } else {
            transformed[targetKey] = sourcePath;
          }
        }
        return { data: transformed };
      } catch (err: any) {
        return { data: null, error: err.message || 'Transform failed' };
      }
    }
    case 'delay': {
      const { milliseconds = 1000 } = step.config;
      const ms = Math.min(Math.max(0, Number(milliseconds) || 1000), 30000);
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { data: { delayed: ms } };
    }
    default:
      return { data: null, error: `Unknown step type: ${step.type}` };
  }
}

router.get('/workflows', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
    const list = rows.map(rowToWorkflow);
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

router.post('/workflows', (req, res) => {
  try {
    const { name, description, steps, status } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Workflow name is required' });
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    const parsedSteps: WorkflowStep[] = (steps || []).map((step: any, index: number) => ({
      id: step.id || uuidv4(),
      type: step.type || 'api-call',
      config: step.config || {},
      nextStep: step.nextStep ?? (index < (steps || []).length - 1 ? (steps || [])[index + 1]?.id || null : null),
    }));
    const workflowStatus = status || 'draft';

    db.prepare(
      'INSERT INTO workflows (id, name, description, steps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, description || '', JSON.stringify(parsedSteps), workflowStatus, now, now);

    const workflow: Workflow = {
      id,
      name,
      description: description || '',
      steps: parsedSteps,
      status: workflowStatus as Workflow['status'],
      createdAt: now,
      updatedAt: now,
    };
    res.status(201).json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

router.put('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const existing = rowToWorkflow(row);
    const { name, description, steps, status } = req.body;
    const now = new Date().toISOString();
    const updatedName = name ?? existing.name;
    const updatedDescription = description ?? existing.description;
    const updatedSteps: WorkflowStep[] = steps
      ? steps.map((step: any, index: number) => ({
          id: step.id || uuidv4(),
          type: step.type || 'api-call',
          config: step.config || {},
          nextStep: step.nextStep ?? (index < steps.length - 1 ? steps[index + 1]?.id || null : null),
        }))
      : existing.steps;
    const updatedStatus = status ?? existing.status;

    db.prepare(
      'UPDATE workflows SET name = ?, description = ?, steps = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(updatedName, updatedDescription, JSON.stringify(updatedSteps), updatedStatus, now, id);

    const updated: Workflow = {
      id,
      name: updatedName,
      description: updatedDescription,
      steps: updatedSteps,
      status: updatedStatus as Workflow['status'],
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

router.delete('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    db.prepare('DELETE FROM workflow_executions WHERE workflow_id = ?').run(id);
    db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    res.json({ message: 'Workflow deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

router.post('/workflows/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const workflow = rowToWorkflow(row);
    if (workflow.steps.length === 0) {
      return res.status(400).json({ error: 'Workflow has no steps to execute' });
    }

    const execId = uuidv4();
    const startedAt = new Date().toISOString();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO workflow_executions (id, workflow_id, status, step_results, error, started_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(execId, id, 'running', JSON.stringify([]), null, startedAt, null, now);

    const context: Record<string, any> = {
      previousOutput: req.body?.initialData ?? null,
      workflow: { id: workflow.id, name: workflow.name },
    };

    const stepMap = new Map<string, WorkflowStep>();
    for (const step of workflow.steps) {
      stepMap.set(step.id, step);
    }

    let currentStepId: string | null | undefined = workflow.steps[0]?.id;
    const stepResults: StepResult[] = [];
    let finalStatus: 'running' | 'completed' | 'failed' = 'running';
    let finalError: string | null = null;
    let completedAt: string | null = null;

    while (currentStepId) {
      const step = stepMap.get(currentStepId);
      if (!step) {
        finalStatus = 'failed';
        finalError = `Step not found: ${currentStepId}`;
        completedAt = new Date().toISOString();
        break;
      }

      const startTime = Date.now();
      const result = await executeStep(step, context);
      const duration = Date.now() - startTime;

      const stepResult: StepResult = {
        stepId: step.id,
        status: result.error ? 'failed' : 'success',
        data: result.data,
        error: result.error,
        duration,
      };
      stepResults.push(stepResult);

      if (result.error) {
        finalStatus = 'failed';
        finalError = `Step "${step.id}" failed: ${result.error}`;
        completedAt = new Date().toISOString();
        break;
      }

      context.previousOutput = result.data;

      if (step.type === 'condition') {
        const conditionResult = result.data?.evaluated;
        if (!conditionResult) {
          currentStepId = null;
        } else {
          currentStepId = step.nextStep ?? null;
        }
      } else {
        currentStepId = step.nextStep ?? null;
      }

      if (!currentStepId) {
        finalStatus = 'completed';
        completedAt = new Date().toISOString();
      }
    }

    if (finalStatus === 'running') {
      finalStatus = 'completed';
      completedAt = new Date().toISOString();
    }

    db.prepare(
      'UPDATE workflow_executions SET status = ?, step_results = ?, error = ?, completed_at = ? WHERE id = ?',
    ).run(finalStatus, JSON.stringify(stepResults), finalError, completedAt, execId);

    const execution: Execution = {
      id: execId,
      workflowId: id,
      status: finalStatus,
      startedAt,
      completedAt: completedAt ?? undefined,
      stepResults,
      error: finalError ?? undefined,
    };
    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

router.get('/workflows/:id/executions', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const rows = db.prepare(
      'SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC',
    ).all(id);
    const list = rows.map(rowToExecution);
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

router.get('/workflows/:id/executions/:execId', (req, res) => {
  try {
    const { id, execId } = req.params;
    const row = db.prepare('SELECT * FROM workflow_executions WHERE id = ? AND workflow_id = ?').get(execId, id);
    if (!row) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    res.json(rowToExecution(row));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

router.get('/templates', (_req, res) => {
  try {
    res.json({ data: templates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

export default router;
