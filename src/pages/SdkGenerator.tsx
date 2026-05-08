import { useEffect, useState } from 'react';
import { Package, Copy, Play, Code2, FileText, CheckSquare, Square } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface Template {
  id: string;
  name: string;
  language: string;
  description?: string;
}

interface InterfaceItem {
  id: string;
  name: string;
  method: string;
  path: string;
}

export default function SdkGenerator() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [interfaces, setInterfaces] = useState<InterfaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedInterfaces, setSelectedInterfaces] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [templatesData, interfacesData] = await Promise.all([
        api.get('/sdk-generator/templates'),
        api.get('/interfaces').catch(() => []),
      ]);
      setTemplates(templatesData);
      setInterfaces(interfacesData);
    } catch (error: any) {
      toast('error', error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast('error', '请选择模板');
      return;
    }
    if (selectedInterfaces.length === 0) {
      toast('error', '请选择至少一个接口');
      return;
    }
    setGenerating(true);
    setGeneratedCode('');
    try {
      const data = await api.post('/sdk-generator/generate-from-db', {
        templateId: selectedTemplate,
        interfaceIds: selectedInterfaces,
      });
      setGeneratedCode(data.code || data.content || JSON.stringify(data, null, 2));
      toast('success', 'SDK 生成成功');
    } catch (error: any) {
      toast('error', error.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', '已复制到剪贴板');
  };

  const toggleInterface = (id: string) => {
    setSelectedInterfaces((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedInterfaces(interfaces.map((i) => i.id));
  };

  const deselectAll = () => {
    setSelectedInterfaces([]);
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Package className="w-8 h-8" />
          SDK 生成器
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          根据模板和接口定义生成 SDK 代码
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Code2 className="w-5 h-5" />
              选择模板
            </h2>
            <div className="space-y-2">
              {templates.map((tpl) => (
                <label
                  key={tpl.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTemplate === tpl.id
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={tpl.id}
                    checked={selectedTemplate === tpl.id}
                    onChange={() => setSelectedTemplate(tpl.id)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{tpl.name}</p>
                    {tpl.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tpl.description}</p>
                    )}
                    <span className="text-xs text-blue-600 dark:text-blue-400">{tpl.language}</span>
                  </div>
                </label>
              ))}
              {templates.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">暂无模板</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                选择接口
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  全选
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  清空
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {interfaces.map((iface) => (
                <label
                  key={iface.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedInterfaces.includes(iface.id)}
                    onChange={() => toggleInterface(iface.id)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-900 dark:text-white truncate">{iface.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{iface.method}</span>
                </label>
              ))}
              {interfaces.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">暂无接口</p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">已选 {selectedInterfaces.length} 个接口</p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedTemplate || selectedInterfaces.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Play className="w-5 h-5" />
            {generating ? '生成中...' : '生成 SDK'}
          </button>
        </div>

        <div className="lg:col-span-2">
          {generatedCode ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">生成结果</h2>
                <button
                  onClick={() => handleCopy(generatedCode)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  复制代码
                </button>
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-800 dark:text-gray-200 overflow-x-auto font-mono whitespace-pre-wrap max-h-[70vh]">
                {generatedCode}
              </pre>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">选择模板和接口后点击生成</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
