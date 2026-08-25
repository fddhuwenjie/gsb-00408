import { get, post, put, del } from '../utils/request';
import type {
  SensitiveWord,
  ScanRecord,
  PaginationResult,
  PaginationParams,
} from '../types';

export const getWordList = (params?: PaginationParams & { [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<SensitiveWord>> => {
  return get<PaginationResult<SensitiveWord>>('/sensitive/words', params);
};

export const addWord = (word: string, category: string): Promise<SensitiveWord> => {
  return post<SensitiveWord>('/sensitive/words', { word, category });
};

export const updateWord = (id: number, word: string, category: string): Promise<SensitiveWord> => {
  return put<SensitiveWord>(`/sensitive/words/${id}`, { word, category });
};

export const deleteWord = (id: number): Promise<void> => {
  return del<void>(`/sensitive/words/${id}`);
};

export const getScanRecords = (params?: PaginationParams & { [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<ScanRecord>> => {
  return get<PaginationResult<ScanRecord>>('/sensitive/scans', params);
};
