CREATE TABLE IF NOT EXISTS medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  yi_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for the app search)
DROP POLICY IF EXISTS "Allow public read access" ON medications;
CREATE POLICY "Allow public read access" ON medications FOR SELECT USING (true);

-- Allow public insert access (TEMPORARY: for migration script using anon key)
DROP POLICY IF EXISTS "Allow public insert access" ON medications;
CREATE POLICY "Allow public insert access" ON medications FOR INSERT WITH CHECK (true);
