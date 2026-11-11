'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity, UserPlus, Baby, CheckCircle, SkipForward,
  Calendar, Bell, ChevronLeft, ChevronRight, Search,
  X, RefreshCw, User,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

const TYPE_CFG = {
  mother_registered:  { icon: UserPlus,    category: 'registration', label: 'Mother Registered' },
  child_registered:   { icon: Baby,        category: 'registration', label: 'Child Registered' },
  delivery_recorded:  { icon: Baby,        category: 'delivery',     label: 'Delivery Recorded' },
  stage_visited:      { icon: CheckCircle, category: 'stage',        label: 'Visit Completed' },
  stage_skipped:      { icon: SkipForward, category: 'stage',        label: 'Stage Skipped' },
  stage_rescheduled:  { icon: Calendar,    category: 'stage',        label: 'Rescheduled' },
  stage_complete:     { icon: CheckCircle, category: 'stage',        label: 'Visit Completed' },
  reminder_7d:        { icon: Bell,        category: 'notification', label: 'Reminder (7d)' },
  reminder_1d:        { icon: Bell,        category: 'notification', label: 'Reminder (1d)' },
  reminder_today:     { icon: Bell,        category: 'notification', label: 'Reminder Today' },
  missed:             { icon: Bell,        category: 'notification', label: 'Missed Visit' },
  edd_updated:        { icon: Calendar,    category: 'stage',        label: 'EDD Updated' },
  patient_edited:     { icon: User,        category: 'stage',        label: 'Patient Edited' },
  hospital_transferred:{ icon: Activity,   category: 'stage',        label: 'Hospital Transfer' },
  patient_status_changed:{ icon: User,     category: 'stage',        label: 'Status Changed' },
  manual:             { icon: Bell,        category: 'notification', label: 'Manual Message' },
};

const FILTER_TABS = [
  { key: 'all',          label: 'All',           category: 'all' },
  { key: 'registration', label: 'Registrations', category: 'registration' },
  { key: 'delivery',     label: 'Deliveries',    category: 'delivery' },
  { key: 'stage',        label: 'Stage Actions', category: 'stage' },
  { key: 'notification', label: 'Notifications', category: 'notification' },
];

function formatDay(date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, now)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatLongDate(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function LogIcon({ category }) {
  const cfg = Object.values(TYPE_CFG).find((item) => item.category === category);
  const Icon = cfg?.icon || Activity;
  return (
    <span className={`audit-icon cat-${category || 'all'}`} aria-hidden="true">
      <Icon size={16} />
    </span>
  );
}

export default function ActivityLogsTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  async function load(p = 1) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20', type: typeFilter });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
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

  useEffect(() => {
    const timer = setTimeout(() => load(1), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, fromDate, toDate]);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((log) =>
      log.patient?.toLowerCase().includes(q) ||
      log.description?.toLowerCase().includes(q) ||
      log.performedBy?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const groups = useMemo(() => {
    const result = [];
    filtered.forEach((log) => {
      const key = dayKey(log.time);
      let group = result[result.length - 1];
      if (!group || group.key !== key) {
        group = { key, date: new Date(log.time), items: [] };
        result.push(group);
      }
      group.items.push(log);
    });
    return result;
  }, [filtered]);

  function clearFilters() {
    setTypeFilter('all');
    setFromDate('');
    setToDate('');
    setSearch('');
  }

  const hasFilters = Boolean(fromDate || toDate || search || typeFilter !== 'all');

  return (
    <section className="setting-panel" aria-labelledby="logs-title">
      <div className="panel-head">
        <div>
          <h2 className="setting-title" id="logs-title">Activity logs</h2>

        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
        </div>
      </div>

      <div className="audit-toolbar">
        <div className="tool-search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Search activity"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            aria-label="Search activity by patient, action or staff"
          />
        </div>

        <div className="date-range">
          <label htmlFor="audit-from">From</label>
          <input id="audit-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <label htmlFor="audit-to">to</label>
          <input id="audit-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <span className="result-count">
          Showing <b>{filtered.length}</b> of {total} events
        </span>

        {hasFilters && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
            <X size={13} />
            Clear
          </button>
        )}
      </div>

      <div className="audit-cats" role="group" aria-label="Filter activity by category">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="chipfilter"
            data-cat={tab.category}
            aria-pressed={typeFilter === tab.key}
            onClick={() => setTypeFilter(tab.key)}
          >
            {tab.label}
            {tab.key === 'all' && <span className="n">{total}</span>}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '12px 16px' }}><div className="form-summary">{error}</div></div>}

      <div>
        {loading ? (
          <div className="loading-block">
            <RefreshCw size={26} style={{ animation: 'spin 1s linear infinite' }} />
            <p>Loading activity logs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Activity size={28} />
            <strong>No activity matches</strong>
            <span>Try a different category, date range or search term.</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
              Reset filters
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="audit-day">
              <div className="audit-day-head">
                <span><b>{formatDay(group.date)}</b> · {formatLongDate(group.date)}</span>
                <span>{group.items.length} event{group.items.length === 1 ? '' : 's'}</span>
              </div>
              {group.items.map((log) => {
                const cfg = TYPE_CFG[log.subtype] || { category: 'all', label: 'Activity', icon: Activity };
                return (
                  <div key={log.id} className={`audit-event cat-${cfg.category}`}>
                    <LogIcon category={cfg.category} />
                    <div className="audit-main">
                      <div className="audit-line">
                        <span className="audit-action">{cfg.label}</span>
                        <span className={`cat-tag cat-${cfg.category}`}>{FILTER_TABS.find((t) => t.category === cfg.category)?.label || 'Activity'}</span>
                      </div>
                      <p className="audit-detail">{log.description}</p>
                      <div className="audit-meta">
                        {log.patient && log.patient !== '—' && (
                          <span>
                            <Baby size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                            {log.patientId ? (
                              <Link href={`/patients/${log.patientId}`}>{log.patient}</Link>
                            ) : (
                              log.patient
                            )}
                          </span>
                        )}
                        {log.performedBy && (
                          <>
                            <span className="sep">·</span>
                            <span>
                              <User size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                              {log.performedBy}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="audit-time">{formatTime(log.time)}</span>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>

      <div className="audit-foot">
        <span>
          {filtered.length
            ? <>Newest activity first · <b>{filtered.length}</b> event{filtered.length === 1 ? '' : 's'} on this page</>
            : 'Newest activity first · all times clinic local'}
        </span>
        {pages > 1 && (
          <div className="pagination">
            <button type="button" className="page-btn" onClick={() => load(page - 1)} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const p = Math.max(1, Math.min(pages - 4, page - 2)) + i;
              return (
                <button
                  key={p}
                  type="button"
                  className={`page-btn${p === page ? ' active' : ''}`}
                  onClick={() => load(p)}
                >
                  {p}
                </button>
              );
            })}
            <button type="button" className="page-btn" onClick={() => load(page + 1)} disabled={page >= pages} aria-label="Next page">
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
