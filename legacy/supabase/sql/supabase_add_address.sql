-- Add address column to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;
