import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const SystemConfig = sequelize.isDefined('SystemConfig')
  ? sequelize.model('SystemConfig')
  : sequelize.define('SystemConfig', {
      hospital_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      timezone: {
        type: DataTypes.STRING(64),
        defaultValue: 'Asia/Kolkata',
      },
      batch_cron_time: {
        type: DataTypes.STRING(10),
        defaultValue: '08:00', // HH:MM
      },
      // DB-backed last-run marker (replaces the previous in-memory Map).
      last_batch_run_date: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      last_batch_run_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      batch_auto_run: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      reminder_7d_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      reminder_1d_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      reminder_today_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      missed_flag_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    }, {
      tableName: 'system_configs',
      timestamps: true,
    });

export default SystemConfig;
