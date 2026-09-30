'use client';

import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck, Clock, Building2, Plus, Trash2, Check, X,
  Save, AlertCircle, RefreshCw, Send, CheckCircle2, Lock,
  ChevronRight, Users, Bell, Activity, Eye, EyeOff,
  Stethoscope, Calendar, HeartPulse, Baby, Sparkles, Filter,
  HelpCircle, Settings as SettingsIcon, PlayCircle, Info, CreditCard,
  Search
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';
import ActivityLogsTab from '@/components/settings/ActivityLogsTab';
import HospitalSettingsTab from '@/components/settings/HospitalSettingsTab';
import SubscriptionTab from '@/components/settings/SubscriptionTab';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('roles'); // 'roles' | 'staff' | 'activity' | 'system' | 'hospital' | 'subscription'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [portalRoot, setPortalRoot] = useState(null);

  useEffect(() => {
    setPortalRoot(document.body);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['roles', 'staff', 'activity', 'system', 'hospital', 'subscription'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }

    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['roles', 'staff', 'activity', 'system', 'hospital', 'subscription'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function handleTabChange(tabKey) {
    setActiveTab(tabKey);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabKey);
      window.history.replaceState({}, '', url.toString());
    }
  }

  function showToast(type, title, message) {
    setToast({ type, title, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }

  // ── 1. Roles & Permissions State ──────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [permGroups, setPermGroups] = useState([]);
  const [permMatrix, setPermMatrix] = useState({});
  const [initialMatrix, setInitialMatrix] = useState({});
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [permSearch, setPermSearch] = useState('');

  // Filtered permission groups based on search term
  const filteredPermGroups = useMemo(() => {
    if (!permSearch.trim()) return permGroups;
    const q = permSearch.toLowerCase().trim();
    return permGroups
      .map(group => ({
        ...group,
        permissions: (group.permissions || []).filter(p =>
          (p.label && p.label.toLowerCase().includes(q)) ||
          (p.key && p.key.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
        ),
      }))
      .filter(group => group.permissions.length > 0);
  }, [permGroups, permSearch]);

  // Custom Role Modal State
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleForm, setNewRoleForm] = useState({
    name: '',
    dept: 'General Care',
    description: '',
    color: '#00857c',
    copyPermissionsFrom: 'staff',
  });

  // Delete Custom Role Confirmation
  const [deletingRoleId, setDeletingRoleId] = useState(null);

  // ── 2. System & Batch Automation State ─────────────────────────────────────
  const [sysConfig, setSysConfig] = useState({
    batch_cron_time: '08:00',
    batch_auto_run: true,
    reminder_7d_enabled: true,
    reminder_1d_enabled: true,
    reminder_today_enabled: true,
    missed_flag_enabled: true,
  });
  const [savingSysConfig, setSavingSysConfig] = useState(false);
  const [runningCron, setRunningCron] = useState(false);
  const [cronResult, setCronResult] = useState(null);

  // ── 3. Hospital Profile State ──────────────────────────────────────────────
  const [hospitalName, setHospitalName] = useState('');

  // Fetch initial data
  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    try {
      const [permsRes, rolesRes, sysRes, hospRes] = await Promise.all([
        api.get('/settings/permissions'),
        api.get('/settings/roles'),
        api.get('/settings/system-config'),
        api.get('/hospitals'),
      ]);

      setPermGroups(permsRes.data.groups || []);
      setPermMatrix(permsRes.data.matrix || {});
      setInitialMatrix(JSON.parse(JSON.stringify(permsRes.data.matrix || {})));
      setRoles(rolesRes.data || []);
      setSysConfig(sysRes.data || {});
      setHospitalName(hospRes.data?.name || '');
    } catch (err) {
      console.error('Error loading settings:', err);
      showToast('error', 'Failed to load', err.response?.data?.error || 'Could not load settings data');
    } finally {
      setLoading(false);
    }
  }

  // Detect unsaved permission changes
  const hasUnsavedPermissions = useMemo(() => {
    return JSON.stringify(permMatrix) !== JSON.stringify(initialMatrix);
  }, [permMatrix, initialMatrix]);

  // Toggle single permission
  function togglePermission(roleKey, permKey) {
    if (roleKey === 'admin') return; // Admin is permanent

    setPermMatrix(prev => {
      const roleMap = { ...(prev[roleKey] || {}) };
      roleMap[permKey] = !roleMap[permKey];
      return { ...prev, [roleKey]: roleMap };
    });
  }

  // Set all permissions for a specific role
  function setAllForRole(roleKey, value) {
    if (roleKey === 'admin') return;

    setPermMatrix(prev => {
      const roleMap = { ...(prev[roleKey] || {}) };
      permGroups.forEach(g => {
        g.permissions.forEach(p => {
          roleMap[p.key] = value;
        });
      });
      return { ...prev, [roleKey]: roleMap };
    });
  }

  // Save permission matrix
  async function handleSavePermissions() {
    setSavingMatrix(true);
    try {
      await api.put('/settings/permissions', { bulkMatrix: permMatrix });
      setInitialMatrix(JSON.parse(JSON.stringify(permMatrix)));
      showToast('success', 'Permissions Saved', 'Role permissions matrix updated successfully.');
    } catch (err) {
      showToast('error', 'Save Failed', err.response?.data?.error || 'Could not save permissions');
    } finally {
      setSavingMatrix(false);
    }
  }

  // Discard permission changes
  function handleDiscardPermissions() {
    setPermMatrix(JSON.parse(JSON.stringify(initialMatrix)));
  }

  // Create custom role
  async function handleCreateRole(e) {
    e.preventDefault();
    if (!newRoleForm.name.trim()) return;

    setCreatingRole(true);
    try {
      const res = await api.post('/settings/roles', newRoleForm);
      showToast('success', 'Role Created', `Custom role "${newRoleForm.name}" created successfully.`);
      setShowRoleModal(false);
      setNewRoleForm({
        name: '',
        dept: 'General Care',
        description: '',
        color: '#00857c',
        copyPermissionsFrom: 'staff',
      });
      // Reload permissions and roles
      const [pRes, rRes] = await Promise.all([
        api.get('/settings/permissions'),
        api.get('/settings/roles'),
      ]);
      setRoles(rRes.data || []);
      setPermMatrix(pRes.data.matrix || {});
      setInitialMatrix(JSON.parse(JSON.stringify(pRes.data.matrix || {})));
    } catch (err) {
      showToast('error', 'Error Creating Role', err.response?.data?.error || 'Failed to create role');
    } finally {
      setCreatingRole(false);
    }
  }

  // Delete custom role
  async function handleDeleteRole(roleId) {
    try {
      await api.delete(`/settings/roles/${roleId}`);
      showToast('success', 'Role Deleted', 'Custom role removed successfully.');
      setDeletingRoleId(null);
      // Reload
      const [pRes, rRes] = await Promise.all([
        api.get('/settings/permissions'),
        api.get('/settings/roles'),
      ]);
      setRoles(rRes.data || []);
      setPermMatrix(pRes.data.matrix || {});
      setInitialMatrix(JSON.parse(JSON.stringify(pRes.data.matrix || {})));
    } catch (err) {
      showToast('error', 'Delete Failed', err.response?.data?.error || 'Failed to delete role');
    }
  }

  // Save System Config
  async function handleSaveSystemConfig(e) {
    e.preventDefault();
    setSavingSysConfig(true);
    try {
      const res = await api.put('/settings/system-config', sysConfig);
      setSysConfig(res.data.config);
      showToast('success', 'Configuration Updated', 'Daily batch timing and reminder preferences saved.');
    } catch (err) {
      showToast('error', 'Save Failed', err.response?.data?.error || 'Failed to update system config');
    } finally {
      setSavingSysConfig(false);
    }
  }

  // Trigger manual batch cron
  async function handleTriggerCron() {
    setRunningCron(true);
    setCronResult(null);
    try {
      const res = await api.post('/notifications/cron');
      const r = res.data.result || {};
      setCronResult(r);
      showToast('success', 'Batch Executed', `Processed: ${(r.reminder_7d || 0) + (r.reminder_1d || 0) + (r.reminder_today || 0)} reminders, ${r.missed || 0} missed flagged.`);
    } catch (err) {
      showToast('error', 'Batch Execution Failed', err.response?.data?.error || 'Failed to run batch');
    } finally {
      setRunningCron(false);
    }
  }



  // Filtered roles for the matrix table
  const displayedRoles = useMemo(() => {
    if (selectedRoleFilter === 'all') return roles;
    return roles.filter(r => r.key === selectedRoleFilter);
  }, [roles, selectedRoleFilter]);

  if (loading) {
    return (
      <div className="settings-loading-wrap">
        <RefreshCw className="settings-spin" size={32} />
        <p>Loading administration settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-container">
      {/* ── Toast Alert ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`settings-toast ${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={20} className="toast-icon success" />
          ) : (
            <AlertCircle size={20} className="toast-icon error" />
          )}
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-msg">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="settings-header">
        <div className="settings-header-left">
          <div className="settings-badge">
            <ShieldCheck size={16} />
            <span>Admin Control Panel</span>
          </div>
          <h1 className="settings-title">Hospital & System Settings</h1>
          <p className="settings-subtitle">
            Configure role-based access permissions, customize staff privileges, schedule WhatsApp batch timing, and manage hospital preferences.
          </p>
        </div>

        <div className="settings-header-right">
          <div className="hospital-tag">
            <Building2 size={16} />
            <span>{hospitalName || 'Your Hospital'}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation ─────────────────────────────────────────────────── */}
      <div className="settings-tabs-bar">
        <button
          className={`settings-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
          onClick={() => handleTabChange('roles')}
          id="tab-btn-roles"
        >
          <ShieldCheck size={18} />
          <span>Roles &amp; Permissions</span>
          <span className="tab-pill">{roles.length}</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => handleTabChange('staff')}
          id="tab-btn-staff"
        >
          <Users size={18} />
          <span>Staff Management</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => handleTabChange('activity')}
          id="tab-btn-activity"
        >
          <Activity size={18} />
          <span>Activity Logs</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => handleTabChange('system')}
          id="tab-btn-system"
        >
          <Clock size={18} />
          <span>Batch &amp; Automation</span>
          <span className="tab-pill time">{sysConfig.batch_cron_time || '08:00'}</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'hospital' ? 'active' : ''}`}
          onClick={() => handleTabChange('hospital')}
          id="tab-btn-hospital"
        >
          <Building2 size={18} />
          <span>Hospital &amp; WhatsApp</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'subscription' ? 'active' : ''}`}
          onClick={() => handleTabChange('subscription')}
          id="tab-btn-subscription"
        >
          <CreditCard size={18} />
          <span>Subscription</span>
          {user?.subscription?.is_trial && (
            <span className="tab-pill time" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              Trial
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: ROLES & ACCESS CONTROL ───────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className="settings-tab-content">
          {/* Roles Overview Cards */}
          <div className="roles-overview-section">
            <div className="section-header-flex">
              <div>
                <h2 className="section-title">Configured Hospital Roles</h2>
                <p className="section-sub">
                  Default and custom staff roles available for your medical team.
                </p>
              </div>
              <button
                className="btn-create-role"
                onClick={() => setShowRoleModal(true)}
              >
                <Plus size={16} />
                <span>Create Custom Role</span>
              </button>
            </div>

            <div className="roles-cards-grid">
              {roles.map(r => (
                <div key={r.key} className="role-card" style={{ borderColor: r.border || '#e2e8f0' }}>
                  <div className="role-card-header">
                    <div
                      className="role-badge"
                      style={{
                        backgroundColor: r.bg || '#e8f7f2',
                        color: r.color || '#00857c',
                        borderColor: r.border || '#c4e9de'
                      }}
                    >
                      {r.is_system ? <ShieldCheck size={14} /> : <Users size={14} />}
                      <span>{r.name}</span>
                    </div>

                    {!r.is_system && (
                      <button
                        className="role-del-btn"
                        title="Delete custom role"
                        onClick={() => setDeletingRoleId(r.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div className="role-dept">{r.dept || 'Clinical Department'}</div>
                  <p className="role-desc">
                    {r.description || (r.is_system ? 'System default access profile.' : 'Custom hospital clinical role.')}
                  </p>

                  <div className="role-card-footer">
                    <span className="role-user-count">
                      <strong>{r.user_count || 0}</strong> active {r.user_count === 1 ? 'member' : 'members'}
                    </span>
                    <button
                      className="btn-role-quick-edit"
                      onClick={() => setSelectedRoleFilter(selectedRoleFilter === r.key ? 'all' : r.key)}
                    >
                      {selectedRoleFilter === r.key ? 'Show All Roles' : 'Focus Role'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="permissions-matrix-section">
            <div className="matrix-header-bar">
              <div>
                <h2 className="section-title">Role Permission Matrix</h2>
                <p className="section-sub">
                  Control exact reading, writing, editing, and execution permissions across the entire hospital system.
                </p>
              </div>

              <div className="matrix-filter-wrap" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--color-text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search permissions…"
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    style={{
                      padding: '7px 12px 7px 30px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text)',
                      fontSize: '0.8rem',
                      outline: 'none',
                      width: '210px',
                    }}
                  />
                  {permSearch && (
                    <button
                      onClick={() => setPermSearch('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="filter-label">Filter View:</span>
                  <select
                    className="role-select-filter"
                    value={selectedRoleFilter}
                    onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  >
                    <option value="all">All Roles ({roles.length})</option>
                    {roles.map(r => (
                      <option key={r.key} value={r.key}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="matrix-table-container">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="th-permission">Permission Module & Description</th>
                    {displayedRoles.map(r => (
                      <th key={r.key} className="th-role">
                        <div className="th-role-header">
                          <span
                            className="role-th-tag"
                            style={{
                              backgroundColor: r.bg || '#e8f7f2',
                              color: r.color || '#00857c',
                              borderColor: r.border || '#c4e9de'
                            }}
                          >
                            {r.name}
                          </span>
                          {r.key === 'admin' ? (
                            <span className="th-locked-note">
                              <Lock size={12} /> Permanent
                            </span>
                          ) : (
                            <div className="th-actions">
                              <button
                                className="th-action-btn"
                                title="Grant all permissions to this role"
                                onClick={() => setAllForRole(r.key, true)}
                              >
                                All
                              </button>
                              <span className="th-action-sep">/</span>
                              <button
                                className="th-action-btn"
                                title="Revoke all permissions for this role"
                                onClick={() => setAllForRole(r.key, false)}
                              >
                                None
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredPermGroups.length === 0 && (
                    <tr>
                      <td colSpan={displayedRoles.length + 1} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--color-text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <Search size={22} style={{ opacity: 0.6 }} />
                          <span>No permissions found matching &ldquo;{permSearch}&rdquo;</span>
                          <button
                            onClick={() => setPermSearch('')}
                            style={{
                              marginTop: '0.25rem',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-primary, #00857c)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Clear search
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {filteredPermGroups.map((group, gIdx) => (
                    <Fragment key={group.group || `group-${gIdx}`}>
                      {/* Group Header Row */}
                      <tr className="tr-group-header">
                        <td colSpan={displayedRoles.length + 1}>
                          <div className="group-header-title">
                            <span className="group-bullet" />
                            <span>{group.group}</span>
                            <span className="group-count">({group.permissions.length} rules)</span>
                          </div>
                        </td>
                      </tr>

                      {/* Permission Rows */}
                      {group.permissions.map((perm) => (
                        <tr key={perm.key} className="tr-permission">
                          <td className="td-perm-info">
                            <div className="perm-name">{perm.label}</div>
                            <div className="perm-desc">{perm.description}</div>
                            <div className="perm-key-tag">{perm.key}</div>
                          </td>

                          {displayedRoles.map((r) => {
                            const isChecked = Boolean(permMatrix[r.key]?.[perm.key]);
                            const isAdmin = r.key === 'admin';

                            return (
                              <td key={`${r.key}-${perm.key}`} className="td-perm-toggle">
                                {isAdmin ? (
                                  <div className="admin-lock-pill" title="Admins retain full authority">
                                    <Lock size={14} />
                                    <span>Granted</span>
                                  </div>
                                ) : (
                                  <label className="switch-toggle" title={`Toggle ${perm.label} for ${r.name}`}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => togglePermission(r.key, perm.key)}
                                    />
                                    <span className="slider round"></span>
                                  </label>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Floating Unsaved Changes Bar — strictly fixed at bottom of screen via body Portal */}
          {hasUnsavedPermissions && portalRoot && createPortal(
            <div
              className="floating-save-bar"
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 99999,
              }}
            >
              <div className="save-bar-left">
                <AlertCircle size={20} className="save-bar-alert-icon" />
                <div>
                  <div className="save-bar-title">Unsaved Permission Changes</div>
                  <div className="save-bar-sub">You have modified role permissions that are not yet published.</div>
                </div>
              </div>

              <div className="save-bar-actions">
                <button
                  type="button"
                  className="btn-discard"
                  onClick={handleDiscardPermissions}
                  disabled={savingMatrix}
                >
                  Discard Changes
                </button>
                <button
                  type="button"
                  className="btn-save-primary"
                  onClick={handleSavePermissions}
                  disabled={savingMatrix}
                >
                  {savingMatrix ? (
                    <>
                      <RefreshCw size={16} className="settings-spin" />
                      <span>Saving Matrix...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Publish Permissions</span>
                    </>
                  )}
                </button>
              </div>
            </div>,
            portalRoot
          )}


        </div>
      )}

      {/* ── TAB 2: STAFF MANAGEMENT ─────────────────────────────────────────── */}
      {activeTab === 'staff' && (
        <div className="settings-tab-content">
          <StaffSettingsTab />
        </div>
      )}

      {/* ── TAB 3: ACTIVITY LOGS ────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <div className="settings-tab-content">
          <ActivityLogsTab />
        </div>
      )}

      {/* ── TAB 4: SYSTEM & BATCH AUTOMATION ────────────────────────────────── */}
      {activeTab === 'system' && (
        <div className="settings-tab-content">
          <div className="system-config-grid">
            {/* Batch Timing Card */}
            <div className="config-card">
              <div className="config-card-header">
                <div className="config-icon-wrap clock">
                  <Clock size={22} />
                </div>
                <div>
                  <h3 className="config-card-title">Daily WhatsApp Batch Execution Time</h3>
                  <p className="config-card-sub">
                    Specify the exact time every morning when TiniTraker automatically scans scheduled stages and dispatches WhatsApp reminders.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSystemConfig} className="batch-time-form">
                <div className="time-picker-wrapper">
                  <label className="input-label">Scheduled Batch Time (24-Hour)</label>
                  <div className="time-input-flex">
                    <input
                      type="time"
                      className="time-picker-input"
                      value={sysConfig.batch_cron_time || '08:00'}
                      onChange={(e) => setSysConfig({ ...sysConfig, batch_cron_time: e.target.value })}
                    />
                    <div className="time-info-pill">
                      <Sparkles size={14} />
                      <span>Daily at {sysConfig.batch_cron_time || '08:00'} AM</span>
                    </div>
                  </div>
                  <span className="field-hint">
                    Format: HH:MM. Messages will be sent in patients&apos; local hospital timezone.
                  </span>
                </div>

                <div className="config-divider" />

                <h4 className="config-subheading">Automated Reminder Channels</h4>

                <div className="toggles-list">
                  <div className="toggle-item">
                    <div className="toggle-info">
                      <div className="toggle-title">7-Day Advance Reminders</div>
                      <div className="toggle-desc">Send notification 7 days before an upcoming antenatal visit or infant immunization.</div>
                    </div>
                    <label className="switch-toggle">
                      <input
                        type="checkbox"
                        checked={sysConfig.reminder_7d_enabled}
                        onChange={(e) => setSysConfig({ ...sysConfig, reminder_7d_enabled: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <div className="toggle-title">1-Day Advance Reminders</div>
                      <div className="toggle-desc">Send reminder 1 day prior to ensure attendance and travel preparation.</div>
                    </div>
                    <label className="switch-toggle">
                      <input
                        type="checkbox"
                        checked={sysConfig.reminder_1d_enabled}
                        onChange={(e) => setSysConfig({ ...sysConfig, reminder_1d_enabled: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <div className="toggle-title">Same-Day Appointment Alert</div>
                      <div className="toggle-desc">Send morning notification on the exact scheduled appointment date.</div>
                    </div>
                    <label className="switch-toggle">
                      <input
                        type="checkbox"
                        checked={sysConfig.reminder_today_enabled}
                        onChange={(e) => setSysConfig({ ...sysConfig, reminder_today_enabled: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  <div className="toggle-item">
                    <div className="toggle-info">
                      <div className="toggle-title">Missed Visit Detection & Follow-up</div>
                      <div className="toggle-desc">Automatically mark unvisited past stages as &quot;missed&quot; and notify the patient to reschedule.</div>
                    </div>
                    <label className="switch-toggle">
                      <input
                        type="checkbox"
                        checked={sysConfig.missed_flag_enabled}
                        onChange={(e) => setSysConfig({ ...sysConfig, missed_flag_enabled: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  <div className="toggle-item highlight">
                    <div className="toggle-info">
                      <div className="toggle-title">Automatic Daily Execution</div>
                      <div className="toggle-desc">Allow background scheduler to trigger batch notifications automatically every day.</div>
                    </div>
                    <label className="switch-toggle">
                      <input
                        type="checkbox"
                        checked={sysConfig.batch_auto_run}
                        onChange={(e) => setSysConfig({ ...sysConfig, batch_auto_run: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                </div>

                <div className="form-submit-footer">
                  <button
                    type="submit"
                    className="btn-save-primary"
                    disabled={savingSysConfig}
                  >
                    {savingSysConfig ? (
                      <>
                        <RefreshCw size={16} className="settings-spin" />
                        <span>Saving System Settings...</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>Save System Preferences</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Manual Run Card */}
            <div className="config-card right-panel">
              <div className="config-card-header">
                <div className="config-icon-wrap play">
                  <PlayCircle size={22} />
                </div>
                <div>
                  <h3 className="config-card-title">Manual Batch Dispatch</h3>
                  <p className="config-card-sub">
                    Execute the daily notification scan immediately on demand.
                  </p>
                </div>
              </div>

              <div className="manual-run-body">
                <p className="manual-run-text">
                  You can manually execute the reminder queue right now. This will evaluate all patients in your hospital and send due WhatsApp messages according to your enabled channels.
                </p>

                <button
                  className="btn-trigger-cron"
                  onClick={handleTriggerCron}
                  disabled={runningCron}
                >
                  {runningCron ? (
                    <>
                      <RefreshCw size={18} className="settings-spin" />
                      <span>Executing Batch Job...</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      <span>Trigger Batch Job Now</span>
                    </>
                  )}
                </button>

                {cronResult && (
                  <div className="cron-result-card">
                    <div className="cron-result-title">
                      <CheckCircle2 size={16} />
                      <span>Batch Completed Successfully</span>
                    </div>
                    <div className="cron-stats-grid">
                      <div className="stat-box">
                        <span className="stat-num">{cronResult.reminder_7d || 0}</span>
                        <span className="stat-lbl">7-Day Due</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-num">{cronResult.reminder_1d || 0}</span>
                        <span className="stat-lbl">1-Day Due</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-num">{cronResult.reminder_today || 0}</span>
                        <span className="stat-lbl">Today Due</span>
                      </div>
                      <div className="stat-box missed">
                        <span className="stat-num">{cronResult.missed || 0}</span>
                        <span className="stat-lbl">Flagged Missed</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: HOSPITAL & WHATSAPP PROFILE ──────────────────────────────── */}
      {activeTab === 'hospital' && (
        <div className="settings-tab-content">
          <HospitalSettingsTab />
        </div>
      )}

      {/* ── TAB 6: SUBSCRIPTION & PLAN UPGRADE ─────────────────────────────── */}
      {activeTab === 'subscription' && (
        <div className="settings-tab-content">
          <SubscriptionTab />
        </div>
      )}

      {/* ── CREATE CUSTOM ROLE MODAL ────────────────────────────────────────── */}
      {showRoleModal && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <ShieldCheck size={20} className="modal-icon" />
                <h3>Create Custom Role</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowRoleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="modal-body">
              <div className="form-group">
                <label className="input-label">Role Display Name *</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. Senior Antenatal Nurse"
                  value={newRoleForm.name}
                  onChange={(e) => setNewRoleForm({ ...newRoleForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="input-label">Department / Unit *</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. Maternal & Child Health"
                  value={newRoleForm.dept}
                  onChange={(e) => setNewRoleForm({ ...newRoleForm, dept: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="input-label">Description (Optional)</label>
                <textarea
                  className="textarea-input"
                  rows={2}
                  placeholder="Brief note on duties and scope..."
                  value={newRoleForm.description}
                  onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="input-label">Clone Initial Permissions From</label>
                <select
                  className="text-input"
                  value={newRoleForm.copyPermissionsFrom}
                  onChange={(e) => setNewRoleForm({ ...newRoleForm, copyPermissionsFrom: e.target.value })}
                >
                  <option value="staff">Clinical Staff (Standard Care Coordinator)</option>
                  <option value="doctor_pregnancy">Doctor – Pregnancy (Antenatal Specialist)</option>
                  <option value="doctor_immunization">Doctor – Immunization (Pediatric Specialist)</option>
                </select>
                <span className="field-hint">You can fine-tune specific permissions in the matrix after creating.</span>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-discard"
                  onClick={() => setShowRoleModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-save-primary"
                  disabled={creatingRole}
                >
                  {creatingRole ? (
                    <>
                      <RefreshCw size={16} className="settings-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Role</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE ROLE CONFIRMATION MODAL ──────────────────────────────────── */}
      {deletingRoleId && (
        <div className="modal-overlay" onClick={() => setDeletingRoleId(null)}>
          <div className="modal-box modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap danger">
                <Trash2 size={20} className="modal-icon error" />
                <h3>Delete Custom Role</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setDeletingRoleId(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="delete-confirm-text">
                Are you sure you want to delete this custom role? This will remove its permission definitions.
              </p>
              <p className="delete-confirm-sub">
                Note: Roles cannot be deleted if any staff members are currently assigned to them.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-discard"
                onClick={() => setDeletingRoleId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-delete-confirm"
                onClick={() => handleDeleteRole(deletingRoleId)}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
