import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (isDemoMode()) return NextResponse.json({ races: demoStore.getRaces() })
  const { data, error } = await getSupabaseAdmin().from('races').select('*').order('date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ races: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  if (isDemoMode()) return NextResponse.json({ race: demoStore.addRace({ date: body.date, name: body.name, sport: body.sport ?? null, priority: body.priority || 'B' }) })
  const { data, error } = await getSupabaseAdmin().from('races').insert({ date: body.date, name: body.name, sport: body.sport ?? null, priority: body.priority || 'B' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ race: data })
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (isDemoMode()) { demoStore.deleteRace(id); return NextResponse.json({ ok: true }) }
  const { error } = await getSupabaseAdmin().from('races').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
