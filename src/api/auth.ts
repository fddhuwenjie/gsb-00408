import { get, post } from '../utils/request';
import type { LoginRequest, LoginResponse, User } from '../types';

export const login = (data: LoginRequest): Promise<LoginResponse> => {
  return post<LoginResponse>('/auth/login', data);
};

export const getProfile = (): Promise<User> => {
  return get<User>('/auth/profile');
};

export const logout = (): void => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
