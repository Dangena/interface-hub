import { useEffect, useState } from 'react';
import { Globe, Plus, Trash2, Edit2, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';

interface Locale {
  id: string;
  code: string;
  name: string;
  totalKeys: number;
  translatedKeys: number;
  created_at: string;
}

interface TranslationKey {
  key: string;
  value: string;
  translated: boolean;
}

export default function I18nManager() {
  const [locales, setLocales] = useState<Locale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationKey[]>([]);
  const [searchKey, setSearchKey] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [showAddLocale, setShowAddLocale] = useState(false);
  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [newLocaleName, setNewLocaleName] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadLocales();
  }, []);

  const loadLocales = async () => {
    try {
      const result = await api.get('/i18n/locales');
      const data = result.locales || result.data || result;
      setLocales(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast('error', error.message || '加载语言数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTranslations = async (code: string) => {
    setSelectedLocale(code);
    try {
      const data = await api.get(`/i18n/locales/${code}/translations`);
      setTranslations(data);
    } catch (error: any) {
      toast('error', error.message || '加载翻译数据失败');
    }
  };

  const handleAddLocale = async () => {
    if (!newLocaleCode || !newLocaleName) {
      toast('error', '请填写语言代码和名称');
      return;
    }
    try {
      await api.post('/i18n/locales', { code: newLocaleCode, name: newLocaleName });
      toast('success', '语言添加成功');
      setShowAddLocale(false);
      setNewLocaleCode('');
      setNewLocaleName('');
      loadLocales();
    } catch (error: any) {
      toast('error', error.message || '添加语言失败');
    }
  };

  const handleDeleteLocale = async (code: string) => {
    if (!confirm(`确定要删除语言 ${code} 吗？`)) return;
    try {
      await api.delete(`/i18n/locales/${code}`);
      toast('success', '语言已删除');
      if (selectedLocale === code) {
        setSelectedLocale(null);
        setTranslations([]);
      }
      loadLocales();
    } catch (error: any) {
      toast('error', error.message || '删除语言失败');
    }
  };

  const handleSaveTranslation = async (key: string) => {
    if (!selectedLocale) return;
    try {
      await api.put(`/i18n/locales/${selectedLocale}/translations`, { key, value: editValue });
      toast('success', '翻译已保存');
      setEditingKey(null);
      loadTranslations(selectedLocale);
    } catch (error: any) {
      toast('error', error.message || '保存翻译失败');
    }
  };

  const startEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditValue(value);
  };

  const filtered = translations.filter((t) => {
    const matchSearch = !searchKey || t.key.toLowerCase().includes(searchKey.toLowerCase());
    const matchMissing = !showMissingOnly || !t.translated;
    return matchSearch && matchMissing;
  });

  const missingCount = translations.filter((t) => !t.translated).length;

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
            <Globe className="w-8 h-8" />
            国际化管理
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            管理多语言翻译和本地化配置
          </p>
        </div>
        <button
          onClick={() => setShowAddLocale(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          添加语言
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase mb-3">语言列表</h2>
            <div className="space-y-2">
              {locales.map((locale) => {
                const pct = locale.totalKeys > 0 ? Math.round((locale.translatedKeys / locale.totalKeys) * 100) : 0;
                return (
                  <div
                    key={locale.id}
                    onClick={() => loadTranslations(locale.code)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedLocale === locale.code
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{locale.name}</span>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-medium ${pct === 100 ? 'text-green-600' : pct > 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {pct}%
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLocale(locale.code);
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-500 dark:text-gray-400">{locale.code}</code>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${pct === 100 ? 'bg-green-600' : pct > 50 ? 'bg-yellow-600' : 'bg-red-600'}`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {locale.translatedKeys}/{locale.totalKeys} 已翻译
                    </p>
                  </div>
                );
              })}
              {locales.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">暂无语言</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          {selectedLocale ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {locales.find((l) => l.code === selectedLocale)?.name || selectedLocale}
                  </h2>
                  {missingCount > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs rounded-full">
                      <AlertTriangle className="w-3 h-3" />
                      {missingCount} 个缺失
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchKey}
                      onChange={(e) => setSearchKey(e.target.value)}
                      placeholder="搜索键名..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMissingOnly}
                      onChange={(e) => setShowMissingOnly(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    仅显示缺失
                  </label>
                </div>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[60vh] overflow-y-auto">
                {filtered.map((t) => (
                  <div key={t.key} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-medium text-gray-900 dark:text-white">{t.key}</code>
                          {t.translated ? (
                            <CheckCircle className="w-3 h-3 text-green-600" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                        {editingKey === t.key ? (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                            <button
                              onClick={() => handleSaveTranslation(t.key)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-600 dark:text-gray-400"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <p
                            className={`text-sm cursor-pointer ${t.translated ? 'text-gray-600 dark:text-gray-400' : 'text-red-400 italic'}`}
                            onClick={() => startEdit(t.key, t.value)}
                          >
                            {t.translated ? t.value : '未翻译 - 点击编辑'}
                          </p>
                        )}
                      </div>
                      {editingKey !== t.key && (
                        <button
                          onClick={() => startEdit(t.key, t.value)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                    {searchKey || showMissingOnly ? '没有匹配的翻译键' : '暂无翻译数据'}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">选择一个语言查看翻译</p>
            </div>
          )}
        </div>
      </div>

      {showAddLocale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">添加语言</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">语言代码 *</label>
                <input
                  type="text"
                  value={newLocaleCode}
                  onChange={(e) => setNewLocaleCode(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="zh-CN, en-US, ja-JP..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">语言名称 *</label>
                <input
                  type="text"
                  value={newLocaleName}
                  onChange={(e) => setNewLocaleName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="简体中文, English..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 mt-6">
              <button
                onClick={() => { setShowAddLocale(false); setNewLocaleCode(''); setNewLocaleName(''); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleAddLocale}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
