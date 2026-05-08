import { useEffect, useState } from 'react';
import { Shield, Plus, Trash2, BarChart3, Clock, Zap, Gauge } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface RateLimitRule {
  id: string;
  name: string;
  path: string;
  method: string;
  limit: number;
  window: number;
  strategy: 'fixed-window' | 'sliding-window' | 'token-bucket';
  enabled?: boolean;
  created_at: string;
}

interface UsageStat {
  path: string;
  current: number;
  limit: number;
  window: number;
  remaining: number;
}

const strategyLabels: Record<string, { label: string; color: string }> = {
  'fixed-window': { label: '固定窗口', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  'sliding-window': { label: '滑动窗口', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
  'token-bucket': { label: '令牌桶', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
};

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  '*': 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
};

export default function RateLimit() {
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  const [usage, setUsage] = useState<UsageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    method: '*',
    limit: 100,
    window: 60,
    strategy: 'fixed-window' as 'fixed-window' | 'sliding-window' | 'token-bucket',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rulesData, usageData] = await Promise.all([
        api.get('/rate-limit/rules'),
        api.get('/rate-limit/usage').catch(() => []),
      ]);
      setRules(rulesData);
      setUsage(usageData);
    } catch (error: any) {
      toast('error', error.message || '加载限流数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!formData.name || !formData.path) {
      toast('error', '请填写名称和路径');
      return;
    }
    try {
      await api.post('/rate-limit/rules', formData);
      toast('success', '限流规则添加成功');
      setShowForm(false);
      setFormData({ name: '', path: '', method: '*', limit: 100, window: 60, strategy: 'fixed-window' });
      loadData();
    } catch (error: any) {
      toast('error', error.message || '添加规则失败');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('确定要删除此规则吗？')) return;
    try {
      await api.delete(`/rate-limit/rules/${id}`);
      toast('success', '规则已删除');
      loadData();
    } catch (error: any) {
      toast('error', error.message || '删除规则失败');
    }
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
            <Shield className="w-8 h-8" />
            限流管理
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            配置 API 限流策略，保护服务稳定性
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          添加规则
        </button>
      </div>

      {usage.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            当前用量
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {usage.map((stat, idx) => {
              const pct = Math.min((stat.current / stat.limit) * 100, 100);
              const color = pct > 80 ? 'bg-red-600' : pct > 50 ? 'bg-yellow-600' : 'bg-green-600';
              return (
                <div key={idx} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-sm text-gray-900 dark:text-white">{stat.path}</code>
                    <span className="text-xs text-gray-400">{stat.remaining} 剩余</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                    <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{stat.current} / {stat.limit}</span>
                    <span>{stat.window}s 窗口</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {rules.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">路径</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">方法</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">限制</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">策略</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{rule.name}</td>
                  <td className="px-6 py-4"><code className="text-sm text-gray-600 dark:text-gray-400">{rule.path}</code></td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[rule.method] || methodColors['*']}`}>
                      {rule.method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Zap className="w-4 h-4" />
                      {rule.limit} 次 / {rule.window}s
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${strategyLabels[rule.strategy]?.color || ''}`}>
                      {strategyLabels[rule.strategy]?.label || rule.strategy}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">暂无限流规则</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">添加限流规则</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="规则名称"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">路径 *</label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="/api/*"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">方法</label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="*">所有 (*)</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">限制次数</label>
                  <input
                    type="number"
                    value={formData.limit}
                    onChange={(e) => setFormData({ ...formData, limit: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">窗口 (秒)</label>
                  <input
                    type="number"
                    value={formData.window}
                    onChange={(e) => setFormData({ ...formData, window: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">策略</label>
                <select
                  value={formData.strategy}
                  onChange={(e) => setFormData({ ...formData, strategy: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="fixed-window">固定窗口</option>
                  <option value="sliding-window">滑动窗口</option>
                  <option value="token-bucket">令牌桶</option>
                </select>
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
                onClick={handleAddRule}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
