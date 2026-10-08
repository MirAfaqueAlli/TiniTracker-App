'use client';

import React, { useMemo } from 'react';
import { Check, X, ShieldAlert, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { PASSWORD_CRITERIA, evaluatePassword } from '@/lib/passwordStrength';

export { PASSWORD_CRITERIA, evaluatePassword };

export default function PasswordStrengthMeter({
  password = '',
  showChecklist = true,
  compact = false,
  minRequiredScore = 4,
  theme = 'dark',
}) {
  const analysis = useMemo(() => evaluatePassword(password), [password]);
  const hasInput = Boolean(password && password.length > 0);

  if (!hasInput) {
    return null;
  }

  return (
    <div className={`password-strength-widget ${compact ? 'compact' : ''} ${theme === 'dark' ? 'theme-dark' : ''}`}>
      {/* Header bar: Strength Title, Slider meter, and Rating pill */}
      <div className="pwd-meter-header">
        <div className="pwd-meter-title-wrap">
          <span className="pwd-meter-label">Password Strength:</span>
          <span
            className="pwd-meter-rating-badge"
            style={{
              backgroundColor: hasInput ? analysis.color : '#e2e8f0',
              color: hasInput ? '#ffffff' : '#64748b',
            }}
          >
            {hasInput ? analysis.label : 'None'}
          </span>
        </div>
        <div className="pwd-meter-score-text">
          {hasInput ? (
            <span>
              <strong>{analysis.passedCount}</strong> / {analysis.totalCount} criteria met
            </span>
          ) : (
            <span style={{ color: '#94a3b8' }}>5 criteria recommended</span>
          )}
        </div>
      </div>

      {/* Visual Slider Track with Ticks & Fluid Fill */}
      <div className="pwd-slider-track" role="progressbar" aria-valuenow={analysis.percentage} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="pwd-slider-fill"
          style={{
            width: `${analysis.percentage}%`,
            background: analysis.gradient,
            boxShadow: hasInput ? `0 0 10px ${analysis.color}40` : 'none',
          }}
        >
          {hasInput && <span className="pwd-slider-thumb" style={{ backgroundColor: analysis.color }} />}
        </div>

        {/* Step division marks (20%, 40%, 60%, 80%) */}
        <div className="pwd-slider-ticks">
          <span className="pwd-slider-tick" style={{ left: '20%' }} />
          <span className="pwd-slider-tick" style={{ left: '40%' }} />
          <span className="pwd-slider-tick" style={{ left: '60%' }} />
          <span className="pwd-slider-tick" style={{ left: '80%' }} />
        </div>
      </div>

      {/* Dynamic Feedback Notice: What the user misses */}
      {hasInput && (
        <div className="pwd-feedback-banner">
          {analysis.isAllPassed ? (
            <div className="pwd-feedback-success">
              <Sparkles size={14} className="pwd-feedback-icon" />
              <span>Excellent password! All security criteria have been fulfilled.</span>
            </div>
          ) : (
            <div className="pwd-feedback-missing">
              <AlertCircle size={14} className="pwd-feedback-icon" />
              <div className="pwd-feedback-text">
                <span className="pwd-feedback-miss-label">To make your password stronger, add: </span>
                <span className="pwd-feedback-miss-items">
                  {analysis.missing.map((m, idx) => (
                    <strong key={m.id} className="pwd-missing-tag">
                      {m.shortLabel}
                      {idx < analysis.missing.length - 1 ? ', ' : ''}
                    </strong>
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Criteria Parameter Checklist */}
      {showChecklist && (
        <div className="pwd-criteria-grid">
          {analysis.results.map((rule) => {
            const isMet = rule.passed;
            return (
              <div
                key={rule.id}
                className={`pwd-criterion-item ${isMet ? 'met' : 'unmet'}`}
              >
                <div className={`pwd-criterion-icon ${isMet ? 'met' : 'unmet'}`}>
                  {isMet ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    <span className="pwd-criterion-dot" />
                  )}
                </div>
                <span className="pwd-criterion-text">
                  {rule.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
