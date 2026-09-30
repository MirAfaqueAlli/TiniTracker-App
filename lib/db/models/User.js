import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const User = sequelize.isDefined('User')
  ? sequelize.model('User')
  : sequelize.define('User', {
      hospital_id:    { type: DataTypes.INTEGER, allowNull: false },
      name:           { type: DataTypes.STRING(100), allowNull: false },
      email:          { type: DataTypes.STRING(100), allowNull: false, unique: true },
      password_hash:  { type: DataTypes.STRING(255), allowNull: false },
      role:                  { type: DataTypes.STRING(64), defaultValue: 'staff' },
      force_password_change: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_blocked:            { type: DataTypes.BOOLEAN, defaultValue: false },
    }, { tableName: 'users', timestamps: true });

export default User;
