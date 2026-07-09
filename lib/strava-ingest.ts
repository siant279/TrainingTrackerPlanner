import { classifyActual } from './classify'
import { stravaLocalDate } from './dates'
import { countsTowardLoad } from './excluded-sports'
import { parseFramework } from './framework'
import type { Framework, StravaActivityPayload } from './types'

export function mapStravaToActivity(raw: StravaActivityPayload, framework: Framework = parseFramework(null)) {
  const sportType = raw.sport_type || raw.type || 'Other'
  const name = raw.name ?? ''
  const movingTime = raw.moving_time ?? 0
  const relativeEffort = raw.suffer_score ?? null
  const countTowardLoad = countsTowardLoad(sportType)
  const load = countTowardLoad && relativeEffort ? relativeEffort : 0
  const localDate = stravaLocalDate(raw)
  const startLocal = raw.start_date_local || raw.start_date
  if (!startLocal) throw new Error('Activity missing start date')
  return {
    id: raw.id, sport_type: sportType, start_local: startLocal, local_date: localDate, moving_time: movingTime,
    distance: raw.distance ?? null, elevation: raw.total_elevation_gain ?? null,
    relative_effort: relativeEffort, load, category: classifyActual(sportType, name, raw.description, movingTime, framework),
    category_override: null, count_toward_load: countTowardLoad,
    perceived_exertion: raw.perceived_exertion ?? null, name, description: raw.description ?? null,
    raw, updated_at: new Date().toISOString(),
  }
}
