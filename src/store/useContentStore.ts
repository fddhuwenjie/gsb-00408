import { create } from 'zustand';
import axios from 'axios';
import type {
  Content,
  Schedule,
  CreateContentRequest,
  SubmitScheduleRequest,
  PaginationParams,
  PaginationResult,
} from '../../shared/types';

interface ContentState {
  contents: Content[];
  total: number;
  loading: boolean;
  fetchContents: (params?: PaginationParams & { status?: string; type?: string }) => Promise<void>;
  fetchContentDetail: (id: number) => Promise<Content>;
  createContent: (data: CreateContentRequest) => Promise<Content>;
  updateContent: (id: number, data: Partial<CreateContentRequest>) => Promise<Content>;
  deleteContent: (id: number) => Promise<void>;
  submitSchedule: (id: number, data: SubmitScheduleRequest) => Promise<Schedule>;
}

export const useContentStore = create<ContentState>((set) => ({
  contents: [],
  total: 0,
  loading: false,

  fetchContents: async (params) => {
    set({ loading: true });
    try {
      const response = await axios.get<PaginationResult<Content>>('/api/contents', { params });
      set({
        contents: response.data.items,
        total: response.data.total,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  fetchContentDetail: async (id: number) => {
    const response = await axios.get<Content>(`/api/contents/${id}`);
    return response.data;
  },

  createContent: async (data: CreateContentRequest) => {
    const response = await axios.post<Content>('/api/contents', data);
    return response.data;
  },

  updateContent: async (id: number, data: Partial<CreateContentRequest>) => {
    const response = await axios.put<Content>(`/api/contents/${id}`, data);
    return response.data;
  },

  deleteContent: async (id: number) => {
    await axios.delete(`/api/contents/${id}`);
  },

  submitSchedule: async (id: number, data: SubmitScheduleRequest) => {
    const response = await axios.post<Schedule>(`/api/contents/${id}/schedule`, data);
    return response.data;
  },
}));
