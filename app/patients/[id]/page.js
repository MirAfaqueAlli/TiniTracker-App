'use client';
import { useEffect, useState } from 'react';
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
  ChevronRight,
  ShieldCheck,
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
import { useAuthStore } from '@/store/authStore';

const STATUS_CONFIG = {
  pending:  { label: 'Scheduled', badge: 'badge-pending',  dot: '#0284c7', bg: '#eff6ff', color: '#0284c7' },
  notified: { label: 'Notified',  badge: 'badge-notified', dot: '#7e22ce', bg: '#f3e8ff', color: '#7e22ce' },
  visited:  { label: 'Visited',   badge: 'badge-visited',  dot: '#10b981', bg: '#ecfdf5', color: '#059669' },
  skipped:  { label: 'Skipped',   badge: 'badge-skipped',  dot: '#94a3b8', bg: '#f1f5f9', color: '#64748b' },
  missed:   { label: 'Missed',    badge: 'badge-missed',   dot: '#e11d48', bg: '#fff1f2', color: '#e11d48' },
};

const AVATAR_PALETTES = [
  { bg: '#ffe4e6', color: '#be185d' }, // rose
  { bg: '#ccfbf1', color: '#0f766e' }, // teal
  { bg: '#e0f2fe', color: '#0369a1' }, // sky
  { bg: '#fef9c3', color: '#854d0e' }, // amber
  { bg: '#f3e8ff', color: '#7e22ce' }, // purple
  { bg: '#dcfce7', color: '#15803d' }, // green
  { bg: '#ffedd5', color: '#9a3412' }, // orange
];

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

function fmt(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function formatRescheduledTag(reason) {
  if (!reason) return null;
  const match = reason.match(/^(Cascaded\s*\([^)]+\)\s*from\s*[^:]+)/i);
  return match ? match[1].trim() : null;
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

function getGestationalOrAgeTag(patient, isDrPreg = false) {
  if (isDrPreg && patient.patient_type === 'both') {
    return 'Pregnancy Care Completed';
  }
  if (patient.patient_type === 'pregnant') {
    let weeks = null;
    if (patient.edd) {
      const eddDate = new Date(patient.edd);
      const diffDays = Math.round((eddDate.getTime() - Date.now()) / (1000 * 3600 * 24));
      weeks = Math.max(1, Math.min(42, Math.round(40 - diffDays / 7)));
    } else if (patient.lmp_date) {
      const lmpDate = new Date(patient.lmp_date);
      const diffDays = Math.round((Date.now() - lmpDate.getTime()) / (1000 * 3600 * 24));
      weeks = Math.max(1, Math.min(42, Math.round(diffDays / 7)));
    }

    if (!weeks) return 'Pregnancy Care';
    let trimester;
    if (weeks >= 28)      trimester = 'Trimester 3';
    else if (weeks >= 13) trimester = 'Trimester 2';
    else                  trimester = 'Trimester 1';

    return `${trimester} · ${weeks} Weeks Pregnant`;
  } else {
    return 'Child · Immunization Care';
  }
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
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
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Update EDD</div>
              <div style={{ fontSize: '0.765rem', color: '#64748b' }}>Revise Expected Due Date calculation</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', fontSize: '0.785rem', color: '#be123c' }}>
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
    notes:         '',
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
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Record Delivery</div>
              <div style={{ fontSize: '0.765rem', color: '#64748b' }}>Transition to postpartum & child immunization timeline</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', fontSize: '0.785rem', color: '#be123c' }}>
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

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00857c', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem' }}>
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
            <textarea className="rpm-input" rows={2} placeholder="Any delivery complications or observations..." value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
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
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.put(`/patients/${stage.patient_id}/stages/${stage.id}/visit`, {
        actual_visit_date: visitDate,
        notes: nextNotes.trim() || null,
        next_stage_notes: nextNotes.trim() || null,
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
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Mark Visited</div>
              <div style={{ fontSize: '0.765rem', color: '#64748b' }}>{stage.template?.stage_name}</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', fontSize: '0.785rem', color: '#be123c' }}>
              {error}
            </div>
          )}
          <div className="rpm-field">
            <label className="rpm-label">Visit Date *</label>
            <input className="rpm-input" type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} required />
          </div>
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
            <button type="submit" className="pd-btn-primary" disabled={loading}>
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
            <div className="pd-card-icon-box" style={{ background: '#e0f2fe', color: '#0284c7' }}>
              <Calendar size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Reschedule Stage</div>
              <div style={{ fontSize: '0.765rem', color: '#64748b' }}>{stage.template?.stage_name}</div>
            </div>
          </div>
          <button className="rpm-close-btn" onClick={onClose} title="Close" style={{ width: 30, height: 30 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', fontSize: '0.785rem', color: '#be123c' }}>
              {error}
            </div>
          )}

          <div style={{ padding: '0.75rem 0.95rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.785rem', color: '#334155' }}>
            Currently scheduled for: <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(stage.scheduled_date)}</span>
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
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
              <input
                type="checkbox"
                checked={cascade}
                onChange={e => setCascade(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#00857c' }}
              />
              Reschedule subsequent stages accordingly
            </label>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '1.6rem' }}>
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
            <div className="pd-card-icon-box" style={{ background: '#fff1f2', color: '#e11d48' }}>
              <SkipForward size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Skip Stage</div>
              <div style={{ fontSize: '0.765rem', color: '#64748b' }}>{stage.template?.stage_name}</div>
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
            background: '#fffbeb',
            border: '1px solid #fde68a',
            fontSize: '0.785rem',
            color: '#92400e',
            lineHeight: 1.4,
          }}>
            ⚠️ Skipping this stage will mark it as skipped in the patient history. A mandatory clinical or administrative reason is required for compliance.
          </div>

          {error && (
            <div style={{ padding: '0.65rem 0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', fontSize: '0.785rem', color: '#be123c' }}>
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
              style={{ background: '#e11d48', borderColor: '#e11d48' }}
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
function StageDetailsModal({ stage, onClose, onOpenReschedule, onOpenSkip, onOpenVisit }) {
  if (!stage) return null;
  const cfg = STATUS_CONFIG[stage.status] || STATUS_CONFIG.pending;
  const isSkipped = stage.status === 'skipped';
  const isVisited = stage.status === 'visited';
  const isActionable = ['pending', 'notified'].includes(stage.status);

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
                color: '#0f172a',
                textDecoration: isSkipped ? 'line-through' : 'none',
                opacity: isSkipped ? 0.7 : 1,
              }}>
                {stage.template?.stage_name}
              </div>
              <div style={{ fontSize: '0.745rem', color: '#64748b', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
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
            background: '#f8fafc',
            padding: '0.85rem 1rem',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Status</div>
              <div style={{ marginTop: '0.2rem' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '999px',
                  background: cfg.bg,
                  color: cfg.color,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot }} />
                  {cfg.label}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Scheduled Date</div>
              <div style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0f172a',
                marginTop: '0.2rem',
                textDecoration: isSkipped ? 'line-through' : 'none'
              }}>
                {fmt(stage.scheduled_date)}
              </div>
            </div>
            {stage.actual_visit_date && (
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Actual Visit Date</div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#10b981', marginTop: '0.2rem' }}>
                  {fmt(stage.actual_visit_date)}
                </div>
              </div>
            )}
            {stage.date_overridden && (
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Reschedule Notice</div>
                <div style={{ fontSize: '0.765rem', fontWeight: 600, color: '#0284c7', marginTop: '0.2rem' }}>
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
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              fontSize: '0.785rem',
              color: '#0369a1'
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
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              fontSize: '0.785rem',
              color: '#be123c'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>⏭️ Medically Skipped Reason:</div>
              {stage.skip_reason || 'Staff Decision'}
            </div>
          )}

          {/* Visited Notes Callout */}
          {isVisited && stage.notes && (
            <div style={{
              padding: '0.75rem 0.95rem',
              borderRadius: '12px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              fontSize: '0.785rem',
              color: '#065f46'
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
              color: '#0f172a',
              marginBottom: '0.45rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}>
              <FileText size={14} style={{ color: '#00857c' }} />
              Clinical Protocol & Required Tests:
            </div>
            {descriptionLines.length > 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                padding: '0.85rem 1rem',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: '0.785rem',
              }}>
                {descriptionLines.map((line, idx) => {
                  const isHeader = line.toUpperCase() === line && line.endsWith(':');
                  if (isHeader) {
                    return (
                      <div key={idx} style={{ fontWeight: 700, color: '#00857c', marginTop: idx > 0 ? '0.35rem' : 0 }}>
                        {line}
                      </div>
                    );
                  }
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#475569' }}>
                      <span style={{ color: '#00857c', flexShrink: 0, marginTop: '2px', fontWeight: 700 }}>•</span>
                      <span>{line.replace(/^[•\-*]\s*/, '')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '0.765rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Standard clinical guidelines apply for this stage.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
          <div>
            {isActionable && (
              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <button
                  type="button"
                  className="pd-action-btn-secondary"
                  onClick={() => { onClose(); onOpenReschedule(stage); }}
                >
                  <Calendar size={13} /> Reschedule
                </button>
                <button
                  type="button"
                  className="pd-action-btn-secondary"
                  onClick={() => { onClose(); onOpenSkip(stage); }}
                  style={{ color: '#e11d48' }}
                >
                  <SkipForward size={13} /> Skip
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="pd-btn-secondary" onClick={onClose}>Close</button>
            {isActionable && (
              <button
                type="button"
                className="pd-btn-primary"
                onClick={() => { onClose(); onOpenVisit(stage); }}
              >
                <CheckCircle size={14} />
                {stage.template?.stage_code === 'DELIVERY' ? 'Record Delivery' : 'Mark Visited'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const { user } = useAuthStore();
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
  const [mainTab,  setMainTab]    = useState('stages');   // 'stages' | 'history'
  const [historyLog, setHistoryLog] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showCompleteStage, setShowCompleteStage] = useState(null);
  const [showReschedule,    setShowReschedule]    = useState(null);
  const [showSkip,          setShowSkip]          = useState(null);
  const [selectedStage,     setSelectedStage]     = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get(`/patients/${id}/stages`),
      ]);
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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/patients/${id}/history`);
      setHistoryLog(res.data.history || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  function switchMainTab(tab) {
    setMainTab(tab);
    if (tab === 'history' && historyLog.length === 0) loadHistory();
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

  // Previous completed stage (last visited stage) and its notes
  const visitedStages = relevantStages.filter(s => s.status === 'visited');
  const previousCompletedStage = visitedStages.length > 0 ? visitedStages[visitedStages.length - 1] : null;
  const previousStageNote = previousCompletedStage?.notes?.trim();

  // Determine avatar colors deterministically
  const avatarPalette = AVATAR_PALETTES[(patient.id || 0) % AVATAR_PALETTES.length];
  const initials = getPatientInitials(patient.name);

  return (
    <div className="pd-container">
      {/* ── 1. Top Header Bar ──────────────────────────── */}
      <div className="pd-header">
        <div className="pd-header-left">
          <Link href="/patients" className="pd-back-btn" title="Back to Patients">
            <ArrowLeft size={17} />
          </Link>

          <div className="pd-avatar-box" style={{ background: avatarPalette.bg, color: avatarPalette.color }}>
            {initials}
          </div>

          <div className="pd-patient-title-group">
            <div className="pd-patient-name-row">
              <span className="pd-patient-name">{patient.name}</span>

              <span className="pd-stage-pill">
                {getGestationalOrAgeTag(patient, isDrPreg)}
              </span>
            </div>
          </div>
        </div>

        <div className="pd-header-actions">
          {!isBoth && patient.patient_type === 'pregnant' && patient.status !== 'completed' && !isDrImm && (
            <>
              <button className="pd-btn-secondary" onClick={() => setShowEdd(true)}>
                <Calendar size={14} style={{ color: '#00857c' }} /> Update EDD
              </button>
              <button className="pd-btn-primary" onClick={() => setShowDelivery(true)}>
                <Baby size={14} /> Record Delivery
              </button>
            </>
          )}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.785rem',
            fontWeight: 700,
            textTransform: 'capitalize',
            background: isBothForPreg || patient.status === 'completed' ? '#f0fdf4' : patient.status === 'active' ? '#ecfdf5' : '#f1f5f9',
            color: isBothForPreg || patient.status === 'completed' ? '#166534' : patient.status === 'active' ? '#059669' : '#64748b',
            border: `1px solid ${isBothForPreg || patient.status === 'completed' ? '#bbf7d0' : patient.status === 'active' ? '#a7f3d0' : '#cbd5e1'}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isBothForPreg || patient.status === 'completed' ? '#22c55e' : patient.status === 'active' ? '#10b981' : '#94a3b8' }} />
            {isBothForPreg || patient.status === 'completed' ? 'Completed' : patient.status}
          </span>
        </div>
      </div>

      {/* ── 2. Top Info & Progress Grid ────────────────── */}
      <div className="pd-top-grid">
        {/* Left: Patient Information */}
        <div className="pd-card">
          <div className="pd-card-header">
            <div className="pd-card-header-title">
              <div className="pd-card-icon-box">
                <User size={16} />
              </div>
              <span>Patient Information</span>
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              background: isBothForPreg ? '#f0fdf4' : isBoth ? '#fef3c7' : isPregnant ? '#ffe4e6' : '#e0f2fe',
              color: isBothForPreg ? '#166534' : isBoth ? '#b45309' : isPregnant ? '#be185d' : '#0369a1',
            }}>
              {isBothForPreg ? 'Pregnancy Care (Completed)' : isBoth ? 'Pregnancy + Immunization' : isPregnant ? 'Pregnant Mother' : 'Child Immunization'}
            </span>
          </div>

          <div className="pd-card-body">
            <div className="pd-info-grid">
              <div className="pd-info-item">
                <span className="pd-info-label">Age</span>
                <span className="pd-info-value">{patient.age ? `${patient.age} yrs` : '—'}</span>
              </div>

              <div className="pd-info-item">
                <span className="pd-info-label">EDD Source / Mode</span>
                <span className="pd-info-value">
                  {patient.edd_source
                    ? patient.edd_source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    : isPregnant
                      ? 'Ultrasound Scan'
                      : '—'}
                </span>
              </div>

              <div className="pd-info-item">
                <span className="pd-info-label">Address</span>
                <span className="pd-info-value">{patient.address || '—'}</span>
              </div>

              <div className="pd-info-item">
                <span className="pd-info-label">Care Category</span>
                <span className="pd-info-value">
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '999px',
                    background: '#ecfdf5',
                    color: '#059669',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}>
                    <ShieldCheck size={11} /> Normal / Low Risk
                  </span>
                </span>
              </div>

              <div className="pd-info-item">
                <span className="pd-info-label">{isPregnant ? 'Expected Due Date (EDD)' : 'Child Date of Birth'}</span>
                <span className="pd-info-value" style={{ color: '#00857c', fontWeight: 700 }}>
                  {isBoth
                    ? <>{fmt(patient.edd)} <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>(EDD)</span></>  
                    : fmt(isPregnant ? patient.edd : patient.child_dob)}
                </span>
              </div>

              <div className="pd-info-item">
                <span className="pd-info-label">{isPregnant ? 'LMP Date' : 'Child Name / Gender'}</span>
                <span className="pd-info-value">
                  {isPregnant
                    ? fmt(patient.lmp_date)
                    : `${patient.child_name || 'Baby'} · ${patient.child_gender || '—'}`}
                </span>
              </div>

              {isBoth && (
                <div className="pd-info-item">
                  <span className="pd-info-label">Child Date of Birth</span>
                  <span className="pd-info-value" style={{ color: '#0369a1', fontWeight: 700 }}>
                    {fmt(patient.child_dob)}{patient.child_name ? ` — ${patient.child_name}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Clinical Note Callout — Only show previous completed stage's note if present */}
            {previousStageNote && (
              <div className="pd-clinical-note-banner">
                <FileText size={15} style={{ flexShrink: 0, marginTop: '2px', color: '#00857c' }} />
                <div>
                  <span style={{ fontWeight: 700 }}>
                    Clinical Note ({previousCompletedStage?.template?.stage_name || 'Previous Stage'}):{' '}
                  </span>
                  <span>{previousStageNote}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Care Journey Progress */}
        <div className="pd-card">
          <div className="pd-card-header">
            <div className="pd-card-header-title">
              <div className="pd-card-icon-box">
                <TrendingUp size={16} />
              </div>
              <span>Care Journey Progress</span>
            </div>
            <span style={{
              fontSize: '0.785rem',
              fontWeight: 700,
              color: '#00857c',
              background: '#e6f7f5',
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
            }}>
              {progressPercent}% Done
            </span>
          </div>

          <div className="pd-card-body">
            <div>
              <div className="pd-progress-headline">
                <span>{visitedCount} of {totalCount} Checkups Completed</span>
                <span style={{ color: '#64748b', fontSize: '0.8125rem', fontWeight: 600 }}>{progressPercent}%</span>
              </div>

              <div className="pd-progress-track">
                <div className="pd-progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="pd-breakdown-row">
                <div className="pd-breakdown-item">
                  <div className="pd-dot" style={{ background: '#10b981' }} />
                  <span><strong style={{ color: '#0f172a' }}>{visitedCount}</strong> Visited</span>
                </div>
                <div className="pd-breakdown-item">
                  <div className="pd-dot" style={{ background: '#0284c7' }} />
                  <span><strong style={{ color: '#0f172a' }}>{upcomingCount}</strong> Upcoming</span>
                </div>
                <div className="pd-breakdown-item">
                  <div className="pd-dot" style={{ background: '#e11d48' }} />
                  <span><strong style={{ color: '#0f172a' }}>{missedOrSkippedCount}</strong> Missed / Skipped</span>
                </div>
              </div>
            </div>

            {/* Next Appointment Spotlight Banner */}
            {nextAppointment ? (() => {
              const fullName = nextAppointment.template?.stage_name || '';
              // Split "10 Weeks — DTwP-2, OPV-2, ..." into bracket + vaccines
              const dashIdx = fullName.indexOf('—');
              const bracket  = dashIdx > -1 ? fullName.slice(0, dashIdx).trim() : fullName;
              const vaccineStr = dashIdx > -1 ? fullName.slice(dashIdx + 1).trim() : '';
              const vaccines = vaccineStr ? vaccineStr.split(',').map(v => v.trim()).filter(Boolean) : [];
              const showVaccines = vaccines.slice(0, 3);
              const extraCount  = vaccines.length - showVaccines.length;

              return (
                <div
                  className="pd-next-appointment-spotlight"
                  onClick={() => setSelectedStage(nextAppointment)}
                  title="Click to view stage details"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '10px',
                      background: '#e6f7f5', color: '#00857c',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Calendar size={18} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Next Appointment
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                        {bracket || fullName}
                      </div>
                      {showVaccines.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                          {showVaccines.map((v, i) => (
                            <span key={i} style={{
                              fontSize: '0.65rem', fontWeight: 600,
                              padding: '0.1rem 0.45rem', borderRadius: '999px',
                              background: '#f0fdf9', color: '#0d9488',
                              border: '1px solid #99f6e4',
                            }}>{v}</span>
                          ))}
                          {extraCount > 0 && (
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 600,
                              padding: '0.1rem 0.45rem', borderRadius: '999px',
                              background: '#f1f5f9', color: '#64748b',
                              border: '1px solid #e2e8f0',
                            }}>+{extraCount} more</span>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: '0.735rem', color: '#00857c', fontWeight: 600, marginTop: '0.3rem' }}>
                        {fmt(nextAppointment.scheduled_date)} · {getDaysUntil(nextAppointment.scheduled_date)}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
                </div>
              );
            })() : (
              <div style={{
                marginTop: 'auto',
                padding: '0.85rem 1rem',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: '0.8125rem',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <CheckCircle size={16} style={{ color: '#10b981' }} />
                <span>All scheduled care visits are up to date.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Care Stages & Appointment Timeline ─────────── */}
      <div className="pd-card">
        <div className="pd-timeline-header">
          <div className="pd-card-header-title">
            <div className="pd-card-icon-box">
              <Calendar size={16} />
            </div>
            <span>Care Stages & Appointment Timeline</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Main tab: Stages | Audit Log */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#f1f5f9', borderRadius: '10px', padding: '0.2rem' }}>
              <button
                onClick={() => switchMainTab('stages')}
                style={{
                  padding: '0.28rem 0.75rem', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 600,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                  background: mainTab === 'stages' ? '#fff' : 'transparent',
                  color:      mainTab === 'stages' ? '#0f172a' : '#64748b',
                  boxShadow:  mainTab === 'stages' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <Calendar size={12} /> Stages
              </button>
              <button
                onClick={() => switchMainTab('history')}
                style={{
                  padding: '0.28rem 0.75rem', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 600,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                  background: mainTab === 'history' ? '#fff' : 'transparent',
                  color:      mainTab === 'history' ? '#0f172a' : '#64748b',
                  boxShadow:  mainTab === 'history' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <History size={12} /> Audit Log
              </button>
            </div>

            {/* Tabs for Pregnancy vs Child Immunization — show whenever patient has both */}
            {hasBothTabs && (
              <div className="pd-tabs">
                <button
                  className={`pd-tab-btn ${stageTab === 'pregnancy' ? 'active' : ''}`}
                  onClick={() => setStageTab('pregnancy')}
                >
                  <span>Pregnancy History</span>
                  <span className="pd-tab-count">{pregnancyStages.length}</span>
                </button>
                <button
                  className={`pd-tab-btn ${stageTab === 'immunization' ? 'active' : ''}`}
                  onClick={() => setStageTab('immunization')}
                >
                  <span>Child Immunization</span>
                  <span className="pd-tab-count">{immunizationStages.length}</span>
                </button>
              </div>
            )}

            {/* Read-only banner when viewing pregnancy history of a completed patient */}
            {isPregHistoryTab && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.72rem', fontWeight: 600,
                padding: '0.2rem 0.65rem', borderRadius: '999px',
                background: '#f0fdf4', color: '#166534',
                border: '1px solid #bbf7d0',
              }}>
                <CheckCircle size={11} /> Pregnancy care completed · Read-only
              </span>
            )}

            <button className="pd-action-icon-btn" onClick={load} title="Refresh Stages">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Timeline Table — only visible on Stages tab */}
        {mainTab === 'stages' && (activeStages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94a3b8', fontSize: '0.84rem' }}>
            No care stages found for this profile.
          </div>
        ) : (
          <div className="pd-tl-table">
            {/* Column Header Row */}
            <div className="pd-tl-header-row">
              <div className="pd-tl-col-num">#</div>
              <div className="pd-tl-col-stage">Stage / Visit</div>
              <div className="pd-tl-col-date">Scheduled Date</div>
              <div className="pd-tl-col-status">Status</div>
              <div className="pd-tl-col-visit">Visit Date</div>
              <div className="pd-tl-col-actions">Actions</div>
            </div>

            {/* Data Rows */}
            {activeStages.map((stage, i) => {
              const cfg = STATUS_CONFIG[stage.status] || STATUS_CONFIG.pending;
              const isVisited = stage.status === 'visited';
              const isSkipped = stage.status === 'skipped';
              const isActionable = ['pending', 'notified'].includes(stage.status);
              const isNextActive = nextAppointment && nextAppointment.id === stage.id;
              const isDeliveryMilestone = stage.template?.stage_code === 'DELIVERY';

              return (
                <div
                  key={stage.id}
                  className={`pd-tl-row ${isNextActive ? 'pd-tl-row-active' : ''}`}
                >
                  {/* # — Step Circle */}
                  <div className="pd-tl-col-num">
                    <div
                      className={`pd-step-circle ${
                        isVisited
                          ? 'visited'
                          : isNextActive
                          ? 'active'
                          : isDeliveryMilestone
                          ? 'milestone'
                          : isSkipped
                          ? 'skipped'
                          : 'scheduled'
                      }`}
                    >
                      {isVisited ? (
                        <CheckCircle size={15} />
                      ) : isDeliveryMilestone ? (
                        <Star size={15} />
                      ) : isSkipped ? (
                        <SkipForward size={13} />
                      ) : (
                        i + 1
                      )}
                    </div>
                  </div>

                  {/* Stage / Visit Name */}
                  <div className="pd-tl-col-stage">
                    <span
                      style={{
                        fontWeight: isNextActive ? 700 : 500,
                        color: isSkipped ? '#94a3b8' : isNextActive ? '#00857c' : '#0f172a',
                        textDecoration: isSkipped ? 'line-through' : 'none',
                        fontSize: '0.875rem',
                      }}
                    >
                      {stage.template?.stage_name}
                    </span>
                    {stage.date_overridden && !isSkipped && (
                      <span className="pd-tl-reschedule-tag">Rescheduled</span>
                    )}
                  </div>

                  {/* Scheduled Date */}
                  <div className="pd-tl-col-date">
                    <span style={{ fontSize: '0.84rem', color: isNextActive ? '#0f172a' : '#475569', fontWeight: isNextActive ? 600 : 400 }}>
                      {fmt(stage.scheduled_date)}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="pd-tl-col-status">
                    {stage.status && stage.status !== 'pending' || isNextActive ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '999px',
                        background: cfg.bg,
                        color: cfg.color,
                        fontSize: '0.73rem',
                        fontWeight: 600,
                      }}>
                        {cfg.label}
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '999px',
                        background: cfg.bg,
                        color: cfg.color,
                        fontSize: '0.73rem',
                        fontWeight: 600,
                      }}>
                        {cfg.label}
                      </span>
                    )}
                  </div>

                  {/* Visit Date */}
                  <div className="pd-tl-col-visit">
                    {stage.actual_visit_date ? (
                      <span style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: 500 }}>
                        {fmt(stage.actual_visit_date)}
                      </span>
                    ) : (
                      <span className="pd-tl-dash">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pd-tl-col-actions" onClick={e => e.stopPropagation()}>
                    {/* Pregnancy History tab is always read-only for 'both' patients */}
                    {isPregHistoryTab ? (
                      <div className="pd-stage-actions">
                        <span style={{
                          fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', paddingLeft: '0.25rem'
                        }}>History</span>
                        <button
                          className="pd-action-icon-btn"
                          title="View Stage Details"
                          onClick={() => setSelectedStage(stage)}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    ) : isActionable ? (
                      <div className="pd-stage-actions">
                        <button
                          className="pd-action-btn-primary"
                          title={isDeliveryMilestone ? 'Record Delivery' : 'Mark Visited'}
                          onClick={() => {
                            if (isDeliveryMilestone) {
                              setShowDelivery(true);
                            } else {
                              setShowCompleteStage(stage);
                            }
                          }}
                          disabled={marking === stage.id}
                        >
                          {marking === stage.id ? (
                            <span className="spinner" style={{ width: 12, height: 12 }} />
                          ) : (
                            <CheckCircle size={13} />
                          )}
                          <span>{isDeliveryMilestone ? 'Record Delivery' : 'Mark Visited'}</span>
                        </button>

                        <button
                          className="pd-action-icon-btn"
                          title="Reschedule Stage"
                          onClick={() => setShowReschedule(stage)}
                        >
                          <Calendar size={14} style={{ color: '#0284c7' }} />
                        </button>

                        <button
                          className="pd-action-icon-btn danger"
                          title="Skip Stage"
                          onClick={() => setShowSkip(stage)}
                        >
                          <SkipForward size={14} />
                        </button>

                        <button
                          className="pd-action-icon-btn"
                          title="View Stage Details"
                          onClick={() => setSelectedStage(stage)}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="pd-stage-actions">
                        <span className="pd-tl-dash">—</span>
                        <button
                          className="pd-action-icon-btn"
                          title="View Stage Details"
                          onClick={() => setSelectedStage(stage)}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* ── History / Audit Log Panel ── */}
        {mainTab === 'history' && (
          <div style={{ padding: '0.5rem 0' }}>
            {historyLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <div className="spinner" />
              </div>
            ) : historyLog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                <History size={36} style={{ marginBottom: '0.65rem', opacity: 0.4 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>No audit events yet</div>
                <div style={{ fontSize: '0.775rem', marginTop: '0.25rem' }}>Events are recorded when stages are visited, skipped, EDD is updated, delivery is recorded, or patient details are edited.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {historyLog.map((evt, idx) => {
                  const EVENT_META = {
                    stage_visited:       { label: 'Stage Visited',       icon: CheckCircle,     color: '#10b981', bg: '#ecfdf5' },
                    stage_skipped:       { label: 'Stage Skipped',       icon: SkipForward,     color: '#64748b', bg: '#f1f5f9' },
                    stage_rescheduled:   { label: 'Stage Rescheduled',   icon: Calendar,        color: '#0284c7', bg: '#eff6ff' },
                    edd_updated:         { label: 'EDD Updated',         icon: RefreshCw,       color: '#7e22ce', bg: '#f3e8ff' },
                    delivery_recorded:   { label: 'Delivery Recorded',   icon: Baby,            color: '#be185d', bg: '#ffe4e6' },
                    hospital_transferred:{ label: 'Hospital Transfer',   icon: ArrowRightLeft,  color: '#b45309', bg: '#fef3c7' },
                    patient_edited:      { label: 'Patient Details Edited',icon: Pencil,         color: '#475569', bg: '#f8fafc' },
                    note_added:          { label: 'Note Added',          icon: StickyNote,      color: '#0891b2', bg: '#ecfeff' },
                  };
                  const meta = EVENT_META[evt.event_type] || { label: evt.event_type, icon: FileText, color: '#64748b', bg: '#f1f5f9' };
                  const IconComp = meta.icon;
                  const d = new Date(evt.createdAt);
                  const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                  const data = evt.event_data || {};

                  // Build a human-readable description from event_data
                  let description = '';
                  if (evt.event_type === 'stage_visited')     description = data.stage_name ? `${data.stage_name}${data.visit_date ? ` on ${new Date(data.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}` : '';
                  if (evt.event_type === 'stage_skipped')     description = data.stage_name ? `${data.stage_name} — reason: "${data.reason || '—'}"` : '';
                  if (evt.event_type === 'stage_rescheduled') description = data.stage_name ? `${data.stage_name} → ${data.new_date || ''}${data.cascaded ? ` (+${data.cascaded} cascaded)` : ''}` : '';
                  if (evt.event_type === 'edd_updated')       description = `${data.old_edd || '?'} → ${data.new_edd || '?'} (${data.source || ''})`;
                  if (evt.event_type === 'delivery_recorded') description = `${data.child_name || 'Baby'} · DOB ${data.child_dob || '—'}`;
                  if (evt.event_type === 'hospital_transferred') description = `From hospital #${data.from_hospital_id} → #${data.to_hospital_id}`;
                  if (evt.event_type === 'patient_edited')    description = data.fields_changed?.length ? `Fields updated: ${data.fields_changed.join(', ')}` : '';

                  return (
                    <div key={evt.id} style={{
                      display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
                      padding: '0.9rem 0.5rem',
                      borderBottom: idx < historyLog.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}>
                      {/* Icon */}
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: meta.bg, color: meta.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <IconComp size={16} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{meta.label}</span>
                          {evt.performed_by_role && (
                            <span style={{
                              fontSize: '0.675rem', fontWeight: 600, padding: '0.1rem 0.5rem',
                              borderRadius: '999px', background: '#f1f5f9', color: '#475569',
                            }}>{evt.performed_by_role}</span>
                          )}
                        </div>
                        {description && (
                          <div style={{ fontSize: '0.775rem', color: '#475569', marginTop: '0.15rem', wordBreak: 'break-word' }}>
                            {description}
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 500 }}>{dateStr}</div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{timeStr}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Modals ────────────────────────────────────── */}
      {showEdd && (
        <EddModal
          patient={patient}
          onClose={() => setShowEdd(false)}
          onSuccess={() => { setShowEdd(false); load(); }}
        />
      )}

      {showDelivery && (
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

      {showCompleteStage && (
        <CompleteStageModal
          stage={showCompleteStage}
          onClose={() => setShowCompleteStage(null)}
          onSuccess={() => { setShowCompleteStage(null); load(); }}
        />
      )}

      {showReschedule && (
        <RescheduleModal
          stage={showReschedule}
          onClose={() => setShowReschedule(null)}
          onSuccess={() => { setShowReschedule(null); load(); }}
        />
      )}

      {showSkip && (
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
        />
      )}
    </div>
  );
}
