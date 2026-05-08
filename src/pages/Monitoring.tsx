import { useEffect, useState } from 'react';
import { Activity, Heart, AlertTriangle, Bell, BarChart3, Zap, Clock, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  version: string;
  checks: { name: string; status: 'up' | 'down'; latency: number }[];
}

interface MetricCard {
  label: string;
  value: number;
  unit: string;
  change?: number;
}

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  enabled: boolean;
}

interface RecentAlert {
  id: string;
  ruleName: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  triggeredAt: string;
  resolvedAt: string | null;
}

interface DashboardData {
  health: HealthStatus;
  metrics: MetricCard[];
  alertRules: AlertRule[];
  recentAlerts: RecentAlert[];
}

const healthConfig: Record<string, { label: string; color: string; icon: typeof Heart }> = {
  healthy: { label: '健康', color: 'text-green-600 dark:text-green-400', icon: Heart },
  degraded: { label: '降级', color: 'text-yellow-600 dark:text-yellow-400', icon: AlertTriangle },
  down: { label: '故障', color: 'text-red-600 dark:text-red-400', icon: XCircle },
};

const severityConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  critical: { label: '严重', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/20' },
  warning: { label: '警告', color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/20' },
  info: { label: '信息', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/20' },
};

export default function Monitoring() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const result = await api.get('/monitoring/dashboard');
      setData(result);
    } catch (error: any) {
      toast('error', error.message || '加载监控数据失败');
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

  const health = data?.health;
  const metrics = data?.metrics || [];
  const alertRules = data?.alertRules || [];
  const recentAlerts = data?.recentAlerts || [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Activity className="w-8 h-8" />
          监控面板
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          系统健康状态、指标和告警
        </p>
      </div>

      {health && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {(() => {
                const config = healthConfig[health.status] || healthConfig.healthy;
                const Icon = config.icon;
                return (
                  <div className={`p-3 rounded-full ${health.status === 'healthy' ? 'bg-green-100 dark:bg-green-900/20' : health.status === 'degraded' ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-red-100 dark:bg-red-900/20'}`}>
                    <Icon className={`w-8 h-8 ${config.color}`} />
                  </div>
                );
              })()}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  系统状态: {healthConfig[health.status]?.label || health.status}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  运行时间: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m · 版本: {health.version}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {health.checks.map((check) => (
                <div key={check.name} className="flex items-center gap-1 text-sm">
                  {check.status === 'up' ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="text-gray-600 dark:text-gray-400">{check.name}</span>
                  <span className="text-xs text-gray-400">{check.latency}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {metrics.map((metric, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
                <BarChart3 className="w-4 h-4" />
                {metric.label}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                </p>
                <span className="text-sm text-gray-400">{metric.unit}</span>
                {metric.change !== undefined && (
                  <span className={`text-xs ${metric.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {metric.change >= 0 ? '+' : ''}{metric.change}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5" />
            告警规则
          </h2>
          {alertRules.length > 0 ? (
            <div className="space-y-3">
              {alertRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{rule.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {rule.metric} {rule.condition} {rule.threshold}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    rule.enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {rule.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">暂无告警规则</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            最近告警
          </h2>
          {recentAlerts.length > 0 ? (
            <div className="space-y-3">
              {recentAlerts.map((alert) => {
                const sev = severityConfig[alert.severity] || severityConfig.info;
                return (
                  <div key={alert.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${sev.bgColor} ${sev.color}`}>
                        {sev.label}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{alert.ruleName}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {new Date(alert.triggeredAt).toLocaleString('zh-CN')}
                      {alert.resolvedAt && (
                        <span className="text-green-600 dark:text-green-400 ml-2">已恢复</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">暂无告警</p>
          )}
        </div>
      </div>
    </div>
  );
}
