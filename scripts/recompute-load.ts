/**
 * Populate daily_load from activities (Base/Tiredness/Restedness cache).
 * Usage: npm run recompute-load
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { recomputeDailyLoadTable } from '../lib/load'

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

  const supabase = createClient(url, key)
  await recomputeDailyLoadTable(supabase)
  const { count } = await supabase.from('daily_load').select('*', { count: 'exact', head: true })
  console.log(`Done — ${count ?? 0} daily_load rows`)
}

main().catch((e) => { console.error('Recompute failed:', e.message); process.exit(1) })
