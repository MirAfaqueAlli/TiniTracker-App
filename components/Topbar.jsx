'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore, hasUserPermission } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useNotifStore } from '@/store/notifStore';
import { useUiStore } from '@/store/uiStore';
import {
  Bell, Menu, Sun, Moon, Search, X, Baby,
  Calendar, AlertTriangle, CheckCircle, Users, Send,
  ClipboardList, UserPlus, Home, Building2,
  Users2, ArrowRight, Syringe, HeartPulse, Zap,
  Settings, ShieldCheck, MapPin
} from 'lucide-react';
import api from '@/lib/api';

/* ── Greeting helper ─────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ── Event icon map ──────────────────────────────────────────── */
function EventIcon({ type, size = 15 }) {
  const map = {
    patient_registered: UserPlus,
    visit_marked:       CheckCircle,
    stage_skipped:      AlertTriangle,
    stage_rescheduled:  Calendar,
    delivery_recorded:  Baby,
    edd_updated:        Calendar,
    batch_run:          Send,
    patient_edited:     ClipboardList,
  };
  const Icon = map[type] || Bell;
  return <Icon size={size} />;
}

/* ── Time-ago helper ─────────────────────────────────────────── */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)  return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ── Quick links definition ──────────────────────────────────── */
const QUICK_LINKS_BASE = [
  { label: 'Dashboard',        path: '/dashboard',     icon: Home,          hint: 'Overview & key stats' },
  { label: 'Patients',         path: '/patients',      icon: Users,         hint: 'Full patients list' },
  { label: 'Register Patient', path: '/register',      icon: UserPlus,      hint: 'New patient intake form' },
  { label: 'Schedules & Reminders', path: '/notifications', icon: Bell,     hint: 'WhatsApp reminder register' },
  { label: 'Activity Logs',    path: '/activity',      icon: ClipboardList, hint: 'Complete audit trail' },
];

const ADMIN_LINKS = [
  { label: 'Role Permissions Matrix', path: '/settings?tab=roles', icon: ShieldCheck, hint: 'Access rules & role privileges' },
  { label: 'Staff Management', path: '/settings?tab=staff', icon: Users2, hint: 'Manage clinical staff & doctors' },
  { label: 'Subscription & Plans', path: '/settings?tab=subscription', icon: Zap, hint: 'Plan status, upgrades & requests' },
  { label: 'Hospital Profile & WhatsApp', path: '/settings?tab=hospital', icon: Building2, hint: 'Hospital info & messaging config' },
  { label: 'Batch & Automations', path: '/settings?tab=system', icon: Calendar, hint: 'Daily WhatsApp reminder schedule' },
  { label: 'Audit & Activity Logs', path: '/settings?tab=activity', icon: ClipboardList, hint: 'Complete hospital change logs' },
  { label: 'Hospital Settings', path: '/settings', icon: Settings, hint: 'All system settings' },
];

/* ── Spotlight Command Palette ───────────────────────────────── */
function SpotlightModal({ onClose, isAdmin, user }) {
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [staffResults, setStaffResults] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [activeIdx, setActiveIdx]       = useState(0);
  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const router      = useRouter();
  const debounceRef = useRef(null);

  const canViewPatients = hasUserPermission(user, 'patients.view');
  const canCreatePatient = hasUserPermission(user, 'patients.create');
  const canViewNotifs = hasUserPermission(user, 'notifications.view');
  const canViewSettings = hasUserPermission(user, 'settings.view');
  const canManageRoles  = hasUserPermission(user, 'settings.manage_roles');
  const canViewStaff    = hasUserPermission(user, 'staff.view');
  const canViewLogs     = hasUserPermission(user, 'activity.view');
  const canEditSystem   = hasUserPermission(user, 'settings.edit_system');
  const canEditHospital = hasUserPermission(user, 'settings.edit_hospital');

  const baseLinks = QUICK_LINKS_BASE.filter(l => {
    if (l.path === '/patients' && !canViewPatients) return false;
    if (l.path === '/register' && !canCreatePatient) return false;
    if (l.path === '/notifications' && !canViewNotifs) return false;
    if (l.path === '/activity' && (!canViewSettings || !canViewLogs)) return false;
    return true;
  });

  const adminLinks = !canViewSettings ? [] : ADMIN_LINKS.filter(l => {
    if (l.path.includes('tab=roles') && !canManageRoles) return false;
    if (l.path.includes('tab=staff') && !canViewStaff) return false;
    if ((l.path.includes('tab=logs') || l.path.includes('tab=activity')) && !canViewLogs) return false;
    if ((l.path.includes('tab=batch') || l.path.includes('tab=system')) && !canEditSystem) return false;
    if (l.path.includes('tab=hospital') && !canEditHospital) return false;
    if (l.path.includes('tab=subscription') && !isAdmin) return false;
    return true;
  });

  const quickLinks = [...baseLinks, ...adminLinks];

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Matching quick links/pages
  const qLower = query.trim().toLowerCase();
  const matchingLinks = qLower
    ? quickLinks.filter(l =>
        l.label.toLowerCase().includes(qLower) ||
        l.hint.toLowerCase().includes(qLower) ||
        l.path.toLowerCase().includes(qLower)
      )
    : [];

  // Patient & Staff search
  const doSearch = useCallback(async (q) => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      setStaffResults([]);
      return;
    }
    setLoading(true);
    try {
      const promises = [];
      if (canViewPatients) {
        promises.push(api.get(`/patients?search=${encodeURIComponent(q)}&limit=7`).catch(() => ({ data: [] })));
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }
      if (canViewStaff) {
        promises.push(
          api.get(`/auth/staff?search=${encodeURIComponent(q)}&limit=5`).catch(() => ({ data: [] }))
        );
      }
      const [patientRes, staffRes] = await Promise.all(promises);
      const patients = patientRes.data?.patients || patientRes.data || [];
      setResults(Array.isArray(patients) ? patients : []);
      if (canViewStaff && staffRes) {
        const staffList = staffRes.data?.staff || staffRes.data || [];
        setStaffResults(Array.isArray(staffList) ? staffList : []);
      }
    } catch {
      setResults([]);
      setStaffResults([]);
    } finally {
      setLoading(false);
    }
  }, [canViewPatients, canViewStaff]);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    setActiveIdx(0);
    clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setStaffResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  }

  function handleSelectPatient(p) { router.push(`/patients/${p.id}`); onClose(); }
  function handleSelectLink(path)  { router.push(path); onClose(); }
  function handleSelectStaff(s)    { router.push(`/settings?tab=staff`); onClose(); }

  // Keyboard nav items list
  const isSearchMode = query.trim().length > 0;
  const flatItems = [];
  if (!isSearchMode) {
    quickLinks.forEach(l => flatItems.push({ type: 'link', data: l }));
  } else {
    matchingLinks.forEach(l => flatItems.push({ type: 'link', data: l }));
    staffResults.forEach(s => flatItems.push({ type: 'staff', data: s }));
    results.forEach(p => flatItems.push({ type: 'patient', data: p }));
    if (results.length > 0) {
      flatItems.push({ type: 'view_all_patients' });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, Math.max(0, flatItems.length - 1)));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const current = flatItems[activeIdx];
      if (current) {
        if (current.type === 'link') {
          handleSelectLink(current.data.path);
        } else if (current.type === 'staff') {
          handleSelectStaff(current.data);
        } else if (current.type === 'patient') {
          handleSelectPatient(current.data);
        } else if (current.type === 'view_all_patients') {
          router.push(`/patients?search=${encodeURIComponent(query)}`);
          onClose();
        }
      }
    }
  }

  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('.sp-item.active');
      active?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  return (
    <div className="spotlight-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="spotlight-modal" role="dialog" aria-modal="true" aria-label="Search">

        {/* Search Input Row */}
        <div className="spotlight-input-row">
          <Search size={18} className="spotlight-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            placeholder={isAdmin ? "Search patients, staff, settings, subscription…" : "Search patients, navigate pages…"}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span className="spotlight-spinner" />}
          {query && !loading && (
            <button
              className="spotlight-clear"
              onClick={() => { setQuery(''); setResults([]); setStaffResults([]); inputRef.current?.focus(); }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="spotlight-divider" />

        {/* Results */}
        <div className="spotlight-list" ref={listRef}>

          {/* Quick Links */}
          {!isSearchMode && (
            <>
              <div className="spotlight-section-label">Quick Links & Navigation</div>
              {quickLinks.map((link, i) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.path}
                    className={`sp-item${activeIdx === i ? ' active' : ''}`}
                    onClick={() => handleSelectLink(link.path)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <div className="sp-item-icon-wrap">
                      <Icon size={16} strokeWidth={1.8} />
                    </div>
                    <div className="sp-item-info">
                      <span className="sp-item-label">{link.label}</span>
                      <span className="sp-item-hint">{link.hint}</span>
                    </div>
                    <span className="sp-item-path">{link.path}</span>
                  </button>
                );
              })}
            </>
          )}

          {/* Search mode */}
          {isSearchMode && (
            <>
              {/* Matching Navigation & Settings Links */}
              {matchingLinks.length > 0 && (
                <>
                  <div className="spotlight-section-label">Navigation & Settings</div>
                  {matchingLinks.map((link) => {
                    const itemIdx = flatItems.findIndex(it => it.type === 'link' && it.data.path === link.path);
                    const Icon = link.icon;
                    return (
                      <button
                        key={link.path}
                        className={`sp-item${activeIdx === itemIdx ? ' active' : ''}`}
                        onClick={() => handleSelectLink(link.path)}
                        onMouseEnter={() => setActiveIdx(itemIdx)}
                      >
                        <div className="sp-item-icon-wrap">
                          <Icon size={16} strokeWidth={1.8} />
                        </div>
                        <div className="sp-item-info">
                          <span className="sp-item-label">{link.label}</span>
                          <span className="sp-item-hint">{link.hint}</span>
                        </div>
                        <span className="sp-item-path">{link.path}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Staff results */}
              {staffResults.length > 0 && (
                <>
                  <div className="spotlight-section-label">Hospital Staff & Doctors</div>
                  {staffResults.map((s) => {
                    const itemIdx = flatItems.findIndex(it => it.type === 'staff' && it.data.id === s.id);
                    return (
                      <button
                        key={`staff-${s.id}`}
                        className={`sp-item${activeIdx === itemIdx ? ' active' : ''}`}
                        onClick={() => handleSelectStaff(s)}
                        onMouseEnter={() => setActiveIdx(itemIdx)}
                      >
                        <div className="sp-item-avatar" style={{ background: '#7e22ce' }}>
                          {(s.name || 'S').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="sp-item-info">
                          <span className="sp-item-label">{s.name}</span>
                          <span className="sp-item-hint">{s.email} • {s.role?.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="sp-patient-type" style={{ color: '#a855f7' }}>
                          <Users2 size={11} strokeWidth={2} />
                          Staff
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Patients results */}
              {results.length > 0 && (
                <>
                  <div className="spotlight-section-label">Patients</div>
                  {results.map((p) => {
                    const itemIdx = flatItems.findIndex(it => it.type === 'patient' && it.data.id === p.id);
                    const isPreg = p.patient_type === 'pregnant';
                    const isBoth = p.patient_type === 'both';
                    const TypeIcon = isPreg ? HeartPulse : isBoth ? Baby : Syringe;
                    const typeLabel = isPreg ? 'Pregnant' : isBoth ? 'Both' : 'Immunization';
                    const typeColor = isPreg ? '#e05b8a' : isBoth ? '#8b5cf6' : '#0284c7';
                    return (
                      <button
                        key={`patient-${p.id}`}
                        className={`sp-item${activeIdx === itemIdx ? ' active' : ''}`}
                        onClick={() => handleSelectPatient(p)}
                        onMouseEnter={() => setActiveIdx(itemIdx)}
                      >
                        <div className="sp-item-avatar">
                          {(p.name || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="sp-item-info">
                          <span className="sp-item-label">{p.name}</span>
                          <span className="sp-item-hint">{p.whatsapp_number || 'No number'}</span>
                        </div>
                        <span className="sp-patient-type" style={{ color: typeColor }}>
                          <TypeIcon size={11} strokeWidth={2} />
                          {typeLabel}
                        </span>
                      </button>
                    );
                  })}

                  {/* View all row */}
                  {(() => {
                    const viewAllIdx = flatItems.findIndex(it => it.type === 'view_all_patients');
                    return (
                      <button
                        className={`sp-item sp-view-all${activeIdx === viewAllIdx ? ' active' : ''}`}
                        onClick={() => { router.push(`/patients?search=${encodeURIComponent(query)}`); onClose(); }}
                        onMouseEnter={() => setActiveIdx(viewAllIdx)}
                      >
                        <div className="sp-item-icon-wrap">
                          <ArrowRight size={16} strokeWidth={1.8} />
                        </div>
                        <div className="sp-item-info">
                          <span className="sp-item-label">View all patient results for &ldquo;{query}&rdquo;</span>
                        </div>
                      </button>
                    );
                  })()}
                </>
              )}

              {/* Loading indicator */}
              {loading && (
                <div className="spotlight-loading">
                  <span className="spotlight-spinner-lg" />
                  <span>Searching system…</span>
                </div>
              )}

              {/* Empty state when nothing matched */}
              {!loading && matchingLinks.length === 0 && staffResults.length === 0 && results.length === 0 && (
                <div className="spotlight-empty">
                  <Search size={26} strokeWidth={1.3} />
                  <span>No results found for &ldquo;{query}&rdquo;</span>
                  <span className="spotlight-empty-hint">Try searching patient name, phone, staff member, or settings</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="spotlight-footer">
          <span className="sp-hint"><kbd>↑↓</kbd> Navigate</span>
          <span className="sp-hint"><kbd>↵</kbd> Select</span>
          <span className="sp-hint"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

/* ── Search Trigger Pill ─────────────────────────────────────── */
function SearchTrigger({ onClick }) {
  return (
    <button className="spotlight-trigger" onClick={onClick} aria-label="Open search (Ctrl+K)">
      <Search size={14} className="spotlight-trigger-icon" />
      <span className="spotlight-trigger-text">Search patients…</span>
      <kbd className="spotlight-trigger-kbd">⌘ K</kbd>
    </button>
  );
}

/* ── Bell Dropdown ───────────────────────────────────────────── */
function BellDropdown({ onClose }) {
  const { notifications, loading, fetchNotifications, markAllRead, markOneRead } = useNotifStore();
  const router = useRouter();

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const recent = notifications.slice(0, 3);

  return (
    <div className="bell-dropdown">
      <div className="bell-dropdown-header">
        <span className="bell-dropdown-title">Recent activity</span>
        {notifications.some(n => !n.is_read) && (
          <button className="bell-dropdown-clear" onClick={markAllRead}>Mark all read</button>
        )}
      </div>

      <div className="bell-dropdown-list">
        {loading ? (
          <div className="bell-dropdown-loading">
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        ) : recent.length === 0 ? (
          <div className="bell-dropdown-empty">
            <Bell size={28} strokeWidth={1.5} />
            <span>No activity yet</span>
          </div>
        ) : (
          recent.map(n => (
            <div
              key={n.id}
              className={`bell-dropdown-item${n.is_read ? '' : ' unread'}`}
              onClick={() => !n.is_read && markOneRead(n.id)}
            >
              <div className={`bell-item-icon-wrap event-${n.event_type}`}>
                <EventIcon type={n.event_type} size={14} />
              </div>
              <div className="bell-item-content">
                <div className="bell-item-title">{n.title}</div>
                {n.body && <div className="bell-item-body">{n.body}</div>}
                <div className="bell-item-time">{timeAgo(n.createdAt)}</div>
              </div>
              {!n.is_read && <div className="bell-item-dot" />}
            </div>
          ))
        )}
      </div>

      <div className="bell-dropdown-footer">
        <button className="bell-dropdown-view-all" onClick={() => { router.push('/activity'); onClose(); }}>
          View all activity logs →
        </button>
      </div>
    </div>
  );
}

/* ── Topbar ──────────────────────────────────────────────────── */
export default function Topbar({ onMenuClick }) {
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { unreadCount, fetchUnreadCount } = useNotifStore();
  const openRegisterPatient = useUiStore((s) => s.openRegisterPatient);
  const pathname = usePathname();
  const [mounted, setMounted]             = useState(false);
  const [bellOpen, setBellOpen]           = useState(false);
  const [hospitalOpen, setHospitalOpen]   = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const bellRef = useRef(null);
  const hospitalRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, 30_000);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSpotlightOpen(o => !o);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close bell / hospital menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (hospitalRef.current && !hospitalRef.current.contains(e.target)) setHospitalOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const hospitalName = user?.hospital_name || user?.hospital || user?.Hospital?.name || 'Hospital';
  const hospitalMeta = (user?.hospital_address || user?.Hospital?.address || '').trim();
  const hospitalInitials = hospitalName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const [subStatus, setSubStatus] = useState(user?.subscription || null);

  useEffect(() => {
    if (isAdmin) {
      api.get('/hospitals/subscription')
        .then(res => {
          if (res.data?.subscription) {
            setSubStatus(res.data.subscription);
          }
        })
        .catch(() => {});
    }
  }, [isAdmin, user?.hospital_id]);

  const isTrial = subStatus ? subStatus.is_trial : (user?.subscription?.is_trial ?? true);
  const trialDaysLeft = subStatus ? subStatus.days_remaining : (user?.subscription?.days_remaining ?? null);
  const isDark = mounted && theme === 'dark';

  // Page title & subtitle from pathname
  const PAGE_META = {
    '/dashboard':     { title: 'Overview',       sub: 'All care categories' },
    '/patients':      { title: 'Patients',        sub: 'All registered patients' },
    '/notifications': { title: 'Schedules & reminders', sub: 'WhatsApp reminder register' },
    '/activity':      { title: 'Activity log',    sub: 'Audit stream' },
    '/settings':      { title: 'Settings',        sub: 'Admin & system settings' },
  };
  const meta = PAGE_META[pathname] ||
    Object.entries(PAGE_META).find(([k]) => pathname.startsWith(k))?.[1] ||
    { title: 'TiniTraker', sub: '' };

  const dateStr = mounted
    ? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <>
      <header className="topbar new-topbar">
        {/* Hamburger — mobile only */}
        <button className="hamburger-btn" onClick={onMenuClick} title="Menu" aria-label="Open menu">
          <Menu size={18} />
        </button>

        {/* Page Title — left */}
        <div className="new-topbar-title">
          <h1 className="new-topbar-heading">{meta.title}</h1>
          {mounted && (
            <p className="new-topbar-sub">{dateStr} · {meta.sub}</p>
          )}
        </div>

        {/* Right cluster */}
        <div className="new-topbar-actions">
          {/* Upgrade Plan CTA */}
          {isAdmin && isTrial && (
            <Link
              href="/settings?tab=subscription"
              className="topbar-upgrade-btn"
              title="You are currently on Free Trial. Click to explore plans and upgrade."
            >
              <Zap size={14} className="upgrade-btn-bolt" />
              <span className="upgrade-btn-text">Upgrade Plan</span>
              {trialDaysLeft !== null && (
                <span className="upgrade-btn-badge">{trialDaysLeft}d</span>
              )}
            </Link>
          )}

          {/* Search pill */}
          <button
            className="new-topbar-search"
            onClick={() => setSpotlightOpen(true)}
            aria-label="Search patients or MRN"
          >
            <Search size={15} className="new-topbar-search-icon" />
            <span className="new-topbar-search-text">Search patients or MRN</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            className="new-topbar-icon-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun size={18} className="theme-toggle-icon sun-icon" /> : <Moon size={18} className="theme-toggle-icon moon-icon" />}
          </button>

          {/* Bell */}
          <div className="new-topbar-bell-wrapper" ref={bellRef}>
            <button
              className="new-topbar-icon-btn"
              title="Activity notifications"
              onClick={() => { setBellOpen(o => !o); if (!bellOpen) fetchUnreadCount(); }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
            {bellOpen && <BellDropdown onClose={() => setBellOpen(false)} />}
          </div>

          {/* Register Patient CTA */}
          {hasUserPermission(user, 'patients.create') && (
            <button
              type="button"
              className="new-topbar-register-btn"
              onClick={() => openRegisterPatient()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>Register patient</span>
            </button>
          )}

          {/* Hospital profile — view/edit facility */}
          {isAdmin && (
            <div className="new-topbar-hospital-wrapper" ref={hospitalRef}>
              <button
                type="button"
                className={`new-topbar-hospital-avatar${hospitalOpen ? ' is-open' : ''}`}
                onClick={() => setHospitalOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={hospitalOpen}
                title={`${hospitalName} — hospital profile`}
              >
                {hospitalInitials}
              </button>
              {hospitalOpen && (
                <div className="hospital-menu" role="menu">
                  <div className="hospital-menu-head">
                    <span className="hospital-menu-avatar">{hospitalInitials}</span>
                    <div className="hospital-menu-id">
                      <strong>{hospitalName}</strong>
                      <span>{hospitalMeta || 'Hospital profile'}</span>
                    </div>
                  </div>
                  <div className="hospital-menu-divider" />
                  <Link
                    href="/settings?tab=hospital"
                    className="hospital-menu-link"
                    onClick={() => setHospitalOpen(false)}
                    role="menuitem"
                  >
                    <Building2 size={15} />
                    <span>Hospital &amp; WhatsApp settings</span>
                    <ArrowRight size={14} className="hospital-menu-arrow" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Spotlight portal */}
      {spotlightOpen && (
        <SpotlightModal onClose={() => setSpotlightOpen(false)} isAdmin={isAdmin} user={user} />
      )}
    </>
  );
}
