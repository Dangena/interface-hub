import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';

const router = Router();

interface TestSuite {
  id: string;
  name: string;
  description: string;
  interfaceIds: string[];
  schedule: string;
  lastRunAt: string | null;
  lastResult: string | null;
  enabled: boolean;
  createdAt: string;
}

interface TestResultItem {
  interfaceId: string;
  interfaceName: string;
  method: string;
  path: string;
  status: 'passed' | 'failed';
  responseTime: number;
  statusCode: number | null;
  expectedStatus: number;
  passed: boolean;
  error: string | null;
}

interface TestResult {
  id: string;
  suiteId: string | null;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResultItem[];
}

const suites = new Map<string, TestSuite>();
const results = new Map<string, TestResult>();

router.get('/suites', (_req, res) => {
  try {
    const allSuites = Array.from(suites.values());
    res.json(allSuites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test suites' });
  }
});

router.post('/suites', (req, res) => {
  try {
    const { name, description, interfaceIds, schedule, enabled } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Suite name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const suite: TestSuite = {
      id,
      name,
      description: description || '',
      interfaceIds: interfaceIds || [],
      schedule: schedule || '',
      lastRunAt: null,
      lastResult: null,
      enabled: enabled !== undefined ? enabled : true,
      createdAt: now,
    };

    suites.set(id, suite);
    res.status(201).json(suite);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create test suite' });
  }
});

router.put('/suites/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = suites.get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    const { name, description, interfaceIds, schedule, enabled } = req.body;

    const updated: TestSuite = {
      ...existing,
      name: name ?? existing.name,
      description: description ?? existing.description,
      interfaceIds: interfaceIds ?? existing.interfaceIds,
      schedule: schedule ?? existing.schedule,
      enabled: enabled !== undefined ? enabled : existing.enabled,
    };

    suites.set(id, updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update test suite' });
  }
});

router.delete('/suites/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = suites.get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    suites.delete(id);

    const resultsToDelete: string[] = [];
    results.forEach((result, resultId) => {
      if (result.suiteId === id) {
        resultsToDelete.push(resultId);
      }
    });
    resultsToDelete.forEach(resultId => results.delete(resultId));

    res.json({ message: 'Test suite deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete test suite' });
  }
});

router.post('/suites/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    const suite = suites.get(id);

    if (!suite) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    const { baseUrl } = req.body;
    const testResults: TestResultItem[] = [];

    for (const interfaceId of suite.interfaceIds) {
      const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(interfaceId) as Record<string, any> | undefined;

      if (!iface) {
        testResults.push({
          interfaceId,
          interfaceName: 'Unknown',
          method: 'UNKNOWN',
          path: 'Unknown',
          status: 'failed',
          responseTime: 0,
          statusCode: null,
          expectedStatus: 200,
          passed: false,
          error: 'Interface not found in database',
        });
        continue;
      }

      const method = (iface.method || 'GET').toUpperCase();
      const path = iface.path || '/';
      const expectedStatus = 200;
      const targetBaseUrl = baseUrl || `http://localhost:${process.env.PORT || 3001}`;
      const url = `${targetBaseUrl}${path}`;

      const startTime = Date.now();
      let statusCode: number | null = null;
      let passed = false;
      let error: string | null = null;

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        };

        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          fetchOptions.body = JSON.stringify({});
        }

        const response = await fetch(url, fetchOptions);
        statusCode = response.status;
        passed = statusCode === expectedStatus;

        if (!passed) {
          error = `Expected status ${expectedStatus}, got ${statusCode}`;
        }
      } catch (err: any) {
        error = err.message || 'Request failed';
        passed = false;
      }

      const responseTime = Date.now() - startTime;

      testResults.push({
        interfaceId,
        interfaceName: iface.name,
        method,
        path,
        status: passed ? 'passed' : 'failed',
        responseTime,
        statusCode,
        expectedStatus,
        passed,
        error,
      });
    }

    const totalTests = testResults.length;
    const passedCount = testResults.filter(r => r.passed).length;
    const failedCount = totalTests - passedCount;

    const resultId = uuidv4();
    const now = new Date().toISOString();

    const testResult: TestResult = {
      id: resultId,
      suiteId: id,
      timestamp: now,
      totalTests,
      passed: passedCount,
      failed: failedCount,
      results: testResults,
    };

    results.set(resultId, testResult);

    suite.lastRunAt = now;
    suite.lastResult = failedCount === 0 ? 'passed' : (passedCount === 0 ? 'failed' : 'partial');
    suites.set(id, suite);

    res.json(testResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to run test suite' });
  }
});

router.get('/suites/:id/results', (req, res) => {
  try {
    const { id } = req.params;
    const suite = suites.get(id);

    if (!suite) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    const suiteResults = Array.from(results.entries())
      .filter(([, r]) => r.suiteId === id)
      .map(([, r]) => r)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json(suiteResults);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test results' });
  }
});

router.get('/results/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = results.get(id);

    if (!result) {
      return res.status(404).json({ error: 'Test result not found' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test result' });
  }
});

router.post('/quick-test', async (req, res) => {
  try {
    const { interfaceId, baseUrl, expectedStatus, maxResponseTime } = req.body;

    if (!interfaceId) {
      return res.status(400).json({ error: 'interfaceId is required' });
    }

    const iface = db.prepare('SELECT * FROM interfaces WHERE id = ?').get(interfaceId) as Record<string, any> | undefined;

    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const method = (iface.method || 'GET').toUpperCase();
    const path = iface.path || '/';
    const targetExpectedStatus = expectedStatus || 200;
    const targetMaxResponseTime = maxResponseTime || 5000;
    const targetBaseUrl = baseUrl || `http://localhost:${process.env.PORT || 3001}`;
    const url = `${targetBaseUrl}${path}`;

    const startTime = Date.now();
    let statusCode: number | null = null;
    let passed = false;
    let error: string | null = null;

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(targetMaxResponseTime),
      };

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify({});
      }

      const response = await fetch(url, fetchOptions);
      statusCode = response.status;

      const statusMatch = statusCode === targetExpectedStatus;
      const responseTime = Date.now() - startTime;
      const timeMatch = responseTime <= targetMaxResponseTime;
      passed = statusMatch && timeMatch;

      if (!statusMatch) {
        error = `Expected status ${targetExpectedStatus}, got ${statusCode}`;
      } else if (!timeMatch) {
        error = `Response time ${responseTime}ms exceeded max ${targetMaxResponseTime}ms`;
      }
    } catch (err: any) {
      error = err.message || 'Request failed';
      passed = false;
    }

    const responseTime = Date.now() - startTime;

    const resultItem: TestResultItem = {
      interfaceId,
      interfaceName: iface.name,
      method,
      path,
      status: passed ? 'passed' : 'failed',
      responseTime,
      statusCode,
      expectedStatus: targetExpectedStatus,
      passed,
      error,
    };

    const resultId = uuidv4();
    const now = new Date().toISOString();

    const testResult: TestResult = {
      id: resultId,
      suiteId: null,
      timestamp: now,
      totalTests: 1,
      passed: passed ? 1 : 0,
      failed: passed ? 0 : 1,
      results: [resultItem],
    };

    results.set(resultId, testResult);

    res.json(testResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to run quick test' });
  }
});

export default router;
