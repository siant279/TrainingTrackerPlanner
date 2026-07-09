/**
 * Match existing activities to open planned workouts (e.g. after manual ingest).
 * Usage: npm run match-planned
 *        npm run match-planned -- --activity 19247355889
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { effectiveCategory } from '../lib/classify'
import { activityDateKey } from '../lib/dates'
import { findBestPlannedMatch } from '../lib/match-planned'
import type { Activity, ActivityCategory } from '../lib/types'

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

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase vars in .env.local')

  const activityArg = process.argv.find((a) => a.startsWith('--activity='))?.split('=')[1]
    ?? (process.argv.includes('--activity') ? process.argv[process.argv.indexOf('--activity') + 1] : undefined)

  const supabase = createClient(url, key)
  let query = supabase.from('activities').select('*').eq('count_toward_load', true).order('start_local', { ascending: false })
  if (activityArg) query = query.eq('id', Number(activityArg))

  const { data: activities, error } = await query.limit(activityArg ? 1 : 500)
  if (error) throw error
  if (!activities?.length) {
    console.log('No activities to match')
    return
  }

  const { data: planned } = await supabase.from('planned_workouts').select('*').eq('status', 'planned')
  let matched = 0

  for (const row of activities as Activity[]) {
    const activityDate = activityDateKey(row)
    const category = effectiveCategory(row.category as ActivityCategory, row.category_override as ActivityCategory | null)
    const match = findBestPlannedMatch(planned ?? [], activityDate, row.sport_type, category)
    if (!match) continue
    const { error: upErr } = await supabase.from('planned_workouts').update({
      status: 'completed',
      matched_activity_id: row.id,
    }).eq('id', match.id)
    if (upErr) throw upErr
    matched++
    console.log(`Matched planned ${match.id} → activity ${row.id} (${row.name ?? row.sport_type})`)
    const idx = (planned ?? []).findIndex((p) => p.id === match.id)
    if (idx >= 0) planned!.splice(idx, 1)
  }

  console.log(`Done — ${matched} planned workout(s) marked completed`)
}

main().catch((e) => { console.error('Match failed:', e.message); process.exit(1) })
