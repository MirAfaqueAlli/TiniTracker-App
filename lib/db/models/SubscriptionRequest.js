import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const SubscriptionRequest = sequelize.isDefined('SubscriptionRequest')
  ? sequelize.model('SubscriptionRequest')
  : sequelize.define('SubscriptionRequest', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      hospital_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      user_name: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      user_email: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      hospital_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      current_plan: {
        type: DataTypes.STRING(50),
        defaultValue: 'free_trial',
      },
      requested_plan: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      billing_cycle: {
        type: DataTypes.ENUM('monthly', 'annual'),
        defaultValue: 'monthly',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      contact_phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'contacted'),
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    }, {
      tableName: 'subscription_requests',
      timestamps: true,
    });

export default SubscriptionRequest;
