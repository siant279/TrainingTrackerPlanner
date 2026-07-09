import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import { fetchCalendarEvents } from '@/lib/google'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from'); const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })
  if (isDemoMode()) return NextResponse.json({ events: demoStore.getCalendarEvents(from, to) })
  try {
    const tz = process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'
    const events = await fetchCalendarEvents(`${from}T00:00:00-07:00`, `${to}T23:59:59-07:00`, tz)
    return NextResponse.json({ events })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Calendar error' }, { status: 500 })
  }
}
