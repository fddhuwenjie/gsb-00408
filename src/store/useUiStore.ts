import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ModalType = 'confirm' | 'form' | 'info';

interface ToastState {
  show: boolean;
  type: ToastType;
  message: string;
}

interface ModalState {
  show: boolean;
  type: ModalType;
  title: string;
  content: React.ReactNode;
}

interface UiState {
  toast: ToastState;
  modal: ModalState;
  showToast: (type: ToastType, message: string) => void;
  hideToast: () => void;
  showModal: (type: ModalType, title: string, content: React.ReactNode) => void;
  hideModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  toast: {
    show: false,
    type: 'info',
    message: '',
  },
  modal: {
    show: false,
    type: 'info',
    title: '',
    content: null,
  },

  showToast: (type: ToastType, message: string) => {
    set({
      toast: {
        show: true,
        type,
        message,
      },
    });

    setTimeout(() => {
      set((state) => ({
        toast: {
          ...state.toast,
          show: false,
        },
      }));
    }, 3000);
  },

  hideToast: () => {
    set((state) => ({
      toast: {
        ...state.toast,
        show: false,
      },
    }));
  },

  showModal: (type: ModalType, title: string, content: React.ReactNode) => {
    set({
      modal: {
        show: true,
        type,
        title,
        content,
      },
    });
  },

  hideModal: () => {
    set({
      modal: {
        show: false,
        type: 'info',
        title: '',
        content: null,
      },
    });
  },
}));
