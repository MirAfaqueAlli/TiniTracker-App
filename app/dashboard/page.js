'use client';
import { useEffect, useState } from 'react';
import {
  User, Baby, Calendar, Syringe, AlertCircle,
  Activity, Bell, Users, ChevronRight, Plus,
  HeartPulse, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

/* ── Activity icon map ── */
function ActivityIcon({ type }) {
  const base = { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  const icons = {
    mother_registered: { bg: '#fff1f2', color: '#e11d48', Icon: User },
    child_registered:  { bg: '#eff6ff', color: '#0284c7', Icon: Baby },
    stage_visited:     { bg: '#f0fdf4', color: '#16a34a', Icon: Activity },
    delivery_recorded: { bg: '#f0fdf4', color: '#16a34a', Icon: Baby },
    stage_skipped:     { bg: '#f1f5f9', color: '#64748b', Icon: Activity },
    reminder_7d:       { bg: '#f5f3ff', color: '#7c3aed', Icon: Bell },
    reminder_1d:       { bg: '#f5f3ff', color: '#7c3aed', Icon: Bell },
    reminder_today:    { bg: '#f5f3ff', color: '#7c3aed', Icon: Bell },
  };
  const cfg = icons[type] || icons.stage_visited;
  const { Icon, bg, color } = cfg;
  return (
    <div style={{ ...base, background: bg }}>
      <Icon size={14} color={color} strokeWidth={2} />
    </div>
  );
}

function PatientAvatar({ name, type, stageType }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  // For 'both' patients, color based on stageType being displayed (what department the card is for)
  const effectiveType = type === 'both' ? (stageType === 'pregnancy' ? 'pregnant' : 'immunization') : type;
  const bg    = effectiveType === 'pregnant' ? '#fff1f2' : effectiveType === 'immunization' ? '#eff6ff' : '#e8f7f2';
  const color = effectiveType === 'pregnant' ? '#e11d48' : effectiveType === 'immunization' ? '#0284c7' : '#00857c';
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '0.6875rem',
      fontWeight: 700, color, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d     = new Date(isoString);
  const now   = new Date();
  const diffMs = now - d;
  const diffH  = diffMs / (1000 * 60 * 60);
  if (diffH < 1)  return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffH < 24) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return 'Yesterday';
}

function formatApptDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('-');
  if (!y || !m || !d) return dateStr;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ label, value, icon: Icon, loading }) {
  return (
    <div className="metric-stat-card">
      <div className="metric-stat-icon">
        <Icon size={24} color="#ffffff" strokeWidth={2} />
      </div>
      <div className="metric-stat-info">
        <div className="metric-stat-value">
          {loading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : (value ?? 0)}
        </div>
        <div className="metric-stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user }   = useAuthStore();
  const isDrPreg   = user?.role === 'doctor_pregnancy';
  const isDrImm    = user?.role === 'doctor_immunization';
  const [stats,          setStats]          = useState(null);
  const [activity,       setActivity]       = useState(null);
  const [recentPatients, setRecentPatients] = useState([]);
  const [patientsTotal,  setPatientsTotal]  = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      // API is already scoped server-side by doctorTypeFilter
      const [statsRes, activityRes, patientsRes] = await Promise.all([
        api.get('/patients/dashboard-stats'),
        api.get('/patients/dashboard-activity'),
        api.get('/patients?limit=5&sort=registered'),
      ]);
      setStats({
        active:            statsRes.data.active ?? 0,
        appointmentsToday: statsRes.data.dueToday?.length ?? 0,
        stagesDue:         statsRes.data.upcoming ?? 0,
        missed:            statsRes.data.missed ?? 0,
      });
      setActivity(activityRes.data);
      setRecentPatients(patientsRes.data.patients || []);
      setPatientsTotal(patientsRes.data.total || 0);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const recentActivity       = (activity?.recentActivity       ?? []).slice(0, 5);
  const upcomingAppointments = (activity?.upcomingAppointments ?? []).slice(0, 5);

  return (
    <div className="dashboard-page-container">

      {/* ── Welcome Banner ── */}
      <div className="dashboard-welcome-banner">
        <div className="welcome-banner-content">
          <div className="welcome-banner-left">
            <h1 className="welcome-banner-title">
              Welcome Back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <p className="welcome-banner-subtitle">
              {isDrPreg
                ? "Here's an overview of your pregnant patients and upcoming antenatal visits."
                : isDrImm
                  ? "Here's an overview of your immunization cases and due vaccines."
                  : "Here's what's happening across maternal and pediatric care at your facility today."}
            </p>
          </div>
          <div className="welcome-banner-right">
            <div className="welcome-tagline">
              <span className="welcome-tagline-small">Small Steps</span>
              <span className="welcome-tagline-large">Healthier Generations</span>
              <span className="welcome-tagline-bar" />
            </div>
            <div className="welcome-banner-media">
              <img src="/mother-baby-banner.png" alt="Mother and Child" className="welcome-banner-photo welcome-photo-light" />
              <img src="/mother-baby-banner-dark.png" alt="Mother and Child" className="welcome-banner-photo welcome-photo-dark" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Error Alert ── */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', background: 'var(--color-danger-bg)',
          border: '1px solid #fecdd3', borderRadius: 'var(--radius-sm)',
          fontSize: '0.8125rem', color: 'var(--color-error)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ── Stat Cards (Role-aware) ── */}
      <div className="dashboard-stats-grid-4">
        {isDrPreg ? (
          <>
            <StatCard label="Pregnant Patients" value={stats?.active}            icon={User}       loading={loading} />
            <StatCard label="Appointments Today" value={stats?.appointmentsToday} icon={Calendar}   loading={loading} />
            <StatCard label="Stages Due (7d)"   value={stats?.stagesDue}         icon={Syringe}    loading={loading} />
            <StatCard label="Missed Visits"      value={stats?.missed}           icon={Activity}   loading={loading} />
          </>
        ) : isDrImm ? (
          <>
            <StatCard label="Immunization Cases" value={stats?.active}            icon={Baby}       loading={loading} />
            <StatCard label="Appointments Today" value={stats?.appointmentsToday} icon={Calendar}   loading={loading} />
            <StatCard label="Vaccines Due (7d)"  value={stats?.stagesDue}         icon={Syringe}    loading={loading} />
            <StatCard label="Missed Visits"      value={stats?.missed}           icon={Activity}   loading={loading} />
          </>
        ) : (
          <>
            <StatCard label="Active Patients"    value={stats?.active}            icon={User}       loading={loading} />
            <StatCard label="Appointments Today" value={stats?.appointmentsToday} icon={Calendar}   loading={loading} />
            <StatCard label="Stages Due (7d)"    value={stats?.stagesDue}         icon={Syringe}    loading={loading} />
            <StatCard label="Missed Visits"      value={stats?.missed}           icon={Activity}   loading={loading} />
          </>
        )}
      </div>

      {/* ── Main Content 3-Column Grid ── */}
      <div className="dashboard-bottom-grid">

        {/* ── Card 1: Recent Patients ── */}
        <div className="dash-bottom-card">
          <div className="dash-bottom-card-header">
            <div className="dash-card-header-left">
              <div className="dash-card-icon-wrap">
                <Users size={15} />
              </div>
              <span className="dash-bottom-card-title">Recent Patients</span>
              <span className="dash-card-badge">{patientsTotal}</span>
            </div>
            <Link href="/patients" className="dash-viewall-btn" style={{ textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="dash-bottom-loading"><div className="spinner" /></div>
          ) : recentPatients.length === 0 ? (
            <div className="dash-bottom-empty">
              <Users size={28} color="var(--color-text-faint)" />
              <span>No patients registered yet</span>
            </div>
          ) : (
            <div className="dash-activity-list">
              {recentPatients.map((p) => {
                const stageText = p.next_stage_name
                  ? `Next: ${p.next_stage_name}`
                  : (p.current_stage || 'Active Patient');
                const isPreg = p.patient_type === 'pregnant';
                const isImm  = p.patient_type === 'immunization';
                return (
                  <Link
                    key={p.id}
                    href={`/patients/${p.id}`}
                    className="dash-patient-item"
                  >
                    <PatientAvatar name={p.name} type={p.patient_type} />
                    <div className="dash-patient-info">
                      <div className="dash-patient-name-row">
                        <span className="dash-patient-name">{p.name}</span>
                        <span className={`dash-patient-pill ${p.patient_type}`}>
                          {isPreg ? 'Pregnancy' : isImm ? 'Immunization' : 'Both'}
                        </span>
                      </div>
                      <div className="dash-patient-meta">
                        <span>{stageText}</span>
                      </div>
                    </div>
                    <div className="dash-patient-right">
                      <span className="dash-patient-date">
                        {p.next_stage_date ? formatApptDate(p.next_stage_date) : formatTime(p.createdAt)}
                      </span>
                      <ChevronRight size={13} style={{ color: 'var(--color-text-faint)' }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <Link href="/patients" className="dash-card-view-more">
            <span>View all patients ({patientsTotal})</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* ── Card 2: Upcoming Appointments ── */}
        <div className="dash-bottom-card">
          <div className="dash-bottom-card-header">
            <div className="dash-card-header-left">
              <div className="dash-card-icon-wrap blue">
                <Calendar size={15} />
              </div>
              <span className="dash-bottom-card-title">Upcoming Appointments</span>
              <span className="dash-card-badge">{upcomingAppointments.length}</span>
            </div>
            <Link href="/patients" className="dash-viewall-btn" style={{ textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="dash-bottom-loading"><div className="spinner" /></div>
          ) : upcomingAppointments.length === 0 ? (
            <div className="dash-bottom-empty">
              <Bell size={28} color="var(--color-text-faint)" />
              <span>No upcoming appointments</span>
            </div>
          ) : (
            <div className="dash-activity-list">
              {upcomingAppointments.map((appt) => {
                const apptStageType = appt.stageType || (appt.patientType === 'pregnant' ? 'pregnancy' : 'immunization');
                const isPregAppt    = apptStageType === 'pregnancy';
                return (
                  <Link
                    key={appt.id}
                    href={appt.patientId ? `/patients/${appt.patientId}` : '/patients'}
                    className="dash-appt-item"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <PatientAvatar name={appt.patientName} type={appt.patientType} stageType={apptStageType} />
                    <div className="dash-appt-info">
                      <div className="dash-appt-name">{appt.patientName}</div>
                      <div className="dash-appt-stage" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span>{appt.stageName}</span>
                        {appt.patientType === 'both' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                            borderRadius: '999px',
                            background: isPregAppt ? '#fff1f2' : '#eff6ff',
                            color: isPregAppt ? '#e11d48' : '#0284c7',
                          }}>
                            {isPregAppt ? 'Pregnancy' : 'Immunization'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="dash-appt-right">
                      <div className="dash-appt-date">
                        {appt.isToday ? 'Today' : appt.isTomorrow ? 'Tomorrow' : formatApptDate(appt.scheduledDate)}
                      </div>
                      <span className={`dash-appt-badge ${appt.isToday ? 'badge-today' : appt.isTomorrow ? 'badge-tomorrow' : 'badge-upcoming'}`}>
                        {appt.isToday ? 'Today' : appt.isTomorrow ? 'Tomorrow' : 'Upcoming'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <Link href="/patients" className="dash-card-view-more">
            <span>View all appointments</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* ── Card 3: Recent Activity ── */}
        <div className="dash-bottom-card">
          <div className="dash-bottom-card-header">
            <div className="dash-card-header-left">
              <div className="dash-card-icon-wrap purple">
                <Activity size={15} />
              </div>
              <span className="dash-bottom-card-title">Recent Activity</span>
              <span className="dash-card-badge">{recentActivity.length}</span>
            </div>
            <Link href="/settings?tab=activity" className="dash-viewall-btn" style={{ textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="dash-bottom-loading"><div className="spinner" /></div>
          ) : recentActivity.length === 0 ? (
            <div className="dash-bottom-empty">
              <Activity size={28} color="var(--color-text-faint)" />
              <span>No recent activity</span>
            </div>
          ) : (
            <div className="dash-activity-list">
              {recentActivity.map((item, i) => (
                <Link
                  key={i}
                  href={item.patientId ? `/patients/${item.patientId}` : '/patients'}
                  className="dash-activity-item"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <ActivityIcon type={item.type} />
                  <div className="dash-activity-info">
                    <div className="dash-activity-desc">{item.description}</div>
                    <div className="dash-activity-patient">{item.patient}</div>
                  </div>
                  <div className="dash-activity-time">{formatTime(item.time)}</div>
                </Link>
              ))}
            </div>
          )}

          <Link href="/settings?tab=activity" className="dash-card-view-more">
            <span>View activity log</span>
            <ArrowRight size={13} />
          </Link>
        </div>

      </div>

      {/* ── Footer Inspirational Banner ── */}
      <div className="dashboard-footer-banner">
        <img
          src="/dashboard-footer-bg.png"
          alt="Every Mother Every Child"
          className="dashboard-footer-bg-img footer-img-light"
        />
        <img
          src="/image.png"
          alt="Every Mother Every Child"
          className="dashboard-footer-bg-img footer-img-dark"
        />
        <div className="dashboard-footer-content">
          <div className="dashboard-footer-left">
            <h2 className="dashboard-footer-title">Every Mother. Every Child.</h2>
            <p className="dashboard-footer-subtitle">A Healthier Tomorrow.</p>
            <div className="dashboard-footer-teal-bar" />
          </div>

          <div className="dashboard-footer-right">
            <div className="dashboard-footer-tagline">
              <span>Care</span>
              <span>Track</span>
              <span>Thrive</span>
            </div>
            <div className="dashboard-footer-pink-bar" />
          </div>
        </div>
      </div>

    </div>
  );
}
