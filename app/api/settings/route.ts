import { NextRequest, NextResponse } from 'next/server'
import {
  athleteRowFromPhysiology,
  getAthletePhysiologyRow,
  type AthletePhysiologyRow,
} from '@/lib/athlete-physiology'
import { formatThresholdPace, parseThresholdPace } from '@/lib/compute-load'
import { demoStore, isDemoMode } from '@/lib/demo'
import { parseFramework } from '@/lib/framework'
import { getSupabaseAdmin } from '@/lib/supabase'

function parsePhysiologyBody(body: unknown): AthletePhysiologyRow {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const phys = (b.physiology && typeof b.physiology === 'object' ? b.physiology : b) as Record<string, unknown>
  const ftpRaw = Number(phys.ftp)
  const lthrRaw = Number(phys.lthr)
  const paceRaw = typeof phys.threshold_pace === 'string' ? phys.threshold_pace : ''
  const parsedPace = parseThresholdPace(paceRaw)
  return {
    ftp: Number.isFinite(ftpRaw) && ftpRaw > 0 ? Math.round(ftpRaw) : null,
    threshold_pace: parsedPace ? (paceRaw.trim() || formatThresholdPace(parsedPace)) : (paceRaw.trim() || null),
    lthr: Number.isFinite(lthrRaw) && lthrRaw > 0 ? Math.round(lthrRaw) : null,
  }
}

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({
      framework: demoStore.getSettings(),
      physiology: demoStore.getPhysiology(),
    })
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('settings').select('framework').eq('id', 1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const physiology = await getAthletePhysiologyRow(supabase)
  return NextResponse.json({
    framework: parseFramework(data?.framework),
    physiology: {
      ftp: physiology.ftp,
      threshold_pace: physiology.threshold_pace,
      lthr: physiology.lthr,
    },
  })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const framework = parseFramework(body.framework)
  const physIn = parsePhysiologyBody(body)

  if (isDemoMode()) {
    return NextResponse.json({
      framework: demoStore.updateSettings(framework),
      physiology: demoStore.updatePhysiology(physIn),
    })
  }

  const supabase = getSupabaseAdmin()
  const { error: fwError } = await supabase.from('settings').upsert({ id: 1, framework })
  if (fwError) return NextResponse.json({ error: fwError.message }, { status: 500 })

  const current = await getAthletePhysiologyRow(supabase)
  if (!current.id) return NextResponse.json({ error: 'No athlete row to update' }, { status: 500 })

  const patch = athleteRowFromPhysiology(physIn, current.hr_zones)
  const { error: athError } = await supabase.from('athlete').update(patch).eq('id', current.id)
  if (athError) return NextResponse.json({ error: athError.message }, { status: 500 })

  return NextResponse.json({
    framework,
    physiology: {
      ftp: patch.ftp,
      threshold_pace: patch.threshold_pace || null,
      lthr: physIn.lthr,
    },
  })
}
