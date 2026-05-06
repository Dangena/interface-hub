import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Database, Key, Link2, Copy } from 'lucide-react';
import api from '../services/api';

interface ModelDetail {
  name: string;
  tableName: string;
  description: string;
  fields: Field[];
  mappings: Mapping[];
}

interface Field {
  id: string;
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: any;
  comment: string;
}

interface Mapping {
  id: string;
  interface_id: string;
  interface_field: string;
  interface_name: string;
  interface_path: string;
  method: string;
}

export default function ModelDetail() {
  const { name } = useParams<{ name: string }>();
  const [model, setModel] = useState<ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('fields');

  useEffect(() => {
    if (name) {
      loadModel(name);
    }
  }, [name]);

  const loadModel = async (modelName: string) => {
    try {
      const data = await api.get(`/models/${encodeURIComponent(modelName)}`);
      setModel(data);
    } catch (error) {
      console.error('Failed to load model:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="p-8">
        <p className="text-gray-500">数据模型不存在</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          to="/models"
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          返回列表
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <Database className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {model.name}
              </h1>
              <code className="text-gray-600 dark:text-gray-400">
                表名: {model.tableName}
              </code>
            </div>
          </div>
          <Link
            to={`/models/${model.name}/edit`}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit className="w-5 h-5" />
            编辑
          </Link>
        </div>
      </div>

      <p className="text-gray-600 dark:text-gray-400 mb-6">
        {model.description || '暂无描述'}
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('fields')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'fields'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              字段定义 ({model.fields?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('mapping')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'mapping'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'
              }`}
            >
              关联接口 ({model.mappings?.length || 0})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'fields' && (
            <div>
              {model.fields && model.fields.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          字段名
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          列名
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          类型
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          约束
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          默认值
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          注释
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {model.fields.map((field) => (
                        <tr key={field.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-medium text-gray-900 dark:text-white">
                                {field.name}
                              </code>
                              {field.primaryKey && (
                                <span title="主键">
                                  <Key className="w-4 h-4 text-yellow-500" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-sm text-gray-600 dark:text-gray-400">
                              {field.columnName}
                            </code>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                              {field.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {field.primaryKey && (
                                <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded text-xs">
                                  PK
                                </span>
                              )}
                              {!field.nullable ? (
                                <span className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded text-xs">
                                  NOT NULL
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs">
                                  NULL
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {field.defaultValue || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {field.comment || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  暂无字段定义
                </p>
              )}
            </div>
          )}

          {activeTab === 'mapping' && (
            <div>
              {model.mappings && model.mappings.length > 0 ? (
                <div className="space-y-4">
                  {model.mappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                          <Link2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                mapping.method === 'GET'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                  : mapping.method === 'POST'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                              }`}
                            >
                              {mapping.method}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {mapping.interface_name}
                            </span>
                          </div>
                          <code className="text-xs text-gray-500 dark:text-gray-400">
                            {mapping.interface_path}
                          </code>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        映射字段: <code>{mapping.interface_field}</code>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    暂无关联接口
                  </p>
                  <Link
                    to={`/graph?model=${model.name}`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    去关系图谱添加关联 →
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
