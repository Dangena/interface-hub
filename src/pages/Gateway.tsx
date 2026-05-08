import { useEffect, useState } from 'react';
import { Network, Plus, Trash2, Activity, Globe, Zap, BarChart3, ArrowRight } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface Route {
  id: string;
  name: string;
  path: string;
  target: string;
  methods: string[];
  enabled?: boolean;
  created_at: string;
}

interface RouteStats {
  totalRoutes: number;
  activeRoutes: number;
  totalRequests: number;
  avgLatency: number;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

export default function Gateway() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stats, setStats] = useState<RouteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    target: '',
    methods: ['GET'] as string[],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [routesData, statsData] = await Promise.all([
        api.get('/gateway/routes'),
        api.get('/gateway/stats').catch(() => null),
      ]);
      setRoutes(routesData);
      setStats(statsData);
    } catch (error: any) {
      toast('error', error.message || '加载网关数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoute = async () => {
    if (!formData.name || !formData.path || !formData.target) {
      toast('error', '请填写所有必填字段');
      return;
    }
    try {
      await api.post('/gateway/routes', formData);
      toast('success', '路由添加成功');
      setShowForm(false);
      setFormData({ name: '', path: '', target: '', methods: ['GET'] });
      loadData();
    } catch (error: any) {
      toast('error', error.message || '添加路由失败');
    }
  };

  const handleDeleteRoute = async (id: string) => {
    if (!confirm('确定要删除此路由吗？')) return;
    try {
      await api.delete(`/gateway/routes/${id}`);
      toast('success', '路由已删除');
      loadData();
    } catch (error: any) {
      toast('error', error.message || '删除路由失败');
    }
  };

  const toggleMethod = (method: string) => {
    setFormData((prev) => ({
      ...prev,
      methods: prev.methods.includes(method)
        ? prev.methods.filter((m) => m !== method)
        : [...prev.methods, method],
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
            <Network className="w-8 h-8" />
            API 网关
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理路由规则和流量转发
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          添加路由
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Network className="w-4 h-4" />
              总路由数
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalRoutes}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Activity className="w-4 h-4" />
              活跃路由
            </div>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.activeRoutes}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Zap className="w-4 h-4" />
              总请求数
            </div>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.totalRequests}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <BarChart3 className="w-4 h-4" />
              平均延迟
            </div>
            <p className="text-2xl font-bold text-orange-600 mt-1">{stats.avgLatency}ms</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {routes.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">路径</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">方法</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">目标</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {routes.map((route) => (
                <tr key={route.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {route.name}
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-gray-600 dark:text-gray-400">{route.path}</code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 flex-wrap">
                      {route.methods.map((m) => (
                        <span key={m} className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[m] || 'bg-gray-100 text-gray-700'}`}>
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                      <ArrowRight className="w-4 h-4" />
                      <code>{route.target}</code>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteRoute(route.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400"
                      title="删除"
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
            <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">暂无路由配置</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">添加路由</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="路由名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">路径 *</label>
                <input
                  type="text"
                  value={formData.path}
                  onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="/api/example"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">目标地址 *</label>
                <input
                  type="text"
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="http://backend:3000/api"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">方法</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMethod(m)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        formData.methods.includes(m)
                          ? methodColors[m]
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {m}
                    </button>
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
                onClick={handleAddRoute}
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
