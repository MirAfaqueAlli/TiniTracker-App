'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Send,
  Wifi,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
  Baby,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  X,
  TrendingUp,
  RotateCw,
  BookCheck,
  Hourglass,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const LIMIT = 10;

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        fill="#25D366"
        d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"
      />
    </svg>
  );
}

const AVATAR_PALETTE = [
  { bg: '#e6f7f5', color: '#00857c' },
  { bg: '#e0f2fe', color: '#0284c7' },
  { bg: '#f3e8ff', color: '#7e22ce' },
  { bg: '#ffe4e6', color: '#be185d' },
  { bg: '#fef3c7', color: '#b45309' },
  { bg: '#dcfce7', color: '#15803d' },
];

function getAvatarStyle(name) {
  if (!name) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function getInitials(name) {
  if (!name) return 'PT';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPhoneDisplay(num) {
  if (!num) return '—';
  const cleaned = num.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return num;
}

function formatDateTime(dStr) {
  if (!dStr) return { date: '—', time: '—' };
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return { date: '—', time: '—' };
  const date = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return { date, time };
}

function getAlertInfo(notif) {
  // If actual stage template name is linked from server
  const stageName = notif.PatientStage?.template?.stage_name;
  if (stageName) {
    const isChild =
      notif.Patient?.patient_type === 'immunization' ||
      /polio|vaccin|dose|immuni|hepatitis|bcg|measles/i.test(stageName);
    const isMissed = notif.type === 'missed';
    return {
      label: stageName,
      className: isMissed ? 'missed' : isChild ? 'polio' : 'antenatal',
      icon: isMissed ? AlertTriangle : isChild ? Baby : Calendar,
    };
  }

  // Fallback to notification type mapping
  switch (notif.type) {
    case 'reminder_today':
      return { label: 'Today Reminder', className: 'antenatal', icon: Calendar };
    case 'reminder_1d':
      return { label: '1-Day Reminder', className: 'antenatal', icon: Clock };
    case 'reminder_7d':
      return { label: '7-Day Reminder', className: 'antenatal', icon: Clock };
    case 'missed':
      return { label: 'Missed Visit Alert', className: 'missed', icon: AlertTriangle };
    case 'stage_complete':
      return { label: 'Stage Complete', className: 'immunization', icon: Calendar };
    case 'delivery_recorded':
      return { label: 'Delivery Recorded', className: 'polio', icon: Baby };
    case 'edd_updated':
      return { label: 'EDD Updated', className: 'antenatal', icon: Calendar };
    case 'manual':
      return { label: 'Manual Alert', className: 'general', icon: Send };
    default:
      return { label: notif.type || 'Notification', className: 'general', icon: Calendar };
  }
}



/* ─── Notification Details Modal ────────────────────────────────── */
function DetailsModal({ notif, onClose, onResend, onMarkRead }) {
  if (!notif) return null;
  const alert = getAlertInfo(notif);
  const { date, time } = formatDateTime(notif.sent_at || notif.createdAt);
  const isFailed = notif.status === 'failed';
  const isPending = notif.status === 'pending';
  const sentAt = notif.sent_at || notif.createdAt;
  const ageMs = sentAt ? (Date.now() - new Date(sentAt).getTime()) : 0;
  const isStale = isPending && ageMs > 10 * 60 * 1000;

  return (
    <div className="notif-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#e6f7f5',
                color: '#00857c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Eye size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                Notification Log Details
              </div>
              <div style={{ fontSize: '0.765rem', color: '#64748b' }}>
                Delivery dispatch log ID #{notif.id}
              </div>
            </div>
          </div>
          <button
            className="rpm-close-btn"
            onClick={onClose}
            title="Close"
            style={{ width: 30, height: 30 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Stale Pending Warning */}
        {isStale && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 0.85rem', background: '#fef9c3',
            border: '1px solid #fde68a', borderRadius: '10px',
            fontSize: '0.78rem', color: '#92400e', fontWeight: 600,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            This notification has been pending for over 10 minutes — it may not have been delivered.
          </div>
        )}

        {/* Patient & Alert Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            background: '#f8fafc',
            padding: '0.85rem 1rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div>
            <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>Recipient</div>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
              {notif.Patient?.name || `Patient #${notif.patient_id}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>
              {formatPhoneDisplay(notif.whatsapp_number)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>Alert Type</div>
            <div style={{ marginTop: 3 }}>
              <span className={`notif-type-badge ${alert.className}`}>
                <alert.icon size={12} />
                <span>{alert.label}</span>
              </span>
            </div>
            <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: 4 }}>
              Status:{' '}
              <span className={`notif-status-badge ${notif.status || 'sent'}`} style={{ padding: '0.15rem 0.5rem', fontSize: '0.675rem' }}>
                {isStale ? 'Stale Pending' : notif.status}
              </span>
            </div>
          </div>
        </div>

        {/* Message body in WhatsApp chat bubble */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
            Delivered WhatsApp Message:
          </div>
          <div className="notif-chat-bubble">
            {notif.message_body || 'No message content logged.'}
            <div
              style={{
                textAlign: 'right',
                fontSize: '0.675rem',
                color: '#64748b',
                marginTop: '0.5rem',
              }}
            >
              {date} · {time}
            </div>
          </div>
        </div>

        {notif.provider_message_id && (
          <div style={{ fontSize: '0.725rem', color: '#94a3b8' }}>
            Provider Ref: {notif.provider_message_id}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.25rem' }}>
          <button type="button" className="rpm-btn-cancel" onClick={onClose}>
            Close
          </button>
          {(isPending || isFailed) && (
            <button
              type="button"
              className="rpm-btn-cancel"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#16a34a', border: '1px solid #bbf7d0', background: '#f0fdf4' }}
              onClick={() => { onClose(); onMarkRead(notif.id); }}
            >
              <BookCheck size={14} /> Mark as Read
            </button>
          )}
          {(isFailed || isStale) && (
            <button
              type="button"
              className="notif-btn-batch"
              style={{ height: 38, padding: '0 1.15rem' }}
              onClick={() => {
                onClose();
                onResend(notif.id);
              }}
            >
              <RotateCw size={14} />
              <span>{isFailed ? 'Retry Sending' : 'Resend'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Notification Component ───────────────────────────────── */
export default function Notifications() {
  const { user } = useAuthStore();
  const isDoctor = user?.role === 'doctor_pregnancy' || user?.role === 'doctor_immunization';

  const [notifs, setNotifs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalSent: 0, scheduledToday: 0, failedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [cronLoading, setCronLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [cronResult, setCronResult] = useState(null); // { type: 'success'|'error', result: {}, errMsg: '' }
  const [resendingId, setResendingId] = useState(null);
  const [markingId,   setMarkingId]   = useState(null);

  // Determine if a notification is "stale pending" (pending but sent > 10 minutes ago)
  function isStalePending(notif) {
    if (notif.status !== 'pending') return false;
    const sentAt = notif.sent_at || notif.createdAt;
    if (!sentAt) return false;
    const ageMs = Date.now() - new Date(sentAt).getTime();
    return ageMs > 10 * 60 * 1000; // older than 10 minutes
  }



  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get(`/notifications?${params}`);
      setNotifs(res.data.notifications || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      if (res.data.stats) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Fetch notifications error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function triggerCron() {
    setCronLoading(true);
    setCronResult(null);
    try {
      const res = await api.post('/notifications/cron');
      const r = res.data.result || {};
      setCronResult({ type: 'success', result: r });
      setPage(1);
      load();
    } catch (err) {
      setCronResult({ type: 'error', errMsg: err.response?.data?.error || err.message });
    } finally {
      setCronLoading(false);
      setTimeout(() => setCronResult(null), 8000);
    }
  }

  async function handleResend(id) {
    setResendingId(id);
    try {
      await api.post(`/notifications/${id}/resend`);
      load();
    } catch (err) {
      alert('Failed to resend notification: ' + (err.response?.data?.error || err.message));
    } finally {
      setResendingId(null);
    }
  }

  async function handleMarkRead(id) {
    setMarkingId(id);
    try {
      await api.patch(`/notifications/${id}`, { status: 'read' });
      load();
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.error || err.message));
    } finally {
      setMarkingId(null);
    }
  }

  const startRow = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const endRow = Math.min(page * LIMIT, total);

  return (
    <div className="notif-container">
      {/* ── Page Header ── */}
      <div className="notif-header">
        <div>
          <div className="notif-title">Notifications</div>
        </div>

        <div className="notif-header-actions">
          {!isDoctor && (
            <button
              type="button"
              className="notif-btn-batch"
              onClick={triggerCron}
              disabled={cronLoading}
            >
              {cronLoading ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              ) : (
                <>
                  <Send size={14} />
                  <span>Run Batch Alerts</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            className="notif-action-btn"
            onClick={load}
            title="Refresh logs"
            style={{ width: 40, height: 40, borderRadius: '50%' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>



      {/* ── Stat Summary Cards (3 cards, Delivery Rate excluded as requested) ── */}
      <div className="notif-stats-grid">
        {/* Card 1: Total Reminders Sent */}
        <div className="notif-stat-card">
          <div className="notif-stat-icon-box sent">
            <Send size={18} />
          </div>
          <div className="notif-stat-info">
            <span className="notif-stat-label">Total Reminders Sent</span>
            <div className="notif-stat-value-row">
              <span className="notif-stat-value">
                {stats.totalSent > 0 ? stats.totalSent.toLocaleString() : total.toLocaleString()}
              </span>
            </div>
            <div className="notif-stat-trend">
              <TrendingUp size={11} />
              <span>Real-time delivery log</span>
            </div>
          </div>
        </div>

        {/* Card 2: Scheduled For Today */}
        <div className="notif-stat-card">
          <div className="notif-stat-icon-box scheduled">
            <Clock size={18} />
          </div>
          <div className="notif-stat-info">
            <span className="notif-stat-label">Scheduled For Today</span>
            <div className="notif-stat-value-row">
              <span className="notif-stat-value">
                {stats.scheduledToday !== undefined ? stats.scheduledToday.toLocaleString() : '0'}
              </span>
              <span className="notif-stat-unit">Messages</span>
            </div>
            <div className="notif-stat-sub">
              Pending queue today
            </div>
          </div>
        </div>

        {/* Card 3: Failed / Undelivered */}
        <div className="notif-stat-card">
          <div className="notif-stat-icon-box failed">
            <AlertTriangle size={18} />
          </div>
          <div className="notif-stat-info">
            <span className="notif-stat-label">Failed / Undelivered</span>
            <div className="notif-stat-value-row">
              <span className={`notif-stat-value ${stats.failedCount > 0 ? 'failed' : ''}`}>
                {stats.failedCount > 0 ? stats.failedCount.toLocaleString() : '0'}
              </span>
              <span className={`notif-stat-unit ${stats.failedCount > 0 ? 'failed' : ''}`}>
                Failed
              </span>
            </div>
            <div className={`notif-stat-sub ${stats.failedCount > 0 ? 'failed' : 'success'}`}>
              {stats.failedCount > 0 ? 'Retry action available' : 'All delivered successfully'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls Bar ── */}
      <div className="notif-filter-bar">
        {/* Search */}
        <div className="notif-search-wrapper">
          <Search size={16} className="notif-search-icon" />
          <input
            className="notif-search-input"
            placeholder="Search by patient name or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {/* Status Filter */}
        <div className="notif-select-wrapper">
          <select
            className="notif-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="delivered">Delivered</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="read">Read</option>
          </select>
          <ChevronDown size={14} className="notif-select-chevron" />
        </div>

        {/* Alert Types Filter */}
        <div className="notif-select-wrapper">
          <select
            className="notif-select"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Alert Types</option>
            <option value="reminder_today">Today Reminder</option>
            <option value="reminder_1d">1-Day Reminder</option>
            <option value="reminder_7d">7-Day Reminder</option>
            <option value="missed">Missed Visit Alert</option>
            <option value="stage_complete">Stage Complete</option>
            <option value="delivery_recorded">Delivery Recorded</option>
            <option value="edd_updated">EDD Updated</option>
            <option value="manual">Manual Alert</option>
          </select>
          <ChevronDown size={14} className="notif-select-chevron" />
        </div>
      </div>

      {/* ── Main Table Card ── */}
      <div className="notif-table-card">
        {loading ? (
          <div style={{ padding: '3.5rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#f1f5f9',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                marginBottom: '0.75rem',
              }}
            >
              <Search size={22} />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              No notifications found
            </div>
            <p style={{ fontSize: '0.785rem', color: '#64748b', marginTop: '0.25rem' }}>
              {search || statusFilter || typeFilter
                ? 'Try clearing your filters or search query.'
                : 'Automated WhatsApp logs appear here once patients are registered and cron runs.'}
            </p>
          </div>
        ) : (
          <div className="notif-table-responsive">
            <table className="notif-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Alert Type</th>
                  <th>WhatsApp Number</th>
                  <th>Status</th>
                  <th>Sent At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {notifs.map((n) => {
                  const pName = n.Patient?.name || `Patient #${n.patient_id}`;
                  const pPhone = n.whatsapp_number || n.Patient?.whatsapp_number || '—';
                  const initials = getInitials(pName);
                  const avatarTheme = getAvatarStyle(pName);
                  const alert = getAlertInfo(n);
                  const { date, time } = formatDateTime(n.sent_at || n.createdAt);
                  const isFailed = n.status === 'failed';
                  const isResending = resendingId === n.id;

                  return (
                    <tr key={n.id}>
                      {/* Patient Cell */}
                      <td>
                        <div className="notif-patient-cell">
                          <div
                            className="notif-avatar"
                            style={{ background: avatarTheme.bg, color: avatarTheme.color }}
                          >
                            {initials}
                          </div>
                          <div className="notif-patient-meta">
                            <span className="notif-patient-name">{pName}</span>
                            <span className="notif-patient-phone">{formatPhoneDisplay(pPhone)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Alert Type Cell */}
                      <td>
                        <span className={`notif-type-badge ${alert.className}`}>
                          <alert.icon size={13} />
                          <span>{alert.label}</span>
                        </span>
                      </td>

                      {/* WhatsApp Number Cell */}
                      <td>
                        <div className="notif-whatsapp-cell">
                          <WhatsAppIcon size={16} />
                          <span>{formatPhoneDisplay(n.whatsapp_number)}</span>
                        </div>
                      </td>

                      {/* Status Cell */}
                      <td>
                        {(() => {
                          const stale = isStalePending(n);
                          const statusLabel = n.status || 'sent';
                          let icon = null;
                          let extraStyle = {};
                          if (statusLabel === 'sent')    icon = <CheckCircle size={11} />;
                          if (statusLabel === 'read')    icon = <BookCheck size={11} />;
                          if (statusLabel === 'failed')  icon = <XCircle size={11} />;
                          if (statusLabel === 'pending') icon = stale ? <AlertTriangle size={11} /> : <Hourglass size={11} />;
                          if (stale) extraStyle = { background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a' };
                          return (
                            <span className={`notif-status-badge ${statusLabel}`} style={extraStyle}>
                              {icon} {stale ? 'Stale Pending' : statusLabel}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Sent At Cell */}
                      <td>
                        <div className="notif-time-cell">
                          <span className="notif-time-date">{date}</span>
                          <span className="notif-time-hour">{time}</span>
                        </div>
                      </td>

                      {/* Action Cell */}
                      <td>
                        <div className="notif-action-group">
                          {/* Show Resend for failed OR stale-pending */}
                          {(n.status === 'failed' || isStalePending(n)) && (
                            <button
                              type="button"
                              className="notif-action-btn retry"
                              onClick={() => handleResend(n.id)}
                              title={n.status === 'failed' ? 'Retry sending' : 'Resend (stuck pending)'}
                              disabled={resendingId === n.id || markingId === n.id}
                            >
                              <RotateCw
                                size={14}
                                className={resendingId === n.id ? 'animate-spin' : ''}
                              />
                            </button>
                          )}

                          {/* Show Mark as Read for pending or failed (manual dismiss) */}
                          {(n.status === 'pending' || n.status === 'failed') && (
                            <button
                              type="button"
                              className="notif-action-btn"
                              onClick={() => handleMarkRead(n.id)}
                              title="Mark as read (dismiss)"
                              disabled={markingId === n.id || resendingId === n.id}
                              style={{ color: '#16a34a' }}
                            >
                              {markingId === n.id
                                ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />
                                : <BookCheck size={14} />}
                            </button>
                          )}

                          <button
                            type="button"
                            className="notif-action-btn"
                            onClick={() => setSelectedNotif(n)}
                            title="View message log"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {total > 0 && (
          <div className="notif-pagination-bar">
            <span>
              Showing {startRow}–{endRow} of {total.toLocaleString()} notifications
            </span>

            <div className="notif-pagination-controls">
              <button
                type="button"
                className="notif-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
                .reduce((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '…' ? (
                    <span key={`dots-${i}`} style={{ padding: '0 0.25rem', color: '#94a3b8' }}>
                      …
                    </span>
                  ) : (
                    <button
                      key={`page-${n}`}
                      type="button"
                      className={`notif-page-btn ${n === page ? 'active' : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}

              <button
                type="button"
                className="notif-page-btn"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {selectedNotif && (
        <DetailsModal
          notif={selectedNotif}
          onClose={() => setSelectedNotif(null)}
          onResend={handleResend}
          onMarkRead={handleMarkRead}
        />
      )}

      {/* ── Batch Toast Popup ── */}
      {cronResult && (
        <div className={`batch-toast-popup ${cronResult.type}`}>
          <div className="batch-toast-icon-wrap">
            {cronResult.type === 'success' ? (
              <CheckCircle size={20} />
            ) : (
              <XCircle size={20} />
            )}
          </div>
          <div className="batch-toast-body">
            <div className="batch-toast-title">
              {cronResult.type === 'success' ? 'Batch Complete' : 'Batch Failed'}
            </div>
            {cronResult.type === 'error' && cronResult.errMsg && (
              <div className="batch-toast-sub">{cronResult.errMsg}</div>
            )}
          </div>
          <button className="batch-toast-close" onClick={() => setCronResult(null)} title="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
