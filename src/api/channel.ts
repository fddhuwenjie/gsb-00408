import { get, post, put, del } from '../utils/request';
import type { Channel, ChannelHealth, ScheduleRiskWarning, PaginationResult, PaginationParams } from '../types';

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
}): Promise<ChannelHealth> => {
  return put<ChannelHealth>(`/channel/${channelId}/health`, data);
};

export const refreshChannelHealth = (channelId: number): Promise<ChannelHealth> => {
  return post<ChannelHealth>(`/channel/${channelId}/health/refresh`);
};

export const getHighRiskChannels = (): Promise<ScheduleRiskWarning[]> => {
  return get<ScheduleRiskWarning[]>('/channel/risk/high');
};
