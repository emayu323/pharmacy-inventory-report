-- Create institutions table
create table institutions (
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

-- Enable RLS
alter table institutions enable row level security;

-- Create policies
create policy "Users can view their own institutions"
  on institutions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own institutions"
  on institutions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own institutions"
  on institutions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own institutions"
  on institutions for delete
  using (auth.uid() = user_id);
