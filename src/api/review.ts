import { get, post } from '../utils/request';
import type {
  Content,
  ReviewRecord,
  ReviewAuditTrail,
  PaginationResult,
  PaginationParams,
} from '../types';

export const getReviewQueue = (params?: PaginationParams & { [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<Content>> => {
  return get<PaginationResult<Content>>('/review/queue', params);
};

export const approveContent = (id: number, opinion: string): Promise<ReviewRecord> => {
  return post<ReviewRecord>(`/review/${id}/approve`, { opinion });
};

export const rejectContent = (id: number, opinion: string): Promise<ReviewRecord> => {
  return post<ReviewRecord>(`/review/${id}/reject`, { opinion });
};

export const overrideReview = (id: number, decision: 'approve' | 'reject', opinion: string): Promise<ReviewRecord> => {
  return post<ReviewRecord>(`/review/${id}/override`, { decision, opinion });
};

export const getReviewAuditTrail = (id: number, params?: PaginationParams): Promise<PaginationResult<ReviewAuditTrail>> => {
  return get<PaginationResult<ReviewAuditTrail>>(`/review/${id}/audit-trail`, params as Record<string, string | number | boolean | undefined>);
};
