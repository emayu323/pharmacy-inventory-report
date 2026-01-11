-- Create pharmacists table
create table public.pharmacists (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null
);

-- Insert initial dummy data
insert into public.pharmacists (name)
values
  ('山田 太郎'),
  ('佐藤 花子'),
  ('鈴木 一郎'),
  ('高橋 次郎');

-- Enable RLS
alter table public.pharmacists enable row level security;

-- Policy to allow read access to authenticated users and anon (for now, similar to other tables)
create policy "Allow public read access"
  on public.pharmacists for select
  using (true);

-- Policy to allow insert access (optional, if we want to manage via UI)
create policy "Allow public insert access"
  on public.pharmacists for insert
  with check (true);
