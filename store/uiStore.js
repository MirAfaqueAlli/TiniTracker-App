import { create } from 'zustand';

export const useUiStore = create((set) => ({
  registerPatientOpen: false,
  registerPatientType: null,

  openRegisterPatient: (patientType = null) => set({
    registerPatientOpen: true,
    registerPatientType: patientType,
  }),

  closeRegisterPatient: () => set({
    registerPatientOpen: false,
    registerPatientType: null,
  }),
}));
