import { useEffect, useState } from 'react';
import { Plus, Play, Edit, Trash2, Power, PowerOff, Copy, Clock } from 'lucide-react';
import api from '../services/api';

interface MockConfig {
  id: string;
  interfaceId: string;
  path: string;
  method: string;
  statusCode: number;
  delay: number;
  responseConfig: any;
  enabled: boolean;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

export default function MockServer() {
  const [mocks, setMocks] = useState<MockConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMock, setEditingMock] = useState<MockConfig | null>(null);
  const [formData, setFormData] = useState({
    path: '',
    method: 'GET',
    statusCode: 200,
    delay: 0,
    responseConfig: '{\n  "code": 200,\n  "message": "success",\n  "data": {}\n}',
    enabled: true,
  });

  useEffect(() => {
    loadMocks();
  }, []);

  const loadMocks = async () => {
    try {
      const data = await api.get('/mock');
      setMocks(data);
    } catch (error) {
      console.error('Failed to load mocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const responseConfig = JSON.parse(formData.responseConfig);
      await api.post('/mock', {
        path: formData.path,
        method: formData.method,
        statusCode: formData.statusCode,
        delay: formData.delay,
        responseConfig,
        enabled: formData.enabled,
      });
      setShowEditor(false);
      resetForm();
      loadMocks();
    } catch (error) {
      alert('创建失败，请检查JSON格式是否正确');
    }
  };

  const handleUpdate = async () => {
    if (!editingMock) return;
    try {
      const responseConfig = JSON.parse(formData.responseConfig);
      await api.put(`/mock/${editingMock.id}`, {
        path: formData.path,
        method: formData.method,
        statusCode: formData.statusCode,
        delay: formData.delay,
        responseConfig,
        enabled: formData.enabled,
      });
      setShowEditor(false);
      setEditingMock(null);
      resetForm();
      loadMocks();
    } catch (error) {
      alert('更新失败，请检查JSON格式是否正确');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个Mock配置吗？')) {
      await api.delete(`/mock/${id}`);
      loadMocks();
    }
  };

  const handleToggle = async (mock: MockConfig) => {
    await api.put(`/mock/${mock.id}`, {
      ...mock,
      enabled: !mock.enabled,
    });
    loadMocks();
  };

  const copyMockUrl = (path: string) => {
    const url = `http://localhost:3001/api/mock/proxy${path}`;
    navigator.clipboard.writeText(url);
    alert('Mock URL已复制到剪贴板');
  };

  const resetForm = () => {
    setFormData({
      path: '',
      method: 'GET',
      statusCode: 200,
      delay: 0,
      responseConfig: '{\n  "code": 200,\n  "message": "success",\n  "data": {}\n}',
      enabled: true,
    });
  };

  const startEdit = (mock: MockConfig) => {
    setEditingMock(mock);
    setFormData({
      path: mock.path,
      method: mock.method,
      statusCode: mock.statusCode,
      delay: mock.delay,
      responseConfig: JSON.stringify(mock.responseConfig || {}, null, 2),
      enabled: mock.enabled,
    });
    setShowEditor(true);
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Mock 服务</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            模拟接口响应，支持自定义数据和延迟
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingMock(null);
            setShowEditor(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建 Mock
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 <strong>使用提示：</strong>创建Mock后，访问 <code className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">http://localhost:3001/api/mock/proxy{'{path}'}</code> 即可获取Mock数据
        </p>
      </div>

      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              {editingMock ? '编辑 Mock' : '创建 Mock'}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    路径 *
                  </label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="/api/users"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    方法
                  </label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    状态码
                  </label>
                  <input
                    type="number"
                    value={formData.statusCode}
                    onChange={(e) => setFormData({ ...formData, statusCode: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    延迟 (ms)
                  </label>
                  <input
                    type="number"
                    value={formData.delay}
                    onChange={(e) => setFormData({ ...formData, delay: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  响应数据 (JSON)
                </label>
                <textarea
                  value={formData.responseConfig}
                  onChange={(e) => setFormData({ ...formData, responseConfig: e.target.value })}
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">启用</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowEditor(false);
                  setEditingMock(null);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={editingMock ? handleUpdate : handleCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingMock ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {mocks.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">路径</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">方法</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">状态码</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">延迟</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">状态</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {mocks.map((mock) => (
                <tr key={mock.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <code className="text-sm text-gray-900 dark:text-white">{mock.path}</code>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${methodColors[mock.method]}`}>
                      {mock.method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {mock.statusCode}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {mock.delay}ms
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(mock)}
                      className={`flex items-center gap-1 text-sm ${mock.enabled ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {mock.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                      {mock.enabled ? '已启用' : '已禁用'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => copyMockUrl(mock.path)}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
                        title="复制URL"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => startEdit(mock)}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(mock.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <Play className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">暂无Mock配置</p>
            <button
              onClick={() => setShowEditor(true)}
              className="text-blue-600 hover:text-blue-700"
            >
              创建第一个Mock →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
