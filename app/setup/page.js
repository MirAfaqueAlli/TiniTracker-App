'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import PasswordStrengthMeter, { evaluatePassword } from '@/components/PasswordStrengthMeter';

export default function SetupPage() {
  const router  = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    hospital_name:    '',
    hospital_address: '',
    hospital_phone:   '',
    admin_name:       '',
    admin_email:      '',
    admin_password:   '',
    admin_confirm:    '',
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError(''); }

  function normalizePhone(val) {
    const digits = val.replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91${digits}` : val.trim();
  }

  function nextStep(e) {
    e.preventDefault();
    if (!form.hospital_name.trim()) { setError('Hospital name is required'); return; }
    setError('');
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.admin_name.trim())  { setError('Admin name is required'); return; }
    if (!form.admin_email.trim()) { setError('Email is required'); return; }
    const pwdEval = evaluatePassword(form.admin_password);
    if (!pwdEval.isValid) {
      const missingDetails = pwdEval.missing.map(m => m.shortLabel).join(', ');
      setError(`Password is not strong enough. Missing: ${missingDetails}`);
      return;
    }
    if (form.admin_password !== form.admin_confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/setup/init', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name:    form.hospital_name.trim(),
          hospital_address: form.hospital_address.trim() || undefined,
          hospital_phone:   form.hospital_phone ? normalizePhone(form.hospital_phone) : undefined,
          admin_name:       form.admin_name.trim(),
          admin_email:      form.admin_email.trim(),
          admin_password:   form.admin_password,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Setup failed'); return; }

      if (data.token && data.user) {
        setAuth(data.token, data.user, true);
      }
      router.push('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 52, height: 58, borderRadius: '12px',
            background: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 0.875rem',
            padding: '4px',
            boxShadow: '0 4px 16px rgba(6,59,73,0.12)',
            border: '1px solid var(--line)',
          }}>
            <img src="/tinitraker-logo.png" alt="TiniTraker" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.06em', marginBottom: '0.25rem' }}>
            TiniTraker
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--teal)', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
            Timeline of care
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[1, 2].map(s => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 99,
              background: s <= step ? 'var(--color-primary)' : 'var(--color-border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        <div className="card">
          <div className="card-body">
            <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.25rem' }}>
              {step === 1 ? 'Hospital Details' : 'Admin Account'}
            </h2>

            {error && (
              <div style={{
                padding: '0.5rem 0.75rem',
                background: 'var(--color-danger-bg)',
                border: '1px solid #fecdd3',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                color: 'var(--color-error)',
                marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            {/* STEP 1: Hospital */}
            {step === 1 && (
              <form onSubmit={nextStep} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="form-group">
                  <label className="input-label">Hospital Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. City General Hospital"
                    value={form.hospital_name}
                    onChange={e => set('hospital_name', e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">Address <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    className="input"
                    placeholder="Street, City, State"
                    value={form.hospital_address}
                    onChange={e => set('hospital_address', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">Phone <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      padding: '0 0.625rem', height: 36,
                      display: 'flex', alignItems: 'center',
                      background: 'var(--color-surface-alt, rgba(255,255,255,0.05))',
                      border: '1px solid var(--color-border)', borderRight: 'none',
                      borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                      fontSize: '0.8125rem', color: 'var(--color-text-muted)',
                      flexShrink: 0, userSelect: 'none',
                    }}>+91</span>
                    <input
                      className="input"
                      style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}
                      placeholder="9876543210"
                      value={form.hospital_phone}
                      onChange={e => set('hospital_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      maxLength={10}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}
                >
                  Continue <ChevronRight size={14} />
                </button>
              </form>
            )}

            {/* STEP 2: Admin Account */}
            {step === 2 && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="form-group">
                  <label className="input-label">Full Name *</label>
                  <input
                    className="input"
                    placeholder="Dr. Priya Sharma"
                    value={form.admin_name}
                    onChange={e => set('admin_name', e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">Email Address *</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="admin@yourhospital.com"
                    value={form.admin_email}
                    onChange={e => set('admin_email', e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">Password * <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(min. 8 chars)</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.admin_password}
                      onChange={e => set('admin_password', e.target.value)}
                      style={{ paddingRight: '2.5rem' }}
                      required
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)} style={{
                      position: 'absolute', right: '0.625rem', top: '50%',
                      transform: 'translateY(-50%)', background: 'none', border: 'none',
                      color: 'var(--color-text-faint)', cursor: 'pointer', padding: 0,
                    }}>
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {/* Live Password Strength Meter & Criteria Checklist */}
                  <PasswordStrengthMeter password={form.admin_password} />
                </div>

                <div className="form-group">
                  <label className="input-label">Confirm Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.admin_confirm}
                      onChange={e => set('admin_confirm', e.target.value)}
                      style={{ paddingRight: '2.5rem' }}
                      required
                    />
                    <button type="button" onClick={() => setShowConfirm(s => !s)} style={{
                      position: 'absolute', right: '0.625rem', top: '50%',
                      transform: 'translateY(-50%)', background: 'none', border: 'none',
                      color: 'var(--color-text-faint)', cursor: 'pointer', padding: 0,
                    }}>
                      {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => { setStep(1); setError(''); }}
                    className="btn-secondary"
                    style={{ flexShrink: 0 }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {loading
                      ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      : <><CheckCircle size={13} /> Complete Setup</>
                    }
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.6875rem', color: 'var(--color-text-faint)', marginTop: '1.5rem' }}>
          TiniTraker v1.0 · Timeline of care
        </p>
      </div>
    </div>
  );
}
