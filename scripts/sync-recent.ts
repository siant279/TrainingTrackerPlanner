/**
 * Pull recent Strava activities into the tracker (bypasses webhook).
 * Usage: npm run sync-recent
 *        npm run sync-recent -- --days 3
 *        npm run sync-recent -- --activity 12345678
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { resolveChilliJournalDir } from '../lib/chilli-journal-path'
import { isExcludedSport } from '../lib/excluded-sports'
import { ingestStravaActivity } from '../lib/ingest-service'
import type { StravaActivityPayload } from '../lib/types'

const STRAVA_BASE = (process.env.STRAVA_API_BASE_URL?.trim() || 'https://www.strava.com/api/v3').replace(/\/$/, '')

function loadEnv(path: string) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

function parseArgs() {
  const daysArg = process.argv.find((a) => a.startsWith('--days='))?.split('=')[1]
    ?? (process.argv.includes('--days') ? process.argv[process.argv.indexOf('--days') + 1] : undefined)
  const activityArg = process.argv.find((a) => a.startsWith('--activity='))?.split('=')[1]
    ?? (process.argv.includes('--activity') ? process.argv[process.argv.indexOf('--activity') + 1] : undefined)
  return {
    days: daysArg ? Number(daysArg) : 2,
    activityId: activityArg ? Number(activityArg) : null,
  }
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  const trackerUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const trackerKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!trackerUrl || !trackerKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  const { days, activityId } = parseArgs()

  const cj = resolveChilliJournalDir()
  console.log(`Using chilli-journal at: ${cj}`)
  const cjEnv = readFileSync(join(cj, '.env.local'), 'utf8')
  const cjVars: Record<string, string> = {}
  for (const line of cjEnv.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    cjVars[key] = val
  }
  const clientId = cjVars.STRAVA_CLIENT_ID
  const clientSecret = cjVars.STRAVA_CLIENT_SECRET
  const journalUrl = cjVars.NEXT_PUBLIC_SUPABASE_URL
  const journalKey = cjVars.SUPABASE_SERVICE_ROLE_KEY
  if (!clientId || !clientSecret || !journalUrl || !journalKey) {
    throw new Error('Missing Strava or Supabase vars in chilli-journal .env.local')
  }

  const journal = createClient(journalUrl, journalKey)
  const { data, error } = await journal.from('strava_tokens').select('*').eq('id', 1).single()
  if (error || !data) throw new Error('No Strava tokens in journal — connect Strava in chilli-journal first')

  let token = data.access_token as string
  if (data.expires_at * 1000 < Date.now() + 5 * 60 * 1000) {
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: data.refresh_token,
      }),
    })
    if (!resp.ok) throw new Error(`Strava refresh failed: ${resp.status}`)
    const refreshed = await resp.json()
    await journal.from('strava_tokens').upsert({
      id: 1,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    })
    token = refreshed.access_token
  }
  console.log('Strava token OK')

  async function fetchActivityDetail(id: number): Promise<StravaActivityPayload> {
    const resp = await fetch(`${STRAVA_BASE}/activities/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) throw new Error(`Activity ${id} fetch failed: ${resp.status}`)
    return resp.json()
  }

  const toSync: StravaActivityPayload[] = []

  if (activityId) {
    toSync.push(await fetchActivityDetail(activityId))
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
        toSync.push(await fetchActivityDetail(summary.id))
      }
      if (summaries.length < 50) break
    }
  }

  if (!toSync.length) {
    console.log('No training activities to sync in the requested window')
    return
  }

  let synced = 0
  for (const activity of toSync) {
    const result = await ingestStravaActivity(activity, 'create')
    synced++
    console.log(`Synced ${activity.id} "${activity.name ?? activity.sport_type}"${result.matched ? ` (matched plan ${result.matched})` : ''}`)
  }
  console.log(`Done — ${synced} activit${synced === 1 ? 'y' : 'ies'} synced`)
}

main().catch((e) => { console.error('Sync failed:', e.message); process.exit(1) })
