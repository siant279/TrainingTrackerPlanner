import { classifyActual, effectiveCategory } from './classify'
import { activityDateKey } from './dates'
import { findBestPlannedMatch } from './match-planned'
import type { Activity, Framework, PlannedWorkout } from './types'

export type DayEntry =
  | { kind: 'merged'; plan: PlannedWorkout; activity: Activity }
  | { kind: 'planned'; plan: PlannedWorkout }
  | { kind: 'actual'; activity: Activity }

/** Group planned + synced activities into merged or standalone day entries. */
export function buildDayEntries(
  plans: PlannedWorkout[],
  activities: Activity[],
  framework: Framework,
): DayEntry[] {
  const consumedPlans = new Set<string>()
  const consumedActs = new Set<number>()
  const entries: DayEntry[] = []

  for (const p of plans) {
    if (p.matched_activity_id == null) continue
    const a = activities.find((x) => x.id === p.matched_activity_id)
    if (a) {
      entries.push({ kind: 'merged', plan: p, activity: a })
      consumedActs.add(a.id)
    }
    consumedPlans.add(p.id)
  }

  const openPlans = plans.filter((p) => !consumedPlans.has(p.id) && p.status === 'planned')
  const openActs = activities.filter((a) => !consumedActs.has(a.id))

  for (const a of openActs) {
    const category = effectiveCategory(
      classifyActual(a.sport_type, a.name ?? '', a.description, a.moving_time, framework),
      a.category_override,
    )
    const match = findBestPlannedMatch(
      openPlans.filter((p) => !consumedPlans.has(p.id)),
      activityDateKey(a),
      a.sport_type,
      category,
    )
    if (!match) continue
    entries.push({ kind: 'merged', plan: match, activity: a })
    consumedPlans.add(match.id)
    consumedActs.add(a.id)
  }

  for (const p of plans) {
    if (!consumedPlans.has(p.id) && p.status === 'planned') {
      entries.push({ kind: 'planned', plan: p })
    }
  }
  for (const a of activities) {
    if (!consumedActs.has(a.id)) entries.push({ kind: 'actual', activity: a })
  }

  return entries
}
