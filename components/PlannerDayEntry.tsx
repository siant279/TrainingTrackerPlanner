'use client'

import { StructuredSparkline } from '@/components/StructuredSparkline'
import { CAT_TAG, classifyActual } from '@/lib/classify'
import type { DayEntry } from '@/lib/planner-day-entries'
import type { Framework, PlannedWorkout, StructuredStep } from '@/lib/types'

const ICONS: Record<string, string> = { Run: '🏃', TrailRun: '⛰️', Ride: '🚴', WeightTraining: '🏋️', Swim: '🏊' }
const icon = (s: string) => ICONS[s] || '•'

function fmtMin(sec: number): string {
  return String(Math.round(sec / 60))
}

function StructuredBadge() {
  return (
    <span className="text-[10px] uppercase tracking-wide bg-black/5 px-1 py-0.5 rounded font-medium" title="Structured target file">
      structured
    </span>
  )
}

type Props = {
  entry: DayEntry
  framework: Framework
  feelIds: Set<number>
  structuredSteps?: StructuredStep[] | null
  onActivityClick: (id: number, plan?: PlannedWorkout) => void
  onPlanClick: (date: string, plan: PlannedWorkout) => void
}

export function PlannerDayEntry({ entry, framework, feelIds, structuredSteps, onActivityClick, onPlanClick }: Props) {
  const spark = structuredSteps && structuredSteps.length > 0
    ? <StructuredSparkline steps={structuredSteps} />
    : null

  if (entry.kind === 'merged') {
    const { plan, activity: a } = entry
    const cat = classifyActual(a.sport_type, a.name ?? '', a.description, a.moving_time, framework)
    const tag = CAT_TAG[cat]
    const planLabel = plan.description || `${plan.type} ${plan.sport}`
    const hasFeel = feelIds.has(a.id)
    const planLoad = plan.target_load != null ? String(plan.target_load) : '—'
    const planDur = plan.duration_min != null ? `${plan.duration_min}m` : null
    const actDur = `${fmtMin(a.moving_time)}m`
    const actName = a.name ?? a.sport_type

    return (
      <div
        role="button"
        tabIndex={0}
        className="rounded-lg border border-green-400 bg-gradient-to-br from-[#fff7ed] to-[#eff4ff] px-3 py-2.5 cursor-pointer hover:shadow-sm relative"
        onClick={() => onActivityClick(a.id, plan)}
        onKeyDown={(e) => e.key === 'Enter' && onActivityClick(a.id, plan)}
        title={`${planLabel} · ${actName}`}
      >
        {hasFeel ? null : (
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-amber-400" title="Feel not logged" />
        )}
        <button
          type="button"
          className="absolute top-1.5 right-6 text-xs text-[#9a3412] opacity-70 hover:opacity-100 px-1"
          onClick={(e) => { e.stopPropagation(); onPlanClick(plan.date, plan) }}
          title="Edit planned session"
          aria-label="Edit planned session"
        >
          ✎
        </button>
        <div className="pr-10">
          <div className="text-[10px] uppercase tracking-wide text-[#9a3412] font-semibold">Planned</div>
          <div className="text-sm text-[#9a3412] font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{icon(plan.sport)} {planLabel}</span>
            {plan.structured_workout_id ? <StructuredBadge /> : null}
          </div>
          {spark}
          <div className="text-[10px] uppercase tracking-wide text-[#1e40af] font-semibold mt-2">Logged</div>
          <div className="text-sm text-[#1e40af] font-medium mt-0.5">
            {icon(a.sport_type)} {actName}
            {tag ? <span className="ml-1.5 text-[10px] uppercase bg-black/5 px-1 py-0.5 rounded font-normal">{tag}</span> : null}
          </div>
          <div className="text-xs text-[#667085] mt-1">
            <span className="text-[#9a3412]">◇{planLoad}</span>
            →<b className="text-[#1e40af]">{a.load}</b>
            {planDur ? <span> · {planDur}→{actDur}</span> : <span> · {actDur}</span>}
          </div>
        </div>
      </div>
    )
  }

  if (entry.kind === 'planned') {
    const p = entry.plan
    return (
      <div
        role="button"
        tabIndex={0}
        className="bg-[#fff7ed] text-[#9a3412] border border-dashed border-orange-300 rounded-lg px-3 py-2.5 cursor-pointer hover:shadow-sm"
        onClick={() => onPlanClick(p.date, p)}
        onKeyDown={(e) => e.key === 'Enter' && onPlanClick(p.date, p)}
      >
        <div className="text-[10px] uppercase tracking-wide font-semibold">Planned</div>
        <div className="text-sm font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{icon(p.sport)} {p.description || p.sport}</span>
          <span className="text-xs font-normal">◇{p.target_load ?? 0}</span>
          {p.duration_min != null ? <span className="text-xs font-normal text-[#b45309]">{p.duration_min}m</span> : null}
          {p.structured_workout_id ? <StructuredBadge /> : null}
        </div>
        {spark}
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
      className="bg-[#eff4ff] text-[#1e40af] rounded-lg px-3 py-2.5 cursor-pointer hover:bg-[#dbeafe] relative"
      onClick={() => onActivityClick(a.id)}
      onKeyDown={(e) => e.key === 'Enter' && onActivityClick(a.id)}
      title={a.name ?? undefined}
    >
      {hasFeel ? null : (
        <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-amber-400" title="Feel not logged" />
      )}
      <div className="text-[10px] uppercase tracking-wide font-semibold pr-4">Logged</div>
      <div className="text-sm font-medium mt-0.5 pr-4">
        {icon(a.sport_type)} {a.name ?? a.sport_type}
        {tag ? <span className="ml-1.5 text-[10px] uppercase bg-black/5 px-1 py-0.5 rounded font-normal">{tag}</span> : null}
        <b className="ml-1.5">{a.load}</b>
      </div>
    </div>
  )
}
