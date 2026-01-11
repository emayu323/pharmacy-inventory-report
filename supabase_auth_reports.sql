-- Enable RLS on reports (if not already)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to be safe and clean)
DROP POLICY IF EXISTS "Allow public read access" ON reports;
DROP POLICY IF EXISTS "Allow public insert access" ON reports;
DROP POLICY IF EXISTS "Allow public update access" ON reports;

-- 1. SELECT
DROP POLICY IF EXISTS "Users can see reports of own patients" ON reports;
CREATE POLICY "Users can see reports of own patients"
ON reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM patients
    WHERE patients.id = reports.patient_id
    AND patients.user_id = auth.uid()
  )
);

-- 2. INSERT
DROP POLICY IF EXISTS "Users can insert reports for own patients" ON reports;
CREATE POLICY "Users can insert reports for own patients"
ON reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM patients
    WHERE patients.id = reports.patient_id
    AND patients.user_id = auth.uid()
  )
);

-- 3. UPDATE
DROP POLICY IF EXISTS "Users can update reports of own patients" ON reports;
CREATE POLICY "Users can update reports of own patients"
ON reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM patients
    WHERE patients.id = reports.patient_id
    AND patients.user_id = auth.uid()
  )
);
