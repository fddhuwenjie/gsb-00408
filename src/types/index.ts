export * from '../../shared/types';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ModalType = 'confirm' | 'form' | 'info';

export type CalendarView = 'month' | 'week' | 'day';

export interface FilterOptions {
  [key: string]: string | number | boolean | undefined | string[] | number[];
}
