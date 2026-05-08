import { useEffect, useState } from 'react';
import { Workflow, Plus, Trash2, Play, GripVertical, ArrowDown, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface WorkflowStep {
  id: string;
  name: string;
  type: 'api-call' | 'delay' | 'condition' | 'transform';
  config: Record<string, any>;
}

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  created_at: string;
  updated_at: string;
}

interface StepResult {
  stepName: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  output?: any;
  error?: string;
}

interface ExecutionResult {
  workflowId: string;
  status: 'success' | 'failed';
  results: StepResult[];
  totalDuration: number;
  executedAt: string;
}

const stepTypeConfig: Record<string, { label: string; color: string }> = {
  'api-call': { label: 'API 调用', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  'delay': { label: '延迟', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  'condition': { label: '条件', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
  'transform': { label: '转换', color: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
};

export default function WorkflowEditor() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    steps: [] as WorkflowStep[],
  });

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const data = await api.get('/workflow/workflows');
      setWorkflows(data);
    } catch (error: any) {
      toast('error', error.message || '加载工作流失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!formData.name) {
      toast('error', '请填写工作流名称');
      return;
    }
    try {
      await api.post('/workflow/workflows', {
        name: formData.name,
        description: formData.description,
        steps: formData.steps,
      });
      toast('success', '工作流创建成功');
      setShowEditor(false);
      setFormData({ name: '', description: '', steps: [] });
      loadWorkflows();
    } catch (error: any) {
      toast('error', error.message || '创建工作流失败');
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('确定要删除此工作流吗？')) return;
    try {
      await api.delete(`/workflow/workflows/${id}`);
      toast('success', '工作流已删除');
      loadWorkflows();
    } catch (error: any) {
      toast('error', error.message || '删除工作流失败');
    }
  };

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      const data = await api.post(`/workflow/workflows/${id}/execute`);
      setExecutionResults((prev) => ({ ...prev, [id]: data }));
      toast('success', '工作流执行完成');
    } catch (error: any) {
      toast('error', error.message || '执行工作流失败');
    } finally {
      setExecutingId(null);
    }
  };

  const addStep = (type: WorkflowStep['type'] = 'api-call') => {
    const newStep: WorkflowStep = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: `步骤 ${formData.steps.length + 1}`,
      type,
      config: {},
    };
    setFormData((prev) => ({ ...prev, steps: [...prev.steps, newStep] }));
  };

  const removeStep = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx),
    }));
  };

  const moveStep = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= formData.steps.length) return;
    setFormData((prev) => {
      const steps = [...prev.steps];
      [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
      return { ...prev, steps };
    });
  };

  const updateStep = (idx: number, field: keyof WorkflowStep, value: any) => {
    setFormData((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));
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
            <Workflow className="w-8 h-8" />
            工作流编辑器
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            创建和管理工作流，编排接口调用步骤
          </p>
        </div>
        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建工作流
        </button>
      </div>

      <div className="space-y-4">
        {workflows.map((wf) => {
          const result = executionResults[wf.id];
          return (
            <div key={wf.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{wf.name}</h3>
                  {wf.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{wf.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExecute(wf.id)}
                    disabled={executingId === wf.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {executingId === wf.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    {executingId === wf.id ? '执行中...' : '执行'}
                  </button>
                  <button
                    onClick={() => handleDeleteWorkflow(wf.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                {wf.steps.map((step, idx) => {
                  const config = stepTypeConfig[step.type] || stepTypeConfig['api-call'];
                  return (
                    <div key={step.id} className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${config.color}`}>
                        {step.name}
                      </span>
                      {idx < wf.steps.length - 1 && <ArrowDown className="w-3 h-3 text-gray-400 rotate-[-90deg]" />}
                    </div>
                  );
                })}
              </div>

              {result && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center gap-4 mb-3">
                    <span className={`flex items-center gap-1 text-sm font-medium ${
                      result.status === 'success' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {result.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {result.status === 'success' ? '成功' : '失败'}
                    </span>
                    <span className="text-xs text-gray-400">
                      总耗时: {result.totalDuration}ms
                    </span>
                  </div>
                  <div className="space-y-1">
                    {result.results.map((r, idx) => (
                      <div key={idx} className={`flex items-center gap-2 p-2 rounded text-sm ${
                        r.status === 'success' ? 'bg-green-50 dark:bg-green-900/10' :
                        r.status === 'failed' ? 'bg-red-50 dark:bg-red-900/10' :
                        'bg-gray-50 dark:bg-gray-900/10'
                      }`}>
                        {r.status === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                         r.status === 'failed' ? <XCircle className="w-4 h-4 text-red-600" /> :
                         <Clock className="w-4 h-4 text-gray-400" />}
                        <span className="font-medium text-gray-900 dark:text-white">{r.stepName}</span>
                        <span className="text-xs text-gray-400 ml-auto">{r.duration}ms</span>
                        {r.error && <span className="text-xs text-red-500">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {workflows.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <Workflow className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">暂无工作流</p>
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">创建工作流</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="工作流名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">步骤</label>
                  <div className="flex items-center gap-2">
                    {(['api-call', 'delay', 'condition', 'transform'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => addStep(type)}
                        className={`px-2 py-1 rounded text-xs font-medium ${stepTypeConfig[type].color} hover:opacity-80`}
                      >
                        + {stepTypeConfig[type].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {formData.steps.map((step, idx) => {
                    const config = stepTypeConfig[step.type] || stepTypeConfig['api-call'];
                    return (
                      <div key={step.id} className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                          {config.label}
                        </span>
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => updateStep(idx, 'name', e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="步骤名称"
                        />
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveStep(idx, 'up')}
                            disabled={idx === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveStep(idx, 'down')}
                            disabled={idx === formData.steps.length - 1}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="text-red-500 hover:text-red-700 ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {formData.steps.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">点击上方按钮添加步骤</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowEditor(false);
                  setFormData({ name: '', description: '', steps: [] });
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleCreateWorkflow}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
