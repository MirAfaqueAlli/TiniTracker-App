import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

// In-app notification feed — internal staff-facing events
// Separate from the WhatsApp Notification model which is patient-facing delivery log
const AppNotification = sequelize.isDefined('AppNotification')
  ? sequelize.model('AppNotification')
  : sequelize.define('AppNotification', {
      hospital_id:  { type: DataTypes.INTEGER, allowNull: false },
      patient_id:   { type: DataTypes.INTEGER, allowNull: true },
      actor_id:     { type: DataTypes.INTEGER, allowNull: true },
      actor_name:   { type: DataTypes.STRING(100) },
      event_type: {
        type: DataTypes.ENUM(
          'patient_registered',
          'visit_marked',
          'stage_skipped',
          'stage_rescheduled',
          'delivery_recorded',
          'edd_updated',
          'batch_run',
          'patient_edited'
        ),
        allowNull: false,
      },
      title:        { type: DataTypes.STRING(200), allowNull: false },
      body:         { type: DataTypes.TEXT },
      patient_name: { type: DataTypes.STRING(100) },
      is_read:      { type: DataTypes.BOOLEAN, defaultValue: false },
      meta:         { type: DataTypes.JSON },
    }, {
      tableName:  'app_notifications',
      timestamps: true,
      updatedAt:  false,  // append-only feed
    });

export default AppNotification;
