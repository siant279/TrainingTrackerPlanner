import type { Framework } from './types'
export const DEFAULT_FRAMEWORK: Framework = {
  weekHoursMin: 7, weekHoursMax: 11,
  targets: { strength: { min: 2, max: 3 }, longRun: 1, longRide: 1, intervalRun: 1, intervalRide: 1 },
  longRunMinSec: 3600, longRideMinSec: 7200, dayStartMin: 300, dayEndMin: 1200,
}
export function parseFramework(raw: unknown): Framework {
  if (!raw || typeof raw !== 'object') return DEFAULT_FRAMEWORK
  const f = raw as Partial<Framework>
  return {
    weekHoursMin: f.weekHoursMin ?? 7, weekHoursMax: f.weekHoursMax ?? 11,
    targets: {
      strength: { min: f.targets?.strength?.min ?? 2, max: f.targets?.strength?.max ?? 3 },
      longRun: f.targets?.longRun ?? 1, longRide: f.targets?.longRide ?? 1,
      intervalRun: f.targets?.intervalRun ?? 1, intervalRide: f.targets?.intervalRide ?? 1,
    },
    longRunMinSec: f.longRunMinSec ?? 3600, longRideMinSec: f.longRideMinSec ?? 7200,
    dayStartMin: f.dayStartMin ?? 300, dayEndMin: f.dayEndMin ?? 1200,
  }
}
export async function getFramework(supabase: ReturnType<typeof import('./supabase').getSupabaseAdmin>) {
  const { data } = await supabase.from('settings').select('framework').eq('id', 1).single()
  return parseFramework(data?.framework)
}
