import { readFileSync } from 'fs'
import { join } from 'path'
import { isChilliActivity } from './chilli'
import { activityDateKey, addCalendarDays, calendarDateKey, parseCalendarDate } from './dates'
import { DEFAULT_FRAMEWORK } from './framework'
import { mapStravaToActivity } from './strava-ingest'
import type { Activity, FeelEntry, Framework, PlannedWorkout, Race, StravaActivityPayload } from './types'

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === 'true') return true
  if (process.env.DEMO_MODE === 'false') return false
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY
}

export const DEMO_HISTORY_START = '2026-01-01'

function isoLocal(date: string, hour = 7, min = 0) {
  return `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
}

function loadStravaRuns(): Activity[] {
  const path = join(process.cwd(), 'demo/strava-runs.json')
  const { runs } = JSON.parse(readFileSync(path, 'utf8')) as { runs: StravaActivityPayload[] }
  return runs
    .filter((r) => !isChilliActivity(r.name ?? ''))
    .map((raw) => {
      const m = mapStravaToActivity(raw, DEFAULT_FRAMEWORK)
      return {
        id: m.id,
        sport_type: m.sport_type,
        start_local: m.start_local,
        local_date: m.local_date,
        moving_time: m.moving_time,
        distance: m.distance,
        elevation: m.elevation,
        relative_effort: m.relative_effort,
        load: m.load,
        category: m.category,
        category_override: m.category_override,
        count_toward_load: m.count_toward_load,
        perceived_exertion: m.perceived_exertion,
        name: m.name,
        description: m.description,
      }
    })
}

function buildSeedActivities(): Activity[] {
  const stravaRuns = loadStravaRuns()
  const stravaDates = new Set(stravaRuns.map((a) => activityDateKey(a)))
  const activities: Activity[] = []
  let id = 900000001
  const todayKey = calendarDateKey(new Date())
  const pinTue = addCalendarDays(todayKey, -1)

  const templates = {
    longRide: { sport: 'Ride', name: '2hr endurance ride', load: 55, min: 125, cat: 'longRide' as const, elevation: 450 },
    intervalRide: { sport: 'Ride', name: 'VO2 intervals', load: 38, min: 60, cat: 'intervalRide' as const, elevation: 280 },
    strength: { sport: 'WeightTraining', name: 'Strength', load: 18, min: 45, cat: 'strength' as const, elevation: null as number | null },
  }

  type Template = { sport: string; name: string; load: number; min: number; cat: NonNullable<Activity['category']>; elevation: number | null }
  const push = (key: string, t: Template, h: number, m: number) => {
    activities.push({
      id: id++,
      sport_type: t.sport,
      start_local: isoLocal(key, h, m),
      local_date: key,
      moving_time: t.min * 60,
      distance: t.min * 400,
      elevation: t.elevation,
      relative_effort: t.load,
      load: t.load,
      category: t.cat,
      category_override: null,
      count_toward_load: true,
      perceived_exertion: Math.min(10, Math.round(t.load / 5)),
      name: t.name,
      description: null,
    })
  }

  let key = DEMO_HISTORY_START
  let dayIndex = 0
  while (key <= todayKey) {
    const dow = parseCalendarDate(key).getDay()
    const hasRun = stravaDates.has(key)
    const isPinTue = key === pinTue

    if (dow === 3 && !hasRun && !isPinTue) push(key, templates.strength, 17, 30)
    if (dow === 5) push(key, templates.longRide, 7, 0)
    if (dow === 6 && dayIndex % 2 === 0) push(key, templates.intervalRide, 8, 0)

    key = addCalendarDays(key, 1)
    dayIndex++
  }

  const pinnedStrength: Activity = {
    id: 900000901,
    sport_type: 'WeightTraining',
    start_local: isoLocal(pinTue, 17, 30),
    local_date: pinTue,
    moving_time: 42 * 60,
    distance: null,
    elevation: null,
    relative_effort: 16,
    load: 16,
    category: 'strength',
    category_override: null,
    count_toward_load: true,
    perceived_exertion: 4,
    name: 'Strength',
    description: null,
  }

  const synthetic = activities.filter((a) => a.local_date !== pinTue)
  return [...stravaRuns, ...synthetic, pinnedStrength].sort((a, b) => b.start_local.localeCompare(a.start_local))
}

function buildSeedPlanned(): PlannedWorkout[] {
  return []
}

type DemoStore = { activities: Activity[]; planned: PlannedWorkout[]; races: Race[]; framework: Framework; feels: FeelEntry[] }
let store: DemoStore | null = null

function getStore(): DemoStore {
  if (!store) {
    store = {
      activities: buildSeedActivities(),
      planned: buildSeedPlanned(),
      races: [
        { id: 'demo-r1', date: '2026-09-13', name: 'Truckee Half', sport: 'Run', priority: 'A' },
        { id: 'demo-r2', date: '2026-10-04', name: 'Gran Fondo', sport: 'Ride', priority: 'B' },
      ],
      framework: { ...DEFAULT_FRAMEWORK },
      feels: [],
    }
  }
  return store
}

export function resetDemoStore() { store = null }

const todayKey = calendarDateKey(new Date())
const tomorrowKey = addCalendarDays(todayKey, 1)
const dayAfterKey = addCalendarDays(todayKey, 2)

function buildSeedCalendarEvents() {
  const tz = '-07:00'
  const dt = (key: string, h: number, m: number) =>
    `${key}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${tz}`
  return [
    { summary: 'Team standup', start: { dateTime: dt(todayKey, 9, 0) }, end: { dateTime: dt(todayKey, 9, 30) } },
    { summary: 'Lunch meeting', start: { dateTime: dt(todayKey, 12, 0) }, end: { dateTime: dt(todayKey, 13, 0) } },
    { summary: '1:1', start: { dateTime: dt(todayKey, 15, 0) }, end: { dateTime: dt(todayKey, 15, 45) } },
    { summary: 'CSA pickup', transparency: 'transparent', start: { dateTime: dt(tomorrowKey, 17, 0) }, end: { dateTime: dt(tomorrowKey, 17, 30) } },
    { summary: 'Busy', start: { dateTime: dt(tomorrowKey, 8, 0) }, end: { dateTime: dt(tomorrowKey, 9, 0) } },
    { summary: 'Busy', start: { dateTime: dt(tomorrowKey, 15, 0) }, end: { dateTime: dt(tomorrowKey, 16, 0) } },
    { summary: 'Project sync', start: { dateTime: dt(dayAfterKey, 14, 0) }, end: { dateTime: dt(dayAfterKey, 15, 30) } },
  ]
}

function filterByDateRange(activities: Activity[], from?: string | null, to?: string | null) {
  return activities.filter((a) => {
    const k = activityDateKey(a)
    return (!from || k >= from) && (!to || k <= to)
  })
}

export const demoStore = {
  getActivities(days: number) {
    const sinceKey = addCalendarDays(calendarDateKey(new Date()), -days)
    return getStore().activities.filter((a) => activityDateKey(a) >= sinceKey)
  },
  getActivitiesInRange(from: string, to: string) {
    return filterByDateRange(getStore().activities, from, to)
  },
  getActivityBounds() {
    const acts = getStore().activities.filter((a) => a.count_toward_load)
    if (!acts.length) return { earliest: DEMO_HISTORY_START, latest: calendarDateKey(new Date()) }
    const keys = acts.map((a) => activityDateKey(a)).sort()
    return { earliest: keys[0], latest: keys[keys.length - 1] }
  },
  getSettings() { return getStore().framework },
  updateSettings(framework: Framework) { getStore().framework = framework; return framework },
  getPlanned(from?: string | null, to?: string | null) {
    return getStore().planned.filter((p) => (!from || p.date >= from) && (!to || p.date <= to))
  },
  addPlanned(row: Omit<PlannedWorkout, 'id' | 'status' | 'matched_activity_id'>) {
    const item: PlannedWorkout = { ...row, id: `demo-p-${Date.now()}`, status: 'planned', matched_activity_id: null }
    getStore().planned.push(item)
    return item
  },
  updatePlanned(id: string, patch: Partial<PlannedWorkout>) {
    const s = getStore()
    const idx = s.planned.findIndex((p) => p.id === id)
    if (idx < 0) return null
    s.planned[idx] = { ...s.planned[idx], ...patch }
    return s.planned[idx]
  },
  deletePlanned(id: string) { getStore().planned = getStore().planned.filter((p) => p.id !== id) },
  getRaces() { return getStore().races },
  addRace(row: Omit<Race, 'id'>) { const item = { ...row, id: `demo-r-${Date.now()}` }; getStore().races.push(item); return item },
  deleteRace(id: string) { getStore().races = getStore().races.filter((r) => r.id !== id) },
  getFeel() {
    const s = getStore()
    const feelIds = new Set(s.feels.map((f) => f.activity_id))
    return { pending: s.activities.filter((a) => a.count_toward_load && !feelIds.has(a.id)).slice(0, 10), feels: s.feels }
  },
  saveFeel(body: { activity_id: number; rpe?: number | null; feel_flag?: string | null; soreness?: number | null; note?: string | null; category_override?: string | null }) {
    const s = getStore()
    const existing = s.feels.find((f) => f.activity_id === body.activity_id)
    const entry: FeelEntry = { id: existing?.id ?? `demo-f-${Date.now()}`, activity_id: body.activity_id, rpe: body.rpe ?? null, feel_flag: (body.feel_flag as FeelEntry['feel_flag']) ?? null, soreness: body.soreness ?? null, note: body.note ?? null }
    if (existing) Object.assign(existing, entry)
    else s.feels.push(entry)
    if (body.category_override) {
      const act = s.activities.find((a) => a.id === body.activity_id)
      if (act) act.category_override = body.category_override as Activity['category_override']
    }
    return entry
  },
  getActivity(id: number) {
    const s = getStore()
    const activity = s.activities.find((a) => a.id === id)
    if (!activity) return null
    const feel = s.feels.find((f) => f.activity_id === id) ?? null
    return { activity, feel }
  },
  getCalendarEvents(from?: string | null, to?: string | null) {
    return buildSeedCalendarEvents().filter((ev) => {
      const key = ev.start?.dateTime?.slice(0, 10) ?? (ev.start as { date?: string })?.date
      if (!key) return false
      return (!from || key >= from) && (!to || key <= to)
    })
  },
}
