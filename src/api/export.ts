import { get, post } from '../utils/request';
import type {
  ExportRecord,
  PaginationResult,
  PaginationParams,
} from '../types';

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  channel_id?: number;
}

export const exportPublishRecords = (filters: ExportFilters): Promise<ExportRecord> => {
  return post<ExportRecord>('/export/publish', filters);
};

export const getExportRecords = (params?: PaginationParams & { [key: string]: string | number | boolean | undefined }): Promise<PaginationResult<ExportRecord>> => {
  return get<PaginationResult<ExportRecord>>('/export', params);
};

export const downloadExport = (filename: string): void => {
  window.open(`/api/export/download/${filename}`, '_blank');
};
