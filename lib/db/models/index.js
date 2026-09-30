import sequelize      from '../sequelize.js';
import Hospital       from './Hospital.js';
import User           from './User.js';
import Patient        from './Patient.js';
import StageTemplate  from './StageTemplate.js';
import PatientStage   from './PatientStage.js';
import Notification   from './Notification.js';
import ProviderAdmin  from './ProviderAdmin.js';
import Subscription   from './Subscription.js';
import Payment        from './Payment.js';
import PatientHistory from './PatientHistory.js';
import AppNotification from './AppNotification.js';
import Role           from './Role.js';
import RolePermission from './RolePermission.js';
import SystemConfig   from './SystemConfig.js';
import Announcement   from './Announcement.js';
import PlatformSetting from './PlatformSetting.js';
import SubscriptionRequest from './SubscriptionRequest.js';
import ProviderNotification from './ProviderNotification.js';

// ── Associations ──────────────────────────────────────────────────────────────
// Use Model.associations check — reliable across Turbopack isolated module contexts.

if (!Hospital.associations?.Users) {
  Hospital.hasMany(User,      { foreignKey: 'hospital_id' });
  User.belongsTo(Hospital,    { foreignKey: 'hospital_id' });
}

if (!Hospital.associations?.Patients) {
  Hospital.hasMany(Patient,   { foreignKey: 'hospital_id' });
  Patient.belongsTo(Hospital, { foreignKey: 'hospital_id' });
}

if (!Patient.associations?.stages) {
  Patient.hasMany(PatientStage,   { foreignKey: 'patient_id', as: 'stages' });
  PatientStage.belongsTo(Patient, { foreignKey: 'patient_id' });
}

if (!PatientStage.associations?.template) {
  StageTemplate.hasMany(PatientStage,   { foreignKey: 'stage_template_id' });
  PatientStage.belongsTo(StageTemplate, { foreignKey: 'stage_template_id', as: 'template' });
}

if (!Patient.associations?.Notifications) {
  Patient.hasMany(Notification,    { foreignKey: 'patient_id' });
  Notification.belongsTo(Patient,  { foreignKey: 'patient_id' });
}

if (!PatientStage.associations?.Notifications) {
  PatientStage.hasMany(Notification,   { foreignKey: 'patient_stage_id' });
  Notification.belongsTo(PatientStage, { foreignKey: 'patient_stage_id' });
}

if (!User.associations?.recorded_stages) {
  User.hasMany(PatientStage,    { foreignKey: 'recorded_by', as: 'recorded_stages' });
  PatientStage.belongsTo(User,  { foreignKey: 'recorded_by', as: 'recorder' });
}

// ── Phase 2 associations ─────────────────────────────────────────────────────

if (!Hospital.associations?.Subscriptions) {
  Hospital.hasMany(Subscription,   { foreignKey: 'hospital_id' });
  Subscription.belongsTo(Hospital, { foreignKey: 'hospital_id' });
}

if (!Hospital.associations?.Payments) {
  Hospital.hasMany(Payment,        { foreignKey: 'hospital_id' });
  Payment.belongsTo(Hospital,      { foreignKey: 'hospital_id' });
}

if (!Subscription.associations?.Payments) {
  Subscription.hasMany(Payment,    { foreignKey: 'subscription_id' });
  Payment.belongsTo(Subscription,  { foreignKey: 'subscription_id' });
}

if (!Patient.associations?.history) {
  Patient.hasMany(PatientHistory,    { foreignKey: 'patient_id', as: 'history' });
  PatientHistory.belongsTo(Patient,  { foreignKey: 'patient_id' });
}

if (!Hospital.associations?.Roles) {
  Hospital.hasMany(Role,           { foreignKey: 'hospital_id' });
  Role.belongsTo(Hospital,         { foreignKey: 'hospital_id' });
}

if (!Hospital.associations?.RolePermissions) {
  Hospital.hasMany(RolePermission, { foreignKey: 'hospital_id' });
  RolePermission.belongsTo(Hospital,{ foreignKey: 'hospital_id' });
}

if (!Hospital.associations?.SystemConfig) {
  Hospital.hasOne(SystemConfig,    { foreignKey: 'hospital_id' });
  SystemConfig.belongsTo(Hospital, { foreignKey: 'hospital_id' });
}

if (!Announcement.associations?.Hospital) {
  Announcement.belongsTo(Hospital, { foreignKey: 'target_hospital_id' });
}

if (!Hospital.associations?.SubscriptionRequests) {
  Hospital.hasMany(SubscriptionRequest, { foreignKey: 'hospital_id' });
  SubscriptionRequest.belongsTo(Hospital, { foreignKey: 'hospital_id' });
}

export {
  sequelize,
  Hospital, User, Patient, StageTemplate, PatientStage, Notification,
  ProviderAdmin, Subscription, Payment, PatientHistory, AppNotification,
  Role, RolePermission, SystemConfig, Announcement, PlatformSetting,
  SubscriptionRequest, ProviderNotification,
};

