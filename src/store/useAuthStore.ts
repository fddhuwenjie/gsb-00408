import { create } from 'zustand';
import axios from 'axios';
import type { User, LoginRequest, LoginResponse } from '../../shared/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (data: LoginRequest) => {
    const response = await axios.post<LoginResponse>('/api/auth/login', data);
    const { user, token } = response.data;

    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);

    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    set({
      user,
      token,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];

    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  loadFromStorage: () => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      const user = JSON.parse(storedUser) as User;
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;

      set({
        user,
        token: storedToken,
        isAuthenticated: true,
      });
    }
  },
}));

export default useAuthStore;
