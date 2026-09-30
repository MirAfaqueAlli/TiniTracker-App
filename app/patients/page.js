'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Users,
  Eye,
  Pencil,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  HeartPulse,
  Baby,
} from 'lucide-react';
import api from '@/lib/api';
import RegisterPatientModal from '@/components/RegisterPatientModal';
import EditPatientDrawer from '@/components/EditPatientDrawer';
import { useAuthStore } from '@/store/authStore';

const LIMIT = 7;

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

// Palette of soft background / text colour pairs — deterministic by patient id
const AVATAR_PALETTES = [
  { bg: '#ffe4e6', color: '#be185d' }, // rose
  { bg: '#ccfbf1', color: '#0f766e' }, // teal
  { bg: '#e0f2fe', color: '#0369a1' }, // sky
  { bg: '#fef9c3', color: '#854d0e' }, // amber
  { bg: '#f3e8ff', color: '#7e22ce' }, // purple
  { bg: '#dcfce7', color: '#15803d' }, // green
  { bg: '#ffedd5', color: '#9a3412' }, // orange
];

function PatientAvatar({ patient }) {
  const initials = (patient.name || 'P')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const palette = AVATAR_PALETTES[(patient.id || 0) % AVATAR_PALETTES.length];

  return (
    <div
      className="patient-avatar-box"
      style={{ background: palette.bg }}
    >
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: palette.color,
          letterSpacing: '0.02em',
          userSelect: 'none',
        }}
      >
        {initials}
      </span>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function cleanStageName(name) {
  if (!name) return '';
  if (name.includes('—')) {
    const parts = name.split('—');
    const mainPart = parts[0].trim();
    if (mainPart.toLowerCase() === 'at birth') {
      return 'Birth Checkup';
    }
    return `${mainPart} Checkup`;
  }
  return name;
}

function getStageDetails(patient, isDrPreg = false) {
  if (isDrPreg && patient.patient_type === 'both') {
    return {
      main: patient.current_stage_name ? cleanStageName(patient.current_stage_name) : 'Delivery',
      sub: 'Checkup Completed',
    };
  }

  // 'both' = delivered pregnant mother on immunization track — show immunization details
  if (patient.patient_type === 'both') {
    if (patient.current_stage_name) {
      const dashIdx = patient.current_stage_name.indexOf('—');
      const agePart = dashIdx > -1
        ? patient.current_stage_name.slice(0, dashIdx).trim()
        : patient.current_stage_name;
      return { main: agePart === 'At Birth' ? 'Newborn' : agePart, sub: 'Last visited' };
    }
    if (patient.child_dob) {
      const dob = new Date(patient.child_dob);
      const now = new Date();
      const diffMonths = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
      let ageStr;
      if (diffMonths >= 24) { const y = Math.floor(diffMonths / 12); ageStr = `${y} Year${y > 1 ? 's' : ''}`; }
      else if (diffMonths >= 1) ageStr = `${diffMonths} Month${diffMonths > 1 ? 's' : ''}`;
      else { const w = Math.floor((now - dob) / (1000 * 3600 * 24 * 7)); ageStr = w > 0 ? `${w} Weeks` : 'At Birth'; }
      return { main: ageStr, sub: 'Post-delivery' };
    }
    return { main: 'Post-Delivery Care', sub: 'Immunization track' };
  }

  if (patient.patient_type === 'pregnant') {
    // PRIMARY: if a stage has actually been visited, show it directly from server
    if (patient.current_stage_name) {
      return {
        main: cleanStageName(patient.current_stage_name),
        sub: 'Visited',
      };
    }
    // FALLBACK: patient registered but no visit yet — derive current gestational week from EDD
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

    if (!weeks) {
      return { main: 'Pregnancy Care', sub: 'No visits yet' };
    }

    let trimester;
    if (weeks >= 28)      trimester = 'Third Trimester';
    else if (weeks >= 13) trimester = 'Second Trimester';
    else                  trimester = 'First Trimester';

    return {
      main: trimester,
      sub: `Week ${weeks} · No visits yet`,
    };
  } else {
    // Immunization — PRIMARY: visited stage from server
    if (patient.current_stage_name) {
      const dashIdx = patient.current_stage_name.indexOf('—');
      const agePart = dashIdx > -1
        ? patient.current_stage_name.slice(0, dashIdx).trim()
        : patient.current_stage_name;
      return {
        main: agePart === 'At Birth' ? 'Newborn' : agePart,
        sub: 'Last visited',
      };
    }
    // FALLBACK: derive child's current age from DOB
    if (patient.child_dob) {
      const dob = new Date(patient.child_dob);
      const now = new Date();
      const diffMonths =
        (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
      let ageStr;
      if (diffMonths >= 24) {
        const years = Math.floor(diffMonths / 12);
        ageStr = `${years} Year${years > 1 ? 's' : ''}`;
      } else if (diffMonths >= 1) {
        ageStr = `${diffMonths} Month${diffMonths > 1 ? 's' : ''}`;
      } else {
        const diffWeeks = Math.floor((now - dob) / (1000 * 3600 * 24 * 7));
        ageStr = diffWeeks > 0 ? `${diffWeeks} Weeks` : 'At Birth';
      }
      return { main: ageStr, sub: 'No visits yet' };
    }
    return { main: 'Child Care', sub: 'No visits yet' };
  }
}

function getNextStageDetails(patient) {
  if (!patient.next_stage_date) return null;
  const dateStr = fmtDate(patient.next_stage_date);

  let label = 'Next Checkup';
  if (patient.next_stage_name) {
    const raw = patient.next_stage_name;
    const lower = raw.toLowerCase();
    if (
      lower.includes('vaccin') ||
      lower.includes('dose') ||
      lower.includes('dtwp') ||
      lower.includes('bcg') ||
      lower.includes('opv') ||
      lower.includes('booster')
    ) {
      label = 'Next Vaccination';
    } else if (lower.includes('anomaly') || lower.includes('scan') || lower.includes('ultrasound')) {
      label = 'Anomaly Scan';
    } else if (lower.includes('routine') || lower.includes('visit')) {
      label = 'Routine Visit';
    } else if (lower.includes('checkup')) {
      label = cleanStageName(raw);
    } else {
      label = cleanStageName(raw);
    }
  } else {
    label = patient.patient_type === 'pregnant' ? 'Next Checkup' : 'Next Vaccination';
  }

  return { date: dateStr, label };
}

const SORT_OPTIONS = [
  { value: 'registered', label: 'Sort by: Latest' },
  { value: 'next_stage', label: 'Sort by: Next Stage' },
  { value: 'name',       label: 'Sort by: Name (A–Z)' },
  { value: 'status',     label: 'Sort by: Status' },
];

export default function Patients() {
  const { user } = useAuthStore();
  const isDrPreg = user?.role === 'doctor_pregnancy';
  const isDrImm  = user?.role === 'doctor_immunization';
  const isDoctor = isDrPreg || isDrImm;

  // Doctors are locked to their patient type — no tab switching
  const lockedType = isDrPreg ? 'pregnant' : isDrImm ? 'immunization' : '';

  const [patients,     setPatients]     = useState([]);
  const [total,        setTotal]        = useState(0);
  const [pages,        setPages]        = useState(1);
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState(lockedType);
  const [statusFilter, setStatusFilter] = useState('');
  const [sort,         setSort]         = useState('registered');
  const [counts,       setCounts]       = useState({ all: 0, pregnant: 0, immunization: 0 });
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, sort });
      if (search)       params.set('search', search);
      // Always send the type filter (locked for doctors, variable for admin)
      if (typeFilter)   params.set('type',   typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/patients?${params}`);
      setPatients(res.data.patients || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      if (res.data.counts) {
        setCounts(res.data.counts);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, statusFilter, sort]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  function handleTabChange(newType) {
    if (isDoctor) return; // doctors can't switch tabs
    if (typeFilter === newType) return;
    setTypeFilter(newType);
    setPage(1);
  }

  function handleSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }
  function handleStatus(e) {
    setStatusFilter(e.target.value);
    setPage(1);
  }
  function handleSort(e) {
    setSort(e.target.value);
    setPage(1);
  }

  const startRow = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const endRow = Math.min(page * LIMIT, total);

  // Role-aware labels
  const pageTitle = isDrPreg ? 'Pregnant Patients'
    : isDrImm ? 'Immunization Patients'
    : 'Patients';
  const pageSubtitle = isDrPreg ? 'Manage and monitor your pregnant mothers.'
    : isDrImm ? 'Manage and monitor your immunization cases.'
    : 'Manage and monitor all mothers and children in one place.';
  const searchPlaceholder = isDrPreg ? 'Search pregnant mothers by name, phone or ID...'
    : isDrImm ? 'Search child or parent by name, phone or ID...'
    : 'Search by name, phone or ID...';

  return (
    <div className="patients-page-container">
      {/* Header */}
      <div className="patients-header">
        <div>
          <div className="patients-title">{pageTitle}</div>
          <div className="patients-subtitle">
            {pageSubtitle}
          </div>
        </div>
        <button className="btn-new-patient" onClick={() => setShowModal(true)}>
          <Plus size={16} strokeWidth={2.5} /> {isDrPreg ? 'New Mother' : isDrImm ? 'New Child' : 'New Patient'}
        </button>
      </div>

      {/* Patient Type Segmented Tabs — only visible for admin/staff */}
      {!isDoctor && (
        <div className="patients-type-tabs-row">
          <div className="patients-type-tabs">
            <button
              type="button"
              className={`patients-type-tab ${typeFilter === '' ? 'active' : ''}`}
              onClick={() => handleTabChange('')}
            >
              <Users size={15} className="patients-tab-icon" />
              <span className="patients-tab-text">All Patients</span>
              <span className="patients-tab-badge">{counts.all}</span>
            </button>

            <button
              type="button"
              className={`patients-type-tab tab-pregnant ${typeFilter === 'pregnant' ? 'active' : ''}`}
              onClick={() => handleTabChange('pregnant')}
            >
              <HeartPulse size={15} className="patients-tab-icon" />
              <span className="patients-tab-text">Pregnant Mothers</span>
              <span className="patients-tab-badge">{counts.pregnant}</span>
            </button>

            <button
              type="button"
              className={`patients-type-tab tab-immunization ${typeFilter === 'immunization' ? 'active' : ''}`}
              onClick={() => handleTabChange('immunization')}
            >
              <Baby size={15} className="patients-tab-icon" />
              <span className="patients-tab-text">Child Immunization</span>
              <span className="patients-tab-badge">{counts.immunization}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filters & Sort Controls */}
      <div className="patients-controls-row">
        <div className="patients-filters-left">
          {/* Search */}
          <div className="patients-search-box">
            <Search size={16} className="patients-search-icon" />
            <input
              className="patients-search-input"
              placeholder={searchPlaceholder}
              value={search}
              onChange={handleSearch}
            />
          </div>

          {/* Status Filter */}
          <div className="patients-select-wrapper">
            <select
              className="patients-filter-select"
              value={statusFilter}
              onChange={handleStatus}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="completed">Completed</option>
            </select>
            <ChevronDown size={14} className="patients-select-chevron" />
          </div>
        </div>

        {/* Sort */}
        <div className="patients-sort-wrapper">
          <ArrowUpDown size={14} className="patients-sort-icon" />
          <select
            className="patients-sort-select"
            value={sort}
            onChange={handleSort}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="patients-select-chevron" />
        </div>
      </div>

      {/* Patients Table Card */}
      <div className="patients-card">
        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : patients.length === 0 ? (
          <div className="empty-state" style={{ padding: '3.5rem 1rem' }}>
            <div className="empty-state-icon">
              <Users size={36} />
            </div>
            <div className="empty-state-text" style={{ fontSize: '1rem', fontWeight: 600 }}>
              {typeFilter === 'pregnant'
                ? 'No pregnant mothers found'
                : typeFilter === 'immunization'
                ? 'No immunization records found'
                : 'No patients found'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              {search || typeFilter || statusFilter
                ? 'Try adjusting your search or filter parameters'
                : 'Get started by registering your first patient.'}
            </div>
            <button className="btn-new-patient" onClick={() => setShowModal(true)}>
              <Plus size={15} strokeWidth={2.5} /> Register First Patient
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="patients-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>WhatsApp Number</th>
                  <th>Type</th>
                  <th>
                    {typeFilter === 'pregnant'
                      ? 'EDD Date'
                      : typeFilter === 'immunization'
                      ? 'Child DOB'
                      : 'EDD / DOB'}
                  </th>
                  <th>Current Stage</th>
                  <th>Next Stage</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const currentStage = getStageDetails(p, isDrPreg);
                  const nextStage = getNextStageDetails(p);
                  const isBothForPreg = isDrPreg && p.patient_type === 'both';

                  return (
                    <tr key={p.id}>
                      {/* Patient Name + Avatar */}
                      <td>
                        <div className="patient-profile-cell">
                          <PatientAvatar patient={p} />
                          <div>
                            <div className="patient-name-title">{p.name}</div>
                            <div className="patient-sub-info">
                              {p.whatsapp_number || `ID #${p.id}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* WhatsApp Number */}
                      <td>
                        <div className="patient-whatsapp-cell">
                          <WhatsAppIcon size={16} />
                          <span>{p.whatsapp_number}</span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td>
                        <span
                          className={`patient-type-pill ${
                            isBothForPreg
                              ? 'patient-type-completed'
                              : p.patient_type === 'pregnant'
                                ? 'patient-type-pregnant'
                                : p.patient_type === 'both'
                                  ? 'patient-type-both'
                                  : 'patient-type-immunization'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDoctor) {
                              handleTabChange(p.patient_type === 'pregnant' ? 'pregnant' : 'immunization');
                            }
                          }}
                          style={{ cursor: isDoctor ? 'default' : 'pointer' }}
                          title={isBothForPreg ? 'Pregnancy Care Completed' : `Filter to ${p.patient_type === 'pregnant' ? 'Pregnant Mothers' : 'Child Immunization'} only`}
                        >
                          {isBothForPreg
                            ? 'Checkup Completed'
                            : p.patient_type === 'pregnant'
                              ? 'Pregnant'
                              : p.patient_type === 'both'
                                ? 'Post-Delivery'
                                : 'Immunization'}
                        </span>
                      </td>

                      {/* EDD / DOB */}
                      <td>
                        <div className="patient-date-main">
                          {isDrPreg || p.patient_type === 'pregnant'
                            ? fmtDate(p.edd)
                            : fmtDate(p.child_dob)}
                        </div>
                        <div className="patient-date-sub">
                          {isDrPreg || p.patient_type === 'pregnant' ? 'EDD' : 'DOB'}
                        </div>
                      </td>

                      {/* Current Stage */}
                      <td>
                        <div>
                          <div className="patient-stage-main">{currentStage.main}</div>
                          <div className="patient-stage-sub">{currentStage.sub}</div>
                        </div>
                      </td>

                      {/* Next Stage */}
                      <td>
                        {nextStage ? (
                          <div className="patient-next-stage-cell">
                            <div className="patient-calendar-icon-box">
                              <Calendar size={15} />
                            </div>
                            <div>
                              <div className="patient-date-main">{nextStage.date}</div>
                              <div className="patient-stage-sub">{nextStage.label}</div>
                            </div>
                          </div>
                        ) : isBothForPreg ? (
                          <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 600 }}>All Visits Done</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`patient-status-pill ${
                            isBothForPreg || p.status === 'completed'
                              ? 'patient-status-completed'
                              : p.status === 'active'
                                ? 'patient-status-active'
                                : 'patient-status-inactive'
                          }`}
                        >
                          <span
                            className={
                              isBothForPreg || p.status === 'completed'
                                ? 'patient-status-dot-completed'
                                : p.status === 'active'
                                  ? 'patient-status-dot-active'
                                  : 'patient-status-dot-inactive'
                            }
                          />
                          {isBothForPreg || p.status === 'completed'
                            ? 'Completed'
                            : p.status === 'active'
                            ? 'Active'
                            : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            justifyContent: 'center',
                          }}
                        >
                          <Link
                            href={`/patients/${p.id}`}
                            className="patient-action-link"
                            title="View Patient Details"
                          >
                            <Eye size={15} />
                          </Link>
                          {!isDoctor && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPatient(p);
                              }}
                              className="patient-action-link"
                              title="Edit Patient"
                              style={{
                                border: 'none',
                                cursor: 'pointer',
                                background: 'transparent',
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="patients-pagination-row">
            <span className="patients-pagination-info">
              Showing {startRow}–{endRow} of {total} patients
            </span>
            <div className="patients-pagination-controls">
              <button
                className="patients-page-btn arrow-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter(
                  (n) => n === 1 || n === pages || Math.abs(n - page) <= 1
                )
                .reduce((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '…' ? (
                    <span
                      key={`e${i}`}
                      style={{ padding: '0 0.25rem', color: '#94a3b8' }}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      className={`patients-page-btn ${n === page ? 'active' : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                className="patients-page-btn arrow-btn"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <RegisterPatientModal
          initialType={lockedType || (typeFilter === 'immunization' ? 'immunization' : 'pregnant')}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchPatients();
          }}
        />
      )}

      {editingPatient && (
        <EditPatientDrawer
          patient={editingPatient}
          onClose={() => setEditingPatient(null)}
          onSuccess={() => {
            setEditingPatient(null);
            fetchPatients();
          }}
        />
      )}
    </div>
  );
}

