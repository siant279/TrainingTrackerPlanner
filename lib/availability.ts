import type { Framework } from './types'

export interface BusyBlock { startMin: number; endMin: number; title: string }
export interface CalendarEvent {
  status?: string; transparency?: string; availability?: string; summary?: string
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }
}

function clockMin(dt: string) {
  const d = new Date(dt)
  return d.getHours() * 60 + d.getMinutes()
}

export function isBusyEvent(ev: CalendarEvent): boolean {
  if (ev.status === 'cancelled') return false
  if (ev.transparency === 'transparent') return false
  if (ev.availability === 'AVAILABILITY_FREE' || ev.availability === 'free') return false
  if (!ev.start?.dateTime) return false
  return true
}

export function minLabel(m: number) {
  const h = Math.floor(m / 60), mm = m % 60, ap = h < 12 ? 'a' : 'p'
  let hh = h % 12; if (hh === 0) hh = 12
  return hh + (mm ? `:${String(mm).padStart(2, '0')}` : '') + ap
}

export function buildBusyMap(events: CalendarEvent[], fw: Framework) {
  const busy: Record<string, BusyBlock[]> = {}
  for (const ev of events) {
    if (!isBusyEvent(ev) || !ev.start?.dateTime) continue
    const key = ev.start.dateTime.slice(0, 10)
    const sMin = clockMin(ev.start.dateTime)
    const eMin = ev.end?.dateTime
      ? (ev.end.dateTime.slice(0, 10) !== key ? fw.dayEndMin : clockMin(ev.end.dateTime))
      : sMin + 30
    ;(busy[key] ??= []).push({
      startMin: sMin,
      endMin: eMin,
      title: (ev.summary ?? 'Busy').replace(/<[^>]*>/g, ''),
    })
  }
  for (const k of Object.keys(busy)) busy[k].sort((a, b) => a.startMin - b.startMin)
  return busy
}

export function clipBusyBlocks(blocks: BusyBlock[] | undefined, fw: Framework) {
  return (blocks ?? [])
    .map((b) => ({
      startMin: Math.max(b.startMin, fw.dayStartMin),
      endMin: Math.min(b.endMin, fw.dayEndMin),
      title: b.title,
    }))
    .filter((b) => b.endMin > b.startMin)
}

export function busyBlocksTitle(blocks: BusyBlock[], fw: Framework) {
  return clipBusyBlocks(blocks, fw)
    .map((b) => `${minLabel(b.startMin)}–${minLabel(b.endMin)}`)
    .join(', ')
}

export function availabilityForDay(blocks: BusyBlock[] | undefined, fw: Framework) {
  const evs = clipBusyBlocks(blocks, fw).map((e) => [e.startMin, e.endMin] as [number, number])
  const merged: [number, number][] = []
  for (const b of evs.sort((a, c) => a[0] - c[0])) {
    if (merged.length && b[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b[1])
    else merged.push([...b])
  }
  let cur = fw.dayStartMin
  const gaps: [number, number][] = []
  for (const [s, e] of merged) { if (s > cur) gaps.push([cur, s]); cur = Math.max(cur, e) }
  if (cur < fw.dayEndMin) gaps.push([cur, fw.dayEndMin])
  const totalFree = gaps.reduce((t, [s, e]) => t + (e - s), 0)
  const biggest = gaps.slice().sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0] ?? null
  return { totalFreeH: totalFree / 60, biggest }
}

export function availColor(h: number) { return h >= 3 ? '#16a34a' : h >= 1.5 ? '#ca8a04' : '#dc2626' }
