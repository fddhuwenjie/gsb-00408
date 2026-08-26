import { get, post } from '../utils/request';
import type {
  FailureReview,
  FailureReviewAction,
  FailureReviewStatus,
  PaginationResult,
  PaginationParams,
} from '../types';

export const getFailureReviews = (
  params?: PaginationParams & { status?: FailureReviewStatus },
): Promise<PaginationResult<FailureReview>> => {
  return get<PaginationResult<FailureReview>>('/failure-reviews', params as Record<string, string | number | boolean | undefined>);
};

export const resolveFailureReview = (
  id: number,
  conclusion: string,
  actionType: FailureReviewAction,
): Promise<FailureReview> => {
  return post<FailureReview>(`/failure-reviews/${id}/resolve`, {
    conclusion,
    action_type: actionType,
  });
};
