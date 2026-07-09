# Supabase setup — Training Tracker

## 1. Create project (~2 min)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Name: `training-tracker` (or similar)
3. Generate a strong database password and **save it** (password manager)
4. Region: pick closest to you (e.g. West US)
5. Wait for the project to finish provisioning

## 2. Run the schema

1. In Supabase → **SQL Editor** → **New query**
2. Paste the full contents of [`supabase/schema.sql`](../supabase/schema.sql)
3. Click **Run**
4. Confirm no errors — you should see tables: `athlete`, `activities`, `planned_workouts`, `races`, `feel`, `settings`, `daily_load`

## 3. Copy API keys to `.env.local`

In Supabase → **Project Settings** → **API**:

| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (secret — never commit) |

Update [`/.env.local`](../.env.local):

```env
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false

NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=<any long random string>
DEFAULT_TIMEZONE=America/Los_Angeles
```

Keep Google/ingest vars empty for now — not needed for backfill.

## 4. Verify connection

```bash
npm run verify-supabase
```

Expected: `OK — athlete row exists, settings loaded`

## 5. Backfill Strava history

Uses your **chilli-journal** Strava token (same Strava app) — no journal code deploy required.

```bash
CHILLI_JOURNAL_DIR="/path/to/chilli-journal" npm run backfill-strava
```

- Fetches full activity details (includes Relative Effort / load)
- Skips Walk, EBikeRide, EMountainBikeRide
- Upserts into `activities` table
- Takes a few minutes for full history (~150ms per activity)

## 6. Run the app

```bash
npm run dev
```

Open http://localhost:3000/dashboard — you should see real Strava data, not demo mode.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Missing Supabase env vars` | Fill `.env.local`, restart terminal |
| `No Strava tokens in journal Supabase` | Connect Strava in chilli-journal first |
| `relation "activities" does not exist` | Re-run `schema.sql` in SQL Editor |
| Load shows 0 for all activities | Re-run backfill (detail fetch includes `suffer_score`) |
