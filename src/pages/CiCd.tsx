import { useState, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  Play,
  Trash2,
  Copy,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Code2,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface CiCdConfig {
  id: string;
  name: string;
  type: 'github-actions' | 'jenkins' | 'gitlab-ci';
  config: string;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PipelineRun {
  id: string;
  config_id: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  trigger_type: string;
  trigger_data: string | null;
  started_at: string;
  finished_at: string | null;
  result: string | null;
  created_at: string;
}

interface ModifiedInterface {
  id: string;
  name: string;
  path: string;
  method: string;
  diffs: {
    field: string;
    old_value: string;
    new_value: string;
    changed_at: string;
  }[];
  detected_at: string;
}

interface NewInterface {
  id: string;
  name: string;
  path: string;
  method: string;
  detected_at: string;
}

interface DeletedInterface {
  id: string;
  name: string;
  detected_at: string;
}

interface ChangeResult {
  since: string;
  new: NewInterface[];
  modified: ModifiedInterface[];
  deleted: DeletedInterface[];
}

const typeBadgeColors: Record<string, string> = {
  'github-actions': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  jenkins: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'gitlab-ci': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const typeLabels: Record<string, string> = {
  'github-actions': 'GitHub Actions',
  jenkins: 'Jenkins',
  'gitlab-ci': 'GitLab CI',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  running: RefreshCw,
  success: CheckCircle,
  failed: XCircle,
};

export default function CiCd() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'changes'>('pipeline');
  const [configs, setConfigs] = useState<CiCdConfig[]>([]);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CiCdConfig | null>(null);
  const [generatedConfig, setGeneratedConfig] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const [generateForm, setGenerateForm] = useState({
    type: 'github-actions' as 'github-actions' | 'jenkins' | 'gitlab-ci',
    baseUrl: 'http://localhost:3001',
  });

  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'github-actions' as 'github-actions' | 'jenkins' | 'gitlab-ci',
    config: '',
  });

  const [sinceTimestamp, setSinceTimestamp] = useState('');
  const [changeResult, setChangeResult] = useState<ChangeResult | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const local = new Date(twentyFourHoursAgo.getTime() - twentyFourHoursAgo.getTimezoneOffset() * 60000);
    setSinceTimestamp(local.toISOString().slice(0, 16));
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configsData, runsData] = await Promise.all([
        api.get('/cicd/configs'),
        api.get('/cicd/runs'),
      ]);
      setConfigs(configsData);
      setRuns(runsData);
    } catch (error) {
      toast('error', '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateConfig = async () => {
    setGenerating(true);
    try {
      const data = await api.post('/cicd/generate-config', {
        type: generateForm.type,
        baseUrl: generateForm.baseUrl,
      });
      setGeneratedConfig(data.config);
      toast('success', '配置生成成功');
    } catch (error: any) {
      toast('error', error.message || '生成配置失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyConfig = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', '已复制到剪贴板');
  };

  const handleCreateConfig = async () => {
    if (!createForm.name || !createForm.config) {
      toast('error', '请填写名称和配置内容');
      return;
    }
    try {
      await api.post('/cicd/configs', {
        name: createForm.name,
        type: createForm.type,
        config: createForm.config,
      });
      toast('success', '配置创建成功');
      setShowCreateDialog(false);
      setCreateForm({ name: '', type: 'github-actions', config: '' });
      loadData();
    } catch (error: any) {
      toast('error', error.message || '创建配置失败');
    }
  };

  const handleUpdateConfig = async () => {
    if (!editingConfig) return;
    try {
      await api.put(`/cicd/configs/${editingConfig.id}`, {
        name: createForm.name,
        type: createForm.type,
        config: createForm.config,
      });
      toast('success', '配置更新成功');
      setShowEditDialog(false);
      setEditingConfig(null);
      setCreateForm({ name: '', type: 'github-actions', config: '' });
      loadData();
    } catch (error: any) {
      toast('error', error.message || '更新配置失败');
    }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!confirm('确定要删除此配置吗？')) return;
    try {
      await api.delete(`/cicd/configs/${id}`);
      toast('success', '配置已删除');
      loadData();
    } catch (error: any) {
      toast('error', error.message || '删除配置失败');
    }
  };

  const handleToggleConfig = async (config: CiCdConfig) => {
    try {
      await api.put(`/cicd/configs/${config.id}`, {
        ...config,
        enabled: !config.enabled,
      });
      toast('success', config.enabled ? '已禁用' : '已启用');
      loadData();
    } catch (error: any) {
      toast('error', error.message || '操作失败');
    }
  };

  const handleStartEdit = (config: CiCdConfig) => {
    setEditingConfig(config);
    setCreateForm({
      name: config.name,
      type: config.type,
      config: config.config,
    });
    setShowEditDialog(true);
  };

  const handleTriggerRun = async (configId: string) => {
    try {
      await api.post('/cicd/runs', {
        configId,
        triggerType: 'manual',
      });
      toast('success', '流水线已触发');
      loadData();
    } catch (error: any) {
      toast('error', error.message || '触发流水线失败');
    }
  };

  const handleDetectChanges = async () => {
    if (!sinceTimestamp) {
      toast('error', '请选择检测起始时间');
      return;
    }
    setDetecting(true);
    try {
      const since = new Date(sinceTimestamp).toISOString();
      const data = await api.get(`/cicd/changes?since=${encodeURIComponent(since)}`);
      setChangeResult(data);
      toast('success', '变更检测完成');
    } catch (error: any) {
      toast('error', error.message || '变更检测失败');
    } finally {
      setDetecting(false);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('zh-CN');
  };

  const getDuration = (start: string, end: string | null) => {
    if (!end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getConfigName = (configId: string) => {
    const config = configs.find((c) => c.id === configId);
    return config?.name || configId.slice(0, 8);
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <GitBranch className="w-8 h-8" />
          CI/CD 集成
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          管理流水线配置，检测接口变更
        </p>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'pipeline'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          流水线配置
        </button>
        <button
          onClick={() => setActiveTab('changes')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'changes'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          变更检测
        </button>
      </div>

      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setGenerateForm({ type: 'github-actions', baseUrl: 'http://localhost:3001' });
                setGeneratedConfig('');
                setShowGenerateDialog(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Code2 className="w-4 h-4" />
              生成配置
            </button>
            <button
              onClick={() => {
                setCreateForm({ name: '', type: 'github-actions', config: '' });
                setShowCreateDialog(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建配置
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              配置列表
            </h2>
            {configs.length > 0 ? (
              <div className="space-y-3">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {config.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            typeBadgeColors[config.type]
                          }`}
                        >
                          {typeLabels[config.type]}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            config.enabled
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          }`}
                        >
                          {config.enabled ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleConfig(config)}
                          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                          title={config.enabled ? '禁用' : '启用'}
                        >
                          {config.enabled ? (
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleStartEdit(config)}
                          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleTriggerRun(config.id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          title="触发运行"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(config.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      上次运行: {formatTime(config.last_run_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <GitBranch className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">暂无流水线配置</p>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Play className="w-5 h-5" />
              流水线运行记录
            </h2>
            {runs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        配置名称
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        状态
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        触发方式
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        开始时间
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        耗时
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        结果
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {runs.map((run) => {
                      const StatusIcon = statusIcons[run.status] || Clock;
                      return (
                        <tr
                          key={run.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                            {run.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {getConfigName(run.config_id)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                statusColors[run.status]
                              }`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {statusLabels[run.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {run.trigger_type}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatTime(run.started_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {getDuration(run.started_at, run.finished_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {run.result || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">暂无运行记录</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'changes' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              变更检测
            </h2>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  检测起始时间
                </label>
                <input
                  type="datetime-local"
                  value={sinceTimestamp}
                  onChange={(e) => setSinceTimestamp(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleDetectChanges}
                disabled={detecting}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${detecting ? 'animate-spin' : ''}`} />
                {detecting ? '检测中...' : '检测变更'}
              </button>
            </div>
          </div>

          {changeResult && (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
                  新增接口
                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs rounded-full font-medium">
                    {changeResult.new.length}
                  </span>
                </h3>
                {changeResult.new.length > 0 ? (
                  <div className="space-y-2">
                    {changeResult.new.map((iface) => (
                      <div
                        key={iface.id}
                        className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {iface.name}
                          </span>
                          <code className="text-sm text-gray-600 dark:text-gray-400">
                            {iface.path}
                          </code>
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded font-medium">
                            {iface.method}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">暂无新增接口</p>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-yellow-700 dark:text-yellow-400 mb-4 flex items-center gap-2">
                  修改接口
                  <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-xs rounded-full font-medium">
                    {changeResult.modified.length}
                  </span>
                </h3>
                {changeResult.modified.length > 0 ? (
                  <div className="space-y-3">
                    {changeResult.modified.map((iface) => (
                      <div
                        key={iface.id}
                        className="p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {iface.name}
                          </span>
                          <code className="text-sm text-gray-600 dark:text-gray-400">
                            {iface.path}
                          </code>
                        </div>
                        <div className="ml-7 space-y-1">
                          {iface.diffs.map((diff, idx) => (
                            <div
                              key={idx}
                              className="text-sm"
                            >
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {diff.field}:
                              </span>
                              <span className="mx-1 text-red-600 dark:text-red-400 line-through">
                                {diff.old_value}
                              </span>
                              <span className="mx-1 text-gray-500">→</span>
                              <span className="text-green-600 dark:text-green-400">
                                {diff.new_value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">暂无修改接口</p>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
                  删除接口
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs rounded-full font-medium">
                    {changeResult.deleted.length}
                  </span>
                </h3>
                {changeResult.deleted.length > 0 ? (
                  <div className="space-y-2">
                    {changeResult.deleted.map((iface) => (
                      <div
                        key={iface.id}
                        className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
                      >
                        <div className="flex items-center gap-3">
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="font-medium text-gray-900 dark:text-white line-through">
                            {iface.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">暂无删除接口</p>
                )}
              </div>

              {changeResult.new.length === 0 &&
                changeResult.modified.length === 0 &&
                changeResult.deleted.length === 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 text-lg">暂无变更</p>
                  </div>
                )}
            </>
          )}

          {!changeResult && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                选择时间范围后点击"检测变更"查看接口变更情况
              </p>
            </div>
          )}
        </div>
      )}

      {showGenerateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              生成配置
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  类型
                </label>
                <select
                  value={generateForm.type}
                  onChange={(e) =>
                    setGenerateForm({
                      ...generateForm,
                      type: e.target.value as any,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="github-actions">GitHub Actions</option>
                  <option value="jenkins">Jenkins</option>
                  <option value="gitlab-ci">GitLab CI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Base URL
                </label>
                <input
                  type="text"
                  value={generateForm.baseUrl}
                  onChange={(e) =>
                    setGenerateForm({ ...generateForm, baseUrl: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleGenerateConfig}
                disabled={generating}
                className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Code2 className="w-4 h-4" />
                {generating ? '生成中...' : '生成'}
              </button>
              {generatedConfig && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      生成结果
                    </label>
                    <button
                      onClick={() => handleCopyConfig(generatedConfig)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Copy className="w-4 h-4" />
                      复制
                    </button>
                  </div>
                  <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-800 dark:text-gray-200 overflow-x-auto font-mono whitespace-pre-wrap">
                    {generatedConfig}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowGenerateDialog(false);
                  setGeneratedConfig('');
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              新建配置
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  名称
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="配置名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  类型
                </label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      type: e.target.value as any,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="github-actions">GitHub Actions</option>
                  <option value="jenkins">Jenkins</option>
                  <option value="gitlab-ci">GitLab CI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  配置内容 (YAML / Groovy)
                </label>
                <textarea
                  value={createForm.config}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, config: e.target.value })
                  }
                  rows={12}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="输入配置内容..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setCreateForm({ name: '', type: 'github-actions', config: '' });
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleCreateConfig}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              编辑配置
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  名称
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  类型
                </label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      type: e.target.value as any,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="github-actions">GitHub Actions</option>
                  <option value="jenkins">Jenkins</option>
                  <option value="gitlab-ci">GitLab CI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  配置内容
                </label>
                <textarea
                  value={createForm.config}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, config: e.target.value })
                  }
                  rows={12}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingConfig(null);
                  setCreateForm({ name: '', type: 'github-actions', config: '' });
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleUpdateConfig}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
