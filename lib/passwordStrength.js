/**
 * Password Strength & Criteria Evaluation Module
 * TiniTracker Security Policy
 */

export const PASSWORD_CRITERIA = [
  {
    id: 'length',
    label: 'At least 8 characters',
    shortLabel: '8+ chars',
    validator: (pwd) => (pwd || '').length >= 8,
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter (A-Z)',
    shortLabel: '1 uppercase (A-Z)',
    validator: (pwd) => /[A-Z]/.test(pwd || ''),
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter (a-z)',
    shortLabel: '1 lowercase (a-z)',
    validator: (pwd) => /[a-z]/.test(pwd || ''),
  },
  {
    id: 'number',
    label: 'One number (0-9)',
    shortLabel: '1 number (0-9)',
    validator: (pwd) => /[0-9]/.test(pwd || ''),
  },
  {
    id: 'symbol',
    label: 'One special symbol (!@#$%...)',
    shortLabel: '1 symbol (!@#$...)',
    validator: (pwd) => /[^A-Za-z0-9]/.test(pwd || ''),
  },
];

/**
 * Pure evaluation function for password strength and criteria analysis.
 */
export function evaluatePassword(password = '') {
  const pwd = password || '';
  const results = PASSWORD_CRITERIA.map(c => ({
    id: c.id,
    label: c.label,
    shortLabel: c.shortLabel,
    passed: c.validator(pwd),
  }));

  const passedCount = results.filter(r => r.passed).length;
  const missing = results.filter(r => !r.passed);
  const totalCount = PASSWORD_CRITERIA.length;

  let level = 'empty';
  let label = 'Not entered';
  let color = '#94a3b8';
  let gradient = 'linear-gradient(90deg, #94a3b8, #cbd5e1)';
  let bg = '#f8fafc';
  let percentage = 0;

  if (pwd.length > 0) {
    if (passedCount <= 2) {
      level = 'weak';
      label = 'Weak';
      color = '#ef4444';
      gradient = 'linear-gradient(90deg, #ef4444, #f87171)';
      bg = '#fef2f2';
      percentage = Math.max(20, Math.round((passedCount / totalCount) * 100));
    } else if (passedCount === 3) {
      level = 'fair';
      label = 'Fair';
      color = '#f59e0b';
      gradient = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
      bg = '#fffbeb';
      percentage = 60;
    } else if (passedCount === 4) {
      level = 'good';
      label = 'Good';
      color = '#0284c7';
      gradient = 'linear-gradient(90deg, #0284c7, #38bdf8)';
      bg = '#f0f9ff';
      percentage = 80;
    } else {
      // 5 criteria met
      if (pwd.length >= 12) {
        level = 'very-strong';
        label = 'Very Strong';
        color = '#059669';
        gradient = 'linear-gradient(90deg, #059669, #34d399)';
        bg = '#ecfdf5';
        percentage = 100;
      } else {
        level = 'strong';
        label = 'Strong';
        color = '#10b981';
        gradient = 'linear-gradient(90deg, #10b981, #6ee7b7)';
        bg = '#ecfdf5';
        percentage = 100;
      }
    }
  }

  // Minimum accepted baseline: length >= 8 and at least 4 criteria passed
  const isValid = pwd.length >= 8 && passedCount >= 4;
  const isAllPassed = passedCount === totalCount;

  return {
    results,
    passedCount,
    totalCount,
    missing,
    level,
    label,
    color,
    gradient,
    bg,
    percentage,
    isValid,
    isAllPassed,
  };
}
