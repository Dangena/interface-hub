import { useState, useEffect } from 'react';
import { Database, Plus, Trash2, RefreshCw, Table2, Code, Play, ChevronDown, ChevronRight, CheckCircle, XCircle, Eye, Download, Copy } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface DataSource {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string | null;
  path: string;
  created_at: string;
}

interface TableInfo {
  table_name: string;
  table_type: string;
  schema_name: string;
  columns: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    is_primary_key: boolean;
    is_unique: boolean;
    is_auto_increment: boolean;
    column_default: string | null;
    comment: string | null;
    foreign_key?: { table: string; column: string };
  }>;
  row_count?: number;
  comment?: string;
}

interface CRUDAPI {
  method: string;
  path: string;
  description: string;
  handler: string;
  parameters: Array<{ name: string; type: string; location: string; required: boolean }>;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
};

export default function DataSourceManager() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [tableData, setTableData] = useState<any>(null);
  const [crudAPIs, setCrudAPIs] = useState<Record<string, CRUDAPI[]> | null>(null);
  const [graphqlSchema, setGraphqlSchema] = useState<string>('');
  const [activeView, setActiveView] = useState<'tables' | 'data' | 'crud' | 'graphql'>('tables');
  const [showAddForm, setShowAddForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const [newSource, setNewSource] = useState({
    name: '',
    type: 'postgresql',
    host: '',
    port: 5432,
    database_name: '',
    username: '',
    password: '',
    schema: 'public',
  });

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await api.get('/data-source/sources');
      setSources(data);
    } catch {
      toast('error', '加载数据源失败');
    }
  };

  const handleAddSource = async () => {
    if (!newSource.name || !newSource.host) {
      toast('error', '名称和主机地址必填');
      return;
    }

    try {
      await api.post('/data-source/sources', {
        ...newSource,
        ssl: newSource.type === 'supabase',
      });
      toast('success', '数据源添加成功');
      setShowAddForm(false);
      setNewSource({ name: '', type: 'postgresql', host: '', port: 5432, database_name: '', username: '', password: '', schema: 'public' });
      loadSources();
    } catch {
      toast('error', '添加数据源失败');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTesting(id);
    try {
      const result = await api.post(`/data-source/sources/${id}/test`);
      if (result.success) {
        toast('success', `连接成功: ${result.version}`);
      } else {
        toast('error', `连接失败: ${result.message}`);
      }
    } catch {
      toast('error', '测试连接失败');
    } finally {
      setTesting(null);
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await api.delete(`/data-source/sources/${id}`);
      toast('success', '数据源已删除');
      if (selectedSource?.id === id) {
        setSelectedSource(null);
        setTables([]);
      }
      loadSources();
    } catch {
      toast('error', '删除数据源失败');
    }
  };

  const handleSelectSource = async (source: DataSource) => {
    setSelectedSource(source);
    setLoading(true);
    try {
      const data = await api.get(`/data-source/sources/${source.id}/tables`);
      setTables(data);
      setActiveView('tables');
    } catch {
      toast('error', '加载表列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewData = async (table: TableInfo) => {
    setSelectedTable(table);
    setActiveView('data');
    try {
      const data = await api.get(`/data-source/sources/${selectedSource?.id}/tables/${table.table_name}/data?pageSize=50`);
      setTableData(data);
    } catch {
      toast('error', '加载数据失败');
    }
  };

  const handleViewCRUD = async () => {
    if (!selectedSource) return;
    setActiveView('crud');
    try {
      const data = await api.get(`/data-source/sources/${selectedSource.id}/crud-apis`);
      setCrudAPIs(data.tables);
    } catch {
      toast('error', '生成 CRUD API 失败');
    }
  };

  const handleViewGraphQL = async () => {
    if (!selectedSource) return;
    setActiveView('graphql');
    try {
      const data = await api.get(`/data-source/sources/${selectedSource.id}/graphql-schema`);
      setGraphqlSchema(data.typeDefs);
    } catch {
      toast('error', '生成 GraphQL Schema 失败');
    }
  };

  const toggleTable = (name: string) => {
    setExpandedTables((prev) => {
      const newSet = new Set(prev);
      newSet.has(name) ? newSet.delete(name) : newSet.add(name);
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', '已复制到剪贴板');
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">数据源管理</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          连接 PostgreSQL / Supabase 数据库，自动生成 CRUD API 和 GraphQL Schema
        </p>
      </div>

      <div className="flex gap-6">
        <div className="w-80 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">数据源</h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {showAddForm && (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3">
                <input
                  type="text"
                  placeholder="名称"
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                <select
                  value={newSource.type}
                  onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="supabase">Supabase</option>
                </select>
                <input
                  type="text"
                  placeholder="主机 (如: db.example.com)"
                  value={newSource.host}
                  onChange={(e) => setNewSource({ ...newSource, host: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="端口"
                    value={newSource.port}
                    onChange={(e) => setNewSource({ ...newSource, port: parseInt(e.target.value) || 5432 })}
                    className="w-1/3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="text"
                    placeholder="数据库名"
                    value={newSource.database_name}
                    onChange={(e) => setNewSource({ ...newSource, database_name: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <input
                  type="text"
                  placeholder="用户名"
                  value={newSource.username}
                  onChange={(e) => setNewSource({ ...newSource, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                <input
                  type="password"
                  placeholder="密码"
                  value={newSource.password}
                  onChange={(e) => setNewSource({ ...newSource, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                <input
                  type="text"
                  placeholder="Schema (默认 public)"
                  value={newSource.schema}
                  onChange={(e) => setNewSource({ ...newSource, schema: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddSource}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    添加
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSource?.id === source.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => handleSelectSource(source)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className={`w-4 h-4 ${source.type === 'supabase' ? 'text-green-500' : 'text-blue-500'}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{source.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTestConnection(source.id); }}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="测试连接"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${testing === source.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSource(source.id); }}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{source.host}:{source.port}/{source.database_name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    source.type === 'supabase'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                  }`}>
                    {source.type}
                  </span>
                </div>
              ))}
              {sources.length === 0 && (
                <p className="text-center text-gray-500 py-4 text-sm">暂无数据源，点击 + 添加</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1">
          {selectedSource && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setActiveView('tables')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    activeView === 'tables' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Table2 className="w-4 h-4 inline mr-1" />表结构
                </button>
                <button
                  onClick={handleViewCRUD}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    activeView === 'crud' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Code className="w-4 h-4 inline mr-1" />CRUD API
                </button>
                <button
                  onClick={handleViewGraphQL}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    activeView === 'graphql' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Play className="w-4 h-4 inline mr-1" />GraphQL
                </button>
              </div>

              {activeView === 'tables' && (
                <div className="space-y-3">
                  {loading ? (
                    <div className="text-center py-8 text-gray-500">加载中...</div>
                  ) : (
                    tables.map((table) => (
                      <div key={table.table_name} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                        <button
                          onClick={() => toggleTable(table.table_name)}
                          className="w-full flex items-center justify-between p-4"
                        >
                          <div className="flex items-center gap-3">
                            {expandedTables.has(table.table_name) ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            <Table2 className="w-5 h-5 text-blue-500" />
                            <span className="font-medium text-gray-900 dark:text-white">{table.table_name}</span>
                            <span className="text-xs text-gray-500">{table.columns.length} 字段</span>
                            {table.row_count !== undefined && (
                              <span className="text-xs text-gray-400">{table.row_count} 行</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewData(table); }}
                            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg hover:bg-blue-200"
                          >
                            查看数据
                          </button>
                        </button>

                        {expandedTables.has(table.table_name) && (
                          <div className="px-4 pb-4">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                  <th className="text-left py-2 px-2 text-gray-500 font-medium">字段名</th>
                                  <th className="text-left py-2 px-2 text-gray-500 font-medium">类型</th>
                                  <th className="text-left py-2 px-2 text-gray-500 font-medium">可空</th>
                                  <th className="text-left py-2 px-2 text-gray-500 font-medium">约束</th>
                                  <th className="text-left py-2 px-2 text-gray-500 font-medium">默认值</th>
                                  <th className="text-left py-2 px-2 text-gray-500 font-medium">外键</th>
                                </tr>
                              </thead>
                              <tbody>
                                {table.columns.map((col) => (
                                  <tr key={col.column_name} className="border-b border-gray-100 dark:border-gray-700/50">
                                    <td className="py-2 px-2 font-mono text-gray-900 dark:text-white">
                                      {col.column_name}
                                    </td>
                                    <td className="py-2 px-2 text-gray-600 dark:text-gray-400">{col.data_type}</td>
                                    <td className="py-2 px-2">
                                      {col.is_nullable === 'YES' ? (
                                        <span className="text-green-500">✓</span>
                                      ) : (
                                        <span className="text-red-500">✗</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2">
                                      {col.is_primary_key && <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">PK</span>}
                                      {col.is_unique && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded ml-1">UQ</span>}
                                      {col.is_auto_increment && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded ml-1">AI</span>}
                                    </td>
                                    <td className="py-2 px-2 text-xs text-gray-500 font-mono">
                                      {col.column_default || '-'}
                                    </td>
                                    <td className="py-2 px-2 text-xs text-gray-500">
                                      {col.foreign_key ? `${col.foreign_key.table}.${col.foreign_key.column}` : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeView === 'data' && selectedTable && tableData && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedTable.table_name}
                      <span className="text-sm text-gray-500 ml-2">共 {tableData.total} 行</span>
                    </h3>
                    <button
                      onClick={() => setActiveView('tables')}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      返回表列表
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          {selectedTable.columns.slice(0, 10).map((col) => (
                            <th key={col.column_name} className="text-left py-2 px-3 text-gray-500 font-medium whitespace-nowrap">
                              {col.column_name}
                            </th>
                          ))}
                          {selectedTable.columns.length > 10 && (
                            <th className="text-left py-2 px-3 text-gray-500">+{selectedTable.columns.length - 10}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.data.map((row: any, idx: number) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50">
                            {selectedTable.columns.slice(0, 10).map((col) => (
                              <td key={col.column_name} className="py-2 px-3 text-gray-900 dark:text-white whitespace-nowrap max-w-[200px] truncate">
                                {row[col.column_name] !== null ? String(row[col.column_name]) : <span className="text-gray-400">NULL</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                    <span>第 {tableData.page} 页，每页 {tableData.pageSize} 条</span>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const data = await api.get(`/data-source/sources/${selectedSource?.id}/tables/${selectedTable.table_name}/data?page=${Math.max(1, tableData.page - 1)}&pageSize=50`);
                          setTableData(data);
                        }}
                        disabled={tableData.page <= 1}
                        className="px-3 py-1 border rounded disabled:opacity-50"
                      >
                        上一页
                      </button>
                      <button
                        onClick={async () => {
                          const data = await api.get(`/data-source/sources/${selectedSource?.id}/tables/${selectedTable.table_name}/data?page=${tableData.page + 1}&pageSize=50`);
                          setTableData(data);
                        }}
                        className="px-3 py-1 border rounded"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'crud' && crudAPIs && (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      基于数据库表结构自动生成的 RESTful CRUD API，可直接对接前端使用
                    </p>
                  </div>
                  {Object.entries(crudAPIs).map(([tableName, apis]) => (
                    <div key={tableName} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        <Table2 className="w-4 h-4 inline mr-2 text-blue-500" />
                        {tableName}
                      </h3>
                      <div className="space-y-2">
                        {apis.map((apiDef, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[apiDef.method]}`}>
                              {apiDef.method}
                            </span>
                            <span className="font-mono text-sm text-gray-900 dark:text-white">{apiDef.path}</span>
                            <span className="text-xs text-gray-500">{apiDef.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeView === 'graphql' && graphqlSchema && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      GraphQL Schema
                    </h3>
                    <button
                      onClick={() => copyToClipboard(graphqlSchema)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                    >
                      <Copy className="w-4 h-4" /> 复制
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre">
                    {graphqlSchema}
                  </pre>
                </div>
              )}
            </>
          )}

          {!selectedSource && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">选择数据源</h3>
              <p className="text-gray-500 dark:text-gray-400">
                从左侧选择或添加一个 PostgreSQL / Supabase 数据源
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 max-w-lg mx-auto">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <Database className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-400">PostgreSQL</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <Database className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Supabase</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <Code className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-400">GraphQL</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
