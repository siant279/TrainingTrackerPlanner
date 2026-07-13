/**
 * Structured workout file parsers — pure functions (no I/O).
 * Internal truth is %FTP (fractions); watts are display-only via wattsAt().
 * M7 Step 2: .zwo first. .mrc / .erg / .fit come later.
 */
import type { StructuredFormat, StructuredStep } from './types'

export interface ParsedStructured {
  name: string
  sport: string
  ftp_reference: number | null   // set only for .erg (absolute watts)
  target_metric: 'power_pct_ftp'
  steps: StructuredStep[]
  duration_sec: number
}

export function parseStructuredFile(
  filename: string,
  contents: string | Uint8Array,
  _opts?: { ftpForErg?: number },
): ParsedStructured {
  const ext = filename.split('.').pop()!.toLowerCase() as StructuredFormat
  switch (ext) {
    case 'zwo':
      return parseZwo(typeof contents === 'string' ? contents : Buffer.from(contents).toString('utf8'))
    case 'mrc':
    case 'erg':
    case 'fit':
      throw new Error(`.${ext} parser not implemented yet`)
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
      const step: StructuredStep = {
        kind: 'ramp',
        duration_sec,
        target_low,
        target_high,
        cadence: optNum(attrs.Cadence),
        label,
      }
      steps.push(stripUndefined(step))
    } else if (/^SteadyState$/i.test(kindTag)) {
      const power = num(attrs.Power)
      const step: StructuredStep = {
        kind: 'steady',
        duration_sec: num(attrs.Duration),
        target_low: power,
        target_high: power,
        cadence: optNum(attrs.Cadence),
        label,
      }
      steps.push(stripUndefined(step))
    } else if (/^IntervalsT$/i.test(kindTag)) {
      const repeat = Math.max(1, Math.round(num(attrs.Repeat, 1)))
      const on_sec = num(attrs.OnDuration)
      const off_sec = num(attrs.OffDuration)
      const onPower = num(attrs.OnPower)
      const offPower = num(attrs.OffPower)
      const step: StructuredStep = {
        kind: 'interval',
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
      }
      steps.push(stripUndefined(step))
    } else if (/^FreeRide$/i.test(kindTag)) {
      const step: StructuredStep = {
        kind: 'free',
        duration_sec: num(attrs.Duration),
        target_low: num(attrs.PowerLow ?? attrs.Power, 0),
        target_high: num(attrs.PowerHigh ?? attrs.PowerLow ?? attrs.Power, 0),
        cadence: optNum(attrs.Cadence),
        label,
      }
      steps.push(stripUndefined(step))
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

/** Expand steps into elapsed-minute / %FTP points for an AreaChart (ramps linear; intervals expanded). */
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
