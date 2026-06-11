-- Add PRN medication list column
ALTER TABLE reports ADD COLUMN IF NOT EXISTS medications_check_list_prn JSONB DEFAULT '[]'::jsonb;
