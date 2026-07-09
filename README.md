# Training Tracker

Self-hosted TrainingPeaks replacement: Strava sync, Base/Tiredness/Restedness dashboard, two-week planner, Google Calendar availability, feel/RPE, and race markers.

## Setup

1. **Supabase** — create a project and run [supabase/schema.sql](supabase/schema.sql) in the SQL editor.

2. **Environment** — copy `.env.example` to `.env.local` and fill in values.

3. **Chilli journal** — follow [INTEGRATION.md](INTEGRATION.md) to wire webhook forwarding and the internal token API.

4. **Run locally:**
   ```bash
   npm install
   npm run dev
   ```

5. **Deploy** to Vercel; set the same env vars. Add `CRON_SECRET` for the nightly load recompute cron.

## Pages

| Route | Purpose |
|---|---|
| `/dashboard` | Base · Tiredness · Restedness charts |
| `/planner` | Two-week calendar with planned vs actual |
| `/feel` | Post-activity RPE and category override |
| `/races` | Race list and countdown |
| `/settings` | Editable weekly framework |
| `/connect` | Google Calendar + Strava backfill |

## Load model

Plain rolling averages (not exponential CTL/ATL): daily load = sum of Strava Relative Effort, walks excluded. Base = 42-day mean, Tiredness = 7-day mean, Restedness = Base − Tiredness.

Ported from Cowork prototypes `fitness-fatigue-dashboard` and `training-planner`.
