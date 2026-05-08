import { useEffect, useState } from 'react';
import { TestTube2, Plus, Play, Trash2, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface TestCase {
  name: string;
  interfaceId?: string;
  method: string;
  path: string;
  expectedStatus: number;
  headers?: Record<string, string>;
  body?: any;
}

interface TestSuite {
  id: string;
  name: string;
  description?: string;
  cases: TestCase[];
  created_at: string;
  updated_at: string;
}

interface TestResult {
  caseName: string;
  passed: boolean;
  status?: number;
  duration: number;
  error?: string;
}

interface SuiteRunResult {
  suiteId: string;
  results: TestResult[];
  passed: number;
  failed: number;
  totalDuration: number;
  runAt: string;
}

export default function TestSuite() {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SuiteRunResult>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cases: [{ name: '', method: 'GET', path: '', expectedStatus: 200 }] as TestCase[],
  });

  useEffect(() => {
    loadSuites();
  }, []);

  const loadSuites = async () => {
    try {
      const data = await api.get('/test-suite/suites');
      setSuites(data);
    } catch (error: any) {
      toast('error', error.message || '加载测试套件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuite = async () => {
    if (!formData.name) {
      toast('error', '请填写套件名称');
      return;
    }
    try {
      await api.post('/test-suite/suites', {
        name: formData.name,
        description: formData.description,
        cases: formData.cases.filter((c) => c.name && c.path),
      });
      toast('success', '测试套件创建成功');
      setShowForm(false);
      setFormData({ name: '', description: '', cases: [{ name: '', method: 'GET', path: '', expectedStatus: 200 }] });
      loadSuites();
    } catch (error: any) {
      toast('error', error.message || '创建套件失败');
    }
  };

  const handleRunSuite = async (id: string) => {
    setRunningSuiteId(id);
    try {
      const data = await api.post(`/test-suite/suites/${id}/run`);
      setResults((prev) => ({ ...prev, [id]: data }));
      toast('success', '测试运行完成');
    } catch (error: any) {
      toast('error', error.message || '运行测试失败');
    } finally {
      setRunningSuiteId(null);
    }
  };

  const handleDeleteSuite = async (id: string) => {
    if (!confirm('确定要删除此测试套件吗？')) return;
    try {
      await api.delete(`/test-suite/suites/${id}`);
      toast('success', '套件已删除');
      loadSuites();
    } catch (error: any) {
      toast('error', error.message || '删除套件失败');
    }
  };

  const addCase = () => {
    setFormData((prev) => ({
      ...prev,
      cases: [...prev.cases, { name: '', method: 'GET', path: '', expectedStatus: 200 }],
    }));
  };

  const removeCase = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      cases: prev.cases.filter((_, i) => i !== idx),
    }));
  };

  const updateCase = (idx: number, field: keyof TestCase, value: any) => {
    setFormData((prev) => ({
      ...prev,
      cases: prev.cases.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <TestTube2 className="w-8 h-8" />
            测试套件
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理和运行接口测试用例
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建套件
        </button>
      </div>

      <div className="space-y-4">
        {suites.map((suite) => {
          const result = results[suite.id];
          return (
            <div key={suite.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{suite.name}</h3>
                  {suite.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{suite.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunSuite(suite.id)}
                    disabled={runningSuiteId === suite.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {runningSuiteId === suite.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    {runningSuiteId === suite.id ? '运行中...' : '运行'}
                  </button>
                  <button
                    onClick={() => handleDeleteSuite(suite.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {suite.cases.length} 个用例
              </div>

              {result && (
                <div className="mb-4">
                  <div className="flex items-center gap-4 mb-3">
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" /> {result.passed} 通过
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="w-4 h-4" /> {result.failed} 失败
                    </span>
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="w-4 h-4" /> {result.totalDuration}ms
                    </span>
                  </div>
                  <div className="space-y-1">
                    {result.results.map((r, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 p-2 rounded text-sm ${
                          r.passed
                            ? 'bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400'
                            : 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400'
                        }`}
                      >
                        {r.passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        <span className="font-medium">{r.caseName}</span>
                        {r.status && <span className="text-xs ml-2">HTTP {r.status}</span>}
                        <span className="text-xs ml-auto">{r.duration}ms</span>
                        {r.error && <span className="text-xs text-red-500 ml-2">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {suite.cases.map((tc, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      tc.method === 'GET' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                      tc.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                    }`}>
                      {tc.method}
                    </span>
                    <code className="text-xs">{tc.path}</code>
                    <span className="ml-auto text-xs">{tc.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {suites.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <TestTube2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">暂无测试套件</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">创建测试套件</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="套件名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">测试用例</label>
                  <button onClick={addCase} className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1">
                    <Plus className="w-4 h-4" /> 添加用例
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.cases.map((tc, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={tc.name}
                          onChange={(e) => updateCase(idx, 'name', e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="用例名称"
                        />
                        <button onClick={() => removeCase(idx)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={tc.method}
                          onChange={(e) => updateCase(idx, 'method', e.target.value)}
                          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="DELETE">DELETE</option>
                          <option value="PATCH">PATCH</option>
                        </select>
                        <input
                          type="text"
                          value={tc.path}
                          onChange={(e) => updateCase(idx, 'path', e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                          placeholder="/api/path"
                        />
                        <input
                          type="number"
                          value={tc.expectedStatus}
                          onChange={(e) => updateCase(idx, 'expectedStatus', parseInt(e.target.value) || 200)}
                          className="w-20 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleCreateSuite}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
