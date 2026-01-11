-- Add optional medical and care information columns to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_institution_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_doctor TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS home_care_office TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS care_manager TEXT;
