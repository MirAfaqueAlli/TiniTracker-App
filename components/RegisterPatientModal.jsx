'use client';
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  UserPlus,
  User,
  Cake,
  MapPin,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Activity,
  FileText,
  Baby,
  Plus,
  ChevronDown,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';


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

function PregnantMotherIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm-2 9c-2.4 0-4 1.8-4 4.2v4.8a1 1 0 0 0 1 1h5.8a5.2 5.2 0 0 0 5.2-5.2c0-2.6-2.2-4.8-4.8-4.8H10z" />
    </svg>
  );
}

export default function RegisterPatientModal({ onClose, onSuccess, initialType }) {
  const { user } = useAuthStore();
  const isDrPreg = user?.role === 'doctor_pregnancy';
  const isDrImm  = user?.role === 'doctor_immunization';

  const defaultType = isDrPreg
    ? 'pregnant'
    : isDrImm
    ? 'immunization'
    : initialType || 'pregnant';

  const [form, setForm] = useState({
    name: '',
    whatsapp_number: '',
    age: '',
    address: '',
    patient_type: defaultType,
    edd_source: 'lmp_calculated',
    lmp_date: '',
    edd: '',
    us_scan_date: '',
    us_ga_weeks: '',
    us_ga_days: '',
    child_dob: '',
    child_name: '',
    child_gender: '',
    notes: '',
  });

  // For doctors, the active patient type is strictly locked to their domain
  const activeType = isDrPreg ? 'pregnant' : isDrImm ? 'immunization' : form.patient_type;

  const [now] = useState(() => Date.now());
  const [loading, setLoading]           = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError]               = useState('');
  // Collision state
  const [sameHospitalPatient,  setSameHospitalPatient]  = useState(null); // { id, name, patient_type, status }
  const [crossHospitalPatient, setCrossHospitalPatient] = useState(null); // full preview with stage_summary


  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Strip non-digits, take last 10, prepend +91
  function normalizePhone(val) {
    const digits = val.replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91${digits}` : val.trim();
  }

  // Live-calculate EDD for ultrasound mode
  function calcUltrasoundEdd(scan_date, ga_weeks, ga_days) {
    if (!scan_date || ga_weeks === '') return '';
    const gaDays = (parseInt(ga_weeks, 10) || 0) * 7 + (parseInt(ga_days, 10) || 0);
    const remaining = 280 - gaDays;
    if (remaining < 0) return '';
    const edd = new Date(scan_date);
    edd.setDate(edd.getDate() + remaining);
    return edd.toISOString().split('T')[0];
  }

  const usEdd = calcUltrasoundEdd(form.us_scan_date, form.us_ga_weeks, form.us_ga_days);

  // Compute live estimated delivery date preview
  const deliveryPreview = useMemo(() => {
    let targetEdd = null;
    if (form.edd_source === 'lmp_calculated' && form.lmp_date) {
      const d = new Date(form.lmp_date);
      d.setDate(d.getDate() + 280);
      targetEdd = d;
    } else if (form.edd_source === 'direct_entry' && form.edd) {
      targetEdd = new Date(form.edd);
    } else if (form.edd_source === 'ultrasound' && usEdd) {
      targetEdd = new Date(usEdd);
    }

    if (!targetEdd || isNaN(targetEdd.getTime())) {
      return null;
    }

    const dateStr = targetEdd.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const diffDays = Math.round((targetEdd.getTime() - now) / (1000 * 3600 * 24));
    const weeks = Math.max(1, Math.min(42, Math.round(40 - diffDays / 7)));

    return {
      dateStr,
      weekStr: `Week ${weeks}`,
    };
  }, [form.edd_source, form.lmp_date, form.edd, usEdd, now]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const payload = {
      name: form.name.trim(),
      whatsapp_number: normalizePhone(form.whatsapp_number),
      patient_type: activeType,
    };
    if (form.age) payload.age = parseInt(form.age, 10);
    if (form.address) payload.address = form.address;
    if (form.notes) payload.notes = form.notes;

    if (activeType === 'pregnant') {
      payload.edd_source = form.edd_source;

      if (form.edd_source === 'lmp_calculated') {
        if (!form.lmp_date) {
          setError('LMP date is required');
          return;
        }
        payload.lmp_date = form.lmp_date;
      } else if (form.edd_source === 'direct_entry') {
        if (!form.edd) {
          setError('EDD date is required');
          return;
        }
        payload.edd = form.edd;
      } else if (form.edd_source === 'ultrasound') {
        if (!form.us_scan_date) {
          setError('Ultrasound scan date is required');
          return;
        }
        if (form.us_ga_weeks === '') {
          setError('Gestational age is required');
          return;
        }
        if (!usEdd) {
          setError('Could not calculate EDD — check gestational age');
          return;
        }
        payload.ultrasound_scan_date = form.us_scan_date;
        payload.edd = usEdd;
      }
    } else {
      if (!form.child_dob) {
        setError('Child DOB is required');
        return;
      }
      payload.child_dob = form.child_dob;
      if (form.child_name) payload.child_name = form.child_name;
      if (form.child_gender) payload.child_gender = form.child_gender;
    }

    setLoading(true);
    setSameHospitalPatient(null);
    setCrossHospitalPatient(null);
    try {
      await api.post('/patients', payload);
      onSuccess();
    } catch (err) {
      const apiErr = err.response?.data?.error;

      if (apiErr === 'patient_exists_here') {
        // Already at this hospital — show a link to their profile
        setSameHospitalPatient(err.response.data.patient);
        return;
      }

      if (apiErr === 'patient_exists_elsewhere') {
        // At another hospital — show full preview + transfer prompt
        setCrossHospitalPatient(err.response.data.patient);
        return;
      }

      setError(err.response?.data?.message || err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleTransfer() {
    if (!crossHospitalPatient) return;
    setTransferring(true);
    try {
      await api.post(`/patients/${crossHospitalPatient.id}/transfer`, { confirm: true });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  }


  // Portal target — only available on client
  const [portalRoot, setPortalRoot] = useState(null);
  useEffect(() => { setPortalRoot(document.body); }, []);

  return (
    <>
      {/* ── Cross-hospital confirmation popup — portalled into body ── */}
      {crossHospitalPatient && portalRoot && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(2,6,23,0.75)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '420px',
            boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
            overflow: 'hidden', animation: 'fadeSlideUp 0.22s ease',
          }}>
            {/* Popup header */}
            <div style={{
              background: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
              padding: '1.25rem 1.4rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <ArrowRightLeft size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Patient Found in TiniTraker</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.15rem' }}>
                  This person is registered at another hospital
                </div>
              </div>
            </div>

            {/* Patient info card */}
            <div style={{ padding: '1.2rem 1.4rem' }}>
              <div style={{
                background: '#f8fafc', borderRadius: '12px', padding: '0.9rem 1rem',
                border: '1px solid #e2e8f0', marginBottom: '1rem',
              }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', marginBottom: '0.4rem' }}>
                  {crossHospitalPatient.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.7rem' }}>
                  <span style={{
                    background: '#e0f2fe', color: '#0369a1',
                    padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                  }}>
                    {crossHospitalPatient.patient_type?.replace('_', ' ')}
                  </span>
                  {crossHospitalPatient.age && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Age {crossHospitalPatient.age}</span>
                  )}
                  {crossHospitalPatient.address && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>📍 {crossHospitalPatient.address}</span>
                  )}
                </div>

                {crossHospitalPatient.stage_summary && (() => {
                  const s = crossHospitalPatient.stage_summary;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {/* Progress */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ flex: 1, height: 7, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.progress_pct}%`, height: '100%',
                            background: 'linear-gradient(90deg,#10b981,#059669)', borderRadius: 999,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', minWidth: 32 }}>{s.progress_pct}%</span>
                      </div>
                      {/* Stats */}
                      <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.76rem', color: '#64748b' }}>
                        <span>✅ {s.visited} visited</span>
                        <span>⏳ {s.upcoming} upcoming</span>
                        <span>⏭ {s.skipped} skipped</span>
                      </div>
                      {/* Last / next */}
                      {s.last_visited?.name && (
                        <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                          Last: <strong>{s.last_visited.name}</strong>
                          {s.last_visited.date && ` · ${new Date(s.last_visited.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </div>
                      )}
                      {s.next_upcoming?.name && (
                        <div style={{ fontSize: '0.74rem', color: '#0369a1' }}>
                          Next up: <strong>{s.next_upcoming.name}</strong>
                          {s.next_upcoming.date && ` · ${new Date(s.next_upcoming.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                Is this the same patient? Clicking <strong>"Yes, bring patient"</strong> will transfer all their past stages, visits and history to your hospital.
              </p>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  disabled={transferring}
                  onClick={handleTransfer}
                  style={{
                    flex: 1, padding: '0.7rem 1rem', borderRadius: '11px',
                    fontWeight: 700, fontSize: '0.88rem', border: 'none',
                    background: transferring ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    color: '#fff', cursor: transferring ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  }}
                >
                  {transferring ? (
                    <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Transferring…</>
                  ) : (
                    <><CheckCircle size={15} /> Yes, bring patient</>
                  )}
                </button>
                <button
                  type="button"
                  disabled={transferring}
                  onClick={() => setCrossHospitalPatient(null)}
                  style={{
                    flex: 1, padding: '0.7rem 1rem', borderRadius: '11px',
                    fontWeight: 600, fontSize: '0.88rem',
                    background: '#f1f5f9', color: '#475569',
                    border: '1px solid #e2e8f0', cursor: 'pointer',
                  }}
                >
                  No, go back
                </button>
              </div>
            </div>
          </div>
        </div>,
        portalRoot
      )}

    <div className="rpm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rpm-card">
        {/* Header */}
        <div className="rpm-header">
          <div className="rpm-header-left">
            <div className="rpm-header-icon-box">
              <UserPlus size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="rpm-title">
                {isDrPreg
                  ? 'Register Pregnant Mother'
                  : isDrImm
                  ? 'Register Child Patient'
                  : 'Register New Patient'}
              </div>
              <div className="rpm-subtitle">
                {isDrPreg
                  ? 'Enroll a pregnant mother into prenatal care tracking'
                  : isDrImm
                  ? 'Enroll a child into immunization tracking'
                  : 'Enroll a mother or child into the care tracking system'}
              </div>
            </div>
          </div>
          <button type="button" className="rpm-close-btn" onClick={onClose} title="Close">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {error && <div className="rpm-error-banner">{error}</div>}


          {/* ── Same-hospital collision: inline banner ── */}
          {sameHospitalPatient && (
            <div style={{
              padding: '0.9rem 1rem', borderRadius: '12px',
              background: '#fffbeb', border: '1px solid #fde68a',
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#92400e' }}>
                <AlertTriangle size={16} /> Already registered at your hospital
              </div>
              <div style={{ fontSize: '0.82rem', color: '#78350f' }}>
                <strong>{sameHospitalPatient.name}</strong> ({sameHospitalPatient.patient_type?.replace('_', ' ')}) is already in your patient list.
              </div>
              <Link
                href={`/patients/${sameHospitalPatient.id}`}
                onClick={onClose}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                  background: '#f59e0b', color: '#fff', textDecoration: 'none', alignSelf: 'flex-start',
                }}
              >
                View Patient Profile →
              </Link>
            </div>
          )}


          {/* Patient Type Segmented Toggle */}
          <div
            className="rpm-type-toggle"
            style={{
              gridTemplateColumns: (isDrPreg || isDrImm) ? '1fr' : '1fr 1fr',
            }}
          >
            {!isDrImm && (
              <button
                type="button"
                className={`rpm-type-btn ${activeType === 'pregnant' ? 'active' : ''}`}
                onClick={() => set('patient_type', 'pregnant')}
                style={isDrPreg ? { cursor: 'default' } : {}}
              >
                <span className="rpm-toggle-icon-badge badge-pregnant">
                  <PregnantMotherIcon size={13} />
                </span>
                <span>Pregnant Mother</span>
              </button>
            )}
            {!isDrPreg && (
              <button
                type="button"
                className={`rpm-type-btn ${activeType === 'immunization' ? 'active' : ''}`}
                onClick={() => set('patient_type', 'immunization')}
                style={isDrImm ? { cursor: 'default' } : {}}
              >
                <span className="rpm-toggle-icon-badge badge-child">
                  <Baby size={14} strokeWidth={2.2} />
                </span>
                <span>Child Immunization</span>
              </button>
            )}
          </div>

          {/* Row 1: Full Name & WhatsApp Number */}
          <div className="rpm-form-grid-2">
            <div className="rpm-field-group">
              <label className="rpm-label">
                Full Name <span className="rpm-required-star">*</span>
              </label>
              <div className="rpm-input-wrapper">
                <User size={15} className="rpm-input-icon" />
                <input
                  className="rpm-input"
                  placeholder="e.g., Priya Sharma"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="rpm-field-group">
              <label className="rpm-label">
                WhatsApp Number <span className="rpm-required-star">*</span>
              </label>
              <div className="rpm-phone-wrapper">
                <div className="rpm-phone-prefix">
                  <WhatsAppIcon size={15} />
                  <span>+91</span>
                </div>
                <input
                  className="rpm-phone-input"
                  placeholder="98765 43210"
                  value={form.whatsapp_number}
                  onChange={(e) =>
                    set('whatsapp_number', e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  maxLength={10}
                  required
                />
              </div>
            </div>
          </div>

          {/* Row 2: Age & City/Address */}
          <div className="rpm-form-grid-2">
            <div className="rpm-field-group">
              <label className="rpm-label">
                Age <span className="rpm-required-star">*</span>
              </label>
              <div className="rpm-input-wrapper">
                <Cake size={15} className="rpm-input-icon" />
                <input
                  className="rpm-input"
                  type="number"
                  placeholder="e.g., 24"
                  value={form.age}
                  onChange={(e) => set('age', e.target.value)}
                  min="1"
                  max="120"
                />
              </div>
            </div>

            <div className="rpm-field-group">
              <label className="rpm-label">
                City / Address <span className="rpm-required-star">*</span>
              </label>
              <div className="rpm-input-wrapper">
                <MapPin size={15} className="rpm-input-icon" />
                <input
                  className="rpm-input"
                  placeholder="e.g., Bhubaneswar, Odisha"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Conditional Sections */}
          {activeType === 'pregnant' ? (
            <>
              {/* EDD Calculation Method */}
              <div className="rpm-field-group">
                <label className="rpm-label">
                  EDD Calculation Method <span className="rpm-required-star">*</span>
                </label>
                <div className="rpm-method-toggle">
                  <button
                    type="button"
                    className={`rpm-method-btn ${form.edd_source === 'lmp_calculated' ? 'active' : ''}`}
                    onClick={() => set('edd_source', 'lmp_calculated')}
                  >
                    <Calendar size={14} />
                    <span>LMP Date</span>
                  </button>
                  <button
                    type="button"
                    className={`rpm-method-btn ${form.edd_source === 'direct_entry' ? 'active' : ''}`}
                    onClick={() => set('edd_source', 'direct_entry')}
                  >
                    <CalendarClock size={14} />
                    <span>Direct EDD</span>
                  </button>
                  <button
                    type="button"
                    className={`rpm-method-btn ${form.edd_source === 'ultrasound' ? 'active' : ''}`}
                    onClick={() => set('edd_source', 'ultrasound')}
                  >
                    <Activity size={14} />
                    <span>Ultrasound Scan</span>
                  </button>
                </div>
              </div>

              {/* LMP Date & Estimated Delivery Preview */}
              {form.edd_source === 'lmp_calculated' && (
                <div className="rpm-form-grid-2">
                  <div className="rpm-field-group">
                    <label className="rpm-label">
                      LMP Date <span className="rpm-required-star">*</span>
                    </label>
                    <div className="rpm-input-wrapper">
                      <Calendar size={15} className="rpm-input-icon" />
                      <input
                        className="rpm-input"
                        type="date"
                        value={form.lmp_date}
                        onChange={(e) => set('lmp_date', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rpm-field-group">
                    <label className="rpm-label" style={{ visibility: 'hidden' }}>Preview</label>
                    <div className="rpm-delivery-card">
                      <div className="rpm-delivery-icon-box">
                        <CalendarCheck size={18} />
                      </div>
                      <div className="rpm-delivery-text">
                        <span className="rpm-delivery-label">Estimated Delivery:</span>
                        <span className="rpm-delivery-value">
                          {deliveryPreview
                            ? `${deliveryPreview.dateStr} · ${deliveryPreview.weekStr}`
                            : 'Select LMP date'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Direct EDD */}
              {form.edd_source === 'direct_entry' && (
                <div className="rpm-form-grid-2">
                  <div className="rpm-field-group">
                    <label className="rpm-label">
                      Expected Delivery Date (EDD) <span className="rpm-required-star">*</span>
                    </label>
                    <div className="rpm-input-wrapper">
                      <Calendar size={15} className="rpm-input-icon" />
                      <input
                        className="rpm-input"
                        type="date"
                        value={form.edd}
                        onChange={(e) => set('edd', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rpm-field-group">
                    <label className="rpm-label" style={{ visibility: 'hidden' }}>Preview</label>
                    <div className="rpm-delivery-card">
                      <div className="rpm-delivery-icon-box">
                        <CalendarCheck size={18} />
                      </div>
                      <div className="rpm-delivery-text">
                        <span className="rpm-delivery-label">Estimated Delivery:</span>
                        <span className="rpm-delivery-value">
                          {deliveryPreview
                            ? `${deliveryPreview.dateStr} · ${deliveryPreview.weekStr}`
                            : 'Select EDD date'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Ultrasound Scan */}
              {form.edd_source === 'ultrasound' && (
                <>
                  <div className="rpm-form-grid-2">
                    <div className="rpm-field-group">
                      <label className="rpm-label">
                        Scan Date <span className="rpm-required-star">*</span>
                      </label>
                      <div className="rpm-input-wrapper">
                        <Calendar size={15} className="rpm-input-icon" />
                        <input
                          className="rpm-input"
                          type="date"
                          value={form.us_scan_date}
                          onChange={(e) => set('us_scan_date', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rpm-field-group">
                      <label className="rpm-label">
                        Gestational Age at Scan <span className="rpm-required-star">*</span>
                      </label>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <div className="rpm-input-wrapper" style={{ flex: 1 }}>
                          <input
                            className="rpm-input"
                            type="number"
                            min="0"
                            max="42"
                            placeholder="12"
                            value={form.us_ga_weeks}
                            onChange={(e) => set('us_ga_weeks', e.target.value)}
                            style={{ paddingLeft: '0.75rem', paddingRight: '0.5rem' }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>wks</span>
                        <div className="rpm-input-wrapper" style={{ flex: 1 }}>
                          <input
                            className="rpm-input"
                            type="number"
                            min="0"
                            max="6"
                            placeholder="3"
                            value={form.us_ga_days}
                            onChange={(e) => set('us_ga_days', e.target.value)}
                            style={{ paddingLeft: '0.75rem', paddingRight: '0.5rem' }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>days</span>
                      </div>
                    </div>
                  </div>

                  <div className="rpm-delivery-card" style={{ marginTop: '0.25rem' }}>
                    <div className="rpm-delivery-icon-box">
                      <CalendarCheck size={18} />
                    </div>
                    <div className="rpm-delivery-text">
                      <span className="rpm-delivery-label">Estimated Delivery:</span>
                      <span className="rpm-delivery-value">
                        {deliveryPreview
                          ? `${deliveryPreview.dateStr} · ${deliveryPreview.weekStr}`
                          : 'Enter scan date & gestational age'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Child Immunization Fields */
            <>
              <div className="rpm-form-grid-2">
                <div className="rpm-field-group">
                  <label className="rpm-label">
                    Child DOB <span className="rpm-required-star">*</span>
                  </label>
                  <div className="rpm-input-wrapper">
                    <Calendar size={15} className="rpm-input-icon" />
                    <input
                      className="rpm-input"
                      type="date"
                      value={form.child_dob}
                      onChange={(e) => set('child_dob', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="rpm-field-group">
                  <label className="rpm-label">Gender</label>
                  <div className="rpm-input-wrapper">
                    <select
                      className="rpm-input"
                      style={{ paddingLeft: '0.75rem', cursor: 'pointer' }}
                      value={form.child_gender}
                      onChange={(e) => set('child_gender', e.target.value)}
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                    <ChevronDown
                      size={14}
                      style={{ position: 'absolute', right: '0.75rem', pointerEvents: 'none', color: '#64748b' }}
                    />
                  </div>
                </div>
              </div>

              <div className="rpm-field-group">
                <label className="rpm-label">Child Name</label>
                <div className="rpm-input-wrapper">
                  <Baby size={15} className="rpm-input-icon" />
                  <input
                    className="rpm-input"
                    placeholder="e.g., Aarav Patel"
                    value={form.child_name}
                    onChange={(e) => set('child_name', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Clinical Notes */}
          <div className="rpm-field-group">
            <label className="rpm-label">Clinical Notes</label>
            <div className="rpm-notes-wrapper">
              <FileText size={15} className="rpm-notes-icon" />
              <textarea
                className="rpm-textarea"
                placeholder="Any pre-existing conditions or allergies..."
                value={form.notes}
                onChange={(e) => set('notes', e.target.value.slice(0, 300))}
                maxLength={300}
              />
              <span className="rpm-char-count">{form.notes.length}/300</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="rpm-footer">
            <button type="button" className="rpm-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="rpm-btn-submit" disabled={loading}>
              {loading ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              ) : (
                <>
                  <Plus size={15} strokeWidth={2.5} />
                  <span>Register & Start Timeline</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
