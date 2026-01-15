-- Add contact columns to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact1 text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact2 text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact2_memo text;
