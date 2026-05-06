import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Key } from 'lucide-react';
import api from '../services/api';

interface Field {
  id: string;
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string;
  comment: string;
}

export default function ModelCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    tableName: '',
    description: '',
    fields: [] as Field[],
  });

  const addField = () => {
    const newField: Field = {
      id: `field-${Date.now()}`,
      name: '',
      columnName: '',
      type: 'VARCHAR',
      nullable: true,
      primaryKey: false,
      defaultValue: '',
      comment: '',
    };
    setFormData((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
  };

  const updateField = (id: string, updates: Partial<Field>) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    }));
  };

  const removeField = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        name: formData.name,
        tableName: formData.tableName,
        description: formData.description,
        fields: formData.fields.map((f) => ({
          name: f.name,
          columnName: f.columnName,
          type: f.type,
          nullable: f.nullable,
          primaryKey: f.primaryKey,
          defaultValue: f.defaultValue || null,
          comment: f.comment || null,
        })),
      };

      await api.post('/models', data);
      navigate('/models');
    } catch (error) {
      console.error('Failed to create model:', error);
      alert('创建数据模型失败');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          创建数据模型
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          定义数据库表结构和字段
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            基本信息
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                模型名称 *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="例如：User"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                表名 *
              </label>
              <input
                type="text"
                name="tableName"
                value={formData.tableName}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="例如：users"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                描述
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="描述数据模型的用途..."
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              字段定义
            </h2>
            <button
              type="button"
              onClick={addField}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-5 h-5" />
              添加字段
            </button>
          </div>

          {formData.fields.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                暂无字段定义，点击上方按钮添加
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      字段 {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        字段名 *
                      </label>
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) =>
                          updateField(field.id, { name: e.target.value })
                        }
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="id"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        列名 *
                      </label>
                      <input
                        type="text"
                        value={field.columnName}
                        onChange={(e) =>
                          updateField(field.id, { columnName: e.target.value })
                        }
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="id"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        类型 *
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateField(field.id, { type: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="INT">INT</option>
                        <option value="VARCHAR">VARCHAR</option>
                        <option value="TEXT">TEXT</option>
                        <option value="BOOLEAN">BOOLEAN</option>
                        <option value="DATE">DATE</option>
                        <option value="DATETIME">DATETIME</option>
                        <option value="DECIMAL">DECIMAL</option>
                        <option value="JSON">JSON</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        默认值
                      </label>
                      <input
                        type="text"
                        value={field.defaultValue}
                        onChange={(e) =>
                          updateField(field.id, { defaultValue: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="NULL"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.nullable}
                        onChange={(e) =>
                          updateField(field.id, { nullable: e.target.checked })
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        可为空
                      </span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.primaryKey}
                        onChange={(e) =>
                          updateField(field.id, { primaryKey: e.target.checked })
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                      <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                        <Key className="w-4 h-4 text-yellow-500" />
                        主键
                      </span>
                    </label>

                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        注释
                      </label>
                      <input
                        type="text"
                        value={field.comment}
                        onChange={(e) =>
                          updateField(field.id, { comment: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="字段说明"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-4">
          <Link
            to="/models"
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
      </form>
    </div>
  );
}
