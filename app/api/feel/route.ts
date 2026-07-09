import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (isDemoMode()) return NextResponse.json(demoStore.getFeel())
  const supabase = getSupabaseAdmin()
  const { data: activities } = await supabase.from('activities').select('id,name,sport_type,start_local,load,category,category_override,perceived_exertion').eq('count_toward_load', true).order('start_local', { ascending: false }).limit(30)
  const { data: feels } = await supabase.from('feel').select('*')
  const feelMap = new Set((feels ?? []).map((f) => f.activity_id))
  return NextResponse.json({ pending: (activities ?? []).filter((a) => !feelMap.has(a.id)).slice(0, 10), feels: feels ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  if (isDemoMode()) return NextResponse.json({ feel: demoStore.saveFeel(body) })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('feel').upsert({ activity_id: body.activity_id, rpe: body.rpe ?? null, feel_flag: body.feel_flag ?? null, soreness: body.soreness ?? null, note: body.note ?? null }, { onConflict: 'activity_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (body.category_override) await supabase.from('activities').update({ category_override: body.category_override }).eq('id', body.activity_id)
  return NextResponse.json({ feel: data })
}
