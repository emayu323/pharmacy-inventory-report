-- Add new fields for detailed report information using IF NOT EXISTS
-- This ensures the script can be run multiple times safely.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS allergy_history text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS guidance_recipient text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS medication_status text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS storage_status text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS other_dept_consultation text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS concomitant_medications text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS interaction_status text;
