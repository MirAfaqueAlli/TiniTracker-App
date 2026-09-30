import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Hospital = sequelize.isDefined('Hospital')
  ? sequelize.model('Hospital')
  : sequelize.define('Hospital', {
      name:                  { type: DataTypes.STRING(255), allowNull: false },
      address:               { type: DataTypes.TEXT },
      phone:                 { type: DataTypes.STRING(20) },
      whatsapp_sender_id:    { type: DataTypes.STRING(50) },
      whatsapp_api_url:      { type: DataTypes.STRING(500) },
      whatsapp_api_key:      { type: DataTypes.STRING(500) },
      whatsapp_api_provider: { type: DataTypes.STRING(100) },
      is_blocked:            { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    }, { tableName: 'hospitals', timestamps: true });

export default Hospital;
