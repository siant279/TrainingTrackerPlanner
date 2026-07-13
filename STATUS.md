# Project checkpoint — Jul 13, 2026

Production: **https://training-tracker-planner-kappa.vercel.app**  
Repo: `siant279/TrainingTrackerPlanner` · branch `main` @ `2299a25`  
Data: **~7,140 activities** (TrainingPeaks history + live Strava ingest)

---

## What’s built (current structure)

### Core app
| Surface | Status |
|---------|--------|
| Dashboard (Base / Tiredness / Restedness) | Live — 42d/7d load from activities |
| Planner (4-week scroll) | Live — Earlier / Today / Later |
| Feel / RPE on activity detail | Live |
| Races tab → planner day cells | Live — 🏁 cards by A/B/C |
| Google Calendar busy blocks | Live (OAuth connected) |
| Connect status page | Live |

### Planned ↔ completed merge
- Same-day + same sport-family matching on Strava ingest (`lib/match-planned.ts`)
- Planner shows **one merged card** (plan vs actual load/time) + detail modal **Planned vs completed**
- Retroactive: `npm run match-planned -- --activity <id>`

### Strava sync path
```
Strava webhook → chilli-journal /api/strava/webhook
  → await forwardActivityToTracker (Walks skipped only)
  → tracker /api/ingest/strava-activity
```
- chilli-journal logs: `tracker_forward_ok` | `skipped` | `failed` in `webhook_ingest_logs`
- **Backup cron** (tracker): `/api/cron/sync-strava` @ 05:30 UTC (last 3 days via journal token API)
- Manual: `npm run sync-recent -- --days 2`
- Load recompute cron: `/api/cron/recompute-load` @ 06:00 UTC

### M7 — Structured workout import (complete for v1 import scope)
| Piece | Location |
|-------|----------|
| Migration | `supabase/add_structured_workouts.sql` (**applied** to prod Supabase) |
| Types | `lib/types.ts` — `StructuredWorkout`, `StructuredStep`, `PlannedWorkout.structured_workout_id` |
| Parsers | `lib/structured-workout.ts` — `.zwo` / `.mrc` / `.erg` / `.fit` → **%FTP** steps |
| API | `POST/GET /api/structured-workouts` |
| Planned link | `planned-workouts` POST/PUT accept `structured_workout_id` |
| UI | Planner modal: attach file, load prefill, Recharts %FTP graph, Display FTP |
| Badge | Day cell `structured` pill when linked |
| Fixtures | `demo/structured-samples/2026-07-13_aerobic-tempo-openers.{zwo,mrc,erg}` |
| Tests | `npm run test:structured` |
| Handoff | `docs/STRUCTURED_IMPORT_HANDOFF.md` |

**Non-negotiable:** store %FTP; render watts with athlete FTP at display time (often 229 vs files built for ~205).

**Explicitly out of scope (still deferred):** in-app workout **builder**, **push** to Zwift / head unit / Strava, pace/HR target metrics.

---

## Chilli-journal (companion repo)

Path tip: folder may use curly apostrophe (`Sian’s MacBook Air`).  
Production: https://chilli-journal.vercel.app

| Change | Status |
|--------|--------|
| `trackerForward.ts` — skip Walks only | Deployed |
| Webhook **awaits** tracker forward | Deployed (`d3175ea`+) |
| Log forward ok/skip/fail to `webhook_ingest_logs` | Deployed (`fc50e6d`+) |
| Env: `TRACKER_INGEST_URL`, `TRACKER_INGEST_SECRET`, `JOURNAL_INTERNAL_SECRET` | Must match tracker Production |

Debug forwards:
```sql
select created_at, strava_activity_id, stage, detail, error_message
from webhook_ingest_logs
where stage like 'tracker_forward%'
order by created_at desc
limit 20;
```

---

## Commands

```bash
npm run dev
npm run test:structured              # zwo/mrc/erg parser fixtures
npm run sync-recent -- --days 3      # pull Strava → tracker (bypass webhook)
npm run match-planned -- --activity <STRAVA_ID>
npm run recompute-load
npm run import-trainingpeaks
npm run verify-supabase
```

---

## Recent tracker commits (this arc)

| Commit | Summary |
|--------|---------|
| `2299a25` | MRC / ERG / FIT parsers |
| `af65b46` | M7 ZWO import + preview graph + badge |
| `ea305c3` | Daily Strava backup sync cron |
| `fe8698b` | `sync-recent` CLI |
| `021fc17` | Races on planner calendar |
| `0926992` | Unified merged plan+actual UI + detail stats |
| `509c6a0` | Planned/synced merge in planner |

---

## Pick up next (suggested)

1. **Watch sync** — after next workout, confirm `tracker_forward_ok` in chilli logs; cron is the safety net.
2. **Structured polish** — day-cell mini sparkline; load athlete.ftp from DB for Display FTP default; optional per-file assumed-FTP field in UI.
3. **Architecture (later)** — optional single shared Supabase for journal + tracker (discussed, deferred).
4. **v2+** — builder / device push / adaptive planner / power-TSS (Build-Plan Phase 6).

---

## Key file map

| Area | Files |
|------|-------|
| Planner UI | `components/PlannerClient.tsx`, `PlannerDayEntry.tsx`, `PlannerRaceEntry.tsx`, `StructuredTargetChart.tsx` |
| Day merge logic | `lib/planner-day-entries.ts`, `lib/match-planned.ts` |
| Structured parse/API | `lib/structured-workout.ts`, `app/api/structured-workouts/route.ts` |
| Strava ingest/sync | `lib/ingest-service.ts`, `lib/strava-sync.ts`, `app/api/cron/sync-strava/route.ts`, `scripts/sync-recent.ts` |
| Schema | `supabase/schema.sql`, `supabase/add_structured_workouts.sql` |
| Specs | `v1-Cursor-Build-Spec.md` (§4.5), `Build-Plan.md`, `docs/STRUCTURED_IMPORT_HANDOFF.md`, `docs/GO_LIVE.md` |
| Chilli docs (mirror) | `docs/chilli-journal/trackerForward.ts`, `INTEGRATION.md` |
