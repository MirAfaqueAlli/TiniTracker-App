'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const authStorageProvider = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    // 1. Check persistent localStorage first (when Remember Me was checked)
    const localVal = localStorage.getItem(name);
    if (localVal) {
      try {
        const parsed = JSON.parse(localVal);
        if (parsed?.state?.token) return localVal;
      } catch {}
    }
    // 2. Fallback to sessionStorage (session-only login, when Remember Me was unchecked)
    return sessionStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(value);
      const isRemembered = parsed?.state?.isRemembered;
      if (isRemembered) {
        localStorage.setItem(name, value);
        sessionStorage.removeItem(name);
      } else {
        sessionStorage.setItem(name, value);
        localStorage.removeItem(name);
      }
    } catch {
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isRemembered: false,
      isHydrated: false,
      setHydrated: (val) => set({ isHydrated: val }),
      setAuth: (token, user, rememberMe = true) => {
        if (typeof document !== 'undefined') {
          if (rememberMe) {
            // Persistent cookie for 30 days
            document.cookie = `tinitracker_token=${token}; path=/; max-age=2592000; SameSite=Lax`;
          } else {
            // Session cookie (clears when browser session ends)
            document.cookie = `tinitracker_token=${token}; path=/; SameSite=Lax`;
          }
        }
        set({ token, user, isRemembered: !!rememberMe });
      },
      logout: () => {
        if (typeof document !== 'undefined') {
          document.cookie = 'tinitracker_token=; path=/; max-age=0; SameSite=Lax';
        }
        set({ token: null, user: null, isRemembered: false });
      },
      // Call this on app mount to ensure user data is always fresh
      refreshUser: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            set({ user: data.user });
          } else if (res.status === 401) {
            // Token invalid or expired — force logout
            get().logout();
          }
        } catch { /* network error, keep existing */ }
      },
    }),
    {
      name: 'tinitracker-auth',
      storage: createJSONStorage(() => authStorageProvider),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isRemembered: state.isRemembered,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
