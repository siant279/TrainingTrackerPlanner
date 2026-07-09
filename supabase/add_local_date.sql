-- Add athlete-local calendar date for planner bucketing (avoids timestamptz day shifts)
alter table activities add column if not exists local_date date;

-- Backfill: prefer raw JSON start_date_local when present
update activities
set local_date = left((raw->>'start_date_local'), 10)::date
where local_date is null
  and raw ? 'start_date_local'
  and left((raw->>'start_date_local'), 10) ~ '^\d{4}-\d{2}-\d{2}$';

-- Fallback for rows without raw
update activities
set local_date = (start_local at time zone 'America/Los_Angeles')::date
where local_date is null;

create index if not exists activities_local_date_idx on activities (local_date desc);
