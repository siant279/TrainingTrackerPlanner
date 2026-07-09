import { activityDateKey, calendarDateKey, compareCalendarKeys, mondayOf, parseCalendarDate } from './dates'
import type { Activity, LoadSeriesPoint } from './types'

export const BASE_DAYS = 42
export const TIRED_DAYS = 7
const DAY_MS = 86400000

export function fmtDate(d: Date) { return calendarDateKey(d) }
export function localDay(ts: string) { return ts.slice(0, 10) }

export function buildDailyLoadMap(activities: Activity[]) {
  const load: Record<string, number> = {}
  for (const a of activities) {
    if (!a.count_toward_load || (a.load ?? 0) <= 0) continue
    const d = activityDateKey(a)
    load[d] = (load[d] ?? 0) + a.load
  }
  return load
}

export function computeLoadSeries(dailyLoadMap: Record<string, number>, windowDays: number, endDate = new Date()) {
  const today = parseCalendarDate(calendarDateKey(endDate))
  const totalDays = windowDays + BASE_DAYS
  const start = new Date(today.getTime() - totalDays * DAY_MS)
  const days: { date: string; load: number }[] = []
  for (let t = start.getTime(); t <= today.getTime(); t += DAY_MS) {
    const key = calendarDateKey(new Date(t))
    days.push({ date: key, load: dailyLoadMap[key] ?? 0 })
  }
  const rows: LoadSeriesPoint[] = days.map((d, i) => {
    const baseSlice = days.slice(Math.max(0, i - BASE_DAYS + 1), i + 1)
    const tiredSlice = days.slice(Math.max(0, i - TIRED_DAYS + 1), i + 1)
    const base = baseSlice.reduce((s, x) => s + x.load, 0) / baseSlice.length
    const tired = tiredSlice.reduce((s, x) => s + x.load, 0) / tiredSlice.length
    return { date: d.date, load: d.load, base, tired, rested: base - tired }
  })
  return { rows, windowRows: rows.slice(-windowDays) }
}

export function freshInterp(base: number, tired: number) {
  const r = base > 0.5 ? tired / base : 1
  if (r > 1.35) return { text: 'Overreaching — ease up soon', color: '#dc2626' }
  if (r > 1.15) return { text: 'Building hard', color: '#ca8a04' }
  if (r >= 0.9) return { text: 'Balanced', color: '#667085' }
  if (r >= 0.75) return { text: 'Fresh / rested', color: '#16a34a' }
  return { text: 'Very fresh — tapered', color: '#0891b2' }
}

export function isoWeekKey(dstr: string) {
  return calendarDateKey(mondayOf(parseCalendarDate(dstr)))
}

/** Last day of [start, end] on or before today; if the whole range is past, use end. */
export function metricsAsOfKey(viewStartKey: string, viewEndKey: string, todayKey: string): string {
  if (compareCalendarKeys(viewEndKey, todayKey) <= 0) return viewEndKey
  if (compareCalendarKeys(viewStartKey, todayKey) > 0) return todayKey
  return todayKey
}

export function loadMetricsOnDate(dailyLoadMap: Record<string, number>, asOfKey: string) {
  const { rows } = computeLoadSeries(dailyLoadMap, 1, parseCalendarDate(asOfKey))
  return rows.find((r) => r.date === asOfKey) ?? rows[rows.length - 1] ?? null
}

export async function recomputeDailyLoadTable(supabase: ReturnType<typeof import('./supabase').getSupabaseAdmin>) {
  const { data: activities } = await supabase.from('activities').select('*').eq('count_toward_load', true)
  const map = buildDailyLoadMap((activities ?? []) as Activity[])
  if (!Object.keys(map).length) return
  const dates = Object.keys(map).sort()
  const start = parseCalendarDate(dates[0])
  const end = new Date()
  const { rows } = computeLoadSeries(map, Math.ceil((end.getTime() - start.getTime()) / DAY_MS) + BASE_DAYS, end)
  const payload = rows.map((r) => ({ date: r.date, load: Math.round(r.load), base: r.base, tired: r.tired, rested: r.rested }))
  for (let i = 0; i < payload.length; i += 200) {
    await supabase.from('daily_load').upsert(payload.slice(i, i + 200))
  }
}
