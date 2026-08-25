import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiResponse } from '../types';

const instance: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

instance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data;
    if (res.success) {
      return res.data as unknown as AxiosResponse;
    } else {
      console.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message || '请求失败'));
    }
  },
  (error: Error & { response?: { data?: { message?: string } } }) => {
    const message = error.response?.data?.message || error.message || '网络错误';
    console.error(message);
    return Promise.reject(new Error(message));
  }
);

export const get = <T = unknown>(url: string, params?: Record<string, string | number | boolean | undefined>, config?: AxiosRequestConfig): Promise<T> => {
  return instance.get(url, { params, ...config }) as unknown as Promise<T>;
};

export const post = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
  return instance.post(url, data, config) as unknown as Promise<T>;
};

export const put = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
  return instance.put(url, data, config) as unknown as Promise<T>;
};

export const del = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return instance.delete(url, config) as unknown as Promise<T>;
};

export default instance;
