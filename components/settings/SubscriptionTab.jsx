'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard, Check, Sparkles, AlertCircle, Clock, CheckCircle2,
  Zap, ArrowRight, ShieldCheck, HelpCircle, Phone, Calendar,
  Building2, ChevronRight, X, Send, Award, RefreshCw, MessageSquare, Info
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function SubscriptionTab() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'
  const [modalPlan, setModalPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [toast, setToast] = useState(null);
  const [portalRoot, setPortalRoot] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  // Prevent background scrolling when modal is open so modal never scrolls up
  useEffect(() => {
    if (modalPlan) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalPlan]);

  function showToast(type, title, message) {
    setToast({ type, title, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }

  const fetchSubscription = async () => {
    try {
      const res = await api.get('/hospitals/subscription');
      setSubData(res.data);
    } catch (err) {
      console.error('Failed to load subscription:', err);
      showToast('error', 'Error', 'Failed to load subscription details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  const openUpgradeModal = (plan) => {
    setModalPlan(plan);
    setNotes('');
    setContactPhone(user?.hospital_phone || user?.Hospital?.phone || '');
  };

  const closeUpgradeModal = () => {
    if (submitting) return;
    setModalPlan(null);
  };

  const handleSubmitUpgrade = async (e) => {
    e.preventDefault();
    if (!modalPlan) return;
    setSubmitting(true);

    try {
      const res = await api.post('/hospitals/subscription', {
        requested_plan: modalPlan.key,
        billing_cycle: billingCycle,
        notes,
        contact_phone: contactPhone,
      });

      showToast('success', 'Request Submitted!', res.data.message || 'Upgrade request has been dispatched to provider administrators.');
      closeUpgradeModal();
      await fetchSubscription();
    } catch (err) {
      console.error('Upgrade submission error:', err);
      showToast('error', 'Submission Failed', err.response?.data?.error || 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="sub-loading-wrap">
        <RefreshCw className="settings-spin" size={28} />
        <p>Loading subscription details...</p>
      </div>
    );
  }

  const currentSub = subData?.subscription;
  const pendingReq = subData?.pending_request;
  const plans = subData?.available_plans || [];
  const isTrial = currentSub?.is_trial ?? true;
  const daysLeft = currentSub?.days_remaining ?? 14;

  const planDisplayName = () => {
    if (!currentSub) return 'Free Trial (14-Day)';
    if (currentSub.plan === 'free_trial') return '14-Day Clinical Free Trial';
    if (currentSub.plan === 'starter') return 'Starter Clinic Plan';
    if (currentSub.plan === 'professional') return 'Professional Hospital Plan';
    if (currentSub.plan === 'enterprise') return 'Enterprise Network Plan';
    return currentSub.plan?.toUpperCase();
  };

  return (
    <div className="subscription-tab-container">
      {/* Toast Alert */}
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

      {/* ── 1. Current Plan Status Hero ───────────────────────────────────── */}
      <div className="sub-status-card">
        <div className="sub-status-header">
          <div className="sub-status-badge-wrap">
            <div className={`sub-status-pill ${isTrial ? 'trial' : 'active'}`}>
              <Sparkles size={14} />
              <span>{isTrial ? 'FREE TRIAL' : 'ACTIVE SUBSCRIBER'}</span>
            </div>
            {currentSub?.is_expired ? (
              <span className="sub-pill-danger">Expired</span>
            ) : isTrial ? (
              <span className="sub-pill-warning">{daysLeft} Days Remaining</span>
            ) : (
              <span className="sub-pill-success">Active & Healthy</span>
            )}
          </div>

          <div className="sub-hospital-tag">
            <Building2 size={15} />
            <span>{user?.hospital_name || user?.hospital || 'Hospital'}</span>
          </div>
        </div>

        <div className="sub-status-main">
          <div className="sub-status-info">
            <h2 className="sub-status-title">{planDisplayName()}</h2>
            <p className="sub-status-desc">
              {isTrial
                ? 'Your hospital has full trial access to core clinical workflows, patient schedules, and automated WhatsApp reminders.'
                : 'Your facility is powered by official TiniTracker clinical communication and maternity care protocols.'}
            </p>

            <div className="sub-meta-grid">
              <div className="sub-meta-item">
                <span className="sub-meta-label">Plan Tier</span>
                <span className="sub-meta-val">{currentSub?.plan ? currentSub.plan.replace('_', ' ').toUpperCase() : 'FREE TRIAL'}</span>
              </div>
              <div className="sub-meta-item">
                <span className="sub-meta-label">Validity Period</span>
                <span className="sub-meta-val">
                  {currentSub?.starts_at ? new Date(currentSub.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  {' → '}
                  {currentSub?.ends_at ? new Date(currentSub.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
              <div className="sub-meta-item">
                <span className="sub-meta-label">Admin Contact</span>
                <span className="sub-meta-val">{user?.email || 'Administrator'}</span>
              </div>
              <div className="sub-meta-item">
                <span className="sub-meta-label">Automation Status</span>
                <span className="sub-meta-val text-emerald">Active & Running</span>
              </div>
            </div>
          </div>

          {/* Countdown indicator */}
          <div className="sub-countdown-box">
            <div className="countdown-ring">
              <span className="countdown-num">{daysLeft}</span>
              <span className="countdown-lbl">Days Left</span>
            </div>
            {isTrial && (
              <div className="countdown-subtext">
                Free trial period ends soon. Upgrade now to avoid service interruptions.
              </div>
            )}
          </div>
        </div>

        {/* Pending Request Banner */}
        {pendingReq && (
          <div className="sub-pending-banner">
            <div className="pending-banner-icon">
              <Clock size={18} />
            </div>
            <div className="pending-banner-text">
              <div className="pending-banner-title">
                Upgrade Request Pending Review ({pendingReq.requested_plan?.toUpperCase()} - {pendingReq.billing_cycle?.toUpperCase()})
              </div>
              <div className="pending-banner-sub">
                Submitted on {new Date(pendingReq.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
                Our provider team has received your request and will activate your subscription shortly.
              </div>
            </div>
            <div className="pending-banner-badge">
              Provider Notified 🔔
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Plans Comparison Section ───────────────────────────────────── */}
      <div className="sub-plans-section">
        <div className="plans-section-header">
          <div>
            <div className="plans-pretitle">
              <Zap size={15} />
              <span>CHOOSE YOUR EXPANSION PLAN</span>
            </div>
            <h2 className="plans-title">Upgrade Your Healthcare Facility</h2>
            <p className="plans-subtitle">
              Scale your maternity and pediatric patient management with unlimited registrations and automated multi-touchpoint WhatsApp communications.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="billing-cycle-switch">
            <button
              type="button"
              className={`cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              className={`cycle-btn ${billingCycle === 'annual' ? 'active' : ''}`}
              onClick={() => setBillingCycle('annual')}
            >
              Annual Billing
              <span className="cycle-discount-pill">Save 17% (2 Mo Free)</span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="plans-cards-grid">
          {plans.map((p) => {
            const isPopular = p.popular;
            const isCurrent = currentSub?.plan === p.key;
            const isPendingThisPlan = pendingReq && pendingReq.requested_plan === p.key;
            const price = billingCycle === 'annual' ? Math.round(p.annualPrice / 12) : p.monthlyPrice;
            const billedAnnuallyText = billingCycle === 'annual' ? `₹${p.annualPrice.toLocaleString('en-IN')}/year billed annually` : 'Billed monthly';

            return (
              <div
                key={p.key}
                className={`plan-tier-card ${isPopular ? 'popular' : ''} ${isCurrent ? 'current' : ''}`}
              >
                {isPopular && (
                  <div className="plan-popular-ribbon">
                    <Sparkles size={12} />
                    <span>RECOMMENDED BY HOSPITALS</span>
                  </div>
                )}

                <div className="plan-card-header">
                  <div className="plan-badge-row">
                    <span className="plan-tag-badge">{p.badge}</span>
                    {isCurrent && <span className="current-plan-pill">Current Plan</span>}
                  </div>
                  <h3 className="plan-name">{p.name}</h3>
                  <p className="plan-tagline">{p.tagline}</p>
                </div>

                <div className="plan-pricing">
                  <div className="pricing-num-wrap">
                    <span className="pricing-curr">₹</span>
                    <span className="pricing-amount">{price.toLocaleString('en-IN')}</span>
                    <span className="pricing-period">/ month</span>
                  </div>
                  <div className="pricing-subtext">{billedAnnuallyText}</div>
                </div>

                <div className="plan-features-list">
                  <div className="features-head">INCLUDED CAPABILITIES:</div>
                  {p.features.map((feat, idx) => (
                    <div key={idx} className="feature-item">
                      <div className="feature-check">
                        <Check size={14} />
                      </div>
                      <span className="feature-text">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="plan-action-area">
                  {isCurrent ? (
                    <button className="btn-plan-action current" disabled>
                      <CheckCircle2 size={16} />
                      <span>Current Active Plan</span>
                    </button>
                  ) : isPendingThisPlan ? (
                    <button className="btn-plan-action pending" disabled>
                      <Clock size={16} />
                      <span>Upgrade Requested (Pending)</span>
                    </button>
                  ) : (
                    <button
                      className={`btn-plan-action ${isPopular ? 'btn-popular' : 'btn-regular'}`}
                      onClick={() => openUpgradeModal(p)}
                    >
                      <span>Request Upgrade</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Upgrade Guarantee & FAQ Cards ───────────────────────────────── */}
      <div className="sub-guarantee-grid">
        <div className="guarantee-card">
          <div className="guarantee-icon">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h4 className="guarantee-title">Zero Clinical Downtime</h4>
            <p className="guarantee-desc">
              Your patient database, WhatsApp schedules, and vaccination records remain 100% active during and after the upgrade.
            </p>
          </div>
        </div>

        <div className="guarantee-card">
          <div className="guarantee-icon">
            <MessageSquare size={22} />
          </div>
          <div>
            <h4 className="guarantee-title">Official WhatsApp Provider Route</h4>
            <p className="guarantee-desc">
              High-throughput Meta cloud API connection ensures maternal and newborn immunization reminders never fail.
            </p>
          </div>
        </div>

        <div className="guarantee-card">
          <div className="guarantee-icon">
            <Phone size={22} />
          </div>
          <div>
            <h4 className="guarantee-title">Dedicated Onboarding Support</h4>
            <p className="guarantee-desc">
              Our provider team coordinates directly with your hospital admin for seamless subscription activation.
            </p>
          </div>
        </div>
      </div>

      {/* ── 4. Upgrade Request Modal ───────────────────────────────────────── */}
      {modalPlan && portalRoot && createPortal(
        <div className="sub-modal-overlay" onClick={closeUpgradeModal}>
          <div className="sub-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sub-modal-header">
              <div className="sub-modal-title-group">
                <div className="sub-modal-icon-badge">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="sub-modal-title">Request Plan Upgrade</h3>
                  <p className="sub-modal-sub">
                    Dispatch an upgrade request to the TiniTracker provider administration team.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="sub-modal-close"
                onClick={closeUpgradeModal}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitUpgrade} className="sub-modal-form">
              {/* Selected Plan Summary Banner */}
              <div className="sub-modal-plan-summary">
                <div className="summary-left">
                  <div className="summary-plan-badge">{modalPlan.badge}</div>
                  <div className="summary-plan-name">{modalPlan.name}</div>
                  <div className="summary-plan-tagline">{modalPlan.tagline}</div>
                </div>
                <div className="summary-right">
                  <div className="summary-price-amt">
                    ₹{(billingCycle === 'annual' ? Math.round(modalPlan.annualPrice / 12) : modalPlan.monthlyPrice).toLocaleString('en-IN')}
                    <span className="summary-price-unit">/mo</span>
                  </div>
                  <div className="summary-cycle-pill">
                    {billingCycle === 'annual' ? 'Billed annually (₹' + modalPlan.annualPrice.toLocaleString('en-IN') + ')' : 'Billed monthly'}
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="sub-form-group">
                <label className="sub-form-label">Selected Billing Cycle</label>
                <div className="sub-cycle-options">
                  <label className={`cycle-option ${billingCycle === 'monthly' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="modalBillingCycle"
                      value="monthly"
                      checked={billingCycle === 'monthly'}
                      onChange={() => setBillingCycle('monthly')}
                    />
                    <div className="cycle-option-text">
                      <div className="cycle-option-title">Monthly Billing</div>
                      <div className="cycle-option-sub">₹{modalPlan.monthlyPrice.toLocaleString('en-IN')} per month</div>
                    </div>
                  </label>

                  <label className={`cycle-option ${billingCycle === 'annual' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="modalBillingCycle"
                      value="annual"
                      checked={billingCycle === 'annual'}
                      onChange={() => setBillingCycle('annual')}
                    />
                    <div className="cycle-option-text">
                      <div className="cycle-option-title">
                        Annual Billing <span className="discount-tag">Save 17%</span>
                      </div>
                      <div className="cycle-option-sub">₹{modalPlan.annualPrice.toLocaleString('en-IN')} / year</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="sub-form-group">
                <label className="sub-form-label">
                  Primary Contact Phone <span className="req-star">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +91 9876543210"
                  className="sub-form-input"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
                <span className="sub-form-hint">
                  Provider administrators will use this number if verification or invoice coordination is needed.
                </span>
              </div>

              <div className="sub-form-group">
                <label className="sub-form-label">Additional Notes or Custom Requirements (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="e.g., Number of branches, preferred GST invoice details, or requested activation date..."
                  className="sub-form-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="sub-modal-alert">
                <Info size={16} />
                <span>
                  Once submitted, the provider administration dashboard will instantly receive your request. A confirmation notification will appear in your hospital portal upon approval.
                </span>
              </div>

              <div className="sub-modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={closeUpgradeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-upgrade"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="settings-spin" size={16} />
                      <span>Sending Request...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Submit Upgrade Request to Provider</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        portalRoot
      )}
    </div>
  );
}
