'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Send,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCheck,
  Eye,
  X,
  ClipboardList,
  Download,
  Copy,
  ExternalLink,
  RotateCw,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';

const LIMIT = 25;
const EXPORT_LIMIT = 1000;

const TYPE_META = {
  reminder_7d: '7-day reminder',
  reminder_1d: '1-day reminder',
  reminder_today: 'Same-day reminder',
  missed: 'Missed-visit follow-up',
  manual: 'Manual reminder',
  stage_complete: 'Stage complete',
  edd_updated: 'EDD updated',
  delivery_recorded: 'Delivery recorded',
  stage_skipped: 'Stage skipped',
  stage_rescheduled: 'Stage rescheduled',
};

const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, label]) => ({ value, label }));

const STATUS_META = {
  pending: { label: 'Queued', cls: 'is-queued' },
  sent: { label: 'Sent', cls: 'is-sent' },
  delivered: { label: 'Delivered', cls: 'is-delivered' },
  failed: { label: 'Failed', cls: 'is-failed' },
  read: { label: 'Read', cls: 'is-read' },
};

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Queued' },
];

function WhatsAppIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <path
        fill="#25D366"
        d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"
      />
    </svg>
  );
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
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

function formatWhen(value) {
  if (!value) return { main: '—', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { main: '—', time: '' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);

  let main;
  if (diffDays === 0) main = 'Today';
  else if (diffDays === 1) main = 'Yesterday';
  else {
    main = date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }

  const time = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return { main, time };
}

function patientKind(patient) {
  if (patient?.patient_type === 'pregnant') return { label: 'Mother', cls: '' };
  if (patient?.patient_type === 'immunization') return { label: 'Child', cls: 'is-imm' };
  if (patient?.patient_type === 'both') return { label: 'Mother & Child', cls: 'is-both' };
  return { label: 'Patient', cls: '' };
}

function patientSubline(notif) {
  const patient = notif.Patient || {};
  const bits = [patientKind(patient).label];
  if (patient.child_name) bits.push(patient.child_name);
  else if (patient.age) bits.push(`${patient.age} yrs`);
  else if (notif.patient_id) bits.push(`#${notif.patient_id}`);
  return bits.join(' · ');
}

function getTypeInfo(notif) {
  return {
    label: TYPE_META[notif.type] || (notif.type ? String(notif.type).replace(/_/g, ' ') : 'Notification'),
    stageName: notif.PatientStage?.template?.stage_name || '',
  };
}

function linkedStage(notif) {
  const stage = notif.PatientStage;
  if (!stage) return '—';
  const name = stage.template?.stage_name || 'Linked stage';
  const date = parseDateOnly(stage.scheduled_date);
  if (!date) return name;
  return `${name} · ${date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

function SentCell({ notif }) {
  if (notif.status === 'pending') {
    const queued = formatWhen(notif.createdAt);
    return (
      <>
        <div className="sched-when">Not sent yet</div>
        <div className="sched-when-sub">Queued {queued.main}, {queued.time}</div>
      </>
    );
  }

  const when = formatWhen(notif.sent_at || notif.createdAt);
  let note = '';
  if (notif.status === 'failed') note = ' · not delivered';
  else if (notif.status === 'sent') note = ' · awaiting receipt';
  else if (notif.status === 'delivered') note = ' · received';
  else if (notif.status === 'read') note = ' · read';

  return (
    <>
      <div className="sched-when">{when.main}</div>
      <div className="sched-when-sub">{when.time}{note}</div>
    </>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || '—', cls: 'is-queued' };
  return (
    <span className={`sched-status ${meta.cls}`}>
      <i aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function StatCard({ label, value, unit, sub, icon: Icon, warn = false }) {
  return (
    <div className="sched-stat">
      <div className="sched-stat-top">
        <span className="sched-stat-label">{label}</span>
        <Icon size={16} className="sched-stat-icon" aria-hidden="true" />
      </div>
      <div className={`sched-stat-value${warn ? ' warn' : ''}`}>
        <span>{value}</span>
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="sched-stat-sub">{sub}</div>
    </div>
  );
}

function DetailsDialog({ notif, onClose, onResend, onCopyMessage, resending, canSendManual }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!notif) return null;

  const patient = notif.Patient || {};
  const patientName = patient.name || `Patient #${notif.patient_id}`;
  const phone = notif.whatsapp_number || patient.whatsapp_number || '—';
  const kind = patientKind(patient);
  const info = getTypeInfo(notif);
  const statusMeta = STATUS_META[notif.status] || { label: notif.status || '—' };
  const queued = formatWhen(notif.createdAt);
  const sent = notif.sent_at ? formatWhen(notif.sent_at) : null;
  const delivered = notif.delivered_at ? formatWhen(notif.delivered_at) : null;
  const message = notif.message_body || 'No message content was logged for this reminder.';

  const subtitle = notif.status === 'pending'
    ? `Queued ${queued.main}, ${queued.time}`
    : `${statusMeta.label} · ${(delivered || sent || queued).main}, ${(delivered || sent || queued).time}`;

  const statusDetail = notif.status === 'pending'
    ? `Queued ${queued.main}, ${queued.time}`
    : `${statusMeta.label} ${(delivered || sent || queued).main}, ${(delivered || sent || queued).time}`;

  const deliveredText = delivered
    ? `${delivered.main}, ${delivered.time}`
    : notif.status === 'failed'
      ? 'Not delivered'
      : 'Awaiting receipt';

  const timeline = [];
  timeline.push({ kind: 'done', label: 'Queued', note: `${queued.main}, ${queued.time}` });

  if (notif.status === 'pending') {
    timeline.push({
      kind: 'pending',
      label: 'Awaiting send',
      note: 'The WhatsApp gateway has not processed this reminder yet.',
    });
  } else {
    timeline.push({
      kind: 'done',
      label: 'Sent',
      note: `${sent ? `${sent.main}, ${sent.time}` : `${queued.main}, ${queued.time}`} · WhatsApp`,
    });

    if (notif.status === 'delivered' || notif.status === 'read') {
      timeline.push({
        kind: 'done',
        label: 'Delivered',
        note: delivered
          ? `${delivered.main}, ${delivered.time} · receipt confirmed`
          : 'Delivery receipt confirmed by the WhatsApp gateway.',
      });
    } else if (notif.status === 'failed') {
      timeline.push({
        kind: 'fail',
        label: 'Delivery failed',
        note: notif.provider_message_id
          ? `Provider reference: ${notif.provider_message_id}`
          : 'The WhatsApp gateway could not deliver this reminder.',
      });
    }
  }

  return (
    <div
      className="sched-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sched-modal" role="dialog" aria-modal="true" aria-labelledby="sched-detail-title">
        <div className="sched-modal-head">
          <div>
            <h2 className="sched-modal-title" id="sched-detail-title">Reminder detail</h2>
            <p className="sched-modal-sub">{subtitle}</p>
          </div>
          <button type="button" className="sched-close" onClick={onClose} aria-label="Close reminder detail">
            <X size={16} />
          </button>
        </div>

        <div className="sched-patient-card">
          <span className={`sched-avatar ${kind.cls}`} aria-hidden="true">{initials(patientName)}</span>
          <div className="sched-patient-main">
            <div className="sched-patient-name">
              {patientName}
              <StatusBadge status={notif.status} />
            </div>
            <div className="sched-patient-meta">
              {kind.label} · {info.label}{info.stageName ? ` · ${info.stageName}` : ''}
            </div>
            <div className="sched-patient-contact">
              <WhatsAppIcon size={13} />
              {phone}
            </div>
          </div>
        </div>

        <div className="sched-meta-grid">
          <div className="sched-kv">
            <span className="k">Channel</span>
            <span className="v">WhatsApp</span>
          </div>
          <div className="sched-kv">
            <span className="k">Status detail</span>
            <span className="v num">{statusDetail}</span>
          </div>
          <div className="sched-kv">
            <span className="k">Linked stage</span>
            <span className="v sub">{linkedStage(notif)}</span>
          </div>
          <div className="sched-kv">
            <span className="k">Delivered</span>
            <span className="v num">{deliveredText}</span>
          </div>
        </div>

        <div className="sched-detail-block">
          <div className="sched-detail-head">
            <span>Delivery timeline</span>
            <span className="meta">WhatsApp gateway</span>
          </div>
          <ol className="sched-timeline">
            {timeline.map((step, index) => (
              <li key={`${step.label}-${index}`} className={`sched-step is-${step.kind}`}>
                <span className="sched-step-dot" aria-hidden="true" />
                <div>
                  <div className="sched-step-label">{step.label}</div>
                  <div className="sched-step-note">{step.note}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="sched-message">
          <div className="sched-message-head">
            <span className="who">Message sent to {patientName}</span>
            <span className="sched-chan">WhatsApp</span>
          </div>
          <div className="sched-message-body">{message}</div>
          <div className="sched-message-foot">WhatsApp · {message.length} characters</div>
        </div>

        <div className="sched-modal-foot">
          <button type="button" className="ttd-btn ttd-btn-ghost" onClick={() => onCopyMessage(message)}>
            <Copy size={15} />
            Copy text
          </button>
          <span className="sched-foot-spacer" />
          <button
            type="button"
            className="ttd-btn ttd-btn-ghost"
            onClick={() => router.push(`/patients/${notif.patient_id}`)}
          >
            <ExternalLink size={15} />
            Open patient record
          </button>
          {canSendManual && (
            <button
              type="button"
              className="ttd-btn ttd-btn-primary"
              onClick={() => onResend(notif.id)}
              disabled={resending}
            >
              {resending ? <span className="sched-mini-spinner is-light" /> : <RotateCw size={15} />}
              Resend
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { user, sessionChecked } = useAuthStore();
  const canView = hasUserPermission(user, 'notifications.view');
  const canSendManual = hasUserPermission(user, 'notifications.send_manual');
  const canRunBatch = hasUserPermission(user, 'notifications.trigger_batch');

  const [notifs, setNotifs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [statusCounts, setStatusCounts] = useState({
    all: 0, pending: 0, sent: 0, delivered: 0, failed: 0, read: 0,
  });
  const [stats, setStats] = useState({
    sent7d: 0,
    delivered7d: 0,
    failed7d: 0,
    awaiting: 0,
    sentOpen: 0,
    queuedOpen: 0,
    patientCount7d: 0,
  });
  const [loading, setLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((type, title, message) => {
    setToast({ type, title, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get(`/notifications?${params.toString()}`);
      setNotifs(res.data.notifications || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      setStats(res.data.stats || {});
      setStatusCounts(res.data.statusCounts || {
        all: 0, pending: 0, sent: 0, delivered: 0, failed: 0, read: 0,
      });
    } catch (err) {
      setNotifs([]);
      setError(err.response?.data?.error || 'Failed to load the reminder register.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = useCallback(() => {
    if (page !== 1) setPage(1);
    else load();
  }, [page, load]);

  async function runBatch() {
    setBatchLoading(true);
    try {
      const res = await api.post('/notifications/cron');
      const result = res.data.result || {};
      const sent = (result.reminder_7d || 0) + (result.reminder_1d || 0) + (result.reminder_today || 0);
      const missed = result.missed || 0;
      showToast(
        'success',
        'Batch complete',
        `${sent} reminder${sent === 1 ? '' : 's'} sent · ${missed} missed visit${missed === 1 ? '' : 's'} flagged.`
      );
      refresh();
    } catch (err) {
      showToast('error', 'Batch failed', err.response?.data?.error || err.message);
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleResend(id) {
    setResendingId(id);
    try {
      const res = await api.post(`/notifications/${id}/resend`);
      const ok = res.data.status === 'sent';
      showToast(ok ? 'success' : 'error', ok ? 'Reminder resent' : 'Delivery failed', res.data.message || '');
      setSelectedNotif(null);
      refresh();
    } catch (err) {
      showToast('error', 'Resend failed', err.response?.data?.error || err.message);
    } finally {
      setResendingId(null);
    }
  }

  async function copyMessage(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast('success', 'Copied', 'Message text copied to the clipboard.');
        return;
      }
      throw new Error('Clipboard unavailable');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      document.body.removeChild(area);
      if (copied) showToast('success', 'Copied', 'Message text copied to the clipboard.');
      else showToast('error', 'Copy blocked', 'Select the message text and copy it manually.');
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: String(EXPORT_LIMIT) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get(`/notifications?${params.toString()}`);
      const rows = res.data.notifications || [];
      if (!rows.length) {
        showToast('error', 'Nothing to export', 'No reminders match the current filters.');
        return;
      }

      const head = ['Patient', 'Kind', 'WhatsApp number', 'Reminder', 'Linked stage', 'Status', 'Sent at', 'Delivered at', 'Message'];
      const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = [head.map(cell).join(',')];

      rows.forEach((row) => {
        lines.push([
          row.Patient?.name || `Patient #${row.patient_id}`,
          patientKind(row.Patient).label,
          row.whatsapp_number || row.Patient?.whatsapp_number || '',
          getTypeInfo(row).label,
          linkedStage(row),
          STATUS_META[row.status]?.label || row.status || '',
          row.sent_at || '',
          row.delivered_at || '',
          row.message_body || '',
        ].map(cell).join(','));
      });

      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tinittracker-reminders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('success', 'Export ready', `${rows.length} reminder${rows.length === 1 ? '' : 's'} exported as CSV.`);
    } catch (err) {
      showToast('error', 'Export failed', err.response?.data?.error || err.message);
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setStatusFilter('all');
    setTypeFilter('all');
    setSearch('');
    setPage(1);
  }

  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all' || Boolean(search.trim());
  const selectedResending = selectedNotif ? resendingId === selectedNotif.id : false;
  const countFor = (value) => (value === 'all' ? statusCounts.all : statusCounts[value]) || 0;
  const startRow = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const endRow = Math.min(page * LIMIT, total);

  if (sessionChecked && !canView) {
    return (
      <div className="sched-page" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: 'var(--ttd-card-bg, #1a1e29)', border: '1px solid var(--ttd-border, #2d3748)', borderRadius: 12, padding: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ttd-ink, #fff)', marginBottom: '0.75rem' }}>Access Restricted</h2>
          <p style={{ color: 'var(--ttd-muted, #94a3b8)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            You do not have permission to view notification schedules and message history. If you believe this is in error, please contact your hospital administrator.
          </p>
          <div style={{ marginTop: '1.25rem' }}>
            <Link href="/dashboard" className="ttd-btn ttd-btn-secondary" style={{ display: 'inline-flex' }}>
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sched-page">
      <header className="sched-head" aria-label="Schedules and reminders">
        <div className="sched-head-copy">

        </div>
        <div className="sched-actions">
          {canRunBatch ? (
            <button type="button" className="ttd-btn ttd-btn-primary sched-run-btn" onClick={runBatch} disabled={batchLoading}>
              {batchLoading ? <RefreshCw size={15} className="sched-spin" /> : <Send size={15} />}
              <span>{batchLoading ? 'Running batch…' : 'Run batch'}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="ttd-btn ttd-btn-ghost sched-icon-btn"
            onClick={refresh}
            disabled={loading}
            title="Refresh reminders"
            aria-label="Refresh reminders"
          >
            <RefreshCw size={16} className={loading ? 'sched-spin' : ''} />
          </button>
          <button type="button" className="ttd-btn ttd-btn-ghost" onClick={exportCsv} disabled={exporting}>
            <Download size={15} />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="ttd-alert" role="alert">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="sched-stats" aria-label="WhatsApp reminder summary">
        <StatCard
          label="Sent · last 7 days"
          value={Number(stats.sent7d || 0).toLocaleString()}
          unit="reminders"

          icon={Send}
        />
        <StatCard
          label="Delivered · last 7 days"
          value={Number(stats.delivered7d || 0).toLocaleString()}
          unit="received"

          icon={CheckCheck}
        />
        <StatCard
          label="Awaiting delivery"
          value={Number(stats.awaiting || 0).toLocaleString()}
          unit="open"

          icon={Clock}
        />
        <StatCard
          label="Failed · last 7 days"
          value={Number(stats.failed7d || 0).toLocaleString()}
          unit="failed"
          warn={Number(stats.failed7d || 0) > 0}

          icon={AlertTriangle}
        />
      </section>

      <section className="sched-panel" aria-labelledby="sched-log-title">
        <div className="sched-panel-head">
          <h2 className="sched-panel-title" id="sched-log-title">
            <ClipboardList size={16} />
            Reminder log
          </h2>
          <span className="sched-panel-note">WhatsApp only</span>
        </div>

        <div className="sched-filters" aria-label="Filter reminders">
          <div className="sched-search-wrap">
            <Search size={15} className="sched-search-icon" />
            <input
              type="search"
              className="sched-search-input"
              placeholder="Search patient name or phone number"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Search reminders by patient name or phone number"
            />
          </div>

          <span className="sched-filter-label">Status</span>
          <div className="sched-chip-group" role="group" aria-label="Filter by delivery status">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className="sched-chip"
                aria-pressed={statusFilter === filter.value}
                onClick={() => {
                  setStatusFilter(filter.value);
                  setPage(1);
                }}
              >
                {filter.label} <span className="n">{countFor(filter.value)}</span>
              </button>
            ))}
          </div>

          <span className="sched-f-divider" aria-hidden="true" />

          <label className="sched-filter-label" htmlFor="sched-type-filter">Type</label>
          <div className="sched-select-wrap">
            <select
              id="sched-type-filter"
              className="sched-select"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All types</option>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>

          <span className="sched-filter-meta">
            <span className="sched-result-count">
              Showing <b>{notifs.length}</b> of {total} reminder{total === 1 ? '' : 's'}
            </span>
            <button type="button" className="ttd-btn ttd-btn-ghost ttd-btn-small" onClick={clearFilters}>
              Clear
            </button>
          </span>
        </div>

        {loading ? (
          <div className="sched-loading">
            <span className="ttd-spinner" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="sched-empty">
            <Search size={22} />
            <strong>No reminders match these filters</strong>
            <span>
              {hasFilters
                ? 'Try a different status or reminder type — or clear the search.'
                : 'WhatsApp reminders appear here once the batch job runs for your patients.'}
            </span>
            {hasFilters ? (
              <button type="button" className="ttd-btn ttd-btn-ghost ttd-btn-small" onClick={clearFilters}>
                Reset filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="sched-table-wrap">
            <table className="sched-table">
              <thead>
                <tr>
                  <th scope="col" className="sched-c-patient">Patient</th>
                  <th scope="col" className="sched-c-contact">Contact</th>
                  <th scope="col" className="sched-c-rem">Reminder</th>
                  <th scope="col" className="sched-c-when">Sent</th>
                  <th scope="col" className="sched-c-status">Status</th>
                  <th scope="col" className="sched-c-act"><span>Action</span></th>
                </tr>
              </thead>
              <tbody>
                {notifs.map((notif) => {
                  const patient = notif.Patient || {};
                  const kind = patientKind(patient);
                  const info = getTypeInfo(notif);
                  const phone = notif.whatsapp_number || patient.whatsapp_number || '—';

                  return (
                    <tr key={notif.id}>
                      <td className="sched-c-patient">
                        <div className="sched-patient">
                          <span className={`sched-avatar ${kind.cls}`} aria-hidden="true">
                            {initials(patient.name || `Patient ${notif.patient_id}`)}
                          </span>
                          <div className="sched-patient-main">
                            <div className="sched-p-name">{patient.name || `Patient #${notif.patient_id}`}</div>
                            <div className="sched-p-sub">{patientSubline(notif)}</div>
                            <div className="sched-phone-inline">{phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="sched-c-contact">
                        <div className="sched-phone">
                          <WhatsAppIcon size={14} />
                          <span>{phone}</span>
                        </div>
                      </td>
                      <td className="sched-c-rem">
                        <div className="sched-rem-type">{info.label}</div>
                        <div className="sched-rem-stage">{linkedStage(notif)}</div>
                      </td>
                      <td className="sched-c-when">
                        <SentCell notif={notif} />
                      </td>
                      <td className="sched-c-status">
                        <StatusBadge status={notif.status} />
                      </td>
                      <td className="sched-c-act">
                        <button
                          type="button"
                          className="sched-linkbtn sched-view-btn"
                          onClick={() => setSelectedNotif(notif)}
                          title="View reminder"
                          aria-label={`View reminder for ${patient.name || `patient ${notif.patient_id}`}`}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 ? (
          <div className="sched-table-foot">
            <span>
              Newest activity first · <b>{countFor('all').toLocaleString()}</b> reminder
              {countFor('all') === 1 ? '' : 's'} in the register
            </span>
            <div className="sched-pager">
              <span className="sched-page-status">Showing {startRow}–{endRow} of {total.toLocaleString()}</span>
              <button
                type="button"
                className="ttd-pager-btn"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="sched-page-number">Page {page} of {pages}</span>
              <button
                type="button"
                className="ttd-pager-btn"
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
                disabled={page === pages}
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedNotif ? (
        <DetailsDialog
          notif={selectedNotif}
          onClose={() => setSelectedNotif(null)}
          onResend={handleResend}
          onCopyMessage={copyMessage}
          resending={selectedResending}
          canSendManual={canSendManual}
        />
      ) : null}

      {toast ? (
        <div className={`ttd-toast sched-toast${toast.type === 'error' ? ' is-error' : ''}`} role="status">
          <div className="sched-toast-body">
            <div className="sched-toast-title">{toast.title}</div>
            {toast.message ? <div className="sched-toast-msg">{toast.message}</div> : null}
          </div>
          <button type="button" className="sched-toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            <X size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
