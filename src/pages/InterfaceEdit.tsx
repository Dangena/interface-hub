import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface ParamRow {
  id: string;
  name: string;
  location: string;
  type: string;
  required: boolean;
  description: string;
  example: string;
}

const PARAM_LOCATIONS = ['query', 'path', 'header', 'body', 'cookie'];
const PARAM_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object', 'file'];

export default function InterfaceEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'basic' | 'params'>('basic');
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    method: 'GET',
    description: '',
    category: '',
    tags: [] as string[],
    status: 'draft',
    version: '1.0.0',
    requestSchema: null as any,
    responseSchema: null as any,
  });
  const [parameters, setParameters] = useState<ParamRow[]>([]);

  useEffect(() => {
    if (id) loadInterface(id);
  }, [id]);

  const loadInterface = async (interfaceId: string) => {
    try {
      const data = await api.get(`/interfaces/${interfaceId}`);
      setFormData({
        name: data.name || '',
        path: data.path || '',
        method: data.method || 'GET',
        description: data.description || '',
        category: data.category || '',
        tags: data.tags || [],
        status: data.status || 'draft',
        version: data.version || '1.0.0',
        requestSchema: data.requestSchema || null,
        responseSchema: data.responseSchema || null,
      });
      setParameters(
        (data.parameters || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          location: p.location,
          type: p.type,
          required: Boolean(p.required),
          description: p.description || '',
          example: p.example || '',
        }))
      );
    } catch (error: any) {
      toast('error', error.message || '加载接口失败');
    } finally {
      setInitialLoading(false);
    }
  };

  const generateId = () => `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const addParameter = () => {
    setParameters((prev) => [
      ...prev,
      { id: generateId(), name: '', location: 'query', type: 'string', required: false, description: '', example: '' },
    ]);
  };

  const removeParameter = (index: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: keyof ParamRow, value: any) => {
    setParameters((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.path.trim()) {
      toast('error', '请填写接口名称和路径');
      return;
    }

    const validParams = parameters.filter((p) => p.name.trim());
    setLoading(true);

    try {
      await api.put(`/interfaces/${id}`, { ...formData, parameters: validParams });
      toast('success', '接口更新成功');
      navigate(`/interfaces/${id}`);
    } catch (error: any) {
      toast('error', error.message || '更新接口失败');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tags = e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean);
    setFormData((prev) => ({ ...prev, tags }));
  };

  const autoDetectPathParams = () => {
    const pathParams = formData.path.match(/:\w+|\{\w+\}/g);
    if (!pathParams) {
      toast('info', '路径中未检测到路径参数');
      return;
    }

    const existingNames = new Set(parameters.map((p) => p.name));
    let added = 0;

    setParameters((prev) => {
      const newParams = [...prev];
      for (const match of pathParams) {
        const name = match.replace(/^[:{]/, '').replace(/[}]$/, '');
        if (!existingNames.has(name)) {
          newParams.push({
            id: generateId(),
            name,
            location: 'path',
            type: 'string',
            required: true,
            description: '',
            example: '',
          });
          existingNames.add(name);
          added++;
        }
      }
      return newParams;
    });

    if (added > 0) {
      toast('success', `已自动添加 ${added} 个路径参数`);
      setActiveTab('params');
    } else {
      toast('info', '路径参数已存在');
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          to={`/interfaces/${id}`}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          返回详情
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">编辑接口</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">修改接口信息和参数定义</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-8">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'basic'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
                }`}
              >
                基本信息
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('params')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'params'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
                }`}
              >
                请求参数 ({parameters.length})
              </button>
            </nav>
          </div>

          <div className="p-8">
            {activeTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    接口名称 *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：获取用户列表"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    请求方法 *
                  </label>
                  <select
                    name="method"
                    value={formData.method}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    接口路径 *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="path"
                      value={formData.path}
                      onChange={handleChange}
                      required
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="/api/v1/users 或 /api/v1/users/:id"
                    />
                    <button
                      type="button"
                      onClick={autoDetectPathParams}
                      className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      自动识别路径参数
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    支持 :param 或 {'{param}'} 格式的路径参数
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    分类
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：用户管理"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    状态
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">开发中</option>
                    <option value="published">已发布</option>
                    <option value="deprecated">已弃用</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    版本
                  </label>
                  <input
                    type="text"
                    name="version"
                    value={formData.version}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="1.0.0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    标签（用逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={formData.tags.join(', ')}
                    onChange={handleTagsChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="用户, 列表, 分页"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    接口描述
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="描述接口的功能和用途..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'params' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    请求参数
                  </h3>
                  <button
                    type="button"
                    onClick={addParameter}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    添加参数
                  </button>
                </div>

                {parameters.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      <div className="col-span-2">参数名</div>
                      <div className="col-span-2">位置</div>
                      <div className="col-span-2">类型</div>
                      <div className="col-span-1">必填</div>
                      <div className="col-span-2">描述</div>
                      <div className="col-span-2">示例</div>
                      <div className="col-span-1"></div>
                    </div>

                    {parameters.map((param, index) => (
                      <div
                        key={param.id}
                        className="grid grid-cols-12 gap-2 items-center p-3 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-lg"
                      >
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={param.name}
                            onChange={(e) => updateParameter(index, 'name', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                            placeholder="参数名"
                          />
                        </div>
                        <div className="col-span-2">
                          <select
                            value={param.location}
                            onChange={(e) => updateParameter(index, 'location', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                          >
                            {PARAM_LOCATIONS.map((loc) => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <select
                            value={param.type}
                            onChange={(e) => updateParameter(index, 'type', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                          >
                            {PARAM_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <input
                            type="checkbox"
                            checked={param.required}
                            onChange={(e) => updateParameter(index, 'required', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={param.description}
                            onChange={(e) => updateParameter(index, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                            placeholder="描述"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={param.example}
                            onChange={(e) => updateParameter(index, 'example', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                            placeholder="示例值"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => removeParameter(index)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">暂无参数定义</p>
                    <button
                      type="button"
                      onClick={addParameter}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      + 添加第一个参数
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-4 flex items-center justify-end gap-4">
            <Link
              to={`/interfaces/${id}`}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
