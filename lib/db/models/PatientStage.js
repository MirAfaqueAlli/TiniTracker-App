import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const PatientStage = sequelize.isDefined('PatientStage')
  ? sequelize.model('PatientStage')
  : sequelize.define('PatientStage', {
      patient_id:         { type: DataTypes.INTEGER, allowNull: false },
      stage_template_id:  { type: DataTypes.INTEGER, allowNull: false },
      status:             {
        type: DataTypes.ENUM('pending','notified','visited','skipped','missed'),
        defaultValue: 'pending'
      },
      scheduled_date:     { type: DataTypes.DATEONLY },           // recalculated when EDD changes
      actual_visit_date:  { type: DataTypes.DATEONLY },           // filled when patient comes in
      date_overridden:    { type: DataTypes.BOOLEAN, defaultValue: false },
      override_reason:    { type: DataTypes.TEXT },
      skip_reason:        { type: DataTypes.TEXT },
      stage_data:         { type: DataTypes.JSON },               // BP, weight, vaccines given, etc.
      notes:              { type: DataTypes.TEXT },
      recorded_by:        { type: DataTypes.INTEGER }             // FK to users
    }, { tableName: 'patient_stages', timestamps: true });

export default PatientStage;
