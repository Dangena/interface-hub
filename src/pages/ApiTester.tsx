import { useState, useEffect } from 'react';
import { Play, Clock, Copy, RotateCcw, CheckCircle, XCircle, ListChecks, Zap } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface HistoryItem {
  id: string;
  method: string;
  url: string;
  timestamp: string;
  status: number;
  time: number;
}

interface BatchResult {
  id: string;
  name: string;
  method: string;
  path: string;
  status: number | null;
  time: number;
  success: boolean;
  error?: string;
}

export default function ApiTester() {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('[\n  {\n    "key": "Content-Type",\n    "value": "application/json"\n  }\n]');
  const [body, setBody] = useState('{\n  \n}');
  const [response, setResponse] = useState<any>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('headers');
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [selectedInterfaceIds, setSelectedInterfaceIds] = useState<Set<string>>(new Set());
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:3001');

  useEffect(() => {
    if (mode === 'batch') {
      loadInterfaces();
    }
  }, [mode]);

  const loadInterfaces = async () => {
    try {
      const data = await api.get('/interfaces');
      setInterfaces(data.data || data);
    } catch (error) {
      console.error('Failed to load interfaces:', error);
    }
  };

  const sendRequest = async () => {
    if (!url) {
      toast('error', '请输入URL');
      return;
    }

    setLoading(true);
    const startTime = Date.now();

    try {
      let parsedHeaders: Record<string, string> = {};
      try {
        const headerArray = JSON.parse(headers);
        headerArray.forEach((h: any) => {
          parsedHeaders[h.key] = h.value;
        });
      } catch (e) {
        parsedHeaders = {};
      }

      const token = localStorage.getItem('token');
      if (token && !parsedHeaders['Authorization']) {
        parsedHeaders['Authorization'] = `Bearer ${token}`;
      }

      const options: RequestInit = {
        method,
        headers: parsedHeaders,
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
        options.body = body;
      }

      const res = await fetch(url, options);
      const endTime = Date.now();
      const time = endTime - startTime;
      setResponseTime(time);

      let data;
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        data,
      });

      setHistory((prev) => [
        {
          id: Date.now().toString(),
          method,
          url,
          timestamp: new Date().toLocaleString(),
          status: res.status,
          time,
        },
        ...prev.slice(0, 19),
      ]);
    } catch (error: any) {
      const endTime = Date.now();
      setResponseTime(endTime - startTime);
      setResponse({
        error: true,
        message: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const runBatchTest = async () => {
    const selected = interfaces.filter((i) => selectedInterfaceIds.has(i.id));
    if (selected.length === 0) {
      toast('error', '请选择要测试的接口');
      return;
    }

    setBatchRunning(true);
    setBatchResults([]);
    const results: BatchResult[] = [];

    const token = localStorage.getItem('token');

    for (const iface of selected) {
      const startTime = Date.now();
      try {
        const fullUrl = `${baseUrl}${iface.path}`;
        const options: RequestInit = {
          method: iface.method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        };

        const res = await fetch(fullUrl, options);
        const time = Date.now() - startTime;

        results.push({
          id: iface.id,
          name: iface.name,
          method: iface.method,
          path: iface.path,
          status: res.status,
          time,
          success: res.status >= 200 && res.status < 400,
        });
      } catch (error: any) {
        results.push({
          id: iface.id,
          name: iface.name,
          method: iface.method,
          path: iface.path,
          status: null,
          time: Date.now() - startTime,
          success: false,
          error: error.message,
        });
      }

      setBatchResults([...results]);
    }

    setBatchRunning(false);
    const passed = results.filter((r) => r.success).length;
    toast('success', `批量测试完成：${passed}/${results.length} 通过`);
  };

  const copyResponse = () => {
    if (response?.data) {
      navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      toast('success', '已复制到剪贴板');
    }
  };

  const clearAll = () => {
    setUrl('');
    setHeaders('[\n  {\n    "key": "Content-Type",\n    "value": "application/json"\n  }\n]');
    setBody('{\n  \n}');
    setResponse(null);
    setResponseTime(null);
  };

  const toggleInterface = (id: string) => {
    setSelectedInterfaceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const methodColors: Record<string, string> = {
    GET: 'bg-green-600',
    POST: 'bg-blue-600',
    PUT: 'bg-yellow-600',
    DELETE: 'bg-red-600',
    PATCH: 'bg-purple-600',
  };

  const methodBgColors: Record<string, string> = {
    GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">接口测试</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            发送HTTP请求测试接口，支持批量测试
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'single'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Play className="w-4 h-4 inline mr-1" />
            单个测试
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'batch'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <ListChecks className="w-4 h-4 inline mr-1" />
            批量测试
          </button>
        </div>
      </div>

      {mode === 'single' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex gap-4 mb-4">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className={`px-4 py-2 rounded-lg text-white font-medium ${methodColors[method]}`}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>

                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="输入请求URL，例如：http://localhost:3001/api/interfaces"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />

                <button
                  onClick={sendRequest}
                  disabled={loading}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Play className="w-5 h-5" />
                  {loading ? '发送中...' : '发送'}
                </button>

                <button
                  onClick={clearAll}
                  className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  title="清空"
                >
                  <RotateCcw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
                <nav className="flex space-x-4">
                  {(['headers', 'body'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-2 px-4 text-sm font-medium ${
                        activeTab === tab
                          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab === 'headers' ? '请求头' : '请求体'}
                    </button>
                  ))}
                </nav>
              </div>

              {activeTab === 'headers' && (
                <textarea
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder='[{"key": "Authorization", "value": "Bearer token"}]'
                />
              )}

              {activeTab === 'body' && (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder='{"key": "value"}'
                />
              )}
            </div>

            {response && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">响应结果</h3>
                  <div className="flex items-center gap-4">
                    {responseTime !== null && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {responseTime}ms
                      </div>
                    )}
                    {response?.data && (
                      <button
                        onClick={copyResponse}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Copy className="w-4 h-4" />
                        复制
                      </button>
                    )}
                  </div>
                </div>

                {response.error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{response.message}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <span
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          response.status >= 200 && response.status < 300
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                      >
                        {response.status} {response.statusText}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">响应数据</h4>
                      <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm max-h-96">
                        <code className="text-gray-800 dark:text-gray-200">
                          {typeof response.data === 'string'
                            ? response.data
                            : JSON.stringify(response.data, null, 2)}
                        </code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">请求历史</h3>
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setMethod(item.method);
                      setUrl(item.url);
                    }}
                    className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${methodColors[item.method]}`}>
                        {item.method}
                      </span>
                      <span className={`text-xs ${item.status >= 200 && item.status < 300 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-500">{item.time}ms</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{item.url}</p>
                    <p className="text-xs text-gray-400 mt-1">{item.timestamp}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">暂无请求历史</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">基础 URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="http://localhost:3001"
                />
              </div>
              <div className="pt-6">
                <button
                  onClick={runBatchTest}
                  disabled={batchRunning || selectedInterfaceIds.size === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Zap className="w-5 h-5" />
                  {batchRunning ? '测试中...' : `运行测试 (${selectedInterfaceIds.size})`}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                共 {interfaces.length} 个接口，已选 {selectedInterfaceIds.size} 个
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedInterfaceIds(new Set(interfaces.map((i) => i.id)))}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
                <button
                  onClick={() => setSelectedInterfaceIds(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {interfaces.map((iface) => (
                <label
                  key={iface.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedInterfaceIds.has(iface.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedInterfaceIds.has(iface.id)}
                    onChange={() => toggleInterface(iface.id)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodBgColors[iface.method] || 'bg-gray-100 text-gray-700'}`}>
                    {iface.method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{iface.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{iface.path}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {batchResults.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">测试结果</h3>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    {batchResults.filter((r) => r.success).length} 通过
                  </span>
                  <span className="flex items-center gap-1 text-sm text-red-600">
                    <XCircle className="w-4 h-4" />
                    {batchResults.filter((r) => !r.success).length} 失败
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {batchResults.map((result) => (
                  <div
                    key={result.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      result.success
                        ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                        : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodBgColors[result.method] || 'bg-gray-100 text-gray-700'}`}>
                        {result.method}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{result.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{result.path}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {result.status && (
                        <span className={`text-sm font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                          {result.status}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">{result.time}ms</span>
                      {result.error && (
                        <span className="text-xs text-red-500 truncate max-w-48">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
