import { useState, useEffect } from 'react';
import { Activity, Search, RefreshCw, Copy, ChevronLeft, ChevronRight, X, Clock, AlertTriangle, CheckCircle, Filter } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface Trace {
  trace_id: string;
  request_path: string;
  method: string;
  status_code: number;
  span_count: number;
  total_duration: number;
  created_at: string;
}

interface Span {
  span_id: string;
  operation_name: string;
  start_time: string;
  duration: number;
  status_code: number;
  tags: Record<string, any>;
}

interface TraceDetail {
  trace_id: string;
  spans: Span[];
}

interface Stats {
  total_traces: number;
  avg_duration: number;
  error_rate: number;
  slowest_duration: number;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

function getStatusCodeColor(code: number): string {
  if (code >= 200 && code < 300) return 'text-green-600 dark:text-green-400';
  if (code >= 400 && code < 500) return 'text-yellow-600 dark:text-yellow-400';
  if (code >= 500) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
}

function getStatusCodeBg(code: number): string {
  if (code >= 200 && code < 300) return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';
  if (code >= 400 && code < 500) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
  if (code >= 500) return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400';
}

function getSpanBarColor(code: number): string {
  if (code >= 200 && code < 300) return 'bg-green-500';
  if (code >= 400 && code < 500) return 'bg-yellow-500';
  if (code >= 500) return 'bg-red-500';
  return 'bg-gray-500';
}

function truncateId(id: string): string {
  if (id.length <= 16) return id;
  return id.slice(0, 8) + '...' + id.slice(-4);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast('success', '已复制到剪贴板');
}

export default function Tracing() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_traces: 0,
    avg_duration: 0,
    error_rate: 0,
    slowest_duration: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  const [traceId, setTraceId] = useState('');
  const [method, setMethod] = useState('');
  const [statusCode, setStatusCode] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadTraces();
  }, [page]);

  const loadStats = async () => {
    try {
      const data = await api.get('/tracing/stats/summary');
      const slowest = data.slowestTraces || [];
      setStats({
        total_traces: data.totalTraces ?? 0,
        avg_duration: data.avgDuration ?? 0,
        error_rate: data.errorRate ?? 0,
        slowest_duration: slowest.length > 0 ? slowest[0].total_duration : 0,
      });
    } catch {
      toast('error', '加载统计数据失败');
    }
  };

  const loadTraces = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (traceId) params.set('trace_id', traceId);
      if (method) params.set('method', method);
      if (statusCode) params.set('status_code', statusCode);
      if (startTime) params.set('start_time', startTime);
      if (endTime) params.set('end_time', endTime);
      params.set('limit', limit.toString());
      params.set('offset', ((page - 1) * limit).toString());
      const data = await api.get(`/tracing?${params.toString()}`);
      const items = data.traces ?? data;
      setTraces(Array.isArray(items) ? items : []);
      setTotal(data.total ?? (Array.isArray(items) ? items.length : 0));
    } catch {
      toast('error', '加载追踪列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    loadTraces();
  };

  const handleReset = () => {
    setTraceId('');
    setMethod('');
    setStatusCode('');
    setStartTime('');
    setEndTime('');
    setPage(1);
  };

  const loadTraceDetail = async (traceIdParam: string) => {
    setDetailLoading(true);
    try {
      const data = await api.get(`/tracing/${traceIdParam}`);
      setSelectedTrace(data);
    } catch {
      toast('error', '加载追踪详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedTrace(null);
    setExpandedTags(new Set());
  };

  const toggleTags = (spanId: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const getWaterfallData = () => {
    if (!selectedTrace?.spans?.length) return [];
    const spans = [...selectedTrace.spans].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const traceStart = new Date(spans[0].start_time).getTime();
    const traceEnd = spans.reduce((max, s) => {
      const end = new Date(s.start_time).getTime() + s.duration;
      return end > max ? end : max;
    }, traceStart);
    const totalDuration = traceEnd - traceStart || 1;
    return spans.map((span) => {
      const start = new Date(span.start_time).getTime();
      const leftPercent = ((start - traceStart) / totalDuration) * 100;
      const widthPercent = Math.max((span.duration / totalDuration) * 100, 0.5);
      return { ...span, leftPercent, widthPercent };
    });
  };

  if (loading && traces.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">全链路追踪</h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          请求全链路追踪与性能分析
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">总追踪数</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">{stats.total_traces}</p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-full">
              <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">平均耗时</p>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">{stats.avg_duration}<span className="text-base font-normal ml-1">ms</span></p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-full">
              <Clock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">错误率</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{stats.error_rate}<span className="text-base font-normal ml-1">%</span></p>
            </div>
            <div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">最慢追踪</p>
              <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-2">{stats.slowest_duration}<span className="text-base font-normal ml-1">ms</span></p>
            </div>
            <div className="bg-orange-100 dark:bg-orange-900/20 p-4 rounded-full">
              <CheckCircle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">筛选条件</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Trace ID"
              value={traceId}
              onChange={(e) => setTraceId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">ALL 方法</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <select
            value={statusCode}
            onChange={(e) => setStatusCode(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">ALL 状态码</option>
            <option value="2xx">2xx</option>
            <option value="4xx">4xx</option>
            <option value="5xx">5xx</option>
          </select>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              搜索
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" />
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Trace ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">请求路径</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">方法</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">状态码</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Span数</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">总耗时</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">创建时间</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {traces.map((trace) => (
                <tr key={trace.trace_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-gray-600 dark:text-gray-400 font-mono">{truncateId(trace.trace_id)}</code>
                      <button
                        onClick={() => copyToClipboard(trace.trace_id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm text-gray-600 dark:text-gray-400">{trace.request_path}</code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${methodColors[trace.method] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'}`}>
                      {trace.method}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusCodeBg(trace.status_code)}`}>
                      {trace.status_code}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{trace.span_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${getStatusCodeColor(trace.status_code)}`}>
                      {trace.total_duration} ms
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {new Date(trace.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => loadTraceDetail(trace.trace_id)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {traces.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">暂无追踪数据</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">第 {page} 页，共 {totalPages} 页（{total} 条）</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedTrace && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetail} />
          <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">追踪详情</h2>
              <button onClick={closeDetail} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Trace ID</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-gray-900 dark:text-white break-all">{selectedTrace.trace_id}</code>
                  <button
                    onClick={() => copyToClipboard(selectedTrace.trace_id)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selectedTrace.spans && selectedTrace.spans.length > 0 && (
                <>
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">时间线</h3>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto">
                      {getWaterfallData().map((span) => (
                        <div key={span.span_id} className="flex items-center gap-3 mb-2 min-w-[500px]">
                          <div className="w-40 shrink-0 text-xs text-gray-600 dark:text-gray-400 truncate" title={span.operation_name}>
                            {span.operation_name}
                          </div>
                          <div className="flex-1 relative h-6 bg-gray-200 dark:bg-gray-700 rounded">
                            <div
                              className={`absolute top-0 h-full rounded ${getSpanBarColor(span.status_code)} opacity-80`}
                              style={{ left: `${span.leftPercent}%`, width: `${span.widthPercent}%` }}
                              title={`${span.operation_name}: ${span.duration}ms`}
                            />
                          </div>
                          <div className="w-20 shrink-0 text-xs text-right text-gray-500 dark:text-gray-400">
                            {span.duration}ms
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Span 列表</h3>
                    <div className="space-y-3">
                      {selectedTrace.spans.map((span) => (
                        <div key={span.span_id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div
                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => toggleTags(span.span_id)}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusCodeBg(span.status_code)}`}>
                                {span.status_code}
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{span.operation_name}</span>
                            </div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{span.duration} ms</span>
                          </div>
                          {expandedTags.has(span.span_id) && (
                            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Tags</p>
                              <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(span.tags, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {detailLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
