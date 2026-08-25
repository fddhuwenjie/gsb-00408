import React, { useState, useEffect } from 'react';
import { Eye, Check, X, FileText, Video, Image, RotateCcw, Clock, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { getReviewQueue, approveContent, rejectContent, overrideReview, getReviewAuditTrail } from '../api/review';
import type { Content, ContentType, ReviewAuditTrail } from '../../shared/types';

const typeIcons: Record<ContentType, typeof FileText> = {
  article: FileText,
  video: Video,
  poster: Image,
};

const typeLabels: Record<ContentType, string> = {
  article: '文章',
  video: '视频',
  poster: '海报',
};

const typeColors: Record<ContentType, string> = {
  article: 'bg-blue-100 text-blue-700',
  video: 'bg-purple-100 text-purple-700',
  poster: 'bg-orange-100 text-orange-700',
};

export default function ReviewQueue() {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewType, setReviewType] = useState<'approve' | 'reject'>('approve');
  const [opinion, setOpinion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState<'approve' | 'reject'>('approve');
  const [overrideOpinion, setOverrideOpinion] = useState('');
  const [auditTrail, setAuditTrail] = useState<ReviewAuditTrail[]>([]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const result = await getReviewQueue({ page: 1, pageSize: 50 });
      setContents(result.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleOpenReview = (content: Content, type: 'approve' | 'reject') => {
    setSelectedContent(content);
    setReviewType(type);
    setOpinion('');
    setShowReviewModal(true);
  };

  const handleSubmitReview = async () => {
    if (reviewType === 'reject' && !opinion.trim()) {
      alert('驳回意见不能为空');
      return;
    }
    if (!selectedContent) return;
    setSubmitting(true);
    try {
      if (reviewType === 'approve') {
        await approveContent(selectedContent.id, opinion);
      } else {
        await rejectContent(selectedContent.id, opinion);
      }
      setShowReviewModal(false);
      alert(`已${reviewType === 'approve' ? '通过' : '驳回'}：${selectedContent.title}`);
      loadQueue();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetail = async (content: Content) => {
    setSelectedContent(content);
    setAuditTrail([]);
    setShowDetailModal(true);
    try {
      const result = await getReviewAuditTrail(content.id, { page: 1, pageSize: 50 });
      setAuditTrail(result.items);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOverrideReview = async () => {
    if (!overrideOpinion.trim() || !selectedContent) return;
    setSubmitting(true);
    try {
      await overrideReview(selectedContent.id, overrideDecision, overrideOpinion);
      setShowOverrideModal(false);
      setShowDetailModal(false);
      alert(`已改判为${overrideDecision === 'approve' ? '通过' : '驳回'}：${selectedContent.title}`);
      loadQueue();
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
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">待复核队列</h1>
          <p className="text-gray-500 mt-1">审核待发布的内容</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">标题</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">提交时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">版本</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contents.map((item) => {
                  const Icon = typeIcons[item.type];
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-gray-900 font-medium truncate max-w-xs">{item.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5', typeColors[item.type])}>
                          <Icon className="w-3.5 h-3.5" />
                          {typeLabels[item.type]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm hidden md:table-cell">{item.created_at}</td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          v{item.scan_version}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(item)}
                            className="p-2 rounded-lg text-gray-500 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenReview(item, 'approve')}
                            className="p-2 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 transition-colors"
                            title="通过"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenReview(item, 'reject')}
                            className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="驳回"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {contents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>暂无待复核内容</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showReviewModal && selectedContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <h3 className={cn(
              'text-lg font-semibold mb-2',
              reviewType === 'approve' ? 'text-green-700' : 'text-red-700'
            )}>
              {reviewType === 'approve' ? '通过审核' : '驳回内容'}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              {reviewType === 'approve' ? '将通过：' : '将驳回：'}<span className="font-medium text-gray-700">{selectedContent.title}</span>
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {reviewType === 'reject' ? '驳回意见' : '审核意见'}
                {reviewType === 'reject' && <span className="text-red-500"> *</span>}
              </label>
              <textarea
                value={opinion}
                onChange={(e) => setOpinion(e.target.value)}
                placeholder={reviewType === 'reject' ? '请输入驳回原因...' : '请输入审核意见（选填）...'}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none resize-none"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submitting || (reviewType === 'reject' && !opinion.trim())}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2',
                  reviewType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {submitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">内容详情</h3>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="mb-4">
                <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5', typeColors[selectedContent.type])}>
                  {React.createElement(typeIcons[selectedContent.type], { className: 'w-3.5 h-3.5' })}
                  {typeLabels[selectedContent.type]}
                </span>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-4">{selectedContent.title}</h4>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-gray-700 whitespace-pre-wrap">
                  {selectedContent.content || '（内容为空）'}
                </p>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <span>提交时间：{selectedContent.created_at}</span>
              </div>

              {auditTrail.length > 0 && (
                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    审核轨迹
                  </h5>
                  <div className="space-y-3">
                    {auditTrail.map((trail) => (
                      <div key={trail.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            'w-3 h-3 rounded-full mt-1',
                            trail.action === 'create' ? 'bg-blue-500' : 'bg-orange-500'
                          )} />
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        </div>
                        <div className="pb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              'px-2 py-0.5 rounded text-xs font-medium',
                              trail.action === 'create' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            )}>
                              {trail.action === 'create' ? '创建' : '改判'}
                            </span>
                            <span className="text-xs text-gray-400">{trail.created_at}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                            <User className="w-3.5 h-3.5" />
                            <span>操作人 #{trail.operator_id}</span>
                          </div>
                          {trail.action === 'override' && trail.previous_decision && (
                            <p className="text-xs text-gray-500 mb-1">
                              决定变更：{trail.previous_decision === 'approve' ? '通过' : '驳回'} → {trail.new_decision === 'approve' ? '通过' : '驳回'}
                            </p>
                          )}
                          <p className="text-sm text-gray-700">{trail.opinion}</p>
                          <p className="text-xs text-gray-400 mt-1">v{trail.opinion_version}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-4 p-6 border-t border-gray-200">
              {auditTrail.length > 0 && (
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setOverrideDecision('approve');
                    setOverrideOpinion('');
                    setShowOverrideModal(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  改判
                </button>
              )}
              <button
                onClick={() => { setShowDetailModal(false); handleOpenReview(selectedContent, 'reject'); }}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-red-300 text-red-700 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                驳回
              </button>
              <button
                onClick={() => { setShowDetailModal(false); handleOpenReview(selectedContent, 'approve'); }}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                通过
              </button>
            </div>
          </div>
        </div>
      )}

      {showOverrideModal && selectedContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <h3 className="text-lg font-semibold text-orange-700 mb-2 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              改判审核
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              改判内容：<span className="font-medium text-gray-700">{selectedContent.title}</span>
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">新决定</label>
              <select
                value={overrideDecision}
                onChange={(e) => setOverrideDecision(e.target.value as 'approve' | 'reject')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
              >
                <option value="approve">通过</option>
                <option value="reject">驳回</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                改判意见 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={overrideOpinion}
                onChange={(e) => setOverrideOpinion(e.target.value)}
                placeholder="请输入改判原因..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none resize-none"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleOverrideReview}
                disabled={submitting || !overrideOpinion.trim()}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '提交中...' : '确认改判'}
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
