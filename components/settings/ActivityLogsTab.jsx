'use client';
import { useEffect, useState } from 'react';
import {
  Activity, UserPlus, Baby, CheckCircle, SkipForward,
  Calendar, Bell, ChevronLeft, ChevronRight, Search,
  Filter, RefreshCw, X, User,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

// ── Event Type config ─────────────────────────────────────────────────────────
const TYPE_CFG = {
  mother_registered:  { icon: UserPlus,    bg: '#fff1f2', color: '#e11d48', label: 'Mother Registered' },
  child_registered:   { icon: Baby,        bg: '#eff6ff', color: '#0284c7', label: 'Child Registered'  },
  delivery_recorded:  { icon: Baby,        bg: '#f0fdf4', color: '#16a34a', label: 'Delivery Recorded' },
  stage_visited:      { icon: CheckCircle, bg: '#f0fdf4', color: '#16a34a', label: 'Visit Completed'   },
  stage_skipped:      { icon: SkipForward, bg: '#f1f5f9', color: '#64748b', label: 'Stage Skipped'     },
  stage_rescheduled:  { icon: Calendar,    bg: '#fefce8', color: '#ca8a04', label: 'Rescheduled'       },
  stage_complete:     { icon: CheckCircle, bg: '#f0fdf4', color: '#16a34a', label: 'Visit Completed'   },
  reminder_7d:        { icon: Bell,        bg: '#f5f3ff', color: '#7c3aed', label: 'Reminder (7d)'     },
  reminder_1d:        { icon: Bell,        bg: '#f5f3ff', color: '#7c3aed', label: 'Reminder (1d)'     },
  reminder_today:     { icon: Bell,        bg: '#f5f3ff', color: '#7c3aed', label: 'Reminder Today'    },
  missed:             { icon: Bell,        bg: '#fff1f2', color: '#e11d48', label: 'Missed Visit'       },
  edd_updated:        { icon: Calendar,    bg: '#fefce8', color: '#ca8a04', label: 'EDD Updated'       },
  manual:             { icon: Bell,        bg: '#f5f3ff', color: '#7c3aed', label: 'Manual Message'    },
};

function LogIcon({ subtype }) {
  const cfg = TYPE_CFG[subtype] || { icon: Activity, bg: '#f1f5f9', color: '#64748b' };
  const Icon = cfg.icon;
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 0 4px ${cfg.bg}cc`,
    }}>
      <Icon size={16} color={cfg.color} strokeWidth={2} />
    </div>
  );
}

function TypeBadge({ subtype }) {
  const cfg = TYPE_CFG[subtype];
  if (!cfg) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.18rem 0.55rem', borderRadius: 20,
      background: cfg.bg, color: cfg.color,
      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d   = new Date(isoString);
  const now = new Date();
  const diffH = (now - d) / (1000 * 60 * 60);
  if (diffH < 1)  return `${Math.floor((now - d) / 60000)}m ago`;
  if (diffH < 24) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' today';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const FILTER_TABS = [
  { key: 'all',          label: 'All',           icon: Activity   },
  { key: 'registration', label: 'Registrations', icon: UserPlus   },
  { key: 'delivery',     label: 'Deliveries',    icon: Baby       },
  { key: 'stage',        label: 'Stage Actions', icon: CheckCircle },
  { key: 'notification', label: 'Notifications', icon: Bell       },
];

export default function ActivityLogsTab() {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const dk = theme === 'dark';
  const th = {
    cardBg:     dk ? '#1a2332' : '#ffffff',
    inputBg:    dk ? '#141c26' : '#f8fafc',
    border:     dk ? '#2a3a4a' : '#e2e8f0',
    text:       dk ? '#e2e8f0' : '#0f172a',
    textMuted:  dk ? '#7a8fa8' : '#475569',
    pageBtnBg:  dk ? '#141c26' : '#ffffff',
    pageBtnTxt: dk ? '#7a8fa8' : '#475569',
    pageBtnDis: dk ? '#253040' : '#f8fafc',
    pageBtnDisTxt: dk ? '#3a4a5a' : '#cbd5e1',
    rowBg:      dk ? '#1a2332' : '#ffffff',
    rowBorder:  dk ? '#243040' : '#f1f5f9',
    emptyBg:    dk ? '#1a2332' : '#ffffff',
    chipBg:     dk ? '#141c26' : '#f8fafc',
    paginatBg:  dk ? '#1a2332' : '#ffffff',
  };

  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [search,     setSearch]     = useState('');

  async function load(p = 1) {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20', type: typeFilter });
      if (fromDate) params.set('from', fromDate);
      if (toDate)   params.set('to',   toDate);
      const res = await api.get(`/activity?${params}`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      setPage(p);
    } catch {
      setError('Failed to load activity logs. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Reset to page 1 on any filter change
  useEffect(() => { load(1); }, [typeFilter, fromDate, toDate]);

  // Client-side search (within current page)
  const filtered = search.trim()
    ? logs.filter(l =>
        l.patient?.toLowerCase().includes(search.toLowerCase()) ||
        l.description?.toLowerCase().includes(search.toLowerCase()) ||
        l.performedBy?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  function clearFilters() {
    setTypeFilter('all'); setFromDate(''); setToDate(''); setSearch('');
  }

  const hasFilters = fromDate || toDate || search || typeFilter !== 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem', width: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--teal, #00857c), #00a896)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,133,124,0.25)',
          }}>
            <Activity size={20} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Hospital Activity Logs</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
              {loading ? 'Loading…' : `${total} total events recorded across all medical staff`}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(page)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.5rem 0.875rem', borderRadius: 8,
            border: `1px solid ${th.border}`, background: th.cardBg,
            color: th.textMuted, fontSize: '0.8rem', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── Filter Card ── */}
      <div style={{
        background: th.cardBg, borderRadius: 14, border: `1px solid ${th.border}`,
        padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.875rem',
        boxShadow: dk ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        {/* Search + date range */}
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search patient, action, user…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                border: `1.5px solid ${th.border}`, borderRadius: 8, fontSize: '0.8125rem',
                color: th.text, background: th.inputBg, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Filter size={13} color="#94a3b8" />
            <label style={{ fontSize: '0.76rem', color: '#94a3b8' }}>From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', border: `1.5px solid ${th.border}`, borderRadius: 8, fontSize: '0.8rem', background: th.inputBg, color: th.textMuted, outline: 'none' }}
            />
            <label style={{ fontSize: '0.76rem', color: th.textMuted }}>to</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', border: `1.5px solid ${th.border}`, borderRadius: 8, fontSize: '0.8rem', background: th.inputBg, color: th.textMuted, outline: 'none' }}
            />
            {hasFilters && (
              <button onClick={clearFilters} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.42rem 0.65rem', borderRadius: 8,
                border: '1.5px solid #fecdd3', background: '#fff1f2',
                color: '#e11d48', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500,
              }}>
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Type tabs */}
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {FILTER_TABS.map(({ key, label, icon: Icon }) => {
            const active = typeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.38rem 0.8rem', borderRadius: 20,
                  border: active ? '1.5px solid var(--teal, #00857c)' : `1.5px solid ${th.border}`,
                  background: active ? 'rgba(0,133,124,0.09)' : th.chipBg,
                  color: active ? 'var(--teal, #00857c)' : th.textMuted,
                  fontSize: '0.78rem', fontWeight: active ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <Icon size={12} strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, color: '#e11d48', fontSize: '0.8125rem' }}>
          {error}
        </div>
      )}

      {/* ── Log List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
            padding: '3.5rem 1rem', background: th.emptyBg, borderRadius: 14, border: `1px solid ${th.border}`,
            color: th.textMuted,
          }}>
            <Activity size={44} strokeWidth={1.5} />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: th.textMuted }}>No activity found</span>
            <span style={{ fontSize: '0.8rem', color: th.textMuted }}>Try adjusting your filters or date range</span>
          </div>
        ) : (
          filtered.map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '1rem',
                background: th.rowBg, borderRadius: 12, padding: '0.875rem 1.125rem',
                border: `1px solid ${th.rowBorder}`,
                boxShadow: dk ? '0 1px 3px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <LogIcon subtype={log.subtype} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Top row: badge + timestamp */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                  <TypeBadge subtype={log.subtype} />
                  <span style={{ fontSize: '0.71rem', color: '#94a3b8', marginLeft: 'auto' }}>
                    {formatDateTime(log.time)}
                  </span>
                </div>

                {/* Description */}
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: th.text, lineHeight: 1.45, marginBottom: '0.3rem' }}>
                  {log.description}
                </div>

                {/* Meta row: patient + performed by */}
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                  {log.patient && log.patient !== '—' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.775rem', color: th.textMuted }}>
                      <Baby size={11} color={th.textMuted} />
                      {log.patientId ? (
                        <Link href={`/patients/${log.patientId}`} style={{ color: 'var(--teal, #00857c)', textDecoration: 'none', fontWeight: 600 }}>
                          {log.patient}
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 500 }}>{log.patient}</span>
                      )}
                    </span>
                  )}
                  {log.performedBy && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.775rem', color: th.textMuted }}>
                      <User size={11} color={th.textMuted} />
                      {log.performedBy}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1rem', background: th.paginatBg, borderRadius: 12,
          border: `1px solid ${th.border}`, flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <span style={{ fontSize: '0.8rem', color: th.textMuted }}>
            Page <strong>{page}</strong> of <strong>{pages}</strong> — {total} total events
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.45rem 1rem', borderRadius: 8,
                border: `1.5px solid ${th.border}`,
                background: page <= 1 ? th.pageBtnDis : th.pageBtnBg,
                color: page <= 1 ? th.pageBtnDisTxt : th.pageBtnTxt,
                fontSize: '0.8rem', fontWeight: 500,
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={14} /> Prev
            </button>

            {/* Page number chips */}
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const p = Math.max(1, Math.min(pages - 4, page - 2)) + i;
              return (
                <button key={p} onClick={() => load(p)} style={{
                  width: 34, height: 34, borderRadius: 8,
                  border: '1.5px solid',
                  borderColor: p === page ? 'var(--teal, #00857c)' : th.border,
                  background: p === page ? 'var(--teal, #00857c)' : th.pageBtnBg,
                  color: p === page ? '#fff' : th.pageBtnTxt,
                  fontSize: '0.8rem', fontWeight: p === page ? 700 : 400,
                  cursor: 'pointer',
                }}>
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => load(page + 1)}
              disabled={page >= pages}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.45rem 1rem', borderRadius: 8,
                border: `1.5px solid ${th.border}`,
                background: page >= pages ? th.pageBtnDis : th.pageBtnBg,
                color: page >= pages ? th.pageBtnDisTxt : th.pageBtnTxt,
                fontSize: '0.8rem', fontWeight: 500,
                cursor: page >= pages ? 'not-allowed' : 'pointer',
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
