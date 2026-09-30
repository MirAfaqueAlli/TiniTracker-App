import { DataTypes } from 'sequelize';
import sequelize from '../sequelize.js';

const PatientHistory = sequelize.isDefined('PatientHistory')
  ? sequelize.model('PatientHistory')
  : sequelize.define('PatientHistory', {
      patient_id:        { type: DataTypes.INTEGER, allowNull: false },
      hospital_id:       { type: DataTypes.INTEGER, allowNull: false },
      event_type:        {
        type: DataTypes.ENUM(
          'stage_visited',
          'stage_skipped',
          'stage_rescheduled',
          'edd_updated',
          'delivery_recorded',
          'hospital_transferred',
          'patient_edited',
          'note_added'
        ),
        allowNull: false,
      },
      event_data:        { type: DataTypes.JSON },
      performed_by:      { type: DataTypes.INTEGER },
      performed_by_role: { type: DataTypes.STRING(50) },
    }, {
      tableName: 'patient_history',
      timestamps: true,
      updatedAt: false,   // append-only
    });

export default PatientHistory;
