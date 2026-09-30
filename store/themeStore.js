'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', theme);
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        set({ theme });
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', next);
          if (next === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        set({ theme: next });
      },
    }),
    {
      name: 'tinitraker_theme_pref',
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          const activeTheme = state.theme || 'light';
          document.documentElement.setAttribute('data-theme', activeTheme);
          if (activeTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
    }
  )
);
