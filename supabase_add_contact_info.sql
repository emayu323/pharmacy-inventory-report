-- Add address and contact columns to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS patient_address text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS patient_contact1 text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS patient_contact2 text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS patient_contact2_memo text;
