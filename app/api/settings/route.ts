import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import { parseFramework } from '@/lib/framework'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (isDemoMode()) return NextResponse.json({ framework: demoStore.getSettings() })
  const { data, error } = await getSupabaseAdmin().from('settings').select('framework').eq('id', 1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ framework: parseFramework(data?.framework) })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const framework = parseFramework(body.framework)
  if (isDemoMode()) return NextResponse.json({ framework: demoStore.updateSettings(framework) })
  const { error } = await getSupabaseAdmin().from('settings').upsert({ id: 1, framework })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ framework })
}
