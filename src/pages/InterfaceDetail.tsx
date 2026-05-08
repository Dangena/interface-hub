import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Link2, Database, Wand2, Check, X, BrainCircuit, Clock, Plus, Minus, RefreshCw, Save, RotateCcw, Tag, Send } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface InterfaceDetail {
  id: string;
  name: string;
  path: string;
  method: string;
  description: string;
  status: string;
  category: string;
  tags: string[];
  version: string;
  parameters: any[];
  mappings: any[];
  createdAt: string;
  updatedAt: string;
}

interface SmartMatchSuggestion {
  interfaceField: string;
  modelField: string;
  score: number;
  matchType: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ChangeRecord {
  id: string;
  interface_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  operator: string;
  created_at: string;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

const confidenceColors: Record<string, string> = {
  high: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
};

export default function InterfaceDetail() {
  const { id } = useParams<{ id: string }>();
  const [iface, setIface] = useState<InterfaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [suggestions, setSuggestions] = useState<SmartMatchSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [changeHistory, setChangeHistory] = useState<ChangeRecord[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionDesc, setVersionDesc] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadInterface(id);
      loadModels();
      loadChangeHistory(id);
      loadVersions(id);
    }
  }, [id]);

  const loadInterface = async (interfaceId: string) => {
    try {
      const data = await api.get(`/interfaces/${interfaceId}`);
      setIface(data);
    } catch (error) {
      console.error('Failed to load interface:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const data = await api.get('/models');
      setModels(data);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadChangeHistory = async (interfaceId: string) => {
    try {
      const data = await api.get(`/interfaces/${interfaceId}/history?limit=50`);
      setChangeHistory(data.data || []);
    } catch (error) {
      console.error('Failed to load change history:', error);
    }
  };

  const loadVersions = async (interfaceId: string) => {
    try {
      const data = await api.get(`/interfaces/${interfaceId}/versions`);
      setVersions(data || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  };

  const handleSaveVersion = async () => {
    if (!id) return;
    setSavingVersion(true);
    try {
      await api.post(`/interfaces/${id}/versions`, { description: versionDesc });
      setVersionDesc('');
      loadVersions(id);
      loadChangeHistory(id);
    } catch (error: any) {
      console.error('Failed to save version:', error);
    } finally {
      setSavingVersion(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!id) return;
    setRestoringVersion(versionId);
    try {
      await api.post(`/interfaces/${id}/versions/${versionId}/restore`);
      loadInterface(id);
      loadVersions(id);
      loadChangeHistory(id);
    } catch (error: any) {
      console.error('Failed to restore version:', error);
    } finally {
      setRestoringVersion(null);
    }
  };

  const handleRequestPublish = async () => {
    if (!id || !iface) return;
    try {
      await api.post('/approvals', {
        type: 'publish',
        referenceId: id,
        title: `发布接口: ${iface.name}`,
        description: `请求将接口 "${iface.name}" (${iface.method} ${iface.path}) 发布为正式版本`,
      });
      toast('success', '发布申请已提交，等待管理员审批');
    } catch (error: any) {
      toast('error', error.message || '提交失败');
    }
  };

  const handleSmartMatch = async () => {
    if (!selectedModel || !id) return;
    setMatchingLoading(true);
    try {
      const data = await api.post('/mappings/smart-match', {
        interfaceId: id,
        modelName: selectedModel,
      });
      setSuggestions(data.suggestions);
      setSelectedSuggestions(new Set(data.suggestions.map((s: SmartMatchSuggestion) =>
        `${s.interfaceField}-${s.modelField}`
      )));
    } catch (error) {
      console.error('Failed to perform smart match:', error);
    } finally {
      setMatchingLoading(false);
    }
  };

  const toggleSuggestion = (key: string) => {
    const newSet = new Set(selectedSuggestions);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedSuggestions(newSet);
  };

  const applySuggestions = async () => {
    if (!id) return;
    try {
      const mappingsToApply = suggestions
        .filter(s => selectedSuggestions.has(`${s.interfaceField}-${s.modelField}`))
        .map(s => ({
          interfaceId: id,
          interfaceField: s.interfaceField,
          modelName: selectedModel,
          modelField: s.modelField,
        }));

      await api.post('/mappings/apply-batch', { mappings: mappingsToApply });
      await loadInterface(id);
      setSuggestions([]);
      setSelectedSuggestions(new Set());
    } catch (error) {
      console.error('Failed to apply suggestions:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!iface) {
    return (
      <div className="p-8">
        <p className="text-gray-500">接口不存在</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          to="/interfaces"
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          返回列表
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {iface.name}
            </h1>
            <span
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                methodColors[iface.method] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {iface.method}
            </span>
          </div>
          <Link
            to={`/interfaces/${iface.id}/edit`}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit className="w-5 h-5" />
            编辑
          </Link>
          {iface.status !== 'published' && (
            <button
              onClick={handleRequestPublish}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Send className="w-5 h-5" />
              提交发布审批
            </button>
          )}
        </div>
        <code className="text-gray-600 dark:text-gray-400 mt-2 block">
          {iface.path}
        </code>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('info')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              基本信息
            </button>
            <button
              onClick={() => setActiveTab('params')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'params'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              请求参数 ({iface.parameters?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('mapping')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'mapping'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              字段映射 ({iface.mappings?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              变更历史 ({changeHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'versions'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              版本管理
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  接口描述
                </h3>
                <p className="text-gray-900 dark:text-white">
                  {iface.description || '暂无描述'}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    状态
                  </h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      iface.status === 'published'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : iface.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                    }`}
                  >
                    {iface.status === 'published'
                      ? '已发布'
                      : iface.status === 'draft'
                      ? '开发中'
                      : '已弃用'}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    版本
                  </h3>
                  <p className="text-gray-900 dark:text-white">{iface.version}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    分类
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {iface.category || '-'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    标签
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {iface.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    创建时间
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(iface.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    更新时间
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(iface.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'params' && (
            <div>
              {iface.parameters && iface.parameters.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        参数名
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        位置
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        类型
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        必填
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        描述
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {iface.parameters.map((param) => (
                      <tr key={param.id}>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          <code>{param.name}</code>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {param.location}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {param.type}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {param.required ? (
                            <span className="text-red-600">是</span>
                          ) : (
                            <span className="text-gray-400">否</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {param.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  暂无参数定义
                </p>
              )}
            </div>
          )}

          {activeTab === 'mapping' && (
            <div>
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  智能字段匹配
                </h3>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      选择数据模型
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">请选择...</option>
                      {models.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name} ({model.tableName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSmartMatch}
                    disabled={!selectedModel || matchingLoading}
                    className="flex items-center gap-2 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <BrainCircuit className="w-5 h-5" />
                    {matchingLoading ? '分析中...' : '智能匹配'}
                  </button>
                </div>
              </div>

              {suggestions.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <Wand2 className="w-5 h-5 text-purple-600" />
                      匹配建议
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedSuggestions(new Set(suggestions.map(s => `${s.interfaceField}-${s.modelField}`)))}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        全选
                      </button>
                      <button
                        onClick={() => setSelectedSuggestions(new Set())}
                        className="text-sm text-gray-600 hover:text-gray-700"
                      >
                        清空
                      </button>
                      <button
                        onClick={applySuggestions}
                        disabled={selectedSuggestions.size === 0}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="w-4 h-4" />
                        应用选中 ({selectedSuggestions.size})
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {suggestions.map((suggestion, index) => {
                      const key = `${suggestion.interfaceField}-${suggestion.modelField}`;
                      const isSelected = selectedSuggestions.has(key);
                      return (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                            isSelected
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <label className="flex items-center gap-4 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSuggestion(key)}
                              className="w-4 h-4 text-purple-600"
                            />
                            <div className="flex items-center gap-4 flex-1">
                              <div className="flex items-center gap-2">
                                <Link2 className="w-5 h-5 text-blue-600" />
                                <code className="text-sm">{suggestion.interfaceField}</code>
                              </div>
                              <span className="text-gray-400">→</span>
                              <div className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-green-600" />
                                <code className="text-sm">{suggestion.modelField}</code>
                              </div>
                            </div>
                          </label>
                          <div className="flex items-center gap-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${confidenceColors[suggestion.confidence]}`}
                            >
                              {suggestion.confidence === 'high' ? '高' : suggestion.confidence === 'medium' ? '中' : '低'} ({suggestion.score}%)
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {suggestion.matchType === 'exact' ? '完全匹配' : suggestion.matchType === 'partial' ? '部分匹配' : suggestion.matchType === 'word' ? '词汇匹配' : '模糊匹配'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
                  已关联字段
                </h4>
                {iface.mappings && iface.mappings.length > 0 ? (
                  <div className="space-y-4">
                    {iface.mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Link2 className="w-5 h-5 text-blue-600" />
                            <code className="text-sm">{mapping.interface_field}</code>
                          </div>
                          <span className="text-gray-400">→</span>
                          <div className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-green-600" />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {mapping.model_name}
                              </p>
                              <code className="text-xs text-gray-500">
                                {mapping.model_field}
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      暂无字段映射
                    </p>
                    <Link
                      to={`/graph?highlight=${iface.id}`}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      去关系图谱添加映射 →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {changeHistory.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                  <div className="space-y-6">
                    {changeHistory.map((record) => {
                      const actionConfig: Record<string, { icon: any; color: string; label: string }> = {
                        create: { icon: Plus, color: 'text-green-600 bg-green-100 dark:bg-green-900/20', label: '创建' },
                        update: { icon: RefreshCw, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20', label: '更新' },
                        delete: { icon: Minus, color: 'text-red-600 bg-red-100 dark:bg-red-900/20', label: '删除' },
                      };
                      const config = actionConfig[record.action] || actionConfig.update;
                      const Icon = config.icon;

                      return (
                        <div key={record.id} className="relative pl-12">
                          <div className={`absolute left-3 w-5 h-5 rounded-full flex items-center justify-center ${config.color}`}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <div className="bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                                  {config.label}
                                </span>
                                {record.field_name && (
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {record.field_name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Clock className="w-3 h-3" />
                                {new Date(record.created_at).toLocaleString()}
                                {record.operator && record.operator !== 'system' && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">
                                    {record.operator}
                                  </span>
                                )}
                              </div>
                            </div>
                            {record.action === 'update' && record.field_name && (
                              <div className="flex items-center gap-2 text-sm">
                                {record.old_value && (
                                  <span className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded line-through">
                                    {record.old_value.length > 80 ? record.old_value.slice(0, 80) + '...' : record.old_value}
                                  </span>
                                )}
                                {record.old_value && record.new_value && (
                                  <span className="text-gray-400">→</span>
                                )}
                                {record.new_value && (
                                  <span className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded">
                                    {record.new_value.length > 80 ? record.new_value.slice(0, 80) + '...' : record.new_value}
                                  </span>
                                )}
                              </div>
                            )}
                            {(record.action === 'create' || record.action === 'delete') && record.new_value && (
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {record.new_value}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">暂无变更历史</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'versions' && (
            <div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={versionDesc}
                    onChange={(e) => setVersionDesc(e.target.value)}
                    placeholder="版本说明（可选）"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSaveVersion}
                    disabled={savingVersion}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm whitespace-nowrap"
                  >
                    <Save className="w-4 h-4" />
                    {savingVersion ? '保存中...' : '保存当前版本'}
                  </button>
                </div>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-2">
                  保存当前接口的快照，方便日后对比和回滚
                </p>
              </div>

              {versions.length > 0 ? (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                          <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              v{version.version}
                            </span>
                            {version.description && (
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                · {version.description}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(version.created_at).toLocaleString()}
                            {version.operator && version.operator !== 'system' && (
                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">
                                {version.operator}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreVersion(version.id)}
                        disabled={restoringVersion === version.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {restoringVersion === version.id ? '回滚中...' : '回滚到此版本'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-2">暂无版本快照</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    点击上方"保存当前版本"创建第一个版本快照
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
