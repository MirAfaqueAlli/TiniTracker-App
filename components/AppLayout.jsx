'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

const PAGE_TITLES = {
  '/dashboard':     'Dashboard',
  '/patients':      'Patients',
  '/notifications': 'Notifications',
  '/hospitals':     'Hospital Settings',
  '/staff':         'Staff Management',
  '/activity':      'Activity Logs',
  '/settings':      'Admin & System Settings',
};

const ADMIN_ONLY_ROUTES = ['/hospitals', '/staff', '/settings'];

const BYPASS_ROUTES = ['/login', '/register', '/setup', '/change-password', '/provider'];

export default function AppLayout({ children }) {
  const { token, user, refreshUser, isHydrated } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isBypass = BYPASS_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));

  // Refresh user data if token is present and hydrated
  useEffect(() => {
    if (!isBypass && isHydrated && token) {
      refreshUser();
    }
  }, [isBypass, isHydrated, token]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Redirect to login ONLY after hydration is complete and no token exists
  useEffect(() => {
    if (!isBypass && isHydrated && !token) {
      router.replace('/login');
    }
  }, [isBypass, isHydrated, token, router]);

  // Block non-admin from admin-only pages
  useEffect(() => {
    if (isBypass || !isHydrated || !token) return;
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isAdminRoute = ADMIN_ONLY_ROUTES.some(r => pathname.startsWith(r));
    if (isAdminRoute && !isAdmin && user) {
      router.replace('/dashboard');
    }
  }, [isBypass, pathname, user, isHydrated, token, router]);

  // If on login, setup, provider portal, etc., render plain children without sidebar/topbar
  if (isBypass) {
    return <>{children}</>;
  }

  // While waiting for store hydration from localStorage, render clean loader
  if (!isHydrated || !token) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--color-bg-primary, #f8fafc)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 32,
          height: 32,
          border: '3px solid rgba(0, 133, 124, 0.2)',
          borderTopColor: 'var(--teal, #00857c)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  const title = PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1] ||
    'TiniTraker';

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop rail spacer to maintain page alignment while sidebar expands on hover */}
      <div className="sidebar-rail-spacer" aria-hidden="true" />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-area">
        <Topbar onMenuClick={() => setSidebarOpen(o => !o)} />
        <main className="page-content animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
