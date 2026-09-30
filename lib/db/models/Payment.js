import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Payment = sequelize.isDefined('Payment')
  ? sequelize.model('Payment')
  : sequelize.define('Payment', {
      hospital_id:     { type: DataTypes.INTEGER, allowNull: false },
      subscription_id: { type: DataTypes.INTEGER },
      amount:          { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      currency:        { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
      payment_date:    { type: DataTypes.DATEONLY, allowNull: false },
      method:          { type: DataTypes.STRING(50) },
      reference:       { type: DataTypes.STRING(100) },
      recorded_by:     { type: DataTypes.INTEGER },
      notes:           { type: DataTypes.TEXT },
    }, { tableName: 'payments', timestamps: true });

export default Payment;
