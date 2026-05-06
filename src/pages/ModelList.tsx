import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Database, Key, Edit, Trash2, Eye, Layers } from 'lucide-react';
import api from '../services/api';

interface Model {
  name: string;
  tableName: string;
  description: string;
  fields: Field[];
}

interface Field {
  id: string;
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
}

export default function ModelList() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const data = await api.get('/models');
      setModels(data);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (confirm(`确定要删除数据模型 "${name}" 吗？`)) {
      try {
        await api.delete(`/models/${name}`);
        loadModels();
      } catch (error) {
        console.error('Failed to delete model:', error);
      }
    }
  };

  const filteredModels = models.filter((model) =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.tableName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">数据模型</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理数据库表结构和字段定义
          </p>
        </div>
        <Link
          to="/models/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建模型
        </Link>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索模型名称或表名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredModels.map((model) => {
          const primaryKey = model.fields.find((f) => f.primaryKey);
          const fieldCount = model.fields.length;

          return (
            <div
              key={model.name}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                    <Database className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {model.name}
                    </h3>
                    <code className="text-xs text-gray-500 dark:text-gray-400">
                      {model.tableName}
                    </code>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                {model.description || '暂无描述'}
              </p>

              <div className="flex items-center gap-4 mb-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Layers className="w-4 h-4" />
                  <span>{fieldCount} 字段</span>
                </div>
                {primaryKey && (
                  <div className="flex items-center gap-1">
                    <Key className="w-4 h-4 text-yellow-500" />
                    <span>{primaryKey.name}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Link
                      to={`/models/${model.name}`}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Eye className="w-5 h-5" />
                    </Link>
                    <Link
                      to={`/models/${model.name}/edit`}
                      className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
                    >
                      <Edit className="w-5 h-5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(model.name)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <Link
                    to={`/graph?model=${model.name}`}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    查看关系 →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center py-12">
          <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {searchTerm ? '没有找到匹配的数据模型' : '暂无数据模型'}
          </p>
          {!searchTerm && (
            <Link
              to="/models/new"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-4 h-4" />
              创建第一个数据模型
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
