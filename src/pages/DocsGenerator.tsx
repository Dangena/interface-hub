import { useEffect, useState } from 'react';
import { FileText, Download, Copy, Eye, Code, Database, Link2, Check, FileJson, FileCode } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

export default function DocsGenerator() {
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<any>(null);
  const [docData, setDocData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown'>('preview');

  useEffect(() => {
    loadInterfaces();
  }, []);

  useEffect(() => {
    if (selectedInterface) {
      loadDocPreview(selectedInterface.id);
    }
  }, [selectedInterface]);

  const loadInterfaces = async () => {
    try {
      const data = await api.get('/interfaces');
      setInterfaces(Array.isArray(data) ? data : data.data || []);
    } catch (error) {
      console.error('Failed to load interfaces:', error);
    }
  };

  const loadDocPreview = async (interfaceId: string) => {
    setLoading(true);
    try {
      const data = await api.get(`/docs/generate/${interfaceId}`);
      setDocData(data);
    } catch (error) {
      console.error('Failed to generate doc:', error);
      setDocData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportSingle = async () => {
    if (!selectedInterface) return;
    
    setExporting(true);
    try {
      const response = await fetch(`/api/docs/export/${selectedInterface.id}`, {
        headers: { Accept: 'text/markdown' }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedInterface.name.replace(/\s+/g, '_')}_API.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export doc:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/docs/export-all', {
        headers: { Accept: 'text/markdown' }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'API_Documentation.md';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export all docs:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (docData?.markdown) {
      navigator.clipboard.writeText(docData.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportOpenApiJson = async () => {
    setExporting(true);
    try {
      const blob = await api.download('/openapi/export?format=json');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openapi.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast('success', 'OpenAPI JSON 导出成功');
    } catch (error: any) {
      toast('error', error.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleExportOpenApiYaml = async () => {
    setExporting(true);
    try {
      const blob = await api.download('/openapi/export?format=yaml');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openapi.yaml';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast('success', 'OpenAPI YAML 导出成功');
    } catch (error: any) {
      toast('error', error.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <FileText className="w-8 h-8" />
          API 文档生成器
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          自动生成美观的 API 文档，支持 Markdown 导出
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">选择接口</h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {interfaces.map((iface) => (
                <button
                  key={iface.id}
                  onClick={() => setSelectedInterface(iface)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedInterface?.id === iface.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                      : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      iface.method === 'GET' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      iface.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      iface.method === 'PUT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      iface.method === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                    }`}>
                      {iface.method}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {iface.name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {iface.path}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              导出全部文档
            </button>
            <button
              onClick={handleExportOpenApiJson}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileJson className="w-4 h-4" />
              导出 OpenAPI JSON
            </button>
            <button
              onClick={handleExportOpenApiYaml}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileCode className="w-4 h-4" />
              导出 OpenAPI YAML
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedInterface ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    selectedInterface.method === 'GET' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    selectedInterface.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    selectedInterface.method === 'PUT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {selectedInterface.method}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedInterface.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportSingle}
                    disabled={exporting}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    导出
                  </button>
                  <button
                    onClick={handleCopyMarkdown}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      activeTab === 'preview'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Eye className="w-4 h-4 inline mr-2" />
                    预览
                  </button>
                  <button
                    onClick={() => setActiveTab('markdown')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      activeTab === 'markdown'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Code className="w-4 h-4 inline mr-2" />
                    Markdown
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                ) : docData ? (
                  activeTab === 'preview' ? (
                    <div className="space-y-6">
                      <div className="prose dark:prose-invert max-w-none">
                        <h1 className="text-2xl font-bold">{docData.title}</h1>
                        <p className="text-gray-600 dark:text-gray-400 italic">{selectedInterface.description}</p>

                        <h2 className="text-xl font-semibold mt-6">基本信息</h2>
                        <ul className="list-disc pl-5 space-y-1">
                          <li><strong>方法:</strong> <code>{docData.endpoint.split('\n')[0]?.replace('**Method**: ', '')}</code></li>
                          <li><strong>路径:</strong> <code>{docData.endpoint.split('\n')[1]?.replace('**Path**: ', '')}</code></li>
                          <li><strong>分类:</strong> {selectedInterface.category}</li>
                          <li><strong>状态:</strong> {selectedInterface.status}</li>
                          <li><strong>版本:</strong> {docData.version}</li>
                        </ul>

                        {docData.parameters && docData.parameters.length > 0 && (
                          <>
                            <h2 className="text-xl font-semibold mt-6">参数</h2>
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">名称</th>
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">位置</th>
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">类型</th>
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">必填</th>
                                </tr>
                              </thead>
                              <tbody>
                                {docData.parameters.map((param: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2"><code>{param.name}</code></td>
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">{param.in}</td>
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2"><code>{param.type}</code></td>
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">{param.required ? '✓' : '✗'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}

                        {docData.mappings && docData.mappings.length > 0 && (
                          <>
                            <h2 className="text-xl font-semibold mt-6">字段映射</h2>
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">接口字段</th>
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">模型</th>
                                  <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left">模型字段</th>
                                </tr>
                              </thead>
                              <tbody>
                                {docData.mappings.map((mapping: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2"><code>{mapping.interfaceField}</code></td>
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                                      <span className="flex items-center gap-1">
                                        <Database className="w-4 h-4" />
                                        {mapping.modelName}
                                      </span>
                                    </td>
                                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2"><code>{mapping.modelField}</code></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}

                        {docData.examples && (
                          <>
                            {docData.examples.request && (
                              <>
                                <h2 className="text-xl font-semibold mt-6">请求示例</h2>
                                <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                                  <code className="text-sm">{JSON.stringify(docData.examples.request, null, 2)}</code>
                                </pre>
                              </>
                            )}

                            {docData.examples.response && (
                              <>
                                <h2 className="text-xl font-semibold mt-6">响应示例</h2>
                                <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                                  <code className="text-sm">{JSON.stringify(docData.examples.response, null, 2)}</code>
                                </pre>
                              </>
                            )}

                            <h2 className="text-xl font-semibold mt-6">cURL 示例</h2>
                            <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                              <code className="text-sm text-green-600 dark:text-green-400">{docData.examples.curl}</code>
                            </pre>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                        <code className="text-sm">{docData.markdown}</code>
                      </pre>
                    </div>
                  )
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    选择一个接口查看文档
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                从左侧列表选择一个接口以生成文档
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
