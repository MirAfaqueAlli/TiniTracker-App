import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const Patient = sequelize.isDefined('Patient')
  ? sequelize.model('Patient')
  : sequelize.define('Patient', {
      hospital_id:          { type: DataTypes.INTEGER, allowNull: false },
      whatsapp_number:      { type: DataTypes.STRING(20), allowNull: false, unique: true },
      name:                 { type: DataTypes.STRING(150), allowNull: false },
      age:                  { type: DataTypes.INTEGER },
      address:              { type: DataTypes.TEXT },
      patient_type:         { type: DataTypes.ENUM('pregnant','immunization','both'), allowNull: false },
      // Pregnancy fields
      lmp_date:             { type: DataTypes.DATEONLY },
      edd:                  { type: DataTypes.DATEONLY },          // master date — all stages derive from this
      edd_source:           { type: DataTypes.ENUM('lmp_calculated','direct_entry','ultrasound'), defaultValue: 'lmp_calculated' },
      edd_last_updated:     { type: DataTypes.DATE },
      ultrasound_scan_date: { type: DataTypes.DATEONLY },
      // Delivery / child fields
      delivery_date:        { type: DataTypes.DATEONLY },
      child_dob:            { type: DataTypes.DATEONLY },
      child_name:           { type: DataTypes.STRING(100) },
      child_gender:         { type: DataTypes.ENUM('male','female','other') },
      // Status
      status:               { type: DataTypes.ENUM('active','completed','inactive'), defaultValue: 'active' },
      registered_by:        { type: DataTypes.INTEGER },
      notes:                { type: DataTypes.TEXT }
    }, { tableName: 'patients', timestamps: true });

export default Patient;
