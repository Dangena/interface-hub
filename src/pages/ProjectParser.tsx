import { useState, useRef } from 'react';
import { FolderOpen, Code, Database, Link2, Upload, Check, X, ChevronDown, ChevronRight, Download, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface ParsedInterface {
  name: string;
  path: string;
  method: string;
  description: string;
  parameters: Array<{ name: string; location: string; type: string; required: boolean }>;
  tags: string[];
  source: 'frontend' | 'backend';
}

interface ParsedModel {
  name: string;
  fields: Array<{ name: string; type: string; nullable: boolean; primaryKey?: boolean; comment?: string }>;
  source: 'code' | 'database';
}

interface ParsedTable {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean; default?: string; comment?: string }>;
  source: 'sql' | 'connection';
}

interface Association {
  frontend: string;
  backend: string;
  table?: string;
  model?: string;
  confidence: number;
}

interface ParseResult {
  interfaces: ParsedInterface[];
  models: ParsedModel[];
  tables: ParsedTable[];
  associations: Association[];
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

export default function ProjectParser() {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'import'>('upload');
  const [frontendCode, setFrontendCode] = useState('');
  const [backendCode, setBackendCode] = useState('');
  const [sqlCode, setSqlCode] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    frontend: true,
    backend: true,
    models: true,
    tables: true,
    associations: true,
  });

  const frontendInputRef = useRef<HTMLTextAreaElement>(null);
  const backendInputRef = useRef<HTMLTextAreaElement>(null);
  const sqlInputRef = useRef<HTMLTextAreaElement>(null);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setter((event.target?.result as string) || '');
    };
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!frontendCode.trim() && !backendCode.trim() && !sqlCode.trim()) {
      toast('error', '请至少上传一个代码文件');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post('/project-parser/parse/project', {
        frontendCode: frontendCode || undefined,
        backendCode: backendCode || undefined,
        sqlStatements: sqlCode || undefined,
      });

      setParseResult(result);
      setSelectedInterfaces(new Set(result.interfaces.map((i: any) => `${i.source}-${i.path}-${i.method}`)));
      setSelectedModels(new Set(result.models.map((m: any) => `${m.source}-${m.name}`)));
      setSelectedTables(new Set(result.tables.map((t: any) => t.name)));
      setActiveTab('preview');
      toast('success', `解析完成: ${result.interfaces.length} 个接口, ${result.models.length} 个模型, ${result.tables.length} 个表`);
    } catch (error: any) {
      toast('error', error.message || '解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult) return;

    const interfacesToImport = parseResult.interfaces.filter(
      (i) => selectedInterfaces.has(`${i.source}-${i.path}-${i.method}`)
    );
    const modelsToImport = parseResult.models.filter(
      (m) => selectedModels.has(`${m.source}-${m.name}`)
    );
    const tablesToImport = parseResult.tables.filter((t) => selectedTables.has(t.name));

    if (interfacesToImport.length === 0 && modelsToImport.length === 0 && tablesToImport.length === 0) {
      toast('error', '请至少选择一项导入');
      return;
    }

    setImporting(true);
    try {
      const result = await api.post('/project-parser/import/project', {
        interfaces: interfacesToImport,
        models: modelsToImport,
        tables: tablesToImport,
        options: { overwrite },
      });

      toast('success', `导入成功: ${result.imported.interfaces} 接口, ${result.imported.models} 模型, ${result.imported.tables} 表`);
      setActiveTab('import');
    } catch (error: any) {
      toast('error', error.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const toggleInterface = (key: string) => {
    setSelectedInterfaces((prev) => {
      const newSet = new Set(prev);
      newSet.has(key) ? newSet.delete(key) : newSet.add(key);
      return newSet;
    });
  };

  const toggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const newSet = new Set(prev);
      newSet.has(key) ? newSet.delete(key) : newSet.add(key);
      return newSet;
    });
  };

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      newSet.has(name) ? newSet.delete(name) : newSet.add(name);
      return newSet;
    });
  };

  const selectAllInCategory = (
    category: 'frontend' | 'backend' | 'models' | 'tables',
    select: boolean
  ) => {
    if (!parseResult) return;

    if (category === 'frontend') {
      const frontendKeys = parseResult.interfaces
        .filter((i) => i.source === 'frontend')
        .map((i) => `${i.source}-${i.path}-${i.method}`);
      setSelectedInterfaces((prev) => {
        const newSet = new Set(prev);
        frontendKeys.forEach((k) => (select ? newSet.add(k) : newSet.delete(k)));
        return newSet;
      });
    } else if (category === 'backend') {
      const backendKeys = parseResult.interfaces
        .filter((i) => i.source === 'backend')
        .map((i) => `${i.source}-${i.path}-${i.method}`);
      setSelectedInterfaces((prev) => {
        const newSet = new Set(prev);
        backendKeys.forEach((k) => (select ? newSet.add(k) : newSet.delete(k)));
        return newSet;
      });
    } else if (category === 'models') {
      const modelKeys = parseResult.models.map((m) => `${m.source}-${m.name}`);
      setSelectedModels((prev) => {
        const newSet = new Set(prev);
        modelKeys.forEach((k) => (select ? newSet.add(k) : newSet.delete(k)));
        return newSet;
      });
    } else if (category === 'tables') {
      const tableNames = parseResult.tables.map((t) => t.name);
      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        tableNames.forEach((n) => (select ? newSet.add(n) : newSet.delete(n)));
        return newSet;
      });
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const frontendInterfaces = parseResult?.interfaces.filter((i) => i.source === 'frontend') || [];
  const backendInterfaces = parseResult?.interfaces.filter((i) => i.source === 'backend') || [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">项目解析器</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          解析前后端代码和数据库结构，智能关联前后端接口
        </p>
      </div>

      <div className="flex items-center gap-4 mb-8">
        {(['upload', 'preview', 'import'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            disabled={tab === 'preview' && !parseResult}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${tab === 'preview' && !parseResult ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {tab === 'upload' ? '上传代码' : tab === 'preview' ? '预览选择' : '导入结果'}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">前端代码</h3>
                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded">
                  React/Vue
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              解析 axios.get(), fetch(), useQuery() 等 API 调用
            </p>
            <input
              type="file"
              accept=".ts,.tsx,.js,.jsx,.vue"
              onChange={(e) => handleFileUpload(e, setFrontendCode)}
              className="hidden"
              id="frontend-file"
            />
            <label
              htmlFor="frontend-file"
              className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 transition-colors mb-4"
            >
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">上传前端代码文件</span>
            </label>
            <textarea
              ref={frontendInputRef}
              value={frontendCode}
              onChange={(e) => setFrontendCode(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
              placeholder={`// 示例: axios.get('/api/users')\n// 示例: fetch('/api/products', { method: 'POST' })\n// 示例: useQuery(['user', id], () => api.get(\`/api/users/\${id}\`))`}
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">后端代码</h3>
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded">
                  Java/Node/Python/Go
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              解析 @GetMapping, router.get(), @app.route() 等路由定义
            </p>
            <input
              type="file"
              accept=".java,.ts,.js,.py,.go"
              onChange={(e) => handleFileUpload(e, setBackendCode)}
              className="hidden"
              id="backend-file"
            />
            <label
              htmlFor="backend-file"
              className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-green-500 transition-colors mb-4"
            >
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">上传后端代码文件</span>
            </label>
            <textarea
              ref={backendInputRef}
              value={backendCode}
              onChange={(e) => setBackendCode(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
              placeholder={`// 示例: @RestController\nclass UserController {\n    @GetMapping("/api/users")\n    public List<User> getUsers() {}\n}\n\n// 示例: router.get('/api/users', ...)\n// 示例: @app.route("/api/users")`}
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据库 SQL</h3>
                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 rounded">
                  MySQL/PostgreSQL
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              解析 CREATE TABLE 语句，提取表结构和字段
            </p>
            <input
              type="file"
              accept=".sql"
              onChange={(e) => handleFileUpload(e, setSqlCode)}
              className="hidden"
              id="sql-file"
            />
            <label
              htmlFor="sql-file"
              className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-purple-500 transition-colors mb-4"
            >
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">上传 SQL 文件</span>
            </label>
            <textarea
              ref={sqlInputRef}
              value={sqlCode}
              onChange={(e) => setSqlCode(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
              placeholder={`CREATE TABLE users (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(100) NOT NULL,\n  email VARCHAR(255) UNIQUE,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`}
            />
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              覆盖已存在的同名数据
            </label>
          </div>
          <button
            onClick={handleParse}
            disabled={loading || (!frontendCode.trim() && !backendCode.trim() && !sqlCode.trim())}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <FolderOpen className="w-5 h-5" />
            {loading ? '解析中...' : '开始解析'}
          </button>
        </div>
      )}

      {activeTab === 'preview' && parseResult && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{frontendInterfaces.length}</p>
                <p className="text-sm text-orange-600/70">前端接口</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{backendInterfaces.length}</p>
                <p className="text-sm text-green-600/70">后端接口</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{parseResult.models.length}</p>
                <p className="text-sm text-blue-600/70">数据模型</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{parseResult.tables.length}</p>
                <p className="text-sm text-purple-600/70">数据库表</p>
              </div>
            </div>
          </div>

          {parseResult.associations.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <button
                onClick={() => toggleSection('associations')}
                className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    前后端关联 ({parseResult.associations.length})
                  </h3>
                </div>
                {expandedSections.associations ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {expandedSections.associations && (
                <div className="p-4 space-y-3">
                  {parseResult.associations.map((assoc, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex-1 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                          前端
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                          {assoc.frontend || '-'}
                        </span>
                      </div>
                      <Link2 className="w-4 h-4 text-gray-400" />
                      <div className="flex-1 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                          后端
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                          {assoc.backend || '-'}
                        </span>
                      </div>
                      {assoc.model && (
                        <>
                          <Database className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {assoc.model}
                          </span>
                        </>
                      )}
                      <div className="flex items-center gap-1">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            assoc.confidence >= 0.9
                              ? 'bg-green-500'
                              : assoc.confidence >= 0.7
                              ? 'bg-yellow-500'
                              : 'bg-gray-400'
                          }`}
                          title={`匹配置信度: ${Math.round(assoc.confidence * 100)}%`}
                        />
                        <span className="text-xs text-gray-500">{Math.round(assoc.confidence * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <button
              onClick={() => toggleSection('frontend')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-orange-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  前端接口 ({frontendInterfaces.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('frontend', true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('frontend', false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
                {expandedSections.frontend ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>
            {expandedSections.frontend && (
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {frontendInterfaces.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">未解析到前端接口</p>
                ) : (
                  frontendInterfaces.map((iface) => (
                    <label
                      key={`frontend-${iface.path}-${iface.method}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedInterfaces.has(`frontend-${iface.path}-${iface.method}`)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInterfaces.has(`frontend-${iface.path}-${iface.method}`)}
                        onChange={() => toggleInterface(`frontend-${iface.path}-${iface.method}`)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[iface.method]}`}>
                        {iface.method}
                      </span>
                      <span className="text-sm font-mono text-gray-900 dark:text-white">{iface.path}</span>
                      <span className="text-xs text-gray-500">{iface.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <button
              onClick={() => toggleSection('backend')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  后端接口 ({backendInterfaces.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('backend', true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('backend', false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
                {expandedSections.backend ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>
            {expandedSections.backend && (
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {backendInterfaces.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">未解析到后端接口</p>
                ) : (
                  backendInterfaces.map((iface) => (
                    <label
                      key={`backend-${iface.path}-${iface.method}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedInterfaces.has(`backend-${iface.path}-${iface.method}`)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInterfaces.has(`backend-${iface.path}-${iface.method}`)}
                        onChange={() => toggleInterface(`backend-${iface.path}-${iface.method}`)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[iface.method]}`}>
                        {iface.method}
                      </span>
                      <span className="text-sm font-mono text-gray-900 dark:text-white">{iface.path}</span>
                      <span className="text-xs text-gray-500">{iface.name}</span>
                      <div className="flex gap-1">
                        {iface.tags.map((tag) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <button
              onClick={() => toggleSection('models')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  数据模型 ({parseResult.models.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('models', true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('models', false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
                {expandedSections.models ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>
            {expandedSections.models && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
                {parseResult.models.length === 0 ? (
                  <p className="text-center text-gray-500 py-4 col-span-2">未解析到数据模型</p>
                ) : (
                  parseResult.models.map((model) => (
                    <label
                      key={`${model.source}-${model.name}`}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedModels.has(`${model.source}-${model.name}`)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedModels.has(`${model.source}-${model.name}`)}
                          onChange={() => toggleModel(`${model.source}-${model.name}`)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="font-medium text-gray-900 dark:text-white">{model.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          model.source === 'code'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        }`}>
                          {model.source === 'code' ? '代码' : '数据库'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {model.fields.slice(0, 6).map((field) => (
                          <span
                            key={field.name}
                            className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded"
                          >
                            {field.name}: {field.type}
                          </span>
                        ))}
                        {model.fields.length > 6 && (
                          <span className="text-xs text-gray-400">+{model.fields.length - 6}</span>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <button
              onClick={() => toggleSection('tables')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  数据库表 ({parseResult.tables.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('tables', true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAllInCategory('tables', false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
                {expandedSections.tables ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>
            {expandedSections.tables && (
              <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                {parseResult.tables.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">未解析到数据库表</p>
                ) : (
                  parseResult.tables.map((table) => (
                    <label
                      key={table.name}
                      className={`block p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedTables.has(table.name)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedTables.has(table.name)}
                          onChange={() => toggleTable(table.name)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="font-medium text-gray-900 dark:text-white">{table.name}</span>
                        <span className="text-xs text-gray-500">{table.columns.length} 个字段</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {table.columns.map((col) => (
                          <span
                            key={col.name}
                            className={`text-xs px-2 py-1 rounded ${
                              col.primaryKey
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                                : col.nullable
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                            }`}
                          >
                            {col.name} {col.type} {col.primaryKey ? '(PK)' : ''}
                          </span>
                        ))}
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveTab('upload')}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              返回修改
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Check className="w-5 h-5" />
              {importing ? '导入中...' : `导入 ${selectedInterfaces.size} 个接口、${selectedModels.size} 个模型、${selectedTables.size} 个表`}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">导入完成</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            项目数据已成功导入到系统中
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                setActiveTab('upload');
                setParseResult(null);
                setFrontendCode('');
                setBackendCode('');
                setSqlCode('');
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
  );
}
