import { NextRequest, NextResponse } from 'next/server'
import { addCalendarDays, calendarDateKey } from '@/lib/dates'
import { demoStore, isDemoMode } from '@/lib/demo'
import { getSupabaseAdmin } from '@/lib/supabase'

/** List views never need the bulky Strava/TP `raw` blob. */
const ACTIVITY_LIST_SELECT =
  'id,sport_type,start_local,local_date,moving_time,distance,elevation,relative_effort,load,category,category_override,count_toward_load,perceived_exertion,name,description'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const days = Number(searchParams.get('days') || 400)

  if (isDemoMode()) {
    const activities = from && to
      ? demoStore.getActivitiesInRange(from, to)
      : demoStore.getActivities(days)
    const bounds = demoStore.getActivityBounds()
    return NextResponse.json({ activities, earliest: bounds.earliest, latest: bounds.latest })
  }

  const supabase = getSupabaseAdmin()

  if (from && to) {
    const { data, error } = await supabase
      .from('activities')
      .select(ACTIVITY_LIST_SELECT)
      .gte('local_date', from)
      .lte('local_date', to)
      .order('start_local', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: bounds } = await supabase
      .from('activities')
      .select('local_date')
      .eq('count_toward_load', true)
      .order('local_date', { ascending: true })
      .limit(1)
    const { data: boundsMax } = await supabase
      .from('activities')
      .select('local_date')
      .eq('count_toward_load', true)
      .order('local_date', { ascending: false })
      .limit(1)

    return NextResponse.json({
      activities: data ?? [],
      earliest: bounds?.[0]?.local_date ?? null,
      latest: boundsMax?.[0]?.local_date ?? null,
    })
  }

  const sinceKey = addCalendarDays(calendarDateKey(new Date()), -days)
  const { data, error } = await supabase
    .from('activities')
    .select(ACTIVITY_LIST_SELECT)
    .gte('local_date', sinceKey)
    .order('start_local', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activities: data ?? [] })
}
