# Project checkpoint — Jul 9, 2026

## Live mode (Supabase)

Run: `npm run dev` → http://localhost:3000

`.env.local` has `DEMO_MODE=false` — **7,139 activities** from TrainingPeaks summaries (TSS load, 2008–Jul 2026).

### Dashboard
- Base / Tiredness / Restedness from rolling averages (42d / 7d)
- Walks & e-bikes excluded from load

### Planner
- **Scrollable 4-week view** — ← Earlier / Today / Later → through full history
- Fatigue strip updates for the period you're viewing
- Google Calendar busy blocks (when OAuth connected)
- Planned workout CRUD, activity detail modal + feel/RPE

### Connect
- Status API shows activity count, Google/ingest config
- Google Calendar OAuth (needs `GOOGLE_CLIENT_ID/SECRET`)
- Strava ongoing sync via chilli-journal webhook → tracker ingest

## Commands

```bash
npm run dev
npm run verify-supabase
npm run import-trainingpeaks          # reimport TP summaries
npm run import-trainingpeaks -- --replace-tp
npm run recompute-load                # populate daily_load cache
```

## Go-live remaining

- [x] Supabase + schema
- [x] TrainingPeaks history import (7,139 workouts)
- [ ] `TRACKER_INGEST_SECRET` + chilli-journal webhook forward → see [docs/GO_LIVE.md](docs/GO_LIVE.md)
- [ ] Google Calendar OAuth credentials
- [ ] Vercel deploy + production env vars
- [ ] `npm run recompute-load` (optional cache)

## Key files

| Area | Files |
|------|-------|
| Planner (4-week) | `components/PlannerClient.tsx` |
| TP import | `scripts/import-trainingpeaks.ts`, `lib/trainingpeaks-import.ts` |
| Go-live | `docs/GO_LIVE.md`, `app/api/connect/status/route.ts` |
| Chilli integration | `docs/chilli-journal/`, `INTEGRATION.md` |
