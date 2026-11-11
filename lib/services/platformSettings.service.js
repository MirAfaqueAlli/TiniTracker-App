import { PlatformSetting } from '../db/models/index.js';

const DEFAULTS = {
  id: 1,
  platform_name: 'TiniTracker Healthcare Platform',
  support_email: 'support@tinitracker.in',
  support_phone: '+91 98765 43210',
  maintenance_mode: false,
  maintenance_notice: 'The platform is undergoing brief routine maintenance. Service will resume shortly.',
  allow_hospital_registration: true,
  default_trial_days: 14,
  starter_plan_price: 2499,
  pro_plan_price: 4999,
  enterprise_plan_price: 9999,
};

/** Load the singleton platform settings row (creates it if absent). */
export async function getPlatformSettings() {
  const [settings] = await PlatformSetting.findOrCreate({
    where: { id: 1 },
    defaults: DEFAULTS,
  });
  return settings;
}

export async function getPlanPrices(settings = null) {
  const s = settings || await getPlatformSettings();
  return {
    starter:      Number(s.starter_plan_price) || DEFAULTS.starter_plan_price,
    professional: Number(s.pro_plan_price) || DEFAULTS.pro_plan_price,
    enterprise:   Number(s.enterprise_plan_price) || DEFAULTS.enterprise_plan_price,
  };
}

export async function isMaintenanceMode() {
  const s = await getPlatformSettings();
  return Boolean(s.maintenance_mode);
}

export async function getDefaultTrialDays() {
  const s = await getPlatformSettings();
  const days = Number(s.default_trial_days);
  return Number.isFinite(days) && days > 0 ? days : 14;
}

export async function areHospitalRegistrationsAllowed() {
  const s = await getPlatformSettings();
  return Boolean(s.allow_hospital_registration);
}
