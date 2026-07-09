import { classifyPlanned, isRideSport, isRunSport } from './classify'
import type { ActivityCategory, PlannedType, PlannedWorkout } from './types'

export function sameSportFamily(plannedSport: string, actualSport: string): boolean {
  if (plannedSport === actualSport) return true
  if (isRunSport(plannedSport) && isRunSport(actualSport)) return true
  if (isRideSport(plannedSport) && isRideSport(actualSport)) return true
  return false
}

/** Match a synced activity to a planned workout on the same day and sport family. */
export function findBestPlannedMatch(
  planned: PlannedWorkout[],
  activityDate: string,
  sportType: string,
  activityCategory: ActivityCategory,
): PlannedWorkout | null {
  const candidates = planned.filter(
    (p) => p.date === activityDate && p.status === 'planned' && sameSportFamily(p.sport, sportType),
  )
  if (!candidates.length) return null

  const categoryMatch = candidates.find(
    (p) => classifyPlanned(p.sport, p.type as PlannedType) === activityCategory,
  )
  return categoryMatch ?? candidates[0]
}
