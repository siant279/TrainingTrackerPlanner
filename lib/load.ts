import { activityDateKey, addCalendarDays, calendarDateKey, compareCalendarKeys, mondayOf, parseCalendarDate } from './dates'
import type { Activity, LoadSeriesPoint } from './types'

export const BASE_DAYS = 42
export const TIRED_DAYS = 7
const DAY_MS = 86400000

export function fmtDate(d: Date) { return calendarDateKey(d) }
export function localDay(ts: string) { return ts.slice(0, 10) }

export function buildDailyLoadMap(
  activities: Pick<Activity, 'local_date' | 'start_local' | 'load' | 'count_toward_load'>[],
) {
  const load: Record<string, number> = {}
  for (const a of activities) {
    if (!a.count_toward_load || (a.load ?? 0) <= 0) continue
    const d = activityDateKey(a)
    load[d] = (load[d] ?? 0) + a.load
  }
  return load
}

export function computeLoadSeries(dailyLoadMap: Record<string, number>, windowDays: number, endDate = new Date()) {
  const todayKey = calendarDateKey(endDate)
  // Walk calendar dates (not raw ms) so DST transitions cannot skip/duplicate days.
  let cursor = addCalendarDays(todayKey, -(windowDays + BASE_DAYS))
  const days: { date: string; load: number }[] = []
  while (compareCalendarKeys(cursor, todayKey) <= 0) {
    days.push({ date: cursor, load: dailyLoadMap[cursor] ?? 0 })
    cursor = addCalendarDays(cursor, 1)
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

async function fetchAllLoadActivities(
  supabase: ReturnType<typeof import('./supabase').getSupabaseAdmin>,
): Promise<Pick<Activity, 'local_date' | 'start_local' | 'load' | 'count_toward_load'>[]> {
  const pageSize = 1000
  const all: Pick<Activity, 'local_date' | 'start_local' | 'load' | 'count_toward_load'>[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('activities')
      .select('id,local_date,start_local,load,count_toward_load')
      .eq('count_toward_load', true)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch activities for load recompute: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return all
}

export async function recomputeDailyLoadTable(supabase: ReturnType<typeof import('./supabase').getSupabaseAdmin>) {
  const activities = await fetchAllLoadActivities(supabase)
  const map = buildDailyLoadMap(activities)
  if (!Object.keys(map).length) return
  const dates = Object.keys(map).sort()
  const startKey = dates[0]
  const endKey = calendarDateKey(new Date())
  // Approximate day span for the rolling window; calendar walk inside computeLoadSeries is exact.
  const spanDays = Math.max(
    1,
    Math.round((parseCalendarDate(endKey).getTime() - parseCalendarDate(startKey).getTime()) / DAY_MS),
  )
  const { rows } = computeLoadSeries(map, spanDays + BASE_DAYS, parseCalendarDate(endKey))
  const payload = rows.map((r) => ({ date: r.date, load: Math.round(r.load), base: r.base, tired: r.tired, rested: r.rested }))
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200)
    const { error } = await supabase.from('daily_load').upsert(chunk)
    if (error) throw new Error(`daily_load upsert failed: ${error.message}`)
  }
}
