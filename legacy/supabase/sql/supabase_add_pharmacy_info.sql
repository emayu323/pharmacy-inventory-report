-- Add pharmacy info columns to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pharmacy_name text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pharmacy_tel text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS pharmacy_fax text;
