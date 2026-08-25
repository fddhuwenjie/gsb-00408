import { get, post } from '../utils/request';
import type {
  PublishRecord,
  FailureReview,
  PaginationResult,
  PaginationParams,
  PublishStatus,
} from '../types';

export const getPublishRecords = (params?: PaginationParams & {
  status?: PublishStatus;
  start_date?: string;
  end_date?: string;
  channel_id?: number;
  [key: string]: string | number | boolean | undefined;
}): Promise<PaginationResult<PublishRecord>> => {
  return get<PaginationResult<PublishRecord>>('/publish/records', params);
};

export const getFailureReviews = (params?: PaginationParams & { status?: string; [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<FailureReview>> => {
  return get<PaginationResult<FailureReview>>('/failure-reviews', params as Record<string, string | number | boolean | undefined>);
};

export const resolveFailureReview = (id: number, conclusion: string, actionType: 'republish' | 'manual_publish'): Promise<FailureReview> => {
  return post<FailureReview>(`/failure-reviews/${id}/resolve`, { conclusion, action_type: actionType });
};

export const retryPublish = (id: number): Promise<PublishRecord> => {
  return post<PublishRecord>(`/publish/records/${id}/retry`);
};
