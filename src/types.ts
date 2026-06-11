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
  visiting_nursing_station_name?: string;
  pharmacy_name?: string;
  is_active?: boolean;
  deleted_at?: string;
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
  previous_supply_until?: string;
  prescription_days?: string;
  actual_remaining_days?: string;
  actual_remaining_reason?: string;
  calculated_previous_remaining_days?: string;
  calculated_total_days?: string;
  calculated_supply_until?: string;
  unit: string;
  notes: string;
  checked: boolean;
}

export interface Report {
  id: string; // UUID
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  patient_id?: string; // Foreign Key to Patient


  // Basic Info
  patient_name: string;
  patient_dob: string; // ISO Date string 'YYYY-MM-DD'
  patient_gender: Gender;
  doctor_name: string;
  medical_institution_name?: string;
  medical_institution_tel?: string;
  medical_institution_fax?: string;
  home_care_office?: string;
  home_care_office_tel?: string;
  home_care_office_fax?: string;
  care_manager?: string;
  pharmacist_name: string;
  pharmacy_name?: string;
  pharmacy_address?: string;
  pharmacy_tel?: string;
  pharmacy_fax?: string;
  patient_age_at_visit?: number;

  // Dates
  prescription_date: string;
  dispensing_date: string;
  visit_date: string;

  // Medication Status
  default_prescription_days?: string;
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
  ai_transcript?: string;
  ai_transcript_saved_at?: string;
  ai_audio_file_path?: string;
  ai_audio_file_name?: string;
  ai_audio_mime_type?: string;
  ai_audio_saved_at?: string;
  memo?: string; // Snapshot of patient memo at time of report
}

export type InstitutionType = 'hospital' | 'pharmacy' | 'care_office' | 'nursing_station';

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

export type TextTemplateTarget =
  | 'medication_status'
  | 'storage_status'
  | 'chief_complaint'
  | 'medication_instruction'
  | 'side_effects';

export interface TextTemplate {
  id: string;
  created_at: string;
  updated_at: string;
  target: TextTemplateTarget;
  title: string;
  body: string;
}

export interface AppSettings {
  pharmacy_name: string;
  pharmacy_address: string;
  pharmacy_tel: string;
  pharmacy_fax: string;
  google_drive_folder: string;
  backup_key?: string;
  last_app_version: string;
  ai_mode_enabled: boolean;
  ai_consent_mode_enabled: boolean;
  ai_save_audio_enabled: boolean;
  ai_save_transcript_enabled: boolean;
  ai_ollama_url: string;
  ai_ollama_model: string;
  ai_whisper_health_url: string;
  ai_whisper_transcribe_url: string;
  ai_whisper_file_field: string;
  ai_auto_start_enabled: boolean;
  ai_ollama_start_command: string;
  ai_whisper_start_command: string;
  pin_enabled: boolean;
  pin_hash?: string;
  pin_salt?: string;
  lock_timeout_minutes: number;
}
