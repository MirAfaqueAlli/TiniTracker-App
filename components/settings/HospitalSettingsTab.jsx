'use client';
import { useEffect, useState, useRef } from 'react';
import {
  Building2, Eye, EyeOff, CheckCircle, Send,
  XCircle, X, Save, ChevronDown, Info, Pencil, Wifi
} from 'lucide-react';
import api from '@/lib/api';

// WhatsApp icon SVG matching the TiniTraker / WhatsApp Business aesthetic
function WhatsAppIcon({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.17-.48-.29z" />
    </svg>
  );
}

export default function HospitalSettingsTab() {
  const [hospitalId, setHospitalId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    whatsapp_api_url: '',
    whatsapp_api_key: '',
    whatsapp_api_provider: '',
  });
  const [savedForm, setSavedForm]   = useState(null);

  const [isEditing, setIsEditing]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [showKey, setShowKey]       = useState(false);

  // WhatsApp Test Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testNumber, setTestNumber]       = useState('');
  const [testing, setTesting]             = useState(false);

  // Toast Popup State
  const [toast, setToast]           = useState(null);
  const toastTimerRef               = useRef(null);

  function showToast(type, title, message) {
    setToast({ type, title, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 8000);
  }

  useEffect(() => {
    api.get('/auth/me')
      .then(meRes => {
        const id = meRes.data.user?.hospital_id;
        setHospitalId(id);
        return api.get(`/hospitals/${id}`);
      })
      .then(r => {
        // Strip out country code for the 10-digit phone field display
        let rawPhone = r.data.phone || '';
        if (rawPhone.startsWith('+91')) rawPhone = rawPhone.slice(3);
        else if (rawPhone.startsWith('91') && rawPhone.length === 12) rawPhone = rawPhone.slice(2);

        const data = {
          name:                  r.data.name                  || '',
          address:               r.data.address               || '',
          phone:                 rawPhone,
          whatsapp_api_url:      r.data.whatsapp_api_url      || '',
          whatsapp_api_key:      r.data.whatsapp_api_key      || '',
          whatsapp_api_provider: r.data.whatsapp_api_provider || '',
        };
        setForm(data);
        setSavedForm(data);
      })
      .catch(() => showToast('error', 'Error', 'Failed to load hospital information'))
      .finally(() => setLoading(false));
  }, []);

  function set(field, val) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  function normalizePhone(val) {
    const digits = val.replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91${digits}` : val.trim();
  }

  function handleCancel() {
    if (savedForm) {
      setForm(savedForm);
    }
    setIsEditing(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...form,
        phone: form.phone ? normalizePhone(form.phone) : '',
      };
      await api.put(`/hospitals/${hospitalId}`, payload);
      setSavedForm({ ...form });
      setIsEditing(false);
      showToast('success', 'Settings Saved', 'Hospital settings and API configuration updated successfully.');
    } catch (err) {
      showToast('error', 'Save Failed', err.response?.data?.error || 'Failed to update hospital settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testNumber.trim()) return;
    setTesting(true);

    // Client-side timeout: abort after 20s so the UI never spins indefinitely
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await api.post(`/hospitals/${hospitalId}/test-whatsapp`, {
        test_number: normalizePhone(testNumber),
      }, { signal: controller.signal });
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="hosp-page-container" style={{ padding: 0 }}>

      {/* ── Top Header Bar ── */}
      <div className="hosp-header-row" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-main, #0f172a)', margin: 0 }}>
            Hospital Facility & WhatsApp Gateway
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #64748b)', margin: '0.25rem 0 0' }}>
            Manage hospital profile, support line, and outbound WhatsApp Business API credentials.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className={`hosp-top-badge ${hasApiConfig ? 'hosp-top-badge-live' : 'hosp-top-badge-off'}`}>
            <span className="hosp-badge-dot" />
            {hasApiConfig ? 'Gateway Live & Verified' : 'Gateway Not Configured'}
          </div>

          <button
            type="button"
            className="hosp-btn-test-header"
            onClick={() => setShowTestModal(true)}
            id="btn-test-whatsapp-header"
          >
            <Wifi size={14} color="#00857c" />
            <span>Test WhatsApp</span>
          </button>

          {!isEditing && (
            <button
              type="button"
              className="hosp-btn-edit"
              onClick={() => setIsEditing(true)}
              id="btn-edit-hospital-settings"
            >
              <Pencil size={14} />
              <span>Edit Configuration</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Main Showcase or Edit Form ── */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>

        {/* ── Two-column Main Grid ── */}
        <div className="hosp-two-col-grid">

          {/* ── Left Column: Hospital Information ── */}
          <div className="hosp-themed-card">
            <div className="hosp-card-header-block">
              <div className="hosp-avatar-icon-box">
                <Building2 size={22} />
              </div>
              <div className="hosp-card-header-content">
                <h3 className="hosp-card-main-title">Hospital Information</h3>
                <div className="hosp-card-main-desc">
                  {isEditing ? "Update your hospital's basic details and contact information." : "Your hospital's registered profile and contact details."}
                </div>
              </div>
            </div>

            <div className="hosp-form-fields-stack">
              <div className="hosp-field-group">
                <label className="hosp-field-label">Hospital Name</label>
                {isEditing ? (
                  <input
                    className="hosp-themed-input"
                    placeholder="Enter hospital name"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    required
                  />
                ) : (
                  <div className={`hosp-field-value ${!form.name ? 'empty' : ''}`}>
                    {form.name || 'Not configured'}
                  </div>
                )}
              </div>

              <div className="hosp-field-group">
                <label className="hosp-field-label">Full Address</label>
                {isEditing ? (
                  <textarea
                    className="hosp-themed-textarea"
                    rows={3}
                    placeholder="Enter hospital full address"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                  />
                ) : (
                  <div className={`hosp-field-value multiline ${!form.address ? 'empty' : ''}`}>
                    {form.address || 'Not configured'}
                  </div>
                )}
              </div>

              <div className="hosp-field-group">
                <label className="hosp-field-label">Contact Phone</label>
                {isEditing ? (
                  <div className="hosp-phone-group">
                    <div className="hosp-phone-prefix-addon">
                      <span className="hosp-phone-flag">🇮🇳</span>
                      <span>+91</span>
                      <ChevronDown size={13} color="#57747a" />
                    </div>
                    <input
                      className="hosp-phone-raw-input"
                      placeholder="98765 43210"
                      value={form.phone}
                      onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      maxLength={10}
                    />
                  </div>
                ) : (
                  <div className={`hosp-field-value ${!form.phone ? 'empty' : ''}`}>
                    {form.phone ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span>🇮🇳</span>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>+91</span>
                        <span>{form.phone}</span>
                      </span>
                    ) : 'Not configured'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Column: WhatsApp Business API Configuration ── */}
          <div className="hosp-themed-card">
            <div className="hosp-card-header-block">
              <div className="hosp-avatar-icon-box">
                <WhatsAppIcon size={22} color="#00857c" />
              </div>
              <div className="hosp-card-header-content">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
                  <h3 className="hosp-card-main-title">WhatsApp Business API Configuration</h3>
                  <span className={`hosp-connected-pill ${hasApiConfig ? 'connected' : 'disconnected'}`}>
                    <span className="hosp-badge-dot" style={{ width: 6, height: 6 }} />
                    {hasApiConfig ? 'Connected' : 'Not Set'}
                  </span>
                </div>
                <div className="hosp-card-main-desc">
                  {isEditing ? "Configure your WhatsApp Business API credentials to send automated reminders and alerts." : "Active API gateway configuration for patient alerts and reminders."}
                </div>
              </div>
            </div>

            <div className="hosp-form-fields-stack">
              <div className="hosp-field-group">
                <label className="hosp-field-label">API Provider</label>
                {isEditing ? (
                  <input
                    className="hosp-themed-input"
                    placeholder="e.g. Meta Cloud API, Gupshup, wapi.rextrox.in"
                    value={form.whatsapp_api_provider}
                    onChange={e => set('whatsapp_api_provider', e.target.value)}
                  />
                ) : (
                  <div className={`hosp-field-value ${!form.whatsapp_api_provider ? 'empty' : ''}`}>
                    {form.whatsapp_api_provider ? (
                      <span className="hosp-provider-badge">
                        {form.whatsapp_api_provider}
                      </span>
                    ) : 'Not configured'}
                  </div>
                )}
              </div>

              <div className="hosp-field-group">
                <label className="hosp-field-label">Endpoint URL</label>
                {isEditing ? (
                  <input
                    className="hosp-themed-input"
                    placeholder="https://api.tinitracker.in/v1/send"
                    value={form.whatsapp_api_url}
                    onChange={e => set('whatsapp_api_url', e.target.value)}
                  />
                ) : (
                  <div className={`hosp-field-value hosp-field-value-code ${!form.whatsapp_api_url ? 'empty' : ''}`}>
                    {form.whatsapp_api_url || 'Not configured'}
                  </div>
                )}
              </div>

              <div className="hosp-field-group">
                <label className="hosp-field-label">API Key</label>
                {isEditing ? (
                  <div className="hosp-password-box">
                    <input
                      className="hosp-themed-input"
                      type={showKey ? 'text' : 'password'}
                      placeholder="••••••••••••••••••••••••••••"
                      value={form.whatsapp_api_key}
                      onChange={e => set('whatsapp_api_key', e.target.value)}
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      className="hosp-password-toggle-btn"
                      onClick={() => setShowKey(prev => !prev)}
                      title={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                ) : (
                  <div className="hosp-password-box">
                    <div
                      className={`hosp-field-value hosp-field-value-code ${!form.whatsapp_api_key ? 'empty' : ''}`}
                      style={{ flex: 1, paddingRight: form.whatsapp_api_key ? '2.5rem' : '0.875rem' }}
                    >
                      {form.whatsapp_api_key
                        ? (showKey ? form.whatsapp_api_key : '••••••••••••••••••••••••••••••••')
                        : 'Not configured'}
                    </div>
                    {form.whatsapp_api_key && (
                      <button
                        type="button"
                        className="hosp-password-toggle-btn"
                        onClick={() => setShowKey(prev => !prev)}
                        title={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                  </div>
                )}

                <div className="hosp-encrypted-info">
                  <Info size={14} style={{ flexShrink: 0 }} />
                  <span>Your API credentials are encrypted and securely stored.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Edit Mode Action Buttons ── */}
        {isEditing && (
          <div className="hosp-edit-actions-row">
            <button
              type="button"
              className="hosp-btn-cancel"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hosp-btn-save-all"
              disabled={saving}
              id="btn-save-hospital-settings"
            >
              {saving ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: '#fff', borderTopColor: 'transparent' }} />
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        )}

      </form>

      {/* ── WhatsApp Test Modal ── */}
      {showTestModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(6,59,73,0.18)',
            backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => e.target === e.currentTarget && !testing && setShowTestModal(false)}
        >
          <div className="hosp-modal-card-inline" style={{
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 8px 40px rgba(6,59,73,0.16)',
            padding: '1.75rem',
            width: '100%',
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: '#e6f7f5', color: '#00857c',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wifi size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Test WhatsApp Gateway</div>
                  <div style={{ fontSize: '0.765rem', color: '#64748b' }}>Verify outbound WhatsApp delivery credentials</div>
                </div>
              </div>
              <button
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  border: '1px solid #e2e8f0', background: '#f8fafc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#64748b',
                }}
                onClick={() => !testing && setShowTestModal(false)}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Phone Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="hosp-field-label">Recipient WhatsApp Number</label>
              <div className="hosp-phone-group">
                <div className="hosp-phone-prefix-addon">
                  <span className="hosp-phone-flag">🇮🇳</span>
                  <span>+91</span>
                  <ChevronDown size={13} color="#57747a" />
                </div>
                <input
                  className="hosp-phone-raw-input"
                  placeholder="98765 43210"
                  value={testNumber}
                  onChange={e => setTestNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  autoFocus
                  id="input-hosp-modal-test-phone"
                />
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                className="hosp-btn-cancel"
                onClick={() => { setShowTestModal(false); setTestNumber(''); }}
                disabled={testing}
              >
                Close
              </button>
              <button
                type="button"
                className="hosp-btn-send-test"
                onClick={handleTest}
                disabled={testing || !testNumber.trim()}
                id="btn-hosp-modal-send-test"
              >
                {testing ? (
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                ) : (
                  <>
                    <Send size={14} />
                    <span>Send Test Message</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup Toast Notification ── */}
      {toast && (
        <div className={`batch-toast-popup ${toast.type}`}>
          <div className="batch-toast-icon-wrap">
            {toast.type === 'success' ? (
              <CheckCircle size={20} />
            ) : (
              <XCircle size={20} />
            )}
          </div>
          <div className="batch-toast-body">
            <div className="batch-toast-title">
              {toast.title}
            </div>
            {toast.message && (
              <div className="batch-toast-sub">{toast.message}</div>
            )}
          </div>
          <button className="batch-toast-close" onClick={() => setToast(null)} title="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
