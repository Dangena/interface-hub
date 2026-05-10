import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Eye, ChevronLeft, ChevronRight, Database, Table2, Link2, Filter } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

const statusColors: Record<string, string> = {
  published: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  deprecated: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
};

export default function InterfaceList() {
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [fieldMappings, setFieldMappings] = useState<Record<string, any[]>>({});
  const [dataModels, setDataModels] = useState<Record<string, any>>({});

  useEffect(() => {
    loadInterfaces();
    loadCategories();
  }, [page, statusFilter, categoryFilter]);

  const loadCategories = async () => {
    try {
      const data = await api.get('/interfaces/categories');
      const cats: string[] = (data.categories || data || []).map((c: any) => typeof c === 'string' ? c : c.category || c.name).filter(Boolean);
      setCategories([...new Set(cats)] as string[]);
    } catch {}
  };

  const loadInterfaces = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      params.set('page', page.toString());
      params.set('limit', '20');
      const data = await api.get(`/interfaces?${params.toString()}`);
      if (data.data) {
        setInterfaces(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      } else {
        setInterfaces(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      toast('error', '加载接口列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadFieldMappings = async (interfaceId: string) => {
    if (fieldMappings[interfaceId]) return;
    try {
      const data = await api.get(`/mappings?interfaceId=${interfaceId}`);
      const mappings = data.data || data || [];
      setFieldMappings(prev => ({ ...prev, [interfaceId]: mappings }));

      for (const m of mappings) {
        if (m.model_id && !dataModels[m.model_id]) {
          try {
            const modelData = await api.get(`/models/${m.model_id}`);
            const model = modelData.data || modelData;
            setDataModels(prev => ({ ...prev, [m.model_id]: model }));
          } catch {}
        }
      }
    } catch {}
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        loadFieldMappings(id);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/interfaces/${deleteTarget.id}`);
      toast('success', `接口 "${deleteTarget.name}" 已删除`);
      loadInterfaces();
    } catch {
      toast('error', '删除接口失败');
    } finally {
      setDeleteTarget(null);
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">接口管理</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理和查看所有 API 接口及其关联数据模型 · 共 {total} 个
          </p>
        </div>
        <Link
          to="/interfaces/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建接口
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索接口名称或路径..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            onKeyDown={(e) => e.key === 'Enter' && loadInterfaces()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">开发中</option>
          <option value="deprecated">已弃用</option>
        </select>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部分类</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">接口名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">方法</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">路径</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">关联模型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">关联表</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {interfaces.map((iface: any) => {
              const mappings = fieldMappings[iface.id] || [];
              const isExpanded = expandedRows.has(iface.id);
              const linkedModels = [...new Set(mappings.map((m: any) => m.model_name || m.model_id).filter(Boolean))];
              const linkedTables = [...new Set(mappings.map((m: any) => m.table_name).filter(Boolean))];

              return (
                <>
                  <tr key={iface.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" onClick={() => toggleRow(iface.id)}>
                    <td className="px-4 py-4">
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{iface.name}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${methodColors[iface.method] || 'bg-gray-100 text-gray-700'}`}>
                        {iface.method}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <code className="text-sm text-gray-600 dark:text-gray-400">{iface.path}</code>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {linkedModels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {linkedModels.map(name => (
                            <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                              <Database className="w-3 h-3" />
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {linkedTables.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {linkedTables.map(name => (
                            <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                              <Table2 className="w-3 h-3" />
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[iface.status] || 'bg-gray-100 text-gray-700'}`}>
                        {iface.status === 'published' ? '已发布' : iface.status === 'draft' ? '开发中' : '已弃用'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/interfaces/${iface.id}`} className="text-blue-600 hover:text-blue-900 dark:text-blue-400"><Eye className="w-5 h-5" /></Link>
                        <Link to={`/interfaces/${iface.id}/edit`} className="text-gray-600 hover:text-gray-900 dark:text-gray-400"><Edit className="w-5 h-5" /></Link>
                        <button onClick={() => setDeleteTarget({ id: iface.id, name: iface.name })} className="text-red-600 hover:text-red-900 dark:text-red-400"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${iface.id}-detail`} className="bg-gray-50 dark:bg-gray-750">
                      <td colSpan={8} className="px-8 py-4">
                        {mappings.length > 0 ? (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                              <Link2 className="w-4 h-4" />
                              字段映射关系 ({mappings.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {mappings.map((m: any, idx: number) => {
                                const model = dataModels[m.model_id];
                                return (
                                  <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                        <Database className="w-3 h-3" />
                                        {m.model_name || m.model_id}
                                      </span>
                                      <span className="text-gray-400">→</span>
                                      <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                                        <Table2 className="w-3 h-3" />
                                        {m.table_name || '-'}
                                      </span>
                                    </div>
                                    {m.model_fields && m.model_fields.length > 0 && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        模型字段: {m.model_fields.slice(0, 5).join(', ')}{m.model_fields.length > 5 ? '...' : ''}
                                      </div>
                                    )}
                                    {m.table_fields && m.table_fields.length > 0 && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        表字段: {m.table_fields.slice(0, 5).join(', ')}{m.table_fields.length > 5 ? '...' : ''}
                                      </div>
                                    )}
                                    {m.confidence !== undefined && (
                                      <div className="mt-1">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full ${m.confidence >= 0.7 ? 'bg-green-500' : m.confidence >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                              style={{ width: `${m.confidence * 100}%` }}
                                            />
                                          </div>
                                          <span className="text-xs text-gray-400">{Math.round(m.confidence * 100)}%</span>
                                        </div>
                                      </div>
                                    )}
                                    {model && model.fields && (
                                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">模型字段详情:</div>
                                        <div className="flex flex-wrap gap-1">
                                          {model.fields.slice(0, 8).map((f: any) => (
                                            <span key={f.name} className={`px-1.5 py-0.5 rounded text-xs ${f.primaryKey ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                              {f.name}: {f.type}
                                            </span>
                                          ))}
                                          {model.fields.length > 8 && <span className="text-xs text-gray-400">+{model.fields.length - 8} more</span>}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <Link2 className="w-4 h-4" />
                            暂无关联数据模型，请通过项目空间解析代码后导入
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {interfaces.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">暂无接口数据</p>
            <Link to="/interfaces/new" className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
              <Plus className="w-4 h-4" />创建第一个接口
            </Link>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">第 {page} 页，共 {totalPages} 页</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除接口"
        message={`确定要删除接口 "${deleteTarget?.name}" 吗？此操作将同时删除关联的参数、映射和Mock配置，且不可恢复。`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
