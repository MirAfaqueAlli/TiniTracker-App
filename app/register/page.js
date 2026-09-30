'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye, EyeOff, ArrowLeft, ArrowRight, CheckCircle2,
  AlertCircle, Building2, Users, ChevronDown, Check,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import PasswordStrengthMeter, { evaluatePassword } from '@/components/PasswordStrengthMeter';
import './register.css';

const COUNTRY_CODES = [
  { code: '+91', label: 'India (+91)', flag: '🇮🇳' },
  { code: '+1', label: 'United States (+1)', flag: '🇺🇸' },
  { code: '+44', label: 'United Kingdom (+44)', flag: '🇬🇧' },
  { code: '+971', label: 'UAE (+971)', flag: '🇦🇪' },
  { code: '+65', label: 'Singapore (+65)', flag: '🇸🇬' },
  { code: '+60', label: 'Malaysia (+60)', flag: '🇲🇾' },
  { code: '+61', label: 'Australia (+61)', flag: '🇦🇺' },
  { code: '+49', label: 'Germany (+49)', flag: '🇩🇪' },
  { code: '+33', label: 'France (+33)', flag: '🇫🇷' },
  { code: '+81', label: 'Japan (+81)', flag: '🇯🇵' },
];

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState(1); // 1 = Hospital Info, 2 = Owner Details

  // ── Form State ────────────────────────────────────────────────────────────
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');

  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ── Email Verification State ──────────────────────────────────────────────
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpBoxOpen, setOtpBoxOpen]       = useState(false);
  const [otpValue, setOtpValue]           = useState('');
  const [otpSending, setOtpSending]       = useState(false);
  const [otpVerifying, setOtpVerifying]   = useState(false);
  const [otpError, setOtpError]           = useState('');
  const [otpSuccess, setOtpSuccess]       = useState('');
  const [resendTimer, setResendTimer]     = useState(0);

  // 15-second countdown timer for Resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // close country dropdown on outside click
  useEffect(() => {
    if (!countryOpen) return;
    const handler = () => setCountryOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [countryOpen]);

  // ── Send Verification OTP ──────────────────────────────────────────────────
  async function handleSendOtp() {
    if (!email || !email.trim()) {
      setError('Please enter your email address first.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setOtpSending(true);
    setOtpError('');
    setOtpSuccess('');
    setError('');

    try {
      const res = await api.post('/auth/send-otp', { email: email.trim() });
      setOtpBoxOpen(true);
      setResendTimer(15);
      setOtpSuccess(res.data.message || `Verification code sent to ${email.trim()}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send verification code.';
      setOtpError(msg);
      if (err.response?.data?.waitSeconds) {
        setResendTimer(err.response.data.waitSeconds);
        setOtpBoxOpen(true);
      }
    } finally {
      setOtpSending(false);
    }
  }

  // ── Confirm Verification OTP ───────────────────────────────────────────────
  async function handleVerifyOtp() {
    if (!otpValue || otpValue.trim().length !== 6) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }

    setOtpVerifying(true);
    setOtpError('');

    try {
      await api.post('/auth/verify-otp', {
        email: email.trim(),
        otp: otpValue.trim(),
      });
      setEmailVerified(true);
      setOtpBoxOpen(false);
      setOtpError('');
      setOtpSuccess('Email verified successfully!');
      setError('');
    } catch (err) {
      setOtpError(err.response?.data?.error || 'Invalid verification code. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  }

  // ── Step 1 → 2 ───────────────────────────────────────────────────────────
  function handleStep1(e) {
    e.preventDefault();
    setError('');
    if (!hospitalName.trim()) { setError('Hospital name is required.'); return; }
    setStep(2);
  }

  // ── Final Submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!ownerName.trim()) { setError('Full name is required.'); return; }
    if (!email.trim()) { setError('Email address is required.'); return; }
    if (!emailVerified) {
      setError('Please verify your email address before creating your account.');
      if (!otpBoxOpen) {
        handleSendOtp();
      }
      return;
    }
    if (!phone.trim()) { setError('Phone number is required.'); return; }
    if (!password) { setError('Password is required.'); return; }
    const pwdEval = evaluatePassword(password);
    if (!pwdEval.isValid) {
      const missingDetails = pwdEval.missing.map(m => m.shortLabel).join(', ');
      setError(`Password is not strong enough. Missing: ${missingDetails}`);
      return;
    }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        hospital_name: hospitalName,
        hospital_address: hospitalAddress,
        hospital_city: city,
        hospital_state: stateName,
        hospital_pincode: pincode,
        owner_name: ownerName,
        email,
        country_code: countryCode,
        phone,
        password,
        confirm_password: confirmPassword,
      });

      if (res.data?.token && res.data?.user) {
        setAuth(res.data.token, res.data.user, true);
        router.push('/dashboard');
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  // ── Success Screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="reg-page-wrapper">
        <div className="reg-hero-side">
          <div className="reg-hero-content">
            <div className="reg-hero-brand">
              <div className="reg-hero-logo-box">
                <img src="/tinitraker-logo.png" alt="TiniTraker" />
              </div>
              <span className="reg-hero-brand-name">TiniTraker</span>
            </div>
            <h1 className="reg-hero-title">Start your free trial</h1>
            <p className="reg-hero-desc">Set up your cloud console in under 2 minutes.</p>
            {/* Step tracker */}
            <div className="reg-hero-steps">
              <div className="reg-hero-step done">
                <div className="reg-hero-step-circle">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <span className="reg-hero-step-label">Hospital Info</span>
              </div>
              <div className="reg-hero-step-line filled" />
              <div className="reg-hero-step done">
                <div className="reg-hero-step-circle">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <span className="reg-hero-step-label">Admin Details</span>
              </div>
              <div className="reg-hero-step-line filled" />
              <div className="reg-hero-step done">
                <div className="reg-hero-step-circle">
                  <Check size={16} strokeWidth={2.5} />
                </div>
                <span className="reg-hero-step-label">Choose Plan</span>
              </div>
            </div>
          </div>
        </div>

        <div className="reg-form-side">
          <div className="reg-brand-header">
            <div className="reg-brand-logo-box">
              <img src="/tinitraker-logo.png" alt="TiniTraker" />
            </div>
            <span className="reg-brand-title">TiniTraker</span>
          </div>

          <div className="reg-success-content">
            <div className="reg-success-icon">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="reg-console-title" style={{ marginTop: '1.25rem' }}>You&apos;re all set!</h2>
            <p className="reg-console-subtitle" style={{ marginBottom: '2rem' }}>
              Your 14-day free trial has started. Welcome to TiniTraker!
            </p>
            <button
              className="reg-submit-btn"
              onClick={() => router.push('/dashboard')}
            >
              Go to Dashboard →
            </button>
          </div>

          <div className="reg-footer-row">
            <span>Need help? </span>
            <span className="reg-footer-link">Contact support</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="reg-page-wrapper">

      {/* ── Left Hero Side ──────────────────────────────────────────────── */}
      <div className="reg-hero-side">
        <div className="reg-hero-content">
          {/* Brand */}
          <div className="reg-hero-brand">
            <div className="reg-hero-logo-box">
              <img src="/tinitraker-logo.png" alt="TiniTraker" />
            </div>
            <span className="reg-hero-brand-name">TiniTraker</span>
          </div>

          {/* Headline */}
          <h1 className="reg-hero-title">Start your free trial</h1>
          <p className="reg-hero-desc">Set up your cloud console in under 2 minutes.</p>

          {/* Step tracker */}
          <div className="reg-hero-steps">
            <div className={`reg-hero-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
              <div className="reg-hero-step-circle">
                {step > 1 ? <Check size={16} strokeWidth={2.5} /> : <span>1</span>}
              </div>
              <span className="reg-hero-step-label">Hospital Info</span>
            </div>
            <div className={`reg-hero-step-line ${step > 1 ? 'filled' : ''}`} />
            <div className={`reg-hero-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
              <div className="reg-hero-step-circle">
                {step > 2 ? <Check size={16} strokeWidth={2.5} /> : <span>2</span>}
              </div>
              <span className="reg-hero-step-label">Admin Details</span>
            </div>
            <div className="reg-hero-step-line" />
            <div className="reg-hero-step reg-step-locked">
              <div className="reg-hero-step-circle"><span>3</span></div>
              <span className="reg-hero-step-label">Choose Plan</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Form Side ─────────────────────────────────────────────── */}
      <div className="reg-form-side">



        {/* Form Card Content */}
        <div className="reg-card-content">

          {step === 1 && (
            <>
              <h2 className="reg-console-title">Hospital Information</h2>
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="reg-console-title">Admin Details</h2>
              <p className="reg-console-subtitle">This will be your admin login account.</p>
            </>
          )}

          {/* Error Banner */}
          {error && (
            <div className="reg-alert reg-alert-error">
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1: Hospital Info ──────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleStep1} autoComplete="off">
              <div className="reg-form-group">
                <label className="reg-form-label">
                  Hospital Name <span className="reg-req">*</span>
                </label>
                <input
                  className="reg-input"
                  type="text"
                  placeholder="e.g. Sunrise Maternity Clinic"
                  value={hospitalName}
                  onChange={e => setHospitalName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="reg-form-group">
                <label className="reg-form-label">Address</label>
                <input
                  className="reg-input"
                  type="text"
                  placeholder="Street address / Building"
                  value={hospitalAddress}
                  onChange={e => setHospitalAddress(e.target.value)}
                />
              </div>

              <div className="reg-row">
                <div className="reg-form-group reg-col-flex">
                  <label className="reg-form-label">City</label>
                  <input
                    className="reg-input"
                    type="text"
                    placeholder="City"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  />
                </div>
                <div className="reg-form-group reg-col-flex">
                  <label className="reg-form-label">State</label>
                  <input
                    className="reg-input"
                    type="text"
                    placeholder="State"
                    value={stateName}
                    onChange={e => setStateName(e.target.value)}
                  />
                </div>
                <div className="reg-form-group reg-col-pin">
                  <label className="reg-form-label">Pincode</label>
                  <input
                    className="reg-input"
                    type="text"
                    placeholder="000000"
                    maxLength={10}
                    value={pincode}
                    onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <button type="submit" className="reg-submit-btn">
                Continue
                <ArrowRight size={16} />
              </button>
            </form>
          )}

          {/* ── STEP 2: Owner Details ──────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} autoComplete="off">

              <div className="reg-form-group">
                <label className="reg-form-label">
                  Full Name <span className="reg-req">*</span>
                </label>
                <input
                  className="reg-input"
                  type="text"
                  placeholder="e.g. Rajesh Kumar"
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="reg-form-group">
                <label className="reg-form-label">
                  Email Address <span className="reg-req">*</span>
                </label>
                <div className="reg-email-input-row">
                  <input
                    className={`reg-input reg-email-input ${emailVerified ? 'reg-input-verified' : ''}`}
                    type="email"
                    placeholder="e.g. rajesh@example.com"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value);
                      if (emailVerified) {
                        setEmailVerified(false);
                        setOtpBoxOpen(false);
                        setOtpValue('');
                        setOtpSuccess('');
                        setOtpError('');
                      }
                    }}
                    required
                  />
                  {emailVerified ? (
                    <div className="reg-email-verified-badge">
                      <CheckCircle2 size={15} />
                      <span>Verified</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="reg-email-verify-btn"
                      onClick={handleSendOtp}
                      disabled={otpSending || !email.trim()}
                    >
                      {otpSending ? <span className="reg-spinner" /> : 'Verify'}
                    </button>
                  )}
                </div>

                {/* OTP Verification Box */}
                {otpBoxOpen && !emailVerified && (
                  <div className="reg-otp-box">
                    <div className="reg-otp-header">
                      <span className="reg-otp-prompt">
                        Enter the 6-digit code sent to <strong className="reg-otp-target-email">{email}</strong>
                      </span>
                    </div>

                    {otpError && (
                      <div className="reg-otp-alert reg-otp-alert-error">
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        <span>{otpError}</span>
                      </div>
                    )}

                    {otpSuccess && !otpError && (
                      <div className="reg-otp-alert reg-otp-alert-success">
                        <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                        <span>{otpSuccess}</span>
                      </div>
                    )}

                    <div className="reg-otp-input-row">
                      <input
                        type="text"
                        className="reg-input reg-otp-input"
                        placeholder="••••••"
                        maxLength={6}
                        inputMode="numeric"
                        value={otpValue}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setOtpValue(val);
                          if (otpError) setOtpError('');
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="reg-otp-confirm-btn"
                        onClick={handleVerifyOtp}
                        disabled={otpVerifying || otpValue.length !== 6}
                      >
                        {otpVerifying ? <span className="reg-spinner" /> : 'Confirm'}
                      </button>
                    </div>

                    <div className="reg-otp-footer">
                      <span className="reg-otp-help">Didn&apos;t receive the code?</span>
                      <button
                        type="button"
                        className="reg-otp-resend-btn"
                        onClick={handleSendOtp}
                        disabled={resendTimer > 0 || otpSending}
                      >
                        {otpSending ? (
                          'Sending...'
                        ) : resendTimer > 0 ? (
                          `Resend in ${resendTimer}s`
                        ) : (
                          'Resend'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Country */}
              <div className="reg-form-group">
                <label className="reg-form-label">
                  Country <span className="reg-req">*</span>
                </label>
                <div
                  className="reg-country-select"
                  onClick={e => { e.stopPropagation(); setCountryOpen(v => !v); }}
                >
                  <span className="reg-country-flag">{selectedCountry.flag}</span>
                  <span className="reg-country-label">{selectedCountry.label}</span>
                  <ChevronDown size={14} className={`reg-chevron ${countryOpen ? 'open' : ''}`} />

                  {countryOpen && (
                    <div className="reg-country-dropdown" onMouseDown={e => e.stopPropagation()}>
                      {COUNTRY_CODES.map(c => (
                        <div
                          key={c.code}
                          className={`reg-country-option ${c.code === countryCode ? 'selected' : ''}`}
                          onMouseDown={e => {
                            e.preventDefault();
                            setCountryCode(c.code);
                            setCountryOpen(false);
                          }}
                        >
                          <span>{c.flag}</span>
                          <span>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div className="reg-form-group">
                <label className="reg-form-label">
                  Phone Number <span className="reg-req">*</span>
                </label>
                <div className="reg-phone-wrap">
                  <span className="reg-phone-prefix">{countryCode}</span>
                  <input
                    className="reg-input reg-phone-input"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    maxLength={15}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="reg-form-group">
                <label className="reg-form-label">
                  Password <span className="reg-req">*</span>
                </label>
                <div className="reg-input-wrap">
                  <input
                    className="reg-input"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ paddingRight: '2.75rem' }}
                    required
                  />
                  <button type="button" className="reg-pwd-toggle" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {/* Live Password Strength Meter & Checklist */}
                <PasswordStrengthMeter password={password} />
              </div>

              {/* Confirm Password */}
              <div className="reg-form-group">
                <label className="reg-form-label">
                  Confirm Password <span className="reg-req">*</span>
                </label>
                <div className="reg-input-wrap">
                  <input
                    className="reg-input"
                    type={showConfirmPwd ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    style={{ paddingRight: '2.75rem' }}
                    required
                  />
                  <button type="button" className="reg-pwd-toggle" onClick={() => setShowConfirmPwd(v => !v)} tabIndex={-1}>
                    {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Terms */}
              <p className="reg-terms-text">
                By creating an account, you agree to TiniTraker&apos;s{' '}
                <a href="https://rextrox.in/terms-conditions/" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                {' '}and{' '}
                <a href="https://rextrox.in/privacy-policy/" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </p>

              {/* Buttons */}
              <div className="reg-btn-row">
                <button
                  type="button"
                  className="reg-back-btn"
                  onClick={() => { setError(''); setStep(1); }}
                  disabled={loading}
                >
                  <ArrowLeft size={15} />
                  Back
                </button>
                <button type="submit" className="reg-submit-btn reg-submit-grow" disabled={loading}>
                  {loading
                    ? <span className="reg-spinner" />
                    : <><span>Create Account</span><ArrowRight size={15} /></>
                  }
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="reg-footer-row">
          <span>Already have an account? </span>
          <button
            type="button"
            className="reg-footer-link"
            onClick={() => router.push('/login')}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
