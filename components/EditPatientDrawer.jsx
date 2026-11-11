'use client';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Pencil,
  User,
  Phone,
  MapPin,
  Calendar,
  CalendarCheck,
  FileText,
  Baby,
  HeartPulse,
  Syringe,
  CheckCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';
import { normalizeWhatsappNumber } from '@/lib/utils/phone';

export default function EditPatientDrawer({ patient, onClose, onSuccess }) {
  const { user } = useAuthStore();
  const canEdit = hasUserPermission(user, 'patients.edit');
  const canDelete = hasUserPermission(user, 'patients.delete');
  const canToggleStatus = patient?.status === 'inactive' ? canEdit : canDelete;
  const [isClosing, setIsClosing] = useState(false);

  const isPregnant = patient?.patient_type === 'pregnant' || patient?.patient_type === 'both';
  const hasChild = patient?.patient_type === 'immunization' || patient?.patient_type === 'both';

  const [form, setForm] = useState({
    name:            patient?.name || '',
    whatsapp_number: patient?.whatsapp_number || '',
    age:             patient?.age ?? '',
    address:         patient?.address || '',
    notes:           patient?.notes || '',
    lmp_date:        patient?.lmp_date ? patient.lmp_date.split('T')[0] : '',
    edd:             patient?.edd ? patient.edd.split('T')[0] : '',
    edd_source:      patient?.edd_source || 'direct_entry',
    child_name:      patient?.child_name || '',
    child_gender:    patient?.child_gender || '',
    reason:          '',
  });

  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');

  // Smooth closing transition
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 220);
  }, [onClose]);

  // Lock background body scroll while drawer is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  if (!patient) return null;

  function set(field, val) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Patient name is required');
      return;
    }

    const normalizedPhone = normalizeWhatsappNumber(form.whatsapp_number);
    if (!normalizedPhone) {
      setError('Enter a valid 10-digit WhatsApp number');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name:            form.name.trim(),
        whatsapp_number: normalizedPhone,
        age:             form.age !== '' ? parseInt(form.age, 10) : null,
        address:         form.address.trim(),
        notes:           form.notes.trim(),
      };

      if (form.reason.trim()) payload.reason = form.reason.trim();

      if (isPregnant) {
        const originalLmp = patient.lmp_date ? String(patient.lmp_date).split('T')[0] : '';
        const originalEdd = patient.edd ? String(patient.edd).split('T')[0] : '';
        const lmpChanged = form.lmp_date !== originalLmp;
        const eddChanged = form.edd !== originalEdd;
        const sourceChanged = (form.edd_source || '') !== (patient.edd_source || '');

        if (lmpChanged) payload.lmp_date = form.lmp_date || null;
        if (sourceChanged) payload.edd_source = form.edd_source;

        // If LMP drives the EDD, let the backend recompute it. Do not send a
        // stale EDD value alongside the new LMP.
        if (lmpChanged && (payload.edd_source || patient.edd_source) === 'lmp_calculated') {
          delete payload.edd;
        } else if (eddChanged) {
          payload.edd = form.edd || null;
        }
      }

      if (hasChild) {
        if (form.child_name.trim() !== (patient.child_name || '')) {
          payload.child_name = form.child_name.trim() || null;
        }
        if ((form.child_gender || '') !== (patient.child_gender || '')) {
          payload.child_gender = form.child_gender || null;
        }
      }

      await api.patch(`/patients/${patient.id}`, payload);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update patient');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusToggle() {
    const nextStatus = patient.status === 'inactive' ? 'active' : 'inactive';
    const action = nextStatus === 'inactive' ? 'deactivate' : 'reactivate';
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to ${action} this patient?`)) {
      return;
    }

    setStatusLoading(true);
    setError('');
    try {
      await api.patch(`/patients/${patient.id}/status`, {
        status: nextStatus,
        reason: form.reason.trim() || `manual_${action}`,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${action} patient`);
    } finally {
      setStatusLoading(false);
    }
  }

  const typeTone = isPregnant
    ? 'is-anc'
    : patient.patient_type === 'both'
    ? 'is-both'
    : 'is-imm';
  const initials = (patient.name || 'P')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const typeLabel = isPregnant
    ? 'Pregnancy'
    : patient.patient_type === 'both'
    ? 'Pregnancy & Child'
    : 'Immunization';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`patient-drawer-backdrop${isClosing ? ' closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <aside
        className={`patient-drawer-panel${isClosing ? ' closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Patient Details"
      >
        {/* Drawer Header */}
        <div className="patient-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="rpm-header-icon-box">
              <Pencil size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 className="rpm-title" style={{ fontSize: '1.05rem', margin: 0 }}>
                  Edit Patient Details
                </h2>
                <span className={`drawer-type-badge ${typeTone}`}>
                  {isPregnant ? (
                    <HeartPulse size={10} />
                  ) : patient.patient_type === 'both' ? (
                    <Baby size={10} />
                  ) : (
                    <Syringe size={10} />
                  )}
                  {typeLabel}
                </span>
              </div>
              <p className="rpm-subtitle" style={{ margin: 0, marginTop: '2px' }}>
                Patient ID #{patient.id} · Slide-in editor
              </p>
            </div>
          </div>

          <button
            type="button"
            className="rpm-close-btn"
            onClick={handleClose}
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Container */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          {/* Scrollable Drawer Body */}
          <div className="patient-drawer-body">
            {/* Quick Patient Identity Strip */}
            <div className="drawer-patient-summary">
              <div className={`drawer-patient-avatar ${typeTone}`}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.925rem',
                    color: 'var(--ttd-ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {patient.name}
                </div>
                <div
                  style={{
                    fontSize: '0.765rem',
                    color: 'var(--ttd-muted)',
                    marginTop: '1px',
                  }}
                >
                  {patient.whatsapp_number || 'No contact number registered'}
                </div>
              </div>

              <span
                className={`patient-status-pill ${
                  patient.status === 'completed'
                    ? 'patient-status-completed'
                    : patient.status === 'active'
                    ? 'patient-status-active'
                    : 'patient-status-inactive'
                }`}
              >
                <span
                  className={
                    patient.status === 'completed'
                      ? 'patient-status-dot-completed'
                      : patient.status === 'active'
                      ? 'patient-status-dot-active'
                      : 'patient-status-dot-inactive'
                  }
                />
                {patient.status === 'completed'
                  ? 'Completed'
                  : patient.status === 'active'
                  ? 'Active'
                  : 'Inactive'}
              </span>
            </div>

            {/* Error Banner */}
            {error && <div className="rpm-error-banner">{error}</div>}

            {/* Section: Personal Info */}
            <div className="drawer-section-title">Personal Information</div>

            {/* Name + Age */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.75rem' }}>
              <div className="rpm-field">
                <label className="rpm-label">Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <User
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--ttd-muted)',
                    }}
                  />
                  <input
                    className="rpm-input"
                    style={{ paddingLeft: '2.25rem' }}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Patient full name"
                    required
                  />
                </div>
              </div>

              <div className="rpm-field">
                <label className="rpm-label">Age</label>
                <input
                  className="rpm-input"
                  type="number"
                  min="1"
                  max="120"
                  value={form.age}
                  onChange={(e) => set('age', e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div className="rpm-field">
              <label className="rpm-label">WhatsApp Contact</label>
              <div style={{ position: 'relative' }}>
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ttd-muted)',
                  }}
                />
                <input
                  className="rpm-input"
                  style={{ paddingLeft: '2.25rem' }}
                  value={form.whatsapp_number}
                  onChange={(e) => set('whatsapp_number', e.target.value)}
                  placeholder="10-digit mobile number"
                />
              </div>
            </div>

            {/* Address */}
            <div className="rpm-field">
              <label className="rpm-label">Residential Address</label>
              <div style={{ position: 'relative' }}>
                <MapPin
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '0.75rem',
                    color: 'var(--ttd-muted)',
                  }}
                />
                <textarea
                  className="rpm-input"
                  rows={2}
                  style={{
                    paddingLeft: '2.25rem',
                    paddingTop: '0.65rem',
                    resize: 'none',
                    height: 'auto',
                  }}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Village / Town / Area"
                />
              </div>
            </div>

            {/* Section: Pregnancy Details */}
            {isPregnant && (
              <>
                <div className="drawer-section-title">Pregnancy Timeline Parameters</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    padding: '0.85rem',
                    background: 'var(--ttd-surface-soft)',
                    borderRadius: '12px',
                    border: '1px solid var(--ttd-line)',
                  }}
                >
                  <div className="rpm-field">
                    <label
                      className="rpm-label"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Calendar size={12} color="var(--ttd-accent-ink)" /> LMP Date
                    </label>
                    <input
                      className="rpm-input"
                      type="date"
                      value={form.lmp_date}
                      onChange={(e) => set('lmp_date', e.target.value)}
                    />
                  </div>

                  <div className="rpm-field">
                    <label
                      className="rpm-label"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <CalendarCheck size={12} color="var(--ttd-accent-ink)" /> Expected Delivery (EDD)
                    </label>
                    <input
                      className="rpm-input"
                      type="date"
                      value={form.edd}
                      onChange={(e) => set('edd', e.target.value)}
                    />
                  </div>

                  <div className="rpm-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="rpm-label">EDD Calculation Method</label>
                    <select
                      className="rpm-input"
                      value={form.edd_source}
                      onChange={(e) => set('edd_source', e.target.value)}
                    >
                      <option value="lmp_calculated">LMP Calculated (+280 Days)</option>
                      <option value="direct_entry">Direct Manual Entry</option>
                      <option value="ultrasound">Ultrasound Scan Confirmation</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Section: Child Details */}
            {hasChild && (
              <>
                <div className="drawer-section-title">Child Information</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    padding: '0.85rem',
                    background: 'var(--ttd-surface-soft)',
                    borderRadius: '12px',
                    border: '1px solid var(--ttd-line)',
                  }}
                >
                  <div className="rpm-field">
                    <label
                      className="rpm-label"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Baby size={12} color="var(--ttd-accent-ink)" /> Child Name
                    </label>
                    <input
                      className="rpm-input"
                      value={form.child_name}
                      onChange={(e) => set('child_name', e.target.value)}
                      placeholder="Baby's full name"
                    />
                  </div>

                  <div className="rpm-field">
                    <label className="rpm-label">Child Gender</label>
                    <select
                      className="rpm-input"
                      value={form.child_gender}
                      onChange={(e) => set('child_gender', e.target.value)}
                    >
                      <option value="">Select gender</option>
                      <option value="male">Boy</option>
                      <option value="female">Girl</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Section: Audit reason */}
            <div className="drawer-section-title">Audit</div>
            <div className="rpm-field">
              <label className="rpm-label">Reason for change</label>
              <input
                className="rpm-input"
                value={form.reason}
                onChange={(e) => set('reason', e.target.value)}
                placeholder="e.g. Contact number correction, EDD revised after scan"
              />
            </div>

            {/* Section: Clinical Notes */}
            <div className="drawer-section-title">Clinical Records &amp; Notes</div>
            <div className="rpm-field">
              <div style={{ position: 'relative' }}>
                <FileText
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '0.75rem',
                    color: 'var(--ttd-muted)',
                  }}
                />
                <textarea
                  className="rpm-input"
                  rows={3}
                  style={{
                    paddingLeft: '2.25rem',
                    paddingTop: '0.65rem',
                    resize: 'none',
                    height: 'auto',
                  }}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Clinical observations, medical history, or visit reminders..."
                />
              </div>
            </div>
          </div>

          {/* Sticky Drawer Footer */}
          <div className="patient-drawer-footer">
            {canToggleStatus && (
              <button
                type="button"
                className="rpm-btn-cancel"
                onClick={handleStatusToggle}
                disabled={loading || statusLoading}
                style={{ color: patient.status === 'inactive' ? 'var(--ttd-accent-ink)' : 'var(--ttd-rose)' }}
              >
                {statusLoading
                  ? 'Updating...'
                  : patient.status === 'inactive'
                    ? 'Reactivate Patient'
                    : 'Deactivate Patient'}
              </button>
            )}
            <button
              type="button"
              className="rpm-btn-cancel"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            {canEdit && (
              <button
                type="submit"
                className="rpm-btn-submit"
                disabled={loading}
                style={{ minWidth: 130, justifyContent: 'center' }}
              >
                {loading ? (
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                ) : (
                  <>
                    <CheckCircle size={14} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  );
}
