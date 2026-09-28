'use client'

import type { Race } from '@/lib/types'

const PRIORITY_STYLE: Record<string, string> = {
  A: 'bg-red-100 text-red-900 border-red-300',
  B: 'bg-orange-50 text-orange-900 border-orange-200',
  C: 'bg-amber-50 text-amber-900 border-amber-200',
}

export function PlannerRaceEntry({ race }: { race: Race }) {
  const style = PRIORITY_STYLE[race.priority] ?? PRIORITY_STYLE.B

  return (
    <div
      className={`rounded-lg px-3 py-2 border text-sm leading-snug ${style}`}
      title={`${race.name} · ${race.priority}-race${race.sport ? ` · ${race.sport}` : ''}`}
    >
      <span className="font-semibold">🏁 {race.name}</span>
      <span className="ml-2 text-xs opacity-80">{race.priority}</span>
      {race.sport ? <span className="ml-2 text-xs opacity-70">{race.sport}</span> : null}
    </div>
  )
}
