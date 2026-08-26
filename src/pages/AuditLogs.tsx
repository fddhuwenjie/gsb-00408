import { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { getAuditLogs } from '../api/auditLog';
import type { AuditLog } from '../../shared/types';

const actionLabels: Record<string, string> = {
  channel_auto_degrade: '渠道自动降级',
  channel_degrade: '渠道手动降级',
  channel_recover: '渠道恢复',
  channel_heartbeat: '渠道心跳',
  channel_health_config: '健康检查配置',
  channel_health_update: '健康信息更新',
  schedule_create: '创建排期',
  schedule_reschedule: '重新排期',
  schedule_pending_review: '排期转待复核',
  failure_review_resolve: '失败复核处理',
};

const PAGE_SIZE = 20;

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        target_type: targetType || undefined,
      });
      setLogs(result.items);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, targetType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <ScrollText className="w-7 h-7 text-[#1e3a5f]" />
              审计日志
            </h1>
            <p className="text-gray-500 mt-1">健康检查、排期与失败复核的统一操作记录</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={targetType}
              onChange={(e) => { setPage(1); setTargetType(e.target.value); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none"
            >
              <option value="">全部类型</option>
              <option value="channel_health">渠道健康</option>
              <option value="channel">渠道</option>
              <option value="schedule">排期</option>
              <option value="failure_review">失败复核</option>
            </select>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">时间</th>
                <th className="text-left px-4 py-3 font-medium">操作人</th>
                <th className="text-left px-4 py-3 font-medium">操作</th>
                <th className="text-left px-4 py-3 font-medium">对象</th>
                <th className="text-left px-4 py-3 font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">加载中...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">暂无审计记录</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.created_at}</td>
                    <td className="px-4 py-3 text-gray-700">{log.operator?.username || (log.operator_id === null ? '系统' : `#${log.operator_id}`)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{actionLabels[log.action] || log.action}</td>
                    <td className="px-4 py-3 text-gray-600">{log.target_type}{log.target_id ? ` #${log.target_id}` : ''}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={log.detail || ''}>{log.detail || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              上一页
            </button>
            <span>{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
