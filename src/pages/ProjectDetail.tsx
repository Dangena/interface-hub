import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Link, Play, Download, Database, FileText, Code, Table, GitBranch, ChevronDown, ChevronRight, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface ParsedInterface {
  name: string;
  path: string;
  method: string;
  source: 'frontend' | 'backend';
  framework: string;
  tags: string[];
  parameters: Array<{ name: string; type: string; required: boolean; location: string }>;
}

interface ParsedModel {
  name: string;
  fields: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean }>;
  source: string;
  tableName: string;
}

interface ParsedTable {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean }>;
  indexes: any[];
}

interface Association {
  frontend: string;
  backend: string;
  model: string;
  table: string;
  modelFields: string[];
  tableFields: string[];
  confidence: number;
  matchType: string;
  reasoning: string;
}

interface ParseStats {
  frontendFiles: number;
  backendFiles: number;
  sqlFiles: number;
  parseTime: number;
  totalLines: number;
}

interface ParsedResult {
  interfaces: ParsedInterface[];
  models: ParsedModel[];
  tables: ParsedTable[];
  associations: Association[];
  parseStats: ParseStats;
}

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  code_files: Record<string, string> | null;
  parsed_result: ParsedResult | null;
  interfaces: any[];
  models: any[];
  mappings: any[];
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

const matchTypeColors: Record<string, string> = {
  exact: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  path: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  semantic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  field: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  inferred: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
};

type StepStatus = 'pending' | 'current' | 'completed';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    frontendInterfaces: true,
    backendInterfaces: true,
    models: true,
    tables: true,
    associations: true,
  });

  useEffect(() => {
    if (id) loadProject();
  }, [id]);

  useEffect(() => {
    if (project?.parsed_result) {
      setCurrentStep(2);
    }
  }, [project?.parsed_result]);

  const loadProject = async () => {
    try {
      const data = await api.get(`/projects/${id}`);
      setProject(data);
    } catch (error: any) {
      toast('error', error.message || '加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast('error', '请上传 ZIP 格式的文件');
      return;
    }
    setUploading(true);
    try {
      await api.upload(`/projects/${id}/upload`, file);
      toast('success', '文件上传成功');
      loadProject();
    } catch (error: any) {
      toast('error', error.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFetchUrl = async () => {
    if (!repoUrl.trim()) {
      toast('error', '请输入仓库地址');
      return;
    }
    setFetchingUrl(true);
    try {
      await api.post(`/projects/${id}/fetch-url`, { url: repoUrl.trim() });
      toast('success', '代码拉取成功');
      setRepoUrl('');
      loadProject();
    } catch (error: any) {
      toast('error', error.message || '拉取失败');
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleParse = async () => {
    setParsing(true);
    try {
      const resp = await api.post(`/projects/${id}/parse`, {
        options: { enableAutoAssociation: true },
      });
      const result = resp.result || resp;
      setProject((prev) => prev ? { ...prev, parsed_result: result } : prev);
      setCurrentStep(2);
      toast('success', '解析完成');
    } catch (error: any) {
      toast('error', error.message || '解析失败');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await api.post(`/projects/${id}/import`, {
        options: { overwrite: true },
      });
      setCurrentStep(3);
      toast('success', '导入成功');
      loadProject();
    } catch (error: any) {
      toast('error', error.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getStepStatus = (step: number): StepStatus => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return 'current';
    return 'pending';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8">
        <p className="text-gray-500 dark:text-gray-400">项目不存在</p>
      </div>
    );
  }

  const parsedResult = project.parsed_result;
  const frontendInterfaces = parsedResult?.interfaces?.filter((i) => i.source === 'frontend') || [];
  const backendInterfaces = parsedResult?.interfaces?.filter((i) => i.source === 'backend') || [];
  const hasCodeFiles = project.code_files && Object.keys(project.code_files).length > 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          返回项目列表
        </button>
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: project.color + '20' }}
          >
            <Code className="w-6 h-6" style={{ color: project.color }} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
            {project.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">{project.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[
            { step: 1, label: '上传代码', icon: Upload, desc: '上传 ZIP 或输入仓库地址' },
            { step: 2, label: '解析分析', icon: Play, desc: '解析代码结构并关联' },
            { step: 3, label: '导入数据', icon: Download, desc: '将解析结果导入系统' },
          ].map(({ step, label, icon: Icon, desc }, index) => {
            const status = getStepStatus(step);
            return (
              <div key={step} className="flex items-center flex-1">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      status === 'completed'
                        ? 'bg-green-600 text-white'
                        : status === 'current'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {status === 'completed' ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-semibold text-sm ${
                        status === 'completed'
                          ? 'text-green-600 dark:text-green-400'
                          : status === 'current'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      步骤 {step}: {label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{desc}</p>
                  </div>
                </div>
                {index < 2 && (
                  <div
                    className={`h-0.5 w-16 mx-4 ${
                      status === 'completed' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Upload className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">上传 ZIP 文件</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                上传包含前后端代码的 ZIP 压缩包，系统将自动识别并解析其中的接口、模型和表结构
              </p>
              <div
                ref={dropZoneRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    dragOver
                      ? 'bg-blue-100 dark:bg-blue-900/40'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <Upload
                    className={`w-6 h-6 ${
                      dragOver ? 'text-blue-600' : 'text-gray-400'
                    }`}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {dragOver ? '松开以上传文件' : '拖拽 ZIP 文件到此处'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    或点击选择文件 · 支持 .zip 格式
                  </p>
                </div>
                {uploading && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm">上传中...</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileInputChange}
                className="hidden"
              />
              {hasCodeFiles && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-400">
                    已上传 {Object.keys(project.code_files).length} 个文件
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Link className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">从仓库拉取</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                输入 GitHub 仓库地址，系统将自动拉取代码并进行解析
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    仓库地址
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                    />
                    <button
                      onClick={handleFetchUrl}
                      disabled={fetchingUrl || !repoUrl.trim()}
                      className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0 transition-colors"
                    >
                      {fetchingUrl ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          拉取中...
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4" />
                          拉取
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    支持的仓库格式：https://github.com/owner/repo · https://github.com/owner/repo/tree/branch
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={handleParse}
              disabled={parsing || !hasCodeFiles}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {parsing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  解析中...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  开始解析
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && parsedResult && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">解析统计</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 text-center">
                <FileText className="w-5 h-5 text-orange-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {parsedResult.parseStats?.frontendFiles || 0}
                </p>
                <p className="text-xs text-orange-600/70 dark:text-orange-400/70 mt-1">前端文件</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
                <FileText className="w-5 h-5 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {parsedResult.parseStats?.backendFiles || 0}
                </p>
                <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">后端文件</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                <Database className="w-5 h-5 text-purple-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {parsedResult.parseStats?.sqlFiles || 0}
                </p>
                <p className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-1">SQL 文件</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                <Code className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {parsedResult.parseStats?.totalLines || 0}
                </p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">代码行数</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
                <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {parsedResult.parseStats?.parseTime || 0}ms
                </p>
                <p className="text-xs text-gray-600/70 dark:text-gray-400/70 mt-1">解析耗时</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Code className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {parsedResult.interfaces?.length || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">接口总数</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {parsedResult.models?.length || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">数据模型</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Table className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {parsedResult.tables?.length || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">数据库表</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {parsedResult.associations?.length || 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">关联关系</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button
              onClick={() => toggleSection('frontendInterfaces')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-orange-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  前端接口 ({frontendInterfaces.length})
                </h3>
              </div>
              {expandedSections.frontendInterfaces ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSections.frontendInterfaces && (
              <div className="overflow-x-auto">
                {frontendInterfaces.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          方法
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          路径
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          名称
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          框架
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          标签
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {frontendInterfaces.map((iface, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                methodColors[iface.method] || methodColors.GET
                              }`}
                            >
                              {iface.method}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                            {iface.path}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {iface.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded text-xs">
                              {iface.framework}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {iface.tags?.map((tag, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">未检测到前端接口</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button
              onClick={() => toggleSection('backendInterfaces')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  后端接口 ({backendInterfaces.length})
                </h3>
              </div>
              {expandedSections.backendInterfaces ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSections.backendInterfaces && (
              <div className="overflow-x-auto">
                {backendInterfaces.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          方法
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          路径
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          名称
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          框架
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          标签
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {backendInterfaces.map((iface, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                methodColors[iface.method] || methodColors.GET
                              }`}
                            >
                              {iface.method}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                            {iface.path}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {iface.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded text-xs">
                              {iface.framework}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {iface.tags?.map((tag, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">未检测到后端接口</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button
              onClick={() => toggleSection('models')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  数据模型 ({parsedResult.models?.length || 0})
                </h3>
              </div>
              {expandedSections.models ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSections.models && (
              <div className="overflow-x-auto">
                {parsedResult.models?.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          模型名称
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          字段数
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          来源
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          关联表
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          字段详情
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {parsedResult.models.map((model, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                            {model.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 rounded text-xs font-medium">
                              {model.fields?.length || 0} 个字段
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded text-xs">
                              {model.source}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                            {model.tableName || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {model.fields?.slice(0, 5).map((field, i) => (
                                <span
                                  key={i}
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    field.primaryKey
                                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  {field.name}:{field.type}
                                  {field.primaryKey ? ' (PK)' : ''}
                                </span>
                              ))}
                              {model.fields?.length > 5 && (
                                <span className="text-xs text-gray-400">
                                  +{model.fields.length - 5} 更多
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">未检测到数据模型</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button
              onClick={() => toggleSection('tables')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  数据库表 ({parsedResult.tables?.length || 0})
                </h3>
              </div>
              {expandedSections.tables ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSections.tables && (
              <div className="p-4">
                {parsedResult.tables?.length > 0 ? (
                  <div className="space-y-4">
                    {parsedResult.tables.map((table, index) => (
                      <div
                        key={index}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Table className="w-4 h-4 text-purple-600" />
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {table.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {table.columns?.length || 0} 列
                            </span>
                          </div>
                          {table.indexes?.length > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded">
                              {table.indexes.length} 个索引
                            </span>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                <th className="pb-2 text-left font-medium">列名</th>
                                <th className="pb-2 text-left font-medium">类型</th>
                                <th className="pb-2 text-left font-medium">可空</th>
                                <th className="pb-2 text-left font-medium">主键</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                              {table.columns?.map((col, ci) => (
                                <tr key={ci}>
                                  <td className="py-1.5 font-mono text-gray-900 dark:text-white">
                                    {col.name}
                                  </td>
                                  <td className="py-1.5 text-gray-600 dark:text-gray-400 font-mono text-xs">
                                    {col.type}
                                  </td>
                                  <td className="py-1.5">
                                    {col.nullable ? (
                                      <span className="text-gray-400 text-xs">YES</span>
                                    ) : (
                                      <span className="text-red-500 text-xs font-medium">NO</span>
                                    )}
                                  </td>
                                  <td className="py-1.5">
                                    {col.primaryKey && (
                                      <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded text-xs">
                                        PK
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">未检测到数据库表</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button
              onClick={() => toggleSection('associations')}
              className="w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  关联关系 ({parsedResult.associations?.length || 0})
                </h3>
              </div>
              {expandedSections.associations ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSections.associations && (
              <div className="p-4">
                {parsedResult.associations?.length > 0 ? (
                  <div className="space-y-3">
                    {parsedResult.associations.map((assoc, index) => (
                      <div
                        key={index}
                        className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs rounded font-medium">
                            前端
                          </span>
                          <span className="text-sm text-gray-900 dark:text-white font-mono">
                            {assoc.frontend || '-'}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded font-medium">
                            后端
                          </span>
                          <span className="text-sm text-gray-900 dark:text-white font-mono">
                            {assoc.backend || '-'}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 text-xs rounded font-medium">
                            模型
                          </span>
                          <span className="text-sm text-gray-900 dark:text-white font-mono">
                            {assoc.model || '-'}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs rounded font-medium">
                            表
                          </span>
                          <span className="text-sm text-gray-900 dark:text-white font-mono">
                            {assoc.table || '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">匹配类型:</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                matchTypeColors[assoc.matchType] || matchTypeColors.inferred
                              }`}
                            >
                              {assoc.matchType}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">置信度:</span>
                            <div className="flex items-center gap-1">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  assoc.confidence >= 0.8
                                    ? 'bg-green-500'
                                    : assoc.confidence >= 0.5
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-400'
                                }`}
                              />
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {Math.round(assoc.confidence * 100)}%
                              </span>
                            </div>
                          </div>
                          {assoc.reasoning && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">原因:</span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {assoc.reasoning}
                              </span>
                            </div>
                          )}
                          {assoc.modelFields && assoc.modelFields.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">模型字段:</span>
                              <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                                {assoc.modelFields.join(', ')}
                              </span>
                            </div>
                          )}
                          {assoc.tableFields && assoc.tableFields.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">表字段:</span>
                              <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                                {assoc.tableFields.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">未检测到关联关系</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              重新上传
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  导入中...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  导入到系统
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">导入完成</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            项目数据已成功导入到系统中，你可以在接口列表和模型管理中查看
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                setCurrentStep(1);
                loadProject();
              }}
              className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              继续导入
            </button>
            <button
              onClick={() => navigate('/interfaces')}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              查看接口列表
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
