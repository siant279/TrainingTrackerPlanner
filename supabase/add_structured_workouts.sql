-- M7: structured workout file import (§4.5)
-- Run in Supabase SQL Editor against the existing project.

create table if not exists structured_workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_format text not null,        -- zwo | erg | mrc | fit
  sport text not null default 'bike',
  ftp_reference int,                  -- FTP absolute-watt formats were authored at; null for %FTP formats
  duration_sec int not null default 0,
  target_metric text not null default 'power_pct_ftp',
  steps jsonb not null default '[]'::jsonb,
  original_filename text,
  raw text,                           -- verbatim file, so re-parse/re-export is lossless
  created_at timestamptz default now()
);

alter table planned_workouts
  add column if not exists structured_workout_id uuid
    references structured_workouts (id) on delete set null;
