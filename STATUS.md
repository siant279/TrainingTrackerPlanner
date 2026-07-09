# Project checkpoint — Jul 8, 2026

## What works (demo mode)

Run: `npm run dev` → http://localhost:3000

`.env.local` has `DEMO_MODE=true` — no Supabase required.

### Dashboard
- Base / Tiredness / Restedness from rolling averages (42d / 7d)
- Real Strava runs via `demo/strava-runs.json` (86 runs, Jan 1 – Jul 8 2026)
- Walks & e-bikes excluded from load

### Planner
- **Scrollable 2-week view** — ← Earlier / Today / Later → through all of 2026
- Fatigue strip **updates for the period you're viewing** (as-of date shown when not today)
- **Real Strava actuals** — pinned week + full year history from snapshot
- **Google Calendar busy blocks** — gray bar per day (5am–8pm window); hover for times
- Demo calendar: today = standup/lunch/1:1; **tomorrow = 8–9am + 3–4pm busy**; CSA pickup transparent
- Planned workout CRUD, activity detail modal + feel/RPE
- Races: Truckee Half Sep 13, Gran Fondo Oct 4

### Other pages
- Settings (framework), Races, Connect (Strava via chilli-journal + Google OAuth stubs)

## Refresh Strava demo data

```bash
CHILLI_JOURNAL_DIR="/path/to/chilli-journal" npm run fetch-strava-runs
```

Uses chilli-journal `.env.local` + Supabase Strava token. Restart dev server after.

## Not done yet (live mode)

- [ ] Supabase project + run `supabase/schema.sql`
- [ ] Wire chilli-journal webhook → tracker ingest ([INTEGRATION.md](INTEGRATION.md))
- [ ] Google Calendar OAuth with real credentials (`GOOGLE_CLIENT_ID/SECRET`)
- [ ] Set `DEMO_MODE=false` + Supabase env vars
- [ ] Phase 0: TrainingPeaks CSV export (user handling separately)

## Key files touched recently

| Area | Files |
|------|-------|
| Planner navigation + view-aware metrics | `components/PlannerClient.tsx`, `lib/load.ts` |
| Strava demo snapshot | `demo/strava-runs.json`, `lib/demo.ts`, `scripts/fetch-strava-runs.mjs` |
| Calendar busy blocks | `lib/availability.ts`, `components/CalendarBusyStrip.tsx`, `lib/google.ts` |
| E-bike exclusion | `lib/excluded-sports.ts`, `lib/strava-ingest.ts` |

## Tomorrow — suggested next steps

1. Connect live Supabase + test ingest, or continue polishing demo UX
2. Apply chilli-journal integration from `docs/chilli-journal/`
3. Live Google Calendar sync (Connect page) and verify busy blocks match real calendar
