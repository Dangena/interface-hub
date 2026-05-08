import { useEffect, useState } from 'react';
import { Users, UserPlus, Shield, Trash2, Copy, Check, X } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAppStore } from '../stores/appStore';

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  created_at: string;
}

const roleLabels: Record<string, { label: string; color: string }> = {
  admin: { label: '管理员', color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  developer: { label: '开发者', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  viewer: { label: '观察者', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400' },
};

export default function Team() {
  const { user } = useAppStore();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'developer' });
  const [inviteResult, setInviteResult] = useState<{ user: any; tempPassword: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamUser | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.get('/auth/users');
      setUsers(data);
    } catch (error) {
      toast('error', '加载用户列表失败，可能需要管理员权限');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const result = await api.post('/auth/users/invite', inviteForm);
      setInviteResult(result);
      loadUsers();
      toast('success', '用户邀请成功');
    } catch (error: any) {
      toast('error', error.message || '邀请失败');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.put(`/auth/users/${userId}/role`, { role });
      toast('success', '角色更新成功');
      loadUsers();
    } catch (error: any) {
      toast('error', error.message || '更新角色失败');
    }
  };

  const handleDelete = async (targetUser: TeamUser) => {
    try {
      await api.delete(`/auth/users/${targetUser.id}`);
      toast('success', `用户 ${targetUser.name} 已删除`);
      loadUsers();
    } catch (error: any) {
      toast('error', error.message || '删除失败');
    }
    setDeleteTarget(null);
  };

  const copyCredentials = () => {
    if (inviteResult) {
      navigator.clipboard.writeText(
        `邮箱: ${inviteResult.user.email}\n临时密码: ${inviteResult.tempPassword}\n登录地址: ${window.location.origin}/login`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="text-center py-20">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">需要管理员权限</h2>
          <p className="text-gray-500 dark:text-gray-400">请联系管理员获取团队管理权限</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">团队管理</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">管理团队成员和权限</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteResult(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          邀请成员
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              成员列表 ({users.length})
            </h2>
            <div className="flex gap-4 text-sm">
              {Object.entries(roleLabels).map(([key, { label, color }]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
                  {users.filter(u => u.role === key).length}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {users.map((teamUser) => (
            <div key={teamUser.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                  {teamUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white">{teamUser.name}</p>
                    {teamUser.id === user?.id && (
                      <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded">你</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{teamUser.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {teamUser.id !== user?.id ? (
                  <>
                    <select
                      value={teamUser.role}
                      onChange={(e) => handleRoleChange(teamUser.id, e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="admin">管理员</option>
                      <option value="developer">开发者</option>
                      <option value="viewer">观察者</option>
                    </select>
                    <button
                      onClick={() => setDeleteTarget(teamUser)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${roleLabels[teamUser.role]?.color}`}>
                    {roleLabels[teamUser.role]?.label}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            {inviteResult ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">邀请成功</h3>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-700 dark:text-green-400 mb-2">用户已创建，请将以下信息发送给对方：</p>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 text-sm font-mono space-y-1">
                    <p>邮箱: {inviteResult.user.email}</p>
                    <p>临时密码: {inviteResult.tempPassword}</p>
                    <p>登录地址: {window.location.origin}/login</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={copyCredentials}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已复制' : '复制登录信息'}
                  </button>
                  <button
                    onClick={() => { setShowInvite(false); setInviteResult(null); }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                  >
                    关闭
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">邀请新成员</h3>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">邮箱 *</label>
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名 *</label>
                    <input
                      type="text"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="张三"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色</label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="developer">开发者</option>
                      <option value="admin">管理员</option>
                      <option value="viewer">观察者</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowInvite(false)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <UserPlus className="w-4 h-4" />
                      {inviting ? '邀请中...' : '邀请'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="删除成员"
          message={`确定要删除成员 "${deleteTarget.name}" 吗？此操作不可撤销。`}
          variant="danger"
          confirmLabel="删除"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
