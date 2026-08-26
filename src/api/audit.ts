import { get } from '../utils/request';
import type {
  AuditRecord,
  AuditAction,
  PaginationResult,
  PaginationParams,
} from '../types';

export const getAuditRecords = (
  params?: PaginationParams & {
    action?: AuditAction;
    target_type?: 'channel' | 'schedule' | 'failure_review';
    target_id?: number;
  },
): Promise<PaginationResult<AuditRecord>> => {
  return get<PaginationResult<AuditRecord>>('/audit', params as Record<string, string | number | boolean | undefined>);
};
