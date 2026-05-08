import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, User, Lock, Moon, Sun, LogOut, Save, Check, Database, Trash2, Download, Upload, Info, Server } from 'lucide-react';
import api from '../services/api';
import { useAppStore } from '../stores/appStore';
import { toast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings() {
  const { user, setUser, logout } = useAppStore();
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [perfStats, setPerfStats] = useState<any>(null);
  const [showClearCache, setShowClearCache] = useState(false);

  useEffect(() => {
    loadProfile();
    loadSystemInfo();
  }, []);

  const loadSystemInfo = async () => {
    try {
      const cache = await api.get('/performance/cache');
      setCacheStats(cache);
    } catch {}
    try {
      const perf = await api.get('/performance/stats');
      const overall = perf?.performance?.overallStats || {};
      setPerfStats({
        totalRequests: overall.count || perf?.performance?.totalMetrics || 0,
        avgResponseTime: overall.avgDuration || 0,
      });
    } catch {}
  };

  const handleClearCache = async () => {
    try {
      await api.delete('/performance/cache');
      toast('success', '缓存已清除');
      loadSystemInfo();
    } catch {
      toast('error', '清除缓存失败');
    }
    setShowClearCache(false);
  };

  const handleExportData = async () => {
    try {
      const blob = await api.download('/openapi/export?format=json');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interface-hub-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast('success', '数据导出成功');
    } catch {
      toast('error', '导出失败');
    }
  };

  const handleBackup = async () => {
    try {
      const blob = await api.download('/backup');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interface-hub-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast('success', '备份下载成功');
    } catch {
      toast('error', '备份失败');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (!backupData.data) {
        toast('error', '无效的备份文件');
        return;
      }

      await api.post('/backup/restore', backupData);
      toast('success', '数据恢复成功');
    } catch (error: any) {
      toast('error', error.message || '恢复失败');
    }

    e.target.value = '';
  };

  const loadProfile = async () => {
    try {
      const data = await api.get('/auth/me');
      if (data.user) setUser(data.user);
    } catch {}
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const data = await api.put('/auth/profile', { name });
      if (data.user) setUser(data.user);
      showMessage('success', '个人信息已更新');
    } catch {
      showMessage('error', '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showMessage('error', '两次输入的密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      showMessage('error', '新密码长度不能少于6位');
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('success', '密码修改成功');
    } catch {
      showMessage('error', '密码修改失败，请检查当前密码');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mb-8">
        <SettingsIcon className="w-8 h-8" />
        设置
      </h1>

      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <span>⚠</span>}
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <User className="w-5 h-5" />
            个人信息
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">邮箱</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色</label>
              <input
                type="text"
                value={user?.role || 'developer'}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5" />
            修改密码
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前密码</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少6位"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={saving || !currentPassword || !newPassword}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Lock className="w-4 h-4" />
              修改密码
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            {darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            外观设置
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-900 dark:text-white font-medium">暗色模式</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">切换深色/浅色界面主题</p>
            </div>
            <button
              onClick={handleToggleDarkMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                darkMode ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                darkMode ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <LogOut className="w-5 h-5" />
            账户操作
          </h2>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Server className="w-5 h-5" />
            系统信息
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">缓存条目</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{cacheStats?.totalEntries ?? '-'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">缓存命中率</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{cacheStats?.hitRate != null ? `${(cacheStats.hitRate * 100).toFixed(1)}%` : '-'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">请求总数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{perfStats?.totalRequests ?? '-'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">平均响应时间</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{perfStats?.avgResponseTime != null ? `${perfStats.avgResponseTime.toFixed(0)}ms` : '-'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Database className="w-5 h-5" />
            数据管理
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-900 dark:text-white font-medium">导出 OpenAPI 文档</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">将所有接口导出为 OpenAPI 3.0 JSON 格式</p>
              </div>
              <button
                onClick={handleExportData}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                导出
              </button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">清除缓存</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">清除所有服务端缓存数据，下次请求将重新查询</p>
                </div>
                <button
                  onClick={() => setShowClearCache(true)}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  清除
                </button>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">数据备份</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">将所有数据备份为 JSON 文件下载</p>
                </div>
                <button
                  onClick={handleBackup}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  备份
                </button>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">数据恢复</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">从备份文件恢复数据（不会覆盖已有记录）</p>
                </div>
                <label className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm cursor-pointer">
                  <Upload className="w-4 h-4" />
                  恢复
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestore}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showClearCache && (
        <ConfirmDialog
          open={showClearCache}
          title="清除缓存"
          message="确定要清除所有缓存数据吗？这可能导致短暂的性能下降。"
          variant="danger"
          confirmLabel="清除"
          onConfirm={handleClearCache}
          onCancel={() => setShowClearCache(false)}
        />
      )}
    </div>
  );
}
