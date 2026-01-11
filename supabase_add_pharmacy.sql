-- Add pharmacy_name to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_name TEXT;
