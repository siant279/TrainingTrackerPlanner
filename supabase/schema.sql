-- Training Tracker v1 schema

create extension if not exists "pgcrypto";

create table if not exists athlete (
  id uuid primary key default gen_random_uuid(),
  strava_athlete_id bigint,
  name text,
  ftp int,
  threshold_pace text,
  hr_zones jsonb,
  google_refresh_token text,
  google_access_token text,
  google_token_expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists activities (
  id bigint primary key,
  sport_type text not null,
  start_local timestamptz not null,
  local_date date,
  moving_time int not null default 0,
  distance real,
  elevation real,
  relative_effort int,
  load int not null default 0,
  category text,
  category_override text,
  count_toward_load boolean not null default true,
  perceived_exertion int,
  name text,
  description text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists activities_start_local_idx on activities (start_local desc);

create table if not exists planned_workouts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  sport text not null,
  type text not null default 'Easy',
  duration_min int,
  target_load int,
  description text,
  status text not null default 'planned',
  matched_activity_id bigint references activities (id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists planned_workouts_date_idx on planned_workouts (date);

create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  sport text,
  priority text not null default 'B'
);

create table if not exists feel (
  id uuid primary key default gen_random_uuid(),
  activity_id bigint references activities (id) on delete cascade,
  rpe int,
  feel_flag text,
  soreness int,
  note text,
  created_at timestamptz default now(),
  unique (activity_id)
);

create table if not exists settings (
  id int primary key default 1,
  framework jsonb not null,
  constraint settings_single_row check (id = 1)
);

insert into settings (id, framework)
values (1, '{"weekHoursMin":7,"weekHoursMax":11,"targets":{"strength":{"min":2,"max":3},"longRun":1,"longRide":1,"intervalRun":1,"intervalRide":1},"longRunMinSec":3600,"longRideMinSec":7200,"dayStartMin":300,"dayEndMin":1200}'::jsonb)
on conflict (id) do nothing;

create table if not exists daily_load (
  date date primary key,
  load int not null default 0,
  base real not null default 0,
  tired real not null default 0,
  rested real not null default 0
);

insert into athlete (name)
select 'Sian'
where not exists (select 1 from athlete limit 1);
