'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Clock, Building2, Plus, Trash2, X,
  Save, RefreshCw, Users, Activity, CreditCard, Search,
  PlayCircle, Stethoscope, HeartPulse, Baby, Sparkles,
  ChevronDown,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';
import ActivityLogsTab from '@/components/settings/ActivityLogsTab';
import HospitalSettingsTab from '@/components/settings/HospitalSettingsTab';
import SubscriptionTab from '@/components/settings/SubscriptionTab';

const VALID_TABS = ['roles', 'staff', 'activity', 'system', 'hospital', 'subscription'];
const TAB_ALIASES = { batch: 'system', logs: 'activity' };

const SECTIONS = [
  {
    key: 'roles',
    label: 'Roles & permissions',
    icon: ShieldCheck,
    permission: 'settings.manage_roles',
    meta: (ctx) => `${ctx.roles.length} roles`,
  },
  {
    key: 'staff',
    label: 'Staff management',
    icon: Users,
    permission: 'staff.view',
    meta: () => 'Directory & access',
  },
  {
    key: 'activity',
    label: 'Activity logs',
    icon: Activity,
    permission: 'activity.view',
    meta: () => 'Hospital audit trail',
  },
  {
    key: 'system',
    label: 'Batch & automation',
    icon: Clock,
    permission: 'settings.edit_system',
    meta: (ctx) => (ctx.sysConfig.batch_auto_run === false ? 'Paused' : `${ctx.sysConfig.batch_cron_time || '08:00'} daily`),
  },
  {
    key: 'hospital',
    label: 'Hospital & WhatsApp',
    icon: Building2,
    permission: 'settings.edit_hospital',
    meta: () => 'Profile & gateway',
  },
  {
    key: 'subscription',
    label: 'Subscription & billing',
    icon: CreditCard,
    adminOnly: true,
    meta: (ctx) => {
      const sub = ctx.subscription;
      if (!sub) return 'Plan & upgrades';
      return `${sub.days_remaining ?? 0} days left`;
    },
  },
];

function roleIconFor(key) {
  if (key === 'admin') return ShieldCheck;
  if (key === 'staff') return Users;
  if (key === 'doctor_pregnancy') return HeartPulse;
  if (key === 'doctor_immunization') return Baby;
  return Stethoscope;
}

function roleShort(name) {
  if (!name) return '';
  return name.length > 16 ? name.split(' ')[0] : name;
}

export default function SettingsPage() {
  const { user, sessionChecked } = useAuthStore();
  const canViewSettings = hasUserPermission(user, 'settings.view');
  const canManageRoles = hasUserPermission(user, 'settings.manage_roles');
  const canViewStaff = hasUserPermission(user, 'staff.view');
  const canViewActivity = hasUserPermission(user, 'activity.view');
  const canEditSystem = hasUserPermission(user, 'settings.edit_system');
  const canEditHospital = hasUserPermission(user, 'settings.edit_hospital');
  const canTriggerBatch = hasUserPermission(user, 'notifications.trigger_batch');
  const isAdminUser = user?.role === 'admin' || user?.role === 'superadmin';

  const visibleSections = useMemo(() => {
    return SECTIONS.filter((s) => {
      if (s.adminOnly) return isAdminUser;
      if (s.permission) return hasUserPermission(user, s.permission);
      return true;
    });
  }, [user, isAdminUser]);

  const [activeTab, setActiveTab] = useState('roles');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const rawTab = params.get('tab');
      const tabParam = TAB_ALIASES[rawTab] || rawTab;
      if (tabParam && VALID_TABS.includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
    const timer = setTimeout(syncFromUrl, 0);
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, []);

  useEffect(() => {
    if (visibleSections.length > 0) {
      const isCurrentTabVisible = visibleSections.some((s) => s.key === activeTab);
      if (!isCurrentTabVisible) {
        setActiveTab(visibleSections[0].key);
      }
    }
  }, [visibleSections, activeTab]);

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

  const filteredPermGroups = useMemo(() => {
    if (!permSearch.trim()) return permGroups;
    const q = permSearch.toLowerCase().trim();
    return permGroups
      .map((group) => ({
        ...group,
        permissions: (group.permissions || []).filter(
          (p) =>
            (p.label && p.label.toLowerCase().includes(q)) ||
            (p.key && p.key.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q))
        ),
      }))
      .filter((group) => group.permissions.length > 0);
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
  const [initialSysConfig, setInitialSysConfig] = useState(null);
  const [savingSysConfig, setSavingSysConfig] = useState(false);
  const [runningCron, setRunningCron] = useState(false);
  const [cronResult, setCronResult] = useState(null);

  // ── 3. Hospital Profile State ──────────────────────────────────────────────

  async function loadAllData() {
    setLoading(true);
    try {
      const [permsRes, rolesRes, sysRes] = await Promise.all([
        canManageRoles ? api.get('/settings/permissions').catch(() => null) : Promise.resolve(null),
        canManageRoles ? api.get('/settings/roles').catch(() => null) : Promise.resolve(null),
        canEditSystem ? api.get('/settings/system-config').catch(() => null) : Promise.resolve(null),
      ]);

      if (permsRes?.data) {
        setPermGroups(permsRes.data.groups || []);
        setPermMatrix(permsRes.data.matrix || {});
        setInitialMatrix(JSON.parse(JSON.stringify(permsRes.data.matrix || {})));
      }
      if (rolesRes?.data) {
        setRoles(rolesRes.data || []);
      }
      if (sysRes?.data) {
        setSysConfig(sysRes.data || {});
        setInitialSysConfig(JSON.parse(JSON.stringify(sysRes.data || {})));
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      showToast('error', 'Failed to load', err.response?.data?.error || 'Could not load settings data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadAllData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageRoles, canEditSystem]);

  const hasUnsavedPermissions = useMemo(
    () => JSON.stringify(permMatrix) !== JSON.stringify(initialMatrix),
    [permMatrix, initialMatrix]
  );

  const hasUnsavedSystemConfig = useMemo(
    () => Boolean(initialSysConfig) && JSON.stringify(sysConfig) !== JSON.stringify(initialSysConfig),
    [sysConfig, initialSysConfig]
  );

  function togglePermission(roleKey, permKey) {
    if (roleKey === 'admin') return;
    setPermMatrix((prev) => {
      const roleMap = { ...(prev[roleKey] || {}) };
      roleMap[permKey] = !roleMap[permKey];
      return { ...prev, [roleKey]: roleMap };
    });
  }


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

  function handleDiscardPermissions() {
    setPermMatrix(JSON.parse(JSON.stringify(initialMatrix)));
  }

  async function handleCreateRole(e) {
    e.preventDefault();
    if (!newRoleForm.name.trim()) return;

    setCreatingRole(true);
    try {
      await api.post('/settings/roles', newRoleForm);
      showToast('success', 'Role Created', `Custom role "${newRoleForm.name}" created successfully.`);
      setShowRoleModal(false);
      setNewRoleForm({
        name: '',
        dept: 'General Care',
        description: '',
        color: '#00857c',
        copyPermissionsFrom: 'staff',
      });
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

  async function handleDeleteRole(roleId) {
    try {
      await api.delete(`/settings/roles/${roleId}`);
      showToast('success', 'Role Deleted', 'Custom role removed successfully.');
      setDeletingRoleId(null);
      setSelectedRoleFilter('all');
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

  async function handleSaveSystemConfig(e) {
    e.preventDefault();
    setSavingSysConfig(true);
    try {
      const res = await api.put('/settings/system-config', sysConfig);
      const saved = res.data.config || sysConfig;
      setSysConfig(saved);
      setInitialSysConfig(JSON.parse(JSON.stringify(saved)));
      showToast('success', 'Configuration Updated', 'Daily batch timing and reminder preferences saved.');
    } catch (err) {
      showToast('error', 'Save Failed', err.response?.data?.error || 'Failed to update system config');
    } finally {
      setSavingSysConfig(false);
    }
  }

  function handleDiscardSystemConfig() {
    if (initialSysConfig) {
      setSysConfig(JSON.parse(JSON.stringify(initialSysConfig)));
    }
  }

  async function handleTriggerCron() {
    setRunningCron(true);
    setCronResult(null);
    try {
      const res = await api.post('/notifications/cron');
      const r = res.data.result || {};
      setCronResult(r);
      showToast(
        'success',
        'Batch Executed',
        `Processed: ${(r.reminder_7d || 0) + (r.reminder_1d || 0) + (r.reminder_today || 0)} reminders, ${r.missed || 0} missed flagged.`
      );
    } catch (err) {
      showToast('error', 'Batch Execution Failed', err.response?.data?.error || 'Failed to run batch');
    } finally {
      setRunningCron(false);
    }
  }

  const displayedRoles = useMemo(() => {
    if (selectedRoleFilter === 'all') return roles;
    return roles.filter((r) => r.key === selectedRoleFilter);
  }, [roles, selectedRoleFilter]);

  const subscription = user?.subscription || null;

  if (sessionChecked && !canViewSettings) {
    return (
      <div className="settings-v2" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: 'var(--s-surface)', border: '1px solid var(--s-line)', borderRadius: 12, padding: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--s-ink)', marginBottom: '0.75rem' }}>Access Restricted</h2>
          <p style={{ color: 'var(--s-ink-3)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            You do not have permission to view hospital settings. If you believe this is in error, please contact your hospital administrator.
          </p>
          <div style={{ marginTop: '1.25rem' }}>
            <Link href="/dashboard" className="btn btn-primary" style={{ display: 'inline-flex' }}>
              Return to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="settings-v2">
        <div className="setting-panel">
          <div className="loading-block">
            <RefreshCw size={30} className="settings-spin" style={{ animation: 'spin 1s linear infinite' }} />
            <p>Loading administration settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-v2">
      {/* ── Toasts ─────────────────────────────────────────────────────────── */}
      <div className="toasts" role="status" aria-live="polite">
        {toast && (
          <div className={`toast ${toast.type === 'error' ? 'err' : ''}`}>
            <div>
              <span className="toast-k">{toast.type === 'success' ? 'Saved' : 'Not saved'}</span>
              <span>{toast.message || toast.title}</span>
            </div>
          </div>
        )}
      </div>

      <div className="settings-grid">
        {/* ── Settings navigation ─────────────────────────────────────────── */}
        <aside className="settings-nav" aria-label="Settings sections">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeTab === section.key;
            const isDirty =
              (section.key === 'roles' && hasUnsavedPermissions) ||
              (section.key === 'system' && hasUnsavedSystemConfig);
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => handleTabChange(section.key)}
                aria-current={isActive ? 'true' : 'false'}
                data-dirty={isDirty ? 'true' : 'false'}
              >
                <span className="snav-icon" aria-hidden="true"><Icon size={16} /></span>
                <span className="snav-copy">
                  <span className="snav-label">{section.label}</span>
                  <span className="snav-meta">{section.meta({ roles, sysConfig, subscription })}</span>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="settings-main">
          {/* ── TAB 1: ROLES & ACCESS CONTROL ─────────────────────────────── */}
          {activeTab === 'roles' && canManageRoles && (
            <section className="setting-panel" aria-labelledby="roles-title">
              <div className="panel-head">
                <div>
                  <h2 className="setting-title" id="roles-title">Roles &amp; permissions</h2>

                </div>
                <div className="panel-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowRoleModal(true)}>
                    <Plus size={16} />
                    Add custom role
                  </button>
                </div>
              </div>

              <div className="panel-body">
                <div className="role-grid">
                  {roles.map((r) => {
                    const Icon = roleIconFor(r.key);
                    const members = r.user_count || 0;
                    return (
                      <article key={r.key} className="role-card">
                        <div className="role-top">
                          <span className="role-icon" aria-hidden="true"><Icon size={16} /></span>
                          <div className="role-title">
                            <div className="role-name">{r.name}</div>
                            <div className="role-desc">
                              {r.description || (r.is_system ? 'System default access profile.' : 'Custom hospital clinical role.')}
                            </div>
                          </div>
                          <span className={`role-kind${r.is_system ? '' : ' custom'}`}>
                            {r.is_system ? 'Default' : 'Custom'}
                          </span>
                        </div>
                        <div className="role-foot">
                          <span className="role-members">{members} active member{members === 1 ? '' : 's'}</span>
                          <div className="role-foot-actions">
                            <button
                              type="button"
                              className="linkbtn"
                              onClick={() => setSelectedRoleFilter(selectedRoleFilter === r.key ? 'all' : r.key)}
                            >
                              {selectedRoleFilter === r.key ? 'Show all' : 'Focus'}
                            </button>
                            {!r.is_system && (
                              <button
                                type="button"
                                className="linkbtn danger"
                                title="Delete custom role"
                                onClick={() => setDeletingRoleId(r.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="matrix-head">
                  <h3 className="matrix-title">Permission matrix</h3>
                  <div className="matrix-tools">
                    <div className="tool-search">
                      <Search size={14} />
                      <input
                        type="search"
                        placeholder="Search permissions"
                        value={permSearch}
                        onChange={(e) => setPermSearch(e.target.value)}
                        aria-label="Search permissions"
                      />
                    </div>
                    <div className="select-wrap">
                      <select
                        value={selectedRoleFilter}
                        onChange={(e) => setSelectedRoleFilter(e.target.value)}
                        aria-label="Filter matrix by role"
                      >
                        <option value="all">All roles ({roles.length})</option>
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>{r.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="chev" />
                    </div>
                  </div>
                </div>

                <div className="matrix-scroll">
                  <div
                    className="perm-matrix"
                    role="group"
                    aria-label="Role permission matrix"
                    style={{ '--role-cols': displayedRoles.length }}
                  >
                    <div className="perm-head">
                      <div className="perm-head-label">Permission</div>
                      {displayedRoles.map((r) => (
                        <div key={r.key} className="perm-head-role" title={r.name}>
                          <span>{roleShort(r.name)}</span>
                          <small>{r.user_count || 0}</small>
                        </div>
                      ))}
                    </div>

                    {filteredPermGroups.length === 0 && (
                      <div className="matrix-empty">
                        <Search size={22} />
                        <div>No permissions found matching &ldquo;{permSearch}&rdquo;</div>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setPermSearch('')}>
                          Clear search
                        </button>
                      </div>
                    )}

                    {filteredPermGroups.map((group, gIdx) => (
                      <div key={group.group || `group-${gIdx}`}>
                        <div className="perm-group">{group.group}</div>
                        {group.permissions.map((perm) => (
                          <div key={perm.key} className="perm-row">
                            <div className="perm-label">
                              <span className="perm-name">{perm.label}</span>
                              <span className="perm-desc">{perm.description}</span>
                              <span className="perm-key">{perm.key}</span>
                            </div>
                            <div className="perm-roles">
                              {displayedRoles.map((r) => {
                                const isAdmin = r.key === 'admin';
                                const isChecked = isAdmin || Boolean(permMatrix[r.key]?.[perm.key]);
                                return (
                                  <label
                                    key={`${r.key}-${perm.key}`}
                                    className={`perm-cell${isAdmin ? ' is-locked' : ''}`}
                                    title={isAdmin ? `Admin permissions are permanent` : `Toggle ${perm.label} for ${r.name}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={isAdmin}
                                      onChange={() => togglePermission(r.key, perm.key)}
                                      aria-label={`${r.name}: ${perm.label}`}
                                    />
                                    <span className="perm-box" aria-hidden="true">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6 9 17l-5-5" />
                                      </svg>
                                    </span>
                                    <span className="role-cell-name">{roleShort(r.name)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel-foot">
                <span className={`dirty-note${hasUnsavedPermissions ? ' on' : ''}`}>
                  {hasUnsavedPermissions ? 'Unsaved permission changes' : 'All permission changes saved'}
                </span>
                <div className="foot-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleDiscardPermissions}
                    disabled={!hasUnsavedPermissions || savingMatrix}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSavePermissions}
                    disabled={!hasUnsavedPermissions || savingMatrix}
                  >
                    {savingMatrix ? (
                      <>
                        <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={15} />
                        Save changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── TAB 2: STAFF MANAGEMENT ───────────────────────────────────── */}
          {activeTab === 'staff' && canViewStaff && <StaffSettingsTab />}

          {/* ── TAB 3: ACTIVITY LOGS ──────────────────────────────────────── */}
          {activeTab === 'activity' && canViewActivity && <ActivityLogsTab />}

          {/* ── TAB 4: SYSTEM & BATCH AUTOMATION ──────────────────────────── */}
          {activeTab === 'system' && canEditSystem && (
            <section className="setting-panel" aria-labelledby="automation-title">
              <div className="panel-head">
                <div>
                  <h2 className="setting-title" id="automation-title">Batch &amp; automation</h2>

                </div>
                <div className="panel-actions">
                  <span className={`chip ${sysConfig.batch_auto_run === false ? 'chip-warn' : 'chip-live'}`}>
                    <span className="live-dot" aria-hidden="true" />
                    {sysConfig.batch_auto_run === false ? 'Automation paused' : 'Automation on'}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveSystemConfig}>
                <div className="automation-grid">
                  <div className="auto-form">
                    <div className="setting-box">
                      <div className="switch-row">
                        <div className="switch-copy">
                          <div className="switch-title">Automatic daily execution</div>
                          <div className="switch-sub">
                            Allow the background scheduler to trigger the batch automatically every day.
                          </div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(sysConfig.batch_auto_run)}
                            onChange={(e) => setSysConfig({ ...sysConfig, batch_auto_run: e.target.checked })}
                          />
                          <span className="switch-track"><span className="switch-thumb" /></span>
                          <span className="sr-only">Enable automatic daily execution</span>
                        </label>
                      </div>
                    </div>

                    <div className="setting-box">
                      <div>
                        <h3 className="box-title">
                          <Clock size={16} />
                          Daily dispatch
                        </h3>
                        <p className="box-note">
                          One batch each morning for visits and doses scheduled in the reminder windows below.
                        </p>
                      </div>
                      <div className="form-row">
                        <div className="field">
                          <label htmlFor="batch-time">Dispatch time (24-hour)</label>
                          <input
                            id="batch-time"
                            type="time"
                            value={sysConfig.batch_cron_time || '08:00'}
                            onChange={(e) => setSysConfig({ ...sysConfig, batch_cron_time: e.target.value })}
                          />
                          <span className="hint">Messages use the patients&apos; local hospital timezone.</span>
                        </div>
                      </div>
                    </div>

                    <div className="setting-box">
                      <div>
                        <h3 className="box-title">
                          <Sparkles size={16} />
                          Milestone reminders
                        </h3>
                        <p className="box-note">Send separate nudges as the appointment gets closer.</p>
                      </div>

                      <div className="switch-row">
                        <div className="switch-copy">
                          <div className="switch-title">7-day reminder</div>
                          <div className="switch-sub">Send a week before the upcoming antenatal visit or immunization.</div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(sysConfig.reminder_7d_enabled)}
                            onChange={(e) => setSysConfig({ ...sysConfig, reminder_7d_enabled: e.target.checked })}
                          />
                          <span className="switch-track"><span className="switch-thumb" /></span>
                          <span className="sr-only">Enable 7-day reminder</span>
                        </label>
                      </div>

                      <div className="switch-row">
                        <div className="switch-copy">
                          <div className="switch-title">1-day reminder</div>
                          <div className="switch-sub">Send the day before to confirm attendance and travel.</div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(sysConfig.reminder_1d_enabled)}
                            onChange={(e) => setSysConfig({ ...sysConfig, reminder_1d_enabled: e.target.checked })}
                          />
                          <span className="switch-track"><span className="switch-thumb" /></span>
                          <span className="sr-only">Enable 1-day reminder</span>
                        </label>
                      </div>

                      <div className="switch-row">
                        <div className="switch-copy">
                          <div className="switch-title">Day-of reminder</div>
                          <div className="switch-sub">A short morning prompt on the exact appointment date.</div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(sysConfig.reminder_today_enabled)}
                            onChange={(e) => setSysConfig({ ...sysConfig, reminder_today_enabled: e.target.checked })}
                          />
                          <span className="switch-track"><span className="switch-thumb" /></span>
                          <span className="sr-only">Enable day-of reminder</span>
                        </label>
                      </div>

                      <div className="switch-row">
                        <div className="switch-copy">
                          <div className="switch-title">Missed visit detection &amp; follow-up</div>
                          <div className="switch-sub">
                            Mark unvisited past stages as missed and notify the patient to reschedule.
                          </div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(sysConfig.missed_flag_enabled)}
                            onChange={(e) => setSysConfig({ ...sysConfig, missed_flag_enabled: e.target.checked })}
                          />
                          <span className="switch-track"><span className="switch-thumb" /></span>
                          <span className="sr-only">Enable missed visit detection</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <aside className="preview-card" aria-label="Manual batch dispatch">
                    <div>
                      <div className="preview-eyebrow">Next automated dispatch</div>
                      <div className="preview-top">
                        <div>
                          <div className="preview-time">
                            {sysConfig.batch_auto_run === false ? '—' : (sysConfig.batch_cron_time || '08:00')}
                          </div>
                          <div className="preview-date">
                            {sysConfig.batch_auto_run === false
                              ? 'Paused by hospital admin'
                              : 'Runs every day at the configured hospital time'}
                          </div>
                        </div>
                        <span className={`preview-badge${sysConfig.batch_auto_run === false ? ' paused' : ''}`}>
                          <span className="live-dot" aria-hidden="true" />
                          {sysConfig.batch_auto_run === false ? 'Paused' : 'Scheduled'}
                        </span>
                      </div>
                    </div>

                    <div className="preview-divider" />

                    <div>
                      <div className="preview-eyebrow" style={{ marginBottom: 7 }}>Enabled reminder channels</div>
                      <div className="preview-list">
                        <div className="preview-item">
                          <span className={`dot${sysConfig.reminder_7d_enabled ? '' : ' muted'}`} aria-hidden="true" />
                          <div>
                            <div className="preview-item-title">7-day reminder</div>
                            <div className="preview-item-sub">{sysConfig.reminder_7d_enabled ? 'Enabled' : 'Disabled'}</div>
                          </div>
                        </div>
                        <div className="preview-item">
                          <span className={`dot${sysConfig.reminder_1d_enabled ? '' : ' muted'}`} aria-hidden="true" />
                          <div>
                            <div className="preview-item-title">1-day reminder</div>
                            <div className="preview-item-sub">{sysConfig.reminder_1d_enabled ? 'Enabled' : 'Disabled'}</div>
                          </div>
                        </div>
                        <div className="preview-item">
                          <span className={`dot${sysConfig.reminder_today_enabled ? '' : ' muted'}`} aria-hidden="true" />
                          <div>
                            <div className="preview-item-title">Day-of reminder</div>
                            <div className="preview-item-sub">{sysConfig.reminder_today_enabled ? 'Enabled' : 'Disabled'}</div>
                          </div>
                        </div>
                        <div className="preview-item">
                          <span className={`dot${sysConfig.missed_flag_enabled ? '' : ' muted'}`} aria-hidden="true" />
                          <div>
                            <div className="preview-item-title">Missed visit follow-up</div>
                            <div className="preview-item-sub">{sysConfig.missed_flag_enabled ? 'Enabled' : 'Disabled'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {canTriggerBatch && (
                      <>
                        <div className="preview-divider" />
                        <div>
                          <div className="preview-eyebrow" style={{ marginBottom: 7 }}>Manual batch dispatch</div>
                          <p className="preview-breakdown" style={{ marginBottom: 9 }}>
                            Execute the daily notification scan immediately on demand.
                          </p>
                          <div className="preview-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={handleTriggerCron}
                              disabled={runningCron}
                            >
                              {runningCron ? (
                                <>
                                  <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                  Executing...
                                </>
                              ) : (
                                <>
                                  <PlayCircle size={14} />
                                  Trigger batch now
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {cronResult && (
                      <>
                        <div className="preview-divider" />
                        <div className="cron-stats-grid">
                          <div className="stat-box">
                            <span className="stat-num">{cronResult.reminder_7d || 0}</span>
                            <span className="stat-lbl">7-day due</span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-num">{cronResult.reminder_1d || 0}</span>
                            <span className="stat-lbl">1-day due</span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-num">{cronResult.reminder_today || 0}</span>
                            <span className="stat-lbl">Today due</span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-num">{cronResult.missed || 0}</span>
                            <span className="stat-lbl">Flagged missed</span>
                          </div>
                        </div>
                      </>
                    )}
                  </aside>
                </div>

                <div className="panel-foot">
                  <span className={`dirty-note${hasUnsavedSystemConfig ? ' on' : ''}`}>
                    {hasUnsavedSystemConfig ? 'Unsaved automation changes' : 'All automation changes saved'}
                  </span>
                  <div className="foot-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleDiscardSystemConfig}
                      disabled={!hasUnsavedSystemConfig || savingSysConfig}
                    >
                      Discard
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={savingSysConfig}>
                      {savingSysConfig ? (
                        <>
                          <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save size={15} />
                          Save changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {/* ── TAB 5: HOSPITAL & WHATSAPP PROFILE ────────────────────────── */}
          {activeTab === 'hospital' && canEditHospital && <HospitalSettingsTab />}

          {/* ── TAB 6: SUBSCRIPTION & PLAN UPGRADE ────────────────────────── */}
          {activeTab === 'subscription' && isAdminUser && <SubscriptionTab />}

          {visibleSections.length === 0 && (
            <div className="setting-panel">
              <div className="empty">
                <ShieldCheck size={28} />
                <strong>No accessible settings sections</strong>
                <span>You do not have permission to access any settings sections.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CREATE CUSTOM ROLE MODAL ──────────────────────────────────────── */}
      {showRoleModal && canManageRoles && (
        <div className="sv-modal-overlay" onClick={() => !creatingRole && setShowRoleModal(false)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-role-title">
            <div className="dlg-form">
              <div className="dlg-head">
                <div>
                  <h2 className="dlg-title" id="dlg-role-title">Add custom role</h2>
                  <p className="dlg-sub">Create a role for your hospital and fine-tune it in the matrix.</p>
                </div>
                <button type="button" className="close-x" onClick={() => setShowRoleModal(false)} aria-label="Close role dialog">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateRole} className="dlg-form" style={{ maxHeight: 'none' }}>
                <div className="dlg-body">
                  <div className="field">
                    <label htmlFor="role-name">Role display name <span className="req">*</span></label>
                    <input
                      id="role-name"
                      type="text"
                      placeholder="e.g. Senior Antenatal Nurse"
                      value={newRoleForm.name}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="role-dept">Department / unit <span className="req">*</span></label>
                    <input
                      id="role-dept"
                      type="text"
                      placeholder="e.g. Maternal & Child Health"
                      value={newRoleForm.dept}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, dept: e.target.value })}
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="role-desc">What is this role for?</label>
                    <textarea
                      id="role-desc"
                      rows={2}
                      placeholder="Brief note on duties and scope..."
                      value={newRoleForm.description}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="role-base">Start with permissions from</label>
                    <select
                      id="role-base"
                      value={newRoleForm.copyPermissionsFrom}
                      onChange={(e) => setNewRoleForm({ ...newRoleForm, copyPermissionsFrom: e.target.value })}
                    >
                      <option value="staff">Clinical Staff (Standard Care Coordinator)</option>
                      <option value="doctor_pregnancy">Doctor – Pregnancy (Antenatal Specialist)</option>
                      <option value="doctor_immunization">Doctor – Immunization (Pediatric Specialist)</option>
                    </select>
                    <span className="hint">You can adjust each permission in the matrix after creating the role.</span>
                  </div>
                </div>

                <div className="dlg-foot">
                  <button type="button" className="btn btn-outline" onClick={() => setShowRoleModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={creatingRole}>
                    {creatingRole ? (
                      <>
                        <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        Creating...
                      </>
                    ) : (
                      'Create role'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE ROLE CONFIRMATION MODAL ────────────────────────────────── */}
      {deletingRoleId && canManageRoles && (
        <div className="sv-modal-overlay" onClick={() => setDeletingRoleId(null)}>
          <div className="dlg dlg-small" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-delete-title">
            <div className="dlg-form">
              <div className="dlg-head">
                <div>
                  <h2 className="dlg-title" id="dlg-delete-title">Delete custom role</h2>
                  <p className="dlg-sub">This change takes effect immediately.</p>
                </div>
                <button type="button" className="close-x" onClick={() => setDeletingRoleId(null)} aria-label="Close confirmation">
                  <X size={16} />
                </button>
              </div>
              <div className="dlg-body">
                <p className="box-note">
                  Are you sure you want to delete this custom role? This will remove its permission definitions.
                  Roles cannot be deleted while staff members are assigned to them.
                </p>
              </div>
              <div className="dlg-foot">
                <button type="button" className="btn btn-outline" onClick={() => setDeletingRoleId(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDeleteRole(deletingRoleId)}>
                  Confirm delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
