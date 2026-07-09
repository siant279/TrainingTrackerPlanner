/**
 * Import TrainingPeaks history into tracker Supabase.
 *
 * Supports:
 *   - Workout Summary CSV / WorkoutExport zips (preferred — has TSS)
 *   - Workout File Export zips (.fit.gz)
 *
 * Usage:
 *   npm run import-trainingpeaks
 *   npm run import-trainingpeaks -- --replace-tp      # clear TP rows, reimport summaries
 *   npm run import-trainingpeaks -- --include-fit     # also parse FIT zips after CSV
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { gunzipSync } from 'zlib'
import { join } from 'path'
import AdmZip from 'adm-zip'
import FitParser from 'fit-file-parser'
import { createClient } from '@supabase/supabase-js'
import { parseFramework } from '../lib/framework'
import {
  buildActivityRow,
  coarseDedupKey,
  dedupKey,
  estimateLoadFromFit,
  formatLocalStart,
  localDateFromIso,
  mapFitSport,
  parseCsvLine,
  rowFromCsvRecord,
  stableTpId,
  type TpActivityRow,
} from '../lib/trainingpeaks-import'
import { isExcludedSport } from '../lib/excluded-sports'

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

const fitParser = new FitParser({ force: true, mode: 'cascade' })

function parseFit(buffer: Buffer): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    fitParser.parse(buffer, (error, data) => {
      if (error) reject(error)
      else resolve(data as Record<string, unknown>)
    })
  })
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

type SummarySource = { kind: 'csv'; path: string } | { kind: 'zip'; path: string }

function findSummarySources(dir: string): SummarySource[] {
  const out: SummarySource[] = []
  for (const ent of readdirSync(dir)) {
    const full = join(dir, ent)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...findSummarySources(full))
      continue
    }
    const lower = ent.toLowerCase()
    if (lower.endsWith('.csv')) out.push({ kind: 'csv', path: full })
    else if (lower.endsWith('.zip') && ent.includes('WorkoutExport')) out.push({ kind: 'zip', path: full })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function csvTextFromZip(zipPath: string): string {
  const zip = new AdmZip(zipPath)
  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.csv'))
  if (!entry) throw new Error(`No CSV in ${zipPath}`)
  return entry.getData().toString('utf8').replace(/^\uFEFF/, '')
}

async function importCsvText(
  text: string,
  label: string,
  framework: ReturnType<typeof parseFramework>,
  tz: string,
  seen: Set<string>,
  coarseSeen: Set<string>,
): Promise<number> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return 0

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  let imported = 0

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const record: Record<string, string> = {}
    headers.forEach((h, i) => { record[h] = cols[i] ?? '' })

    const row = rowFromCsvRecord(record, framework, tz)
    if (!row) continue
    const key = dedupKey(row.local_date, row.sport_type, row.moving_time, row.name)
    if (seen.has(key)) continue
    seen.add(key)
    coarseSeen.add(coarseDedupKey(row.local_date, row.sport_type, row.moving_time))
    imported++
    pending.push(row)
    await flushIfNeeded()
  }

  if (imported) console.log(`  ${label}: ${imported} workouts`)
  return imported
}

async function importSummarySources(
  sources: SummarySource[],
  framework: ReturnType<typeof parseFramework>,
  tz: string,
  seen: Set<string>,
  coarseSeen: Set<string>,
): Promise<number> {
  let total = 0
  for (const src of sources) {
    if (src.kind === 'csv') {
      const text = readFileSync(src.path, 'utf8').replace(/^\uFEFF/, '')
      total += await importCsvText(text, src.path.split('/').pop()!, framework, tz, seen, coarseSeen)
    } else {
      const text = csvTextFromZip(src.path)
      total += await importCsvText(text, src.path.split('/').pop()!, framework, tz, seen, coarseSeen)
    }
  }
  return total
}

function rowFromFit(
  data: Record<string, unknown>,
  entryName: string,
  framework: ReturnType<typeof parseFramework>,
  tz: string,
): TpActivityRow | null {
  const activity = data.activity as Record<string, unknown> | undefined
  const sessions = (activity?.sessions as Record<string, unknown>[] | undefined) ?? []
  const session = sessions[0]
  if (!session?.start_time) return null

  const sportType = mapFitSport(
    String(session.sport || (data.sports as { sport?: string }[] | undefined)?.[0]?.sport || ''),
    String(session.sub_sport || ''),
  )
  if (isExcludedSport(sportType)) return null

  const startUtc = String(session.start_time)
  const startLocal = formatLocalStart(startUtc, tz)
  const localDate = localDateFromIso(startUtc, tz)
  const movingTime = Math.round(Number(session.total_timer_time || session.total_moving_time || session.total_elapsed_time || 0))
  if (movingTime <= 0) return null

  const load = estimateLoadFromFit(session as { total_timer_time?: number; total_elapsed_time?: number; time_in_hr_zone?: number[] })
  const distance = Number(session.total_distance)
  const elevation = Number(session.total_ascent)
  const name = entryName.replace(/\.fit(\.gz)?$/i, '').replace(/_/g, ' ')

  const dedup = dedupKey(localDate, sportType, movingTime, name)
  const slimSession = {
    start_time: session.start_time,
    sport: session.sport,
    sub_sport: session.sub_sport,
    total_timer_time: session.total_timer_time,
    total_elapsed_time: session.total_elapsed_time,
    total_distance: session.total_distance,
    total_ascent: session.total_ascent,
    time_in_hr_zone: session.time_in_hr_zone,
    avg_heart_rate: session.avg_heart_rate,
  }
  return buildActivityRow({
    id: stableTpId(dedup),
    sportType,
    startLocal,
    localDate,
    movingTime,
    distance: Number.isFinite(distance) && distance > 0 ? distance : null,
    elevation: Number.isFinite(elevation) && elevation > 0 ? elevation : null,
    load,
    name,
    source: 'trainingpeaks-fit',
    raw: { fit_file: entryName, session: slimSession },
  }, framework)
}

const BATCH = 40
const pending: TpActivityRow[] = []
let upserted = 0

async function upsertBatch(batch: TpActivityRow[]) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from('activities').upsert(batch)
    if (!error) return
    const msg = error.message || ''
    const transient = msg.includes('<!DOCTYPE') || msg.includes('520') || msg.includes('502') || msg.includes('503')
    if (!transient || attempt === 5) throw new Error(`Upsert failed: ${msg.slice(0, 200)}`)
    const waitMs = 2000 * 2 ** attempt
    console.log(`  Supabase error — retrying in ${waitMs / 1000}s…`)
    await new Promise((r) => setTimeout(r, waitMs))
  }
}

async function flushAll() {
  while (pending.length) {
    const batch = pending.splice(0, BATCH)
    await upsertBatch(batch)
    upserted += batch.length
    if (upserted % 300 === 0) console.log(`  …${upserted} upserted`)
  }
}

async function flushIfNeeded() {
  if (!pending.length || pending.length < BATCH) return
  const batch = pending.splice(0, BATCH)
  await upsertBatch(batch)
  upserted += batch.length
  if (upserted % 300 === 0) console.log(`  …${upserted} upserted`)
}

let supabase: ReturnType<typeof createClient>

async function importFitZips(
  dir: string,
  framework: ReturnType<typeof parseFramework>,
  tz: string,
  seen: Set<string>,
  coarseSeen: Set<string>,
) {
  const zips = readdirSync(dir).filter((f) => f.endsWith('.zip') && f.includes('WorkoutFileExport')).sort()
  let parsed = 0
  let skipped = 0

  for (const zipName of zips) {
    console.log(`Processing ${zipName}…`)
    const zip = new AdmZip(join(dir, zipName))
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const name = entry.entryName
      const lower = name.toLowerCase()
      if (!lower.endsWith('.fit.gz') && !lower.endsWith('.fit')) {
        skipped++
        continue
      }

      let buf: Buffer
      try {
        buf = entry.getData()
        if (lower.endsWith('.gz')) buf = gunzipSync(buf)
      } catch {
        skipped++
        continue
      }

      try {
        const data = await parseFit(buf)
        const row = rowFromFit(data, name, framework, tz)
        if (!row) { skipped++; continue }
        const coarse = coarseDedupKey(row.local_date, row.sport_type, row.moving_time)
        if (coarseSeen.has(coarse)) { skipped++; continue }
        const key = dedupKey(row.local_date, row.sport_type, row.moving_time, row.name)
        if (seen.has(key)) { skipped++; continue }
        seen.add(key)
        coarseSeen.add(coarse)
        pending.push(row)
        parsed++
        await flushIfNeeded()
      } catch {
        skipped++
      }
    }
  }

  await flushAll()
  console.log(`FIT import: ${parsed} workouts (${skipped} skipped/duplicate/unparseable)`)
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  const replaceTp = process.argv.includes('--replace-tp')
  const replaceStrava = process.argv.includes('--replace-strava')
  const includeFit = process.argv.includes('--include-fit')
  const exportDir = process.env.TP_EXPORT_DIR || join(process.cwd(), 'Training Peaks Exports')
  const tz = process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase vars in .env.local')

  supabase = createClient(url, key)
  const { data: settingsRow } = await supabase.from('settings').select('framework').eq('id', 1).single()
  const framework = parseFramework(settingsRow?.framework)

  if (replaceStrava) {
    const { error } = await supabase.from('activities').delete().gt('id', 0)
    if (error) throw new Error(`Clear Strava rows: ${error.message}`)
    console.log('Cleared Strava-imported activities (id > 0)')
  }

  if (replaceTp) {
    const { error } = await supabase.from('activities').delete().lt('id', 0)
    if (error) throw new Error(`Clear TP rows: ${error.message}`)
    console.log('Cleared TrainingPeaks-imported activities (id < 0)')
  }

  const seen = new Set<string>()
  const coarseSeen = new Set<string>()
  const summarySources = findSummarySources(exportDir)

  if (summarySources.length) {
    console.log(`Found ${summarySources.length} workout summary export(s) — importing TSS…`)
    const csvCount = await importSummarySources(summarySources, framework, tz, seen, coarseSeen)
    await flushAll()
    console.log(`CSV import total: ${csvCount} workouts`)
  } else {
    console.log('No workout summary CSV found — using FIT file exports (load estimated from HR zones)')
  }

  if (!summarySources.length || includeFit) {
    await importFitZips(exportDir, framework, tz, seen, coarseSeen)
  } else {
    console.log('Skipping FIT import (summary CSV present). Pass --include-fit to fill gaps from FIT files.')
  }

  console.log(`Done — ${upserted} upserted this run`)
}

main().catch((e) => { console.error('Import failed:', e.message); process.exit(1) })
