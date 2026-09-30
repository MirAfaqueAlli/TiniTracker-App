'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useNotifStore } from '@/store/notifStore';
import {
  Bell, Menu, MapPin, Sun, Moon, Search, X, Baby,
  Calendar, AlertTriangle, CheckCircle, Users, Send,
  ClipboardList, UserPlus, Home, Building2,
  Users2, ArrowRight, Syringe, HeartPulse, Zap,
  Settings, ShieldCheck, UserCheck
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
  { label: 'Notifications',    path: '/notifications', icon: Bell,          hint: 'WhatsApp delivery log' },
  { label: 'Activity Logs',    path: '/activity',      icon: ClipboardList, hint: 'Complete audit trail' },
];

const ADMIN_LINKS = [
  { label: 'Role Permissions Matrix', path: '/settings?tab=roles', icon: ShieldCheck, hint: 'Access rules & role privileges' },
  { label: 'Staff Management', path: '/settings?tab=staff', icon: Users2, hint: 'Manage clinical staff & doctors' },
  { label: 'Subscription & Plans', path: '/settings?tab=subscription', icon: Zap, hint: 'Plan status, upgrades & requests' },
  { label: 'Hospital Profile & WhatsApp', path: '/settings?tab=hospital', icon: Building2, hint: 'Hospital info & messaging config' },
  { label: 'Batch & Automations', path: '/settings?tab=batch', icon: Calendar, hint: 'Daily WhatsApp reminder schedule' },
  { label: 'Audit & Activity Logs', path: '/settings?tab=logs', icon: ClipboardList, hint: 'Complete hospital change logs' },
  { label: 'Hospital Settings', path: '/settings', icon: Settings, hint: 'All system settings' },
];

/* ── Spotlight Command Palette ───────────────────────────────── */
function SpotlightModal({ onClose, isAdmin }) {
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [staffResults, setStaffResults] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [activeIdx, setActiveIdx]       = useState(0);
  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const router      = useRouter();
  const debounceRef = useRef(null);

  const quickLinks = isAdmin ? [...QUICK_LINKS_BASE, ...ADMIN_LINKS] : QUICK_LINKS_BASE;

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
      const promises = [
        api.get(`/patients?search=${encodeURIComponent(q)}&limit=7`).catch(() => ({ data: [] })),
      ];
      if (isAdmin) {
        promises.push(
          api.get(`/auth/staff?search=${encodeURIComponent(q)}&limit=5`).catch(() => ({ data: [] }))
        );
      }
      const [patientRes, staffRes] = await Promise.all(promises);
      const patients = patientRes.data?.patients || patientRes.data || [];
      setResults(Array.isArray(patients) ? patients : []);
      if (isAdmin && staffRes) {
        const staffList = staffRes.data?.staff || staffRes.data || [];
        setStaffResults(Array.isArray(staffList) ? staffList : []);
      }
    } catch {
      setResults([]);
      setStaffResults([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

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

  return (
    <div className="bell-dropdown">
      <div className="bell-dropdown-header">
        <span className="bell-dropdown-title">Activity</span>
        {notifications.some(n => !n.is_read) && (
          <button className="bell-dropdown-clear" onClick={markAllRead}>Mark all read</button>
        )}
      </div>

      <div className="bell-dropdown-list">
        {loading ? (
          <div className="bell-dropdown-loading">
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        ) : notifications.length === 0 ? (
          <div className="bell-dropdown-empty">
            <Bell size={28} strokeWidth={1.5} />
            <span>No activity yet</span>
          </div>
        ) : (
          notifications.map(n => (
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
        <button className="bell-dropdown-view-all" onClick={() => { router.push('/notifications'); onClose(); }}>
          View all WhatsApp delivery logs →
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
  const [mounted, setMounted]             = useState(false);
  const [bellOpen, setBellOpen]           = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const bellRef = useRef(null);

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

  // Close bell on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdmin        = user?.role === 'admin' || user?.role === 'superadmin';
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
  const hospitalName   = user?.hospital_name || user?.hospital || user?.Hospital?.name || 'City Care Hospital';
  const hospitalAddress = (user?.hospital_address || user?.Hospital?.address || '').trim();
  const firstName      = user?.name?.split(' ')[0] || 'there';
  const ProfileWrapper = isAdmin ? Link : 'div';
  const profileProps   = isAdmin ? { href: '/settings?tab=hospital', title: 'Hospital Settings' } : { title: hospitalName };
  const isDark         = mounted && theme === 'dark';

  return (
    <>
      <header className="topbar">
        {/* Hamburger — mobile only */}
        <button className="hamburger-btn" onClick={onMenuClick} title="Menu" aria-label="Open menu">
          <Menu size={18} />
        </button>

        {/* Greeting — left */}
        <div className="topbar-greeting">
          <span className="topbar-greeting-text">
            {mounted ? getGreeting() : 'Welcome'}, <strong>{firstName}</strong>
          </span>
        </div>

        {/* Spotlight trigger pill — true center */}
        <div className="topbar-center-search">
          <SearchTrigger onClick={() => setSpotlightOpen(true)} />
        </div>

        {/* Right cluster */}
        <div className="topbar-right-cluster">
          {/* Upgrade Plan CTA — strictly for Hospital Admin on Free Trial */}
          {isAdmin && isTrial && (
            <Link
              href="/settings?tab=subscription"
              className="topbar-upgrade-btn"
              title="You are currently on Free Trial. Click to explore plans and upgrade."
              id="topbar-upgrade-plan-btn"
            >
              <Zap size={14} className="upgrade-btn-bolt" />
              <span className="upgrade-btn-text">Upgrade Plan</span>
              {trialDaysLeft !== null && (
                <span className="upgrade-btn-badge">{trialDaysLeft}d</span>
              )}
            </Link>
          )}

          {/* Theme Toggle */}
          <button
            type="button"
            className="btn-ghost topbar-theme-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun size={18} className="theme-toggle-icon sun-icon" /> : <Moon size={18} className="theme-toggle-icon moon-icon" />}
          </button>

          {/* Bell */}
          <div className="topbar-bell-wrapper" ref={bellRef}>
            <button
              className="btn-ghost topbar-bell-btn"
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

          <div className="topbar-divider" />

          {/* Hospital profile */}
          <ProfileWrapper {...profileProps} className="topbar-hospital-profile">
            <div className="topbar-hospital-info">
              <span className="topbar-hospital-name">{hospitalName}</span>
              {hospitalAddress && (
                <span className="topbar-hospital-meta">
                  <MapPin size={11} strokeWidth={2.2} className="topbar-hospital-icon" />
                  <span>{hospitalAddress}</span>
                </span>
              )}
            </div>
            <div className="topbar-hospital-avatar">
              <img
                src="/hospital-avatar.png"
                alt="Hospital"
                className="topbar-hospital-avatar-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'block';
                }}
              />
              <svg className="topbar-hospital-avatar-fallback" style={{ display: 'none' }}
                width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 21h18" stroke="#00857c" strokeWidth="2" strokeLinecap="round" />
                <path d="M5 21V7l8-4v18" stroke="#023846" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="#e6f7f5" />
                <path d="M13 9l6 3v9" stroke="#00857c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="#fef3c7" />
                <rect x="8.5" y="10" width="3" height="7" rx="0.5" fill="#dc2626" />
                <rect x="6.5" y="12" width="7" height="3" rx="0.5" fill="#dc2626" />
              </svg>
            </div>
          </ProfileWrapper>
        </div>
      </header>

      {/* Spotlight portal */}
      {spotlightOpen && (
        <SpotlightModal onClose={() => setSpotlightOpen(false)} isAdmin={isAdmin} />
      )}
    </>
  );
}
