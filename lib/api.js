import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // Send the httpOnly session cookie with every request.
  withCredentials: true,
});

const SESSION_INVALID_CODES = new Set([
  'user_blocked',
  'hospital_blocked',
  'subscription_expired',
]);

// Auto-logout on an invalid session — but NOT on the login endpoint itself.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthAttempt =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/forgot-password');
    const status = err.response?.status;
    const code = err.response?.data?.error;
    const sessionInvalid =
      status === 401 || (status === 403 && SESSION_INVALID_CODES.has(code));

    if (sessionInvalid && !isAuthAttempt) {
      useAuthStore.getState().logout().finally(() => {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      });
    }
    return Promise.reject(err);
  }
);

export default api;
