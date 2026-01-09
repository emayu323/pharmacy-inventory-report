-- Create the reports table
CREATE TABLE reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  patient_name TEXT NOT NULL,
  patient_dob DATE NOT NULL,
  patient_gender TEXT NOT NULL,
  doctor_name TEXT DEFAULT '',
  pharmacist_name TEXT NOT NULL,
  
  prescription_date DATE,
  dispensing_date DATE,
  visit_date DATE NOT NULL,
  
  compliance_status TEXT DEFAULT '',
  leftover_meds TEXT DEFAULT '',
  storage_status TEXT DEFAULT '',
  
  medication_instruction TEXT DEFAULT '',
  side_effects TEXT DEFAULT '',
  
  next_visit_plan TEXT DEFAULT ''
);

-- Enable Row Level Security (RLS) is recommended
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- For development: Allow ALL operations for anyone (Note: Secure this before production!)
CREATE POLICY "Allow all access" ON reports FOR ALL USING (true) WITH CHECK (true);
