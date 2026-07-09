import { NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({
      demo: true,
      activities: 0,
      googleConnected: false,
      ingestConfigured: false,
      cronConfigured: false,
      googleConfigured: false,
    })
  }

  const supabase = getSupabaseAdmin()
  const { count } = await supabase.from('activities').select('*', { count: 'exact', head: true })
  const { data: athlete } = await supabase.from('athlete').select('google_refresh_token').limit(1).single()

  return NextResponse.json({
    demo: false,
    activities: count ?? 0,
    googleConnected: Boolean(athlete?.google_refresh_token),
    ingestConfigured: Boolean(process.env.TRACKER_INGEST_SECRET),
    cronConfigured: Boolean(process.env.CRON_SECRET),
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  })
}
