import { get, post, put, del } from '../utils/request';
import type { Channel, ChannelHealth, ScheduleRiskWarning, PaginationResult, PaginationParams, FailureReview, AuditLog, Schedule } from '../types';

export const getChannelList = (params?: PaginationParams & { status?: string; type?: string }): Promise<PaginationResult<Channel>> => {
  return get<PaginationResult<Channel>>('/channel', params as Record<string, string | number | boolean | undefined>);
};

export interface ChannelStatus {
  channel_id: number;
  channel_name: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
}

export const getChannelStatus = (): Promise<{ active_count: number; inactive_count: number; channels: (Channel & { today_schedule_count: number })[] }> => {
  return get('/channel/status');
};

export const addChannel = (data: Partial<Channel>): Promise<Channel> => {
  return post<Channel>('/channel', data);
};

export const updateChannel = (id: number, data: Partial<Channel>): Promise<Channel> => {
  return put<Channel>(`/channel/${id}`, data);
};

export const deleteChannel = (id: number): Promise<{ deleted: boolean }> => {
  return del(`/channel/${id}`);
};

export const getChannelHealthList = (): Promise<ChannelHealth[]> => {
  return get<ChannelHealth[]>('/channel/health');
};

export const getChannelHealth = (channelId: number): Promise<ChannelHealth> => {
  return get<ChannelHealth>(`/channel/${channelId}/health`);
};

export const updateChannelHealth = (channelId: number, data: {
  success_rate?: number;
  last_failure_reason?: string;
  rate_limit_status?: string;
  responsible_person?: string;
  is_health_check_enabled?: boolean;
  degradation_threshold?: number;
}): Promise<ChannelHealth> => {
  return put<ChannelHealth>(`/channel/${channelId}/health`, data);
};

export const refreshChannelHealth = (channelId: number): Promise<ChannelHealth> => {
  return post<ChannelHealth>(`/channel/${channelId}/health/refresh`);
};

export const getHighRiskChannels = (): Promise<ScheduleRiskWarning[]> => {
  return get<ScheduleRiskWarning[]>('/channel/risk/high');
};

export const getDegradedChannels = (): Promise<ChannelHealth[]> => {
  return get<ChannelHealth[]>('/channel/degraded');
};

export const sendHeartbeat = (channelId: number): Promise<{ health: ChannelHealth; was_degraded: boolean }> => {
  return post(`/channel/${channelId}/heartbeat`);
};

export const updateHealthConfig = (channelId: number, data: {
  is_health_check_enabled?: boolean;
  degradation_threshold?: number;
}): Promise<ChannelHealth> => {
  return put<ChannelHealth>(`/channel/${channelId}/health/config`, data);
};

export const degradeChannel = (channelId: number, reason: string): Promise<ChannelHealth> => {
  return post<ChannelHealth>(`/channel/${channelId}/degrade`, { reason });
};

export const restoreChannel = (channelId: number): Promise<ChannelHealth> => {
  return post<ChannelHealth>(`/channel/${channelId}/restore`);
};

export const getChannelAuditLogs = (channelId: number, params?: PaginationParams): Promise<PaginationResult<AuditLog>> => {
  return get<PaginationResult<AuditLog>>(`/channel/${channelId}/audit-logs`, params as Record<string, string | number | undefined>);
};

export const getFailureReviews = (params?: PaginationParams & { status?: string }): Promise<PaginationResult<FailureReview>> => {
  return get<PaginationResult<FailureReview>>('/failure-reviews', params as Record<string, string | number | undefined>);
};

export const getFailureReview = (id: number): Promise<FailureReview> => {
  return get<FailureReview>(`/failure-reviews/${id}`);
};

export const resolveFailureReview = (id: number, data: { conclusion: string; action_type: 'republish' | 'manual_publish' | 'reschedule' }): Promise<FailureReview> => {
  return post<FailureReview>(`/failure-reviews/${id}/resolve`, data);
};

export const rescheduleFromReview = (id: number, scheduleTime: string): Promise<FailureReview> => {
  return post<FailureReview>(`/failure-reviews/${id}/reschedule`, { schedule_time: scheduleTime });
};

export const getPendingReviewSchedules = (params?: PaginationParams): Promise<PaginationResult<Schedule>> => {
  return get<PaginationResult<Schedule>>('/schedule/pending-review/list', params as Record<string, string | number | undefined>);
};

export const rescheduleSchedule = (id: number, scheduleTime: string): Promise<Schedule> => {
  return post<Schedule>(`/schedule/${id}/reschedule`, { schedule_time: scheduleTime });
};
