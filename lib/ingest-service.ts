import { effectiveCategory } from './classify'
import { activityDateKey } from './dates'
import { getFramework } from './framework'
import { findBestPlannedMatch } from './match-planned'
import { getSupabaseAdmin } from './supabase'
import { mapStravaToActivity } from './strava-ingest'
import type { ActivityCategory, StravaActivityPayload } from './types'

export async function ingestStravaActivity(raw: StravaActivityPayload, aspect: 'create' | 'update' | 'delete' = 'create') {
  const supabase = getSupabaseAdmin()
  const id = raw.id
  if (aspect === 'delete') {
    await supabase.from('activities').delete().eq('id', id)
    await supabase.from('planned_workouts').update({ status: 'planned', matched_activity_id: null }).eq('matched_activity_id', id)
    return { ok: true, deleted: id }
  }
  const framework = await getFramework(supabase)
  const row = mapStravaToActivity(raw, framework)
  const { error } = await supabase.from('activities').upsert(row)
  if (error) throw error

  const activityDate = activityDateKey(row)
  const category = effectiveCategory(row.category as ActivityCategory, row.category_override as ActivityCategory | null)
  const { data: planned } = await supabase.from('planned_workouts').select('*').eq('status', 'planned')
  const match = findBestPlannedMatch(planned ?? [], activityDate, row.sport_type, category)
  if (match) {
    await supabase.from('planned_workouts').update({ status: 'completed', matched_activity_id: id }).eq('id', match.id)
  }
  return { ok: true, id, matched: match?.id ?? null }
}
