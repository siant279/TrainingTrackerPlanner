/**
 * Backfill Strava activities into tracker Supabase.
 * Uses chilli-journal's stored Strava token (no journal deploy required).
 *
 * Usage:
 *   CHILLI_JOURNAL_DIR=/path/to/chilli-journal npm run backfill-strava
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { resolveChilliJournalDir } from '../lib/chilli-journal-path'
import { isExcludedSport } from '../lib/excluded-sports'
import { parseFramework } from '../lib/framework'
import { mapStravaToActivity } from '../lib/strava-ingest'
import type { Framework, StravaActivityPayload } from '../lib/types'

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

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

async function getJournalToken(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const { data, error } = await supabase.from('strava_tokens').select('*').eq('id', 1).single()
  if (error || !data) throw new Error('No Strava tokens in journal Supabase — connect Strava in chilli-journal first')

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
    await supabase.from('strava_tokens').upsert({
      id: 1,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      updated_at: new Date().toISOString(),
    })
    return refreshed.access_token as string
  }
  return data.access_token as string
}

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const resp = await fetch(url, init)
    if (resp.status !== 429) return resp
    const retryAfter = Number(resp.headers.get('retry-after') || 0)
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 5_000 * 2 ** attempt)
    console.log(`  Rate limited (${label}) — waiting ${Math.round(waitMs / 1000)}s…`)
    await sleep(waitMs)
  }
  throw new Error(`${label} failed after retries: 429`)
}

async function fetchActivityDetail(token: string, id: number): Promise<StravaActivityPayload> {
  const resp = await fetchWithRetry(
    `${STRAVA_BASE}/activities/${id}`,
    { headers: { Authorization: `Bearer ${token}` } },
    `Activity ${id}`,
  )
  if (!resp.ok) throw new Error(`Activity ${id} fetch failed: ${resp.status}`)
  return resp.json()
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  const trackerUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const trackerKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!trackerUrl || !trackerKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  const cj = resolveChilliJournalDir()
  console.log(`Using chilli-journal at: ${cj}`)
  loadEnv(join(cj, '.env.local'))

  const journalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const journalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stravaClientId = process.env.STRAVA_CLIENT_ID
  const stravaClientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!journalUrl || !journalKey || !stravaClientId || !stravaClientSecret) {
    throw new Error('Missing journal Supabase or Strava OAuth vars in chilli-journal .env.local')
  }

  const tracker = createClient(trackerUrl, trackerKey)
  const journal = createClient(journalUrl, journalKey)
  const { data: settingsRow } = await tracker.from('settings').select('framework').eq('id', 1).single()
  const framework = parseFramework(settingsRow?.framework) as Framework

  const token = await getJournalToken(journal, stravaClientId, stravaClientSecret)
  console.log('Strava token OK — fetching activities…')

  let page = 1
  let imported = 0
  let skipped = 0

  while (page <= 100) {
    const params = new URLSearchParams({ per_page: '100', page: String(page) })
    const resp = await fetchWithRetry(
      `${STRAVA_BASE}/athlete/activities?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
      `list page ${page}`,
    )
    if (!resp.ok) throw new Error(`Strava list page ${page} failed: ${resp.status}`)
    const summaries = await resp.json() as StravaActivityPayload[]
    if (!summaries.length) break

    for (const summary of summaries) {
      const sport = summary.sport_type || summary.type || ''
      if (isExcludedSport(sport)) { skipped++; continue }

      const detail = await fetchActivityDetail(token, summary.id)
      const row = mapStravaToActivity(detail, framework)
      const { error } = await tracker.from('activities').upsert(row)
      if (error) throw new Error(`Upsert ${summary.id}: ${error.message}`)
      imported++
      if (imported % 25 === 0) console.log(`  …${imported} imported`)
      await sleep(250)
    }

    if (summaries.length < 100) break
    page++
    await sleep(200)
  }

  console.log(`Done — ${imported} activities imported, ${skipped} excluded (walk/e-bike)`)
}

main().catch((e) => { console.error('Backfill failed:', e.message); process.exit(1) })
