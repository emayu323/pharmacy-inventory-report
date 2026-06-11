-- Relax security for Test Mode

-- 1. Remove Foreign Key constraint on user_id (so we can use 'test-user-1')
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_fkey;

-- 2. Update Policies to be Permissive (Allow all operations for now, or just for our test user)

-- Patients
DROP POLICY IF EXISTS "Users can only see their own patients" ON patients;
DROP POLICY IF EXISTS "Users can insert their own patients" ON patients;
DROP POLICY IF EXISTS "Users can update their own patients" ON patients;

-- Create "Mock" policies that just allow everything (or check for 'test-user-1' if we want some semblance of logic, but public is easier for "bypassing")
CREATE POLICY "Allow all for testing" ON patients FOR ALL USING (true) WITH CHECK (true);

-- Reports
DROP POLICY IF EXISTS "Users can see reports of own patients" ON reports;
DROP POLICY IF EXISTS "Users can insert reports for own patients" ON reports;
DROP POLICY IF EXISTS "Users can update reports of own patients" ON reports;

CREATE POLICY "Allow all reports for testing" ON reports FOR ALL USING (true) WITH CHECK (true);
