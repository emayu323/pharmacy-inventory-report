-- Add is_active column to patients table
ALTER TABLE patients ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Update existing records to be active
UPDATE patients SET is_active = true WHERE is_active IS NULL;
