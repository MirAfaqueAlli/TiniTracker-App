'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Building2, Eye, EyeOff, CheckCircle, Send,
  X, Save, ChevronDown, Info, Wifi, RefreshCw, MessageSquare,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore, hasUserPermission } from '@/store/authStore';

function WhatsAppIcon({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.17-.48-.29z" />
    </svg>
  );
}

export default function HospitalSettingsTab() {
  const { user } = useAuthStore();
  const canEditHospital = hasUserPermission(user, 'settings.edit_hospital');

  const [hospitalId, setHospitalId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    whatsapp_api_url: '',
    whatsapp_api_key: '',
    whatsapp_api_provider: '',
  });
  const [savedForm, setSavedForm] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [showTestModal, setShowTestModal] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  function showToast(type, title, message) {
    setToast({ type, title, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 8000);
  }

  useEffect(() => {
    (async () => {
      try {
        const meRes = await api.get('/auth/me');
        const id = meRes.data.user?.hospital_id;
        setHospitalId(id);

        // Basic profile from the public endpoint; real WhatsApp credentials
        // come from the admin-only, owner-scoped config endpoint.
        const [r, cfgRes] = await Promise.all([
          api.get(`/hospitals/${id}`),
          api.get(`/hospitals/${id}/whatsapp-config`).catch(() => ({ data: {} })),
        ]);
        const cfg = cfgRes.data || {};

        let rawPhone = r.data.phone || '';
        if (rawPhone.startsWith('+91')) rawPhone = rawPhone.slice(3);
        else if (rawPhone.startsWith('91') && rawPhone.length === 12) rawPhone = rawPhone.slice(2);

        const data = {
          name: r.data.name || '',
          address: r.data.address || '',
          phone: rawPhone,
          whatsapp_api_url: cfg.whatsapp_api_url || r.data.whatsapp_api_url || '',
          whatsapp_api_key: cfg.whatsapp_api_key || '',
          whatsapp_api_provider: cfg.whatsapp_api_provider || r.data.whatsapp_api_provider || '',
        };
        setForm(data);
        setSavedForm(data);
      } catch {
        showToast('error', 'Error', 'Failed to load hospital information');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function set(field, val) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  function normalizePhone(val) {
    const digits = val.replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91${digits}` : val.trim();
  }

  function handleCancel() {
    if (savedForm) setForm(savedForm);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!canEditHospital) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        phone: form.phone ? normalizePhone(form.phone) : '',
      };
      await api.put(`/hospitals/${hospitalId}`, payload);
      setSavedForm({ ...form });
      showToast('success', 'Settings Saved', 'Hospital settings and API configuration updated successfully.');
    } catch (err) {
      showToast('error', 'Save Failed', err.response?.data?.error || 'Failed to update hospital settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!canEditHospital || !testNumber.trim()) return;
    setTesting(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await api.post(
        `/hospitals/${hospitalId}/test-whatsapp`,
        { test_number: normalizePhone(testNumber) },
        { signal: controller.signal }
      );
      clearTimeout(timer);
      showToast('success', 'Test Message Sent', res.data?.message || "Check the recipient's WhatsApp for the message.");
      setShowTestModal(false);
      setTestNumber('');
    } catch (err) {
      clearTimeout(timer);
      let errMsg;
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        errMsg = 'Request timed out. The WhatsApp gateway is not responding. Please check your connection or re-scan the QR code on your API provider dashboard.';
      } else {
        errMsg = err.response?.data?.error || err.message || 'Test connection failed. Please verify credentials.';
      }
      showToast('error', 'Test Failed', errMsg);
    } finally {
      setTesting(false);
    }
  }

  const hasApiConfig = Boolean(form.whatsapp_api_url && form.whatsapp_api_key);
  const isDirty = Boolean(savedForm) && JSON.stringify(form) !== JSON.stringify(savedForm);

  if (loading) {
    return (
      <section className="setting-panel">
        <div className="loading-block">
          <RefreshCw size={26} style={{ animation: 'spin 1s linear infinite' }} />
          <p>Loading hospital profile...</p>
        </div>
      </section>
    );
  }

  return (
    <>
      {toast && (
        <div className="toasts" role="status" aria-live="polite">
          <div className={`toast ${toast.type === 'error' ? 'err' : ''}`}>
            <div>
              <span className="toast-k">{toast.type === 'error' ? 'Not saved' : 'Saved'}</span>
              <span>{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      <section className="setting-panel" aria-labelledby="hospital-title">
        <div className="panel-head">
          <div>
            <h2 className="setting-title" id="hospital-title">Hospital &amp; WhatsApp</h2>

          </div>
          <div className="panel-actions">
            <span className={`chip ${hasApiConfig ? 'chip-live' : 'chip-warn'}`}>
              <span className="live-dot" aria-hidden="true" />
              {hasApiConfig ? 'WhatsApp configured' : 'WhatsApp needs setup'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="hospital-grid">
            <div className="setting-box hospital-form">
              <div>
                <h3 className="box-title">
                  <Building2 size={16} />
                  Hospital profile
                </h3>
                <p className="box-note">Shown on reports, summaries and patient-facing messages.</p>
              </div>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="h-name">Official hospital name <span className="req">*</span></label>
                  <input
                    id="h-name"
                    type="text"
                    autoComplete="organization"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    disabled={!canEditHospital || saving}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="h-phone">Primary phone <span className="req">*</span></label>
                  <input
                    id="h-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    disabled={!canEditHospital || saving}
                  />
                  <span className="hint">Stored with the +91 country code.</span>
                </div>
              </div>

              <div className="field">
                <label htmlFor="h-address">Clinic address</label>
                <textarea
                  id="h-address"
                  rows={3}
                  autoComplete="street-address"
                  placeholder="Enter hospital full address"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  disabled={!canEditHospital || saving}
                />
              </div>
            </div>

            <div className="setting-box hospital-form">
              <div>
                <h3 className="box-title">
                  <MessageSquare size={16} />
                  WhatsApp Business API
                </h3>
                <p className="box-note">Reminders are dispatched through your configured business channel.</p>
              </div>

              <div className={`wa-banner${hasApiConfig ? '' : ' warn'}`}>
                {hasApiConfig ? <CheckCircle size={16} /> : <Info size={16} />}
                <span>
                  {hasApiConfig
                    ? 'Gateway credentials are configured for this hospital.'
                    : 'Add the endpoint URL and API key to enable automated WhatsApp reminders.'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="w-provider">API provider</label>
                <input
                  id="w-provider"
                  type="text"
                  placeholder="e.g. Meta Cloud API, Gupshup, wapi.rextrox.in"
                  value={form.whatsapp_api_provider}
                  onChange={(e) => set('whatsapp_api_provider', e.target.value)}
                  disabled={!canEditHospital || saving}
                />
              </div>

              <div className="field">
                <label htmlFor="w-url">Endpoint URL</label>
                <input
                  id="w-url"
                  type="url"
                  placeholder="https://api.tinitracker.in/v1/send"
                  value={form.whatsapp_api_url}
                  onChange={(e) => set('whatsapp_api_url', e.target.value)}
                  disabled={!canEditHospital || saving}
                />
              </div>

              <div className="field">
                <label htmlFor="w-key">API key</label>
                <div className="key-row">
                  <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
                    <input
                      id="w-key"
                      type={showKey ? 'text' : 'password'}
                      placeholder="••••••••••••••••••••••••••••"
                      value={form.whatsapp_api_key}
                      onChange={(e) => set('whatsapp_api_key', e.target.value)}
                      disabled={!canEditHospital || saving}
                      style={{
                        width: '100%', minHeight: 36, padding: '8px 40px 8px 10px', borderRadius: 8,
                        border: '1px solid var(--s-line-strong)', background: 'var(--s-surface)', color: 'var(--s-ink)',
                        font: '600 12px/1.4 var(--s-mono)', letterSpacing: '0.03em',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      title={showKey ? 'Hide key' : 'Show key'}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        border: 0, background: 'none', color: 'var(--s-ink-3)', cursor: 'pointer', padding: 4,
                      }}
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <span className="hint">Your API credentials are stored server-side and never returned in general hospital responses.</span>
              </div>

              {canEditHospital && (
                <div className="wa-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowTestModal(true)}>
                    <Wifi size={14} />
                    Test connection
                  </button>
                </div>
              )}

              <div className="wa-status-line">
                <span className="test-status">{hasApiConfig ? 'Credentials ready to test' : 'No gateway configured'}</span>
              </div>
            </div>
          </div>

          {canEditHospital && (
            <div className="panel-foot">
              <span className={`dirty-note${isDirty ? ' on' : ''}`}>
                {isDirty ? 'Unsaved hospital changes' : 'All hospital changes saved'}
              </span>
              <div className="foot-actions">
                <button type="button" className="btn btn-ghost" onClick={handleCancel} disabled={!isDirty || saving}>
                  Discard
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
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
          )}
        </form>
      </section>

      {showTestModal && (
        <div className="sv-modal-overlay" onClick={(e) => e.target === e.currentTarget && !testing && setShowTestModal(false)}>
          <div className="dlg dlg-small" role="dialog" aria-modal="true" aria-labelledby="dlg-wa-test-title">
            <div className="dlg-form">
              <div className="dlg-head">
                <div>
                  <h2 className="dlg-title" id="dlg-wa-test-title">Test WhatsApp gateway</h2>
                  <p className="dlg-sub">Verify outbound WhatsApp delivery credentials.</p>
                </div>
                <button type="button" className="close-x" onClick={() => !testing && setShowTestModal(false)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="dlg-body">
                <div className="field">
                  <label htmlFor="wa-test-number">Recipient WhatsApp number <span className="req">*</span></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 10px',
                      border: '1px solid var(--s-line-strong)', borderRadius: 8, background: 'var(--s-surface-2)',
                      font: '600 12px/1 var(--s-font)', color: 'var(--s-ink-2)',
                    }}>
                      +91
                      <ChevronDown size={13} />
                    </span>
                    <input
                      id="wa-test-number"
                      type="tel"
                      placeholder="98765 43210"
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      maxLength={10}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                  </div>
                  <span className="hint">The test message is sent using the saved gateway credentials.</span>
                </div>
              </div>

              <div className="dlg-foot">
                <button type="button" className="btn btn-outline" onClick={() => { setShowTestModal(false); setTestNumber(''); }} disabled={testing}>
                  Close
                </button>
                <button type="button" className="btn btn-primary" onClick={handleTest} disabled={testing || !testNumber.trim()}>
                  {testing ? (
                    <>
                      <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Send test message
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
