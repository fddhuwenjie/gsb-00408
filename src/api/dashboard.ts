import { get } from '../utils/request';
import type { DashboardStats, Content, Schedule } from '../types';

export const getDashboardStats = (): Promise<DashboardStats> => {
  return get<DashboardStats>('/dashboard/stats');
};

export const getDashboardPending = (): Promise<Content[]> => {
  return get<Content[]>('/dashboard/pending');
};

export const getDashboardRecentSchedules = (): Promise<Schedule[]> => {
  return get<Schedule[]>('/dashboard/recent-schedules');
};
