import { cn } from '@/lib/utils';
import type { ContentStatus, ScheduleStatus, PublishStatus } from '../../shared/types';

type StatusType = ContentStatus | ScheduleStatus | PublishStatus;

interface StatusBadgeProps {
  status: StatusType;
  type?: 'content' | 'schedule' | 'publish';
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  draft: {
    label: '草稿',
    className: 'bg-gray-100 text-gray-700',
  },
  pending_review: {
    label: '待复核',
    className: 'bg-yellow-100 text-yellow-700',
  },
  review_approved: {
    label: '复核通过',
    className: 'bg-green-100 text-green-700',
  },
  review_rejected: {
    label: '复核驳回',
    className: 'bg-red-100 text-red-700',
  },
  scheduled: {
    label: '已排期',
    className: 'bg-blue-100 text-blue-700',
  },
  published: {
    label: '已发布',
    className: 'bg-emerald-100 text-emerald-700',
  },
  withdrawn: {
    label: '已撤回',
    className: 'bg-gray-100 text-gray-700',
  },
  pending: {
    label: '待处理',
    className: 'bg-yellow-100 text-yellow-700',
  },
  approved: {
    label: '已批准',
    className: 'bg-green-100 text-green-700',
  },
  rejected: {
    label: '已拒绝',
    className: 'bg-red-100 text-red-700',
  },
  publishing: {
    label: '发布中',
    className: 'bg-blue-100 text-blue-700',
  },
  success: {
    label: '发布成功',
    className: 'bg-green-100 text-green-700',
  },
  failed: {
    label: '发布失败',
    className: 'bg-red-100 text-red-700',
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
