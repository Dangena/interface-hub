import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Link2, Database } from 'lucide-react';
import api from '../services/api';

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

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

export default function InterfaceDetail() {
  const { id } = useParams<{ id: string }>();
  const [iface, setIface] = useState<InterfaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (id) {
      loadInterface(id);
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
          )}
        </div>
      </div>
    </div>
  );
}
