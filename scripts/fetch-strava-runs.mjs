/**
 * Fetch recent Strava runs and write demo/strava-runs.json.
 * Usage: CHILLI_JOURNAL_DIR=/path/to/chilli-journal npm run fetch-strava-runs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
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
    if (!process.env[key]) process.env[key] = val
  }
}

async function getToken() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  const supabase = createClient(url, key)
  const { data, error } = await supabase.from('strava_tokens').select('*').eq('id', 1).single()
  if (error || !data) throw new Error('No Strava tokens in journal Supabase')

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
    return refreshed.access_token
  }
  return data.access_token
}

async function main() {
  const cj = process.env.CHILLI_JOURNAL_DIR
  if (!cj) throw new Error('Set CHILLI_JOURNAL_DIR to your chilli-journal repo path')
  loadEnv(join(cj, '.env.local'))

  const token = await getToken()
  const after = Math.floor(new Date(process.env.STRAVA_AFTER || '2026-01-01T00:00:00-08:00').getTime() / 1000)
  const runs = []
  for (let page = 1; page <= 20; page++) {
    const resp = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!resp.ok) throw new Error(`Strava list failed: ${resp.status}`)
    const acts = await resp.json()
    if (!acts.length) break
    for (const a of acts) {
      if (!['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type || a.type || '')) continue
      runs.push({
        id: a.id,
        name: a.name,
        sport_type: a.sport_type || a.type,
        start_date_local: a.start_date_local,
        moving_time: a.moving_time,
        distance: a.distance,
        total_elevation_gain: a.total_elevation_gain,
        suffer_score: a.suffer_score,
        perceived_exertion: a.perceived_exertion,
      })
    }
    if (acts.length < 100) break
    await new Promise((r) => setTimeout(r, 150))
  }

  const outDir = join(process.cwd(), 'demo')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'strava-runs.json')
  writeFileSync(outPath, JSON.stringify({ fetched_at: new Date().toISOString(), runs }, null, 2))
  console.log(`Wrote ${runs.length} runs to ${outPath}`)
  for (const r of runs) {
    const mi = r.distance / 1609.34
    const ft = Math.round((r.total_elevation_gain || 0) * 3.28084)
    console.log(`${String(r.start_date_local).slice(0, 10)} | ${r.name} | ${mi.toFixed(2)} mi | ${ft} ft | RE ${r.suffer_score}`)
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
