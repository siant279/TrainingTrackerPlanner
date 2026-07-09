'use client'

import { CAT_TAG, classifyActual } from '@/lib/classify'
import type { DayEntry } from '@/lib/planner-day-entries'
import type { Framework, PlannedWorkout } from '@/lib/types'

const ICONS: Record<string, string> = { Run: '🏃', TrailRun: '⛰️', Ride: '🚴', WeightTraining: '🏋️', Swim: '🏊' }
const icon = (s: string) => ICONS[s] || '•'

function fmtMin(sec: number): string {
  return String(Math.round(sec / 60))
}

type Props = {
  entry: DayEntry
  framework: Framework
  feelIds: Set<number>
  onActivityClick: (id: number) => void
  onPlanClick: (date: string, plan: PlannedWorkout) => void
}

export function PlannerDayEntry({ entry, framework, feelIds, onActivityClick, onPlanClick }: Props) {
  if (entry.kind === 'merged') {
    const { plan, activity: a } = entry
    const cat = classifyActual(a.sport_type, a.name ?? '', a.description, a.moving_time, framework)
    const tag = CAT_TAG[cat]
    const planLabel = plan.description || `${plan.type} ${plan.sport}`
    const hasFeel = feelIds.has(a.id)
    const planLoad = plan.target_load != null ? String(plan.target_load) : '—'
    const planDur = plan.duration_min != null ? `${plan.duration_min}m` : '—'
    const actDur = `${fmtMin(a.moving_time)}m`
    const actName = (a.name ?? a.sport_type).slice(0, 20) + ((a.name?.length ?? 0) > 20 ? '…' : '')

    return (
      <div className="rounded border border-green-300 overflow-hidden text-[10px] leading-tight">
        <div
          role="button"
          tabIndex={0}
          className="bg-[#fff7ed] text-[#9a3412] px-1 py-0.5 border-b border-dashed border-orange-200 cursor-pointer hover:bg-[#ffedd5]"
          onClick={() => onPlanClick(plan.date, plan)}
          onKeyDown={(e) => e.key === 'Enter' && onPlanClick(plan.date, plan)}
          title="Planned session"
        >
          <span className="font-medium">Plan</span> {icon(plan.sport)} {planLabel}
          <span className="text-[#b45309]"> · ◇{planLoad} · {planDur}</span>
        </div>
        <div
          role="button"
          tabIndex={0}
          className="bg-[#eff4ff] text-[#1e40af] px-1 py-0.5 cursor-pointer hover:bg-[#dbeafe] relative"
          onClick={() => onActivityClick(a.id)}
          onKeyDown={(e) => e.key === 'Enter' && onActivityClick(a.id)}
          title={a.name ?? undefined}
        >
          {!hasFeel && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" title="Feel not logged" />
          )}
          <span className="font-medium">Done</span> {icon(a.sport_type)} {actName}
          {tag && <span className="ml-0.5 text-[9px] uppercase bg-black/5 px-0.5 rounded">{tag}</span>}
          <span className="text-[#1d4ed8]"> · <b>{a.load}</b> · {actDur}</span>
          <span className="block text-[9px] text-[#667085] mt-0.5">
            Load ◇{planLoad} → <b>{a.load}</b>
            {plan.duration_min != null && ` · Time ${planDur} → ${actDur}`}
          </span>
        </div>
      </div>
    )
  }

  if (entry.kind === 'planned') {
    const p = entry.plan
    return (
      <div
        className="bg-[#fff7ed] text-[#9a3412] border border-dashed border-orange-300 rounded px-1 py-0.5 cursor-pointer text-[10px]"
        onClick={() => onPlanClick(p.date, p)}
      >
        {icon(p.sport)} {p.description || p.sport} ◇{p.target_load ?? 0}
        {p.duration_min != null && <span className="text-[#b45309]"> · {p.duration_min}m</span>}
      </div>
    )
  }

  const a = entry.activity
  const cat = classifyActual(a.sport_type, a.name ?? '', a.description, a.moving_time, framework)
  const tag = CAT_TAG[cat]
  const hasFeel = feelIds.has(a.id)
  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-[#eff4ff] text-[#1e40af] rounded px-1 py-0.5 cursor-pointer hover:bg-[#dbeafe] relative text-[10px]"
      onClick={() => onActivityClick(a.id)}
      onKeyDown={(e) => e.key === 'Enter' && onActivityClick(a.id)}
      title={a.name ?? undefined}
    >
      {!hasFeel && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" title="Feel not logged" />
      )}
      {icon(a.sport_type)} {(a.name ?? a.sport_type).slice(0, 18)}{(a.name && a.name.length > 18) ? '…' : ''}
      {tag && <span className="ml-1 text-[9px] uppercase bg-black/5 px-1 rounded">{tag}</span>}
      <b className="ml-0.5">{a.load}</b>
    </div>
  )
}
