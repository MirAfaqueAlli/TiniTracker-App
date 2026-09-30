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
      batch_cron_time: {
        type: DataTypes.STRING(10),
        defaultValue: '08:00', // HH:MM
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
