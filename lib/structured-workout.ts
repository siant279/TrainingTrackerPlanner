/**
 * Structured workout file parsers — pure functions (no I/O).
 * Internal truth is %FTP (fractions); watts are display-only via wattsAt().
 */
import FitParser from 'fit-file-parser'
import type { StructuredFormat, StructuredStep } from './types'

export interface ParsedStructured {
  name: string
  sport: string
  ftp_reference: number | null   // FTP absolute-watt formats were authored at; null for %FTP formats
  target_metric: 'power_pct_ftp'
  steps: StructuredStep[]
  duration_sec: number
}

export function parseStructuredFile(
  filename: string,
  contents: string | Uint8Array,
  opts?: { ftpForErg?: number },
): ParsedStructured {
  const ext = filename.split('.').pop()!.toLowerCase() as StructuredFormat
  const asText = () => (typeof contents === 'string' ? contents : Buffer.from(contents).toString('utf8'))
  switch (ext) {
    case 'zwo':
      return parseZwo(asText())
    case 'mrc':
      return parseMrc(asText())
    case 'erg':
      return parseErg(asText(), opts?.ftpForErg)
    case 'fit': {
      const buf = typeof contents === 'string'
        ? Buffer.from(contents, /^[A-Za-z0-9+/=\s]+$/.test(contents.trim()) ? 'base64' : 'binary')
        : Buffer.from(contents)
      return parseFitWorkout(buf, opts?.ftpForErg)
    }
    default:
      throw new Error(`Unsupported format: .${ext}`)
  }
}

/** Parse Zwift .zwo XML into %FTP steps. Server-safe (no DOMParser). */
export function parseZwo(xml: string): ParsedStructured {
  const name = textContent(xml, 'name') || 'Untitled workout'
  const sportRaw = textContent(xml, 'sportType') || 'bike'
  const sport = sportRaw.toLowerCase() === 'bike' || sportRaw.toLowerCase() === 'cycling' ? 'bike' : sportRaw

  const workoutBlock = xml.match(/<workout\b[^>]*>([\s\S]*?)<\/workout>/i)?.[1]
  if (!workoutBlock) throw new Error('Invalid .zwo: missing <workout> block')

  const steps: StructuredStep[] = []
  const tagRe = /<(Warmup|Cooldown|SteadyState|IntervalsT|Ramp|FreeRide)\b([^>]*?)(\/>|>)/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(workoutBlock)) !== null) {
    const kindTag = m[1]
    const attrs = parseAttrs(m[2])
    const selfClosing = m[3] === '/>'
    let inner = ''
    if (!selfClosing) {
      const close = new RegExp(`</${kindTag}\\s*>`, 'i')
      const rest = workoutBlock.slice(m.index + m[0].length)
      const end = rest.search(close)
      if (end >= 0) inner = rest.slice(0, end)
    }
    const label = firstTextEvent(inner)

    if (/^Warmup$/i.test(kindTag) || /^Cooldown$/i.test(kindTag) || /^Ramp$/i.test(kindTag)) {
      const duration_sec = num(attrs.Duration)
      const target_low = num(attrs.PowerLow ?? attrs.Power)
      const target_high = num(attrs.PowerHigh ?? attrs.PowerLow ?? attrs.Power)
      steps.push(stripUndefined({
        kind: 'ramp' as const,
        duration_sec,
        target_low,
        target_high,
        cadence: optNum(attrs.Cadence),
        label,
      }))
    } else if (/^SteadyState$/i.test(kindTag)) {
      const power = num(attrs.Power)
      steps.push(stripUndefined({
        kind: 'steady' as const,
        duration_sec: num(attrs.Duration),
        target_low: power,
        target_high: power,
        cadence: optNum(attrs.Cadence),
        label,
      }))
    } else if (/^IntervalsT$/i.test(kindTag)) {
      const repeat = Math.max(1, Math.round(num(attrs.Repeat, 1)))
      const on_sec = num(attrs.OnDuration)
      const off_sec = num(attrs.OffDuration)
      const onPower = num(attrs.OnPower)
      const offPower = num(attrs.OffPower)
      steps.push(stripUndefined({
        kind: 'interval' as const,
        duration_sec: repeat * (on_sec + off_sec),
        target_low: onPower,
        target_high: onPower,
        off_low: offPower,
        off_high: offPower,
        repeat,
        on_sec,
        off_sec,
        cadence: optNum(attrs.Cadence),
        label,
      }))
    } else if (/^FreeRide$/i.test(kindTag)) {
      steps.push(stripUndefined({
        kind: 'free' as const,
        duration_sec: num(attrs.Duration),
        target_low: num(attrs.PowerLow ?? attrs.Power, 0),
        target_high: num(attrs.PowerHigh ?? attrs.PowerLow ?? attrs.Power, 0),
        cadence: optNum(attrs.Cadence),
        label,
      }))
    }
  }

  const duration_sec = steps.reduce((n, s) => n + s.duration_sec, 0)
  validateSteps(steps, duration_sec)
  return {
    name,
    sport,
    ftp_reference: null,
    target_metric: 'power_pct_ftp',
    steps,
    duration_sec,
  }
}

/** Parse MRC (%FTP course points). */
export function parseMrc(text: string): ParsedStructured {
  const header = parseCourseHeader(text)
  const points = parseCourseDataPoints(text)
  const steps = coursePointsToSteps(points, (v) => v / 100)
  const duration_sec = steps.reduce((n, s) => n + s.duration_sec, 0)
  validateSteps(steps, duration_sec)
  return {
    name: header.fileName || header.description || 'Untitled workout',
    sport: 'bike',
    ftp_reference: null,
    target_metric: 'power_pct_ftp',
    steps,
    duration_sec,
  }
}

/**
 * Parse ERG (absolute watts) → %FTP using authoring FTP.
 * Prefer opts.ftpForErg, else FTP= from the course header.
 */
export function parseErg(text: string, ftpForErg?: number): ParsedStructured {
  const header = parseCourseHeader(text)
  const ftp = ftpForErg ?? header.ftp
  if (!ftp || !Number.isFinite(ftp) || ftp <= 0) {
    throw new Error('.erg requires ftpForErg (or FTP= in the course header) to convert watts to %FTP')
  }
  const points = parseCourseDataPoints(text)
  const steps = coursePointsToSteps(points, (watts) => watts / ftp)
  const duration_sec = steps.reduce((n, s) => n + s.duration_sec, 0)
  validateSteps(steps, duration_sec)
  return {
    name: header.fileName || header.description || 'Untitled workout',
    sport: 'bike',
    ftp_reference: ftp,
    target_metric: 'power_pct_ftp',
    steps,
    duration_sec,
  }
}

/** Parse a FIT workout file (workout_step stream) into %FTP steps. */
export function parseFitWorkout(buffer: Buffer | Uint8Array, ftpForErg?: number): ParsedStructured {
  const parser = new FitParser({ force: true, mode: 'list' })
  const data = parseFitSync(parser, Buffer.from(buffer))

  const name =
    firstString(data, ['workouts', 'workout'], ['wkt_name', 'name'])
    || 'Untitled workout'

  const rawSteps = collectFitWorkoutSteps(data)
  if (!rawSteps.length) throw new Error('Invalid .fit workout: no workout_step messages')

  const ftp = ftpForErg && ftpForErg > 0 ? ftpForErg : 205
  const steps: StructuredStep[] = []
  for (const raw of rawSteps) {
    const duration_sec = fitStepDurationSec(raw)
    if (duration_sec <= 0) continue
    const { low, high } = fitStepPowerFrac(raw, ftp)
    const intensity = String(raw.intensity ?? raw.intensity_type ?? '').toLowerCase()
    const kind: StructuredStep['kind'] =
      intensity.includes('warmup') || intensity.includes('cooldown') || Math.abs(low - high) > 1e-6
        ? 'ramp'
        : 'steady'
    steps.push(stripUndefined({
      kind,
      duration_sec,
      target_low: low,
      target_high: high,
      label: typeof raw.notes === 'string' ? raw.notes : undefined,
    }))
  }

  if (!steps.length) throw new Error('Invalid .fit workout: no timed power steps')
  const duration_sec = steps.reduce((n, s) => n + s.duration_sec, 0)
  validateSteps(steps, duration_sec)
  return {
    name,
    sport: 'bike',
    ftp_reference: ftpForErg && ftpForErg > 0 ? ftpForErg : null,
    target_metric: 'power_pct_ftp',
    steps,
    duration_sec,
  }
}

function parseFitSync(parser: FitParser, buffer: Buffer): Record<string, unknown> {
  let result: Record<string, unknown> | null = null
  let err: unknown = null
  const bytes = Uint8Array.from(buffer)
  parser.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), (error, data) => {
    if (error) err = error
    else result = data as unknown as Record<string, unknown>
  })
  if (err) throw err instanceof Error ? err : new Error(String(err))
  if (!result) throw new Error('FIT parse returned no data')
  return result
}

function collectFitWorkoutSteps(data: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    data.workout_steps,
    data.workoutSteps,
    (data.workouts as { workout_steps?: unknown }[] | undefined)?.[0]?.workout_steps,
    (data.workout as { workout_steps?: unknown } | undefined)?.workout_steps,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c as Record<string, unknown>[]
  }
  for (const [k, v] of Object.entries(data)) {
    if (/workout_?step/i.test(k) && Array.isArray(v)) return v as Record<string, unknown>[]
  }
  return []
}

function fitStepDurationSec(raw: Record<string, unknown>): number {
  const dtype = String(raw.duration_type ?? raw.durationType ?? '').toLowerCase()
  const val = Number(
    raw.duration_time ?? raw.durationTime ?? raw.duration_value ?? raw.durationValue ?? raw.duration ?? 0,
  )
  if (!Number.isFinite(val) || val <= 0) return 0
  if (dtype.includes('time') || !dtype) {
    return val > 10_000 ? Math.round(val / 1000) : Math.round(val)
  }
  return 0
}

function fitStepPowerFrac(raw: Record<string, unknown>, ftp: number): { low: number; high: number } {
  const targetType = String(raw.target_type ?? raw.targetType ?? '').toLowerCase()
  const lowRaw = Number(
    raw.custom_target_power_low
    ?? raw.customTargetPowerLow
    ?? raw.custom_target_value_low
    ?? raw.customTargetValueLow
    ?? raw.target_value
    ?? raw.targetValue
    ?? 0,
  )
  const highRaw = Number(
    raw.custom_target_power_high
    ?? raw.customTargetPowerHigh
    ?? raw.custom_target_value_high
    ?? raw.customTargetValueHigh
    ?? lowRaw,
  )

  const toFrac = (v: number): number => {
    if (!Number.isFinite(v) || v < 0) return 0
    if (targetType.includes('percent') || (v > 0 && v <= 300 && !targetType.includes('power'))) {
      return v > 3 ? v / 100 : v
    }
    if (v > 3) return v / ftp
    return v
  }

  let low = toFrac(lowRaw)
  let high = toFrac(highRaw)
  if (low === 0 && high === 0 && targetType.includes('open')) {
    low = 0.5
    high = 0.5
  }
  return { low, high }
}

function firstString(
  data: Record<string, unknown>,
  collections: string[],
  fields: string[],
): string | null {
  for (const ck of collections) {
    const col = data[ck]
    const row = Array.isArray(col) ? col[0] : col
    if (row && typeof row === 'object') {
      for (const f of fields) {
        const v = (row as Record<string, unknown>)[f]
        if (typeof v === 'string' && v.trim()) return v.trim()
      }
    }
  }
  return null
}

type CoursePoint = { min: number; value: number }

function parseCourseHeader(text: string): { description?: string; fileName?: string; ftp?: number } {
  const header = text.match(/\[COURSE HEADER\]([\s\S]*?)\[END COURSE HEADER\]/i)?.[1] ?? text
  const description = header.match(/^\s*DESCRIPTION\s*=\s*(.+)$/im)?.[1]?.trim()
  const fileName = header.match(/^\s*FILE NAME\s*=\s*(.+)$/im)?.[1]?.trim()
  const ftpRaw = header.match(/^\s*FTP\s*=\s*(\d+(?:\.\d+)?)\s*$/im)?.[1]
  const ftp = ftpRaw ? Number(ftpRaw) : undefined
  return { description, fileName, ftp }
}

function parseCourseDataPoints(text: string): CoursePoint[] {
  const block = text.match(/\[COURSE DATA\]([\s\S]*?)\[END COURSE DATA\]/i)?.[1]
  if (!block) throw new Error('Invalid course file: missing [COURSE DATA]')
  const points: CoursePoint[] = []
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('[')) continue
    const parts = trimmed.split(/[\t,; ]+/).filter(Boolean)
    if (parts.length < 2) continue
    const min = Number(parts[0])
    const value = Number(parts[1])
    if (!Number.isFinite(min) || !Number.isFinite(value)) continue
    points.push({ min, value })
  }
  if (points.length < 2) throw new Error('Invalid course file: need at least 2 data points')
  return points
}

/** Consecutive points → steady/ramp steps; skip zero-duration (vertical) transitions. */
function coursePointsToSteps(
  points: CoursePoint[],
  toFrac: (value: number) => number,
): StructuredStep[] {
  const steps: StructuredStep[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const durMin = b.min - a.min
    if (durMin <= 1e-9) continue
    const duration_sec = Math.round(durMin * 60)
    if (duration_sec <= 0) continue
    const from = toFrac(a.value)
    const to = toFrac(b.value)
    if (Math.abs(from - to) < 1e-6) {
      steps.push({ kind: 'steady', duration_sec, target_low: from, target_high: to })
    } else {
      steps.push({ kind: 'ramp', duration_sec, target_low: from, target_high: to })
    }
  }
  return mergeAdjacentSteadys(steps)
}

function mergeAdjacentSteadys(steps: StructuredStep[]): StructuredStep[] {
  const out: StructuredStep[] = []
  for (const s of steps) {
    const prev = out[out.length - 1]
    if (
      prev
      && prev.kind === 'steady'
      && s.kind === 'steady'
      && Math.abs(prev.target_low - s.target_low) < 1e-6
      && Math.abs(prev.target_high - s.target_high) < 1e-6
    ) {
      prev.duration_sec += s.duration_sec
    } else {
      out.push({ ...s })
    }
  }
  return out
}

/** TSS-style load estimate from the normalized %FTP profile (prefills planned target_load). */
export function estimateStructuredLoad(steps: StructuredStep[]): number {
  let tss = 0
  for (const s of steps) {
    if (s.kind === 'interval' && s.repeat) {
      const onIF = (s.target_low + s.target_high) / 2
      const offIF = ((s.off_low ?? 0) + (s.off_high ?? 0)) / 2
      tss += s.repeat * ((s.on_sec ?? 0) * onIF ** 2 + (s.off_sec ?? 0) * offIF ** 2)
    } else {
      const ifv = (s.target_low + s.target_high) / 2
      tss += s.duration_sec * ifv ** 2
    }
  }
  return Math.round((tss / 3600) * 100)
}

/** Watts for display against the athlete's current FTP — never stored. */
export const wattsAt = (frac: number, ftp: number) => Math.round(frac * ftp)

export type StructuredChartPoint = { min: number; pct: number }

/** Expand steps into elapsed-minute / %FTP points for an AreaChart. */
export function stepsToChartSeries(steps: StructuredStep[]): StructuredChartPoint[] {
  const pts: StructuredChartPoint[] = []
  let t = 0
  const add = (durSec: number, fromFrac: number, toFrac: number) => {
    if (durSec <= 0) return
    pts.push({ min: +(t / 60).toFixed(2), pct: Math.round(fromFrac * 1000) / 10 })
    t += durSec
    pts.push({ min: +(t / 60).toFixed(2), pct: Math.round(toFrac * 1000) / 10 })
  }

  for (const s of steps) {
    if (s.kind === 'interval' && s.repeat && s.on_sec != null && s.off_sec != null) {
      const on = (s.target_low + s.target_high) / 2
      const off = ((s.off_low ?? 0) + (s.off_high ?? 0)) / 2
      for (let i = 0; i < s.repeat; i++) {
        add(s.on_sec, on, on)
        add(s.off_sec, off, off)
      }
    } else if (s.kind === 'ramp') {
      add(s.duration_sec, s.target_low, s.target_high)
    } else {
      const mid = (s.target_low + s.target_high) / 2
      add(s.duration_sec, mid, mid)
    }
  }
  return pts
}

export function validateSteps(steps: StructuredStep[], total: number) {
  const sum = steps.reduce((n, s) => n + s.duration_sec, 0)
  if (Math.abs(sum - total) > 2) throw new Error(`Step durations (${sum}s) != total (${total}s)`)
  for (const s of steps) {
    if (s.duration_sec <= 0) throw new Error('Zero-duration step')
    for (const v of [s.target_low, s.target_high]) {
      if (v < 0 || v > 3) throw new Error(`Target ${v} out of range`)
    }
  }
}

function textContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  return m ? decodeXml(m[1].trim()) : null
}

function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([A-Za-z_][\w]*)\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) out[m[1]] = m[2]
  return out
}

function firstTextEvent(inner: string): string | undefined {
  const m = inner.match(/<textevent\b([^>]*)\/?>/i)
  if (!m) return undefined
  const attrs = parseAttrs(m[1])
  return attrs.message ? decodeXml(attrs.message) : undefined
}

function num(v: string | undefined, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${v}`)
  return n
}

function optNum(v: string | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripUndefined<T extends object>(obj: T): T {
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] === undefined) delete obj[k]
  }
  return obj
}
