/**
 * Pull recent Strava activities into the tracker (bypasses webhook).
 * Usage: npm run sync-recent
 *        npm run sync-recent -- --days 3
 *        npm run sync-recent -- --activity 12345678
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { syncRecentFromStrava } from '../lib/strava-sync'

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
  const { days, activityId } = parseArgs()
  const result = await syncRecentFromStrava({ days, activityId })
  if (!result.synced) {
    console.log('No training activities to sync in the requested window')
    return
  }
  for (const a of result.activities) {
    console.log(`Synced ${a.id} "${a.name ?? 'activity'}"${a.matched ? ` (matched plan ${a.matched})` : ''}`)
  }
  console.log(`Done — ${result.synced} activit${result.synced === 1 ? 'y' : 'ies'} synced`)
}

main().catch((e) => { console.error('Sync failed:', e.message); process.exit(1) })
