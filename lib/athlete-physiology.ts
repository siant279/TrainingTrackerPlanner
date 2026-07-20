import type { AthletePhysiology } from './compute-load'
import { DEFAULT_PHYSIOLOGY, formatThresholdPace, parseThresholdPace } from './compute-load'
import type { getSupabaseAdmin } from './supabase'

export type AthletePhysiologyRow = {
  ftp: number | null
  threshold_pace: string | null
  /** Stored as hr_zones.lthr to avoid a required schema migration. */
  lthr: number | null
}

export function physiologyFromAthleteRow(row: {
  ftp?: number | null
  threshold_pace?: string | null
  hr_zones?: unknown
} | null | undefined): AthletePhysiology {
  if (!row) return { ...DEFAULT_PHYSIOLOGY }
  const zones = row.hr_zones && typeof row.hr_zones === 'object' ? row.hr_zones as Record<string, unknown> : null
  const lthrRaw = zones?.lthr
  const lthr = typeof lthrRaw === 'number' && lthrRaw > 0 ? lthrRaw : null
  return {
    ftp: row.ftp && row.ftp > 0 ? row.ftp : null,
    thresholdPaceSecPerKm: parseThresholdPace(row.threshold_pace),
    lthr,
  }
}

export function athleteRowFromPhysiology(phys: AthletePhysiologyRow, existingHrZones?: unknown): {
  ftp: number | null
  threshold_pace: string | null
  hr_zones: Record<string, unknown>
} {
  const prev = existingHrZones && typeof existingHrZones === 'object'
    ? { ...(existingHrZones as Record<string, unknown>) }
    : {}
  if (phys.lthr && phys.lthr > 0) prev.lthr = Math.round(phys.lthr)
  else delete prev.lthr
  return {
    ftp: phys.ftp && phys.ftp > 0 ? Math.round(phys.ftp) : null,
    threshold_pace: phys.threshold_pace?.trim() || null,
    hr_zones: prev,
  }
}

export async function getAthletePhysiology(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<AthletePhysiology> {
  const { data } = await supabase
    .from('athlete')
    .select('ftp,threshold_pace,hr_zones')
    .limit(1)
    .maybeSingle()
  return physiologyFromAthleteRow(data)
}

export async function getAthletePhysiologyRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<AthletePhysiologyRow & { id: string | null; hr_zones: unknown }> {
  const { data } = await supabase
    .from('athlete')
    .select('id,ftp,threshold_pace,hr_zones')
    .limit(1)
    .maybeSingle()
  const phys = physiologyFromAthleteRow(data)
  return {
    id: data?.id ?? null,
    ftp: phys.ftp,
    threshold_pace: data?.threshold_pace ?? formatThresholdPace(phys.thresholdPaceSecPerKm),
    lthr: phys.lthr,
    hr_zones: data?.hr_zones ?? {},
  }
}
