-- Relax RLS policies for Development/Test Mode
-- WARNING: This allows any authenticated user (or potentially anonymous if configured) to access data.
-- Use this ONLY for local development or testing with mock users.

-- 1. Institutions Table Policies
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dev: Allow all operations for institutions" ON institutions;
-- Allow all operations for now since we are in test mode and auth.uid() might be null or not matching
CREATE POLICY "Dev: Allow all operations for institutions" ON institutions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Patients Table Policies (Ensure patients are also accessible)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dev: Allow all operations for patients" ON patients;
CREATE POLICY "Dev: Allow all operations for patients" ON patients
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Reports Table Policies (Ensure reports are also accessible)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dev: Allow all operations for reports" ON reports;
CREATE POLICY "Dev: Allow all operations for reports" ON reports
  FOR ALL
  USING (true)
  WITH CHECK (true);
