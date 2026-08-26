import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, CheckCircle, XCircle, Calendar, RefreshCw, Play, ArrowRight, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getFailureReviews,
  rescheduleFromReview,
  resolveFailureReview,
  sendHeartbeat,
  restoreChannel,
} from '../api/channel';
import type { FailureReview } from '../../shared/types';

export default function FailureReviewPage() {
  const [reviews, setReviews] = useState<FailureReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<FailureReview | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [resolveConclusion, setResolveConclusion] = useState('');
  const [resolveAction, setResolveAction] = useState<'republish' | 'manual_publish' | 'reschedule'>('republish');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: { page: number; pageSize: number; status?: string } = { page: 1, pageSize: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const result = await getFailureReviews(params);
      setReviews(result.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenReschedule = (review: FailureReview) => {
    setSelectedReview(review);
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    setRescheduleTime(now.toISOString().slice(0, 16));
    setShowRescheduleModal(true);
  };

  const handleReschedule = async () => {
    if (!selectedReview || !rescheduleTime) {
      alert('请选择排期时间');
      return;
    }
    setSubmitting(true);
    try {
      await rescheduleFromReview(selectedReview.id, new Date(rescheduleTime).toISOString());
      setShowRescheduleModal(false);
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenResolve = (review: FailureReview) => {
    setSelectedReview(review);
    setResolveConclusion('');
    setResolveAction('republish');
    setShowResolveModal(true);
  };

  const handleResolve = async () => {
    if (!selectedReview || !resolveConclusion.trim()) {
      alert('请输入处理结论');
      return;
    }
    setSubmitting(true);
    try {
      if (resolveAction === 'reschedule') {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        await rescheduleFromReview(selectedReview.id, now.toISOString());
      } else {
        await resolveFailureReview(selectedReview.id, {
          conclusion: resolveConclusion,
          action_type: resolveAction,
        });
      }
      setShowResolveModal(false);
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleHeartbeat = async (channelId: number) => {
    try {
      const result = await sendHeartbeat(channelId);
      if (result.was_degraded) {
        alert('渠道心跳已恢复，可以重新排期了');
      } else {
        alert('心跳上报成功');
      }
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleRestore = async (channelId: number) => {
    if (!confirm('确定要恢复该渠道吗？')) return;
    try {
      await restoreChannel(channelId);
      alert('渠道已恢复');
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const formatTime = (timeStr: string | null | undefined): string => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleString('zh-CN');
  };

  const getStatusBadge = (status: string) => {
    if (status === 'pending') {
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-700"><Clock className="w-3 h-3" />待处理</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" />已处理</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#1e3a5f]/30 border-t-[#1e3a5f] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">失败复核</h1>
            <p className="text-gray-500 mt-1">处理发布失败和渠道降级导致的待复核任务</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {(['pending', 'resolved', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  statusFilter === s
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                )}
              >
                {s === 'pending' ? '待处理' : s === 'resolved' ? '已处理' : '全部'}
              </button>
            ))}
            <button
              onClick={loadData}
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无待复核任务</h3>
            <p className="text-gray-500">所有发布任务运行正常</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const schedule = review.schedule;
              const content = schedule?.content;
              const channel = schedule?.channel;
              const isPending = review.status === 'pending';
              const isDegraded = review.reason?.includes('降级') || review.reason?.includes('心跳超时');

              return (
                <div
                  key={review.id}
                  className={cn(
                    'bg-white rounded-xl shadow-sm p-6 border-l-4 transition-shadow hover:shadow-md',
                    isPending ? 'border-l-yellow-400' : 'border-l-green-400'
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {getStatusBadge(review.status)}
                        {isDegraded && isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            渠道降级
                          </span>
                        )}
                        {!review.publish_record_id && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-100 text-orange-700">
                            <XCircle className="w-3 h-3" />
                            发布前拦截
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          复核 #{review.id}
                        </span>
                      </div>

                      <h3 className="font-semibold text-gray-900 text-lg mb-2">
                        {content?.title || `排期 #${review.schedule_id}`}
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                        {channel && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="text-gray-400">渠道:</span>
                            <span className="font-medium">{channel.name}</span>
                          </div>
                        )}
                        {schedule?.schedule_time && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            <span>{formatTime(schedule.schedule_time)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>创建: {formatTime(review.created_at)}</span>
                        </div>
                        {review.resolved_at && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            <span>处理: {formatTime(review.resolved_at)}</span>
                          </div>
                        )}
                      </div>

                      {review.reason && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-red-700 mb-1">原因</p>
                              <p className="text-sm text-red-600">{review.reason}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {review.conclusion && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg">
                          <p className="text-xs font-medium text-green-700 mb-1">处理结论</p>
                          <p className="text-sm text-green-600">{review.conclusion}</p>
                          {review.action_type && (
                            <p className="text-xs text-green-500 mt-1">
                              操作方式: {review.action_type === 'republish' ? '重新发布' : review.action_type === 'manual_publish' ? '手动发布' : '重新排期'}
                            </p>
                          )}
                        </div>
                      )}

                      {review.publish_record && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500 mb-1">发布记录</p>
                          <p className="text-sm text-gray-700">{review.publish_record.result || '无详细信息'}</p>
                        </div>
                      )}
                    </div>

                    {isPending && (
                      <div className="flex lg:flex-col gap-2 lg:w-40 flex-shrink-0">
                        {isDegraded && channel && (
                          <>
                            <button
                              onClick={() => handleHeartbeat(channel.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                            >
                              <Play className="w-4 h-4" />
                              心跳恢复
                            </button>
                            <button
                              onClick={() => handleRestore(channel.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" />
                              恢复渠道
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleOpenReschedule(review)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors"
                        >
                          <Calendar className="w-4 h-4" />
                          重新排期
                        </button>
                        <button
                          onClick={() => handleOpenResolve(review)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[#1e3a5f] text-white hover:bg-[#2d4a6f] transition-colors"
                        >
                          <ArrowRight className="w-4 h-4" />
                          处理
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showRescheduleModal && selectedReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#1e3a5f]" />
                重新排期
              </h3>
              <button onClick={() => setShowRescheduleModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                为任务 <strong>{selectedReview.schedule?.content?.title || `#${selectedReview.schedule_id}`}</strong> 选择新的发布时间：
              </p>
              <input
                type="datetime-local"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
              />
              <p className="text-xs text-gray-500">
                注意：请先确认渠道已恢复正常（心跳上报或手动恢复），否则重新排期可能再次失败。
              </p>
            </div>
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReschedule}
                disabled={submitting || !rescheduleTime}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-[#1e3a5f] text-white hover:bg-[#2d4a6f] transition-colors disabled:opacity-50"
              >
                {submitting ? '提交中...' : '确认排期'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResolveModal && selectedReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">处理复核</h3>
              <button onClick={() => setShowResolveModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">处理方式</label>
                <div className="space-y-2">
                  {[
                    { value: 'republish', label: '重新发布', desc: '立即重新尝试发布' },
                    { value: 'manual_publish', label: '手动发布', desc: '标记为手动处理，稍后自行发布' },
                    { value: 'reschedule', label: '重新排期', desc: '自动安排到30分钟后发布' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors',
                        resolveAction === opt.value
                          ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="radio"
                        name="action"
                        value={opt.value}
                        checked={resolveAction === opt.value}
                        onChange={() => setResolveAction(opt.value as typeof resolveAction)}
                        className="sr-only"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">处理结论</label>
                <textarea
                  value={resolveConclusion}
                  onChange={(e) => setResolveConclusion(e.target.value)}
                  placeholder="请输入处理结论..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleResolve}
                disabled={submitting || !resolveConclusion.trim()}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-[#1e3a5f] text-white hover:bg-[#2d4a6f] transition-colors disabled:opacity-50"
              >
                {submitting ? '提交中...' : '确认处理'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
