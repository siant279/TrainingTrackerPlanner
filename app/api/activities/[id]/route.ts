import { NextRequest, NextResponse } from 'next/server'
import { classifyActual, effectiveCategory } from '@/lib/classify'
import { demoStore, isDemoMode } from '@/lib/demo'
import { activityDateKey } from '@/lib/dates'
import { getFramework } from '@/lib/framework'
import { findBestPlannedMatch } from '@/lib/match-planned'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Activity, ActivityCategory } from '@/lib/types'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const activityId = Number(id)
  if (!Number.isFinite(activityId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  if (isDemoMode()) {
    const result = demoStore.getActivity(activityId)
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(result)
  }

  const supabase = getSupabaseAdmin()
  const { data: activity, error } = await supabase.from('activities').select('*').eq('id', activityId).single()
  if (error || !activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: feel } = await supabase.from('feel').select('*').eq('activity_id', activityId).maybeSingle()
  let planned = (await supabase.from('planned_workouts').select('*').eq('matched_activity_id', activityId).maybeSingle()).data
  if (!planned) {
    const act = activity as Activity
    const framework = await getFramework(supabase)
    const category = effectiveCategory(
      classifyActual(act.sport_type, act.name ?? '', act.description, act.moving_time, framework),
      act.category_override as ActivityCategory | null,
    )
    const { data: candidates } = await supabase.from('planned_workouts').select('*').eq('date', activityDateKey(act))
    planned = findBestPlannedMatch(candidates ?? [], activityDateKey(act), act.sport_type, category) ?? null
  }
  return NextResponse.json({ activity, feel: feel ?? null, planned: planned ?? null })
}
