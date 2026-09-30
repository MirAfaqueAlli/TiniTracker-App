import { create } from 'zustand';
import api from '@/lib/api';

export const useNotifStore = create((set, get) => ({
  unreadCount: 0,
  notifications: [],
  loading: false,

  fetchUnreadCount: async () => {
    try {
      const res = await api.get('/app-notifications/unread-count');
      set({ unreadCount: res.data.count ?? 0 });
    } catch {
      // silently ignore — bell badge is non-critical
    }
  },

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/app-notifications');
      set({ notifications: res.data.notifications || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  markAllRead: async () => {
    try {
      await api.patch('/app-notifications/mark-all-read');
      set({ unreadCount: 0, notifications: get().notifications.map(n => ({ ...n, is_read: true })) });
    } catch {
      // ignore
    }
  },

  markOneRead: async (id) => {
    try {
      await api.patch(`/app-notifications/${id}/read`);
      set(state => ({
        notifications: state.notifications.map(n => n.id === id ? { ...n, is_read: true } : n),
        unreadCount:   Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // ignore
    }
  },
}));
