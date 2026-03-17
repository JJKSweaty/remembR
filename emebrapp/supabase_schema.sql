-- ============================================================
-- remembR / Ember — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Patient profile (one row per patient)
create table if not exists patient_profile (
  id uuid default uuid_generate_v4() primary key,
  name text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  date_of_birth date,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Medications (active medication list)
create table if not exists medications (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  dosage text,
  schedule text not null,
  barcode text,
  taken_today boolean default false,
  taken_at timestamp with time zone,
  last_reset_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Run these if upgrading from the initial schema:
-- alter table medications add column if not exists taken_at timestamp with time zone;
-- alter table medications add column if not exists last_reset_date date;

-- Medication history (every time a med is taken or skipped)
create table if not exists medication_history (
  id uuid default uuid_generate_v4() primary key,
  medication_name text not null,
  dosage text,
  action text not null default 'taken',  -- 'taken', 'skipped', 'added', 'removed'
  recorded_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Voice interaction history
create table if not exists voice_history (
  id uuid default uuid_generate_v4() primary key,
  transcript text not null,
  response text not null,
  intent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Object finding history
create table if not exists find_history (
  id uuid default uuid_generate_v4() primary key,
  object_name text not null,
  found boolean default false,
  region text,
  confidence real,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- General memory/event logs
create table if not exists memory_logs (
  id uuid default uuid_generate_v4() primary key,
  event_type text not null,
  description text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
