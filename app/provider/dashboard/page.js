'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import PasswordStrengthMeter, { evaluatePassword } from '@/components/PasswordStrengthMeter';

// ── Helpers ───────────────────────────────────────────────────────────────────
function providerApi() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('provider_token') : '';
  return axios.create({
    baseURL: '/api/provider',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SubBadge({ sub }) {
  if (!sub) return <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No subscription</span>;
  const today = new Date().toISOString().split('T')[0];
  const expired = sub.ends_at < today;
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '999px',
      background: expired ? '#fef2f2' : '#f0fdf4',
      color:      expired ? '#dc2626' : '#15803d',
      border:     `1px solid ${expired ? '#fecaca' : '#bbf7d0'}`,
    }}>
      {expired ? '⚠ Expired' : '✓ Active'} · {sub.plan?.replace('_', ' ')} · until {fmt(sub.ends_at)}
    </span>
  );
}

// ── Create Hospital Modal ─────────────────────────────────────────────────────
function CreateHospitalModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    hospital_name: '', city: '', phone: '',
    whatsapp_gateway_url: '', whatsapp_api_key: '',
    admin_name: '', admin_email: '', admin_password: '',
    plan: 'free_trial', trial_days: 30,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');

    const pwdEval = evaluatePassword(form.admin_password);
    if (!pwdEval.isValid) {
      const missingDetails = pwdEval.missing.map(m => m.shortLabel).join(', ');
      setError(`Admin password is not strong enough. Missing: ${missingDetails}`);
      return;
    }

    setLoading(true);
    try {
      await providerApi().post('/hospitals', form);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create hospital');
    } finally { setLoading(false); }
  }

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px',
    border: '1px solid #e2e8f0', fontSize: '0.855rem', outline: 'none',
    boxSizing: 'border-box', color: '#0f172a',
  };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.3rem' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: '18px', width: '100%', maxWidth: 560,
        padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Create New Hospital</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}>✕</button>
        </div>

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.7rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '0.82rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontWeight: 600, color: '#6366f1', fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Hospital Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Hospital Name *</label><input style={inputStyle} value={form.hospital_name} onChange={f('hospital_name')} required /></div>
            <div><label style={labelStyle}>City</label><input style={inputStyle} value={form.city} onChange={f('city')} /></div>
            <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone} onChange={f('phone')} /></div>
            <div><label style={labelStyle}>WhatsApp Gateway URL</label><input style={inputStyle} value={form.whatsapp_gateway_url} onChange={f('whatsapp_gateway_url')} placeholder="https://wapi.example.com" /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>WhatsApp API Key</label><input style={inputStyle} value={form.whatsapp_api_key} onChange={f('whatsapp_api_key')} /></div>
          </div>

          <div style={{ fontWeight: 600, color: '#6366f1', fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: '0.5rem' }}>First Admin Account</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Admin Name *</label><input style={inputStyle} value={form.admin_name} onChange={f('admin_name')} required /></div>
            <div><label style={labelStyle}>Admin Email *</label><input type="email" style={inputStyle} value={form.admin_email} onChange={f('admin_email')} required /></div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Admin Password *</label>
              <input type="password" style={inputStyle} value={form.admin_password} onChange={f('admin_password')} required minLength={8} />
              <PasswordStrengthMeter password={form.admin_password} />
            </div>
          </div>

          <div style={{ fontWeight: 600, color: '#6366f1', fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: '0.5rem' }}>Initial Subscription</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Plan</label>
              <select style={inputStyle} value={form.plan} onChange={f('plan')}>
                <option value="free_trial">Free Trial</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div><label style={labelStyle}>Duration (days)</label><input type="number" style={inputStyle} value={form.trial_days} onChange={f('trial_days')} min={1} /></div>
          </div>

          <button type="submit" disabled={loading} style={{
            marginTop: '0.5rem', padding: '0.75rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', border: 'none', borderRadius: '10px',
            fontSize: '0.9rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Creating…' : 'Create Hospital'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Renew Subscription Modal ──────────────────────────────────────────────────
function RenewModal({ hospitalId, onClose, onSuccess }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ plan: 'monthly', starts_at: today, ends_at: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await providerApi().post(`/hospitals/${hospitalId}/subscriptions`, form);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  }

  const inputStyle = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.855rem', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.3rem' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: 440, padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Renew / Create Subscription</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.2rem' }}>✕</button>
        </div>
        {error && <div style={{ marginBottom: '1rem', padding: '0.7rem', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', fontSize: '0.82rem' }}>{error}</div>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={labelStyle}>Plan</label>
            <select style={inputStyle} value={form.plan} onChange={f('plan')}>
              <option value="free_trial">Free Trial</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Starts At</label><input type="date" style={inputStyle} value={form.starts_at} onChange={f('starts_at')} required /></div>
            <div><label style={labelStyle}>Ends At</label><input type="date" style={inputStyle} value={form.ends_at} onChange={f('ends_at')} required /></div>
          </div>
          <div><label style={labelStyle}>Notes</label><input style={inputStyle} value={form.notes} onChange={f('notes')} placeholder="Optional" /></div>
          <button type="submit" disabled={loading} style={{ padding: '0.72rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}>
            {loading ? 'Saving…' : 'Save Subscription'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
function PaymentModal({ hospitalId, onClose, onSuccess }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ amount: '', currency: 'INR', payment_date: today, method: 'UPI', reference: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await providerApi().post(`/hospitals/${hospitalId}/payments`, form);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  }

  const inputStyle = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.855rem', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.3rem' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: 440, padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Record Payment</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.2rem' }}>✕</button>
        </div>
        {error && <div style={{ marginBottom: '1rem', padding: '0.7rem', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', fontSize: '0.82rem' }}>{error}</div>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Amount *</label><input type="number" style={inputStyle} value={form.amount} onChange={f('amount')} required min="0" step="0.01" /></div>
            <div><label style={labelStyle}>Currency</label><input style={inputStyle} value={form.currency} onChange={f('currency')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div><label style={labelStyle}>Payment Date *</label><input type="date" style={inputStyle} value={form.payment_date} onChange={f('payment_date')} required /></div>
            <div>
              <label style={labelStyle}>Method</label>
              <select style={inputStyle} value={form.method} onChange={f('method')}>
                <option value="UPI">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div><label style={labelStyle}>Reference / UTR</label><input style={inputStyle} value={form.reference} onChange={f('reference')} placeholder="Optional" /></div>
          <div><label style={labelStyle}>Notes</label><input style={inputStyle} value={form.notes} onChange={f('notes')} placeholder="Optional" /></div>
          <button type="submit" disabled={loading} style={{ padding: '0.72rem', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}>
            {loading ? 'Saving…' : 'Record Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Hospital Row ──────────────────────────────────────────────────────────────
function HospitalRow({ h, onRenew, onPayment }) {
  const [expanded, setExpanded] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const subExpired = h.subscription && h.subscription.ends_at < today;

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden',
      background: '#fff', marginBottom: '0.85rem',
      boxShadow: subExpired ? '0 0 0 2px #fecaca' : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
        cursor: 'pointer',
      }} onClick={() => setExpanded(p => !p)}>
        {/* Avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: '12px', flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: '1rem',
        }}>
          {h.name?.[0]?.toUpperCase() || 'H'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{h.name}</div>
          <div style={{ fontSize: '0.77rem', color: '#64748b', marginTop: '0.1rem' }}>
            {h.city || '—'} · ID #{h.id} · Registered {fmt(h.createdAt)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <SubBadge sub={h.subscription} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '1rem 1.25rem', background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button
              onClick={() => onRenew(h.id)}
              style={{
                padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              🔄 Renew / New Subscription
            </button>
            <button
              onClick={() => onPayment(h.id)}
              style={{
                padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              💳 Record Payment
            </button>
          </div>

          {h.subscription ? (
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
              <div><strong>Active plan:</strong> {h.subscription.plan?.replace('_', ' ')}</div>
              <div><strong>Period:</strong> {fmt(h.subscription.starts_at)} → {fmt(h.subscription.ends_at)}</div>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No active subscription — create one above.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function ProviderDashboard() {
  const router = useRouter();
  const [admin, setAdmin]           = useState(null);
  const [hospitals, setHospitals]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [renewId, setRenewId]       = useState(null);
  const [paymentId, setPaymentId]   = useState(null);
  const [search, setSearch]         = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedAdmin = localStorage.getItem('provider_admin');
    if (!storedAdmin || !localStorage.getItem('provider_token')) {
      router.replace('/provider/login');
      return;
    }
    setAdmin(JSON.parse(storedAdmin));
    loadHospitals();
  }, []);

  const loadHospitals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await providerApi().get('/hospitals');
      setHospitals(res.data.hospitals || []);
    } catch (err) {
      if (err.response?.status === 401) router.replace('/provider/login');
    } finally { setLoading(false); }
  }, []);

  function logout() {
    localStorage.removeItem('provider_token');
    localStorage.removeItem('provider_admin');
    if (typeof document !== 'undefined') {
      document.cookie = 'provider_token=; path=/; max-age=0; SameSite=Lax';
    }
    router.push('/provider/login');
  }

  const today = new Date().toISOString().split('T')[0];
  const filtered = hospitals.filter(h =>
    !search || h.name?.toLowerCase().includes(search.toLowerCase()) || h.city?.toLowerCase().includes(search.toLowerCase())
  );
  const activeCount  = hospitals.filter(h => h.subscription && !h.subscription.expired).length;
  const expiredCount = hospitals.filter(h => !h.subscription || h.subscription.expired).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        padding: '0 2rem', height: 62,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '9px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}>🛡️</div>
          <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1rem' }}>TiniTracker Provider</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {admin && (
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
              {admin.name} · <span style={{ color: '#6366f1', textTransform: 'capitalize' }}>{admin.role}</span>
            </div>
          )}
          <button onClick={logout} style={{
            padding: '0.35rem 0.85rem', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#cbd5e1', cursor: 'pointer',
          }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Hospitals', value: hospitals.length, color: '#6366f1', bg: '#eef2ff' },
            { label: 'Active Subscriptions', value: activeCount, color: '#10b981', bg: '#ecfdf5' },
            { label: 'Expired / No Sub', value: expiredCount, color: '#ef4444', bg: '#fef2f2' },
          ].map(s => (
            <div key={s.label} style={{
              background: '#fff', borderRadius: '14px', padding: '1.25rem',
              border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem' }}>{s.label}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', flex: 1 }}>Hospitals</div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or city…"
            style={{
              padding: '0.5rem 0.85rem', borderRadius: '9px', border: '1px solid #e2e8f0',
              fontSize: '0.84rem', outline: 'none', width: 220,
            }}
          />
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: '9px', fontSize: '0.85rem', fontWeight: 700,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(99,102,241,0.35)',
            }}
          >
            + New Hospital
          </button>
        </div>

        {/* Hospital list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Loading hospitals…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏥</div>
            <div style={{ fontWeight: 600 }}>{search ? 'No hospitals match your search' : 'No hospitals yet'}</div>
            {!search && <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Click "+ New Hospital" to create the first one.</div>}
          </div>
        ) : (
          filtered.map(h => (
            <HospitalRow
              key={h.id} h={h}
              onRenew={id => setRenewId(id)}
              onPayment={id => setPaymentId(id)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateHospitalModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); loadHospitals(); }}
        />
      )}
      {renewId && (
        <RenewModal
          hospitalId={renewId}
          onClose={() => setRenewId(null)}
          onSuccess={() => { setRenewId(null); loadHospitals(); }}
        />
      )}
      {paymentId && (
        <PaymentModal
          hospitalId={paymentId}
          onClose={() => setPaymentId(null)}
          onSuccess={() => { setPaymentId(null); loadHospitals(); }}
        />
      )}
    </div>
  );
}
