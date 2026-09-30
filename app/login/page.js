'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, CheckCircle, AlertCircle, ShieldCheck, HeartPulse, Activity } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import './login.css';

function LoginForm() {
  const { token, setAuth, isHydrated } = useAuthStore();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fromSetup    = searchParams.get('setupComplete') === '1';
  const prefilled    = searchParams.get('email') || '';

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isHydrated && token) {
      router.replace('/dashboard');
    }
  }, [isHydrated, token, router]);

  const [identifier, setIdentifier] = useState(prefilled);
  const [password, setPassword]     = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [infoModal, setInfoModal]   = useState(null); // 'forgot' | 'trial' | null

  // Load remembered identifier (email or username) & preference from localStorage if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPref = localStorage.getItem('tinitracker_remember_me_pref');
      const savedIdentifier = localStorage.getItem('tinitracker_remembered_identifier');

      if (savedPref !== null) {
        setRememberMe(savedPref === 'true');
      } else if (!savedIdentifier) {
        setRememberMe(false);
      }

      if (savedIdentifier && !prefilled) {
        setIdentifier(savedIdentifier);
      }
    }
  }, [prefilled]);

  function handleRememberMeChange(e) {
    const isChecked = e.target.checked;
    setRememberMe(isChecked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tinitracker_remember_me_pref', isChecked ? 'true' : 'false');
      if (!isChecked) {
        localStorage.removeItem('tinitracker_remembered_identifier');
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please enter your email or username and password');
      return;
    }
    if (!agreedTerms) {
      setError('Please agree to the Terms of Service to continue');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email: identifier.trim(), password });

      // Synchronize "Remember me" in localStorage
      if (typeof window !== 'undefined') {
        if (rememberMe) {
          localStorage.setItem('tinitracker_remembered_identifier', identifier.trim());
          localStorage.setItem('tinitracker_remember_me_pref', 'true');
        } else {
          localStorage.removeItem('tinitracker_remembered_identifier');
          localStorage.setItem('tinitracker_remember_me_pref', 'false');
        }
      }

      setAuth(res.data.token, res.data.user, rememberMe);
      // First-time login: force password change before accessing dashboard
      if (res.data.user?.force_password_change) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }

    } catch (err) {
      const apiError = err.response?.data?.error;
      if (apiError === 'subscription_expired') {
        setError(err.response.data.message || 'Your hospital subscription has expired. Please contact TiniTracker support.');
      } else {
        setError(apiError || 'Login failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (isHydrated && token) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0a0e14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 36,
          height: 36,
          border: '3px solid rgba(0, 133, 124, 0.25)',
          borderTopColor: '#00857c',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div className="login-page-wrapper">
      {/* ── Left Hero Side ──────────────────────────── */}
      <div className="login-hero-side">
        <div className="login-hero-glow-overlay" />
        <div className="login-hero-content">
          <div className="login-hero-brand">
            <div className="login-hero-logo-box">
              <img
                src="/tinitraker-logo.png"
                alt="TiniTraker"
              />
            </div>
            <span className="login-hero-brand-name">TiniTraker</span>
          </div>

          <h1 className="login-hero-title">
            Manage your entire maternal care and immunization workflow seamlessly.
          </h1>

          <p className="login-hero-desc">
            The intelligent clinical console designed to streamline antenatal visits, boost immunization compliance, and deliver unforgettable care to every mother and child.
          </p>

          <div className="login-hero-features">
            <div className="login-hero-feature-item">
              <div className="login-hero-feature-icon">
                <HeartPulse size={13} />
              </div>
              <span>Antenatal Care Pathways</span>
            </div>

            <div className="login-hero-feature-item">
              <div className="login-hero-feature-icon">
                <Activity size={13} />
              </div>
              <span>Automated WhatsApp Alerts</span>
            </div>

            <div className="login-hero-feature-item">
              <div className="login-hero-feature-icon">
                <ShieldCheck size={13} />
              </div>
              <span>Pediatric Vaccination Timelines</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Console Form Side ─────────────────── */}
      <div className="login-form-side">
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="login-brand-logo-box">
            <img
              src="/tinitraker-logo.png"
              alt="TiniTraker"
            />
          </div>
          <span className="login-brand-title">TiniTraker</span>
        </div>

        {/* Form Card Content */}
        <div className="login-card-content">
          <h2 className="login-console-title">Sign in to Your Console</h2>
          <p className="login-console-subtitle">Let's get you logged in.</p>

          {fromSetup && (
            <div className="login-alert login-alert-success">
              <CheckCircle size={15} style={{ flexShrink: 0 }} />
              <span>Initial hospital setup complete! Sign in with your new credentials.</span>
            </div>
          )}

          {error && (
            <div className="login-alert login-alert-error">
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Identifier Field */}
            <div className="login-form-group">
              <label className="login-form-label">Email, Phone or Username</label>
              <div className="login-input-wrap">
                <input
                  className="login-input"
                  type="text"
                  placeholder="e.g. admin@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="login-form-group">
              <label className="login-form-label">Password</label>
              <div className="login-input-wrap">
                <input
                  className="login-input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: '2.75rem' }}
                  required
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPwd(!showPwd)}
                  title={showPwd ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div className="login-options-row">
              <label className="login-checkbox-label">
                <input
                  type="checkbox"
                  className="login-checkbox"
                  checked={rememberMe}
                  onChange={handleRememberMeChange}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="login-link-forgot"
                onClick={() => setInfoModal('forgot')}
              >
                Forgot password?
              </button>
            </div>

            {/* Terms of Service Checkbox Row */}
            <label className="login-terms-row">
              <input
                type="checkbox"
                className="login-checkbox-terms"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
              />
              <span className="login-terms-text">
                By continuing to TiniTraker, you agree to TiniTraker's{' '}
                <span className="term-link" onClick={(e) => { e.preventDefault(); setInfoModal('terms'); }}>Terms of Service</span> and{' '}
                <span className="term-link" onClick={(e) => { e.preventDefault(); setInfoModal('privacy'); }}>Privacy Policy</span>.
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: '#ffffff', borderTopColor: 'transparent' }} />
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="login-footer-row">
          <span>New to TiniTraker? </span>
          <button
            type="button"
            className="login-footer-link"
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={() => router.push('/register')}
          >
            Start a free trial
          </button>
        </div>
      </div>

      {/* ── Help / Contact Modal ──────────────────────── */}
      {infoModal && (
        <div
          className="notif-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setInfoModal(null)}
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000 }}
        >
          <div
            className="notif-modal-card"
            style={{
              maxWidth: 440,
              background: '#111827',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                {infoModal === 'forgot'
                  ? 'Password Recovery'
                  : infoModal === 'terms'
                  ? 'Terms of Service'
                  : infoModal === 'privacy'
                  ? 'Clinical Privacy Policy'
                  : 'Get Started with TiniTraker'}
              </div>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {infoModal === 'forgot' && (
                <p>
                  To reset your medical staff or doctor credentials, please contact your Hospital Administrator or IT Department. Hospital administrators have the authority to issue new passwords directly from the Staff Management console.
                </p>
              )}
              {infoModal === 'terms' && (
                <p>
                  TiniTraker is a clinical management and patient communication console. Users must maintain clinical confidentiality in compliance with medical data regulations.
                </p>
              )}
              {infoModal === 'privacy' && (
                <p>
                  Patient health information, WhatsApp notification logs, and obstetrics/pediatric records are protected and accessible only to authorized medical personnel within your hospital.
                </p>
              )}

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="pd-btn-primary"
                onClick={() => setInfoModal(null)}
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', background: '#00857c' }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0a0e14' }} />}>
      <LoginForm />
    </Suspense>
  );
}
