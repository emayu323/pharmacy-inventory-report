export type Gender = 'male' | 'female' | 'other';

// Medication Check Item
export interface MedicationCheckItem {
  id: string; // Internal ID for UI key
  name: string;
  current_amount: string;
  next_required_amount: string;
  unit: string;
  notes: string;
  checked: boolean;
}

export interface Report {
  id: string; // UUID
  created_at: string;
  updated_at: string;

  // Basic Info
  patient_name: string;
  patient_dob: string; // ISO Date string 'YYYY-MM-DD'
  patient_gender: Gender;
  doctor_name: string;
  pharmacist_name: string;

  // Dates
  prescription_date: string;
  dispensing_date: string;
  visit_date: string;

  // Medication Status
  compliance_status: string;
  leftover_meds: string; // Keep for summary/legacy
  medications_check_list?: MedicationCheckItem[]; // Support JSONB
  storage_status: string;

  // Instructions
  medication_instruction: string;
  side_effects: string;

  // Plan
  next_visit_plan: string;
  next_visit_date?: string; // ISO Date string 'YYYY-MM-DD'
}

export type NewReport = Omit<Report, 'id' | 'created_at' | 'updated_at'>;
