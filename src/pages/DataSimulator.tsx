import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Play,
  Download,
  Upload,
  Plus,
  Trash2,
  Settings,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  X,
  FileJson,
  Send,
  Eye,
  Columns,
} from 'lucide-react';
import api from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import { ToastContainer, toast } from '../components/Toast';

interface Generator {
  id: string;
  name: string;
  description: string;
}

interface Field {
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  comment: string | null;
  suggestedGenerator: string;
}

interface GeneratedRecord {
  [key: string]: any;
}

type SourceType = 'model' | 'interface' | 'custom';
type PushTarget = 'database' | 'api';

export default function DataSimulator() {
  const navigate = useNavigate();

  const [sourceType, setSourceType] = useState<SourceType>('model');
  const [models, setModels] = useState<any[]>([]);
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedInterface, setSelectedInterface] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [customFields, setCustomFields] = useState<Array<{ name: string; type: string; generator: string }>>([]);
  const [count, setCount] = useState(10);
  const [generators, setGenerators] = useState<Generator[]>([]);

  const [generatedData, setGeneratedData] = useState<GeneratedRecord[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const [pushTarget, setPushTarget] = useState<PushTarget>('database');
  const [baseUrl, setBaseUrl] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<any>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedModel && sourceType === 'model') {
      loadModelFields(selectedModel);
    } else if (selectedInterface && sourceType === 'interface') {
      loadInterfaceFields(selectedInterface);
    }
  }, [selectedModel, selectedInterface, sourceType]);

  async function loadInitialData() {
    try {
      const [modelsRes, interfacesRes, generatorsRes] = await Promise.all([
        api.get('/models'),
        api.get('/interfaces'),
        api.get('/data-simulator/generators'),
      ]);
      setModels(Array.isArray(modelsRes) ? modelsRes : modelsRes.data || []);
      setInterfaces(Array.isArray(interfacesRes) ? interfacesRes : interfacesRes.data || []);
      setGenerators(generatorsRes);
    } catch (err: any) {
      toast('error', '加载数据失败: ' + (err.message || '未知错误'));
    }
  }

  async function loadModelFields(modelName: string) {
    try {
      const res = await api.get(`/data-simulator/fields/${modelName}`);
      setFields(res.fields || []);
    } catch (err: any) {
      toast('error', '加载模型字段失败');
    }
  }

  async function loadInterfaceFields(interfaceId: string) {
    try {
      const res = await api.get(`/data-simulator/interface/${interfaceId}`);
      setFields(res.targetFields || []);
    } catch (err: any) {
      toast('error', '加载接口字段失败');
    }
  }

  async function handleGenerate() {
    try {
      let body: any = { count };

      if (sourceType === 'model' && selectedModel) {
        body.sourceType = 'model';
        body.modelName = selectedModel;
      } else if (sourceType === 'interface' && selectedInterface) {
        body.sourceType = 'interface';
        body.interfaceId = selectedInterface;
      } else if (sourceType === 'custom' && customFields.length > 0) {
        body.sourceType = 'custom';
        body.customFields = customFields;
      } else {
        toast('error', '请选择数据源或添加自定义字段');
        return;
      }

      const res = await api.post('/data-simulator/generate', body);
      setGeneratedData(res.records || []);
      setShowPreview(true);
      setPushResult(null);
      toast('success', `成功生成 ${res.count} 条数据`);
    } catch (err: any) {
      toast('error', '生成数据失败: ' + (err.message || '未知错误'));
    }
  }

  function handlePush() {
    if (generatedData.length === 0) {
      toast('error', '请先生成数据');
      return;
    }

    setConfirmDialog({
      open: true,
      title: '确认推送数据',
      message: `确定要向${pushTarget === 'database' ? '数据库' : 'API'}推送 ${generatedData.length} 条数据吗？`,
    });
  }

  async function confirmPush() {
    setConfirmDialog({ open: false, title: '', message: '' });
    setPushing(true);
    setPushResult(null);

    try {
      if (pushTarget === 'database' && selectedModel) {
        const res = await api.post('/data-simulator/push-to-database', {
          modelName: selectedModel,
          records: generatedData,
        });
        setPushResult(res);
        toast('success', `推送完成: 成功 ${res.insertedRecords} 条, 失败 ${res.failedRecords} 条`);
      } else if (pushTarget === 'api' && selectedInterface) {
        const res = await api.post('/data-simulator/push-to-api', {
          interfaceId: selectedInterface,
          records: generatedData,
          baseUrl: baseUrl || undefined,
        });
        setPushResult(res);
        toast('success', `推送完成: 成功 ${res.successCount} 条, 失败 ${res.failCount} 条`);
      }
    } catch (err: any) {
      toast('error', '推送数据失败: ' + (err.message || '未知错误'));
    } finally {
      setPushing(false);
    }
  }

  function handleExport(format: 'json' | 'csv') {
    if (generatedData.length === 0) return;

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(generatedData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated_data_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = Object.keys(generatedData[0]);
      const csv = [
        headers.join(','),
        ...generatedData.map((row) =>
          headers.map((h) => {
            const val = row[h];
            if (val === null) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
          }).join(',')
        ),
      ].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated_data_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast('success', `导出为 ${format.toUpperCase()} 成功`);
  }

  function addCustomField() {
    setCustomFields([...customFields, { name: '', type: 'VARCHAR', generator: 'custom' }]);
  }

  function updateCustomField(index: number, key: string, value: string) {
    const updated = [...customFields];
    updated[index] = { ...updated[index], [key]: value };
    setCustomFields(updated);
  }

  function removeCustomField(index: number) {
    setCustomFields(customFields.filter((_, i) => i !== index));
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Database className="w-7 h-7" />
          数据模拟器
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          根据接口和数据库表结构生成模拟数据，用于测试外部系统对接
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              数据源配置
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">数据来源</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      value="model"
                      checked={sourceType === 'model'}
                      onChange={() => {
                        setSourceType('model');
                        setSelectedModel('');
                        setSelectedInterface('');
                        setFields([]);
                        setGeneratedData([]);
                      }}
                      className="w-4 h-4"
                    />
                    <span>数据模型</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      value="interface"
                      checked={sourceType === 'interface'}
                      onChange={() => {
                        setSourceType('interface');
                        setSelectedModel('');
                        setSelectedInterface('');
                        setFields([]);
                        setGeneratedData([]);
                      }}
                      className="w-4 h-4"
                    />
                    <span>接口定义</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      value="custom"
                      checked={sourceType === 'custom'}
                      onChange={() => {
                        setSourceType('custom');
                        setFields([]);
                        setGeneratedData([]);
                      }}
                      className="w-4 h-4"
                    />
                    <span>自定义字段</span>
                  </label>
                </div>
              </div>

              {sourceType === 'model' && (
                <div>
                  <label className="block text-sm font-medium mb-2">选择数据模型</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="">请选择模型...</option>
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.fields?.length || 0} 字段)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sourceType === 'interface' && (
                <div>
                  <label className="block text-sm font-medium mb-2">选择接口</label>
                  <select
                    value={selectedInterface}
                    onChange={(e) => setSelectedInterface(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="">请选择接口...</option>
                    {interfaces.map((i) => (
                      <option key={i.id} value={i.id}>
                        [{i.method}] {i.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sourceType === 'custom' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">自定义字段</label>
                    <button
                      onClick={addCustomField}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      添加字段
                    </button>
                  </div>
                  {customFields.length === 0 && (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">点击上方按钮添加字段</p>
                  )}
                  {customFields.map((field, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="字段名"
                        value={field.name}
                        onChange={(e) => updateCustomField(index, 'name', e.target.value)}
                        className="flex-1 px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => updateCustomField(index, 'type', e.target.value)}
                        className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                      >
                        <option value="VARCHAR">字符串</option>
                        <option value="INT">整数</option>
                        <option value="FLOAT">浮点数</option>
                        <option value="BOOL">布尔值</option>
                        <option value="DATE">日期</option>
                      </select>
                      <button
                        onClick={() => removeCustomField(index)}
                        className="p-1 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">生成数量</label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                    className="w-32 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                  <div className="flex gap-2">
                    {[10, 50, 100, 500].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCount(n)}
                        className={`px-3 py-1 rounded text-sm ${
                          count === n
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={sourceType === 'model' ? !selectedModel : sourceType === 'interface' ? !selectedInterface : customFields.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5" />
                生成数据
              </button>
            </div>
          </div>

          {fields.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Columns className="w-5 h-5" />
                字段配置
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {fields.map((field) => (
                  <div
                    key={field.name}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"
                  >
                    <div>
                      <span className="font-medium">{field.name}</span>
                      <span className="text-gray-500 text-sm ml-2">({field.type})</span>
                      {field.primaryKey && (
                        <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                          PK
                        </span>
                      )}
                      {field.nullable && (
                        <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                          可空
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-blue-600 dark:text-blue-400">
                      {generators.find((g) => g.id === field.suggestedGenerator)?.name || field.suggestedGenerator}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Send className="w-5 h-5" />
              推送配置
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">推送目标</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pushTarget"
                      value="database"
                      checked={pushTarget === 'database'}
                      onChange={() => setPushTarget('database')}
                      className="w-4 h-4"
                    />
                    <Database className="w-4 h-4" />
                    <span>数据库表</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pushTarget"
                      value="api"
                      checked={pushTarget === 'api'}
                      onChange={() => setPushTarget('api')}
                      className="w-4 h-4"
                    />
                    <Send className="w-4 h-4" />
                    <span>API 接口</span>
                  </label>
                </div>
              </div>

              {pushTarget === 'api' && (
                <div>
                  <label className="block text-sm font-medium mb-2">API Base URL (可选)</label>
                  <input
                    type="text"
                    placeholder="http://localhost:3001"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    不填则使用当前系统的接口路径推送
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handlePush}
                  disabled={generatedData.length === 0 || pushing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pushing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      推送中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      推送到{pushTarget === 'database' ? '数据库' : 'API'}
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleExport('json')}
                  disabled={generatedData.length === 0}
                  className="flex items-center gap-1 px-3 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  title="导出 JSON"
                >
                  <FileJson className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={generatedData.length === 0}
                  className="flex items-center gap-1 px-3 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  title="导出 CSV"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {pushResult && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                推送结果
              </h2>
              <div className="space-y-2">
                {pushTarget === 'database' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">总记录数</span>
                      <span className="font-medium">{pushResult.totalRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">成功插入</span>
                      <span className="font-medium text-green-600">{pushResult.insertedRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">失败</span>
                      <span className="font-medium text-red-600">{pushResult.failedRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">目标表</span>
                      <span className="font-medium">{pushResult.tableName}</span>
                    </div>
                  </>
                )}
                {pushTarget === 'api' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">总记录数</span>
                      <span className="font-medium">{pushResult.totalRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">成功</span>
                      <span className="font-medium text-green-600">{pushResult.successCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">失败</span>
                      <span className="font-medium text-red-600">{pushResult.failCount}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Eye className="w-5 h-5" />
                数据预览
                {generatedData.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-sm rounded-full">
                    {generatedData.length} 条
                  </span>
                )}
              </h2>
              {generatedData.length > 0 && (
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {showPreview ? '收起' : '展开'}
                </button>
              )}
            </div>

            {generatedData.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无生成数据</p>
                <p className="text-sm">请先配置数据源并点击"生成数据"</p>
              </div>
            ) : showPreview ? (
              <div className="space-y-4">
                {generatedData.slice(0, 5).map((record, index) => (
                  <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">记录 {index + 1}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(record).map(([key, value]) => (
                        <div key={key} className="flex">
                          <span className="text-gray-500 dark:text-gray-400 min-w-20 truncate">
                            {key}:
                          </span>
                          <span className="truncate">
                            {value === null ? (
                              <span className="text-gray-400 italic">null</span>
                            ) : typeof value === 'object' ? (
                              JSON.stringify(value).slice(0, 30)
                            ) : (
                              String(value)
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {generatedData.length > 5 && (
                  <p className="text-center text-gray-500 text-sm">
                    ... 还有 {generatedData.length - 5} 条记录
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                点击"展开"查看完整数据预览
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmPush}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '' })}
      />

      <ToastContainer />
    </div>
  );
}
