import { get, post, put, del } from '../utils/request';
import type {
  Content,
  CreateContentRequest,
  PaginationResult,
  PaginationParams,
  Schedule,
  SubmitScheduleRequest,
} from '../types';

export const getContentList = (params?: PaginationParams & { [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<Content>> => {
  return get<PaginationResult<Content>>('/content', params);
};

export const getContentDetail = (id: number): Promise<Content> => {
  return get<Content>(`/content/${id}`);
};

export const createContent = (data: CreateContentRequest): Promise<Content> => {
  return post<Content>('/content', data);
};

export const updateContent = (id: number, data: Partial<CreateContentRequest>): Promise<Content> => {
  return put<Content>(`/content/${id}`, data);
};

export const deleteContent = (id: number): Promise<void> => {
  return del<void>(`/content/${id}`);
};

export const submitSchedule = (id: number, data: SubmitScheduleRequest): Promise<Schedule> => {
  return post<Schedule>(`/content/${id}/schedule`, data);
};
