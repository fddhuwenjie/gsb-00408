import axios from 'axios';
import type {
  User,
  Content,
  Channel,
  SensitiveWord,
  Schedule,
  ScanRecord,
  ReviewRecord,
  PublishRecord,
  DashboardStats,
  LoginRequest,
  LoginResponse,
  CreateContentRequest,
  SubmitScheduleRequest,
  ReviewRequest,
  ApiResponse,
  PaginationResult,
  PaginationParams,
} from '../../shared/types';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),
  getProfile: () => api.get<ApiResponse<User>>('/auth/profile'),
};

export const contentAPI = {
  getList: (params?: PaginationParams & { status?: string; type?: string; search?: string }) =>
    api.get<ApiResponse<PaginationResult<Content>>>('/content', { params }),
  getById: (id: number) => api.get<ApiResponse<Content>>(`/content/${id}`),
  create: (data: CreateContentRequest) =>
    api.post<ApiResponse<Content>>('/content', data),
  update: (id: number, data: Partial<CreateContentRequest>) =>
    api.put<ApiResponse<Content>>(`/content/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<{ deleted: boolean }>>(`/content/${id}`),
  submitSchedule: (id: number, data: SubmitScheduleRequest) =>
    api.post<ApiResponse<Schedule>>(`/content/${id}/submit`, data),
};

export const scheduleAPI = {
  getList: (params?: PaginationParams & { date?: string; channel_id?: number }) =>
    api.get<ApiResponse<PaginationResult<Schedule>>>('/schedule', { params }),
  getByDate: (date: string) =>
    api.get<ApiResponse<Schedule[]>>('/schedule/date', { params: { date } }),
  getCalendar: (year: number, month: number) =>
    api.get<ApiResponse<Schedule[]>>('/schedule/calendar', { params: { year, month } }),
};

export const reviewAPI = {
  getPending: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginationResult<Content>>>('/review/pending', { params }),
  review: (id: number, decision: 'approve' | 'reject', data: ReviewRequest) =>
    api.post<ApiResponse<ReviewRecord>>(`/review/${id}/${decision}`, data),
};

export const sensitiveAPI = {
  getList: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginationResult<SensitiveWord>>>('/sensitive', { params }),
  getLatestVersion: () => api.get<ApiResponse<number>>('/sensitive/version'),
  create: (data: { word: string; category: string }) =>
    api.post<ApiResponse<SensitiveWord>>('/sensitive', data),
  update: (id: number, data: { word?: string; category?: string; is_active?: boolean }) =>
    api.put<ApiResponse<SensitiveWord>>(`/sensitive/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<{ deleted: boolean }>>(`/sensitive/${id}`),
  getScanRecords: (params?: PaginationParams & { content_id?: number; word_id?: number; version?: number }) =>
    api.get<ApiResponse<PaginationResult<ScanRecord & { word?: SensitiveWord; content?: Content }>>>('/sensitive/scans', { params }),
};

export const channelAPI = {
  getList: () => api.get<ApiResponse<Channel[]>>('/channels'),
  create: (data: { name: string; type: string; status: 'active' | 'inactive'; config?: string }) =>
    api.post<ApiResponse<Channel>>('/channels', data),
  update: (id: number, data: { name?: string; type?: string; status?: 'active' | 'inactive'; config?: string }) =>
    api.put<ApiResponse<Channel>>(`/channels/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<{ deleted: boolean }>>(`/channels/${id}`),
  getStats: () => api.get<ApiResponse<{ id: number; name: string; today_count: number }[]>>('/channels/stats'),
};

export const publishAPI = {
  getRecords: (params?: PaginationParams & { start_date?: string; end_date?: string; status?: string; channel_id?: number }) =>
    api.get<ApiResponse<PaginationResult<PublishRecord & { schedule?: Schedule & { content?: Content; channel?: Channel } }>>>('/publish', { params }),
};

export const exportAPI = {
  exportScanRecords: (params?: { content_id?: number; word_id?: number; version?: number }) =>
    api.get<Blob>('/export/scans', { params, responseType: 'blob' }),
  exportPublishRecords: (params?: { start_date?: string; end_date?: string; status?: string; channel_id?: number }) =>
    api.get<Blob>('/export/publish', { params, responseType: 'blob' }),
};

export const dashboardAPI = {
  getStats: () => api.get<ApiResponse<DashboardStats>>('/dashboard/stats'),
  getRecentPending: () => api.get<ApiResponse<Content[]>>('/dashboard/recent-pending'),
  getRecentSchedules: () => api.get<ApiResponse<Schedule[]>>('/dashboard/recent-schedules'),
};

export default api;
