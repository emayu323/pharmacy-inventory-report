-- 1. Add missing columns to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_institution_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_doctor TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS home_care_office TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS care_manager TEXT;

-- 2. Create institutions table
CREATE TABLE IF NOT EXISTS institutions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  type text not null check (type in ('hospital', 'pharmacy', 'care_office')),
  name text not null,
  address text, -- For Pharmacy
  tel text,
  fax text,
  doctor_name text, -- For Hospital
  created_at timestamptz default now()
);

-- 3. Enable RLS on institutions
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- 4. Create policies for institutions (Drop first to avoid errors if re-running)
DROP POLICY IF EXISTS "Users can view their own institutions" ON institutions;
CREATE POLICY "Users can view their own institutions" ON institutions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own institutions" ON institutions;
CREATE POLICY "Users can insert their own institutions" ON institutions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own institutions" ON institutions;
CREATE POLICY "Users can update their own institutions" ON institutions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own institutions" ON institutions;
CREATE POLICY "Users can delete their own institutions" ON institutions FOR DELETE USING (auth.uid() = user_id);
