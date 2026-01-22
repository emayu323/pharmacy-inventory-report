export type Gender = 'male' | 'female' | 'other';

export interface Patient {
  id: string; // UUID
  created_at: string;
  name: string;
  kana?: string;
  dob: string; // YYYY-MM-DD
  gender: Gender;
  address?: string;
  contact1?: string;
  contact2?: string;
  contact2_memo?: string;
  memo?: string;
  medical_institution_name?: string;
  primary_doctor?: string;
  home_care_office?: string;
  care_manager?: string;
  pharmacy_name?: string;
  is_active?: boolean;
}

export interface Pharmacist {
  id: string;
  created_at: string;
  name: string;
}

// Medication Check Item
export interface MedicationCheckItem {
  id: string; // Internal ID for UI key
  name: string;
  current_amount: string;
  next_required_amount: string;
  leftover_amount?: string;
  prescription_amount?: string;
  unit: string;
  notes: string;
  checked: boolean;
}

export interface Report {
  id: string; // UUID
  created_at: string;
  updated_at: string;
  patient_id?: string; // Foreign Key to Patient


  // Basic Info
  patient_name: string;
  patient_dob: string; // ISO Date string 'YYYY-MM-DD'
  patient_gender: Gender;
  doctor_name: string;
  medical_institution_name?: string;
  pharmacist_name: string;
  pharmacy_name?: string;
  pharmacy_tel?: string;
  pharmacy_fax?: string;

  // Dates
  prescription_date: string;
  dispensing_date: string;
  visit_date: string;

  // Medication Status
  regular_medication_supply_until?: string; // New field: YYYY-MM-DD
  medications_check_list?: MedicationCheckItem[];
  medications_check_list_prn?: MedicationCheckItem[]; // PRN Medications

  // Instructions
  chief_complaint?: string; // New field

  // New Fields (2025-01-21)
  allergy_history?: string;
  guidance_recipient?: string;
  medication_status?: string;
  storage_status?: string;
  other_dept_consultation?: string;
  concomitant_medications?: string;
  interaction_status?: string;

  medication_instruction: string;
  side_effects: string;

  // Plan
  // next_visit_plan: string; // Removed per user request
  next_visit_date?: string; // ISO Date string 'YYYY-MM-DD'
  memo?: string; // Snapshot of patient memo at time of report
}

export type InstitutionType = 'hospital' | 'pharmacy' | 'care_office';

export interface Institution {
  id: string;
  created_at: string;
  type: InstitutionType;
  name: string;
  address?: string;
  tel?: string;
  fax?: string;
  doctor_name?: string;
}
