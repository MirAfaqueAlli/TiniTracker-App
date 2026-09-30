'use client';
import { useState, useEffect, useCallback } from 'react';
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

const AVATAR_PALETTES = [
  { bg: '#ffe4e6', color: '#be185d' },
  { bg: '#ccfbf1', color: '#0f766e' },
  { bg: '#e0f2fe', color: '#0369a1' },
  { bg: '#fef9c3', color: '#854d0e' },
  { bg: '#f3e8ff', color: '#7e22ce' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#ffedd5', color: '#9a3412' },
];

export default function EditPatientDrawer({ patient, onClose, onSuccess }) {
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
  });

  const [loading, setLoading] = useState(false);
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

    setLoading(true);
    try {
      const payload = {
        name:            form.name.trim(),
        whatsapp_number: form.whatsapp_number.trim(),
        age:             form.age !== '' ? parseInt(form.age, 10) : null,
        address:         form.address.trim(),
        notes:           form.notes.trim(),
        lmp_date:        form.lmp_date || null,
      };

      if (isPregnant) {
        payload.edd = form.edd || null;
        payload.edd_source = form.edd_source || 'direct_entry';
      }

      if (hasChild) {
        payload.child_name = form.child_name.trim() || null;
        payload.child_gender = form.child_gender || null;
      }

      await api.patch(`/patients/${patient.id}`, payload);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update patient');
    } finally {
      setLoading(false);
    }
  }

  const palette = AVATAR_PALETTES[(patient.id || 0) % AVATAR_PALETTES.length];
  const initials = (patient.name || 'P')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const typeColor = isPregnant
    ? '#be185d'
    : patient.patient_type === 'both'
    ? '#7c3aed'
    : '#0284c7';
  const typeBg = isPregnant
    ? '#fdf2f8'
    : patient.patient_type === 'both'
    ? '#f5f3ff'
    : '#f0f9ff';
  const typeLabel = isPregnant
    ? 'Pregnancy'
    : patient.patient_type === 'both'
    ? 'Pregnancy & Child'
    : 'Immunization';

  return (
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
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.675rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: typeBg,
                    color: typeColor,
                    border: `1px solid ${typeColor}30`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
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
              <div
                className="drawer-patient-avatar"
                style={{ background: palette.bg, color: palette.color }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.925rem',
                    color: 'var(--color-text, #0f172a)',
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
                    color: 'var(--color-text-muted, #64748b)',
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
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.65rem' }}
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
                      color: '#94a3b8',
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
                    color: '#94a3b8',
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
                    color: '#94a3b8',
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
                    background: 'var(--color-bg-primary, #f8fafc)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                  }}
                >
                  <div className="rpm-field">
                    <label
                      className="rpm-label"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Calendar size={12} color="#00857c" /> LMP Date
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
                      <CalendarCheck size={12} color="#00857c" /> Expected Delivery (EDD)
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
                    background: 'var(--color-bg-primary, #f8fafc)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                  }}
                >
                  <div className="rpm-field">
                    <label
                      className="rpm-label"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Baby size={12} color="#00857c" /> Child Name
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
                    color: '#94a3b8',
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
            <button
              type="button"
              className="rpm-btn-cancel"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
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
          </div>
        </form>
      </aside>
    </div>
  );
}
