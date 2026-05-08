import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Database, Link2, FileText, Clock, Settings,
  Plus, RefreshCw, Minus, Zap, BarChart3, Layers
} from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import api from '../services/api';

interface Stats {
  totalInterfaces: number;
  totalModels: number;
  totalMappings: number;
  totalParameters: number;
  totalMockConfigs: number;
  publishedInterfaces: number;
  draftInterfaces: number;
  deprecatedInterfaces: number;
  categoryStats: { category: string; count: number }[];
  methodStats: { method: string; count: number }[];
  recentChanges: any[];
  recentInterfaces: any[];
  recentLogs: any[];
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  published: { label: '已发布', color: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  draft: { label: '开发中', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  deprecated: { label: '已弃用', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400' },
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.get('/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">仪表盘</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          欢迎使用 Interface Hub 接口管理系统
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="总接口数"
          value={stats?.totalInterfaces || 0}
          icon={FileText}
          color="text-blue-600"
          bgColor="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          title="数据模型"
          value={stats?.totalModels || 0}
          icon={Database}
          color="text-green-600"
          bgColor="bg-green-50 dark:bg-green-900/20"
        />
        <StatCard
          title="字段映射"
          value={stats?.totalMappings || 0}
          icon={Link2}
          color="text-purple-600"
          bgColor="bg-purple-50 dark:bg-purple-900/20"
        />
        <StatCard
          title="活跃接口"
          value={stats?.publishedInterfaces || 0}
          icon={Activity}
          color="text-orange-600"
          bgColor="bg-orange-50 dark:bg-orange-900/20"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <Settings className="w-4 h-4" />
            请求参数
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {stats?.totalParameters || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <Zap className="w-4 h-4" />
            Mock 配置
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {stats?.totalMockConfigs || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <Layers className="w-4 h-4" />
            开发中
          </div>
          <p className="text-2xl font-bold text-yellow-600 mt-1">
            {stats?.draftInterfaces || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <BarChart3 className="w-4 h-4" />
            已弃用
          </div>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {stats?.deprecatedInterfaces || 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            接口状态分布
          </h2>
          <div className="space-y-4">
            {[
              { label: '已发布', value: stats?.publishedInterfaces || 0, color: 'bg-green-600' },
              { label: '开发中', value: stats?.draftInterfaces || 0, color: 'bg-yellow-600' },
              { label: '已弃用', value: stats?.deprecatedInterfaces || 0, color: 'bg-red-600' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400 text-sm">{item.label}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`${item.color} h-2 rounded-full transition-all duration-500`}
                      style={{
                        width: `${(item.value / (stats?.totalInterfaces || 1)) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="text-gray-900 dark:text-white font-medium text-sm w-8 text-right">
                    {item.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            请求方法分布
          </h2>
          {(stats?.methodStats?.length || 0) > 0 ? (
            <div className="space-y-3">
              {stats!.methodStats.map((item) => (
                <div key={item.method} className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[item.method] || 'bg-gray-100 text-gray-700'}`}>
                    {item.method}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${(item.count / (stats?.totalInterfaces || 1)) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-gray-900 dark:text-white font-medium text-sm w-8 text-right">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-sm">暂无数据</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            分类分布
          </h2>
          {(stats?.categoryStats?.length || 0) > 0 ? (
            <div className="space-y-3">
              {stats!.categoryStats.map((item) => (
                <div key={item.category} className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300 text-sm truncate max-w-[120px]">
                    {item.category}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${(item.count / (stats?.totalInterfaces || 1)) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-gray-900 dark:text-white font-medium text-sm w-8 text-right">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-sm">暂无分类数据</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              最近更新
            </h2>
            <Link to="/interfaces" className="text-sm text-blue-600 hover:text-blue-700">
              查看全部 →
            </Link>
          </div>
          {(stats?.recentInterfaces?.length || 0) > 0 ? (
            <div className="space-y-3">
              {stats!.recentInterfaces.map((iface) => (
                <Link
                  key={iface.id}
                  to={`/interfaces/${iface.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${methodColors[iface.method] || 'bg-gray-100 text-gray-700'}`}>
                      {iface.method}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {iface.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {iface.path}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {statusLabels[iface.status] && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusLabels[iface.status].color}`}>
                        {statusLabels[iface.status].label}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(iface.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">暂无接口</p>
              <Link
                to="/interfaces/new"
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                创建第一个接口 →
              </Link>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            变更动态
          </h2>
          {(stats?.recentChanges?.length || 0) > 0 ? (
            <div className="space-y-3">
              {stats!.recentChanges.slice(0, 8).map((change) => {
                const actionConfig: Record<string, { icon: any; color: string; label: string }> = {
                  create: { icon: Plus, color: 'text-green-600 bg-green-100 dark:bg-green-900/20', label: '创建' },
                  update: { icon: RefreshCw, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20', label: '更新' },
                  delete: { icon: Minus, color: 'text-red-600 bg-red-100 dark:bg-red-900/20', label: '删除' },
                };
                const config = actionConfig[change.action] || actionConfig.update;
                const Icon = config.icon;

                return (
                  <div key={change.id} className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-full shrink-0 ${config.color}`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{change.interface_name || '未知接口'}</span>
                        {change.field_name ? (
                          <span className="text-gray-500 dark:text-gray-400"> · {change.field_name}</span>
                        ) : (
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${config.color}`}>{config.label}</span>
                        )}
                      </p>
                      {change.action === 'update' && change.field_name && change.old_value && change.new_value && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          <span className="line-through">{change.old_value}</span>
                          {' → '}
                          <span>{change.new_value}</span>
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(change.created_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">暂无变更记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
