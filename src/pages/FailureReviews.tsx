import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, RefreshCw, CalendarClock, UserCheck, ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';
import { getFailureReviews, resolveFailureReview } from '../api/failureReview';
import type { FailureReview, FailureReviewAction } from '../../shared/types';

const actionLabels: Record<FailureReviewAction, string> = {
  republish: '重新发布',
  manual_publish: '人工发布',
  reschedule: '重新排期',
};

export default function FailureReviews() {
  const [reviews, setReviews] = useState<FailureReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [processing, setProcessing] = useState<FailureReview | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [action, setAction] = useState<FailureReviewAction>('republish');
  const [scheduleTime, setScheduleTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pageSize = 10;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFailureReviews({ page, pageSize, status: tab });
      setReviews(result.items);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, tab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openProcessModal = (review: FailureReview) => {
    setProcessing(review);
    setConclusion('');
    setAction('republish');
    setScheduleTime('');
  };

  const handleSubmit = async () => {
    if (!processing) return;
    if (!conclusion.trim()) {
      alert('请填写处理结论');
      return;
    }
    if (action === 'reschedule' && !scheduleTime) {
      alert('请选择新的排期时间');
      return;
    }
    setSubmitting(true);
    try {
      await resolveFailureReview(processing.id, {
        conclusion,
        action_type: action,
        schedule_time: action === 'reschedule' ? new Date(scheduleTime).toISOString() : undefined,
      });
      setProcessing(null);
      await loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">失败复核</h1>
            <p className="text-gray-500 mt-1">渠道连续失败自动降级后转入待复核的发布任务</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setTab('pending'); setPage(1); }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2',
              tab === 'pending' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            待复核
          </button>
          <button
            onClick={() => { setTab('resolved'); setPage(1); }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2',
              tab === 'resolved' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            )}
          >
            <CheckCircle className="w-4 h-4" />
            已处理
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-[#1e3a5f]/30 border-t-[#1e3a5f] rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{tab === 'pending' ? '暂无待复核任务' : '暂无已处理记录'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">内容</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">渠道</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">转入原因</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">时间</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">状态</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => {
                    const channelPaused = review.schedule?.channel?.status === 'paused';
                    return (
                      <tr key={review.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{review.schedule?.content?.title || `排期 #${review.schedule_id}`}</p>
                          <p className="text-xs text-gray-400 mt-0.5">排期ID: {review.schedule_id}</p>
                        </td>
                        <td className="px-6 py-4">
                          {review.schedule?.channel ? (
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
                              channelPaused ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            )}>
                              {channelPaused && <AlertTriangle className="w-3 h-3" />}
                              {review.schedule.channel.name}
                              {channelPaused && '（降级暂停）'}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <p className="text-sm text-red-600 line-clamp-2" title={review.reason || review.publish_record?.result || ''}>
                            {review.reason || review.publish_record?.result || '发布失败'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600">{new Date(review.created_at).toLocaleString('zh-CN')}</p>
                          {review.resolved_at && (
                            <p className="text-xs text-gray-400 mt-0.5">处理于 {new Date(review.resolved_at).toLocaleString('zh-CN')}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {review.status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-100 text-yellow-700">
                              <AlertTriangle className="w-3 h-3" />
                              待复核
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                              <CheckCircle className="w-3 h-3" />
                              {review.action_type ? actionLabels[review.action_type] : '已处理'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {review.status === 'pending' ? (
                            <button
                              onClick={() => openProcessModal(review)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#1e3a5f] text-white hover:bg-[#2d4a6f] transition-colors"
                            >
                              处理
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {review.handler ? `处理人：${review.handler.username}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">共 {total} 条，第 {page}/{totalPages} 页</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {processing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">处理失败复核</h3>
              <button onClick={() => setProcessing(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-700">{processing.schedule?.content?.title || `排期 #${processing.schedule_id}`}</p>
                <p className="text-xs text-red-600 mt-1">{processing.reason || processing.publish_record?.result}</p>
                {processing.schedule?.channel?.status === 'paused' && (
                  <p className="text-xs text-red-700 mt-2 font-medium">
                    渠道「{processing.schedule.channel.name}」仍处于降级暂停状态，请先在渠道管理页恢复心跳并重新启用渠道。
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">处理方式</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAction('republish')}
                    className={cn(
                      'px-2 py-2 rounded-lg text-xs font-medium transition-all border-2 flex flex-col items-center gap-1',
                      action === 'republish' ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <RefreshCw className="w-4 h-4" />
                    重新发布
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction('reschedule')}
                    className={cn(
                      'px-2 py-2 rounded-lg text-xs font-medium transition-all border-2 flex flex-col items-center gap-1',
                      action === 'reschedule' ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <CalendarClock className="w-4 h-4" />
                    重新排期
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction('manual_publish')}
                    className={cn(
                      'px-2 py-2 rounded-lg text-xs font-medium transition-all border-2 flex flex-col items-center gap-1',
                      action === 'manual_publish' ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <UserCheck className="w-4 h-4" />
                    人工发布
                  </button>
                </div>
              </div>

              {action === 'reschedule' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">新的排期时间</label>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">渠道心跳恢复并重新启用后，可选择新的时间重新排期</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">处理结论</label>
                <textarea
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="请填写处理结论，如：渠道已恢复，重新发布..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setProcessing(null)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
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
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
