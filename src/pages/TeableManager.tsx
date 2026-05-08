import { useEffect, useState } from 'react';
import { Table2, Plus, Trash2, RefreshCw, Database, Link2, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface TeableConnection {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  enabled: boolean;
  lastSyncAt: string | null;
  created_at: string;
}

interface TeableBase {
  id: string;
  name: string;
  tables: TeableTable[];
}

interface TeableTable {
  id: string;
  name: string;
  fields: { name: string; type: string }[];
  recordCount: number;
}

export default function TeableManager() {
  const [connections, setConnections] = useState<TeableConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [bases, setBases] = useState<TeableBase[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    apiKey: '',
  });

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const data = await api.get('/teable/connections');
      setConnections(data);
    } catch (error: any) {
      toast('error', error.message || '加载连接数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBases = async (connectionId: string) => {
    setSelectedConnection(connectionId);
    try {
      const data = await api.get(`/teable/connections/${connectionId}/bases`);
      setBases(data);
    } catch (error: any) {
      toast('error', error.message || '加载 Base 数据失败');
    }
  };

  const handleAddConnection = async () => {
    if (!formData.name || !formData.url || !formData.apiKey) {
      toast('error', '请填写所有必填字段');
      return;
    }
    try {
      await api.post('/teable/connections', formData);
      toast('success', '连接添加成功');
      setShowForm(false);
      setFormData({ name: '', url: '', apiKey: '' });
      loadConnections();
    } catch (error: any) {
      toast('error', error.message || '添加连接失败');
    }
  };

  const handleDeleteConnection = async (id: string) => {
    if (!confirm('确定要删除此连接吗？')) return;
    try {
      await api.delete(`/teable/connections/${id}`);
      toast('success', '连接已删除');
      if (selectedConnection === id) {
        setSelectedConnection(null);
        setBases([]);
      }
      loadConnections();
    } catch (error: any) {
      toast('error', error.message || '删除连接失败');
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncing(connectionId);
    try {
      await api.post(`/teable/connections/${connectionId}/sync`);
      toast('success', '同步完成');
      loadConnections();
      if (selectedConnection === connectionId) {
        loadBases(connectionId);
      }
    } catch (error: any) {
      toast('error', error.message || '同步失败');
    } finally {
      setSyncing(null);
    }
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
            <Table2 className="w-8 h-8" />
            Teable 集成
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理 Teable 连接，浏览和同步数据
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          添加连接
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase mb-3">连接列表</h2>
            <div className="space-y-2">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  onClick={() => loadBases(conn.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedConnection === conn.id
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">{conn.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSync(conn.id); }}
                        disabled={syncing === conn.id}
                        className="text-blue-500 hover:text-blue-700 disabled:opacity-50"
                        title="同步"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing === conn.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.id); }}
                        className="text-red-400 hover:text-red-600"
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-xs ${conn.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {conn.enabled ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {conn.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 truncate">{conn.url}</p>
                  {conn.lastSyncAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      上次同步: {new Date(conn.lastSyncAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
              ))}
              {connections.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">暂无连接</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedConnection ? (
            <div className="space-y-4">
              {bases.length > 0 ? (
                bases.map((base) => (
                  <div key={base.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Database className="w-5 h-5 text-blue-600" />
                      {base.name}
                    </h3>
                    <div className="space-y-3">
                      {base.tables.map((table) => (
                        <div key={table.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900 dark:text-white text-sm flex items-center gap-2">
                              <Table2 className="w-4 h-4 text-gray-400" />
                              {table.name}
                            </span>
                            <span className="text-xs text-gray-400">{table.recordCount} 条记录</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {table.fields.map((field) => (
                              <span
                                key={field.name}
                                className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded"
                              >
                                {field.name}: {field.type}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
                  <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">该连接暂无 Base 数据</p>
                  <button
                    onClick={() => handleSync(selectedConnection)}
                    className="mt-3 text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm flex items-center gap-1 mx-auto"
                  >
                    <RefreshCw className="w-4 h-4" />
                    点击同步
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <Link2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">选择一个连接查看数据</p>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">添加 Teable 连接</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="连接名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teable URL *</label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="https://your-teable-instance.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Key *</label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Teable API Key"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => { setShowForm(false); setFormData({ name: '', url: '', apiKey: '' }); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleAddConnection}
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
