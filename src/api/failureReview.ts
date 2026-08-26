import { get, post } from '../utils/request';
import type { FailureReview, FailureReviewAction, PaginationResult, PaginationParams } from '../types';

export const getFailureReviews = (
  params?: PaginationParams & { status?: string },
): Promise<PaginationResult<FailureReview>> => {
  return get<PaginationResult<FailureReview>>('/failure-reviews', params as Record<string, string | number | undefined>);
};

export const getFailureReviewDetail = (id: number): Promise<FailureReview> => {
  return get<FailureReview>(`/failure-reviews/${id}`);
};

export interface ResolveFailureReviewParams {
  conclusion: string;
  action_type: FailureReviewAction;
  schedule_time?: string;
}

export interface ResolveFailureReviewResult {
  review: FailureReview;
  schedule?: {
    id: number;
    schedule_time: string;
    status: string;
  };
}

export const resolveFailureReview = (
  id: number,
  data: ResolveFailureReviewParams,
): Promise<ResolveFailureReviewResult> => {
  return post<ResolveFailureReviewResult>(`/failure-reviews/${id}/resolve`, data);
};
