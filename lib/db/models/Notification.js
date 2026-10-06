import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Notification = sequelize.isDefined('Notification')
  ? sequelize.model('Notification')
  : sequelize.define('Notification', {
      patient_id:          { type: DataTypes.INTEGER, allowNull: false },
      patient_stage_id:    { type: DataTypes.INTEGER },
      type:                {
        type: DataTypes.ENUM('reminder_7d','reminder_1d','reminder_today','missed','manual','stage_complete','edd_updated','delivery_recorded','stage_skipped','stage_rescheduled'),
        allowNull: false
      },
      whatsapp_number:     { type: DataTypes.STRING(20), allowNull: false },
      message_body:        { type: DataTypes.TEXT },
      status:              { type: DataTypes.ENUM('pending','sent','failed','delivered','read'), defaultValue: 'pending' },
      provider_message_id: { type: DataTypes.STRING(100) },
      sent_at:             { type: DataTypes.DATE },
      delivered_at:        { type: DataTypes.DATE }
    }, { tableName: 'notifications', timestamps: true });

export default Notification;
