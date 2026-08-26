import { get } from '../utils/request';
import type { AuditLog, PaginationResult, PaginationParams } from '../types';

export const getAuditLogs = (
  params?: PaginationParams & {
    target_type?: string;
    target_id?: number;
    operator_id?: number;
    action?: string;
  },
): Promise<PaginationResult<AuditLog>> => {
  return get<PaginationResult<AuditLog>>('/audit-logs', params as Record<string, string | number | boolean | undefined>);
};
