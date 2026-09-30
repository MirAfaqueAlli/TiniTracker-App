import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const ProviderAdmin = sequelize.isDefined('ProviderAdmin')
  ? sequelize.model('ProviderAdmin')
  : sequelize.define('ProviderAdmin', {
      name:          { type: DataTypes.STRING(150), allowNull: false },
      email:         { type: DataTypes.STRING(200), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      role:          { type: DataTypes.ENUM('superadmin', 'support'), allowNull: false, defaultValue: 'support' },
      is_blocked:    { type: DataTypes.BOOLEAN, defaultValue: false },
    }, { tableName: 'provider_admins', timestamps: true });

export default ProviderAdmin;
