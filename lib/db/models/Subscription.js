import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Subscription = sequelize.isDefined('Subscription')
  ? sequelize.model('Subscription')
  : sequelize.define('Subscription', {
      hospital_id: { type: DataTypes.INTEGER, allowNull: false },
      plan:        {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'free_trial',
      },
      starts_at:   { type: DataTypes.DATEONLY, allowNull: false },
      ends_at:     { type: DataTypes.DATEONLY, allowNull: false },
      is_active:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      notes:       { type: DataTypes.TEXT },
      created_by:  { type: DataTypes.INTEGER },   // provider_admin.id
    }, { tableName: 'subscriptions', timestamps: true });

export default Subscription;
