'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CreditCard, Check, Clock, CheckCircle2,
  ArrowRight, X, Send, RefreshCw, Info,
  Users, MessageSquare, ShieldCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function SubscriptionTab() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [modalPlan, setModalPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const plansRef = useRef(null);

  useEffect(() => {
    if (modalPlan) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [modalPlan]);

  function showToast(type, title, message) {
    setToast({ type, title, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }

  async function fetchSubscription() {
    try {
      const res = await api.get('/hospitals/subscription');
      setSubData(res.data);
    } catch (err) {
      console.error('Failed to load subscription:', err);
      showToast('error', 'Error', 'Failed to load subscription details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(fetchSubscription, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openUpgradeModal(plan) {
    setModalPlan(plan);
    setNotes('');
    setContactPhone(user?.hospital_phone || user?.Hospital?.phone || '');
  }

  function closeUpgradeModal() {
    if (submitting) return;
    setModalPlan(null);
  }

  async function handleSubmitUpgrade(e) {
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
  }

  if (loading) {
    return (
      <section className="setting-panel">
        <div className="loading-block">
          <RefreshCw size={26} style={{ animation: 'spin 1s linear infinite' }} />
          <p>Loading subscription details...</p>
        </div>
      </section>
    );
  }

  const currentSub = subData?.subscription;
  const pendingReq = subData?.pending_request;
  const plans = subData?.available_plans || [];
  const isTrial = currentSub?.is_trial ?? true;
  const daysLeft = currentSub?.days_remaining ?? 0;

  const planDisplayName = () => {
    if (!currentSub) return 'Free Trial';
    if (currentSub.plan === 'free_trial') return '14-Day Clinical Free Trial';
    if (currentSub.plan === 'starter') return 'Starter Clinic Plan';
    if (currentSub.plan === 'professional') return 'Professional Hospital Plan';
    if (currentSub.plan === 'enterprise') return 'Enterprise Network Plan';
    return currentSub.plan?.toUpperCase();
  };

  const usage = subData?.usage || {
    patients: 0,
    reminders_sent: 0,
    staff_count: 0,
  };

  const planKey = currentSub?.plan || 'free_trial';
  const patientLimit = planKey === 'starter' ? '250' : 'Unlimited';
  const staffLimit = planKey === 'starter' ? '3' : 'Unlimited';

  const dateLabel = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <>
      {toast && (
        <div className="toasts" role="status" aria-live="polite">
          <div className={`toast ${toast.type === 'error' ? 'err' : ''}`}>
            <div>
              <span className="toast-k">{toast.type === 'error' ? 'Not saved' : 'TiniTraker'}</span>
              <span>{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      <section className="setting-panel" aria-labelledby="billing-title">
        <div className="panel-head">
          <div>
            <h2 className="setting-title" id="billing-title">Subscription &amp; billing</h2>
           
          </div>
          <div className="panel-actions">
            <span className="chip chip-line">
              <CreditCard size={13} />
              {isTrial ? `Free trial · ${daysLeft} days left` : planDisplayName()}
            </span>
          </div>
        </div>

        <div className="billing-body">
          <div className="billing-hero">
            <div>
              <span className="trial-tag">{isTrial ? 'Free Clinical Trial' : 'Active Subscriber'}</span>
              <div className="billing-days">
                {daysLeft} days<small>{currentSub?.is_expired ? 'expired' : 'left'}</small>
              </div>
              <p className="billing-note">
                {isTrial
                  ? `Your full feature set is free until ${dateLabel(currentSub?.ends_at)}. Upgrade before the trial ends to keep automated reminders running.`
                  : `Your ${planDisplayName()} is active until ${dateLabel(currentSub?.ends_at)}.`}
              </p>
              <div className="billing-meta">
                <span>Plan · {currentSub?.plan ? currentSub.plan.replace('_', ' ').toUpperCase() : 'FREE TRIAL'}</span>
                <span>{dateLabel(currentSub?.starts_at)} → {dateLabel(currentSub?.ends_at)}</span>
                <span>Admin · {user?.email || 'Administrator'}</span>
              </div>
            </div>
            <div className="billing-usage-widget" aria-label="Current plan usage and quotas">
              <div className="usage-item">
                <div className="usage-icon" aria-hidden="true">
                  <Users size={16} />
                </div>
                <div className="usage-details">
                  <div className="usage-value">
                    {usage.patients} <small>/ {patientLimit}</small>
                  </div>
                  <div className="usage-label">Tracked Patients</div>
                </div>
              </div>

              <div className="usage-divider" aria-hidden="true" />

              <div className="usage-item">
                <div className="usage-icon" aria-hidden="true">
                  <MessageSquare size={16} />
                </div>
                <div className="usage-details">
                  <div className="usage-value">
                    {usage.reminders_sent} <small>sent</small>
                  </div>
                  <div className="usage-label">WhatsApp Reminders</div>
                </div>
              </div>

              <div className="usage-divider" aria-hidden="true" />

              <div className="usage-item">
                <div className="usage-icon" aria-hidden="true">
                  <ShieldCheck size={16} />
                </div>
                <div className="usage-details">
                  <div className="usage-value">
                    {usage.staff_count} <small>/ {staffLimit}</small>
                  </div>
                  <div className="usage-label">Active Team Members</div>
                </div>
              </div>
            </div>
          </div>

          {pendingReq && (
            <div className="request-banner">
              <div className="banner-main">
                <Clock size={18} />
                <div>
                  <div>
                    Upgrade request pending review · {pendingReq.requested_plan?.toUpperCase()} ({pendingReq.billing_cycle?.toUpperCase()})
                  </div>
                  <div style={{ font: '500 11.5px/1.5 var(--s-font)', marginTop: 2 }}>
                    Submitted {dateLabel(pendingReq.createdAt)}. Our provider team has received your request and will activate your subscription shortly.
                  </div>
                </div>
              </div>
              <span className="chip chip-live">Provider notified</span>
            </div>
          )}

          <div className="section-subhead" ref={plansRef}>
            <div>
              <h3>Plans for the next chapter</h3>
              
            </div>
            <div className="radio-row" role="group" aria-label="Billing cycle">
              <label className="radio-option">
                <input
                  type="radio"
                  name="billing-cycle"
                  value="monthly"
                  checked={billingCycle === 'monthly'}
                  onChange={() => setBillingCycle('monthly')}
                />
                Monthly
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="billing-cycle"
                  value="annual"
                  checked={billingCycle === 'annual'}
                  onChange={() => setBillingCycle('annual')}
                />
                Annual · save 17%
              </label>
            </div>
          </div>

          <div className="plan-grid">
            {plans.map((plan) => {
              const isPopular = plan.popular;
              const isCurrent = currentSub?.plan === plan.key;
              const isPendingThisPlan = pendingReq && pendingReq.requested_plan === plan.key;
              const price = billingCycle === 'annual' ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
              const billedText = billingCycle === 'annual'
                ? `₹${plan.annualPrice.toLocaleString('en-IN')} billed annually`
                : 'Billed monthly';

              return (
                <div
                  key={plan.key}
                  className={`plan-card${isPopular ? ' recommended' : ''}${isCurrent ? ' current' : ''}`}
                >
                  {isPopular && <span className="plan-rec">Recommended</span>}
                  <div>
                    <div className="plan-name">{plan.name}</div>
                    <div className="plan-tagline">{plan.tagline}</div>
                  </div>
                  <div className="plan-price">
                    ₹{price.toLocaleString('en-IN')}<small>/ month</small>
                  </div>
                  <div className="plan-blurb">{billedText}</div>
                  <ul className="plan-features">
                    {plan.features.map((feature, index) => (
                      <li key={index}>
                        <Check size={13} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <button type="button" className="btn btn-primary" disabled>
                      <CheckCircle2 size={16} />
                      Current plan
                    </button>
                  ) : isPendingThisPlan ? (
                    <button type="button" className="btn btn-outline" disabled>
                      <Clock size={16} />
                      Requested
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`btn ${isPopular ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => openUpgradeModal(plan)}
                    >
                      Request upgrade
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {modalPlan && (
        <div className="sv-modal-overlay" onClick={closeUpgradeModal}>
          <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-upgrade-title">
            <div className="dlg-form">
              <div className="dlg-head">
                <div>
                  <h2 className="dlg-title" id="dlg-upgrade-title">Request an upgrade</h2>
                  <p className="dlg-sub">Our team will confirm availability and final pricing with you.</p>
                </div>
                <button type="button" className="close-x" onClick={closeUpgradeModal} disabled={submitting} aria-label="Close upgrade request">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitUpgrade} className="dlg-form" style={{ maxHeight: 'none' }}>
                <div className="dlg-body">
                  <div className="dlg-plan">
                    <div className="dlg-plan-name">{modalPlan.name}</div>
                    <div className="dlg-plan-note">
                      ₹{(billingCycle === 'annual' ? Math.round(modalPlan.annualPrice / 12) : modalPlan.monthlyPrice).toLocaleString('en-IN')} / month
                      {' · '}
                      {billingCycle === 'annual' ? `₹${modalPlan.annualPrice.toLocaleString('en-IN')} billed annually` : 'billed monthly'}
                    </div>
                  </div>

                  <div className="field">
                    <label>Billing cycle</label>
                    <div className="radio-row">
                      <label className="radio-option">
                        <input type="radio" name="modal-billing-cycle" value="monthly" checked={billingCycle === 'monthly'} onChange={() => setBillingCycle('monthly')} />
                        Monthly
                      </label>
                      <label className="radio-option">
                        <input type="radio" name="modal-billing-cycle" value="annual" checked={billingCycle === 'annual'} onChange={() => setBillingCycle('annual')} />
                        Annual · save 17%
                      </label>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="upgrade-phone">Primary contact phone <span className="req">*</span></label>
                    <input
                      id="upgrade-phone"
                      type="text"
                      required
                      placeholder="e.g. +91 9876543210"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                    <span className="hint">Provider administrators will use this number if verification or invoice coordination is needed.</span>
                  </div>

                  <div className="field">
                    <label htmlFor="upgrade-note">Note for the TiniTraker team <span className="hint">(optional)</span></label>
                    <textarea
                      id="upgrade-note"
                      rows={3}
                      placeholder="e.g. Number of branches, preferred GST invoice details, or requested activation date..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="request-banner">
                    <div className="banner-main">
                      <Info size={16} />
                      <span>
                        Once submitted, the provider administration dashboard will instantly receive your request. A confirmation notification will appear in your hospital portal upon approval.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="dlg-foot">
                  <button type="button" className="btn btn-outline" onClick={closeUpgradeModal} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? (
                      <>
                        <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        Sending request...
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        Send request
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
