import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/auth'
import { syncRecentFromStrava } from '@/lib/strava-sync'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await syncRecentFromStrava({ days: 3 })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('Cron sync-strava failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
