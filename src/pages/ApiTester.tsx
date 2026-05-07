import { useState } from 'react';
import { Play, Clock, Copy, RotateCcw } from 'lucide-react';

interface HistoryItem {
  id: string;
  method: string;
  url: string;
  timestamp: string;
  status: number;
  time: number;
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

  const sendRequest = async () => {
    if (!url) {
      alert('请输入URL');
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
        ...prev.slice(0, 9),
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

  const copyResponse = () => {
    if (response?.data) {
      navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      alert('已复制到剪贴板');
    }
  };

  const clearAll = () => {
    setUrl('');
    setHeaders('[\n  {\n    "key": "Content-Type",\n    "value": "application/json"\n  }\n]');
    setBody('{\n  \n}');
    setResponse(null);
    setResponseTime(null);
  };

  const methodColors: Record<string, string> = {
    GET: 'bg-green-600',
    POST: 'bg-blue-600',
    PUT: 'bg-yellow-600',
    DELETE: 'bg-red-600',
    PATCH: 'bg-purple-600',
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">接口测试</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          发送HTTP请求，测试接口响应
        </p>
      </div>

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
                    <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm">
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
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium text-white ${
                        methodColors[item.method]
                      }`}
                    >
                      {item.method}
                    </span>
                    <span
                      className={`text-xs ${
                        item.status >= 200 && item.status < 300
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
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
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              暂无请求历史
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
