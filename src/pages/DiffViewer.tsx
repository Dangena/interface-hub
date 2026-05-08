import { useEffect, useState } from 'react';
import { GitCompare, ArrowLeftRight, Plus, Minus, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface InterfaceOption {
  id: string;
  name: string;
  path: string;
  method: string;
}

interface VersionOption {
  id: string;
  version: string;
  interfaceId: string;
  createdAt: string;
}

interface DiffItem {
  type: 'added' | 'removed' | 'changed';
  field: string;
  oldValue?: string;
  newValue?: string;
}

interface DiffResult {
  source: string;
  target: string;
  diffs: DiffItem[];
  summary: { added: number; removed: number; changed: number };
}

const diffColors: Record<string, { bg: string; text: string; border: string }> = {
  added: { bg: 'bg-green-50 dark:bg-green-900/10', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  removed: { bg: 'bg-red-50 dark:bg-red-900/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  changed: { bg: 'bg-yellow-50 dark:bg-yellow-900/10', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800' },
};

const diffLabels: Record<string, { label: string; icon: typeof Plus }> = {
  added: { label: '新增', icon: Plus },
  removed: { label: '删除', icon: Minus },
  changed: { label: '变更', icon: RefreshCw },
};

export default function DiffViewer() {
  const [interfaces, setInterfaces] = useState<InterfaceOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [interfacesData, versionsData] = await Promise.all([
        api.get('/interfaces').catch(() => []),
        api.get('/interfaces/versions').catch(() => []),
      ]);
      setInterfaces(interfacesData);
      setVersions(versionsData);
    } catch (error: any) {
      toast('error', error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!sourceId || !targetId) {
      toast('error', '请选择两个接口或版本进行比较');
      return;
    }
    setComparing(true);
    setDiffResult(null);
    try {
      const data = await api.post('/diff/compare', {
        sourceId,
        targetId,
      });
      setDiffResult(data);
      toast('success', '比较完成');
    } catch (error: any) {
      toast('error', error.message || '比较失败');
    } finally {
      setComparing(false);
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <GitCompare className="w-8 h-8" />
          接口对比
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          对比接口或版本差异，查看变更详情
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5" />
          选择对比项
        </h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">源接口/版本</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">选择源...</option>
              <optgroup label="接口">
                {interfaces.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.method} {i.path})
                  </option>
                ))}
              </optgroup>
              {versions.length > 0 && (
                <optgroup label="版本">
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex items-center pb-2">
            <ArrowLeftRight className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">目标接口/版本</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">选择目标...</option>
              <optgroup label="接口">
                {interfaces.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.method} {i.path})
                  </option>
                ))}
              </optgroup>
              {versions.length > 0 && (
                <optgroup label="版本">
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <button
            onClick={handleCompare}
            disabled={comparing || !sourceId || !targetId}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <GitCompare className="w-4 h-4" />
            {comparing ? '比较中...' : '比较'}
          </button>
        </div>
      </div>

      {diffResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{diffResult.summary.added}</p>
              <p className="text-sm text-green-700 dark:text-green-400">新增</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{diffResult.summary.removed}</p>
              <p className="text-sm text-red-700 dark:text-red-400">删除</p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{diffResult.summary.changed}</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">变更</p>
            </div>
          </div>

          {diffResult.diffs.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">差异详情</h3>
              <div className="space-y-2">
                {diffResult.diffs.map((diff, idx) => {
                  const colors = diffColors[diff.type];
                  const config = diffLabels[diff.type];
                  const Icon = config.icon;
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${colors.text}`} />
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.text}`}>
                          {config.label}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {diff.field}
                        </span>
                      </div>
                      {diff.type === 'changed' && (
                        <div className="ml-6 text-sm">
                          <span className="text-red-600 dark:text-red-400 line-through">{diff.oldValue}</span>
                          <span className="mx-2 text-gray-400">→</span>
                          <span className="text-green-600 dark:text-green-400">{diff.newValue}</span>
                        </div>
                      )}
                      {diff.type === 'added' && diff.newValue && (
                        <div className="ml-6 text-sm text-green-600 dark:text-green-400">{diff.newValue}</div>
                      )}
                      {diff.type === 'removed' && diff.oldValue && (
                        <div className="ml-6 text-sm text-red-600 dark:text-red-400 line-through">{diff.oldValue}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <GitCompare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">两个接口/版本完全一致，无差异</p>
            </div>
          )}
        </div>
      )}

      {!diffResult && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <GitCompare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">选择两个接口或版本后点击比较</p>
        </div>
      )}
    </div>
  );
}
