# Cursor handoff — Structured workout file import (M7)

*Written Jul 13, 2026, against the current build. Feature spec: `v1-Cursor-Build-Spec.md` §4.5. Scope boundary: **import only** — parse a structured-workout file, store it, attach it to a planned workout, draw its target graph. No builder, no push to head unit/Zwift/Strava.*

This doc is the step-by-step for implementing M7 in Cursor. It maps every step onto files and patterns that already exist in this repo, so you're extending conventions, not inventing them.

> **Before writing code:** per `AGENTS.md`, this is Next.js 16 with breaking changes — read `node_modules/next/dist/docs/` for route-handler and file-upload APIs before touching `app/api/`. Don't trust older Next patterns from memory.

---

## 0. What's already in your favor

- **`fit-file-parser` is already a devDependency** (`package.json`) — the `.fit` path has a parser installed; you saw it used in `lib/trainingpeaks-import.ts` (`mapFitSport`, `estimateLoadFromFit`).
- **`recharts` is installed** — use it for the target-graph preview; no new chart dep.
- **`uuid` is installed** — for demo-mode IDs.
- **Parser pattern to mirror:** `lib/trainingpeaks-import.ts` is pure, testable functions (parse → normalized row). Build the structured parser the same way.
- **API pattern to mirror:** `app/api/planned-workouts/route.ts` — every handler branches `isDemoMode()` → `demoStore`, else `getSupabaseAdmin()`. Follow it exactly.
- **A ready test fixture lives at** `demo/structured-samples/2026-07-13_aerobic-tempo-openers.zwo` (and `.mrc`). Known totals: **6180 s (103 min)**, sweet-spot steps at `0.88`, openers at `1.10`. Use it to assert your parser.

---

## 1. Data layer

### 1.1 Migration — new SQL file (don't edit `schema.sql` in place; add a migration like `add_local_date.sql`)

Create `supabase/add_structured_workouts.sql`:

```sql
create table if not exists structured_workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_format text not null,        -- zwo | erg | mrc | fit
  sport text not null default 'bike',
  ftp_reference int,                  -- FTP absolute-watt formats were authored at; null for %FTP formats
  duration_sec int not null default 0,
  target_metric text not null default 'power_pct_ftp',
  steps jsonb not null default '[]'::jsonb,
  original_filename text,
  raw text,                           -- verbatim file, so re-parse/re-export is lossless
  created_at timestamptz default now()
);

alter table planned_workouts
  add column if not exists structured_workout_id uuid
    references structured_workouts (id) on delete set null;
```

Also append these two statements to `supabase/schema.sql` so a fresh setup includes them (keep both in sync — that's the repo's existing convention). Run against Supabase per `docs/SUPABASE_SETUP.md`.

### 1.2 Types — `lib/types.ts`

```ts
export type StructuredFormat = 'zwo' | 'erg' | 'mrc' | 'fit'
export type StructuredStepKind = 'steady' | 'ramp' | 'interval' | 'free'

export interface StructuredStep {
  kind: StructuredStepKind
  duration_sec: number          // total incl. all repeats for interval kind
  target_low: number            // fraction of FTP (power_pct_ftp)
  target_high: number
  cadence?: number
  repeat?: number               // interval only
  on_sec?: number; off_sec?: number
  off_low?: number; off_high?: number
  label?: string
}

export interface StructuredWorkout {
  id: string
  name: string
  source_format: StructuredFormat
  sport: string
  ftp_reference: number | null
  duration_sec: number
  target_metric: 'power_pct_ftp' | 'power_watts' | 'pace' | 'hr'
  steps: StructuredStep[]
  original_filename: string | null
  created_at?: string
}
```

Add `structured_workout_id: string | null` to the existing `PlannedWorkout` interface.

---

## 2. Parser — `lib/structured-workout.ts` (new, pure functions)

Mirror the shape of `trainingpeaks-import.ts`: no I/O, just `string → parsed`. One entry point that dispatches on extension, plus per-format parsers and shared helpers.

```ts
import type { StructuredStep, StructuredFormat } from './types'

export interface ParsedStructured {
  name: string
  sport: string
  ftp_reference: number | null   // set only for .erg (absolute watts)
  target_metric: 'power_pct_ftp'
  steps: StructuredStep[]
  duration_sec: number
}

export function parseStructuredFile(
  filename: string,
  contents: string | Uint8Array,
  opts?: { ftpForErg?: number }
): ParsedStructured {
  const ext = filename.split('.').pop()!.toLowerCase() as StructuredFormat
  switch (ext) {
    case 'zwo': return parseZwo(contents as string)
    case 'mrc': return parseMrc(contents as string)                 // %FTP points
    case 'erg': return parseErg(contents as string, opts?.ftpForErg) // watts → %FTP
    case 'fit': return parseFitWorkout(contents as Uint8Array)      // fit-file-parser
    default: throw new Error(`Unsupported format: .${ext}`)
  }
}
```

**`.zwo` (do this one first — primary format).** Parse the XML (`DOMParser` in the route is fine, or a tiny dependency-free regex/tag walker to stay server-safe). Map elements to steps:
- `<Warmup>` / `<Cooldown>` → `kind:'ramp'`, `target_low=PowerLow`, `target_high=PowerHigh`, `duration_sec=Duration`.
- `<SteadyState>` → `kind:'steady'`, `target_low=target_high=Power`.
- `<IntervalsT>` → `kind:'interval'`, `repeat=Repeat`, `on_sec=OnDuration`, `off_sec=OffDuration`, `target_low=target_high=OnPower`, `off_low=off_high=OffPower`, `duration_sec=Repeat*(OnDuration+OffDuration)`.
- `<Ramp>` → `kind:'ramp'`. `<FreeRide>` → `kind:'free'`.
- Pull `Cadence` where present; `<name>` → workout name; `sport='bike'`.

**`.mrc` / `.erg`.** Read `[COURSE DATA]` lines (`minutes<TAB>value`). Consecutive points → a `steady` step (flat) or `ramp` step (value changes) with `duration_sec = (t2-t1)*60`. Collapse zero-length segments (repeated timestamps are intentional vertical steps — skip them, they just mark the transition). For `.mrc` the value is already %FTP → divide by 100. For `.erg` the value is watts → divide by `ftpForErg` (require it; if absent, set `ftp_reference` and defer conversion to render time). See `demo/structured-samples/*.mrc` for the exact point layout.

**`.fit`.** Use `fit-file-parser` (already installed) on the workout message stream. Lower priority — ship `.zwo`+`.mrc`+`.erg` first, gate `.fit` behind them.

**Shared helpers (put in the same file):**

```ts
// TSS-style load estimate from the normalized profile (prefills planned_workouts.target_load)
export function estimateStructuredLoad(steps: StructuredStep[]): number {
  let tss = 0
  for (const s of steps) {
    if (s.kind === 'interval' && s.repeat) {
      const onIF = (s.target_low + s.target_high) / 2
      const offIF = ((s.off_low ?? 0) + (s.off_high ?? 0)) / 2
      tss += s.repeat * ((s.on_sec ?? 0) * onIF ** 2 + (s.off_sec ?? 0) * offIF ** 2)
    } else {
      const ifv = (s.target_low + s.target_high) / 2   // ramp: mean of low/high is fine for v1
      tss += s.duration_sec * ifv ** 2
    }
  }
  return Math.round((tss / 3600) * 100)
}

// watts for display against the athlete's CURRENT ftp
export const wattsAt = (frac: number, ftp: number) => Math.round(frac * ftp)

// validation — throw on bad files
export function validateSteps(steps: StructuredStep[], total: number) {
  const sum = steps.reduce((n, s) => n + s.duration_sec, 0)
  if (Math.abs(sum - total) > 2) throw new Error(`Step durations (${sum}s) != total (${total}s)`)
  for (const s of steps) {
    if (s.duration_sec <= 0) throw new Error('Zero-duration step')
    for (const v of [s.target_low, s.target_high]) if (v < 0 || v > 3) throw new Error(`Target ${v} out of range`)
  }
}
```

Sanity check against the fixture: `.zwo` → `duration_sec === 6180`, `estimateStructuredLoad ≈ 95–110`.

---

## 3. API routes

### 3.1 New — `app/api/structured-workouts/route.ts`

Follow the `planned-workouts/route.ts` shape (demo branch + Supabase branch). `POST` receives the uploaded file (Next 16 route handler: read `await request.formData()` for multipart, or accept JSON `{ filename, contents }` from the client if you parse client-side — simpler and avoids multipart quirks). Then:

```
POST:
  parse → validateSteps → insert into structured_workouts (store raw = verbatim contents)
       → return { structured, estimatedLoad }
GET?id=…: return one; GET: list recent (optional)
```

Demo mode: add a `demoStore` map for structured workouts (see §4).

### 3.2 Extend — `app/api/planned-workouts/route.ts`

`POST` and `PUT` must accept and persist `structured_workout_id`. Add it to both the demo `addPlanned/updatePlanned` calls and the Supabase `insert/update` objects (one field each — same as the existing columns). Nothing else changes; matching logic is untouched.

---

## 4. Demo mode — `lib/demo.ts`

The app runs `DEMO_MODE` off `.env.local`. Add a `structuredWorkouts` array to `demoStore` with `add`/`get(id)` methods (mirror `addPlanned`), and make `addPlanned/updatePlanned` carry `structured_workout_id`. Keep it in-memory like the rest — no persistence needed for demo.

---

## 5. UI — `components/PlannerClient.tsx` + `PlannerDayEntry.tsx`

### 5.1 The planned-workout modal (in `PlannerClient.tsx`)

The modal already edits `{ sport, type, dur, desc, load }` via `form` state and `savePlanned()`. Add:

1. **An "Attach structured file" control** — `<input type="file" accept=".zwo,.mrc,.erg,.fit">`. On select: read the file client-side (`await file.text()` for xml/mrc/erg; `arrayBuffer` for fit), POST to `/api/structured-workouts`, get back `{ structured, estimatedLoad }`.
2. **On success:** stash `structured.id` into a new `form.structuredId`, and **prefill `form.load` with `estimatedLoad`** (only if the user hasn't typed one). Show the assumed-FTP note (see §6).
3. **Preview graph** — a small Recharts `<AreaChart>` of %FTP vs. elapsed time built from `structured.steps` (expand intervals into on/off segments). ~120px tall. This is the payoff — the user sees the workout shape before saving.
4. **`savePlanned()`** already POSTs the form; include `structured_workout_id: form.structuredId ?? null` in the body.

Keep it optional: a plan with no file behaves exactly as today.

### 5.2 The day cell (`PlannerDayEntry.tsx`)

When `plan.structured_workout_id` is set, add a small **"structured" badge** (reuse the existing tag pill styling — `text-[9px] uppercase bg-black/5 px-0.5 rounded`) and, optionally, a 1-line sparkline of the target graph. Low effort, high signal.

---

## 6. The FTP-mismatch gotcha (call it out in the UI)

Internal truth is **%FTP**. Render watts with `athlete.ftp` (from the `athlete` row) at display time — never bake watts into storage. But surface the assumption: a `.zwo` authored at FTP 205 shows very different watts against the stored FTP of **229** (a real gap in your own data right now). In the preview, show e.g. *"Targets shown at FTP 229 — this file was built for ~205"* when you can detect an authoring FTP (`.erg` has one; `.zwo`/`.mrc` don't, so let the user set a per-import display FTP). Let the user confirm/override before saving.

---

## 7. Build order (each step shippable)

1. Migration + types (§1) — nothing visible yet, but everything compiles.
2. `.zwo` parser + `estimateStructuredLoad` + `validateSteps` (§2) with a unit test against the fixture. **This is the riskiest logic — prove it first.**
3. `POST /api/structured-workouts` + demo store (§3.1, §4).
4. Extend `planned-workouts` route with `structured_workout_id` (§3.2).
5. Modal file-input + load prefill (§5.1 steps 1–2).
6. Recharts preview + day-cell badge (§5.1 step 3, §5.2).
7. `.mrc` / `.erg` parsers (§2), then `.fit` if time.

Steps 1–5 give you a working import; 6–7 are polish and format coverage.

---

## 8. Test plan

- **Unit:** parse `demo/structured-samples/2026-07-13_aerobic-tempo-openers.zwo` → assert `duration_sec === 6180`, step count, `target_low` of the sweet-spot interval `=== 0.88`, opener `=== 1.10`. Repeat for the `.mrc` twin → same total, %FTP within ±1.
- **Validation:** feed a hand-broken file (zero-duration step, target `5.0`) → `validateSteps` throws, route returns 400.
- **Round-trip:** import → attach to a planned workout → reload planner → badge + graph render, `target_load` prefilled.
- **Demo mode:** works with `DEMO_MODE=true` (no Supabase) end-to-end.
- **FTP display:** switch `athlete.ftp` 205 ↔ 229 → watts rescale, %FTP shape unchanged.

---

## 9. Out of scope (don't build now)

Structured-workout **builder** (authoring steps in-app), **export/push** to head unit / Zwift / Strava (Strava is read-only anyway), and pace/HR target metrics (schema's `target_metric` leaves the door open — v1 is `power_pct_ftp` only). These stay in Build-Plan Phase 6 / v2+.
