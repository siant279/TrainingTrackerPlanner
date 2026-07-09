import type { ActivityCategory, Framework, PlannedType } from './types'

export const INTERVAL_RE = /interval|tempo|threshold|sprint|repeat|fartlek|vo2|track|hill|workout|under.?over|strides?|\d+\s?x|×/i
const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun']
const RIDE_TYPES = ['Ride', 'GravelRide', 'MountainBikeRide', 'VirtualRide', 'EBikeRide']

export function isRunSport(sport: string) { return RUN_TYPES.includes(sport) }
export function isRideSport(sport: string) { return RIDE_TYPES.includes(sport) }

export function classifyActual(sport: string, name: string, description: string | null | undefined, movingTimeSec: number, fw: { longRunMinSec: number; longRideMinSec: number }): ActivityCategory {
  if (sport === 'WeightTraining') return 'strength'
  const interval = INTERVAL_RE.test(`${name} ${description ?? ''}`)
  if (isRunSport(sport)) return interval ? 'intervalRun' : movingTimeSec >= fw.longRunMinSec ? 'longRun' : 'other'
  if (isRideSport(sport)) return interval ? 'intervalRide' : movingTimeSec >= fw.longRideMinSec ? 'longRide' : 'other'
  return 'other'
}

export function classifyPlanned(sport: string, type: PlannedType): ActivityCategory {
  if (sport === 'WeightTraining') return 'strength'
  if (isRunSport(sport)) return type === 'Interval' ? 'intervalRun' : type === 'Long' ? 'longRun' : 'other'
  if (isRideSport(sport)) return type === 'Interval' ? 'intervalRide' : type === 'Long' ? 'longRide' : 'other'
  return 'other'
}

export function effectiveCategory(auto: ActivityCategory | null, override: ActivityCategory | null | undefined): ActivityCategory {
  return override ?? auto ?? 'other'
}

export const CAT_TAG: Partial<Record<ActivityCategory, string>> = {
  strength: 'strength', longRun: 'long', longRide: 'long', intervalRun: 'interval', intervalRide: 'interval',
}

export const TARGET_KEYS = ['strength', 'longRun', 'longRide', 'intervalRun', 'intervalRide'] as const
export type TargetKey = typeof TARGET_KEYS[number]

export function targetMin(fw: Framework, key: TargetKey): number {
  const t = fw.targets[key]
  return typeof t === 'number' ? t : t.min
}
