import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const PlatformSetting = sequelize.isDefined('PlatformSetting')
  ? sequelize.model('PlatformSetting')
  : sequelize.define('PlatformSetting', {
      platform_name:               { type: DataTypes.STRING(150), defaultValue: 'TiniTraker Healthcare Platform' },
      support_email:               { type: DataTypes.STRING(150), defaultValue: 'support@tinitraker.in' },
      support_phone:               { type: DataTypes.STRING(50), defaultValue: '+91 98765 43210' },
      maintenance_mode:            { type: DataTypes.BOOLEAN, defaultValue: false },
      maintenance_notice:          { type: DataTypes.TEXT, allowNull: true },
      allow_hospital_registration: { type: DataTypes.BOOLEAN, defaultValue: true },
      default_trial_days:          { type: DataTypes.INTEGER, defaultValue: 14 },
      starter_plan_price:          { type: DataTypes.INTEGER, defaultValue: 2499 },
      pro_plan_price:              { type: DataTypes.INTEGER, defaultValue: 4999 },
      enterprise_plan_price:       { type: DataTypes.INTEGER, defaultValue: 9999 },
      // SMS fallback, WhatsApp engine toggle, audit toggle, and session-timeout
      // settings were removed because no runtime code implements them.
    }, {
      tableName: 'platform_settings',
      timestamps: true,
      createdAt: false, // only updatedAt
    });

export default PlatformSetting;
