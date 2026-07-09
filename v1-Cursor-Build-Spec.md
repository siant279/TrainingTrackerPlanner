# Training Tracker — v1 Build Spec (for Cursor)

*Self-contained implementation spec for the first release. Build this without the auto-planner; that comes in v2.*
Prepared July 8, 2026 · Athlete: Sian (Truckee, CA · multisport · FTP 229 · HM PR 1:35)

---

## 0. Scope

**v1 delivers three surfaces, made real from the two working prototypes:**

1. **Strava sync** — activities flow into your database automatically.
2. **Fitness dashboard** — Base / Tiredness / Restedness from a rolling-average load model. *(prototype: `fitness-fatigue-dashboard`)*
3. **Two-week planner** — calendar with planned-vs-actual, Google Calendar availability, and your weekly framework. *(prototype: `training-planner`)*

Plus three cheap, high-value extras confirmed for v1:

4. **Post-activity feel/RPE** — pull Strava's Perceived Exertion + a quick in-app RPE/soreness/note.
5. **Race markers** — a races table with date/priority, shown on the calendar with a countdown.
6. **Editable framework settings** — weekly targets, thresholds, and day window editable in-app, not hard-coded.

**Explicitly deferred to v2+:** the adaptive auto-planner, periodization projection toward race day, the AI coach chat, and the power/pace-TSS precision upgrade. Design the schema so these slot in without a rewrite (notes inline below).

The two prototype HTML files are the **source of truth** for the load math, classification rules, and planner UX. Lift formulas and markup directly.

---

## 1. Stack & architecture

- **Frontend + hosting:** Next.js (App Router, TypeScript) on Vercel. Charts via Recharts or Chart.js.
- **Backend + data:** Supabase — Postgres, Auth, Edge Functions (Strava webhook receiver, nightly jobs), and `pg_cron` for scheduling.
- **Data sources:** Strava (activities/actuals) and Google Calendar (availability). Both read-only into the app.

```
Strava ──webhook──► Supabase Edge Fn ──► Postgres ◄── Next.js (Vercel)
Google Calendar ──OAuth read──────────────────────────┘
```

---

## 2. External integrations & auth

### 2.1 Strava — reuse the Chilli journal app (do NOT register a second app)

Strava allows one API application per account, already used by the Chilli journal. Reuse it as a shared pipe:

- Reuse the journal app's `client_id` / `client_secret` and the stored OAuth token (scope must include `activity:read_all`). The tracker needs **no separate Strava authorization**.
- **One webhook, routed:** extend the journal's existing webhook handler so each incoming activity is routed — `sport_type === "Walk"` (Chilli walks) → journal; everything else → tracker tables. The walk-exclusion rule and the routing rule are the same check.
- **Token refresh:** Strava access tokens expire every 6 hours — refresh with the refresh token in a scheduled Edge Function; store the latest token where both apps read it.
- **Rate limits:** 200 req / 15 min, 2,000 / day. Webhook-driven sync stays far under this. Backfill (below) should throttle.

**First task:** locate the Chilli journal's Strava credentials, token store, and webhook handler — that's where this work grafts on.

### 2.2 Google Calendar — read-only

- OAuth scope `https://www.googleapis.com/auth/calendar.readonly`. Store token + refresh token.
- Used only to compute daily availability (§4.4). Read the primary calendar for v1; multi-calendar can come later.

### 2.3 Environment variables

`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`.

---

## 3. Data model (Postgres)

```sql
-- single athlete for v1
athlete(
  id, strava_athlete_id, name, ftp, threshold_pace, hr_zones jsonb,
  google_refresh_token, created_at
)

activities(                       -- synced actuals from Strava (walks stored but flagged)
  id bigint primary key,          -- Strava activity id
  sport_type text,
  start_local timestamptz,
  moving_time int,                -- seconds
  distance real,                  -- meters
  elevation real,
  relative_effort int,            -- Strava's HR-based effort; null if no HR
  load int,                       -- = relative_effort (v1); TSS-based later
  category text,                  -- strength|longRun|longRide|intervalRun|intervalRide|other
  category_override text,         -- user-confirmed category (wins over auto)
  count_toward_load bool default true,  -- false for Walk
  perceived_exertion int,         -- Strava PE if set
  name text, description text, raw jsonb
)

planned_workouts(
  id uuid primary key,
  date date,
  sport text,
  type text,                      -- Easy|Long|Interval
  duration_min int,
  target_load int,
  description text,
  status text default 'planned',  -- planned|completed|skipped
  matched_activity_id bigint,     -- FK activities.id once completed
  created_at
)

races(
  id uuid, date date, name text, sport text, priority text  -- A|B|C
)

feel(
  id uuid, activity_id bigint,    -- or date for non-Strava
  rpe int,                        -- 1–10
  feel_flag text,                 -- strong|normal|tired
  soreness int, note text, created_at
)

settings(                         -- editable framework (single row, jsonb)
  id int primary key default 1,
  framework jsonb
)
-- framework default:
-- { "weekHoursMin":7, "weekHoursMax":11,
--   "targets":{ "strength":{"min":2,"max":3}, "longRun":1, "longRide":1,
--               "intervalRun":1, "intervalRide":1 },
--   "longRunMinSec":3600, "longRideMinSec":7200,
--   "dayStartMin":300, "dayEndMin":1200 }

daily_load(                       -- computed nightly (or a materialized view)
  date date primary key, load int, base real, tired real, rested real
)
```

*v2 hooks:* add a `wellness` table (morning HR, sleep, weight), and a `power/pace` load column on `activities` for the TSS upgrade. The auto-planner reads `settings.framework` + `daily_load` + calendar availability and writes `planned_workouts`.

---

## 4. Core logic (from the prototypes — reproduce exactly)

### 4.1 Load & metrics — plain rolling averages
- **Daily load** = sum of `relative_effort` for that day, excluding `Walk`. Rest day = 0.
- **Base fitness** = mean daily load over the last **42 days**.
- **Tiredness** = mean daily load over the last **7 days**.
- **Restedness** = Base − Tiredness.
- All in "avg Relative Effort points/day." No exponential decay. Seed Base from 42 days before any displayed window.
- *Gap to note in UI:* activities without HR have no Relative Effort → count as 0 for now (TSS upgrade fixes later).

### 4.2 Session classification
- `strength` = `WeightTraining`.
- Run types (`Run`, `TrailRun`): `intervalRun` if name/description matches the interval regex, else `longRun` if `moving_time ≥ 3600s` (60 min), else `other`.
- Ride types (`Ride`, `GravelRide`, `MountainBikeRide`, `VirtualRide`, `EBikeRide`): `intervalRide` if interval regex, else `longRide` if `moving_time ≥ 7200s` (2 hrs), else `other`.
- Interval regex (from prototype): `/interval|tempo|threshold|sprint|repeat|fartlek|vo2|track|hill|workout|under.?over|strides?|\d+\s?x|×/i`.
- Thresholds come from `settings.framework`, not constants.
- **Heuristic caveat:** name-matching intervals is rough. Provide a way to confirm/override a session's category (`category_override`) — e.g. on the feel-entry screen. Planned sessions carry an explicit `type`, so they're always exact.

### 4.3 Weekly framework
- Targets from settings: 7–11 hrs, 2–3 strength, 1 long run, 1 long ride, 1 interval run, 1 interval ride; everything else is "butter."
- Per target, per week: **done** = count of actuals in that category; **planned** = count of planned in that category. Status = done (met min) / partial / planned / open.
- **Weekly hours** = sum of actual `moving_time` + sum of planned `duration_min`. Green inside 7–11h, amber under/over.

### 4.4 Calendar availability
- Window from settings (default 5:00am–8:00pm).
- Ignore all-day events and any event with `transparency: "transparent"` or `availability: "AVAILABILITY_FREE"`.
- Subtract remaining timed events from the window; report the **largest free block** + total free hours. Color: green ≥3h, amber 1.5–3h, red <1.5h.
- Parse event clock time from the ISO string's `HH:MM` (tz-independent), as the prototype does.

---

## 5. Screens

1. **Connect** — reuse Strava token; connect Google Calendar.
2. **Sync** — one-time backfill of Strava history (throttled) + live webhook. Compute `category`, `load`, `count_toward_load` on ingest.
3. **Dashboard** — Base/Tiredness/Restedness cards, trend chart, weekly load, recent sessions, window selector (7/30/90/180/365). *(mirror `fitness-fatigue-dashboard`)*
4. **Planner** — two-week grid; actuals + availability + weekly targets strip + planned CRUD (sport, type, duration, load, description); planned auto-matches to the completed activity. *(mirror `training-planner`)*
5. **Feel entry** — after an activity syncs, capture RPE + feel + soreness + note; also read Strava `perceived_exertion`. Doubles as the category-confirm surface.
6. **Races** — add/list races; show markers + countdown on the planner.
7. **Settings** — edit the framework JSON via a form.

---

## 6. Build milestones (each shippable)

- **M0 — Setup.** Next.js + Supabase + Vercel wired; env vars; run the schema; deploy a hello-world.
- **M1 — Strava sync.** Graft onto the journal app's token + webhook; route walks vs. training; backfill history; populate `activities` with computed `load`/`category`.
- **M2 — Dashboard.** Load engine + `daily_load`; port the dashboard UI.
- **M3 — Planner core.** Two-week calendar; planned CRUD; planned↔actual matching; weekly load bar.
- **M4 — Calendar availability.** Google OAuth + availability calc into the planner.
- **M5 — Framework + settings.** Weekly targets strip; editable settings screen driving all thresholds.
- **M6 — Feel + races.** Feel/RPE entry (+ category override); races table + countdown markers.

---

## 7. Migration (Phase 0 — time-sensitive, do before the TrainingPeaks sub lapses)

Export TrainingPeaks history now: workout-summary CSV in 12-month chunks back to your first season, plus custom-metrics CSV (weight/HRV/sleep if logged). Note current thresholds (FTP, threshold pace, HR zones). Strava history backfills anytime via API; only the TrainingPeaks-native data is on a clock.

---

## 8. Deferred to v2+

Adaptive week auto-planner (reads settings + fatigue + availability, writes `planned_workouts`); periodization projection toward race day; AI coach chat (context payload = current metrics + planned-vs-actual + feel + races + framework); power/pace-TSS load upgrade; wellness/health layer; mobile.

---

## 9. References

- Prototypes (design + math source of truth): `fitness-fatigue-dashboard`, `training-planner` (Cowork artifacts).
- Strategy & rationale: `Build-Plan.md` in this folder (architecture §3, one-app workaround §2b, prototype-vs-Cursor split §10).
