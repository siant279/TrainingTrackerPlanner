import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from'); const to = searchParams.get('to')
  if (isDemoMode()) return NextResponse.json({ planned: demoStore.getPlanned(from, to) })
  let q = getSupabaseAdmin().from('planned_workouts').select('*').order('date')
  if (from) q = q.gte('date', from)
  if (to) q = q.lte('date', to)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planned: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  if (isDemoMode()) {
    const planned = demoStore.addPlanned({ date: body.date, sport: body.sport, type: body.type || 'Easy', duration_min: body.duration_min ?? null, target_load: body.target_load ?? null, description: body.description ?? null })
    return NextResponse.json({ planned })
  }
  const { data, error } = await getSupabaseAdmin().from('planned_workouts').insert({ date: body.date, sport: body.sport, type: body.type || 'Easy', duration_min: body.duration_min ?? null, target_load: body.target_load ?? null, description: body.description ?? null, status: 'planned' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planned: data })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (isDemoMode()) {
    const planned = demoStore.updatePlanned(body.id, { date: body.date, sport: body.sport, type: body.type, duration_min: body.duration_min, target_load: body.target_load, description: body.description, status: body.status })
    return NextResponse.json({ planned })
  }
  const { data, error } = await getSupabaseAdmin().from('planned_workouts').update({ date: body.date, sport: body.sport, type: body.type, duration_min: body.duration_min, target_load: body.target_load, description: body.description, status: body.status }).eq('id', body.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planned: data })
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (isDemoMode()) { demoStore.deletePlanned(id); return NextResponse.json({ ok: true }) }
  const { error } = await getSupabaseAdmin().from('planned_workouts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
