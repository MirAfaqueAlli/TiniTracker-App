'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users, Plus, X, Search, ChevronLeft, ChevronRight,
  RefreshCw, Calendar, Eye, EyeOff, AlertCircle,
  ChevronDown, UserPlus, Pencil, Check,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';
import PasswordStrengthMeter, { evaluatePassword } from '@/components/PasswordStrengthMeter';

const LIMIT = 10;

const ROLE_CONFIG = {
  doctor_pregnancy: {
    label: 'Doctor – Pregnancy',
    dept: 'Maternal & Antenatal Care',
    bg: '#fff1f2',
    color: '#e11d48',
    border: '#fecdd3',
  },
  doctor_immunization: {
    label: 'Doctor – Immunization',
    dept: 'Pediatric Immunization',
    bg: '#eff6ff',
    color: '#1d4ed8',
    border: '#bfdbfe',
  },
  staff: {
    label: 'Clinical Staff',
    dept: 'Outreach & Care Coordination',
    bg: '#e8f7f2',
    color: '#00857c',
    border: '#c4e9de',
  },
  admin: {
    label: 'Hospital Admin',
    dept: 'Staff & Hospital Administration',
    bg: '#f3e8ff',
    color: '#7e22ce',
    border: '#e9d5ff',
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
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function avatarClass(roleKey) {
  if (roleKey === 'admin') return 'role-admin';
  if (roleKey === 'doctor_pregnancy' || roleKey === 'doctor_immunization') return 'role-doctor';
  return '';
}

function PasswordField({ id, value, onChange, show, onToggle, placeholder, disabled, autoComplete = 'new-password' }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{ paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          border: 0, background: 'none', color: 'var(--s-ink-3)', cursor: 'pointer', padding: 4,
          display: 'grid', placeItems: 'center',
        }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

/* ── Add Staff Member Modal ── */
function AddStaffModal({ onClose, onSuccess, availableRoles = [] }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!form.password) {
      setError('Password is required.');
      return;
    }
    const pwdEval = evaluatePassword(form.password);
    if (!pwdEval.isValid) {
      const missingDetails = pwdEval.missing.map((m) => m.shortLabel).join(', ');
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
    { value: 'staff', label: 'Clinical Staff', sub: 'Access maternal & child records and manage reminders' },
    { value: 'doctor_pregnancy', label: 'Doctor – Pregnancy', sub: 'Dedicated antenatal & maternal pregnancy tracking' },
    { value: 'doctor_immunization', label: 'Doctor – Immunization', sub: 'Childhood vaccination & immunization schedule tracking' },
    { value: 'admin', label: 'Hospital Admin', sub: 'Full administrative access over hospital staff & settings' },
    ...availableRoles.filter((r) => !['admin', 'staff', 'doctor_pregnancy', 'doctor_immunization'].includes(r.key)).map((r) => ({
      value: r.key,
      label: r.name,
      sub: `${r.dept || 'Custom Role'} — ${r.description || 'Configured via Role Matrix'}`,
    })),
  ];

  const selectedRole = roleOptions.find((o) => o.value === form.role);

  return (
    <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="dlg dlg-wide" role="dialog" aria-modal="true" aria-labelledby="dlg-staff-title">
        <div className="dlg-form">
          <div className="dlg-head">
            <div>
              <h2 className="dlg-title" id="dlg-staff-title">Add staff member</h2>
              <p className="dlg-sub">Create a staff account with a temporary password — they will change it on first login.</p>
            </div>
            <button type="button" className="close-x" onClick={onClose} disabled={loading} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={submit} className="dlg-form" style={{ maxHeight: 'none' }}>
            <div className="dlg-body">
              {error && (
                <div className="form-summary" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertCircle size={16} style={{ flex: 'none', marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="staff-name">Full name <span className="req">*</span></label>
                  <input
                    id="staff-name"
                    type="text"
                    placeholder="e.g. Dr. Priya Sharma"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label htmlFor="staff-email">Email address / login ID <span className="req">*</span></label>
                  <input
                    id="staff-email"
                    type="email"
                    placeholder="e.g. priya.sharma@hospital.in"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="staff-password">Temporary password <span className="req">*</span></label>
                  <PasswordField
                    id="staff-password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    placeholder="Minimum 8 characters"
                    disabled={loading}
                  />
                  <span className="hint">Staff will be asked to change this password on first login.</span>
                  {form.password ? <PasswordStrengthMeter password={form.password} /> : null}
                </div>

                <div className="field">
                  <label htmlFor="staff-role">User type / role <span className="req">*</span></label>
                  <div className="select-wrap" style={{ display: 'block' }}>
                    <select
                      id="staff-role"
                      value={form.role}
                      onChange={(e) => set('role', e.target.value)}
                      disabled={loading}
                      required
                      style={{ width: '100%', borderRadius: 8, borderColor: 'var(--s-line-strong)', background: 'var(--s-surface)', color: 'var(--s-ink)', padding: '8px 30px 8px 10px' }}
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="chev" />
                  </div>
                  {selectedRole && <span className="hint">{selectedRole.sub}</span>}
                </div>
              </div>
            </div>

            <div className="dlg-foot">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Registering...
                  </>
                ) : (
                  <>
                    <Plus size={15} />
                    Register staff
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Staff Member Modal ── */
function EditStaffModal({ staffMember, onClose, onSuccess, availableRoles = [] }) {
  const [form, setForm] = useState({
    name: staffMember?.name || '',
    email: staffMember?.email || '',
    password: '',
    role: staffMember?.role || 'staff',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (form.password) {
      const pwdEval = evaluatePassword(form.password);
      if (!pwdEval.isValid) {
        const missingDetails = pwdEval.missing.map((m) => m.shortLabel).join(', ');
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
      if (form.password) payload.password = form.password;
      const res = await api.put(`/auth/staff/${staffMember.id}`, payload);
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update staff member');
    } finally {
      setLoading(false);
    }
  }

  const roleOptions = [
    { value: 'staff', label: 'Clinical Staff', sub: 'Access maternal & child records and manage reminders' },
    { value: 'doctor_pregnancy', label: 'Doctor – Pregnancy', sub: 'Dedicated antenatal & maternal pregnancy tracking' },
    { value: 'doctor_immunization', label: 'Doctor – Immunization', sub: 'Childhood vaccination & immunization schedule tracking' },
    { value: 'admin', label: 'Hospital Admin', sub: 'Full administrative access over hospital staff & settings' },
    ...availableRoles.filter((r) => !['admin', 'staff', 'doctor_pregnancy', 'doctor_immunization'].includes(r.key)).map((r) => ({
      value: r.key,
      label: r.name,
      sub: `${r.dept || 'Custom Role'} — ${r.description || 'Configured via Role Matrix'}`,
    })),
  ];

  const selectedRole = roleOptions.find((o) => o.value === form.role);

  return (
    <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="dlg dlg-wide" role="dialog" aria-modal="true" aria-labelledby="dlg-edit-staff-title">
        <div className="dlg-form">
          <div className="dlg-head">
            <div>
              <h2 className="dlg-title" id="dlg-edit-staff-title">Edit staff member</h2>
              <p className="dlg-sub">Update their profile, assigned role or account password.</p>
            </div>
            <button type="button" className="close-x" onClick={onClose} disabled={loading} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={submit} className="dlg-form" style={{ maxHeight: 'none' }}>
            <div className="dlg-body">
              {error && (
                <div className="form-summary" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertCircle size={16} style={{ flex: 'none', marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="edit-staff-name">Full name <span className="req">*</span></label>
                  <input
                    id="edit-staff-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-staff-email">Email address / login ID <span className="req">*</span></label>
                  <input
                    id="edit-staff-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="edit-staff-password">Reset password <span className="hint">(optional)</span></label>
                  <PasswordField
                    id="edit-staff-password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    placeholder="Leave blank to keep current"
                    disabled={loading}
                  />
                  {form.password ? <PasswordStrengthMeter password={form.password} /> : null}
                </div>

                <div className="field">
                  <label htmlFor="edit-staff-role">User type / role <span className="req">*</span></label>
                  <div className="select-wrap" style={{ display: 'block' }}>
                    <select
                      id="edit-staff-role"
                      value={form.role}
                      onChange={(e) => set('role', e.target.value)}
                      disabled={loading}
                      required
                      style={{ width: '100%', borderRadius: 8, borderColor: 'var(--s-line-strong)', background: 'var(--s-surface)', color: 'var(--s-ink)', padding: '8px 30px 8px 10px' }}
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="chev" />
                  </div>
                  {selectedRole && <span className="hint">{selectedRole.sub}</span>}
                </div>
              </div>
            </div>

            <div className="dlg-foot">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Main Staff Component ── */
export default function StaffSettingsTab() {
  const { user } = useAuthStore();
  const canCreateStaff = hasUserPermission(user, 'staff.create');
  const canEditStaff = hasUserPermission(user, 'staff.edit');
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
    api.get('/settings/roles').then((res) => {
      setAvailableRoles(res.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const dynamicRoleMap = useMemo(() => {
    const map = { ...ROLE_CONFIG };
    availableRoles.forEach((r) => {
      if (!map[r.key]) {
        map[r.key] = {
          label: r.name,
          dept: r.dept || 'Clinical Care',
          bg: r.bg || '#e8f7f2',
          color: r.color || '#00857c',
          border: r.border || '#c4e9de',
        };
      }
    });
    return map;
  }, [availableRoles]);

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
      const doctorsCount = all.filter((s) => s.role?.startsWith('doctor_')).length;
      const staffCount = all.filter((s) => s.role === 'staff').length;
      const adminsCount = all.filter((s) => s.role === 'admin').length;
      setSummaryStats({
        total: totalCount,
        doctors: doctorsCount,
        staff: staffCount,
        admins: adminsCount,
      });
    } catch {
      /* ignore */
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
    const timer = setTimeout(fetchSummary, 0);
    return () => clearTimeout(timer);
  }, [fetchSummary]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function handleSearch(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleRoleChange(value) {
    setRoleFilter(value);
    setPage(1);
  }

  function handleStaffCreated(name) {
    setShowModal(false);
    setToast({ type: 'success', message: `Staff member "${name}" registered successfully.` });
    fetchSummary();
    load();
  }

  function handleStaffUpdated(updated) {
    setEditingStaff(null);
    setToast({ type: 'success', message: `Staff member "${updated.name}" details updated successfully.` });
    fetchSummary();
    load();
  }

  const roleFilterTabs = useMemo(() => ([
    { key: '', label: 'All Staff', count: summaryStats.total },
    { key: 'doctor', label: 'Doctors', count: summaryStats.doctors },
    { key: 'staff', label: 'Clinical Staff', count: summaryStats.staff },
    { key: 'admin', label: 'Admins', count: summaryStats.admins },
    ...availableRoles.filter((r) => !['admin', 'staff', 'doctor_pregnancy', 'doctor_immunization'].includes(r.key)).map((r) => ({
      key: r.key,
      label: r.name,
      count: r.user_count || 0,
    })),
  ]), [availableRoles, summaryStats]);

  return (
    <>
      {toast && (
        <div className="toasts" role="status" aria-live="polite">
          <div className="toast">
            <div>
              <span className="toast-k">Saved</span>
              <span>{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      <section className="setting-panel" aria-labelledby="staff-title">
        <div className="panel-head">
          <div>
            <h2 className="setting-title" id="staff-title">Staff management</h2>
            
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { fetchSummary(); load(true); }}
              title="Refresh directory"
              disabled={loading || refreshing}
            >
              <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
            {canCreateStaff && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                <UserPlus size={16} />
                Add staff
              </button>
            )}
          </div>
        </div>

        <div className="staff-strip">
          <div className="metric">
            <span className="metric-value">{summaryStats.total}</span>
            <span className="metric-label">Total members</span>
          </div>
          <div className="metric">
            <span className="metric-value">{summaryStats.doctors}</span>
            <span className="metric-label">Doctors</span>
          </div>
          <div className="metric">
            <span className="metric-value">{summaryStats.staff}</span>
            <span className="metric-label">Clinical staff</span>
          </div>
          <div className="metric">
            <span className="metric-value">{summaryStats.admins}</span>
            <span className="metric-label">Administrators</span>
          </div>
        </div>

        <div className="toolbar">
          <div className="tool-search">
            <Search size={14} />
            <input
              type="search"
              placeholder="Search staff"
              value={search}
              onChange={handleSearch}
              autoComplete="off"
              aria-label="Search staff by name or email"
            />
          </div>

          <div className="select-wrap">
            <select value={roleFilter} onChange={(e) => handleRoleChange(e.target.value)} aria-label="Filter by role">
              {roleFilterTabs.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label} ({tab.count})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="chev" />
          </div>

          <span className="result-count">
            Showing <b>{staff.length}</b> of {total} staff
          </span>

          {(search || roleFilter) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setRoleFilter(''); setPage(1); }}>
              Clear
            </button>
          )}
        </div>

        <div className="table-wrap">
          {loading && !refreshing ? (
            <div className="loading-block">
              <RefreshCw size={26} style={{ animation: 'spin 1s linear infinite' }} />
              <p>Loading staff directory...</p>
            </div>
          ) : staff.length === 0 ? (
            <div className="empty">
              <Users size={28} />
              <strong>No staff members found</strong>
              <span>{search || roleFilter ? 'Try adjusting your search or role filter.' : 'Add your hospital\'s first staff account to get started.'}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setRoleFilter(''); }}>
                Clear filters
              </button>
            </div>
          ) : (
            <table className="staff-table">
              <thead>
                <tr>
                  <th scope="col">Staff</th>
                  <th scope="col">Role</th>
                  <th scope="col">Joined</th>
                  {canEditStaff && <th scope="col" style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const cfg = dynamicRoleMap[member.role] || {
                    label: member.role || 'Staff',
                    dept: 'Hospital Staff',
                    bg: '#f1f5f9',
                    color: '#475569',
                    border: '#cbd5e1',
                  };
                  const isCurrentUser = user?.id === member.id;

                  return (
                    <tr key={member.id}>
                      <td className="c-staff">
                        <div className="p-cell">
                          <span className={`avatar-sm ${avatarClass(member.role)}`} aria-hidden="true">
                            {getInitials(member.name)}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="p-name">
                              {member.name}
                              {isCurrentUser && <span className="chip" style={{ marginLeft: 7, padding: '3px 6px', fontSize: 9.5 }}>You</span>}
                            </div>
                            <div className="p-sub">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="c-role">
                        <span
                          className="role-chip"
                          style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                        >
                          {cfg.label}
                        </span>
                        <div className="role-chip-dept">{cfg.dept}</div>
                      </td>
                      <td className="c-date">
                        <div className="staff-date">
                          <Calendar size={13} style={{ marginRight: 5, verticalAlign: '-2px', color: 'var(--s-ink-3)' }} />
                          {formatDate(member.createdAt)}
                        </div>
                      </td>
                      {canEditStaff && (
                        <td className="c-act" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => setEditingStaff(member)}
                            title={`Edit ${member.name}`}
                          >
                            <Pencil size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="staff-foot">
          <span>{total} staff account{total === 1 ? '' : 's'}</span>
          {pages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`page-btn${p === page ? ' active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="page-btn"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                aria-label="Next page"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </section>

      {showModal && canCreateStaff && (
        <AddStaffModal
          onClose={() => setShowModal(false)}
          onSuccess={handleStaffCreated}
          availableRoles={availableRoles}
        />
      )}

      {editingStaff && canEditStaff && (
        <EditStaffModal
          staffMember={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSuccess={handleStaffUpdated}
          availableRoles={availableRoles}
        />
      )}
    </>
  );
}
