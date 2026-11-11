'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';
import { useNotifStore } from '@/store/notifStore';

const ACTIVITY_FILTERS = [
  { label: 'All',           value: 'All' },
  { label: 'Visits',        value: 'Visit' },
  { label: 'Reminders',     value: 'Reminder' },
  { label: 'Registrations', value: 'Registration' },
  { label: 'Milestones',    value: 'Milestone' },
  { label: 'Missed',        value: 'Missed' },
];

const CLINIC_PAGE_SIZE   = 5;
const UPCOMING_PAGE_SIZE = 4;
const ACTIVITY_LIMIT     = 10;

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function parseDateOnly(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function shortDate(value) {
  const d = parseDateOnly(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function groupLabel(group) {
  const d = parseDateOnly(group.key);
  const dateText = d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : group.key;
  if (group.isToday) return `Today · ${dateText}`;
  if (group.isTomorrow) return `Tomorrow · ${dateText}`;
  const weekday = d ? d.toLocaleDateString('en-IN', { weekday: 'long' }) : '';
  return `${weekday} · ${dateText}`;
}

function activityTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).replace(/\s+/, '\u00A0');
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function groupUpcoming(items) {
  const groups = [];
  const map = new Map();
  items.forEach((item) => {
    const key = String(item.scheduledDate || '').slice(0, 10) || 'unknown';
    if (!map.has(key)) {
      const group = { key, isToday: item.isToday, isTomorrow: item.isTomorrow, items: [] };
      map.set(key, group);
      groups.push(group);
    }
    map.get(key).items.push(item);
  });
  return groups;
}

function stageClass(stageType) {
  return stageType === 'immunization' ? 'is-imm' : 'is-anc';
}

function stageLabel(stageType) {
  return stageType === 'immunization' ? 'Immunization' : 'Antenatal';
}

function patientMeta(patientType) {
  if (patientType === 'pregnant') return { type: 'Mother', category: 'Antenatal', cls: 'is-anc' };
  if (patientType === 'immunization') return { type: 'Child', category: 'Immunization', cls: 'is-imm' };
  return { type: 'Mother & Child', category: 'Both', cls: 'is-both' };
}

function displayRole(role) {
  if (!role) return 'Staff';
  if (role === 'superadmin' || role === 'admin') return 'Admin';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function KpiCard({ label, value, badge, badgeClass = '', sub, warn, loading }) {
  return (
    <article className="ttd-kpi">
      <div className="ttd-kpi-head">
        <span className="ttd-kpi-label">{label}</span>
        {badge ? <span className={`ttd-kpi-badge ${badgeClass}`}>{badge}</span> : null}
      </div>
      <div className={`ttd-kpi-value${warn ? ' warn' : ''}`}>
        {loading ? <span className="ttd-kpi-spinner" /> : (value ?? 0)}
      </div>
      <div className="ttd-kpi-sub">{sub}</div>
    </article>
  );
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="ttd-pager">
      <button
        type="button"
        className="ttd-pager-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="ttd-pager-status">Page {page} of {totalPages}</span>
      <button
        type="button"
        className="ttd-pager-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { unreadCount: _unreadCount, fetchUnreadCount } = useNotifStore();
  const isDrPreg = user?.role === 'doctor_pregnancy';
  const isDrImm  = user?.role === 'doctor_immunization';
  const canMarkVisit = hasUserPermission(user, 'stages.mark_visit');

  const [stats, setStats]                     = useState(null);
  const [activity, setActivity]               = useState(null);
  const [recentPatients, setRecentPatients]   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [error, setError]                     = useState('');
  const [careFilter, setCareFilter]           = useState('All');
  const [upcomingFilter, setUpcomingFilter]   = useState('All');
  const [activityFilter, setActivityFilter]   = useState('All');
  const [clinicPage, setClinicPage]           = useState(1);
  const [upcomingPage, setUpcomingPage]       = useState(1);
  const [scheduleRange, setScheduleRange]     = useState('7');
  const scheduleRangeRef = useRef('7');
  const [search, setSearch]                   = useState('');
  const [checkingIn, setCheckingIn]           = useState(null);
  const [toast, setToast]                     = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [statsRes, activityRes, patientsRes] = await Promise.all([
        api.get('/patients/dashboard-stats'),
        api.get(`/patients/dashboard-activity?range=${scheduleRangeRef.current}`),
        api.get('/patients?limit=5&sort=registered'),
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data);
      setRecentPatients(patientsRes.data.patients || []);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const warmup = setTimeout(() => load(), 0);
    fetchUnreadCount();
    const timer = setInterval(() => load({ silent: true }), 60_000);
    return () => {
      clearTimeout(warmup);
      clearInterval(timer);
    };
  }, [load, fetchUnreadCount]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleCareFilter(value) {
    setCareFilter(value);
    setClinicPage(1);
  }

  function handleUpcomingFilter(value) {
    setUpcomingFilter(value);
    setUpcomingPage(1);
  }

  function handleScheduleRange(value) {
    scheduleRangeRef.current = value;
    setScheduleRange(value);
    setUpcomingPage(1);
    load({ silent: true });
  }

  function handleLogout() {
    router.push('/login');
  }

  const query = search.trim().toLowerCase();
  const matches = (...values) =>
    !query || values.some((v) => String(v || '').toLowerCase().includes(query));

  const clinicStats = stats?.clinicStats || { total: 0, attended: 0, remaining: 0 };
  const clinicItems = (stats?.clinicToday || []).filter((item) => {
    if (careFilter !== 'All') {
      const wanted = careFilter === 'Antenatal' ? 'pregnancy' : 'immunization';
      if (item.stageType !== wanted) return false;
    }
    return matches(item.name, item.stageName);
  });
  const clinicTotalPages = Math.max(1, Math.ceil(clinicItems.length / CLINIC_PAGE_SIZE));
  const clinicPageSafe = Math.min(clinicPage, clinicTotalPages);
  const clinicPageItems = clinicItems.slice(
    (clinicPageSafe - 1) * CLINIC_PAGE_SIZE,
    clinicPageSafe * CLINIC_PAGE_SIZE,
  );

  const upcomingItems = (activity?.upcomingAppointments || []).filter((item) => {
    if (upcomingFilter !== 'All') {
      const wanted = upcomingFilter === 'Antenatal' ? 'pregnancy' : 'immunization';
      if (item.stageType !== wanted) return false;
    }
    return matches(item.patientName, item.stageName);
  });
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingItems.length / UPCOMING_PAGE_SIZE));
  const upcomingPageSafe = Math.min(upcomingPage, upcomingTotalPages);
  const upcomingPageItems = upcomingItems.slice(
    (upcomingPageSafe - 1) * UPCOMING_PAGE_SIZE,
    upcomingPageSafe * UPCOMING_PAGE_SIZE,
  );
  const upcomingGroups = groupUpcoming(upcomingPageItems);

  const registrations = recentPatients.filter((p) => matches(p.name, p.patient_type, p.next_stage_name));
  const recentActivity = (activity?.recentActivity || []).filter((item) => {
    if (activityFilter !== 'All' && item.kind !== activityFilter) return false;
    return matches(item.patient, item.description, item.lead);
  }).slice(0, ACTIVITY_LIMIT);

  const forecast = stats?.forecast || [];
  const forecastTotal = stats?.forecastTotal ?? forecast.reduce((sum, d) => sum + (d.count || 0), 0);
  const forecastMax = Math.max(1, ...forecast.map((d) => d.count || 0));

  async function handleCheckIn(item) {
    if (!item || item.status === 'visited' || checkingIn) return;
    setCheckingIn(item.id);
    try {
      await api.put(`/patients/${item.patientId}/stages/${item.id}/visit`, {
        actual_visit_date: new Date().toISOString().split('T')[0],
      });
      setToast({ type: 'ok', message: `${item.name} checked in` });
      await load({ silent: true });
    } catch (err) {
      setToast({
        type: 'error',
        message: err?.response?.data?.error || 'Could not check in this patient',
      });
    } finally {
      setCheckingIn(null);
    }
  }

  const hospitalName = user?.hospital_name || user?.hospital || user?.Hospital?.name || 'Your facility';
  const hospitalMeta = (user?.hospital_address || user?.Hospital?.address || 'Main campus').trim();

  return (
    <div className="ttd-content">
          <div className="dashboard-welcome-banner">
            <div className="welcome-banner-content">
              <div className="welcome-banner-left">
                <h1 className="welcome-banner-title">
                  Welcome Back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
                </h1>
                <p className="welcome-banner-subtitle">
                  {isDrPreg
                    ? "Here's an overview of your pregnant patients and upcoming antenatal visits."
                    : isDrImm
                      ? "Here's an overview of your immunization cases and due vaccines."
                      : "Here's what's happening across maternal and pediatric care at your facility today."}
                </p>
              </div>
              <div className="welcome-banner-right">
                <div className="welcome-tagline">
                  <span className="welcome-tagline-small">Small Steps</span>
                  <span className="welcome-tagline-large">Healthier Generations</span>
                  <span className="welcome-tagline-bar" />
                </div>
                <div className="welcome-banner-media">
                  <img src="/mother-baby-banner.png" alt="Mother and Child" className="welcome-banner-photo welcome-photo-light" />
                  <img src="/mother-baby-banner-dark.png" alt="Mother and Child" className="welcome-banner-photo welcome-photo-dark" />
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="ttd-alert">
              <AlertCircle size={15} /> {error}
            </div>
          ) : null}

          <section className="ttd-kpi-grid" aria-label="Key metrics">
            <KpiCard
              label="Active patient load"
              value={stats?.active}
              badge="Live"
              loading={loading}
              
            />
            <KpiCard
              label="Today's clinic"
              value={clinicStats.total}
              badge={`${clinicStats.attended} attended`}
              badgeClass="neutral"
              loading={loading}
            
            />
            <KpiCard
              label="Next 7 days"
              value={stats?.upcoming}
              badge="Forecast"
              badgeClass="neutral"
              loading={loading}
             
            />
            <KpiCard
              label="At-risk & missed"
              value={stats?.missed}
              badge="Needs action"
              badgeClass="warn"
              warn
              loading={loading}
            
            />
            <KpiCard
              label="New this week"
              value={stats?.newThisWeek}
              badge="Enrolled"
              loading={loading}
              
            />
          </section>

          <section className="ttd-board" aria-label="Clinic operations">
            <section className="ttd-panel ttd-panel-col" id="clinicPanel">
              <div className="ttd-panel-head">
                <div>
                  <h2>Today&apos;s Clinic Demand</h2>
            
                </div>
                <div className="ttd-segmented" role="group" aria-label="Filter clinic by care type">
                  {['All', 'Antenatal', 'Immunization'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={careFilter === value ? 'is-active' : ''}
                      aria-pressed={careFilter === value}
                      onClick={() => handleCareFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ttd-clinic-list">
                {loading ? (
                  <div className="ttd-loading"><span className="ttd-spinner" /></div>
                ) : clinicItems.length === 0 ? (
                  <div className="ttd-empty">
                    <strong>No Patients Scheduled</strong>
                   
                  </div>
                ) : (
                  clinicPageItems.map((item) => {
                    const done = item.status === 'visited';
                    const cls = stageClass(item.stageType);
                    return (
                      <div key={item.id} className={`ttd-clinic-row${done ? ' is-done' : ''}`}>
                        <span className={`ttd-avatar ${cls}`}>{initials(item.name)}</span>
                        <span className="ttd-clinic-main">
                          <span className="ttd-row-title" title={item.name}>{item.name}</span>
                          <span className="ttd-row-meta">{item.stageName}</span>
                        </span>
                        <span className={`ttd-tag ${cls}`}>{stageLabel(item.stageType)}</span>
                        <span className="ttd-clinic-time">{done ? 'Done' : 'Today'}</span>
                        {done ? (
                          <span className="ttd-btn ttd-btn-small ttd-btn-checked" style={{ cursor: 'default' }}>
                            Attended
                          </span>
                        ) : canMarkVisit ? (
                          <button
                            type="button"
                            className="ttd-btn ttd-btn-small ttd-btn-ghost"
                            disabled={checkingIn === item.id}
                            onClick={() => handleCheckIn(item)}
                          >
                            {checkingIn === item.id ? 'Saving…' : 'Check in'}
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <Pager page={clinicPageSafe} totalPages={clinicTotalPages} onChange={setClinicPage} />
            </section>

            <section className="ttd-panel" aria-labelledby="forecastTitle">
              <div className="ttd-panel-head">
                <div>
                  <h2 id="forecastTitle">Weekly Forecast</h2>
                 
                </div>
                <span className="ttd-tag ttd-tag-neutral">{forecastTotal} due</span>
              </div>

              <div className="ttd-chart-wrap">
                <svg viewBox="0 0 360 152" role="img" aria-label="Forecast of due milestones and doses per day">
                  <line x1="12" y1="120" x2="348" y2="120" stroke="var(--ttd-line)" strokeWidth="1" />
                  {forecast.map((day, i) => {
                    const x = 18 + i * 48;
                    const height = day.count ? Math.max(6, Math.round((day.count / forecastMax) * 84)) : 0;
                    const y = 120 - height;
                    const labelY = height ? y - 8 : 112;
                    return (
                      <g key={day.date}>
                        <title>{`${day.full} · ${day.count} due`}</title>
                        <rect
                          className={`ttd-chart-bar${day.isToday ? ' is-today' : ''}`}
                          x={x}
                          y={y}
                          width="28"
                          height={height}
                          rx="6"
                        />
                        <text className={`ttd-chart-value${day.isToday ? ' is-today' : ''}`} x={x + 14} y={labelY}>
                          {day.count}
                        </text>
                        <text className={`ttd-chart-day${day.isToday ? ' is-today' : ''}`} x={x + 14} y="138">
                          {day.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </section>
          </section>

          <section className="ttd-board" aria-label="Schedule and registrations">
            <section className="ttd-panel ttd-panel-col" id="upcomingPanel">
              <div className="ttd-panel-head">
                <div>
                  <h2>Upcoming Schedule</h2>
                  
                </div>
                <div className="ttd-panel-head-actions">
                  <div className="ttd-select-wrap">
                    <select
                      className="ttd-select"
                      value={scheduleRange}
                      onChange={(e) => handleScheduleRange(e.target.value)}
                      aria-label="Schedule time period"
                    >
                      <option value="today">Today</option>
                      <option value="7">Next 7 days</option>
                      <option value="30">Next 30 days</option>
                      <option value="365">Next year</option>
                      <option value="all">All upcoming</option>
                    </select>
                    <ChevronDown size={14} className="ttd-select-chevron" />
                  </div>

                  <div className="ttd-segmented" role="group" aria-label="Filter upcoming by care type">
                    {['All', 'Antenatal', 'Immunization'].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={upcomingFilter === value ? 'is-active' : ''}
                        aria-pressed={upcomingFilter === value}
                        onClick={() => handleUpcomingFilter(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="ttd-upcoming-list">
                {loading ? (
                  <div className="ttd-loading"><span className="ttd-spinner" /></div>
                ) : upcomingGroups.length === 0 ? (
                  <div className="ttd-empty">
                    <strong>No upcoming appointments</strong>
                    <span>Nothing matches the current search or care filter.</span>
                  </div>
                ) : (
                  upcomingGroups.map((group) => (
                    <div key={group.key} className="ttd-up-group">
                      <span className="ttd-group-label">{groupLabel(group)}</span>
                      {group.items.map((item) => {
                        const stageType = item.stageType || (item.patientType === 'pregnancy' ? 'pregnancy' : 'immunization');
                        return (
                          <div key={item.id} className="ttd-up-row">
                            <span className={`ttd-up-dot ${stageClass(stageType)}`} aria-hidden="true" />
                            <span className="ttd-up-main">
                              <span className="ttd-row-title">{item.patientName}</span>
                              <span className="ttd-row-meta">{item.stageName}</span>
                            </span>
                            <span className={`ttd-tag ${stageClass(stageType)}`}>{stageLabel(stageType)}</span>
                            <Link
                              href={item.patientId ? `/patients/${item.patientId}` : '/patients'}
                              className="ttd-up-view"
                              aria-label={`View ${item.patientName}`}
                              title={`View ${item.patientName}`}
                            >
                              <Eye size={15} />
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <Pager page={upcomingPageSafe} totalPages={upcomingTotalPages} onChange={setUpcomingPage} />
            </section>

            <section className="ttd-panel" id="registrationsPanel">
              <div className="ttd-panel-head">
                <div>
                  <h2>New Registrations</h2>
                  
                </div>
                <span className="ttd-tag ttd-tag-ok">{stats?.newThisWeek ?? 0} this week</span>
              </div>

              <div className="ttd-reg-list">
                {loading ? (
                  <div className="ttd-loading"><span className="ttd-spinner" /></div>
                ) : registrations.length === 0 ? (
                  <div className="ttd-empty">
                    <strong>No matching registrations</strong>
                    <span>Clear the search to see newly enrolled patients.</span>
                  </div>
                ) : (
                  registrations.map((p) => {
                    const meta = patientMeta(p.patient_type);
                    return (
                      <Link key={p.id} href={`/patients/${p.id}`} className="ttd-reg-row">
                        <span className={`ttd-avatar ${meta.cls}`}>{initials(p.name)}</span>
                        <span className="ttd-reg-main">
                          <span className="ttd-row-title">{p.name}</span>
                          <span className="ttd-row-meta">{meta.type} · {meta.category}</span>
                        </span>
                        <span className="ttd-reg-next">
                          <span className="ttd-reg-next-label">Next</span>
                          <span className="ttd-reg-next-value">
                            {p.next_stage_name || p.current_stage_name || 'Active care'}
                          </span>
                          <span className="ttd-reg-next-date">
                            {p.next_stage_date ? shortDate(p.next_stage_date) : shortDate(p.createdAt)}
                          </span>
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>
          </section>

          <section className="ttd-panel ttd-activity-panel" aria-label="Activity log">
            <div className="ttd-panel-head ttd-activity-head">
              <div>
                <h2>Operational Activity Log</h2>
                
              </div>
              <div className="ttd-panel-head-actions">
                <span className="ttd-live"><span className="ttd-live-dot" aria-hidden="true" />Live</span>
                <div className="ttd-segmented" role="group" aria-label="Filter activity log">
                  {ACTIVITY_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={activityFilter === filter.value ? 'is-active' : ''}
                      aria-pressed={activityFilter === filter.value}
                      onClick={() => setActivityFilter(filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <Link
                  href="/activity"
                  className="ttd-icon-link"
                  aria-label="View full activity log"
                  title="View full activity log"
                >
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            <div className="ttd-act-list">
              {loading ? (
                <div className="ttd-loading"><span className="ttd-spinner" /></div>
              ) : recentActivity.length === 0 ? (
                <div className="ttd-empty">
                  <strong>No activity in this category</strong>
                  <span>Select another filter or clear the search to review the audit stream.</span>
                </div>
              ) : (
                recentActivity.map((item, index) => (
                  <div key={`${item.type}-${item.time}-${index}`} className="ttd-act-row">
                    <span className="ttd-act-time">{activityTime(item.time)}</span>
                    <span className={`ttd-act-dot ttd-dot-${String(item.kind || '').toLowerCase()}`} aria-hidden="true" />
                    <span className="ttd-act-main">
                      <span className="ttd-act-lead" title={item.lead || item.kind}>{item.lead || item.kind}</span>
                      <span className="ttd-act-patient" title={item.patient && item.patient !== '—' ? item.patient : ''}>
                        {item.patient && item.patient !== '—' ? item.patient : '—'}
                      </span>
                      <span className="ttd-act-text" title={item.description || ''}>
                        {item.description || '—'}
                      </span>
                    </span>
                    <span className={`ttd-tag ttd-tag-${String(item.kind || '').toLowerCase()}`}>{item.kind}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="dashboard-footer-banner">
            <img
              src="/dashboard-footer-bg.png"
              alt="Every Mother Every Child"
              className="dashboard-footer-bg-img footer-img-light"
            />
            <img
              src="/image.png"
              alt="Every Mother Every Child"
              className="dashboard-footer-bg-img footer-img-dark"
            />
            <div className="dashboard-footer-content">
              <div className="dashboard-footer-left">
                <h2 className="dashboard-footer-title">Every Mother. Every Child.</h2>
                <p className="dashboard-footer-subtitle">A Healthier Tomorrow.</p>
                <div className="dashboard-footer-teal-bar" />
              </div>
              <div className="dashboard-footer-right">
                <div className="dashboard-footer-tagline">
                  <span>Care</span>
                  <span>Track</span>
                  <span>Thrive</span>
                </div>
                <div className="dashboard-footer-pink-bar" />
              </div>
            </div>
          </div>

        {toast && (
          <div className={`ttd-toast${toast.type === 'error' ? ' is-error' : ''}`} role="status">
            {toast.message}
          </div>
        )}
      </div>
  );
}
