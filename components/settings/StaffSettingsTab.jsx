'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users, Plus, X, Search, ChevronLeft, ChevronRight,
  RefreshCw, ShieldCheck, Stethoscope, Activity,
  Mail, Calendar, Eye, EyeOff, CheckCircle2,
  AlertCircle, ChevronDown, UserPlus, HeartPulse, Baby,
  Pencil, Check
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import PasswordStrengthMeter, { evaluatePassword } from '@/components/PasswordStrengthMeter';

const LIMIT = 10;

/* ── Role styling and configuration ── */
const ROLE_CONFIG = {
  doctor_pregnancy: {
    label: 'Doctor – Pregnancy',
    dept: 'Maternal & Antenatal Care',
    deptIcon: HeartPulse,
    bg: '#fff1f2',
    color: '#e11d48',
    border: '#fecdd3',
    avatarBg: '#ffe4e6',
    avatarColor: '#be185d',
  },
  doctor_immunization: {
    label: 'Doctor – Immunization',
    dept: 'Pediatric Immunization',
    deptIcon: Baby,
    bg: '#eff6ff',
    color: '#1d4ed8',
    border: '#bfdbfe',
    avatarBg: '#dbeafe',
    avatarColor: '#1d4ed8',
  },
  staff: {
    label: 'Clinical Staff',
    dept: 'Outreach & Care Coordination',
    deptIcon: Activity,
    bg: '#e8f7f2',
    color: '#00857c',
    border: '#c4e9de',
    avatarBg: '#e6f7f5',
    avatarColor: '#00857c',
  },
  admin: {
    label: 'Hospital Admin',
    dept: 'Staff & Hospital Administration',
    deptIcon: ShieldCheck,
    bg: '#f3e8ff',
    color: '#7e22ce',
    border: '#e9d5ff',
    avatarBg: '#f5eeff',
    avatarColor: '#7e22ce',
  },
};

function getInitials(name) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/* ── Add Staff Member Modal ── */
function AddStaffModal({ onClose, onSuccess, availableRoles = [] }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!form.password) {
      setError('Password is required.');
      return;
    }
    const pwdEval = evaluatePassword(form.password);
    if (!pwdEval.isValid) {
      const missingDetails = pwdEval.missing.map(m => m.shortLabel).join(', ');
      setError(`Password is not strong enough. Missing: ${missingDetails}`);
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register-staff', form);
      onSuccess(form.name);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register staff member');
    } finally {
      setLoading(false);
    }
  }

  const roleOptions = [
    { value: 'staff',               label: 'Clinical Staff',          sub: 'Access maternal & child records and manage reminders' },
    { value: 'doctor_pregnancy',    label: 'Doctor – Pregnancy',      sub: 'Dedicated antenatal & maternal pregnancy tracking' },
    { value: 'doctor_immunization', label: 'Doctor – Immunization',   sub: 'Childhood vaccination & immunization schedule tracking' },
    { value: 'admin',               label: 'Hospital Admin',          sub: 'Full administrative access over hospital staff & settings' },
    ...availableRoles.filter(r => !['admin', 'staff', 'doctor_pregnancy', 'doctor_immunization'].includes(r.key)).map(r => ({
      value: r.key,
      label: r.name,
      sub: `${r.dept || 'Custom Role'} — ${r.description || 'Configured via Role Matrix'}`
    }))
  ];

  return (
    <div className="staff-modal-overlay" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="staff-modal-card" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="staff-modal-header">
          <div className="staff-modal-header-icon-wrap">
            <UserPlus size={20} />
          </div>
          <div className="staff-modal-header-text">
            <h2 className="staff-modal-title">Register Staff Member</h2>
            <p className="staff-modal-subtitle">Add a new medical, clinical, or administrative staff account.</p>
          </div>
          <button
            type="button"
            className="staff-modal-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={submit} className="staff-modal-form">
          {error && (
            <div className="staff-modal-alert error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Full Name */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="staff-name">
              Full Name <span className="req">*</span>
            </label>
            <input
              id="staff-name"
              type="text"
              className="staff-form-input"
              placeholder="e.g. Dr. Priya Sharma"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Email */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="staff-email">
              Email Address / Login ID <span className="req">*</span>
            </label>
            <input
              id="staff-email"
              type="email"
              className="staff-form-input"
              placeholder="e.g. priya.sharma@hospital.in"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="staff-password">
              Temporary Password <span className="req">*</span>
            </label>
            <div className="staff-password-wrap">
              <input
                id="staff-password"
                type={showPassword ? 'text' : 'password'}
                className="staff-form-input has-toggle"
                placeholder="Minimum 8 characters"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
              <button
                type="button"
                className="staff-password-toggle"
                onClick={() => setShowPassword(s => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="staff-form-hint">Staff will be asked to change this password on first login.</span>
            {/* Live Password Strength Meter & Criteria Checklist (only shown when password is entered) */}
            {form.password && form.password.length > 0 ? (
              <PasswordStrengthMeter password={form.password} />
            ) : null}
          </div>

          {/* User Type / Role Dropdown */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="staff-role">
              User Type / Role <span className="req">*</span>
            </label>
            <div className="staff-select-wrap">
              <select
                id="staff-role"
                className="staff-form-select"
                value={form.role}
                onChange={e => set('role', e.target.value)}
                disabled={loading}
                required
              >
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="staff-select-arrow" aria-hidden="true">
                <ChevronDown size={16} />
              </div>
            </div>
            {(() => {
              const selectedRole = roleOptions.find(o => o.value === form.role);
              const cfg = ROLE_CONFIG[form.role] || { color: '#00857c' };
              return selectedRole ? (
                <div className="staff-role-desc-preview">
                  <span className="staff-role-desc-dot" style={{ backgroundColor: cfg.color }} />
                  <span>{selectedRole.sub}</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Footer Actions */}
          <div className="staff-modal-footer">
            <button
              type="button"
              className="staff-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="staff-btn-submit"
              disabled={loading}
              id="btn-confirm-add-staff"
            >
              {loading ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#fff', borderTopColor: 'transparent' }} />
              ) : (
                <>
                  <Plus size={15} />
                  <span>Register Staff</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Edit Staff Member Modal ── */
function EditStaffModal({ staffMember, onClose, onSuccess, currentRole, availableRoles = [] }) {
  const [form, setForm] = useState({
    name: staffMember?.name || '',
    email: staffMember?.email || '',
    password: '',
    role: staffMember?.role || 'staff',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (form.password) {
      const pwdEval = evaluatePassword(form.password);
      if (!pwdEval.isValid) {
        const missingDetails = pwdEval.missing.map(m => m.shortLabel).join(', ');
        setError(`New password is not strong enough. Missing: ${missingDetails}`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      };
      if (form.password) {
        payload.password = form.password;
      }
      const res = await api.put(`/auth/staff/${staffMember.id}`, payload);
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update staff member');
    } finally {
      setLoading(false);
    }
  }

  const roleOptions = [
    { value: 'staff',               label: 'Clinical Staff',          sub: 'Access maternal & child records and manage reminders' },
    { value: 'doctor_pregnancy',    label: 'Doctor – Pregnancy',      sub: 'Dedicated antenatal & maternal pregnancy tracking' },
    { value: 'doctor_immunization', label: 'Doctor – Immunization',   sub: 'Childhood vaccination & immunization schedule tracking' },
    { value: 'admin',               label: 'Hospital Admin',          sub: 'Full administrative access over hospital staff & settings' },
    ...availableRoles.filter(r => !['admin', 'staff', 'doctor_pregnancy', 'doctor_immunization'].includes(r.key)).map(r => ({
      value: r.key,
      label: r.name,
      sub: `${r.dept || 'Custom Role'} — ${r.description || 'Configured via Role Matrix'}`
    }))
  ];

  return (
    <div className="staff-modal-overlay" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="staff-modal-card" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="staff-modal-header">
          <div className="staff-modal-header-icon-wrap" style={{ background: '#f0fdf9', color: '#00857c' }}>
            <Pencil size={18} />
          </div>
          <div className="staff-modal-header-text">
            <h2 className="staff-modal-title">Edit Staff Member</h2>
            <p className="staff-modal-subtitle">Update credentials, profile information, or assigned hospital role.</p>
          </div>
          <button
            type="button"
            className="staff-modal-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={submit} className="staff-modal-form">
          {error && (
            <div className="staff-modal-alert error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Full Name */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="edit-staff-name">
              Full Name <span className="req">*</span>
            </label>
            <input
              id="edit-staff-name"
              type="text"
              className="staff-form-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Email */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="edit-staff-email">
              Email Address / Login ID <span className="req">*</span>
            </label>
            <input
              id="edit-staff-email"
              type="email"
              className="staff-form-input"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* New Password (Optional) */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="edit-staff-password">
              Reset Password <span style={{ fontWeight: 400, color: '#57747a', fontSize: '0.8rem' }}>(leave blank to keep current)</span>
            </label>
            <div className="staff-password-wrap">
              <input
                id="edit-staff-password"
                type={showPassword ? 'text' : 'password'}
                className="staff-form-input has-toggle"
                placeholder="Enter new password (min. 8 chars)"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                minLength={8}
                disabled={loading}
              />
              <button
                type="button"
                className="staff-password-toggle"
                onClick={() => setShowPassword(s => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Live Password Strength Meter & Criteria Checklist for Reset Password */}
            {form.password ? <PasswordStrengthMeter password={form.password} /> : null}
          </div>

          {/* User Type / Role Dropdown */}
          <div className="staff-form-group">
            <label className="staff-form-label" htmlFor="edit-staff-role">
              User Type / Role <span className="req">*</span>
            </label>
            <div className="staff-select-wrap">
              <select
                id="edit-staff-role"
                className="staff-form-select"
                value={form.role}
                onChange={e => set('role', e.target.value)}
                disabled={loading}
                required
              >
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="staff-select-arrow" aria-hidden="true">
                <ChevronDown size={16} />
              </div>
            </div>
            {(() => {
              const selectedRole = roleOptions.find(o => o.value === form.role);
              const cfg = ROLE_CONFIG[form.role] || { color: '#00857c' };
              return selectedRole ? (
                <div className="staff-role-desc-preview">
                  <span className="staff-role-desc-dot" style={{ backgroundColor: cfg.color }} />
                  <span>{selectedRole.sub}</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Footer Actions */}
          <div className="staff-modal-footer">
            <button
              type="button"
              className="staff-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="staff-btn-submit"
              disabled={loading}
              id="btn-confirm-edit-staff"
            >
              {loading ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#fff', borderTopColor: 'transparent' }} />
              ) : (
                <>
                  <Check size={15} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Staff Component ── */
export default function StaffSettingsTab() {
  const { user } = useAuthStore();
  const [staff, setStaff] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [toast, setToast] = useState(null);
  const [availableRoles, setAvailableRoles] = useState([]);

  useEffect(() => {
    api.get('/settings/roles').then(res => {
      setAvailableRoles(res.data || []);
    }).catch(() => {});
  }, []);

  const dynamicRoleMap = useMemo(() => {
    const map = { ...ROLE_CONFIG };
    availableRoles.forEach(r => {
      if (!map[r.key]) {
        map[r.key] = {
          label: r.name,
          dept: r.dept || 'Clinical Care',
          deptIcon: ShieldCheck,
          bg: r.bg || '#e8f7f2',
          color: r.color || '#00857c',
          border: r.border || '#c4e9de',
          avatarBg: '#e6f7f5',
          avatarColor: r.color || '#00857c',
        };
      }
    });
    return map;
  }, [availableRoles]);

  /* Live Hospital Summary Counters */
  const [summaryStats, setSummaryStats] = useState({
    total: 0,
    doctors: 0,
    staff: 0,
    admins: 0,
  });

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/auth/staff?limit=1000');
      const all = res.data?.staff || res.data || [];
      const totalCount = res.data?.total || all.length;
      const doctorsCount = all.filter(s => s.role?.startsWith('doctor_')).length;
      const staffCount = all.filter(s => s.role === 'staff').length;
      const adminsCount = all.filter(s => s.role === 'admin').length;
      setSummaryStats({
        total: totalCount,
        doctors: doctorsCount,
        staff: staffCount,
        admins: adminsCount,
      });
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const res = await api.get(`/auth/staff?${params}`);
      const data = res.data;
      if (Array.isArray(data)) {
        setStaff(data);
        setTotal(data.length);
        setPages(1);
      } else {
        setStaff(data.staff || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleTabChange(roleKey) {
    setRoleFilter(roleKey);
    setPage(1);
  }

  function handleStaffCreated(name) {
    setShowModal(false);
    setToast({
      show: true,
      title: 'Registration Successful',
      message: `Staff member "${name}" registered successfully.`,
      type: 'success',
    });
    setTimeout(() => setToast(null), 5000);
    fetchSummary();
    load();
  }

  function handleStaffUpdated(updated) {
    setEditingStaff(null);
    setToast({
      show: true,
      title: 'Profile Updated',
      message: `Staff member "${updated.name}" details updated successfully.`,
      type: 'success',
    });
    setTimeout(() => setToast(null), 5000);
    fetchSummary();
    load();
  }

  const roleFilterTabs = [
    { key: '',                    label: 'All Staff',      count: summaryStats.total },
    { key: 'doctor',              label: 'Doctors',        count: summaryStats.doctors },
    { key: 'staff',               label: 'Clinical Staff', count: summaryStats.staff },
    { key: 'admin',               label: 'Admins',         count: summaryStats.admins },
    ...availableRoles.filter(r => !['admin', 'staff', 'doctor_pregnancy', 'doctor_immunization'].includes(r.key)).map(r => ({
      key: r.key,
      label: r.name,
      count: r.user_count || 0
    }))
  ];

  return (
    <div className="staff-page-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`staff-floating-toast ${toast.type}`}>
          <div className="toast-icon-wrap">
            <CheckCircle2 size={18} />
          </div>
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToast(null)}
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="staff-header-row">
        <div>
          <h2 className="staff-page-title" style={{ fontSize: '1.4rem' }}>Staff Directory & Access</h2>
          
        </div>

        <div className="staff-header-actions">
          <button
            type="button"
            className="staff-btn-refresh"
            onClick={() => { fetchSummary(); load(true); }}
            title="Refresh Directory"
            disabled={loading || refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            className="staff-btn-add"
            onClick={() => setShowModal(true)}
            id="btn-add-staff"
          >
            <Plus size={16} />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* ── 4 Stat Overview Cards ── */}
      <div className="staff-stats-grid">
        {/* Card 1: Total Staff */}
        <div className="staff-stat-card">
          <div className="staff-stat-icon-box teal">
            <Users size={22} />
          </div>
          <div className="staff-stat-info">
            <span className="staff-stat-label">Total Members</span>
            <span className="staff-stat-value">{summaryStats.total}</span>
            <span className="staff-stat-sub">Active hospital accounts</span>
          </div>
        </div>

        {/* Card 2: Doctors */}
        <div className="staff-stat-card">
          <div className="staff-stat-icon-box rose">
            <HeartPulse size={22} />
          </div>
          <div className="staff-stat-info">
            <span className="staff-stat-label">Doctors</span>
            <span className="staff-stat-value">{summaryStats.doctors}</span>
            <span className="staff-stat-sub">Maternal &amp; Pediatric</span>
          </div>
        </div>

        {/* Card 3: Clinical Staff */}
        <div className="staff-stat-card">
          <div className="staff-stat-icon-box blue">
            <Activity size={22} />
          </div>
          <div className="staff-stat-info">
            <span className="staff-stat-label">Clinical Staff</span>
            <span className="staff-stat-value">{summaryStats.staff}</span>
            <span className="staff-stat-sub">Care Coordinators</span>
          </div>
        </div>

        {/* Card 4: Admins */}
        <div className="staff-stat-card">
          <div className="staff-stat-icon-box purple">
            <ShieldCheck size={22} />
          </div>
          <div className="staff-stat-info">
            <span className="staff-stat-label">Administrators</span>
            <span className="staff-stat-value">{summaryStats.admins}</span>
            <span className="staff-stat-sub">Hospital Admin Access</span>
          </div>
        </div>
      </div>

      {/* ── Filter / Control Bar ── */}
      <div className="staff-controls-row">
        {/* Role Filter Tabs */}
        <div className="staff-tabs">
          {roleFilterTabs.map(tab => {
            const isActive = roleFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={`staff-tab${isActive ? ' active' : ''}`}
                onClick={() => handleTabChange(tab.key)}
              >
                <span>{tab.label}</span>
                <span className="staff-tab-badge">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="staff-search-box">
          <Search size={16} className="staff-search-icon" />
          <input
            type="text"
            className="staff-search-input"
            placeholder="Search staff by name or email…"
            value={search}
            onChange={handleSearch}
          />
          {search && (
            <button
              type="button"
              className="staff-search-clear"
              onClick={() => { setSearch(''); setPage(1); }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Staff Table Card ── */}
      <div className="staff-table-card">
        {loading && !refreshing ? (
          <div className="staff-empty-state">
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p className="staff-empty-title">Loading staff directory…</p>
          </div>
        ) : staff.length === 0 ? (
          <div className="staff-empty-state">
            <div className="staff-empty-icon">
              <Users size={28} />
            </div>
            <p className="staff-empty-title">No staff members found</p>
            <p className="staff-empty-subtitle">
              {search || roleFilter
                ? 'Try adjusting your search query or role filter.'
                : 'Click "Add Staff Member" above to create your hospital\'s first staff account.'}
            </p>
          </div>
        ) : (
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role &amp; Department</th>
                  <th>Joined Date</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(member => {
                  const cfg = dynamicRoleMap[member.role] || {
                    label: member.role || 'Staff',
                    dept: 'Hospital Staff',
                    deptIcon: Activity,
                    bg: '#f1f5f9',
                    color: '#475569',
                    border: '#cbd5e1',
                    avatarBg: '#e2e8f0',
                    avatarColor: '#475569',
                  };
                  const DeptIcon = cfg.deptIcon || Activity;
                  const isCurrentUser = user?.id === member.id;

                  return (
                    <tr key={member.id}>
                      {/* User info & avatar */}
                      <td>
                        <div className="staff-member-cell">
                          <div
                            className="staff-avatar-circle"
                            style={{
                              backgroundColor: cfg.avatarBg,
                              color: cfg.avatarColor,
                              border: `1px solid ${cfg.border || '#cbd5e1'}`,
                            }}
                          >
                            {getInitials(member.name)}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span className="staff-name-text">{member.name}</span>
                              {isCurrentUser && (
                                <span className="staff-you-badge">You</span>
                              )}
                            </div>
                            <div className="staff-email-text">{member.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Dept Tag */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                          <span
                            className="staff-role-badge"
                            style={{
                              backgroundColor: cfg.bg,
                              color: cfg.color,
                              borderColor: cfg.border,
                            }}
                          >
                            <span className="dot" />
                            <span>{cfg.label}</span>
                          </span>
                          <div className="staff-dept-text">
                            <DeptIcon size={12} color={cfg.color} style={{ flexShrink: 0 }} />
                            <span>{cfg.dept}</span>
                          </div>
                        </div>
                      </td>

                      {/* Added Date */}
                      <td>
                        <div className="staff-date-text">
                          <Calendar size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
                          <span>{formatDate(member.createdAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="staff-action-btn-edit"
                          onClick={() => setEditingStaff(member)}
                          title={`Edit ${member.name}`}
                          id={`btn-edit-staff-${member.id}`}
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pages > 1 && (
          <div className="staff-pagination-bar">
            <div className="staff-pagination-summary">
              Showing page <strong>{page}</strong> of <strong>{pages}</strong> ({total} total staff)
            </div>
            <div className="staff-pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                className="staff-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`staff-page-btn${p === page ? ' active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}

              <button
                type="button"
                className="staff-page-btn"
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Staff Modal ── */}
      {showModal && (
        <AddStaffModal
          onClose={() => setShowModal(false)}
          onSuccess={handleStaffCreated}
          availableRoles={availableRoles}
        />
      )}

      {/* ── Edit Staff Modal ── */}
      {editingStaff && (
        <EditStaffModal
          staffMember={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSuccess={handleStaffUpdated}
          availableRoles={availableRoles}
        />
      )}
    </div>
  );
}
