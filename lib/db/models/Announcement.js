import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Announcement = sequelize.isDefined('Announcement')
  ? sequelize.model('Announcement')
  : sequelize.define('Announcement', {
      title:              { type: DataTypes.STRING(255), allowNull: false },
      message:            { type: DataTypes.TEXT, allowNull: false },
      priority:           { type: DataTypes.ENUM('info', 'warning', 'urgent'), defaultValue: 'info' },
      target_type:        { type: DataTypes.ENUM('all', 'hospital'), defaultValue: 'all' },
      target_hospital_id: { type: DataTypes.INTEGER, allowNull: true },
      sender_name:        { type: DataTypes.STRING(100), defaultValue: 'TiniTracker Superadmin' },
      is_pinned:          { type: DataTypes.BOOLEAN, defaultValue: false },
    }, {
      tableName: 'announcements',
      timestamps: true,
    });

export default Announcement;
