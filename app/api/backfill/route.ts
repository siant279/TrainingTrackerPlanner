import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/auth'
import { isExcludedSport } from '@/lib/excluded-sports'
import { ingestStravaActivity } from '@/lib/ingest-service'
import type { StravaActivityPayload } from '@/lib/types'

const BASE_URL = (process.env.STRAVA_API_BASE_URL?.trim() || 'https://www.strava.com/api/v3').replace(/\/$/, '')

async function getJournalToken() {
  const url = process.env.JOURNAL_TOKEN_URL
  const secret = process.env.JOURNAL_INTERNAL_SECRET
  if (!url || !secret) throw new Error('Missing JOURNAL_TOKEN_URL or JOURNAL_INTERNAL_SECRET')
  const resp = await fetch(url, { headers: { 'x-internal-secret': secret } })
  if (!resp.ok) throw new Error(`Journal token fetch failed: ${resp.status}`)
  const data = await resp.json()
  return data.access_token as string
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const after = body.after as number | undefined
  try {
    const token = await getJournalToken()
    let page = 1, imported = 0
    while (page <= 50) {
      const params = new URLSearchParams({ per_page: '100', page: String(page) })
      if (after) params.set('after', String(after))
      const resp = await fetch(`${BASE_URL}/athlete/activities?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error(`Strava list failed: ${resp.status}`)
      const activities = await resp.json() as StravaActivityPayload[]
      if (!activities.length) break
      for (const a of activities) {
        if (isExcludedSport(a.sport_type || a.type || '')) continue
        await ingestStravaActivity(a, 'create')
        imported++
      }
      if (activities.length < 100) break
      page++
      await sleep(150)
    }
    return NextResponse.json({ ok: true, imported })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Backfill failed' }, { status: 500 })
  }
}
