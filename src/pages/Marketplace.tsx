import { useEffect, useState } from 'react';
import { Search, Store, Filter, Globe, Zap, Tag, CheckCircle, XCircle, Clock } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface MarketplaceApi {
  id: string;
  name: string;
  method: string;
  path: string;
  category: string;
  status: 'published' | 'draft' | 'deprecated';
  description?: string;
  version?: string;
  created_at: string;
  updated_at: string;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  published: { label: '已发布', color: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle },
  draft: { label: '开发中', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400', icon: Clock },
  deprecated: { label: '已弃用', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400', icon: XCircle },
};

export default function Marketplace() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadApis();
  }, []);

  const loadApis = async () => {
    try {
      const data: MarketplaceApi[] = await api.get('/marketplace/apis');
      setApis(data);
      const cats = [...new Set(data.map((a) => a.category).filter(Boolean))];
      setCategories(cats);
    } catch (error: any) {
      toast('error', error.message || '加载市场数据失败');
    } finally {
      setLoading(false);
    }
  };

  const filtered = apis.filter((a) => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.path.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !categoryFilter || a.category === categoryFilter;
    return matchSearch && matchCategory;
  });

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
          <Store className="w-8 h-8" />
          API 市场
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          浏览和发现可用的 API 接口
        </p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 API 名称或路径..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none"
          >
            <option value="">全部分类</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const StatusIcon = statusConfig[item.status]?.icon || Clock;
            return (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[item.method] || 'bg-gray-100 text-gray-700'}`}>
                      {item.method}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${statusConfig[item.status]?.color || ''}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig[item.status]?.label || item.status}
                    </span>
                  </div>
                  {item.version && (
                    <span className="text-xs text-gray-400">v{item.version}</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {item.name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                  <Globe className="w-4 h-4" />
                  <code className="truncate">{item.path}</code>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Tag className="w-3 h-3" />
                    {item.category || '未分类'}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <Zap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {search || categoryFilter ? '没有找到匹配的 API' : '暂无 API 数据'}
          </p>
        </div>
      )}
    </div>
  );
}
