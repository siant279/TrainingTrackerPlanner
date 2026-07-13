import { isExcludedSport } from './excluded-sports'
import { ingestStravaActivity } from './ingest-service'
import type { StravaActivityPayload } from './types'

const STRAVA_BASE = (process.env.STRAVA_API_BASE_URL?.trim() || 'https://www.strava.com/api/v3').replace(/\/$/, '')
const DEFAULT_JOURNAL_URL = 'https://chilli-journal.vercel.app'

export type SyncRecentResult = {
  synced: number
  activities: { id: number; name: string | null; matched: string | null }[]
}

async function getStravaAccessToken(): Promise<string> {
  const secret = process.env.JOURNAL_INTERNAL_SECRET
  if (!secret) throw new Error('Missing JOURNAL_INTERNAL_SECRET')

  const journalUrl = (process.env.CHILLI_JOURNAL_URL?.trim() || DEFAULT_JOURNAL_URL).replace(/\/$/, '')
  const resp = await fetch(`${journalUrl}/api/internal/strava-token`, {
    headers: { 'x-internal-secret': secret },
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Journal token API failed: ${resp.status} ${text.slice(0, 120)}`)
  }
  const data = await resp.json() as { access_token?: string }
  if (!data.access_token) throw new Error('Journal token API returned no access_token')
  return data.access_token
}

async function fetchActivityDetail(token: string, id: number): Promise<StravaActivityPayload> {
  const resp = await fetch(`${STRAVA_BASE}/activities/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Activity ${id} fetch failed: ${resp.status}`)
  return resp.json()
}

/** Pull recent Strava training activities into the tracker via chilli-journal token API. */
export async function syncRecentFromStrava(opts: {
  days?: number
  activityId?: number | null
} = {}): Promise<SyncRecentResult> {
  const days = opts.days ?? 3
  const activityId = opts.activityId ?? null
  const token = await getStravaAccessToken()

  const toSync: StravaActivityPayload[] = []

  if (activityId) {
    toSync.push(await fetchActivityDetail(token, activityId))
  } else {
    const after = Math.floor((Date.now() - days * 86400000) / 1000)
    for (let page = 1; page <= 5; page++) {
      const resp = await fetch(
        `${STRAVA_BASE}/athlete/activities?after=${after}&per_page=50&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error(`Strava list failed: ${resp.status}`)
      const summaries = await resp.json() as StravaActivityPayload[]
      if (!summaries.length) break
      for (const summary of summaries) {
        const sport = summary.sport_type || summary.type || ''
        if (isExcludedSport(sport)) continue
        toSync.push(await fetchActivityDetail(token, summary.id))
      }
      if (summaries.length < 50) break
    }
  }

  const activities: SyncRecentResult['activities'] = []
  for (const activity of toSync) {
    const result = await ingestStravaActivity(activity, 'create')
    activities.push({
      id: activity.id,
      name: activity.name ?? null,
      matched: result.matched ?? null,
    })
  }

  return { synced: activities.length, activities }
}
