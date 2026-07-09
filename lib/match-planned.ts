import { classifyPlanned } from './classify'
import type { ActivityCategory, PlannedType } from './types'

export function findBestPlannedMatch(
  planned: { id: string; date: string; sport: string; type: string; status: string }[],
  activityDate: string, sportType: string, activityCategory: ActivityCategory,
) {
  return planned.find((p) => p.date === activityDate && p.status === 'planned' && p.sport === sportType && classifyPlanned(p.sport, p.type as PlannedType) === activityCategory) ?? null
}
