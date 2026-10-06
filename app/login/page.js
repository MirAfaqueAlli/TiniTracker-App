'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, CheckCircle, AlertCircle, ShieldCheck, HeartPulse, Activity, Mail, KeyRound, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import './login.css';

/* ─────────────────────────────────────────────────────────────
   Forgot-Password Modal  (3 steps: email → otp → new password)
───────────────────────────────────────────────────────────── */
function ForgotPasswordModal({ onClose, onSuccess }) {
  // step: 'email' | 'otp' | 'password' | 'done'
  const [step, setStep]             = useState('email');
  const [email, setEmail]           = useState('');
  const [otp, setOtp]               = useState(['', '', '', '', '', '']);
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devOtp, setDevOtp]         = useState('');
  const otpRefs                     = useRef([]);
  const timerRef                    = useRef(null);

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      timerRef.current = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [resendCooldown]);

  // ── Step 1: send OTP ──────────────────────────────────────
  async function handleSendOtp(e) {
    e?.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/forgot-password/send-otp', { email: email.trim() });
      if (res.data.devOtp) setDevOtp(res.data.devOtp);
      setResendCooldown(15);
      setStep('otp');
      // Focus first OTP box
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      const e = err.response?.data;
      if (e?.waitSeconds) setResendCooldown(e.waitSeconds);
      setError(e?.error || 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── OTP input helpers ─────────────────────────────────────
  function handleOtpChange(i, val) {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  }
  function handleOtpKeyDown(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) otpRefs.current[i + 1]?.focus();
  }
  function handleOtpPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...otp];
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }

  // ── Step 2: verify OTP (locally – just check all filled) ──
  function handleVerifyOtp(e) {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter the complete 6-digit code.'); return; }
    // OTP is verified server-side during the reset step; just advance
    setError('');
    setStep('password');
    setTimeout(() => document.getElementById('fp-new-pwd')?.focus(), 100);
  }

  // ── Step 3: reset password ────────────────────────────────
  async function handleResetPassword(e) {
    e.preventDefault();
    if (newPwd.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPwd !== confirmPwd) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/forgot-password/reset', {
        email: email.trim(),
        otp: otp.join(''),
        new_password: newPwd,
      });
      setStep('done');
      // Auto-login via the returned token
      if (res.data.token) {
        setTimeout(() => onSuccess(res.data.token, res.data.user), 1200);
      }
    } catch (err) {
      const errData = err.response?.data;
      setError(errData?.error || 'Failed to reset password. Please try again.');
      // If OTP is invalid, go back to OTP step
      if (errData?.error?.toLowerCase().includes('code') || errData?.error?.toLowerCase().includes('otp')) {
        setStep('otp');
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = { email: 0, otp: 1, password: 2, done: 3 }[step];

  return (
    <div
      className="fp-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fp-modal" role="dialog" aria-modal="true" aria-label="Reset your password">
        {/* Header */}
        <div className="fp-modal-header">
          <div className="fp-modal-title-row">
            <div className="fp-icon-circle">
              {step === 'done' ? <CheckCircle size={20} /> : <Lock size={20} />}
            </div>
            <div>
              <div className="fp-modal-title">
                {step === 'email'    && 'Reset your password'}
                {step === 'otp'     && 'Check your email'}
                {step === 'password' && 'Create new password'}
                {step === 'done'    && 'Password updated!'}
              </div>
              <div className="fp-modal-subtitle">
                {step === 'email'    && 'Enter the email linked to your account.'}
                {step === 'otp'     && `We sent a 6-digit code to ${email}`}
                {step === 'password' && 'Choose a strong new password.'}
                {step === 'done'    && 'Signing you in automatically…'}
              </div>
            </div>
          </div>
          <button
            className="fp-close-btn"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >✕</button>
        </div>

        {/* Step indicator */}
        <div className="fp-steps" aria-hidden="true">
          {['Email', 'Code', 'Password'].map((label, i) => (
            <div key={label} className={`fp-step ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}`}>
              <div className="fp-step-dot">
                {i < stepIndex ? <CheckCircle size={11} /> : i + 1}
              </div>
              <span>{label}</span>
              {i < 2 && <div className={`fp-step-line ${i < stepIndex ? 'done' : ''}`} />}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="login-alert login-alert-error" style={{ margin: '0 1.5rem 1rem' }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Dev OTP hint */}
        {devOtp && step === 'otp' && (
          <div className="fp-dev-hint">
            🔧 Dev mode – OTP: <strong>{devOtp}</strong>
          </div>
        )}

        {/* ── Step: email ── */}
        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="fp-body">
            <div className="login-form-group">
              <label className="login-form-label" htmlFor="fp-email">Email address</label>
              <div className="login-input-wrap">
                <Mail size={15} className="fp-input-icon" />
                <input
                  id="fp-email"
                  className="login-input fp-input-with-icon"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading
                ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: '#ffffff', borderTopColor: 'transparent' }} />
                : 'Send Reset Code'}
            </button>
            <button type="button" className="fp-back-link" onClick={onClose}>
              Back to sign in
            </button>
          </form>
        )}

        {/* ── Step: otp ── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="fp-body">
            <div className="fp-otp-label">Enter the 6-digit code</div>
            <div className="fp-otp-row">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={`fp-otp-box ${digit ? 'filled' : ''}`}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={i === 0 ? handleOtpPaste : undefined}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={otp.join('').length < 6}
            >
              Verify Code
            </button>
            <div className="fp-resend-row">
              {resendCooldown > 0
                ? <span className="fp-resend-wait">Resend in {resendCooldown}s</span>
                : <button
                    type="button"
                    className="fp-back-link"
                    onClick={handleSendOtp}
                    disabled={loading}
                  >
                    Resend code
                  </button>
              }
              <span className="fp-separator">·</span>
              <button type="button" className="fp-back-link" onClick={() => { setStep('email'); setError(''); setOtp(['','','','','','']); }}>
                Change email
              </button>
            </div>
          </form>
        )}

        {/* ── Step: password ── */}
        {step === 'password' && (
          <form onSubmit={handleResetPassword} className="fp-body">
            <div className="login-form-group">
              <label className="login-form-label" htmlFor="fp-new-pwd">New password</label>
              <div className="login-input-wrap">
                <input
                  id="fp-new-pwd"
                  className="login-input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  style={{ paddingRight: '2.75rem' }}
                  required
                  minLength={8}
                  autoFocus
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPwd(!showPwd)}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="login-form-group">
              <label className="login-form-label" htmlFor="fp-confirm-pwd">Confirm new password</label>
              <div className="login-input-wrap">
                <input
                  id="fp-confirm-pwd"
                  className="login-input"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  style={{ paddingRight: '2.75rem' }}
                  required
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Strength / match hint */}
              {confirmPwd && (
                <span style={{ fontSize: '0.73rem', marginTop: '0.25rem', color: newPwd === confirmPwd ? '#34d399' : '#fb7185' }}>
                  {newPwd === confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                </span>
              )}
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || newPwd.length < 8}
            >
              {loading
                ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: '#ffffff', borderTopColor: 'transparent' }} />
                : 'Reset Password & Sign In'}
            </button>
            <button type="button" className="fp-back-link" onClick={() => { setStep('otp'); setError(''); }}>
              Back
            </button>
          </form>
        )}

        {/* ── Step: done ── */}
        {step === 'done' && (
          <div className="fp-body fp-done-body">
            <div className="fp-done-icon">
              <CheckCircle size={44} />
            </div>
            <p className="fp-done-msg">Your password has been reset successfully.<br />Logging you in…</p>
            <div className="fp-done-spinner">
              <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'rgba(45,212,191,0.2)', borderTopColor: '#2dd4bf' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Login Form
───────────────────────────────────────────────────────────── */
function LoginForm() {
  const { token, setAuth, isHydrated } = useAuthStore();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fromSetup    = searchParams.get('setupComplete') === '1';
  const prefilled    = searchParams.get('email') || '';

  // Redirect if already logged in
  useEffect(() => {
    if (isHydrated && token) router.replace('/dashboard');
  }, [isHydrated, token, router]);

  const [identifier, setIdentifier] = useState(prefilled);
  const [password, setPassword]     = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [infoModal, setInfoModal]   = useState(null); // 'terms' | 'privacy'

  // Restore remembered identifier
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPref       = localStorage.getItem('tinitracker_remember_me_pref');
      const savedIdentifier = localStorage.getItem('tinitracker_remembered_identifier');
      if (savedPref !== null) setRememberMe(savedPref === 'true');
      else if (!savedIdentifier) setRememberMe(false);
      if (savedIdentifier && !prefilled) setIdentifier(savedIdentifier);
    }
  }, [prefilled]);

  function handleRememberMeChange(e) {
    const isChecked = e.target.checked;
    setRememberMe(isChecked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tinitracker_remember_me_pref', isChecked ? 'true' : 'false');
      if (!isChecked) localStorage.removeItem('tinitracker_remembered_identifier');
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
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', { email: identifier.trim(), password });
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
      if (res.data.user?.force_password_change) router.push('/change-password');
      else router.push('/dashboard');
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

  // Called after a successful password reset – auto-login
  function handleForgotSuccess(token, user) {
    setShowForgot(false);
    setAuth(token, user, true);
    if (user?.force_password_change) router.push('/change-password');
    else router.push('/dashboard');
  }

  if (isHydrated && token) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0a0e14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(0,133,124,0.25)', borderTopColor: '#00857c', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
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
              <img src="/tinitraker-logo.png" alt="TiniTraker" />
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
              <div className="login-hero-feature-icon"><HeartPulse size={13} /></div>
              <span>Antenatal Care Pathways</span>
            </div>
            <div className="login-hero-feature-item">
              <div className="login-hero-feature-icon"><Activity size={13} /></div>
              <span>Automated WhatsApp Alerts</span>
            </div>
            <div className="login-hero-feature-item">
              <div className="login-hero-feature-icon"><ShieldCheck size={13} /></div>
              <span>Pediatric Vaccination Timelines</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Console Form Side ─────────────────── */}
      <div className="login-form-side">
        {/* Brand Header (mobile only) */}
        <div className="login-brand-header">
          <div className="login-brand-logo-box">
            <img src="/tinitraker-logo.png" alt="TiniTraker" />
          </div>
          <span className="login-brand-title">TiniTraker</span>
        </div>

        {/* Form Card */}
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
            {/* Identifier */}
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

            {/* Password */}
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

            {/* Remember Me & Forgot */}
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
                onClick={() => setShowForgot(true)}
              >
                Forgot password?
              </button>
            </div>

            {/* Terms */}
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

            {/* Submit */}
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading
                ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: '#ffffff', borderTopColor: 'transparent' }} />
                : 'Sign In'}
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

      {/* ── Forgot Password Modal ─────────────────────── */}
      {showForgot && (
        <ForgotPasswordModal
          onClose={() => setShowForgot(false)}
          onSuccess={handleForgotSuccess}
        />
      )}

      {/* ── Terms / Privacy Modal ─────────────────────── */}
      {infoModal && (
        <div
          className="notif-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setInfoModal(null)}
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000 }}
        >
          <div
            className="notif-modal-card"
            style={{ maxWidth: 440, background: '#111827', border: '1px solid rgba(255,255,255,0.12)', color: '#f8fafc' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                {infoModal === 'terms' ? 'Terms of Service' : 'Clinical Privacy Policy'}
              </div>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
              >✕</button>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {infoModal === 'terms' && (
                <p>TiniTraker is a clinical management and patient communication console. Users must maintain clinical confidentiality in compliance with medical data regulations.</p>
              )}
              {infoModal === 'privacy' && (
                <p>Patient health information, WhatsApp notification logs, and obstetrics/pediatric records are protected and accessible only to authorized medical personnel within your hospital.</p>
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
