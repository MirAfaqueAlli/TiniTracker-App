/**
 * Canonical subscription taxonomy.
 * A plan answers "what tier?" and a billing cycle answers "how often billed?".
 * Legacy plan values (monthly/quarterly/yearly/custom/migrated) are mapped
 * during migration and normalized here for safety.
 */
export const PLAN_KEYS = ['free_trial', 'starter', 'professional', 'enterprise'];
export const PAID_PLAN_KEYS = ['starter', 'professional', 'enterprise'];
export const BILLING_CYCLE_KEYS = ['monthly', 'quarterly', 'yearly'];

const LEGACY_PLAN_MAP = {
  monthly:     'starter',
  quarterly:   'professional',
  yearly:      'enterprise',
  annual:      'enterprise',
  custom:      'enterprise',
  migrated:    'professional',
};

export function normalizePlanKey(plan) {
  if (!plan || typeof plan !== 'string') return 'professional';
  const key = plan.trim().toLowerCase();
  if (PLAN_KEYS.includes(key)) return key;
  return LEGACY_PLAN_MAP[key] || 'professional';
}

export function normalizeBillingCycle(cycle) {
  if (!cycle || typeof cycle !== 'string') return 'monthly';
  const key = cycle.trim().toLowerCase();
  if (key === 'annual' || key === 'annually') return 'yearly';
  if (BILLING_CYCLE_KEYS.includes(key)) return key;
  return 'monthly';
}

export const PLAN_CATALOG = [
  {
    key: 'starter',
    name: 'Starter Clinic',
    tagline: 'Ideal for independent maternity clinics and pediatric practices',
    badge: 'Essential',
    defaultMonthlyPrice: 2499,
    features: [
      'Up to 250 active patient registrations',
      'Automated WhatsApp 7-day & 1-day reminders',
      'Maternal pregnancy & child immunization timeline',
      'Up to 3 staff & doctor accounts',
      'Standard email & chat support',
    ],
  },
  {
    key: 'professional',
    name: 'Professional Hospital',
    tagline: 'Comprehensive clinical care for growing maternity hospitals',
    badge: 'Most Popular',
    defaultMonthlyPrice: 4999,
    popular: true,
    features: [
      'Unlimited patient registrations',
      'Full automated WhatsApp reminders (7d, 1d, same-day, and missed flags)',
      'Role-based permissions & customizable clinical staff access',
      'Complete activity audit trails and logging',
      'Unlimited doctor, nurse, and admin accounts',
      'Newborn delivery auto-transition to immunization protocol',
      'Priority WhatsApp gateway route',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise Network',
    tagline: 'For multi-branch hospital chains and enterprise healthcare systems',
    badge: 'Full Suite',
    defaultMonthlyPrice: 9999,
    features: [
      'Everything in Professional Hospital',
      'Multi-branch centralized hospital management',
      'Custom WhatsApp Sender ID & Official Green Tick branding',
      'Dedicated Account Manager & 24/7 priority SLA support',
      'Custom clinical stage templates & care plans',
      'Automated data backup & custom reports',
    ],
  },
];

export function buildPlanCatalog(prices = {}) {
  return PLAN_CATALOG.map((plan) => {
    const monthly = Number(prices[plan.key] ?? plan.defaultMonthlyPrice) || plan.defaultMonthlyPrice;
    return {
      ...plan,
      monthlyPrice: monthly,
      quarterlyPrice: monthly * 3,
      yearlyPrice: monthly * 12,
      // Legacy alias kept for clients that still read annualPrice.
      annualPrice: monthly * 12,
    };
  });
}

export function planDisplayName(plan) {
  const key = normalizePlanKey(plan);
  const found = PLAN_CATALOG.find((p) => p.key === key);
  if (found) return found.name;
  if (key === 'free_trial') return 'Free Trial';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
