/**
 * Calendar-date helpers. Strava's start_date_local uses the athlete-local date in YYYY-MM-DD prefix.
 * Avoid toISOString() for UI bucketing — it converts to UTC and can shift evening workouts.
 */

export function calendarDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseCalendarDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const off = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - off)
  return x
}

export function stravaLocalDate(raw: { start_date_local?: string; start_date?: string }): string {
  const src = raw.start_date_local || raw.start_date
  if (!src || src.length < 10) throw new Error('Activity missing start date')
  return src.slice(0, 10)
}

export function activityDateKey(activity: { local_date?: string | null; start_local: string }): string {
  if (activity.local_date) return String(activity.local_date).slice(0, 10)
  const src = activity.start_local
  if (src.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(src)) return src.slice(0, 10)
  return calendarDateKey(new Date(src))
}

export function addCalendarDays(key: string, days: number): string {
  const d = parseCalendarDate(key)
  d.setDate(d.getDate() + days)
  return calendarDateKey(d)
}

export function compareCalendarKeys(a: string, b: string): number {
  return a.localeCompare(b)
}

export function formatDateRange(startKey: string, endKey: string): string {
  const start = parseCalendarDate(startKey)
  const end = parseCalendarDate(endKey)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startStr = start.toLocaleDateString(undefined, start.getFullYear() === end.getFullYear() ? opts : { ...opts, year: 'numeric' })
  const endStr = end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })
  return `${startStr} – ${endStr}`
}
