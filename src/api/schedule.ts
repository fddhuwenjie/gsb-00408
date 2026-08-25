import { get, post, put } from '../utils/request';
import type {
  Schedule,
  ScheduleRiskWarning,
  SubmitScheduleRequest,
  UpdateScheduleRequest,
  PaginationResult,
  PaginationParams,
} from '../types';

export const getScheduleList = (params?: PaginationParams & { [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<Schedule>> => {
  return get<PaginationResult<Schedule>>('/schedule', params);
};

export const getScheduleCalendar = (startDate: string, endDate: string): Promise<Schedule[]> => {
  return get<Schedule[]>('/schedule/calendar', { startDate, endDate });
};

export interface CreateScheduleResponse {
  schedule: Schedule;
  risk_warning?: ScheduleRiskWarning;
}

export const createSchedule = (data: SubmitScheduleRequest & { content_id: number }): Promise<CreateScheduleResponse> => {
  return post<CreateScheduleResponse>('/schedule', data);
};

export const updateSchedule = (id: number, data: UpdateScheduleRequest): Promise<Schedule> => {
  return put<Schedule>(`/schedule/${id}`, data);
};

export const withdrawSchedule = (id: number, reason: string): Promise<Schedule> => {
  return post<Schedule>(`/schedule/${id}/withdraw`, { reason });
};

export const assessScheduleRisk = (channelId: number): Promise<ScheduleRiskWarning> => {
  return get<ScheduleRiskWarning>(`/schedule/risk/${channelId}`);
};
