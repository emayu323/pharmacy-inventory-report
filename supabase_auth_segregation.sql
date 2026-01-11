-- Add user_id to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update RLS policies for patients

-- Drop existing policies to be safe
DROP POLICY IF EXISTS "Allow public read access" ON patients;
DROP POLICY IF EXISTS "Allow public insert access" ON patients;
DROP POLICY IF EXISTS "Allow public update access" ON patients;

-- Enable RLS (already enabled but good to ensure)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Users can only see their own patients
CREATE POLICY "Users can only see their own patients"
ON patients FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2. INSERT: Users can insert patients, user_id must match (or default to it)
CREATE POLICY "Users can insert their own patients"
ON patients FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE: Users can update their own patients
CREATE POLICY "Users can update their own patients"
ON patients FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Note: Existing patients without user_id will effectively be hidden from everyone (except service_role)
-- If we want to assign them to a specific user, we would need a migration script.
-- For now, new patients created via UI will have user_id set.
