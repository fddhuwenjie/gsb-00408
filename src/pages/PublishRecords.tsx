import { useState, useEffect, useCallback } from 'react';
import { Download, Filter, FileText, CheckCircle, XCircle, Clock, ChevronDown, AlertTriangle, Activity, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { getPublishRecords, getFailureReviews, resolveFailureReview } from '../api/publish';
import { getChannelList, getChannelHealthList } from '../api/channel';
import { exportPublishRecords } from '../api/export';
import type { PublishRecord, PublishStatus, Channel, FailureReview, ChannelHealth } from '../../shared/types';

const statusOptions: { value: PublishStatus | 'all'; label: string; color: string; icon: typeof Clock }[] = [
  { value: 'all', label: '全部状态', color: 'bg-gray-100 text-gray-700', icon: Clock },
  { value: 'pending', label: '待发布', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  { value: 'success', label: '发布成功', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  { value: 'failed', label: '发布失败', color: 'bg-red-100 text-red-700', icon: XCircle },
  { value: 'withdrawn', label: '已撤回', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
];

const channelColors: Record<number, string> = {
  1: 'bg-green-500',
  2: 'bg-red-500',
  3: 'bg-pink-500',
  4: 'bg-orange-500',
  5: 'bg-blue-500',
  6: 'bg-purple-500',
  7: 'bg-teal-500',
  8: 'bg-gray-500',
};

export default function PublishRecords() {
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelHealthData, setChannelHealthData] = useState<Record<number, ChannelHealth>>({});
  const [failureReviews, setFailureReviews] = useState<FailureReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PublishStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<number | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [showFailureReviewModal, setShowFailureReviewModal] = useState(false);
  const [selectedFailureReview, setSelectedFailureReview] = useState<FailureReview | null>(null);
  const [reviewConclusion, setReviewConclusion] = useState('');
  const [reviewActionType, setReviewActionType] = useState<'republish' | 'manual_publish'>('republish');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: { [key: string]: string | number | boolean | undefined } = { page: 1, pageSize: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (channelFilter !== 'all') params.channel_id = channelFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const [recordsResult, channelsResult, healthList, reviewsResult] = await Promise.all([
        getPublishRecords(params),
        getChannelList(),
        getChannelHealthList(),
        getFailureReviews({ page: 1, pageSize: 100 }),
      ]);
      setRecords(recordsResult.items);
      setChannels(channelsResult.items || []);
      const hMap: Record<number, ChannelHealth> = {};
      healthList.forEach(h => { hMap[h.channel_id] = h; });
      setChannelHealthData(hMap);
      setFailureReviews(reviewsResult.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, channelFilter, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    try {
      await exportPublishRecords({});
      alert('CSV导出成功');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleResolveReview = async () => {
    if (!reviewConclusion.trim() || !selectedFailureReview) return;
    setSubmitting(true);
    try {
      await resolveFailureReview(selectedFailureReview.id, reviewConclusion, reviewActionType);
      setShowFailureReviewModal(false);
      alert('复盘已提交');
      loadData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusInfo = (status: PublishStatus) => {
    return statusOptions.find(s => s.value === status) || statusOptions[0];
  };

  const selectedStatusInfo = statusOptions.find(s => s.value === statusFilter) || statusOptions[0];
  const selectedChannelName = channelFilter === 'all' ? '全部渠道' : channels.find(c => c.id === channelFilter)?.name;

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
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">发布记录</h1>
            <p className="text-gray-500 mt-1">查看内容发布历史记录</p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors"
          >
            <Download className="w-5 h-5" />
            导出CSV
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex flex-wrap gap-3 lg:flex-1">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none text-sm"
                />
                <span className="text-gray-400">至</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowStatusDropdown(!showStatusDropdown); setShowChannelDropdown(false); }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className={cn('w-2 h-2 rounded-full', selectedStatusInfo.color.split(' ')[0])} />
                  <span className="font-medium text-gray-900">{selectedStatusInfo.label}</span>
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showStatusDropdown && 'rotate-180')} />
                </button>
                {showStatusDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                    {statusOptions.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setStatusFilter(opt.value); setShowStatusDropdown(false); }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2',
                          statusFilter === opt.value && 'bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full', opt.color.split(' ')[0])} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowChannelDropdown(!showChannelDropdown); setShowStatusDropdown(false); }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  <Filter className="w-4 h-4 text-gray-500" />
                  {typeof channelFilter === 'number' && <span className={cn('w-2 h-2 rounded-full', channelColors[channelFilter] || 'bg-gray-400')} />}
                  <span className="font-medium text-gray-900">{selectedChannelName}</span>
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showChannelDropdown && 'rotate-180')} />
                </button>
                {showChannelDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => { setChannelFilter('all'); setShowChannelDropdown(false); }}
                      className={cn(
                        'w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors',
                        channelFilter === 'all' && 'bg-[#1e3a5f]/5 text-[#1e3a5f]'
                      )}
                    >
                      全部渠道
                    </button>
                    {channels.map(channel => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => { setChannelFilter(channel.id); setShowChannelDropdown(false); }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2',
                          channelFilter === channel.id && 'bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full', channelColors[channel.id] || 'bg-gray-400')} />
                        {channel.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">内容标题</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">渠道</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">渠道健康</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">排期时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">发布状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">发布时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records.map((item) => {
                  const statusInfo = getStatusInfo(item.status as PublishStatus);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900 font-medium truncate max-w-xs">{item.schedule?.content?.title || `内容#${item.schedule?.content_id || item.id}`}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full', channelColors[item.schedule?.channel_id || 1] || 'bg-gray-400')} />
                          <span className="text-gray-700">{item.schedule?.channel?.name || `渠道#${item.schedule?.channel_id}`}</span>
                        </div>
                      </td>
                      {(() => {
                        const chId = item.schedule?.channel_id || 0;
                        const health = channelHealthData[chId];
                        if (!health) return <td className="px-6 py-4 hidden md:table-cell">-</td>;
                        const healthDotColor = health.success_rate >= 0.8 ? 'bg-green-500' : health.success_rate >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
                        const healthTextColor = health.success_rate >= 0.8 ? 'text-green-700' : health.success_rate >= 0.5 ? 'text-yellow-700' : 'text-red-700';
                        const rateLimitBadgeClass = health.rate_limit_status === 'limited' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                        return (
                          <td className="px-6 py-4 hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <span className={cn('w-2 h-2 rounded-full', healthDotColor)} />
                              <span className={cn('text-sm font-medium', healthTextColor)}>{(health.success_rate * 100).toFixed(0)}%</span>
                              {health.rate_limit_status !== 'normal' && (
                                <span className={cn('px-1.5 py-0.5 rounded text-xs', rateLimitBadgeClass)}>
                                  {health.rate_limit_status === 'limited' ? '限流' : '阻断'}
                                </span>
                              )}
                              {health.responsible_person && (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <User className="w-3 h-3" />
                                  {health.responsible_person}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })()}
                      <td className="px-6 py-4 text-gray-500 text-sm hidden sm:table-cell">{item.schedule?.schedule_time || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5', statusInfo.color)}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {statusInfo.label}
                          </span>
                          {item.status === 'failed' && (() => {
                            const review = failureReviews.find(r => r.publish_record_id === item.id);
                            if (!review) return null;
                            return (
                              <button
                                onClick={() => { setSelectedFailureReview(review); setShowFailureReviewModal(true); setReviewConclusion(''); setReviewActionType('republish'); }}
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 cursor-pointer',
                                  review.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                                )}
                              >
                                {review.status === 'pending' ? (
                                  <><AlertTriangle className="w-3 h-3" />待复盘</>
                                ) : (
                                  <><CheckCircle className="w-3 h-3" />已复盘</>
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm hidden md:table-cell">{item.publish_time || '-'}</td>
                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>暂无发布记录</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showFailureReviewModal && selectedFailureReview && (() => {
          const record = records.find(r => r.id === selectedFailureReview.publish_record_id);
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFailureReviewModal(false)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <h2 className="text-lg font-semibold text-gray-900">失败复盘</h2>
                  </div>
                  <button onClick={() => setShowFailureReviewModal(false)} className="text-gray-400 hover:text-gray-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">内容标题:</span>
                      <span className="text-gray-900 font-medium">{record?.schedule?.content?.title || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">渠道:</span>
                      <span className="text-gray-900">{record?.schedule?.channel?.name || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">复盘状态:</span>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', selectedFailureReview.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700')}>
                        {selectedFailureReview.status === 'pending' ? '待复盘' : '已复盘'}
                      </span>
                    </div>
                  </div>
                  {selectedFailureReview.status === 'pending' ? (
                    <div className="space-y-4 border-t border-gray-100 pt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">复盘结论</label>
                        <textarea
                          value={reviewConclusion}
                          onChange={(e) => setReviewConclusion(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none text-sm"
                          placeholder="请输入复盘结论..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">处理方式</label>
                        <select
                          value={reviewActionType}
                          onChange={(e) => setReviewActionType(e.target.value as 'republish' | 'manual_publish')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none text-sm"
                        >
                          <option value="republish">重新发布</option>
                          <option value="manual_publish">转人工发布</option>
                        </select>
                      </div>
                      <button
                        onClick={handleResolveReview}
                        disabled={!reviewConclusion.trim() || submitting}
                        className="w-full px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Activity className="w-4 h-4" />
                        {submitting ? '提交中...' : '提交复盘'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">复盘结论:</span>
                        <span className="text-gray-900">{selectedFailureReview.conclusion || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">处理方式:</span>
                        <span className="text-gray-900">{selectedFailureReview.action_type === 'republish' ? '重新发布' : selectedFailureReview.action_type === 'manual_publish' ? '转人工发布' : '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">处理人:</span>
                        <span className="text-gray-900">{selectedFailureReview.handler?.username || `#${selectedFailureReview.handler_id || '-'}`}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">处理时间:</span>
                        <span className="text-gray-900">{selectedFailureReview.resolved_at || '-'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
