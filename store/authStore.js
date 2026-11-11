'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The auth token is stored in an httpOnly cookie set by the server and is
 * intentionally NEVER written to localStorage/sessionStorage or exposed to
 * JavaScript. Only non-sensitive display data (the user object) is persisted so
 * the UI can render immediately while /api/auth/me revalidates the session.
 */
const authStorageProvider = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(name) || sessionStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(value);
      if (parsed?.state?.isRemembered) {
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
      user: null,
      isRemembered: false,
      isAuthenticated: false,
      // True once /api/auth/me has validated the httpOnly cookie for this load.
      // Deliberately NOT persisted, so a stale localStorage entry can never
      // grant access or cause a redirect loop with the server-side proxy.
      sessionChecked: false,
      isHydrated: false,
      setHydrated: (val) => set({ isHydrated: val }),

      // The first parameter is accepted for backwards compatibility with callers
      // that still pass the raw token; it is deliberately ignored so the token is
      // never retained client-side.
      setAuth: (_token, user, rememberMe = true) => {
        set({
          user: user ?? null,
          isAuthenticated: !!user,
          isRemembered: !!rememberMe,
          sessionChecked: true,
        });
      },

      updateUser: (user) => set({ user, isAuthenticated: !!user }),

      can: (permissionKey) => hasUserPermission(get().user, permissionKey),

      logout: async () => {
        if (typeof window !== 'undefined') {
          // Expire the httpOnly cookie before navigating away so the proxy does
          // not bounce the user back to a protected page with a still-valid
          // cookie. Failures are ignored (offline / stale cookie).
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include',
            });
          } catch { /* clear client state regardless */ }
        }
        set({
          user: null,
          isAuthenticated: false,
          isRemembered: false,
          sessionChecked: true,
        });
      },

      // Revalidate the httpOnly-cookie session and refresh display data.
      refreshUser: async () => {
        try {
          const res = await fetch('/api/auth/me', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (res.ok) {
            const data = await res.json();
            set({ user: data.user, isAuthenticated: !!data.user, sessionChecked: true });
          } else if (res.status === 401 || res.status === 403) {
            // Token invalid/expired or account blocked/expired — force logout.
            await get().logout();
          } else {
            // Server/network problem (not an auth rejection): keep the
            // optimistic persisted state to avoid a proxy redirect loop while
            // still marking the check as complete.
            set({ sessionChecked: true, isAuthenticated: !!get().user });
          }
        } catch {
          set({ sessionChecked: true, isAuthenticated: !!get().user });
        }
      },
    }),
    {
      name: 'tinitracker-auth',
      storage: createJSONStorage(() => authStorageProvider),
      partialize: (state) => ({
        user: state.user,
        isRemembered: state.isRemembered,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

/**
 * Checks if a user has a specific permission.
 * Admins/superadmins always have all permissions.
 * Checks user.permissions map returned by backend.
 */
export function hasUserPermission(user, permissionKey) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  if (user.permissions && user.permissions[permissionKey] === true) {
    return true;
  }
  // Implied view permissions: write/manage implies view
  if (permissionKey === 'staff.view') {
    return Boolean(user.permissions?.['staff.create'] || user.permissions?.['staff.edit']);
  }
  if (permissionKey === 'patients.view') {
    return Boolean(user.permissions?.['patients.create'] || user.permissions?.['patients.edit'] || user.permissions?.['patients.delete']);
  }
  if (permissionKey === 'settings.view') {
    return Boolean(user.permissions?.['settings.manage_roles'] || user.permissions?.['settings.edit_system'] || user.permissions?.['settings.edit_hospital']);
  }
  return false;
}

/**
 * React hook to check a permission for the currently authenticated user.
 */
export function useCan(permissionKey) {
  const user = useAuthStore((s) => s.user);
  return hasUserPermission(user, permissionKey);
}
