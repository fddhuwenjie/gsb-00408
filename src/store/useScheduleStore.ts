import { create } from 'zustand';
import axios from 'axios';
import type {
  Schedule,
  UpdateScheduleRequest,
  PaginationParams,
  PaginationResult,
} from '../../shared/types';

interface ScheduleState {
  schedules: Schedule[];
  calendarData: Schedule[];
  total: number;
  loading: boolean;
  fetchSchedules: (params?: PaginationParams & { status?: string; channel_id?: number }) => Promise<void>;
  fetchCalendar: (startDate: string, endDate: string) => Promise<void>;
  createSchedule: (data: { content_id: number; channel_id: number; schedule_time: string }) => Promise<Schedule>;
  updateSchedule: (id: number, data: UpdateScheduleRequest) => Promise<Schedule>;
  withdrawSchedule: (id: number, reason: string) => Promise<Schedule>;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedules: [],
  calendarData: [],
  total: 0,
  loading: false,

  fetchSchedules: async (params) => {
    set({ loading: true });
    try {
      const response = await axios.get<PaginationResult<Schedule>>('/api/schedules', { params });
      set({
        schedules: response.data.items,
        total: response.data.total,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  fetchCalendar: async (startDate: string, endDate: string) => {
    set({ loading: true });
    try {
      const response = await axios.get<Schedule[]>('/api/schedules/calendar', {
        params: { startDate, endDate },
      });
      set({
        calendarData: response.data,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  createSchedule: async (data) => {
    const response = await axios.post<Schedule>('/api/schedules', data);
    return response.data;
  },

  updateSchedule: async (id: number, data: UpdateScheduleRequest) => {
    const response = await axios.put<Schedule>(`/api/schedules/${id}`, data);
    return response.data;
  },

  withdrawSchedule: async (id: number, reason: string) => {
    const response = await axios.post<Schedule>(`/api/schedules/${id}/withdraw`, { reason });
    return response.data;
  },
}));
