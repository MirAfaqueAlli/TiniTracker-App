import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const ProviderNotification = sequelize.isDefined('ProviderNotification')
  ? sequelize.model('ProviderNotification')
  : sequelize.define('ProviderNotification', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      type: {
        type: DataTypes.ENUM('upgrade_request', 'hospital_registered', 'payment_received', 'system_alert'),
        defaultValue: 'upgrade_request',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      hospital_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      hospital_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      action_url: {
        type: DataTypes.STRING(255),
        defaultValue: '/subscriptions',
      },
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    }, {
      tableName: 'provider_notifications',
      timestamps: true,
    });

export default ProviderNotification;
