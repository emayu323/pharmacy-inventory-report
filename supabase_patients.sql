-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  name TEXT NOT NULL,
  kana TEXT DEFAULT '',
  dob DATE NOT NULL,
  gender TEXT NOT NULL,
  
  -- Prevent duplicate patients (same name + dob)
  UNIQUE(name, dob)
);

-- Enable RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON patients FOR SELECT USING (true);

-- Allow public insert/update (for app usage)
CREATE POLICY "Allow public insert access" ON patients FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON patients FOR UPDATE USING (true);

-- Add patient_id to reports (nullable for now, will fill via migration)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id);
