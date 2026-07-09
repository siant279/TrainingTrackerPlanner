'use client'

import type { Race } from '@/lib/types'

const PRIORITY_STYLE: Record<string, string> = {
  A: 'bg-red-100 text-red-900 border-red-300',
  B: 'bg-orange-50 text-orange-900 border-orange-200',
  C: 'bg-amber-50 text-amber-900 border-amber-200',
}

export function PlannerRaceEntry({ race }: { race: Race }) {
  const style = PRIORITY_STYLE[race.priority] ?? PRIORITY_STYLE.B
  const name = race.name.length > 20 ? `${race.name.slice(0, 20)}…` : race.name

  return (
    <div
      className={`rounded px-1 py-0.5 border text-[10px] leading-tight ${style}`}
      title={`${race.name} · ${race.priority}-race${race.sport ? ` · ${race.sport}` : ''}`}
    >
      <span className="font-semibold">🏁 {name}</span>
      <span className="ml-1 opacity-80">{race.priority}</span>
      {race.sport && <span className="block text-[9px] opacity-70 truncate">{race.sport}</span>}
    </div>
  )
}
