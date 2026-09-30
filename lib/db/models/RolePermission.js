import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const RolePermission = sequelize.isDefined('RolePermission')
  ? sequelize.model('RolePermission')
  : sequelize.define('RolePermission', {
      hospital_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      role_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      permission_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    }, {
      tableName: 'role_permissions',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['hospital_id', 'role_key', 'permission_key'],
        },
      ],
    });

export default RolePermission;
