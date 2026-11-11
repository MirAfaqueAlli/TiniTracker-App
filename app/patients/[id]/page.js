'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  SkipForward,
  Calendar,
  RefreshCw,
  X,
  Baby,
  FileText,
  Eye,
  TrendingUp,
  User,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Syringe,
  HeartPulse,
  Star,
  Clock,
  Pencil,
  Phone,
  MapPin,
  StickyNote,
  History,
  ArrowRightLeft,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';

const STATUS_CONFIG = {
  pending:  { label: 'Scheduled', badge: 'badge-pending' },
  notified: { label: 'Notified',  badge: 'badge-notified' },
  visited:  { label: 'Visited',   badge: 'badge-visited' },
  skipped:  { label: 'Skipped',   badge: 'badge-skipped' },
  missed:   { label: 'Missed',    badge: 'badge-missed' },
};

const HISTORY_PAGE_SIZE = 20;

function WhatsAppIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        fill="#25D366"
        d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"
      />
    </svg>
  );
}

// DATEONLY values ("YYYY-MM-DD") must be parsed as local dates — `new Date('YYYY-MM-DD')`
// is interpreted as UTC midnight and can render as the previous day in UTC-negative zones.
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fmt(d) {
  const date = parseDate(d);
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function formatSkipReason(reason) {
  if (!reason) return 'Staff decision';
  const labels = {
    pre_registration: 'Scheduled before patient registration',
    date_revised: 'Schedule revised after an EDD change',
    delivery_completed: 'Pregnancy care completed with delivery',
    staff_decision: 'Staff decision',
  };
  return labels[reason] || reason;
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

function getPatientInitials(name) {
  if (!name) return 'PT';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getDaysUntil(dateStr) {
  const target = parseDate(dateStr);
  if (!target) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Due Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} Days`;
  if (diffDays > 7) return `In ${diffDays} Days`;
  if (diffDays === -1) return '1 Day Overdue';
  if (diffDays < -1) return `${Math.abs(diffDays)} Days Overdue`;
  return fmt(dateStr);
}



/* ─── EDD Update Modal ──────────────────────────────── */
function EddModal({ patient, onClose, onSuccess }) {
  const [edd, setEdd]         = useState(patient.edd ? patient.edd.split('T')[0] : '');
  const [source, setSource]   = useState(patient.edd_source || 'direct_entry');
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.put(`/patients/${patient.id}/edd`, { edd, edd_source: source, reason });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="notif-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="pd-card-icon-box">
              <Calendar size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ttd-ink)' }}>Update EDD</div>
              <div style={{ fontSize: '0.765rem', color: 'var(--ttd-muted)' }}>Revise Expected Due Date calculation</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'var(--ttd-rose-soft)', border: '1px solid var(--ttd-rose-soft)', borderRadius: '10px', fontSize: '0.785rem', color: 'var(--ttd-rose)' }}>
              {error}
            </div>
          )}
          <div className="rpm-field">
            <label className="rpm-label">New Expected Due Date (EDD) *</label>
            <input className="rpm-input" type="date" value={edd} onChange={e => setEdd(e.target.value)} required />
          </div>
          <div className="rpm-field">
            <label className="rpm-label">Calculation Source</label>
            <select className="rpm-input" value={source} onChange={e => setSource(e.target.value)}>
              <option value="ultrasound">Ultrasound Scan</option>
              <option value="direct_entry">Direct Entry</option>
              <option value="lmp_calculated">LMP Calculated</option>
            </select>
          </div>
          <div className="rpm-field">
            <label className="rpm-label">Clinical / Administrative Reason</label>
            <input className="rpm-input" placeholder="e.g. First trimester dating ultrasound" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pd-btn-primary" disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : 'Update EDD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Delivery Modal ────────────────────────────────── */
function DeliveryModal({ patient, onClose, onSuccess }) {
  const [form, setForm] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_mode: 'vaginal',
    birth_weight:  '',
    apgar_1min:    '',
    apgar_5min:    '',
    child_name:    '',
    child_gender:  'female',
    delivery_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault(); setError('');
    setLoading(true);
    try {
      const payload = { ...form, child_dob: form.delivery_date };
      if (payload.birth_weight) payload.birth_weight = parseFloat(payload.birth_weight);
      if (payload.apgar_1min)   payload.apgar_1min   = parseInt(payload.apgar_1min);
      if (payload.apgar_5min)   payload.apgar_5min   = parseInt(payload.apgar_5min);
      await api.post(`/patients/${patient.id}/delivery`, payload);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record delivery');
    } finally { setLoading(false); }
  }

  return (
    <div className="notif-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="pd-card-icon-box">
              <Baby size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ttd-ink)' }}>Record Delivery</div>
              <div style={{ fontSize: '0.765rem', color: 'var(--ttd-muted)' }}>Transition to postpartum & child immunization timeline</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'var(--ttd-rose-soft)', border: '1px solid var(--ttd-rose-soft)', borderRadius: '10px', fontSize: '0.785rem', color: 'var(--ttd-rose)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="rpm-field">
              <label className="rpm-label">Delivery Date *</label>
              <input className="rpm-input" type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} required />
            </div>
            <div className="rpm-field">
              <label className="rpm-label">Delivery Mode</label>
              <select className="rpm-input" value={form.delivery_mode} onChange={e => set('delivery_mode', e.target.value)}>
                <option value="vaginal">Normal Vaginal</option>
                <option value="assisted">Assisted Vaginal</option>
                <option value="c_section">Caesarean (C-Section)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div className="rpm-field">
              <label className="rpm-label">Birth Weight (kg)</label>
              <input className="rpm-input" type="number" step="0.01" placeholder="3.20" value={form.birth_weight} onChange={e => set('birth_weight', e.target.value)} />
            </div>
            <div className="rpm-field">
              <label className="rpm-label">APGAR @ 1 min</label>
              <input className="rpm-input" type="number" min={0} max={10} placeholder="8" value={form.apgar_1min} onChange={e => set('apgar_1min', e.target.value)} />
            </div>
            <div className="rpm-field">
              <label className="rpm-label">APGAR @ 5 min</label>
              <input className="rpm-input" type="number" min={0} max={10} placeholder="9" value={form.apgar_5min} onChange={e => set('apgar_5min', e.target.value)} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--ttd-line)', paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ttd-accent-ink)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem' }}>
              Baby Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
              <div className="rpm-field">
                <label className="rpm-label">Baby Name (Optional)</label>
                <input className="rpm-input" placeholder="e.g. Arjun" value={form.child_name} onChange={e => set('child_name', e.target.value)} />
              </div>
              <div className="rpm-field">
                <label className="rpm-label">Gender</label>
                <select className="rpm-input" value={form.child_gender} onChange={e => set('child_gender', e.target.value)}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rpm-field">
            <label className="rpm-label">Clinical Delivery Notes</label>
            <textarea className="rpm-input" rows={2} placeholder="Any delivery complications or observations..." value={form.delivery_notes} onChange={e => set('delivery_notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pd-btn-primary" disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <><Baby size={14} /> Complete Delivery</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Complete Stage Modal ──────────────────────────── */
function CompleteStageModal({ stage, onClose, onSuccess }) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextNotes, setNextNotes] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const isMissed = stage?.status === 'missed';

  async function submit(e) {
    e.preventDefault();
    if (isMissed && !correctionReason.trim()) {
      setError('A correction reason is required to mark a missed stage as visited.');
      return;
    }
    setLoading(true); setError('');
    try {
      await api.put(`/patients/${stage.patient_id}/stages/${stage.id}/visit`, {
        actual_visit_date: visitDate,
        notes: nextNotes.trim() || null,
        next_stage_notes: nextNotes.trim() || null,
        correction_reason: correctionReason.trim() || null,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to complete stage');
    } finally { setLoading(false); }
  }

  return (
    <div className="notif-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="pd-card-icon-box">
              <CheckCircle size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ttd-ink)' }}>Mark Visited</div>
              <div style={{ fontSize: '0.765rem', color: 'var(--ttd-muted)' }}>{stage.template?.stage_name}</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'var(--ttd-rose-soft)', border: '1px solid var(--ttd-rose-soft)', borderRadius: '10px', fontSize: '0.785rem', color: 'var(--ttd-rose)' }}>
              {error}
            </div>
          )}
          <div className="rpm-field">
            <label className="rpm-label">Visit Date *</label>
            <input className="rpm-input" type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} required />
          </div>
          {isMissed && (
            <div className="rpm-field">
              <label className="rpm-label">Correction Reason *</label>
              <input
                className="rpm-input"
                value={correctionReason}
                onChange={e => setCorrectionReason(e.target.value)}
                placeholder="e.g. Patient attended late; visit documented after review"
                required
              />
            </div>
          )}
          <div className="rpm-field">
            <label className="rpm-label">Instructions for Next Stage (Optional)</label>
            <textarea
              className="rpm-input"
              rows={3}
              placeholder="e.g. Follow up on blood report, check glucose tolerance..."
              value={nextNotes}
              onChange={e => setNextNotes(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pd-btn-primary" disabled={loading || (isMissed && !correctionReason.trim())}>
              {loading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : <><CheckCircle size={14} /> Confirm Visit</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Reschedule Stage Modal ────────────────────────── */
function RescheduleModal({ stage, onClose, onSuccess }) {
  const [newDate, setNewDate]   = useState(stage.scheduled_date ? stage.scheduled_date.split('T')[0] : '');
  const [reason, setReason]     = useState('');
  const [cascade, setCascade]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is mandatory for rescheduling.');
      return;
    }
    setLoading(true); setError('');
    try {
      await api.put(`/patients/${stage.patient_id}/stages/${stage.id}/date`, {
        new_date: newDate,
        override_reason: reason.trim(),
        cascade,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reschedule stage');
    } finally { setLoading(false); }
  }

  return (
    <div className="notif-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="pd-card-icon-box" style={{ background: 'var(--ttd-blue-soft)', color: 'var(--ttd-blue)' }}>
              <Calendar size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ttd-ink)' }}>Reschedule Stage</div>
              <div style={{ fontSize: '0.765rem', color: 'var(--ttd-muted)' }}>{stage.template?.stage_name}</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'var(--ttd-rose-soft)', border: '1px solid var(--ttd-rose-soft)', borderRadius: '10px', fontSize: '0.785rem', color: 'var(--ttd-rose)' }}>
              {error}
            </div>
          )}

          <div style={{ padding: '0.75rem 0.95rem', background: 'var(--ttd-surface-soft)', border: '1px solid var(--ttd-line-strong)', borderRadius: '12px', fontSize: '0.785rem', color: 'var(--ttd-ink-2)' }}>
            Currently scheduled for: <span style={{ fontWeight: 700, color: 'var(--ttd-ink)' }}>{fmt(stage.scheduled_date)}</span>
          </div>

          <div className="rpm-field">
            <label className="rpm-label">New Scheduled Date *</label>
            <input className="rpm-input" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required />
          </div>

          <div className="rpm-field">
            <label className="rpm-label">Reason for Rescheduling * (Mandatory)</label>
            <textarea className="rpm-input" rows={2} placeholder="e.g. Patient traveling, requested postponement, doctor unavailable..." value={reason} onChange={e => setReason(e.target.value)} required style={{ resize: 'vertical' }} />
          </div>

          <div style={{
            padding: '0.75rem 0.85rem',
            borderRadius: '12px',
            background: 'var(--ttd-surface-soft)',
            border: '1px solid var(--ttd-line-strong)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ttd-ink)' }}>
              <input
                type="checkbox"
                checked={cascade}
                onChange={e => setCascade(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--ttd-accent-ink)' }}
              />
              Reschedule subsequent stages accordingly
            </label>
            <div style={{ fontSize: '0.72rem', color: 'var(--ttd-muted)', marginLeft: '1.6rem' }}>
              Automatically shifts all future visits in this timeline by the same duration.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pd-btn-primary" disabled={loading || !reason.trim() || !newDate}>
              {loading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : 'Confirm Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Skip Stage Modal ──────────────────────────────── */
function SkipModal({ stage, onClose, onSuccess }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is mandatory for skipping a stage.');
      return;
    }
    setLoading(true); setError('');
    try {
      await api.put(`/patients/${stage.patient_id}/stages/${stage.id}/skip`, {
        reason: reason.trim(),
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to skip stage');
    } finally { setLoading(false); }
  }

  return (
    <div className="notif-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="pd-card-icon-box" style={{ background: 'var(--ttd-rose-soft)', color: 'var(--ttd-rose)' }}>
              <SkipForward size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ttd-ink)' }}>Skip Stage</div>
              <div style={{ fontSize: '0.765rem', color: 'var(--ttd-muted)' }}>{stage.template?.stage_name}</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          <div style={{
            padding: '0.75rem 0.95rem',
            borderRadius: '12px',
            background: 'var(--ttd-amber-soft)',
            border: '1px solid transparent',
            fontSize: '0.785rem',
            color: 'var(--ttd-amber)',
            lineHeight: 1.4,
          }}>
            ⚠️ Skipping this stage will mark it as skipped in the patient history. A mandatory clinical or administrative reason is required for compliance.
          </div>

          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'var(--ttd-rose-soft)', border: '1px solid var(--ttd-rose-soft)', borderRadius: '10px', fontSize: '0.785rem', color: 'var(--ttd-rose)' }}>
              {error}
            </div>
          )}

          <div className="rpm-field">
            <label className="rpm-label">Reason for Skipping * (Mandatory)</label>
            <textarea
              className="rpm-input"
              rows={3}
              placeholder="e.g. Vaccine administered elsewhere, patient declined, medically contraindicated..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="pd-btn-primary"
              style={{ background: 'var(--ttd-rose)', borderColor: 'var(--ttd-rose)' }}
              disabled={loading || !reason.trim()}
            >
              {loading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : 'Confirm Skip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Stage Details Popup Modal ─────────────────────── */
function StageDetailsModal({ stage, onClose, onOpenReschedule, onOpenSkip, onOpenVisit, canReschedule, canSkip, canMarkVisit, canRecordDelivery }) {
  if (!stage) return null;
  const cfg = STATUS_CONFIG[stage.status] || STATUS_CONFIG.pending;
  const isSkipped = stage.status === 'skipped';
  const isVisited = stage.status === 'visited';
  const isActionable = ['pending', 'notified', 'missed'].includes(stage.status);

  const descriptionLines = (stage.template?.description || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  return (
    <div className="notif-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="notif-modal-card" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="pd-card-icon-box">
              <Calendar size={18} />
            </div>
            <div>
              <div style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--ttd-ink)',
                textDecoration: isSkipped ? 'line-through' : 'none',
                opacity: isSkipped ? 0.7 : 1,
              }}>
                {stage.template?.stage_name}
              </div>
              <div style={{ fontSize: '0.745rem', color: 'var(--ttd-muted)', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                <span>Code: {stage.template?.stage_code}</span>
                <span>•</span>
                <span style={{ textTransform: 'capitalize' }}>{stage.template?.type} Care</span>
              </div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {/* Status & Schedule Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            background: 'var(--ttd-surface-soft)',
            padding: '0.85rem 1rem',
            borderRadius: '14px',
            border: '1px solid var(--ttd-line-strong)',
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--ttd-muted)', fontWeight: 500 }}>Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                <span className={`pd-tl-status ${cfg.badge}`}>{cfg.label}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--ttd-muted)', fontWeight: 500 }}>Scheduled Date</div>
              <div style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--ttd-ink)',
                marginTop: '0.2rem',
                textDecoration: isSkipped ? 'line-through' : 'none'
              }}>
                {fmt(stage.scheduled_date)}
              </div>
            </div>
            {stage.actual_visit_date && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ttd-muted)', fontWeight: 500 }}>Actual Visit Date</div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--ttd-accent-ink)', marginTop: '0.2rem' }}>
                  {fmt(stage.actual_visit_date)}
                </div>
              </div>
            )}
            {stage.date_overridden && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ttd-muted)', fontWeight: 500 }}>Reschedule Notice</div>
                <div style={{ fontSize: '0.765rem', fontWeight: 600, color: 'var(--ttd-blue)', marginTop: '0.2rem' }}>
                  📅 Overridden Date
                </div>
              </div>
            )}
          </div>

          {/* Rescheduled Info Callout */}
          {stage.date_overridden && stage.override_reason && (
            <div style={{
              padding: '0.75rem 0.95rem',
              borderRadius: '12px',
              background: 'var(--ttd-blue-soft)',
              border: '1px solid transparent',
              fontSize: '0.785rem',
              color: 'var(--ttd-blue)'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>📅 Reschedule Reason:</div>
              {stage.override_reason}
            </div>
          )}

          {/* Skipped Info Callout */}
          {isSkipped && (
            <div style={{
              padding: '0.75rem 0.95rem',
              borderRadius: '12px',
              background: 'var(--ttd-rose-soft)',
              border: '1px solid var(--ttd-rose-soft)',
              fontSize: '0.785rem',
              color: 'var(--ttd-rose)'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>⏭️ Skip Reason:</div>
              {formatSkipReason(stage.skip_reason)}
            </div>
          )}

          {/* Visited Notes Callout */}
          {isVisited && stage.notes && (
            <div style={{
              padding: '0.75rem 0.95rem',
              borderRadius: '12px',
              background: 'var(--ttd-accent-soft)',
              border: '1px solid transparent',
              fontSize: '0.785rem',
              color: 'var(--ttd-accent-ink)'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>📝 Clinical Visit Notes:</div>
              {stage.notes}
            </div>
          )}

          {/* Clinical Protocol / Required Tests */}
          <div>
            <div style={{
              fontSize: '0.785rem',
              fontWeight: 700,
              color: 'var(--ttd-ink)',
              marginBottom: '0.45rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}>
              <FileText size={14} style={{ color: 'var(--ttd-accent-ink)' }} />
              Clinical Protocol & Required Tests:
            </div>
            {descriptionLines.length > 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                padding: '0.85rem 1rem',
                borderRadius: '14px',
                background: 'var(--ttd-surface-soft)',
                border: '1px solid var(--ttd-line-strong)',
                fontSize: '0.785rem',
              }}>
                {descriptionLines.map((line, idx) => {
                  const isHeader = line.toUpperCase() === line && line.endsWith(':');
                  if (isHeader) {
                    return (
                      <div key={idx} style={{ fontWeight: 700, color: 'var(--ttd-accent-ink)', marginTop: idx > 0 ? '0.35rem' : 0 }}>
                        {line}
                      </div>
                    );
                  }
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--ttd-ink-2)' }}>
                      <span style={{ color: 'var(--ttd-accent-ink)', flexShrink: 0, marginTop: '2px', fontWeight: 700 }}>•</span>
                      <span>{line.replace(/^[•\-*]\s*/, '')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '0.765rem', color: 'var(--ttd-muted)', fontStyle: 'italic' }}>
                Standard clinical guidelines apply for this stage.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', borderTop: '1px solid var(--ttd-line)', paddingTop: '0.85rem' }}>
          <div>
            {isActionable && (
              <div style={{ display: 'flex', gap: '0.45rem' }}>
                {canReschedule && stage.template?.stage_code !== 'DELIVERY' && (
                  <button
                    type="button"
                    className="pd-action-btn-secondary"
                    onClick={() => { onClose(); onOpenReschedule(stage); }}
                  >
                    <Calendar size={13} /> Reschedule
                  </button>
                )}
                {canSkip && (
                  <button
                    type="button"
                    className="pd-action-btn-secondary"
                    onClick={() => { onClose(); onOpenSkip(stage); }}
                    style={{ color: 'var(--ttd-rose)' }}
                  >
                    <SkipForward size={13} /> Skip
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Close</button>
            {isActionable && (
              (stage.template?.stage_code === 'DELIVERY' ? canRecordDelivery : canMarkVisit) && (
                <button
                  type="button"
                  className="pd-btn-primary"
                  onClick={() => { onClose(); onOpenVisit(stage); }}
                >
                  <CheckCircle size={14} />
                  {stage.template?.stage_code === 'DELIVERY' ? 'Record Delivery' : 'Mark Visited'}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const { user, sessionChecked } = useAuthStore();
  const canView = hasUserPermission(user, 'patients.view');
  const canEdit = hasUserPermission(user, 'patients.edit');
  const canMarkVisit = hasUserPermission(user, 'stages.mark_visit');
  const canSkip = hasUserPermission(user, 'stages.skip');
  const canReschedule = hasUserPermission(user, 'stages.reschedule');
  const canRecordDelivery = hasUserPermission(user, 'stages.record_delivery') || canEdit;
  const isDrPreg = user?.role === 'doctor_pregnancy';
  const isDrImm  = user?.role === 'doctor_immunization';
  const isDoctor = isDrPreg || isDrImm;

  const [patient, setPatient]     = useState(null);
  const [stages, setStages]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [marking, setMarking]     = useState(null);
  const [showEdd, setShowEdd]     = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [stageTab, setStageTab]   = useState('pregnancy');
  const [trackFilter, setTrackFilter] = useState('all');
  const [mainTab,  setMainTab]    = useState('stages');   // 'stages' | 'history'
  const [historyLog, setHistoryLog] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showCompleteStage, setShowCompleteStage] = useState(null);
  const [showReschedule,    setShowReschedule]    = useState(null);
  const [showSkip,          setShowSkip]          = useState(null);
  const [selectedStage,     setSelectedStage]     = useState(null);
  const requestSeq = useRef(0);
  const historySeq = useRef(0);
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  async function load() {
    if (!canView) {
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setHistoryLog([]);
    setHistoryTotal(0);
    setHistoryPage(1);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/stages`),
      ]);
      if (seq !== requestSeq.current) return;
      setPatient(pRes.data);
      setStages(sRes.data);
      if (isDrPreg) {
        setStageTab('pregnancy');
      } else if (isDrImm) {
        setStageTab('immunization');
      } else {
        setStageTab(
          pRes.data.patient_type === 'both' || pRes.data.patient_type === 'immunization'
            ? 'immunization'
            : 'pregnancy'
        );
      }
    } catch {
      if (seq === requestSeq.current) {
        setPatient(null);
        setStages([]);
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        // Keep the audit log in sync with any patient/stage mutations.
        loadHistory(seq, 1);
      }
    }
  }

  useEffect(() => { load(); }, [id]);

  async function loadHistory(seq = requestSeq.current, page = historyPage) {
    const hseq = ++historySeq.current;
    setHistoryLoading(true);
    try {
      const res = await api.get(`/patients/${id}/history`, {
        params: { page, limit: HISTORY_PAGE_SIZE },
      });
      if (seq !== requestSeq.current || hseq !== historySeq.current) return;
      setHistoryLog(res.data.history || []);
      setHistoryTotal(res.data.total ?? (res.data.history?.length || 0));
      setHistoryPage(res.data.page ?? page);
    } catch {
      if (seq === requestSeq.current && hseq === historySeq.current) {
        setHistoryLog([]);
        setHistoryTotal(0);
      }
    } finally {
      if (seq === requestSeq.current && hseq === historySeq.current) setHistoryLoading(false);
    }
  }

  function switchMainTab(tab) {
    setMainTab(tab);
    if (tab === 'history') loadHistory(requestSeq.current, historyPage);
  }

  function changeHistoryPage(next) {
    if (historyLoading) return;
    const target = Math.min(Math.max(1, next), historyTotalPages);
    if (target === historyPage) return;
    setHistoryPage(target);
    loadHistory(requestSeq.current, target);
  }

  if (sessionChecked && !canView) {
    return (
      <div className="patients-detail-v2" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: 'var(--ttd-card-bg, #1a1e29)', border: '1px solid var(--ttd-border, #2d3748)', borderRadius: 12, padding: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ttd-ink, #fff)', marginBottom: '0.75rem' }}>Access Restricted</h2>
          <p style={{ color: 'var(--ttd-muted, #94a3b8)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            You do not have permission to view patient records. Please contact your hospital administrator.
          </p>
          <div style={{ marginTop: '1.25rem' }}>
            <Link href="/dashboard" className="pd-btn-secondary" style={{ display: 'inline-flex', padding: '0.5rem 1rem' }}>
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <div className="spinner" />
    </div>
  );

  if (!patient) return (
    <div className="empty-state">
      <div className="empty-state-text">Patient not found</div>
      <Link href="/patients" className="pd-btn-secondary">Back to Patients</Link>
    </div>
  );

  const isBoth        = patient.patient_type === 'both';
  const isBothForPreg = isDrPreg && isBoth;
  const isPregnant    = patient.patient_type === 'pregnant' || isBoth;  // has pregnancy data
  const isImmunization = patient.patient_type === 'immunization' || isBoth;  // has immunization data

  const pregnancyStages    = stages.filter(s => s.template?.type === 'pregnancy');
  const immunizationStages = stages.filter(s => s.template?.type === 'immunization');

  // For 'both' patients, always show both tabs
  const hasBothTabs = isBoth && pregnancyStages.length > 0 && immunizationStages.length > 0;

  // Whether the current tab is the read-only Pregnancy History (for completed 'both' patients)
  const isPregHistoryTab = isBoth && stageTab === 'pregnancy';
  // Stages to display are always tab-based for 'both' patients; otherwise role-based
  const activeStages = hasBothTabs
    ? (stageTab === 'pregnancy' ? pregnancyStages : immunizationStages)
    : isDrPreg
    ? (pregnancyStages.length > 0 ? pregnancyStages : stages)
    : isDrImm
    ? immunizationStages
    : (stageTab === 'pregnancy' ? (pregnancyStages.length > 0 ? pregnancyStages : stages) : immunizationStages);

  // relevantStages drives progress card — uses active immunization dept for 'both'
  const relevantStages = isBoth
    ? (isDrPreg ? pregnancyStages : immunizationStages)
    : isDrPreg
    ? (pregnancyStages.length > 0 ? pregnancyStages : stages)
    : isDrImm
    ? immunizationStages
    : activeStages;

  const visitedCount = relevantStages.filter(s => s.status === 'visited').length;
  const upcomingCount = isBothForPreg ? 0 : relevantStages.filter(s => ['pending', 'notified'].includes(s.status)).length;
  const missedOrSkippedCount = relevantStages.filter(s => ['skipped', 'missed'].includes(s.status)).length;
  const totalCount = relevantStages.length;
  const progressPercent = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : (isBothForPreg ? 100 : 0);

  // Next actionable appointment (pending or notified)
  const nextAppointment = isBothForPreg ? null : relevantStages.find(s => ['pending', 'notified'].includes(s.status));

  // Determine avatar tone based on care type
  const avatarTone = isBothForPreg || isPregnant ? 'is-anc' : 'is-imm';
  const careTone = isBothForPreg ? 'is-completed' : isBoth ? 'is-both' : isPregnant ? 'is-anc' : 'is-imm';
  const statusTone = isBothForPreg || patient.status === 'completed'
    ? 'is-completed'
    : patient.status === 'active'
      ? 'is-active'
      : 'is-inactive';
  const initials = getPatientInitials(patient.name);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dateKey = (value) => (value ? String(value).slice(0, 10) : '');
  const daysFromToday = (value) => {
    const d = parseDate(value);
    if (!d) return null;
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - todayStart.getTime()) / 86400000);
  };
  const isOverdueStage = (s) => ['pending', 'notified'].includes(s.status) && daysFromToday(s.scheduled_date) < 0;
  const stageStatus = (s) => {
    if (s.status === 'visited') return { key: 'completed', label: 'Completed' };
    if (s.status === 'skipped') return { key: 'skipped', label: 'Skipped' };
    if (s.status === 'missed') return { key: 'overdue', label: 'Missed' };
    const d = daysFromToday(s.scheduled_date);
    if (d == null) return { key: 'upcoming', label: 'No date' };
    if (d < 0) return { key: 'overdue', label: `Overdue · ${Math.abs(d)}d` };
    if (d === 0) return { key: 'due', label: 'Due today' };
    if (d <= 21) return { key: 'due', label: `Due in ${d}d` };
    return { key: 'upcoming', label: `In ${d}d` };
  };

  const allStages = [...pregnancyStages, ...immunizationStages];

  // Previous completed stage (most recent by actual visit date) and its notes
  const visitedStages = relevantStages.filter(s => s.status === 'visited');
  const previousCompletedStage = visitedStages.length > 0
    ? [...visitedStages].sort((a, b) =>
        dateKey(b.actual_visit_date || b.scheduled_date).localeCompare(dateKey(a.actual_visit_date || a.scheduled_date))
      )[0]
    : null;
  const previousStageNote = previousCompletedStage?.notes?.trim();

  const byTemplateOrder = (a, b) => (a.template?.order_index ?? 0) - (b.template?.order_index ?? 0);
  const displayStages = hasBothTabs && trackFilter === 'all'
    ? [
        ...pregnancyStages.slice().sort(byTemplateOrder),
        ...immunizationStages.slice().sort(byTemplateOrder),
      ]
    : activeStages;

  const missedStages = allStages.filter((s) => s.status === 'missed');
  const overdueStages = allStages
    .filter(isOverdueStage)
    .sort((a, b) => dateKey(a.scheduled_date).localeCompare(dateKey(b.scheduled_date)));
  // System-flagged missed visits also need staff attention.
  const attentionStages = [...overdueStages, ...missedStages]
    .sort((a, b) => dateKey(a.scheduled_date).localeCompare(dateKey(b.scheduled_date)));
  const overdueCount = attentionStages.length;

  const nearestNext = allStages
    .filter((s) => ['pending', 'notified'].includes(s.status))
    .sort((a, b) => dateKey(a.scheduled_date).localeCompare(dateKey(b.scheduled_date)))[0] || null;
  const primaryNextIsOverdue = nearestNext ? isOverdueStage(nearestNext) : false;
  const otherOverdueStages = attentionStages.filter((s) => !nearestNext || s.id !== nearestNext.id);

  const visitedPreg = pregnancyStages.filter((s) => s.status === 'visited').length;
  const visitedImm = immunizationStages.filter((s) => s.status === 'visited').length;

  const ga = (() => {
    if (!patient.edd && !patient.lmp_date) return null;
    const edd = parseDate(patient.edd);
    const lmp = patient.lmp_date
      ? parseDate(patient.lmp_date)
      : edd
        ? new Date(edd.getTime() - 280 * 86400000)
        : null;
    if (!lmp) return null;
    lmp.setHours(0, 0, 0, 0);
    const daysPregnant = Math.max(0, Math.floor((todayStart.getTime() - lmp.getTime()) / 86400000));
    const toGo = edd ? Math.round((new Date(new Date(edd).setHours(0, 0, 0, 0)).getTime() - todayStart.getTime()) / 86400000) : null;
    let trimester = 'First trimester';
    const weeks = Math.floor(daysPregnant / 7);
    if (weeks >= 28) trimester = 'Third trimester';
    else if (weeks >= 13) trimester = 'Second trimester';
    return { weeks, days: daysPregnant % 7, daysPregnant, toGo, trimester };
  })();

  const childAgeText = (() => {
    const dob = parseDate(patient.child_dob);
    if (!dob) return null;
    const months = Math.max(0, (todayStart.getFullYear() - dob.getFullYear()) * 12 + (todayStart.getMonth() - dob.getMonth()));
    if (months >= 24) {
      const years = Math.floor(months / 12);
      return `${years} yr${years > 1 ? 's' : ''} old`;
    }
    if (months >= 1) return `${months} mo old`;
    const weeks = Math.floor((todayStart.getTime() - dob.getTime()) / (7 * 86400000));
    return weeks > 0 ? `${weeks} wk old` : 'Newborn';
  })();

  const pregUpcoming = pregnancyStages.filter((s) => ['pending', 'notified'].includes(s.status)).length;
  const pregMissed   = pregnancyStages.filter((s) => s.status === 'missed').length;
  const immUpcoming  = immunizationStages.filter((s) => ['pending', 'notified'].includes(s.status)).length;
  const immMissed    = immunizationStages.filter((s) => s.status === 'missed').length;

  const statCards = [];
  if (pregnancyStages.length > 0) {
    statCards.push({
      label: 'Antenatal contacts',
      icon: <HeartPulse size={16} />,
      value: visitedPreg,
      small: `of ${pregnancyStages.length} contacts`,
      pct: pregnancyStages.length ? Math.round((visitedPreg / pregnancyStages.length) * 100) : 0,
      sub: `${pregUpcoming} upcoming${pregMissed ? ` · ${pregMissed} missed` : ''}`,
    });
  }
  if (immunizationStages.length > 0) {
    statCards.push({
      label: 'Immunizations',
      icon: <Syringe size={16} />,
      value: visitedImm,
      small: `of ${immunizationStages.length} doses`,
      pct: immunizationStages.length ? Math.round((visitedImm / immunizationStages.length) * 100) : 0,
      imm: true,
      sub: `${immUpcoming} upcoming${immMissed ? ` · ${immMissed} missed` : ''}`,
    });
  }
  if (pregnancyStages.length > 0 && immunizationStages.length === 0) {
    statCards.push({
      label: 'Gestational age',
      icon: <Clock size={16} />,
      value: ga ? `${ga.weeks}w ${ga.days}d` : '—',
      sub: ga ? ga.trimester : 'No EDD recorded',
    });
  }
  if (immunizationStages.length > 0 && pregnancyStages.length === 0) {
    statCards.push({
      label: 'Child age',
      icon: <Baby size={16} />,
      value: childAgeText || '—',
      sub: patient.child_dob ? `DOB ${fmt(patient.child_dob)}` : 'No date of birth recorded',
    });
  }
  statCards.push({
    label: 'Next milestone',
    icon: <Calendar size={16} />,
    value: nearestNext ? fmt(nearestNext.scheduled_date) : '—',
    sub: nearestNext ? `${nearestNext.template?.stage_name} · ${getDaysUntil(nearestNext.scheduled_date)}` : 'No upcoming stage',
  });
  statCards.push({
    label: 'Overdue items',
    icon: <AlertTriangle size={16} />,
    value: overdueCount,
    warn: overdueCount > 0,
    sub: overdueCount ? 'Need outreach or rescheduling' : 'Nothing overdue',
  });

  // Once pregnancy care is complete (delivery recorded) or the patient is an
  // immunization patient, the header should show the child's DOB, not the EDD.
  const showChildHero = Boolean(patient.child_dob) && (
    patient.patient_type === 'both' ||
    patient.patient_type === 'immunization' ||
    Boolean(patient.delivery_date)
  );

  let heroWidget = null;
  if (!showChildHero && pregnancyStages.length > 0 && patient.edd) {
    heroWidget = {
      eyebrow: 'Expected due date',
      value: fmt(patient.edd),
      sub: ga ? `${ga.weeks}w ${ga.days}d · ${ga.toGo >= 0 ? `${ga.toGo} days to go` : `${Math.abs(ga.toGo)} days past due`}` : '',
      pct: ga ? Math.max(0, Math.min(100, Math.round((ga.daysPregnant / 280) * 100))) : null,
      foot: patient.lmp_date ? `LMP ${fmt(patient.lmp_date)}` : '',
    };
  } else if (patient.child_dob) {
    heroWidget = {
      eyebrow: 'Child date of birth',
      value: fmt(patient.child_dob),
      sub: childAgeText || '',
      pct: immunizationStages.length ? Math.round((visitedImm / immunizationStages.length) * 100) : null,
      foot: patient.child_name ? `Child: ${patient.child_name}` : '',
    };
  }


  return (
    <div className="pd-container">

      {/* ── 1. Patient header ───────────────────────────── */}
      <section className="pd-hero">
        <div className="pd-hero-id">
          <Link href="/patients" className="pd-back-btn" title="Back to Patients">
            <ArrowLeft size={17} />
          </Link>
          <div className={`pd-avatar-box ${avatarTone}`}>{initials}</div>
          <div className="pd-hero-copy">
            <h1 className="pd-patient-name">{patient.name}</h1>
            <div className="pd-hero-chips">
              <span className={`pd-care-badge ${careTone}`}>
                {isBoth ? 'Pregnancy + Immunization' : isPregnant ? 'Pregnant Mother' : 'Child Immunization'}
              </span>
              <span className={`pd-status-pill ${statusTone}`}>
                <span className="pd-status-dot" />
                {isBothForPreg || patient.status === 'completed' ? 'Completed' : patient.status}
              </span>
              {overdueCount > 0 && (
                <span className="pd-chip pd-chip-danger">{overdueCount} overdue</span>
              )}
            </div>
            <p className="pd-hero-meta">
              ID <b>#{patient.id}</b>
              {patient.age ? <> · <b>{patient.age} yrs</b></> : null}
              {patient.createdAt ? <> · Registered <b>{fmt(patient.createdAt)}</b></> : null}
            </p>
            <div className="pd-hero-contact">
              {patient.whatsapp_number && (
                <span>
                  <WhatsAppIcon size={14} />
                  {formatPhoneDisplay(patient.whatsapp_number)}
                </span>
              )}
              {patient.address && (
                <span>
                  <MapPin size={14} />
                  <span className="pd-truncate" title={patient.address}>{patient.address}</span>
                </span>
              )}
              {nearestNext && (
                <span>
                  <Calendar size={14} />
                  Next visit {fmt(nearestNext.scheduled_date)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pd-hero-right">
          {heroWidget && (
            <div className="pd-edd-widget">
              <span className="pd-eyebrow">{heroWidget.eyebrow}</span>
              <span className="pd-edd-date">{heroWidget.value}</span>
              <span className="pd-edd-sub">{heroWidget.sub}</span>
              {heroWidget.pct != null && (
                <div className="pd-mini-bar"><i style={{ width: `${heroWidget.pct}%` }} /></div>
              )}
              {heroWidget.foot && <span className="pd-edd-foot">{heroWidget.foot}</span>}
            </div>
          )}
          {!isBoth && patient.patient_type === 'pregnant' && patient.status !== 'completed' && !isDrImm && (canEdit || canRecordDelivery) && (
            <div className="pd-hero-actions">
              {canEdit && (
                <button className="pd-btn-secondary" onClick={() => setShowEdd(true)}>
                  <Calendar size={14} /> Update EDD
                </button>
              )}
              {canRecordDelivery && (
                <button className="pd-btn-primary" onClick={() => setShowDelivery(true)}>
                  <Baby size={14} /> Record delivery
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Progress stat cards (care-aware) ─────────── */}
      <section className="pd-stats" aria-label="Care progress">
        {statCards.map((card) => (
          <article key={card.label} className={`pd-stat${card.warn ? ' is-warn' : ''}`}>
            <div className="pd-stat-top">
              <span className="pd-stat-label">{card.label}</span>
              <span className="pd-stat-icon">{card.icon}</span>
            </div>
            <div className="pd-stat-value">
              {card.value}
              {card.small && <small>{card.small}</small>}
            </div>
            {card.pct != null && (
              <div className={`pd-bar${card.imm ? ' is-imm' : ''}`}>
                <i style={{ width: `${card.pct}%` }} />
              </div>
            )}
            <div className="pd-stat-sub">{card.sub}</div>
          </article>
        ))}
      </section>

      {/* ── 3. Next steps & handover ────────────────────── */}
      <section className="pd-panel">
        <div className="pd-panel-head">
          <h2 className="pd-panel-title">
            <Sparkles size={16} /> Next steps &amp; handover
          </h2>
          <span className="pd-panel-note">
            {overdueCount > 0
              ? `${overdueCount} item${overdueCount > 1 ? 's' : ''} need attention`
              : nearestNext
                ? 'Care on track'
                : 'No pending items'}
          </span>
        </div>

        <div className="pd-next-list">
          {nearestNext && (
            <div className={`pd-next-item ${primaryNextIsOverdue ? 'is-danger' : 'is-info'}`}>
              <div className="pd-next-badge">
                {primaryNextIsOverdue ? <AlertTriangle size={16} /> : <Calendar size={16} />}
              </div>
              <div className="pd-next-main">
                <div className="pd-next-title">
                  {nearestNext.template?.stage_name}
                  <span className={`pd-chip ${nearestNext.template?.type === 'immunization' ? 'pd-chip-imm' : 'pd-chip-anc'}`}>
                    {nearestNext.template?.type === 'immunization' ? 'Immunization' : 'Antenatal'}
                  </span>
                  {primaryNextIsOverdue && <span className="pd-chip pd-chip-danger">Overdue</span>}
                </div>
                <div className="pd-next-sub">
                  Scheduled {fmt(nearestNext.scheduled_date)} · {getDaysUntil(nearestNext.scheduled_date)}
                </div>
                {previousStageNote && (
                  <div className="pd-note-quote">
                    <span className="pd-note-k">
                      Note from {previousCompletedStage?.template?.stage_name || 'previous stage'}
                    </span>
                    {previousStageNote}
                  </div>
                )}
              </div>
            </div>
          )}

          {otherOverdueStages.slice(0, 2).map((stage) => {
            const isMissed = stage.status === 'missed';
            return (
              <div key={stage.id} className="pd-next-item is-danger">
                <div className="pd-next-badge"><AlertTriangle size={16} /></div>
                <div className="pd-next-main">
                  <div className="pd-next-title">
                    {stage.template?.stage_name}
                    <span className="pd-chip pd-chip-danger">{isMissed ? 'Missed' : 'Overdue'}</span>
                  </div>
                  <div className="pd-next-sub">
                    Scheduled {fmt(stage.scheduled_date)} · {isMissed ? 'Visit missed' : getDaysUntil(stage.scheduled_date)}
                  </div>
                </div>
              </div>
            );
          })}

          {isBoth && patient.delivery_date && (
            <div className="pd-next-item is-info">
              <div className="pd-next-badge"><Baby size={16} /></div>
              <div className="pd-next-main">
                <div className="pd-next-title">Postnatal handover</div>
                <div className="pd-next-sub">
                  Delivery recorded {fmt(patient.delivery_date)}
                  {patient.child_name ? ` · ${patient.child_name}` : ''}. Continue the child immunization schedule.
                </div>
              </div>
            </div>
          )}

          {!nearestNext && !attentionStages.length && !(isBoth && patient.delivery_date) && (
            <div className="pd-empty-inline">
              <CheckCircle size={16} />
              <span>All scheduled care visits are up to date.</span>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Care timeline & audit log ────────────────── */}
      <section className="pd-panel">
        <div className="pd-panel-head pd-records-head">
          <div className="pd-main-tabs" role="tablist" aria-label="Patient records">
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === 'stages'}
              className={`pd-main-tab${mainTab === 'stages' ? ' is-active' : ''}`}
              onClick={() => switchMainTab('stages')}
            >
              <Calendar size={12} /> Care timeline
              <span className="pd-tab-count">{displayStages.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === 'history'}
              className={`pd-main-tab${mainTab === 'history' ? ' is-active' : ''}`}
              onClick={() => switchMainTab('history')}
            >
              <History size={12} /> Audit log
              <span className="pd-tab-count">{historyTotal}</span>
            </button>
          </div>
          <button className="pd-action-icon-btn" onClick={load} title="Refresh stages">
            <RefreshCw size={14} />
          </button>
        </div>

        {mainTab === 'stages' ? (
          <>
            <div className="pd-filter-row">
              {hasBothTabs && (
                <>
                  <span className="pd-filter-label">Track</span>
                  {[
                    { value: 'all', label: 'All stages' },
                    { value: 'pregnancy', label: 'Pregnancy' },
                    { value: 'immunization', label: 'Immunization' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`pd-chipfilter${trackFilter === option.value ? ' is-active' : ''}`}
                      aria-pressed={trackFilter === option.value}
                      onClick={() => {
                        setTrackFilter(option.value);
                        if (option.value !== 'all') setStageTab(option.value);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </>
              )}
              <span className="pd-result-count">{displayStages.length} stages</span>
            </div>

            {displayStages.length === 0 ? (
              <div className="pd-empty-inline">
                <History size={18} />
                <span>No care stages found for this profile.</span>
              </div>
            ) : (
              <div className="pd-tl2">
                {displayStages.map((stage) => {
                  const statusInfo = stageStatus(stage);
                  const isVisited = stage.status === 'visited';
                  const isSkipped = stage.status === 'skipped';
                  const isActionable = ['pending', 'notified', 'missed'].includes(stage.status);
                  const isOverdue = isActionable && daysFromToday(stage.scheduled_date) < 0;
                  const isNextActive = nearestNext && nearestNext.id === stage.id;
                  const isDeliveryMilestone = stage.template?.stage_code === 'DELIVERY';
                  const isPregRow = stage.template?.type === 'pregnancy';
                  const readOnlyRow = isBoth && isPregRow;

                  return (
                    <article
                      key={stage.id}
                      className={`pd-tl2-row${isSkipped ? ' is-skipped' : ''}${isOverdue ? ' is-overdue' : ''}${isNextActive ? ' is-next' : ''}${stage.date_overridden && !isSkipped ? ' is-rescheduled' : ''}`}
                    >
                      <div className="pd-tl2-marker">
                        <span className={`pd-tl2-dot is-${statusInfo.key}`}>
                          {isVisited ? <CheckCircle size={14} /> : isSkipped ? <SkipForward size={12} /> : isDeliveryMilestone ? <Star size={13} /> : null}
                        </span>
                      </div>

                      <div className="pd-tl2-main">
                        <div className="pd-tl2-title-row">
                          <span className="pd-tl2-title">{stage.template?.stage_name}</span>
                        </div>
                      </div>

                      <div className="pd-tl2-meta">
                        <span className="pd-tl2-k">{stage.date_overridden && !isSkipped ? 'Rescheduled date' : 'Scheduled'}</span>
                        <span className={`pd-tl2-v${isOverdue ? ' is-overdue' : ''}`}>
                          {fmt(stage.scheduled_date)}
                        </span>
                      </div>

                      <div className="pd-tl2-meta">
                        <span className="pd-tl2-k">Visit date</span>
                        <span className={`pd-tl2-v${stage.actual_visit_date ? '' : ' is-muted'}`}>
                          {stage.actual_visit_date ? fmt(stage.actual_visit_date) : isSkipped ? 'Skipped' : 'Not yet'}
                        </span>
                      </div>

                      <div className="pd-tl2-status">
                        <span className={`pd-tl2-status-pill is-${statusInfo.key}`}>
                          <i /> {statusInfo.label}
                        </span>
                      </div>

                      <div className="pd-tl2-actions">
                        <button className="pd-linkbtn" onClick={() => setSelectedStage(stage)}>
                          View
                        </button>
                        {!readOnlyRow && isActionable && (
                          <>
                            {!isDeliveryMilestone && canReschedule && (
                              <button className="pd-linkbtn" onClick={() => setShowReschedule(stage)}>
                                Reschedule
                              </button>
                            )}
                            {canSkip && (
                              <button className="pd-linkbtn" onClick={() => setShowSkip(stage)}>
                                Skip
                              </button>
                            )}
                            {((isDeliveryMilestone && canRecordDelivery) || (!isDeliveryMilestone && canMarkVisit)) && (
                              <button
                                className="pd-linkbtn act-primary"
                                onClick={() => (isDeliveryMilestone ? setShowDelivery(true) : setShowCompleteStage(stage))}
                              >
                                {isDeliveryMilestone ? 'Record delivery' : 'Mark as visit'}
                              </button>
                            )}
                          </>
                        )}
                        {!readOnlyRow && isSkipped && canMarkVisit && (
                          <button className="pd-linkbtn act-primary" onClick={() => setShowCompleteStage(stage)}>
                            Record visit
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="pd-audit2">
            {historyLoading ? (
              <div className="pd-loading"><span className="spinner" /></div>
            ) : historyLog.length === 0 ? (
              <div className="pd-empty-inline">
                <History size={20} />
                <span>No audit events recorded for this patient yet.</span>
              </div>
            ) : (
              historyLog.map((evt) => {
                const EVENT_META = {
                  stage_visited:        { label: 'Visit completed',        cat: 'visit',  catLabel: 'Visit' },
                  stage_skipped:        { label: 'Stage skipped',          cat: 'system', catLabel: 'System' },
                  stage_rescheduled:    { label: 'Stage rescheduled',      cat: 'system', catLabel: 'System' },
                  edd_updated:          { label: 'EDD updated',            cat: 'record', catLabel: 'Record' },
                  delivery_recorded:    { label: 'Delivery recorded',      cat: 'record', catLabel: 'Record' },
                  hospital_transferred: { label: 'Hospital transfer',      cat: 'system', catLabel: 'System' },
                  patient_edited:       { label: 'Patient details edited', cat: 'system', catLabel: 'System' },
                  note_added:           { label: 'Note added',             cat: 'record', catLabel: 'Record' },
                };
                const meta = EVENT_META[evt.event_type] || { label: evt.event_type, cat: 'system', catLabel: 'System' };
                const d = new Date(evt.createdAt);
                const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                const data = evt.event_data || {};

                let description = '';
                if (evt.event_type === 'stage_visited')     description = data.stage_name ? `${data.stage_name}${data.visit_date ? ` on ${fmt(data.visit_date)}` : ''}` : '';
                if (evt.event_type === 'stage_skipped')     description = data.stage_name ? `${data.stage_name} — reason: "${data.reason || '—'}"` : '';
                if (evt.event_type === 'stage_rescheduled') {
                  const from = data.old_date ? `${fmt(data.old_date)} → ` : '';
                  const reason = data.reason ? ` · reason: "${data.reason}"` : '';
                  description = data.stage_name
                    ? `${data.stage_name} — ${from}${fmt(data.new_date)}${data.cascaded ? ` (+${data.cascaded} cascaded)` : ''}${reason}`
                    : '';
                }
                if (evt.event_type === 'edd_updated')       description = `${fmt(data.old_edd)} → ${fmt(data.new_edd)}${data.source ? ` (${data.source})` : ''}`;
                if (evt.event_type === 'delivery_recorded') description = `${data.child_name || 'Baby'} · DOB ${fmt(data.child_dob)}`;
                if (evt.event_type === 'hospital_transferred') description = `From hospital #${data.from_hospital_id} → #${data.to_hospital_id}`;
                if (evt.event_type === 'patient_edited')    description = data.fields_changed?.length ? `Fields updated: ${data.fields_changed.join(', ')}` : '';

                return (
                  <div key={evt.id} className="pd-audit2-row">
                    <div className="pd-audit2-when">
                      <span>{dateStr}</span>
                      <small>{timeStr}</small>
                    </div>
                    <div className="pd-audit2-main">
                      <div className="pd-audit2-action">
                        {meta.label}
                        <span className={`pd-audit2-cat cat-${meta.cat}`}>{meta.catLabel}</span>
                      </div>
                      {description && <p className="pd-audit2-detail">{description}</p>}
                      <div className="pd-audit2-meta">
                        {evt.performed_by_role && (
                          <>
                            <span>{evt.performed_by_role}</span>
                            <span className="sep">·</span>
                          </>
                        )}
                        <span>Patient ID #{patient.id}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {historyTotalPages > 1 && (
              <div className="ttd-pager pd-audit-pager">
                <span className="ttd-pager-status" style={{ marginRight: 'auto' }}>
                  Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal)} of {historyTotal}
                </span>
                <button
                  type="button"
                  className="ttd-pager-btn"
                  onClick={() => changeHistoryPage(historyPage - 1)}
                  disabled={historyLoading || historyPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="ttd-pager-status">Page {historyPage} of {historyTotalPages}</span>
                <button
                  type="button"
                  className="ttd-pager-btn"
                  onClick={() => changeHistoryPage(historyPage + 1)}
                  disabled={historyLoading || historyPage >= historyTotalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>


      {/* ── 4. Modals ────────────────────────────────────── */}
      {showEdd && canEdit && (
        <EddModal
          patient={patient}
          onClose={() => setShowEdd(false)}
          onSuccess={() => { setShowEdd(false); load(); }}
        />
      )}

      {showDelivery && canRecordDelivery && (
        <DeliveryModal
          patient={patient}
          onClose={() => setShowDelivery(false)}
          onSuccess={() => {
            setShowDelivery(false);
            setStageTab('immunization');
            load();
          }}
        />
      )}

      {showCompleteStage && canMarkVisit && (
        <CompleteStageModal
          stage={showCompleteStage}
          onClose={() => setShowCompleteStage(null)}
          onSuccess={() => { setShowCompleteStage(null); load(); }}
        />
      )}

      {showReschedule && canReschedule && (
        <RescheduleModal
          stage={showReschedule}
          onClose={() => setShowReschedule(null)}
          onSuccess={() => { setShowReschedule(null); load(); }}
        />
      )}

      {showSkip && canSkip && (
        <SkipModal
          stage={showSkip}
          onClose={() => setShowSkip(null)}
          onSuccess={() => { setShowSkip(null); load(); }}
        />
      )}

      {selectedStage && (
        <StageDetailsModal
          stage={selectedStage}
          onClose={() => setSelectedStage(null)}
          onOpenReschedule={s => setShowReschedule(s)}
          onOpenSkip={s => setShowSkip(s)}
          onOpenVisit={s => {
            if (s.template?.stage_code === 'DELIVERY') {
              setShowDelivery(true);
            } else {
              setShowCompleteStage(s);
            }
          }}
          canReschedule={canReschedule}
          canSkip={canSkip}
          canMarkVisit={canMarkVisit}
          canRecordDelivery={canRecordDelivery}
        />
      )}
    </div>
  );
}
