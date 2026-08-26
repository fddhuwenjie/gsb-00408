import { get } from '../utils/request';
import type { AuditLog, PaginationResult, PaginationParams } from '../types';

export const getAuditLogs = (
  params?: PaginationParams & { action?: string; target_type?: string; target_id?: number },
): Promise<PaginationResult<AuditLog>> => {
  return get<PaginationResult<AuditLog>>(
    '/audit-logs',
    params as Record<string, string | number | undefined>,
  );
};
