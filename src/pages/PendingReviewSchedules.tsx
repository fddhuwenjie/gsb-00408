import { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, FileText, CalendarClock, AlertTriangle, X, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { getScheduleList, rescheduleForReview } from '../api/schedule';
import { getChannelList } from '../api/channel';
import type { Schedule, Channel } from '../../shared/types';

export default function PendingReviewSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [channelId, setChannelId] = useState<number | ''>('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleResult, channelResult] = await Promise.all([
        getScheduleList({ status: 'pending_review', page: 1, pageSize: 100 }),
        getChannelList({ status: 'active', page: 1, pageSize: 100 }),
      ]);
      setSchedules(scheduleResult.items);
      setChannels(channelResult.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openReschedule = (schedule: Schedule) => {
    setSelected(schedule);
    setChannelId(schedule.channel_id);
    setScheduleTime('');
    setShowModal(true);
  };

  const handleReschedule = async () => {
    if (!selected || !scheduleTime) return;
    setSubmitting(true);
    try {
      await rescheduleForReview(selected.id, {
        channel_id: channelId === '' ? undefined : Number(channelId),
        schedule_time: new Date(scheduleTime).toISOString(),
      });
      setShowModal(false);
      alert('重新排期成功');
      loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
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
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-7 h-7 text-[#1e3a5f]" />
              待复核排期
            </h1>
            <p className="text-gray-500 mt-1">渠道降级或健康检查未通过而转入待复核的排期，恢复后可重新排期</p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            刷新
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">内容标题</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">原渠道</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">原排期时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {schedules.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900 font-medium truncate max-w-xs">{item.content?.title || `内容#${item.content_id}`}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{item.channel?.name || `渠道#${item.channel_id}`}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm hidden sm:table-cell">{item.schedule_time || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 bg-orange-100 text-orange-700">
                        <Clock className="w-3.5 h-3.5" />
                        待复核
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openReschedule(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2d4a6f] transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        重新排期
                      </button>
                    </td>
                  </tr>
                ))}
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>暂无待复核排期</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">重新排期</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="p-3 bg-orange-50 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
                <p className="text-sm text-orange-700">
                  请确认目标渠道已恢复且启用。若原渠道仍处于停用/降级状态，可切换到其他可用渠道。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">内容</label>
                <p className="text-gray-900 font-medium">{selected.content?.title || `内容#${selected.content_id}`}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">目标渠道</label>
                <select
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">新排期时间</label>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReschedule}
                disabled={!scheduleTime || submitting}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-all bg-[#1e3a5f] hover:bg-[#2d4a6f]',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {submitting ? '提交中...' : '确认重新排期'}
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
