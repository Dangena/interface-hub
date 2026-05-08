import { useState } from 'react';
import { Database, Plus, Terminal, Download, Upload, Check, X, Eye, FileText, Zap, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface Connection {
  id: string;
  name: string;
  type: 'mysql' | 'postgresql' | 'sqlite' | 'mssql';
  host: string;
  port: number;
  database_name: string;
  username: string;
  path?: string;
}

interface Table {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
  }[];
}

interface ParsedInterface {
  name: string;
  path: string;
  method: string;
  description: string;
  category: string;
  tags: string[];
  parameters: any[];
  deprecated: boolean;
}

interface ParsedModel {
  name: string;
  fields: any[];
  description: string;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

export default function ImportWizard() {
  const [step, setStep] = useState(1);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<Table[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [connectionForm, setConnectionForm] = useState({
    name: '',
    type: 'mysql' as 'mysql' | 'postgresql' | 'sqlite' | 'mssql',
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: '',
    path: '',
  });

  const [openapiUrl, setOpenapiUrl] = useState('');
  const [openapiFile, setOpenapiFile] = useState<File | null>(null);
  const [openapiSpec, setOpenapiSpec] = useState<any>(null);
  const [parsedResult, setParsedResult] = useState<{
    interfaces: ParsedInterface[];
    models: ParsedModel[];
    info: any;
  } | null>(null);
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [openapiStep, setOpenapiStep] = useState<'input' | 'preview' | 'result'>('input');

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const loadConnections = async () => {
    try {
      const data = await api.get('/import/connections');
      setConnections(data);
    } catch (error) {
      console.error('Failed to load connections');
    }
  };

  const handleAddConnection = async () => {
    try {
      await api.post('/import/connections', {
        ...connectionForm,
        database: connectionForm.database,
      });
      loadConnections();
      setConnectionForm({
        name: '',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: '',
        username: '',
        password: '',
        path: '',
      });
    } catch (error) {
      toast('error', '创建连接失败');
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    try {
      const result = await api.post(`/import/connections/${connectionId}/test`);
      setTestResult(result);
      setTimeout(() => setTestResult(null), 3000);
    } catch (error) {
      setTestResult({ success: false, message: 'Test failed' });
    }
  };

  const handleScan = async () => {
    if (!selectedConnection) return;
    try {
      const result = await api.post(`/import/connections/${selectedConnection}/scan`);
      setScanResult(result.tables);
      setSelectedTables(result.tables.map(t => t.name));
    } catch (error) {
      toast('error', '扫描失败');
    }
  };

  const handleImport = async () => {
    if (!selectedConnection || selectedTables.length === 0) return;
    try {
      const tablesToImport = scanResult.filter(t => selectedTables.includes(t.name));
      await api.post(`/import/connections/${selectedConnection}/import`, {
        tables: tablesToImport,
      });
      setImportSuccess(true);
      setTimeout(() => {
        setImportSuccess(false);
        setStep(1);
        setScanResult([]);
        setSelectedTables([]);
      }, 2000);
    } catch (error) {
      toast('error', '导入失败');
    }
  };

  const handleOpenApiParse = async () => {
    if (!openapiUrl && !openapiFile) {
      toast('error', '请提供 OpenAPI URL 或上传文件');
      return;
    }

    setParsing(true);
    try {
      let specData: any;
      if (openapiUrl) {
        const response = await fetch(openapiUrl);
        specData = await response.json();
      } else if (openapiFile) {
        specData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(JSON.parse(e.target?.result as string));
          reader.readAsText(openapiFile!);
        });
      }

      if (specData) {
        setOpenapiSpec(specData);
        const result = await api.post('/openapi/parse', { spec: specData });
        setParsedResult(result);
        setSelectedInterfaces(new Set(result.interfaces.map((_: any, i: number) => String(i))));
        setOpenapiStep('preview');
      }
    } catch (error: any) {
      toast('error', error.message || 'OpenAPI 解析失败');
    } finally {
      setParsing(false);
    }
  };

  const handleOpenApiImport = async () => {
    if (!openapiSpec) return;

    setImporting(true);
    try {
      const result = await api.post('/openapi/import', {
        spec: openapiSpec,
        options: { overwrite },
      });
      setImportResult(result);
      setOpenapiStep('result');
      toast('success', `成功导入 ${result.imported.interfaces} 个接口，${result.imported.models} 个模型`);
    } catch (error: any) {
      toast('error', error.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const toggleInterface = (index: string) => {
    setSelectedInterfaces((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  };

  const toggleTable = (tableName: string) => {
    setSelectedTables(prev =>
      prev.includes(tableName)
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    );
  };

  const selectAllTables = () => {
    setSelectedTables(scanResult.map(t => t.name));
  };

  const clearAllTables = () => {
    setSelectedTables([]);
  };

  return (
    <div className="p-8">
      {importSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">导入成功!</h3>
            <p className="text-gray-600 dark:text-gray-400">数据已成功导入到系统中</p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">数据导入</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          从数据库或 API 文档导入接口和数据模型
        </p>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setStep(1)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            step === 1
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          数据库导入
        </button>
        <button
          onClick={() => setStep(2)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            step === 2
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          OpenAPI 导入
        </button>
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              数据库连接
            </h3>

            {connectionForm.name && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">新建连接</h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="连接名称"
                    value={connectionForm.name}
                    onChange={(e) => setConnectionForm({ ...connectionForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                  />
                  <select
                    value={connectionForm.type}
                    onChange={(e) => setConnectionForm({ ...connectionForm, type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                  >
                    <option value="mysql">MySQL</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                  {connectionForm.type !== 'sqlite' && (
                    <>
                      <input type="text" placeholder="主机地址" value={connectionForm.host} onChange={(e) => setConnectionForm({ ...connectionForm, host: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                      <input type="number" placeholder="端口" value={connectionForm.port} onChange={(e) => setConnectionForm({ ...connectionForm, port: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                      <input type="text" placeholder="数据库名" value={connectionForm.database} onChange={(e) => setConnectionForm({ ...connectionForm, database: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                      <input type="text" placeholder="用户名" value={connectionForm.username} onChange={(e) => setConnectionForm({ ...connectionForm, username: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                      <input type="password" placeholder="密码" value={connectionForm.password} onChange={(e) => setConnectionForm({ ...connectionForm, password: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                    </>
                  )}
                  {connectionForm.type === 'sqlite' && (
                    <input type="text" placeholder="数据库文件路径" value={connectionForm.path} onChange={(e) => setConnectionForm({ ...connectionForm, path: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white" />
                  )}
                  <button onClick={handleAddConnection} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">创建连接</button>
                </div>
              </div>
            )}

            {!connectionForm.name && (
              <button
                onClick={() => setConnectionForm({ ...connectionForm, name: 'New Connection' })}
                className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">添加数据库连接</span>
              </button>
            )}

            <div className="space-y-3 mt-4">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedConnection === conn.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedConnection(conn.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{conn.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {conn.type} - {conn.type === 'sqlite' ? conn.path : `${conn.host}:${conn.port}/${conn.database_name}`}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTestConnection(conn.id); }}
                      className="p-2 text-gray-400 hover:text-blue-600"
                      title="测试连接"
                    >
                      {testResult?.success ? <Check className="w-5 h-5 text-green-600" /> : testResult?.success === false ? <X className="w-5 h-5 text-red-600" /> : <Terminal className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {connections.length === 0 && !connectionForm.name && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无数据库连接，请添加一个</p>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">扫描结果</h3>
            {selectedConnection ? (
              <>
                <button onClick={handleScan} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">扫描数据库</button>
                {scanResult.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">共 {scanResult.length} 张表，已选择 {selectedTables.length} 张</span>
                      <div className="flex gap-2">
                        <button onClick={selectAllTables} className="text-sm text-blue-600 hover:text-blue-700">全选</button>
                        <button onClick={clearAllTables} className="text-sm text-gray-500 hover:text-gray-700">清空</button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {scanResult.map((table) => (
                        <div key={table.name} className={`p-4 rounded-lg border transition-colors ${selectedTables.includes(table.name) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={selectedTables.includes(table.name)} onChange={() => toggleTable(table.name)} className="w-4 h-4 text-blue-600" />
                              <span className="font-medium text-gray-900 dark:text-white">{table.name}</span>
                            </label>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{table.columns.length} 个字段</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {table.columns.slice(0, 5).map((col) => (
                              <span key={col.name} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{col.name}: {col.type}</span>
                            ))}
                            {table.columns.length > 5 && <span className="text-xs px-2 py-1 text-gray-400">+{table.columns.length - 5}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleImport} disabled={selectedTables.length === 0} className="mt-4 w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">导入选中的 {selectedTables.length} 张表</button>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">选择连接后扫描数据库</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">请先选择一个数据库连接</p>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-4xl mx-auto">
          {openapiStep === 'input' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                OpenAPI / Swagger 导入
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">OpenAPI URL</label>
                  <input
                    type="text"
                    placeholder="https://example.com/openapi.json"
                    value={openapiUrl}
                    onChange={(e) => setOpenapiUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">或上传文件</label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                    <input type="file" accept=".json,.yaml,.yml" onChange={(e) => setOpenapiFile(e.target.files?.[0] || null)} className="hidden" id="openapi-file" />
                    <label htmlFor="openapi-file" className="cursor-pointer">
                      <Download className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400 mb-2">点击或拖拽文件到这里</p>
                      <p className="text-sm text-gray-400">支持 JSON、YAML 格式的 OpenAPI 3.0 / Swagger 2.0</p>
                    </label>
                    {openapiFile && (
                      <p className="mt-4 text-green-600 dark:text-green-400">已选择: {openapiFile.name}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleOpenApiParse}
                  disabled={parsing}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {parsing ? '解析中...' : '解析并预览'}
                </button>
              </div>
            </div>
          )}

          {openapiStep === 'preview' && parsedResult && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{parsedResult.info?.title || 'API'}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">版本 {parsedResult.info?.version || '1.0.0'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={overwrite}
                        onChange={(e) => setOverwrite(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      覆盖已存在
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{parsedResult.interfaces.length}</p>
                    <p className="text-sm text-blue-600/70">接口</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{parsedResult.models.length}</p>
                    <p className="text-sm text-green-600/70">模型</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {parsedResult.interfaces.reduce((sum, i) => sum + (i.parameters?.length || 0), 0)}
                    </p>
                    <p className="text-sm text-purple-600/70">参数</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase">接口列表</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedInterfaces(new Set(parsedResult.interfaces.map((_, i) => String(i))))}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      全选
                    </button>
                    <button
                      onClick={() => setSelectedInterfaces(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {parsedResult.interfaces.map((iface, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border transition-colors ${
                        selectedInterfaces.has(String(index))
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedInterfaces.has(String(index))}
                          onChange={() => toggleInterface(String(index))}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[iface.method] || 'bg-gray-100 text-gray-700'}`}>
                          {iface.method}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {iface.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {iface.path} {iface.parameters?.length > 0 && `· ${iface.parameters.length} 个参数`}
                          </p>
                        </div>
                        {iface.deprecated && (
                          <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs rounded">
                            已弃用
                          </span>
                        )}
                        {iface.category && (
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded">
                            {iface.category}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {parsedResult.models.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase mb-3">数据模型</h4>
                  <div className="space-y-2">
                    {parsedResult.models.map((model, index) => (
                      <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{model.name}</span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{model.fields.length} 个字段</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {model.fields.slice(0, 6).map((field: any) => (
                            <span key={field.name} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                              {field.name}: {field.type}
                            </span>
                          ))}
                          {model.fields.length > 6 && (
                            <span className="text-xs text-gray-400">+{model.fields.length - 6}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setOpenapiStep('input')}
                  className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  返回修改
                </button>
                <button
                  onClick={handleOpenApiImport}
                  disabled={importing || selectedInterfaces.size === 0}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  {importing ? '导入中...' : `导入 ${selectedInterfaces.size} 个接口和 ${parsedResult.models.length} 个模型`}
                </button>
              </div>
            </div>
          )}

          {openapiStep === 'result' && importResult && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">导入完成</h3>
              <div className="grid grid-cols-4 gap-4 max-w-lg mx-auto mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <p className="text-xl font-bold text-blue-600">{importResult.imported.interfaces}</p>
                  <p className="text-xs text-blue-600/70">接口</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-xl font-bold text-green-600">{importResult.imported.models}</p>
                  <p className="text-xs text-green-600/70">模型</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                  <p className="text-xl font-bold text-purple-600">{importResult.imported.parameters}</p>
                  <p className="text-xs text-purple-600/70">参数</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                  <p className="text-xl font-bold text-yellow-600">{importResult.imported.skipped}</p>
                  <p className="text-xs text-yellow-600/70">跳过</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => {
                    setOpenapiStep('input');
                    setOpenapiUrl('');
                    setOpenapiFile(null);
                    setParsedResult(null);
                    setImportResult(null);
                  }}
                  className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  继续导入
                </button>
                <a
                  href="/interfaces"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  查看接口列表
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
