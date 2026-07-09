import { createHash } from 'crypto'
import { classifyActual } from './classify'
import { calendarDateKey } from './dates'
import { countsTowardLoad, isExcludedSport } from './excluded-sports'
import type { Framework } from './types'

export type TpActivityRow = {
  id: number
  sport_type: string
  start_local: string
  local_date: string
  moving_time: number
  distance: number | null
  elevation: number | null
  relative_effort: number | null
  load: number
  category: ReturnType<typeof classifyActual>
  category_override: null
  count_toward_load: boolean
  perceived_exertion: number | null
  name: string
  description: null
  raw: Record<string, unknown>
  updated_at: string
}

const ZONE_IF_SQ = [0.55 * 0.55, 0.65 * 0.65, 0.75 * 0.75, 0.85 * 0.85, 0.95 * 0.95]

const TP_SPORT_MAP: Record<string, string> = {
  bike: 'Ride',
  'mountain bike': 'MountainBikeRide',
  mtb: 'MountainBikeRide',
  run: 'Run',
  'trail run': 'TrailRun',
  walk: 'Walk',
  hike: 'Walk',
  swim: 'Swim',
  strength: 'WeightTraining',
  'strength training': 'WeightTraining',
  'cross training': 'Workout',
  rowing: 'Rowing',
  other: 'Workout',
}

export function stableTpId(dedupKey: string): number {
  const digest = createHash('sha256').update(dedupKey).digest()
  let n = 0
  for (let i = 0; i < 6; i++) n = n * 256 + digest[i]
  return -(n % 9_000_000_000_000_000) - 1
}

export function mapTpSportType(raw: string): string {
  const key = raw.trim().toLowerCase()
  return TP_SPORT_MAP[key] ?? (key ? raw.trim() : 'Workout')
}

export function mapFitSport(sport?: string, subSport?: string): string {
  const s = (sport || '').toLowerCase()
  const sub = (subSport || '').toLowerCase()
  if (s === 'running') return sub.includes('trail') ? 'TrailRun' : 'Run'
  if (s === 'cycling') {
    if (sub.includes('mountain')) return 'MountainBikeRide'
    if (sub.includes('gravel')) return 'GravelRide'
    if (sub.includes('e_bike') || sub.includes('ebike')) return 'EBikeRide'
    return 'Ride'
  }
  if (s === 'walking' || s === 'hiking') return 'Walk'
  if (s === 'swimming') return 'Swim'
  if (s === 'training' || s === 'fitness_equipment' || s === 'strength_training') return 'WeightTraining'
  if (s === 'rowing') return 'Rowing'
  return 'Workout'
}

export function estimateLoadFromFit(session: {
  total_timer_time?: number
  total_elapsed_time?: number
  time_in_hr_zone?: number[]
}): number {
  const zones = session.time_in_hr_zone
  if (zones?.length) {
    let sum = 0
    for (let i = 0; i < 5; i++) sum += (zones[i] || 0) * ZONE_IF_SQ[i]
    return Math.max(1, Math.round(sum / 36))
  }
  const sec = session.total_timer_time || session.total_elapsed_time || 0
  return Math.max(1, Math.round((sec / 3600) * 50))
}

export function formatLocalStart(isoUtc: string, tz: string): string {
  const d = new Date(isoUtc)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

export function localDateFromIso(isoUtc: string, tz: string): string {
  return formatLocalStart(isoUtc, tz).slice(0, 10)
}

export function dedupKey(dateOrStart: string, sportType: string, movingTime: number, title = ''): string {
  const date = dateOrStart.slice(0, 10)
  const slug = title.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 48)
  return `${date}|${sportType}|${Math.round(movingTime)}|${slug}`
}

export function coarseDedupKey(dateOrStart: string, sportType: string, movingTime: number): string {
  return `${dateOrStart.slice(0, 10)}|${sportType}|${Math.round(movingTime)}`
}

export function resolveTpSportType(workoutType: string, title: string, description: string): string {
  let sport = mapTpSportType(workoutType)
  const text = `${title} ${description}`.toLowerCase()
  if (sport === 'Run' && (/\bwalk\b/.test(text) || /\bchilli\b/.test(text))) sport = 'Walk'
  return sport
}

export function buildActivityRow(
  input: {
    id: number
    sportType: string
    startLocal: string
    localDate: string
    movingTime: number
    distance: number | null
    elevation: number | null
    load: number
    name: string
    perceivedExertion?: number | null
    source: 'trainingpeaks-csv' | 'trainingpeaks-fit'
    raw: Record<string, unknown>
  },
  framework: Framework,
): TpActivityRow {
  const countTowardLoad = countsTowardLoad(input.sportType)
  const load = countTowardLoad ? input.load : 0
  return {
    id: input.id,
    sport_type: input.sportType,
    start_local: input.startLocal,
    local_date: input.localDate,
    moving_time: input.movingTime,
    distance: input.distance,
    elevation: input.elevation,
    relative_effort: countTowardLoad ? input.load : null,
    load,
    category: classifyActual(input.sportType, input.name, null, input.movingTime, framework),
    category_override: null,
    count_toward_load: countTowardLoad,
    perceived_exertion: input.perceivedExertion ?? null,
    name: input.name,
    description: null,
    raw: { ...input.raw, import_source: input.source },
    updated_at: new Date().toISOString(),
  }
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export function parseTpDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return calendarDateKey(d)
  return null
}

export function parseDurationSeconds(raw: string | undefined, hoursCol?: string): number {
  if (hoursCol) {
    const h = Number(hoursCol)
    if (!Number.isNaN(h) && h > 0) return Math.round(h * 3600)
  }
  if (!raw) return 0
  const s = raw.trim()
  const asNum = Number(s)
  if (!Number.isNaN(asNum) && asNum > 0 && !s.includes(':')) return Math.round(asNum * 3600)
  const parts = s.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

export function rowFromCsvRecord(
  record: Record<string, string>,
  framework: Framework,
  tz: string,
): TpActivityRow | null {
  const title = record.title || record.workoutdescription || 'Workout'
  const description = record.workoutdescription || ''
  const sportType = resolveTpSportType(record.workouttype || 'Other', title, description)
  if (isExcludedSport(sportType)) return null

  const day = parseTpDate(record.workoutday || '')
  if (!day) return null

  const movingTime = parseDurationSeconds(record.workouttime, record.timetotalinhours)
  if (movingTime <= 0) return null

  const tss = Number(record.tss)
  const load = Number.isFinite(tss) && tss > 0 ? Math.round(tss) : Math.max(1, Math.round((movingTime / 3600) * 50))

  const startLocal = `${day}T12:00:00`
  const distanceRaw = Number(record.distanceinmeters || record.distance || record.planneddistanceinmeters)
  const elevRaw = Number(record.elevationgaininmeters || record.elevationgain || record.elevation)
  const dedup = dedupKey(day, sportType, movingTime, title)
  const rpe = Number(record.rpe)
  const perceivedExertion = Number.isFinite(rpe) && rpe > 0 ? Math.round(rpe) : null

  return buildActivityRow({
    id: stableTpId(dedup),
    sportType,
    startLocal,
    localDate: day,
    movingTime,
    distance: Number.isFinite(distanceRaw) && distanceRaw > 0 ? distanceRaw : null,
    elevation: Number.isFinite(elevRaw) && elevRaw > 0 ? elevRaw : null,
    load,
    name: title,
    perceivedExertion,
    source: 'trainingpeaks-csv',
    raw: {
      title: record.title,
      workouttype: record.workouttype,
      workoutday: record.workoutday,
      tss: record.tss,
      timetotalinhours: record.timetotalinhours,
      distanceinmeters: record.distanceinmeters,
      rpe: record.rpe,
    },
  }, framework)
}
