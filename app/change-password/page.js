'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import PasswordStrengthMeter, { evaluatePassword } from '@/components/PasswordStrengthMeter';

export default function ChangePasswordPage() {
  const router    = useRouter();
  const { user, setAuth, token } = useAuthStore();

  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  const isForced = user?.force_password_change === true;

  // If not logged in, redirect to login
  useEffect(() => {
    if (!user && typeof window !== 'undefined') router.replace('/login');
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const pwdEval = evaluatePassword(form.newPass);
    if (!pwdEval.isValid) {
      const missingDetails = pwdEval.missing.map(m => m.shortLabel).join(', ');
      setError(`New password is not strong enough. Missing: ${missingDetails}`);
      return;
    }
    if (form.newPass !== form.confirm) { setError('New passwords do not match'); return; }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current,
        new_password:     form.newPass,
      });

      // Update stored user to clear the forced flag
      if (user) {
        setAuth(token, { ...user, force_password_change: false }, true);
      }

      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  const inputBase = {
    width: '100%', padding: '0.7rem 0.9rem', borderRadius: '10px',
    border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
    color: '#0f172a', background: '#fff',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 50%,#f0fdf4 100%)',
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: '1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: '#fff', borderRadius: '20px',
        padding: '2.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '14px', margin: '0 auto 1rem',
            background: isForced ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isForced ? '0 8px 20px rgba(245,158,11,0.35)' : '0 8px 20px rgba(99,102,241,0.35)',
          }}>
            <KeyRound size={24} color="#fff" />
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {isForced ? 'Set Your Password' : 'Change Password'}
          </div>
          {isForced && (
            <div style={{
              marginTop: '0.6rem', padding: '0.5rem 0.85rem', borderRadius: '10px',
              background: '#fffbeb', border: '1px solid #fde68a',
              fontSize: '0.8rem', color: '#92400e', fontWeight: 500,
            }}>
              ⚠️ You must set a new password before accessing your dashboard.
            </div>
          )}
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <ShieldCheck size={44} color="#10b981" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 700, color: '#10b981', fontSize: '1.05rem' }}>Password changed!</div>
            <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.3rem' }}>Redirecting to dashboard…</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
              <div style={{ padding: '0.7rem 0.9rem', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>
                {error}
              </div>
            )}

            {/* Current password */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>
                Current Password {isForced && '(the one provided by TiniTracker)'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={form.current}
                  onChange={e => setForm(p => ({ ...p, current: e.target.value }))}
                  placeholder="Enter current password"
                  required
                  style={{ ...inputBase, paddingRight: '2.5rem' }}
                />
                <button type="button" onClick={() => setShowCurrent(p => !p)}
                  style={{ position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={form.newPass}
                  onChange={e => setForm(p => ({ ...p, newPass: e.target.value }))}
                  placeholder="Min. 8 characters"
                  required
                  style={{ ...inputBase, paddingRight: '2.5rem' }}
                />
                <button type="button" onClick={() => setShowNew(p => !p)}
                  style={{ position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Password Strength Meter & Criteria Checklist */}
              <PasswordStrengthMeter password={form.newPass} />
            </div>

            {/* Confirm password */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>Confirm New Password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat new password"
                required
                style={{ ...inputBase, borderColor: form.confirm && form.confirm !== form.newPass ? '#fca5a5' : '#e2e8f0' }}
              />
              {form.confirm && form.confirm !== form.newPass && (
                <div style={{ fontSize: '0.73rem', color: '#ef4444', marginTop: '0.25rem' }}>Passwords do not match</div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || (form.confirm && form.confirm !== form.newPass)}
              style={{
                marginTop: '0.25rem', padding: '0.8rem',
                background: isForced ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', border: 'none', borderRadius: '10px',
                fontSize: '0.92rem', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: isForced ? '0 4px 15px rgba(245,158,11,0.35)' : '0 4px 15px rgba(99,102,241,0.35)',
              }}
            >
              {loading ? 'Updating…' : isForced ? 'Set Password & Continue' : 'Update Password'}
            </button>

            {!isForced && (
              <button type="button" onClick={() => router.push('/dashboard')}
                style={{ padding: '0.6rem', background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>
                Cancel — back to dashboard
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
