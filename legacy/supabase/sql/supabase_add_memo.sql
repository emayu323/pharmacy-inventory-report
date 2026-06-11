-- Add memo column to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS memo TEXT DEFAULT '';
