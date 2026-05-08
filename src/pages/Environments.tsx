import { useEffect, useState } from 'react';
import { Server, Plus, Trash2, GitCompare, CheckCircle, Circle, ArrowLeftRight } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface Environment {
  id: string;
  name: string;
  type: 'dev' | 'staging' | 'prod';
  baseUrl: string;
  description?: string;
  active: boolean;
  config?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const typeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  dev: { label: '开发', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/20' },
  staging: { label: '预发布', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/20' },
  prod: { label: '生产', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/20' },
};

export default function Environments() {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareResult, setCompareResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'dev' as 'dev' | 'staging' | 'prod',
    baseUrl: '',
    description: '',
  });

  useEffect(() => {
    loadEnvs();
  }, []);

  const loadEnvs = async () => {
    try {
      const data = await api.get('/environments');
      setEnvs(data);
    } catch (error: any) {
      toast('error', error.message || '加载环境数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEnv = async () => {
    if (!formData.name || !formData.baseUrl) {
      toast('error', '请填写名称和基础 URL');
      return;
    }
    try {
      await api.post('/environments', formData);
      toast('success', '环境添加成功');
      setShowForm(false);
      setFormData({ name: '', type: 'dev', baseUrl: '', description: '' });
      loadEnvs();
    } catch (error: any) {
      toast('error', error.message || '添加环境失败');
    }
  };

  const handleDeleteEnv = async (id: string) => {
    if (!confirm('确定要删除此环境吗？')) return;
    try {
      await api.delete(`/environments/${id}`);
      toast('success', '环境已删除');
      loadEnvs();
    } catch (error: any) {
      toast('error', error.message || '删除环境失败');
    }
  };

  const handleCompare = async () => {
    if (compareIds.length !== 2) {
      toast('error', '请选择两个环境进行比较');
      return;
    }
    try {
      const data = await api.post('/environments/compare', {
        sourceId: compareIds[0],
        targetId: compareIds[1],
      });
      setCompareResult(data);
      toast('success', '比较完成');
    } catch (error: any) {
      toast('error', error.message || '比较失败');
    }
  };

  const toggleCompareSelect = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
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
            <Server className="w-8 h-8" />
            环境管理
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理开发、预发布和生产环境配置
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCompareMode(!compareMode);
              setCompareIds([]);
              setCompareResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              compareMode
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <GitCompare className="w-5 h-5" />
            {compareMode ? '退出比较' : '环境比较'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            添加环境
          </button>
        </div>
      </div>

      {compareMode && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              选择两个环境进行比较（已选 {compareIds.length}/2）
            </p>
            <button
              onClick={handleCompare}
              disabled={compareIds.length !== 2}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" />
              开始比较
            </button>
          </div>
        </div>
      )}

      {compareResult && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            比较结果
          </h3>
          <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-800 dark:text-gray-200 overflow-x-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(compareResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {envs.map((env) => {
          const config = typeConfig[env.type] || typeConfig.dev;
          return (
            <div
              key={env.id}
              className={`bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border transition-colors ${
                compareMode && compareIds.includes(env.id)
                  ? 'border-purple-400 dark:border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800'
                  : 'border-gray-100 dark:border-gray-700'
              } ${compareMode ? 'cursor-pointer' : ''}`}
              onClick={() => compareMode && toggleCompareSelect(env.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                    {config.label}
                  </span>
                  {env.active && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      活跃
                    </span>
                  )}
                </div>
                {!compareMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEnv(env.id);
                    }}
                    className="text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {env.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 truncate">
                {env.baseUrl}
              </p>
              {env.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {env.description}
                </p>
              )}
              <div className="text-xs text-gray-400 mt-2">
                更新于 {new Date(env.updated_at).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>

      {envs.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <Server className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">暂无环境配置</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">添加环境</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="环境名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="dev">开发</option>
                  <option value="staging">预发布</option>
                  <option value="prod">生产</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">基础 URL *</label>
                <input
                  type="text"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="https://api.example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="环境描述..."
                />
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
                onClick={handleAddEnv}
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
