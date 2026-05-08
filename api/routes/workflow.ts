import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

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

const workflows = new Map<string, Workflow>();
const executions = new Map<string, Execution>();

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
    const list = Array.from(workflows.values());
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
    const workflow: Workflow = {
      id,
      name,
      description: description || '',
      steps: (steps || []).map((step: any, index: number) => ({
        id: step.id || uuidv4(),
        type: step.type || 'api-call',
        config: step.config || {},
        nextStep: step.nextStep ?? (index < (steps || []).length - 1 ? (steps || [])[index + 1]?.id || null : null),
      })),
      status: status || 'draft',
      createdAt: now,
      updatedAt: now,
    };
    workflows.set(id, workflow);
    res.status(201).json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

router.put('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = workflows.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const { name, description, steps, status } = req.body;
    const now = new Date().toISOString();
    const updated: Workflow = {
      ...existing,
      name: name ?? existing.name,
      description: description ?? existing.description,
      steps: steps
        ? steps.map((step: any, index: number) => ({
            id: step.id || uuidv4(),
            type: step.type || 'api-call',
            config: step.config || {},
            nextStep: step.nextStep ?? (index < steps.length - 1 ? steps[index + 1]?.id || null : null),
          }))
        : existing.steps,
      status: status ?? existing.status,
      updatedAt: now,
    };
    workflows.set(id, updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

router.delete('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = workflows.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    workflows.delete(id);
    for (const [execId, execution] of executions) {
      if (execution.workflowId === id) {
        executions.delete(execId);
      }
    }
    res.json({ message: 'Workflow deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

router.post('/workflows/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = workflows.get(id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    if (workflow.steps.length === 0) {
      return res.status(400).json({ error: 'Workflow has no steps to execute' });
    }

    const execId = uuidv4();
    const execution: Execution = {
      id: execId,
      workflowId: id,
      status: 'running',
      startedAt: new Date().toISOString(),
      stepResults: [],
    };
    executions.set(execId, execution);

    const context: Record<string, any> = {
      previousOutput: req.body?.initialData ?? null,
      workflow: { id: workflow.id, name: workflow.name },
    };

    const stepMap = new Map<string, WorkflowStep>();
    for (const step of workflow.steps) {
      stepMap.set(step.id, step);
    }

    let currentStepId: string | null | undefined = workflow.steps[0]?.id;

    while (currentStepId) {
      const step = stepMap.get(currentStepId);
      if (!step) {
        execution.status = 'failed';
        execution.error = `Step not found: ${currentStepId}`;
        execution.completedAt = new Date().toISOString();
        executions.set(execId, execution);
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
      execution.stepResults.push(stepResult);

      if (result.error) {
        execution.status = 'failed';
        execution.error = `Step "${step.id}" failed: ${result.error}`;
        execution.completedAt = new Date().toISOString();
        executions.set(execId, execution);
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
        execution.status = 'completed';
        execution.completedAt = new Date().toISOString();
        executions.set(execId, execution);
      }
    }

    res.json(execution);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

router.get('/workflows/:id/executions', (req, res) => {
  try {
    const { id } = req.params;
    const workflow = workflows.get(id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const list = Array.from(executions.values())
      .filter((exec) => exec.workflowId === id)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    res.json({ data: list });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

router.get('/workflows/:id/executions/:execId', (req, res) => {
  try {
    const { id, execId } = req.params;
    const execution = executions.get(execId);
    if (!execution || execution.workflowId !== id) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    res.json(execution);
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
