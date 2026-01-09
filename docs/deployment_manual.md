# Deployment and Database Manual

## Overview
This application uses **Vercel** for the frontend and **Supabase** for the backend (Database).

## 1. Database Setup (Supabase)
The application requires a `medications` table to store the master data for drug names.

### Table Schema
Run the following SQL in Supabase SQL Editor:
```sql
CREATE TABLE IF NOT EXISTS medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  yi_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON medications FOR SELECT USING (true);

-- Allow public insert access (Only needed for initial upload script)
CREATE POLICY "Allow public insert access" ON medications FOR INSERT WITH CHECK (true);
```

### Data Import (Drug Master)
To upload the drug master data (e.g., from CSV):

1.  Place the CSV file at `src/data/y_ALL20251204.csv`.
2.  Ensure `.env` contains:
    ```
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...
    ```
3.  Run the upload script:
    ```bash
    npm install
    node scripts/upload_drugs.js
    ```
    *Note: This uploads ~18,000 records. Validated 2026-01-09.*

## 2. Deployment (Vercel)
The application is configured to deploy automatically to Vercel when changes are pushed to the `main` branch.

### Steps to Deploy
1.  Commit changes.
2.  Push to main:
    ```bash
    git push origin main
    ```
3.  Vercel will detect the commit and build the project.

### Environment Variables
Ensure the following are set in the Vercel Project Settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 3. Data Preservation
The drug data is stored in **Supabase**.
- Deploying the frontend (Vercel) **does NOT** affect the database data.
- The data is safe and persistent across deployments.
