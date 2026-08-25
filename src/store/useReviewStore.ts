import { create } from 'zustand';
import axios from 'axios';
import type {
  Content,
  PaginationParams,
  PaginationResult,
} from '../../shared/types';

interface ReviewState {
  queue: Content[];
  total: number;
  loading: boolean;
  fetchQueue: (params?: PaginationParams) => Promise<void>;
  approveContent: (id: number, opinion: string) => Promise<void>;
  rejectContent: (id: number, opinion: string) => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set) => ({
  queue: [],
  total: 0,
  loading: false,

  fetchQueue: async (params) => {
    set({ loading: true });
    try {
      const response = await axios.get<PaginationResult<Content>>('/api/review/queue', { params });
      set({
        queue: response.data.items,
        total: response.data.total,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  approveContent: async (id: number, opinion: string) => {
    await axios.post(`/api/review/${id}/approve`, { opinion });
  },

  rejectContent: async (id: number, opinion: string) => {
    await axios.post(`/api/review/${id}/reject`, { opinion });
  },
}));
