/**
 * Verify tracker Supabase connection and schema.
 * Usage: npm run verify-supabase
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

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
    if (!process.env[key]) process.env[key] = val
  }
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')

  const supabase = createClient(url, key)
  const tables = ['athlete', 'activities', 'settings', 'planned_workouts', 'races', 'feel', 'daily_load'] as const

  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(1)
    if (error) throw new Error(`Table "${table}": ${error.message}`)
  }

  const { data: athlete } = await supabase.from('athlete').select('name').limit(1).single()
  const { data: settings } = await supabase.from('settings').select('framework').eq('id', 1).single()
  const { count } = await supabase.from('activities').select('*', { count: 'exact', head: true })

  console.log('OK — Supabase connected')
  console.log(`  athlete: ${athlete?.name ?? '(none)'}`)
  console.log(`  framework: week ${settings?.framework?.weekHoursMin}–${settings?.framework?.weekHoursMax}h`)
  console.log(`  activities: ${count ?? 0} rows`)
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
