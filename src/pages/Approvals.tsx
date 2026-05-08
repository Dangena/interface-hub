import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Send, FileText } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/Toast';
import { useAppStore } from '../stores/appStore';

interface Approval {
  id: string;
  type: string;
  reference_id: string;
  title: string;
  description: string;
  status: string;
  requester_id: string;
  requester_name: string;
  reviewer_id: string;
  reviewer_name: string;
  review_comment: string;
  created_at: string;
  reviewed_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: '待审批', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400', icon: Clock },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400', icon: XCircle },
};

export default function Approvals() {
  const { user } = useAppStore();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [comment, setComment] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadApprovals();
  }, [filter]);

  const loadApprovals = async () => {
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const data = await api.get(`/approvals${params}`);
      setApprovals(data);
    } catch (error) {
      console.error('Failed to load approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await api.put(`/approvals/${id}/approve`, { comment });
      toast('success', '审批已通过');
      setComment('');
      loadApprovals();
    } catch (error: any) {
      toast('error', error.message || '操作失败');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await api.put(`/approvals/${id}/reject`, { comment });
      toast('success', '审批已拒绝');
      setComment('');
      loadApprovals();
    } catch (error: any) {
      toast('error', error.message || '操作失败');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRequestPublish = async (interfaceId: string, interfaceName: string) => {
    try {
      await api.post('/approvals', {
        type: 'publish',
        referenceId: interfaceId,
        title: `发布接口: ${interfaceName}`,
        description: `请求将接口 "${interfaceName}" 发布为正式版本`,
      });
      toast('success', '发布申请已提交，等待管理员审批');
    } catch (error: any) {
      toast('error', error.message || '提交失败');
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">审批中心</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {isAdmin ? '审批接口发布请求' : '查看你的审批记录'}
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {status === 'all' ? '全部' : statusConfig[status]?.label}
            {status === 'pending' && (
              <span className="ml-1">
                ({approvals.filter(a => a.status === 'pending').length})
              </span>
            )}
          </button>
        ))}
      </div>

      {approvals.length > 0 ? (
        <div className="space-y-4">
          {approvals.map((approval) => {
            const config = statusConfig[approval.status] || statusConfig.pending;
            const Icon = config.icon;

            return (
              <div
                key={approval.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{approval.title}</h3>
                      {approval.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{approval.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>申请人: {approval.requester_name}</span>
                        <span>提交时间: {new Date(approval.created_at).toLocaleString()}</span>
                        {approval.reviewed_at && (
                          <span>审批时间: {new Date(approval.reviewed_at).toLocaleString()}</span>
                        )}
                      </div>
                      {approval.review_comment && (
                        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-sm text-gray-600 dark:text-gray-400">
                          审批意见: {approval.review_comment}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                </div>

                {isAdmin && approval.status === 'pending' && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={processingId === approval.id ? comment : ''}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="审批意见（可选）"
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() => handleApprove(approval.id)}
                        disabled={processingId === approval.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        通过
                      </button>
                      <button
                        onClick={() => handleReject(approval.id)}
                        disabled={processingId === approval.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        拒绝
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无审批记录</h3>
          <p className="text-gray-500 dark:text-gray-400">
            {filter === 'pending' ? '没有待审批的请求' : '没有审批记录'}
          </p>
        </div>
      )}
    </div>
  );
}
