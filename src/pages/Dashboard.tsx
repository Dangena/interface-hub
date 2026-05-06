import { useEffect, useState } from 'react';
import { Activity, Database, Link2, FileText, Clock } from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import api from '../services/api';

interface Stats {
  totalInterfaces: number;
  totalModels: number;
  totalMappings: number;
  publishedInterfaces: number;
  draftInterfaces: number;
  deprecatedInterfaces: number;
  recentLogs: any[];
}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            接口状态分布
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">已发布</span>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{
                      width: `${((stats?.publishedInterfaces || 0) / (stats?.totalInterfaces || 1)) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-gray-900 dark:text-white font-medium">
                  {stats?.publishedInterfaces || 0}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">开发中</span>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-yellow-600 h-2 rounded-full"
                    style={{
                      width: `${((stats?.draftInterfaces || 0) / (stats?.totalInterfaces || 1)) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-gray-900 dark:text-white font-medium">
                  {stats?.draftInterfaces || 0}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">已弃用</span>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-red-600 h-2 rounded-full"
                    style={{
                      width: `${((stats?.deprecatedInterfaces || 0) / (stats?.totalInterfaces || 1)) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-gray-900 dark:text-white font-medium">
                  {stats?.deprecatedInterfaces || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            近期活动
          </h2>
          {stats?.recentLogs && stats.recentLogs.length > 0 ? (
            <div className="space-y-4">
              {stats.recentLogs.slice(0, 5).map((log, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-full">
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-white">
                      {log.method} {log.path}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      log.status_code >= 200 && log.status_code < 300
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    }`}
                  >
                    {log.status_code}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              暂无活动记录
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
