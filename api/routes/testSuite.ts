import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database.js';

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

function rowToSuite(row: Record<string, any>): TestSuite {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    interfaceIds: JSON.parse(row.interface_ids || '[]'),
    schedule: row.schedule || '',
    lastRunAt: row.last_run_at || null,
    lastResult: row.last_result || null,
    enabled: !!row.enabled,
    createdAt: row.created_at,
  };
}

function rowToResult(row: Record<string, any>): TestResult {
  return {
    id: row.id,
    suiteId: row.suite_id || null,
    timestamp: row.completed_at || row.created_at,
    totalTests: row.total_tests,
    passed: row.passed,
    failed: row.failed,
    results: JSON.parse(row.results || '[]'),
  };
}

router.get('/suites', async (_req, res) => {
  try {
    const rows = (await query('SELECT * FROM test_suites ORDER BY created_at DESC')).rows as Record<string, any>[];
    const allSuites = rows.map(rowToSuite);
    res.json(allSuites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test suites' });
  }
});

router.post('/suites', async (req, res) => {
  try {
    const { name, description, interfaceIds, schedule, enabled } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Suite name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await query(`
      INSERT INTO test_suites (id, name, description, interface_ids, schedule, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id,
      name,
      description || '',
      JSON.stringify(interfaceIds || []),
      schedule || '',
      enabled !== undefined ? (enabled ? 1 : 0) : 1,
      now,
      now,
    ]);

    const row = (await query('SELECT * FROM test_suites WHERE id = $1', [id])).rows[0] as Record<string, any>;
    const suite = rowToSuite(row);
    res.status(201).json(suite);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create test suite' });
  }
});

router.put('/suites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM test_suites WHERE id = $1', [id])).rows[0] as Record<string, any> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    const existing = rowToSuite(row);
    const { name, description, interfaceIds, schedule, enabled } = req.body;

    const updatedName = name ?? existing.name;
    const updatedDescription = description ?? existing.description;
    const updatedInterfaceIds = interfaceIds ?? existing.interfaceIds;
    const updatedSchedule = schedule ?? existing.schedule;
    const updatedEnabled = enabled !== undefined ? enabled : existing.enabled;

    const now = new Date().toISOString();

    await query(`
      UPDATE test_suites
      SET name = $1, description = $2, interface_ids = $3, schedule = $4, enabled = $5, updated_at = $6
      WHERE id = $7
    `, [
      updatedName,
      updatedDescription,
      JSON.stringify(updatedInterfaceIds),
      updatedSchedule,
      updatedEnabled ? 1 : 0,
      now,
      id,
    ]);

    const updatedRow = (await query('SELECT * FROM test_suites WHERE id = $1', [id])).rows[0] as Record<string, any>;
    const updated = rowToSuite(updatedRow);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update test suite' });
  }
});

router.delete('/suites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM test_suites WHERE id = $1', [id])).rows[0] as Record<string, any> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    await query('DELETE FROM test_results WHERE suite_id = $1', [id]);
    await query('DELETE FROM test_suites WHERE id = $1', [id]);

    res.json({ message: 'Test suite deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete test suite' });
  }
});

router.post('/suites/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM test_suites WHERE id = $1', [id])).rows[0] as Record<string, any> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    const suite = rowToSuite(row);
    const { baseUrl } = req.body;
    const testResults: TestResultItem[] = [];

    for (const interfaceId of suite.interfaceIds) {
      const iface = (await query('SELECT * FROM interfaces WHERE id = $1', [interfaceId])).rows[0] as Record<string, any> | undefined;

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

    const lastResult = failedCount === 0 ? 'passed' : (passedCount === 0 ? 'failed' : 'partial');

    await query(`
      INSERT INTO test_results (id, suite_id, total_tests, passed, failed, results, started_at, completed_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      resultId,
      id,
      totalTests,
      passedCount,
      failedCount,
      JSON.stringify(testResults),
      now,
      now,
      now,
    ]);

    await query(`
      UPDATE test_suites SET last_run_at = $1, last_result = $2, updated_at = $3 WHERE id = $4
    `, [now, lastResult, now, id]);

    const testResult: TestResult = {
      id: resultId,
      suiteId: id,
      timestamp: now,
      totalTests,
      passed: passedCount,
      failed: failedCount,
      results: testResults,
    };

    res.json(testResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to run test suite' });
  }
});

router.get('/suites/:id/results', async (req, res) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM test_suites WHERE id = $1', [id])).rows[0] as Record<string, any> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Test suite not found' });
    }

    const resultRows = (await query('SELECT * FROM test_results WHERE suite_id = $1 ORDER BY completed_at DESC', [id])).rows as Record<string, any>[];
    const suiteResults = resultRows.map(rowToResult);

    res.json(suiteResults);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test results' });
  }
});

router.get('/results/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM test_results WHERE id = $1', [id])).rows[0] as Record<string, any> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Test result not found' });
    }

    const result = rowToResult(row);
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

    const iface = (await query('SELECT * FROM interfaces WHERE id = $1', [interfaceId])).rows[0] as Record<string, any> | undefined;

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

    res.json(testResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to run quick test' });
  }
});

export default router;
