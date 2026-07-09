# Go-live checklist

Training history is already in Supabase (TrainingPeaks import). These steps wire up **ongoing** sync and deploy.

## 1. Local env (`.env.local`)

```bash
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false

# Supabase — already set
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_APP_URL=http://localhost:3000
DEFAULT_TIMEZONE=America/Los_Angeles

# Generate with: openssl rand -hex 32
TRACKER_INGEST_SECRET=
CRON_SECRET=
JOURNAL_INTERNAL_SECRET=

# Google Cloud Console → OAuth client (Web)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Redirect URI for Google OAuth (local): `http://localhost:3000/api/google/callback`

## 2. Optional: populate daily_load cache

```bash
npm run recompute-load
```

Dashboard works without this (computes from activities on the fly). Vercel cron runs it nightly once deployed.

## 3. Chilli-journal → tracker Strava forward

In **chilli-journal** `.env` (or Vercel env):

```
TRACKER_INGEST_URL=https://your-tracker.vercel.app/api/ingest/strava-activity
TRACKER_INGEST_SECRET=<same as tracker>
JOURNAL_INTERNAL_SECRET=<same as tracker>
```

Code changes (copy from `docs/chilli-journal/` or apply via integration branch):

- `lib/trackerForward.ts`
- `app/api/internal/strava-token/route.ts`
- Update `app/api/strava/webhook/route.ts` to forward create/update/delete to tracker

## 4. Deploy tracker to Vercel

1. Push repo to GitHub (done)
2. Import project in Vercel
3. Add all env vars from `.env.local`
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL
5. Update Google OAuth redirect URI to `https://your-app.vercel.app/api/google/callback`
6. Update chilli-journal `TRACKER_INGEST_URL` to production ingest URL

Cron is configured in `vercel.json` (`/api/cron/recompute-load` at 6:00 UTC).

## 5. Verify

```bash
npm run verify-supabase
npm run dev
```

- **Dashboard** — Base/Tiredness curve with real TSS history
- **Planner** — 4-week view, scroll Earlier/Later through history
- **Connect** — Google Calendar + status indicators
- Log a new Strava workout → should appear via webhook (after chilli-journal forward is live)

## Import more history later

```bash
npm run import-trainingpeaks -- --replace-tp   # reimport TP summaries only
```

Drop new `WorkoutExport-*.zip` files in `Training Peaks Exports/Workout summaries/`.
