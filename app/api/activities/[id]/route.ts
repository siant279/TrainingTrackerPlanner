import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import { getSupabaseAdmin } from '@/lib/supabase'

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
  return NextResponse.json({ activity, feel: feel ?? null })
}
