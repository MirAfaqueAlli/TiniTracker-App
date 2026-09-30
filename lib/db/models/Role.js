import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Role = sequelize.isDefined('Role')
  ? sequelize.model('Role')
  : sequelize.define('Role', {
      hospital_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // null for system global defaults, or hospital_id for hospital-specific
      },
      key: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      dept: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING(30),
        defaultValue: '#00857c',
      },
      bg: {
        type: DataTypes.STRING(30),
        defaultValue: '#e8f7f2',
      },
      border: {
        type: DataTypes.STRING(30),
        defaultValue: '#c4e9de',
      },
      is_system: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    }, {
      tableName: 'roles',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['hospital_id', 'key'],
        },
      ],
    });

export default Role;
