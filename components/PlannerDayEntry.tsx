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
  onActivityClick: (id: number, plan?: PlannedWorkout) => void
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
    const planDur = plan.duration_min != null ? `${plan.duration_min}m` : null
    const actDur = `${fmtMin(a.moving_time)}m`
    const actName = (a.name ?? a.sport_type).slice(0, 22) + ((a.name?.length ?? 0) > 22 ? '…' : '')

    return (
      <div
        role="button"
        tabIndex={0}
        className="rounded border border-green-400 bg-gradient-to-br from-[#fff7ed] to-[#eff4ff] text-[10px] leading-tight px-1 py-1 cursor-pointer hover:shadow-sm relative"
        onClick={() => onActivityClick(a.id, plan)}
        onKeyDown={(e) => e.key === 'Enter' && onActivityClick(a.id, plan)}
        title={`${planLabel} · ${a.name ?? a.sport_type}`}
      >
        {!hasFeel && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" title="Feel not logged" />
        )}
        <button
          type="button"
          className="absolute top-0.5 left-0.5 text-[8px] text-[#9a3412] opacity-60 hover:opacity-100 px-0.5"
          onClick={(e) => { e.stopPropagation(); onPlanClick(plan.date, plan) }}
          title="Edit planned session"
        >
          ✎
        </button>
        <div className="pl-3 text-[#1e40af] font-medium truncate">
          {icon(a.sport_type)} {actName}
          {tag && <span className="ml-0.5 text-[9px] uppercase bg-black/5 px-0.5 rounded font-normal">{tag}</span>}
          {plan.structured_workout_id && (
            <span className="ml-0.5 text-[9px] uppercase bg-black/5 px-0.5 rounded font-normal" title="Structured target file">structured</span>
          )}
        </div>
        <div className="pl-3 text-[9px] text-[#667085] mt-0.5">
          <span className="text-[#9a3412]">{planLabel}</span>
          {' · '}◇{planLoad}→<b className="text-[#1e40af]">{a.load}</b>
          {planDur && <> · {planDur}→{actDur}</>}
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
        {p.structured_workout_id && (
          <span className="ml-0.5 text-[9px] uppercase bg-black/5 px-0.5 rounded" title="Structured target file">structured</span>
        )}
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
