/**
 * Recompute activities.load with house Load (hours × IF² × 100).
 * TP rows with TSS pass through; Strava rows use power/HR/pace/RPE/default.
 *
 * Usage: npm run backfill-load
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { getAthletePhysiology } from '../lib/athlete-physiology'
import { computeLoad, type AthletePhysiology } from '../lib/compute-load'
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
    if (!process.env[key]) process.env[key] = val
  }
}

type ActRow = {
  id: number
  sport_type: string
  name: string | null
  moving_time: number
  distance: number | null
  elevation: number | null
  load: number
  perceived_exertion: number | null
  count_toward_load: boolean
  raw: Record<string, unknown> | null
}

function recomputeActivity(act: ActRow, phys: AthletePhysiology) {
  const raw = (act.raw && typeof act.raw === 'object' ? act.raw : {}) as Record<string, unknown>
  const isTp = act.id < 0 || String(raw.import_source || '').startsWith('trainingpeaks')

  let tss: number | null = null
  if (isTp) {
    const fromRaw = Number(raw.tss)
    if (Number.isFinite(fromRaw) && fromRaw > 0) tss = fromRaw
    else if (raw.import_source === 'trainingpeaks-fit' && act.load > 0) tss = act.load
  }

  const result = computeLoad({
    sportType: act.sport_type,
    name: act.name,
    movingTimeSec: act.moving_time,
    distanceM: act.distance,
    elevationM: act.elevation,
    watts: (raw.weighted_average_watts as number | undefined) ?? (raw.average_watts as number | undefined) ?? null,
    averageHeartrate: (raw.average_heartrate as number | undefined) ?? null,
    perceivedExertion: act.perceived_exertion,
    tss,
  }, phys)

  if (!act.count_toward_load) {
    return { load: 0, source: result.source, intensityFactor: result.intensityFactor, raw }
  }
  return { load: result.load, source: result.source, intensityFactor: result.intensityFactor, raw }
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase vars in .env.local')

  const supabase = createClient(url, key)
  const phys = await getAthletePhysiology(supabase)
  console.log('Physiology:', {
    ftp: phys.ftp,
    thresholdPaceSecPerKm: phys.thresholdPaceSecPerKm,
    lthr: phys.lthr,
  })
  if (!phys.ftp && !phys.lthr && !phys.thresholdPaceSecPerKm) {
    console.log('Note: no FTP/LTHR/threshold pace set — Strava rows will use RPE/defaults. Set them in Settings for better Load.')
  }

  const pageSize = 500
  let from = 0
  let updated = 0
  let unchanged = 0
  const bySource: Record<string, number> = {}

  while (true) {
    const { data, error } = await supabase
      .from('activities')
      .select('id,sport_type,name,moving_time,distance,elevation,load,perceived_exertion,count_toward_load,raw')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break

    for (const act of data as ActRow[]) {
      const next = recomputeActivity(act, phys)
      bySource[next.source] = (bySource[next.source] ?? 0) + 1
      const raw = {
        ...next.raw,
        load_source: next.source,
        load_if: next.intensityFactor,
      }
      if (next.load === act.load && act.raw && (act.raw as { load_source?: string }).load_source === next.source) {
        unchanged++
        continue
      }
      const { error: upErr } = await supabase
        .from('activities')
        .update({ load: next.load, raw, updated_at: new Date().toISOString() })
        .eq('id', act.id)
      if (upErr) throw new Error(`Update ${act.id}: ${upErr.message}`)
      updated++
    }

    console.log(`  …scanned ${from + data.length} (updated ${updated})`)
    if (data.length < pageSize) break
    from += pageSize
  }

  console.log('Sources:', bySource)
  console.log(`Updated ${updated} rows (${unchanged} already current)`)
  console.log('Recomputing daily_load…')
  await recomputeDailyLoadTable(supabase)
  const { count } = await supabase.from('daily_load').select('*', { count: 'exact', head: true })
  console.log(`Done — daily_load rows: ${count ?? 0}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
