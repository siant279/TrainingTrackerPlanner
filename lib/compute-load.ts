/**
 * House "Load" = hours × IF² × 100 (Coggan-shaped, not branded TSS).
 *
 * Priority for IF: power → HR → flat-run pace → RPE → sport default.
 * TrainingPeaks TSS passes through when present.
 */
import { countsTowardLoad } from './excluded-sports'

export type LoadSource = 'tss' | 'power' | 'hr' | 'pace' | 'rpe' | 'default'

export type AthletePhysiology = {
  ftp: number | null
  /** Flat threshold pace in seconds per kilometer. */
  thresholdPaceSecPerKm: number | null
  lthr: number | null
}

export type LoadInput = {
  sportType: string
  name?: string | null
  movingTimeSec: number
  distanceM?: number | null
  elevationM?: number | null
  /** Normalized power or average watts. */
  watts?: number | null
  averageHeartrate?: number | null
  /** Strava/TP RPE on a 1–10 scale. */
  perceivedExertion?: number | null
  /** TrainingPeaks TSS — pass through as Load. */
  tss?: number | null
}

export type LoadResult = {
  load: number
  source: LoadSource
  intensityFactor: number | null
}

const IF_MIN = 0.35
const IF_MAX = 1.25
/** Skip pace-based IF when climbing steeper than this (m gain per km). */
export const FLAT_MAX_M_PER_KM = 20

export const DEFAULT_PHYSIOLOGY: AthletePhysiology = {
  ftp: null,
  thresholdPaceSecPerKm: null,
  lthr: null,
}

function clampIF(v: number): number {
  return Math.min(IF_MAX, Math.max(IF_MIN, v))
}

function sportFamily(sportType: string): string {
  const s = sportType.toLowerCase()
  if (s.includes('run') || s.includes('trail')) return 'run'
  if (s.includes('ride') || s.includes('bike') || s.includes('cycle') || s.includes('virtual')) return 'bike'
  if (s.includes('swim')) return 'swim'
  if (s.includes('weight') || s.includes('strength')) return 'strength'
  if (s.includes('ski') || s.includes('snowboard')) return 'ski'
  if (s.includes('walk') || s.includes('hike')) return 'walk'
  if (s.includes('yoga') || s.includes('pilates') || s.includes('stretch')) return 'yoga'
  return 'other'
}

function looksLikeYoga(name: string | null | undefined, sportType: string): boolean {
  const text = `${name ?? ''} ${sportType}`.toLowerCase()
  return /\byoga\b|\bmobility\b|\bpilates\b|\bstretch/.test(text)
}

function looksHard(name: string | null | undefined): boolean {
  const t = (name ?? '').toLowerCase()
  return /interval|vo2|tempo|threshold|sweet.?spot|race|ftp|anaerobic|sprint|hill repeat/.test(t)
}

/** Default IF when no better signal exists. */
export function defaultIntensityFactor(sportType: string, name?: string | null): number {
  if (looksLikeYoga(name, sportType)) return 0.4
  const fam = sportFamily(sportType)
  const hard = looksHard(name)
  switch (fam) {
    case 'strength':
      return hard ? 0.65 : 0.55
    case 'yoga':
      return 0.4
    case 'run':
      return hard ? 0.88 : sportType.toLowerCase().includes('trail') ? 0.72 : 0.7
    case 'bike':
      return hard ? 0.88 : sportType.toLowerCase().includes('mountain') ? 0.72 : 0.7
    case 'swim':
      return hard ? 0.85 : 0.65
    case 'ski':
      return hard ? 0.8 : 0.7
    default:
      return hard ? 0.75 : 0.65
  }
}

/** RPE 1–10 → IF. */
export function intensityFromRpe(rpe: number): number {
  const table: Record<number, number> = {
    1: 0.4, 2: 0.45, 3: 0.5, 4: 0.55, 5: 0.65,
    6: 0.75, 7: 0.85, 8: 0.95, 9: 1.05, 10: 1.15,
  }
  const rounded = Math.round(Math.min(10, Math.max(1, rpe)))
  return table[rounded] ?? 0.7
}

export function isFlatEnough(distanceM: number | null | undefined, elevationM: number | null | undefined): boolean {
  if (distanceM == null || distanceM < 500) return false
  if (elevationM == null || elevationM < 0) return true
  const km = distanceM / 1000
  return elevationM / km <= FLAT_MAX_M_PER_KM
}

export function loadFromIntensity(movingTimeSec: number, intensityFactor: number): number {
  if (movingTimeSec <= 0 || intensityFactor <= 0) return 0
  const hours = movingTimeSec / 3600
  return Math.max(1, Math.round(hours * intensityFactor * intensityFactor * 100))
}

/**
 * Parse threshold pace text into seconds per kilometer.
 * Accepts "5:30", "5:30/km", "8:51/mi", "330".
 */
export function parseThresholdPace(raw: string | null | undefined): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (!s) return null

  const asNum = Number(s)
  if (Number.isFinite(asNum) && asNum > 60 && asNum < 1200) return Math.round(asNum)

  const mi = /\/\s*mi|per\s*mi|min\/mi/.test(s)
  const m = s.match(/(\d+)\s*[:']\s*(\d{1,2})/)
  if (m) {
    const sec = Number(m[1]) * 60 + Number(m[2])
    if (sec < 60 || sec > 1200) return null
    return mi ? Math.round(sec / 1.609344) : sec
  }
  return null
}

export function formatThresholdPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !(secPerKm > 0)) return ''
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function computeLoad(input: LoadInput, phys: AthletePhysiology = DEFAULT_PHYSIOLOGY): LoadResult {
  if (!countsTowardLoad(input.sportType)) {
    return { load: 0, source: 'default', intensityFactor: null }
  }
  if (input.movingTimeSec <= 0) {
    return { load: 0, source: 'default', intensityFactor: null }
  }

  const tss = input.tss
  if (tss != null && Number.isFinite(tss) && tss > 0) {
    return { load: Math.round(tss), source: 'tss', intensityFactor: null }
  }

  const fam = sportFamily(input.sportType)
  const ftp = phys.ftp && phys.ftp > 0 ? phys.ftp : null
  const lthr = phys.lthr && phys.lthr > 0 ? phys.lthr : null
  const thrPace = phys.thresholdPaceSecPerKm && phys.thresholdPaceSecPerKm > 0
    ? phys.thresholdPaceSecPerKm
    : null

  // 1) Power (bike family)
  if (fam === 'bike' && ftp && input.watts != null && input.watts > 0) {
    const intensityFactor = clampIF(input.watts / ftp)
    return { load: loadFromIntensity(input.movingTimeSec, intensityFactor), source: 'power', intensityFactor }
  }

  // 2) Heart rate — preferred for runs (esp. hills/trails) and as bike fallback
  if (lthr && input.averageHeartrate != null && input.averageHeartrate > 0) {
    const intensityFactor = clampIF(input.averageHeartrate / lthr)
    return { load: loadFromIntensity(input.movingTimeSec, intensityFactor), source: 'hr', intensityFactor }
  }

  // 3) Flat-run pace only (skip hills/trails)
  if (
    fam === 'run' &&
    thrPace &&
    input.distanceM != null &&
    input.distanceM > 0 &&
    isFlatEnough(input.distanceM, input.elevationM)
  ) {
    const paceSecPerKm = input.movingTimeSec / (input.distanceM / 1000)
    if (paceSecPerKm > 0) {
      const intensityFactor = clampIF(thrPace / paceSecPerKm)
      return { load: loadFromIntensity(input.movingTimeSec, intensityFactor), source: 'pace', intensityFactor }
    }
  }

  // 4) RPE
  if (input.perceivedExertion != null && input.perceivedExertion > 0) {
    const intensityFactor = clampIF(intensityFromRpe(input.perceivedExertion))
    return { load: loadFromIntensity(input.movingTimeSec, intensityFactor), source: 'rpe', intensityFactor }
  }

  // 5) Sport default
  const intensityFactor = clampIF(defaultIntensityFactor(input.sportType, input.name))
  return { load: loadFromIntensity(input.movingTimeSec, intensityFactor), source: 'default', intensityFactor }
}
