import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Calendar, X, HeartPulse } from 'lucide-react';
import { cn } from '../lib/utils';
import { getFailureReviews, resolveFailureReview } from '../api/failureReview';
import { rescheduleSchedule } from '../api/schedule';
import { getChannelHealthList } from '../api/channel';
import StatusBadge from '../components/StatusBadge';
import type { FailureReview, FailureReviewAction, FailureReviewStatus, ChannelHealth } from '../../shared/types';
import { useAuthStore } from '@/store/useAuthStore';

type StatusFilter = FailureReviewStatus | 'all';

export default function FailureReviews() {
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<FailureReview[]>([]);
  const [healthMap, setHealthMap] = useState<Record<number, ChannelHealth>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [rescheduleInputs, setRescheduleInputs] = useState<Record<number, string>>({});
  const [resolveTarget, setResolveTarget] = useState<FailureReview | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [actionType, setActionType] = useState<FailureReviewAction>('republish');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [result, healthList] = await Promise.all([
        getFailureReviews({
          page: 1,
          pageSize: 50,
          status: statusFilter === 'all' ? undefined : statusFilter,
        }),
        getChannelHealthList(),
      ]);
      setReviews(result.items);
      const map: Record<number, ChannelHealth> = {};
      healthList.forEach((h) => { map[h.channel_id] = h; });
      setHealthMap(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReschedule = async (review: FailureReview) => {
    const time = rescheduleInputs[review.schedule_id];
    if (!time) {
      alert('请选择新的排期时间');
      return;
    }
    try {
      await rescheduleSchedule(review.schedule_id, new Date(time).toISOString());
      alert('重新排期成功');
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleResolve = async () => {
    if (!resolveTarget) return;
    if (!conclusion.trim()) {
      alert('请填写处理结论');
      return;
    }
    setSaving(true);
    try {
      await resolveFailureReview(resolveTarget.id, conclusion.trim(), actionType);
      setResolveTarget(null);
      setConclusion('');
      setActionType('republish');
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toDatetimeLocal = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">失败复核</h1>
            <p className="text-gray-500 mt-1">处理发布失败与渠道降级转入的待复核任务</p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {([
            { value: 'pending', label: '待处理' },
            { value: 'resolved', label: '已处理' },
            { value: 'all', label: '全部' },
          ] as { value: StatusFilter; label: string }[]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                statusFilter === tab.value
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-[#1e3a5f]/30 border-t-[#1e3a5f] rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-16 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-500">暂无失败复核记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const schedule = review.schedule;
              const channelId = schedule?.channel_id;
              const health = channelId ? healthMap[channelId] : undefined;
              const isPendingReviewSchedule = schedule?.status === 'pending_review';
              return (
                <div key={review.id} className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          排期 #{review.schedule_id}
                          {schedule?.channel?.name ? ` · ${schedule.channel.name}` : ''}
                        </span>
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
                          review.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        )}>
                          {review.status === 'pending' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                          {review.status === 'pending' ? '待处理' : '已处理'}
                        </span>
                        {schedule && <StatusBadge status={schedule.status} />}
                        {health && !health.enabled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            渠道已降级（连续失败 {health.consecutive_failures}/{health.degrade_threshold}）
                          </span>
                        )}
                        {health?.enabled && isPendingReviewSchedule && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <HeartPulse className="w-3 h-3" />
                            渠道心跳已恢复
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-gray-500 space-y-1">
                        {schedule && (
                          <p className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            原排期时间：{schedule.schedule_time}
                          </p>
                        )}
                        {health?.last_heartbeat && (
                          <p className="flex items-center gap-2">
                            <HeartPulse className="w-4 h-4" />
                            最近心跳:{health.last_heartbeat}
                          </p>
                        )}
                        <p>创建时间：{review.created_at}</p>
                        {review.conclusion && (
                          <p className="text-gray-700">处理结论：{review.conclusion}</p>
                        )}
                        {review.action_type && (
                          <p className="text-gray-700">
                            处理方式:{review.action_type === 'republish' ? '重新发布' : '人工发布'}
                          </p>
                        )}
                      </div>
                    </div>

                    {review.status === 'pending' && (
                      <div className="flex flex-col gap-3 lg:w-80 shrink-0">
                        {isPendingReviewSchedule && (user?.role === 'editor' || user?.role === 'admin') && (
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={rescheduleInputs[review.schedule_id] ?? toDatetimeLocal(schedule?.schedule_time)}
                              onChange={(e) =>
                                setRescheduleInputs({ ...rescheduleInputs, [review.schedule_id]: e.target.value })
                              }
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none"
                            />
                            <button
                              onClick={() => handleReschedule(review)}
                              disabled={health ? !health.enabled : false}
                              className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#1e3a5f] hover:bg-[#2d4a6f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={health && !health.enabled ? '渠道心跳未恢复，暂不能重新排期' : '重新排期'}
                            >
                              重新排期
                            </button>
                          </div>
                        )}
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => { setResolveTarget(review); setConclusion(''); setActionType('republish'); }}
                            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            填写复核结论
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {resolveTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">失败复核处理</h3>
              <button onClick={() => setResolveTarget(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">处理方式</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setActionType('republish')}
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border-2',
                      actionType === 'republish'
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    )}
                  >
                    重新发布
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('manual_publish')}
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border-2',
                      actionType === 'manual_publish'
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    )}
                  >
                    人工发布
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">处理结论</label>
                <textarea
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="请输入处理结论..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setResolveTarget(null)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleResolve}
                disabled={!conclusion.trim() || saving}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium text-white bg-[#1e3a5f] hover:bg-[#2d4a6f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '提交中...' : '确认处理'}
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
