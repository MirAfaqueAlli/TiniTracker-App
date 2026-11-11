'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore, hasUserPermission } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import RegisterPatientModal from '@/components/RegisterPatientModal';

const PAGE_TITLES = {
  '/dashboard':     'Dashboard',
  '/patients':      'Patients',
  '/notifications': 'Schedules & reminders',
  '/hospitals':     'Hospital Settings',
  '/staff':         'Staff Management',
  '/activity':      'Activity Logs',
  '/settings':      'Admin & System Settings',
};

const SETTINGS_ROUTES = ['/hospitals', '/staff', '/settings', '/activity'];

const BYPASS_ROUTES = ['/login', '/register', '/setup', '/change-password', '/provider'];

export default function AppLayout({ children }) {
  const { isAuthenticated, user, refreshUser, isHydrated, sessionChecked } = useAuthStore();
  const registerPatientOpen = useUiStore((s) => s.registerPatientOpen);
  const registerPatientType = useUiStore((s) => s.registerPatientType);
  const closeRegisterPatient = useUiStore((s) => s.closeRegisterPatient);
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [platformStatus, setPlatformStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/platform/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setPlatformStatus(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function handlePatientRegistered() {
    closeRegisterPatient();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('patient-registered'));
    }
  }

  const isBypass = pathname === '/' || BYPASS_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));

  // Validate the httpOnly-cookie session once per page load before trusting
  // any persisted display data.
  useEffect(() => {
    if (!isBypass && isHydrated && !sessionChecked) {
      refreshUser();
    }
  }, [isBypass, isHydrated, sessionChecked, refreshUser]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Redirect to login ONLY after hydration + server validation confirm there
  // is no valid session.
  useEffect(() => {
    if (!isBypass && isHydrated && sessionChecked && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isBypass, isHydrated, sessionChecked, isAuthenticated, router]);

  // Block users without settings.view from settings routes
  useEffect(() => {
    if (isBypass || !isHydrated || !sessionChecked || !isAuthenticated) return;
    const isSettingsRoute = SETTINGS_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (isSettingsRoute && user) {
      const canViewSettings = hasUserPermission(user, 'settings.view');
      if (!canViewSettings) {
        router.replace('/dashboard');
      }
    }
  }, [isBypass, pathname, user, isHydrated, sessionChecked, isAuthenticated, router]);

  // Platform-wide maintenance barrier (provider portal remains available).
  if (platformStatus?.maintenance_mode && !pathname.startsWith('/provider')) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-primary, #f8fafc)',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🛠️</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.75rem' }}>
            {platformStatus.platform_name || 'TiniTraker'} is under maintenance
          </h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-text-muted, #64748b)' }}>
            {platformStatus.maintenance_notice || 'We are performing scheduled maintenance. Please try again shortly.'}
          </p>
        </div>
      </div>
    );
  }

  // If on login, setup, provider portal, etc., render plain children without sidebar/topbar
  if (isBypass) {
    return <>{children}</>;
  }

  // While waiting for hydration + server session validation, render loader.
  if (!isHydrated || !sessionChecked || !isAuthenticated) {
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

      {registerPatientOpen && hasUserPermission(user, 'patients.create') && (
        <RegisterPatientModal
          initialType={registerPatientType || undefined}
          onClose={closeRegisterPatient}
          onSuccess={handlePatientRegistered}
        />
      )}
    </div>
  );
}
