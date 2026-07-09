# Training Tracker & Planner — Build Plan

*Replacing TrainingPeaks with a self-hosted, Strava-linked app for health + racing.*
Prepared July 8, 2026 · Athlete: Sian (Truckee, CA · multisport · FTP 229 · HM PR 1:35)

---

## 1. What you're actually replacing

You picked three TrainingPeaks jobs to keep, plus a "real web app" build. Mapping them to concrete features:

| TrainingPeaks feature | Your version | Priority |
|---|---|---|
| Planned workouts on a calendar | Drag-and-drop weekly/monthly planner, planned vs. actual | Core |
| Race / goal planning + periodization | Race targets with countdown, training blocks, weekly load targets | Core |
| "How fit / how tired am I" (PMC) | Fitness / Fatigue / Form curve (CTL / ATL / TSB) across all sports | Core |
| Activity history & analysis | Auto-synced from Strava (run, ride, weights, walks) | Core |

Everything else TrainingPeaks does (structured workout builder that pushes to your head unit, coach sharing, marketplace plans) is explicitly out of scope for v1 — you can add later.

## 2. The constraints that shape the design

These are the realities that decide the architecture, so they come first:

**Strava is read-only for your training data.** You can pull activities, streams (HR, power, pace, cadence, GPS), zones, and gear — but you *cannot* push planned workouts back into Strava. That's fine: your planner lives entirely in your own app, and Strava is purely the "actual" data source.

**Strava rate limits: 200 requests / 15 min and 2,000 / day.** Plenty for one athlete, but it means you sync via **webhooks** (Strava pings your app when you upload an activity) rather than polling. One activity with full streams costs ~2–3 API calls, so a webhook-driven model keeps you far under the ceiling.

**Strava API terms.** Personal-use apps are free and easy to register. You must store only *your* data, honor deauthorization, and not show one athlete's data to another. A single-user app for yourself is squarely within terms.

**TrainingPeaks export has a clock on it.** Athlete-edition accounts can bulk-export workout history to CSV (plus per-workout TCX/FIT files), but only in **12-month chunks**, and only while your subscription is active. **This is the one time-sensitive item** — see §6.

## 2b. The one-Strava-app limit (and how to sidestep it)

Real constraint: Strava lets each account create only **one API application** via self-serve, and each application gets only **one webhook subscription**. Your Chilli journal app already occupies that slot, so you can't just register a second app for the tracker.

You don't need to. One Strava application — and its single webhook — receives **every** activity you upload, runs and rides included, and can feed any number of downstream apps.

**Recommended: shared pipe, two consumers.** Reuse the Chilli journal's existing Strava application as the single ingestion point. Add a routing step to its webhook handler:

```
Strava webhook ──► one handler ──► is it a Chilli/Fi walk?
                                     ├─ yes ─► Chilli journal DB
                                     └─ no  ─► training tracker DB (+ load calc)
```

The tracker can share the **same OAuth token** the journal already stores, so it needs no separate Strava authorization at all — nothing touches the one-app limit. This also means the "exclude Chilli walks from load" rule and the "route to the right app" rule are the same piece of logic. The tracker's frontend can live on its own domain; only the OAuth redirect + webhook callback stay under the journal's one registered callback domain.

**Fallback: fully decoupled.** If you want the two projects completely independent, register a second Strava application under a throwaway Strava account, then authorize it with your real athlete account. Clean separation, but more moving parts (second account, second token to refresh, second webhook). Only worth it if a shared backend feels too tangled.

## 3. Architecture

Given your "real web app" choice, and the tools already available here (Supabase + Vercel), the clean stack is:

```
┌─────────────┐   OAuth + webhooks   ┌──────────────────────┐
│   Strava    │◄────────────────────►│  Next.js app (Vercel)│
└─────────────┘                      │  - Calendar / planner │
                                     │  - PMC dashboard      │
      ┌──────────────────────────────┤  - Race planner       │
      │                              └──────────┬───────────┘
      ▼                                         ▼
┌──────────────────┐                 ┌──────────────────────┐
│ Supabase Postgres │◄───────────────│ Supabase Edge Function│
│  + Auth + storage │  store & query  │  (webhook receiver,   │
└──────────────────┘                 │   nightly load calc)  │
                                     └──────────────────────┘
```

- **Frontend + hosting:** Next.js on Vercel. React calendar (e.g. FullCalendar or a custom grid), charts via Recharts/Chart.js.
- **Database + auth + backend:** Supabase (managed Postgres). Auth can be just you (single user) or Supabase Auth if you ever share it. Edge Functions handle the Strava webhook and the nightly load recalculation.
- **Sync:** Strava OAuth once for the token; a webhook subscription fires on every new/edited/deleted activity; a scheduled Edge Function refreshes tokens and recomputes daily load.

This is the least-glue-code path because Supabase gives you the database, auth, cron, and serverless functions in one place, and Vercel deploys the Next.js frontend from the same repo.

## 4. Data model (starting schema)

Six tables cover everything in scope:

- **`athlete`** — your profile, Strava id, weight, thresholds (FTP 229, LTHR, threshold pace 1:35 HM ≈ 4:20/mi). One row.
- **`activities`** — synced from Strava: id, sport_type, start time, distance, moving/elapsed time, elevation, avg/max HR & power & pace, cadence, calories, Strava `relative_effort`, and a computed `load` score (see §5).
- **`streams`** *(optional, storage-heavy)* — per-activity time series (HR, power, pace) if you want deep analysis. Can defer; pull on demand from Strava instead.
- **`planned_workouts`** — date, sport, description, target duration/distance, **target load**, status (planned / completed / skipped), and a link to the matching `activity` once it syncs (planned vs. actual).
- **`races`** — goal events: date, name, sport, priority (A/B/C), target, and the training block leading to it.
- **`wellness`** — daily "how tired am I" inputs you don't get from Strava: morning HR, sleep, weight, soreness, mood, notes. Optional but this is what makes the fatigue picture honest.
- **Post-activity feel** — a per-activity subjective score (RPE 1–10 + a Strong/Normal/Tired flag + notes). Lives either on the `activities` row or in `wellness`. See §5b.
- **`daily_load`** — one row per day with rolling CTL / ATL / TSB, computed nightly from `activities` + `planned_workouts`.

## 5. The fitness / fatigue model (the interesting part)

TrainingPeaks' Performance Management Chart is three numbers derived from a single daily **training load** value:

- **CTL (Fitness)** = 42-day exponentially-weighted average of daily load. Slow-moving; your accumulated fitness.
- **ATL (Fatigue)** = 7-day exponentially-weighted average of daily load. Fast-moving; recent tiredness.
- **TSB (Form)** = yesterday's CTL − yesterday's ATL. Positive = fresh/tapered, negative = buried in work.

The formulas:
```
CTL_today = CTL_yesterday + (load_today − CTL_yesterday) × (1 − e^(−1/42))
ATL_today = ATL_yesterday + (load_today − ATL_yesterday) × (1 − e^(−1/7))
TSB_today = CTL_yesterday − ATL_yesterday
```

The only hard question is **what "daily load" means across running, cycling, weights, and walks**. TrainingPeaks uses sport-specific TSS (power for bike, pace for run, HR for everything else). You have two options:

**Option A — sport-specific TSS (most accurate, more work).**
- **Bike:** power-based TSS from your FTP of 229 → `TSS = (sec × NP × IF) / (FTP × 3600) × 100`.
- **Run:** pace-based (rTSS) from threshold pace, derived from your 1:35 half (~4:20/mi threshold).
- **Weights / walks / anything without power or pace:** HR-based (hrTSS) from your HR zones.

**Option B — one unified metric via Strava's Relative Effort (fastest to ship).**
Strava already computes **Relative Effort** (a.k.a. Suffer Score) for every activity from heart rate — it's in the data you're already syncing, and it works identically for a ride, a run, or a weights session. Use it directly as daily load. You lose a little precision versus power-based TSS on the bike, but you get a *genuinely cross-sport* number with zero math, which is exactly what your "how fit / how tired am I across everything" goal needs.

**Recommendation:** ship v1 on Option B (Relative Effort), because it makes the multisport PMC work on day one. Then upgrade the bike (and optionally run) to true TSS in a later phase for racing precision, keeping Relative Effort as the fallback whenever HR/power is missing. Store both `relative_effort` and a `load` column so you can swap the model without re-syncing.

*Note on Chilli walks:* these are **excluded from load entirely** — they're duplicates of runs you record separately, so counting them would double-log the same session. Implement as a sync filter: drop `Walk` activities named as Chilli/Fi walks (or all `Walk` sport types) before they hit `daily_load`. Keep them in the DB if you want the record, just flag `count_toward_load = false`.

## 5b. The "how did you feel" score — Garmin vs. build-your-own

Short answer: **don't try to sync it from Garmin.** Here's the landscape.

**Garmin's own Feel / Perceived Effort field is effectively unreachable.** Garmin's official API (the Connect Developer Program — Health, Activity, Training APIs) is gated behind a partner-approval application aimed at companies, uses OAuth2, and isn't a realistic path for a personal one-athlete app. And critically, Garmin's subjective "feel" **does not sync to Strava** — Strava keeps its own separate field — so you can't pick it up through the Strava connection either. (Unofficial Garmin-login scraper libraries exist but violate Garmin's terms and break often — not recommended.)

**The clean options, both easy:**

1. **Piggyback Strava's built-in Perceived Exertion.** Strava has its own "How did that feel?" prompt (RPE 1–10) on the activity save/edit screen — an app you already open after every ride and run. That value **is exposed by the Strava API per activity**, so your app pulls it in with everything else. Zero new data-entry surface; one tap in an app you're already using. (Verified: the activity-performance data includes a perceived-exertion field; it simply comes back empty when you haven't set it.)

2. **Build your own post-activity entry in the app.** A small form after each synced activity: RPE slider, a Strong / Normal / Tired flag, soreness, and free-text notes. Richer than Strava's single number, fully yours, and it can sit right next to your CTL/ATL/TSB so "form said I should be fresh, but I felt buried" becomes visible.

**Recommendation:** do both, layered. Default to **Strava's Perceived Exertion** as the low-friction path (enter it where you already are, we sync it), and add your **own richer entry** in the app for the extra signal Strava can't hold — soreness, sleep, and a quick note. That gives you the Garmin "how did you feel" capability without depending on Garmin at all.

## 6. Migration — do this first, it's time-sensitive

Before the TrainingPeaks subscription lapses:

1. **Bulk-export your history now.** TrainingPeaks web app → export workout summary CSV in 12-month chunks back to your first season. Also grab the custom-metrics CSV (weight, HRV, sleep if you logged them).
2. **Archive raw files** (optional) — TCX/FIT per workout if you want to re-derive load later. Keep them in Supabase storage or a folder.
3. **Note your current thresholds** — FTP, threshold pace, HR zones, and today's CTL/ATL/TSB, so the new app's curve starts from the right place instead of zero.

Strava history you can backfill anytime via the API (it's not going away), so the *only* thing on a deadline is the TrainingPeaks-native data above.

## 7. Phased roadmap

**Phase 0 — Data rescue (do this week, ~1–2 hrs).** Export everything from TrainingPeaks per §6. No code required.

**Phase 1 — Sync + history (MVP backend).** Register a Strava API app, wire OAuth, backfill all activities into Supabase, compute a `load` column from Relative Effort. Deliverable: a database that mirrors your Strava history with a load score per activity.

**Phase 2 — PMC dashboard.** Nightly job computes `daily_load` (CTL/ATL/TSB); frontend shows the Fitness/Fatigue/Form chart and a sortable activity list. This alone replaces the "how fit / how tired am I" job.

**Phase 3 — Planner.** Calendar with drag-and-drop planned workouts, target load per day, and planned-vs-actual matching once Strava syncs the real activity. Replaces the TrainingPeaks calendar.

**Phase 4 — Race planning.** Add race targets, A/B/C priority, and a training-block view that projects your CTL forward from planned load so you can see whether you'll peak on race day. Add a taper helper (target TSB on race morning).

**Phase 5 — Health layer & polish.** Daily wellness inputs (morning HR, sleep, weight, soreness), overlay on the PMC, and any nice-to-haves: PR tracking, gear mileage (Strava gives this), weekly summary email via a scheduled function.

**Phase 4b — Adaptive week auto-planner.** Given a framework *you* define (weekly structure, hard/easy patterns, max weekly load ramp, long-day placement, rest triggers off TSB), the app proposes next week's sessions from your history, upcoming races, calendar availability, and current fatigue — then you edit any of it manually. This is the app's signature feature and the highest-IP piece. Prototype the rules engine before building the UI.

**Phase 5c — Built-in AI coach chat.** A chat panel where you ask questions ("am I on track for the A race?", "why is my form negative?") and give feedback that the planner learns from. The build is a thin wrapper; the value is the *context* you feed the model — current CTL/ATL/TSB, planned vs. actual, wellness, race targets, and your framework. Design that context payload deliberately (see §10).

**Phase 6 (optional, later) — precision upgrade.** Swap bike/run load to true power/pace TSS; add structured-workout templates; export a workout to your head unit if you ever want it.

## 8. Effort & the honest tradeoff

A single-user app on this stack is very doable, but it's a real project. Rough effort if you're building it yourself with AI assistance: Phases 1–2 (sync + PMC) are a weekend or two and give you 80% of the daily value; Phases 3–4 (planner + racing) are the bulk of the work; Phase 5 is incremental. The ongoing cost is near zero (Supabase + Vercel free tiers comfortably fit one athlete), but the ongoing *maintenance* — token refresh, Strava API changes, the occasional broken sync — is the thing TrainingPeaks was charging you to not think about. Worth going in eyes-open on that.

A lighter alternative worth naming: **Phases 1–2 delivered as a live dashboard first**, before committing to the full planner app. It would let you validate the load model against what TrainingPeaks currently shows you, using your real data, before investing in the calendar/racing build. If the numbers line up, you proceed to the full app with confidence.

## 9. Decisions to make next

1. **Load model:** start on Strava Relative Effort (recommended) or go straight to sport-specific TSS?
2. **Build order:** full app from Phase 1, or prove the PMC as a quick dashboard first, then build the planner?
3. **Wellness tracking:** do you want the daily "how tired" inputs in v1, or is the training-load-only fatigue signal enough to start?
4. **Do you already have a Strava API application registered,** or should setting that up be step one?

Answer those and I can turn any phase into a concrete task list — including registering the Strava app, standing up the Supabase schema, and scaffolding the Next.js project.

## 10. Prototype here (Cowork) vs. build in Cursor

You're building in Cursor. So the job *here* is to de-risk the parts that (a) need your real Strava data and (b) are easy to get wrong — and hand Cursor validated logic instead of guesses. Everything else is standard plumbing best done in Cursor.

**Prototype in Cowork (data-dependent, high-risk):**

- **Fitness/Fatigue engine on real history.** Pull your Strava activities, compute daily load (Relative Effort → CTL/ATL/TSB), render the curve. Purpose: eyeball it against TrainingPeaks so you trust the math. Deliverable: a live dashboard + the reference formulas. *This is the foundation both features below depend on.*
- **Week auto-planner rules engine.** A runnable proof that turns {your framework + history + races + calendar + current TSB} into a proposed week. Purpose: prove the logic on real data. Deliverable: an annotated algorithm you port to Cursor. **Blocked on: your framework definition.**

**Spec here, build in Cursor (plumbing / thin wrappers):**

- OAuth token sharing with the Chilli journal app, webhook routing, Supabase schema, calendar CRUD UI — all standard; Cursor handles these fast.
- **AI coach chat.** Don't prototype the wrapper. Do design the *context payload*: what the model sees each turn = current CTL/ATL/TSB + 7-day trend, this week's planned vs. actual, latest wellness/feel entries, next A/B/C races with countdowns, and your framework rules. Plus a system prompt that makes it reason like your coach, not a generic assistant. That spec is the deliverable; wiring it up is trivial in Cursor.

**Your framework (needed to prototype the planner).** To make the auto-planner real, define: weekly session structure (how many runs/rides/strength, which days), hard/easy day rules, max weekly load ramp (e.g. ≤5–8% CTL/week), long-session placement, and rest/deload triggers (e.g. schedule easy when TSB < −25). Rougher is fine to start — the prototype will surface what's missing.
