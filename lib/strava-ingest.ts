import { classifyActual } from './classify'
import type { AthletePhysiology } from './compute-load'
import { DEFAULT_PHYSIOLOGY, computeLoad } from './compute-load'
import { stravaLocalDate } from './dates'
import { countsTowardLoad } from './excluded-sports'
import { parseFramework } from './framework'
import type { Framework, StravaActivityPayload } from './types'

export function mapStravaToActivity(
  raw: StravaActivityPayload,
  framework: Framework = parseFramework(null),
  phys: AthletePhysiology = DEFAULT_PHYSIOLOGY,
) {
  const sportType = raw.sport_type || raw.type || 'Other'
  const name = raw.name ?? ''
  const movingTime = raw.moving_time ?? 0
  const relativeEffort = raw.suffer_score ?? null
  const countTowardLoad = countsTowardLoad(sportType)
  const distance = raw.distance ?? null
  const elevation = raw.total_elevation_gain ?? null
  const watts = raw.weighted_average_watts ?? raw.average_watts ?? null
  const averageHeartrate = raw.average_heartrate ?? null
  const perceivedExertion = raw.perceived_exertion ?? null

  const { load, source, intensityFactor } = countTowardLoad
    ? computeLoad({
      sportType,
      name,
      movingTimeSec: movingTime,
      distanceM: distance,
      elevationM: elevation,
      watts,
      averageHeartrate,
      perceivedExertion,
    }, phys)
    : { load: 0, source: 'default' as const, intensityFactor: null }

  const localDate = stravaLocalDate(raw)
  const startLocal = raw.start_date_local || raw.start_date
  if (!startLocal) throw new Error('Activity missing start date')
  return {
    id: raw.id, sport_type: sportType, start_local: startLocal, local_date: localDate, moving_time: movingTime,
    distance, elevation,
    relative_effort: relativeEffort, load, category: classifyActual(sportType, name, raw.description, movingTime, framework),
    category_override: null, count_toward_load: countTowardLoad,
    perceived_exertion: perceivedExertion, name, description: raw.description ?? null,
    raw: {
      ...raw,
      load_source: source,
      load_if: intensityFactor,
    },
    updated_at: new Date().toISOString(),
  }
}
