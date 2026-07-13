'use client'
import { useCallback, useEffect, useState } from 'react'
import { ActivityDetailModal } from '@/components/ActivityDetailModal'
import { PlannerDayEntry } from '@/components/PlannerDayEntry'
import { PlannerRaceEntry } from '@/components/PlannerRaceEntry'
import { classifyActual, classifyPlanned, targetMin, TARGET_KEYS } from '@/lib/classify'
import { availabilityForDay, availColor, buildBusyMap, minLabel } from '@/lib/availability'
import { CalendarBusyStrip } from '@/components/CalendarBusyStrip'
import { activityDateKey, addCalendarDays, calendarDateKey, compareCalendarKeys, formatDateRange, mondayOf, parseCalendarDate } from '@/lib/dates'
import { buildDayEntries } from '@/lib/planner-day-entries'
import { buildDailyLoadMap, freshInterp, loadMetricsOnDate, metricsAsOfKey } from '@/lib/load'
import type { Activity, Framework, PlannedWorkout, Race, StructuredStep, StructuredWorkout } from '@/lib/types'
import { StructuredTargetChart } from '@/components/StructuredTargetChart'

const SPORTS = ['Run','TrailRun','Ride','GravelRide','MountainBikeRide','VirtualRide','Swim','WeightTraining','Yoga','Other']
const EMPTY_FORM = {
  sport: 'Run',
  type: 'Easy',
  dur: '',
  desc: '',
  load: '',
  structuredId: null as string | null,
  structuredName: '' as string,
  structuredMins: null as number | null,
  structuredSteps: null as StructuredStep[] | null,
  loadLocked: false,
  displayFtp: 229,
}

const DEMO_HISTORY_START = '2026-01-01'
const BLOCK_DAYS = 28
const WEEKS_IN_VIEW = 4

function planEndKey(todayKey: string): string {
  const year = parseCalendarDate(todayKey).getFullYear()
  return `${year}-12-31`
}

function historyStartKey(earliest: string | null): string {
  const start = earliest ?? DEMO_HISTORY_START
  return calendarDateKey(mondayOf(parseCalendarDate(start)))
}

export function PlannerClient() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [planned, setPlanned] = useState<PlannedWorkout[]>([])
  const [races, setRaces] = useState<Race[]>([])
  const [framework, setFramework] = useState<Framework | null>(null)
  const [busy, setBusy] = useState<Record<string, { startMin: number; endMin: number; title: string }[]>>({})
  const [feelIds, setFeelIds] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ date: string; item?: PlannedWorkout } | null>(null)
  const [activityDetail, setActivityDetail] = useState<{ id: number; plan?: PlannedWorkout } | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fileBusy, setFileBusy] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [viewBlockOffset, setViewBlockOffset] = useState(0)
  const [earliestActivity, setEarliestActivity] = useState<string | null>(null)

  const todayKey = calendarDateKey(new Date())
  const week0Key = calendarDateKey(mondayOf(parseCalendarDate(todayKey)))
  const viewStartKey = addCalendarDays(week0Key, viewBlockOffset * BLOCK_DAYS)
  const viewEndKey = addCalendarDays(viewStartKey, BLOCK_DAYS - 1)
  const historyStart = historyStartKey(earliestActivity)
  const planEnd = planEndKey(todayKey)

  const canGoEarlier = compareCalendarKeys(viewStartKey, historyStart) > 0
  const canGoLater = compareCalendarKeys(viewEndKey, planEnd) < 0

  const loadViewData = useCallback(async () => {
    const from = viewStartKey
    const to = viewEndKey
    const [planR, calR, raceR] = await Promise.all([
      fetch(`/api/planned-workouts?from=${from}&to=${to}`).then((r) => r.json()),
      fetch(`/api/calendar/events?from=${from}&to=${to}`).then((r) => r.json()).catch(() => ({ events: [] })),
      fetch('/api/races').then((r) => r.json()),
    ])
    setPlanned(planR.planned ?? [])
    setRaces(raceR.races ?? [])
    if (framework) setBusy(buildBusyMap(calR.events ?? [], framework))
  }, [viewStartKey, viewEndKey, framework])

  const loadAll = useCallback(async () => {
    const historyFrom = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? DEMO_HISTORY_START : '2000-01-01'
    const [actR, raceR, setR, feelR] = await Promise.all([
      fetch(`/api/activities?from=${historyFrom}&to=${todayKey}`).then((r) => r.json()),
      fetch('/api/races').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/feel').then((r) => r.json()),
    ])
    setActivities(actR.activities ?? [])
    if (actR.earliest) setEarliestActivity(actR.earliest)
    setRaces(raceR.races ?? [])
    setFramework(setR.framework)
    const logged = new Set<number>((feelR.feels ?? []).map((f: { activity_id: number }) => f.activity_id))
    setFeelIds(logged)
  }, [todayKey])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!framework) return
    loadViewData()
  }, [framework, loadViewData])

  useEffect(() => {
    const refreshRaces = () => {
      fetch('/api/races').then((r) => r.json()).then((d) => setRaces(d.races ?? []))
    }
    window.addEventListener('focus', refreshRaces)
    return () => window.removeEventListener('focus', refreshRaces)
  }, [])

  const actuals: Record<string, Activity[]> = {}
  for (const a of activities) {
    if (!a.count_toward_load) continue
    const k = activityDateKey(a)
    ;(actuals[k] ??= []).push(a)
  }

  const map = buildDailyLoadMap(activities)
  const metricsAsOf = metricsAsOfKey(viewStartKey, viewEndKey, todayKey)
  const metrics = loadMetricsOnDate(map, metricsAsOf)
  const interp = freshInterp(metrics?.base ?? 0, metrics?.tired ?? 0)
  const metricsAsOfLabel = metricsAsOf !== todayKey
    ? parseCalendarDate(metricsAsOf).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  function openAdd(date: string) {
    setModal({ date })
    setForm({ ...EMPTY_FORM })
    setFileError(null)
  }
  function openEdit(date: string, item: PlannedWorkout) {
    setModal({ date, item })
    setForm({
      ...EMPTY_FORM,
      sport: item.sport,
      type: item.type,
      dur: String(item.duration_min ?? ''),
      desc: item.description ?? '',
      load: String(item.target_load ?? ''),
      structuredId: item.structured_workout_id,
      structuredName: item.structured_workout_id ? 'Attached structured file' : '',
      loadLocked: Boolean(item.target_load),
    })
    setFileError(null)
    if (item.structured_workout_id) {
      void fetch(`/api/structured-workouts?id=${item.structured_workout_id}`)
        .then((r) => r.json())
        .then((d: { structured?: StructuredWorkout }) => {
          if (!d.structured) return
          setForm((f) => ({
            ...f,
            structuredName: d.structured!.name,
            structuredMins: Math.round(d.structured!.duration_sec / 60),
            structuredSteps: d.structured!.steps,
          }))
        })
        .catch(() => { /* keep stub label */ })
    }
  }

  async function onStructuredFile(file: File | null) {
    if (!file) return
    setFileBusy(true)
    setFileError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      let contents: string
      if (ext === 'fit') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
        contents = btoa(binary)
      } else {
        contents = await file.text()
      }
      const resp = await fetch('/api/structured-workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contents,
          // .erg prefers FTP= from the file header; .fit needs an authoring FTP for absolute watts
          ...(ext === 'fit' ? { ftpForErg: form.displayFtp || 205 } : {}),
        }),
      })
      const data = await resp.json() as {
        structured?: StructuredWorkout
        estimatedLoad?: number
        error?: string
      }
      if (!resp.ok || !data.structured) throw new Error(data.error || 'Import failed')
      const mins = Math.round(data.structured.duration_sec / 60)
      setForm((f) => ({
        ...f,
        structuredId: data.structured!.id,
        structuredName: data.structured!.name || file.name,
        structuredMins: mins,
        structuredSteps: data.structured!.steps,
        sport: f.sport === 'Run' ? 'Ride' : f.sport,
        desc: f.desc || data.structured!.name,
        dur: f.dur || String(mins),
        load: f.loadLocked || f.load ? f.load : String(data.estimatedLoad ?? ''),
      }))
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setFileBusy(false)
    }
  }

  async function savePlanned() {
    if (!modal) return
    const body = {
      id: modal.item?.id,
      date: modal.date,
      sport: form.sport,
      type: form.type,
      duration_min: form.dur ? Number(form.dur) : null,
      description: form.desc || null,
      target_load: form.load ? Number(form.load) : null,
      structured_workout_id: form.structuredId ?? null,
    }
    await fetch('/api/planned-workouts', { method: modal.item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setModal(null)
    loadViewData()
  }

  async function deletePlanned() {
    if (!modal?.item) return
    await fetch(`/api/planned-workouts?id=${modal.item.id}`, { method: 'DELETE' })
    setModal(null)
    loadViewData()
  }

  function weekLabel(w: number, wkStartKey: string): string {
    if (viewBlockOffset === 0 && w === 0) return 'This week'
    if (viewBlockOffset === 0 && w === 1) return 'Next week'
    if (viewBlockOffset === 0 && w === 2) return 'In 2 weeks'
    if (viewBlockOffset === 0 && w === 3) return 'In 3 weeks'
    const d = parseCalendarDate(wkStartKey)
    return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  }

  if (!framework) return <p className="text-[#667085] py-10 text-center">Loading planner…</p>

  const weeks = Array.from({ length: WEEKS_IN_VIEW }, (_, i) => i)
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Training Planner</h1>
      <p className="text-sm text-[#667085] mb-3">Navigate weeks · click a synced workout for details & feel · walks & e-bikes excluded</p>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <button
          type="button"
          className="text-sm px-3 py-1.5 border rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          disabled={!canGoEarlier}
          onClick={() => setViewBlockOffset((n) => n - 1)}
        >
          ← Earlier
        </button>
        <span className="text-sm font-medium text-[#344054]">{formatDateRange(viewStartKey, viewEndKey)}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-sm px-3 py-1.5 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
            disabled={viewBlockOffset === 0}
            onClick={() => setViewBlockOffset(0)}
          >
            Today
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1.5 border rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            disabled={!canGoLater}
            onClick={() => setViewBlockOffset((n) => n + 1)}
          >
            Later →
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4 items-end">
        <div className="bg-white border rounded-lg px-3 py-2"><div className="text-[10px] uppercase text-[#667085]">Base</div><div className="text-xl font-bold text-[#2563eb]">{Math.round(metrics?.base ?? 0)}</div></div>
        <div className="bg-white border rounded-lg px-3 py-2"><div className="text-[10px] uppercase text-[#667085]">Tiredness</div><div className="text-xl font-bold text-[#ea580c]">{Math.round(metrics?.tired ?? 0)}</div></div>
        <div className="bg-white border rounded-lg px-3 py-2"><div className="text-[10px] uppercase text-[#667085]">Restedness</div><div className="text-xl font-bold text-[#16a34a]">{(metrics?.rested ?? 0) >= 0 ? '+' : ''}{Math.round(metrics?.rested ?? 0)}</div></div>
        <div className="text-sm self-center" style={{ color: interp.color }}>
          {interp.text}
          {metricsAsOfLabel && <span className="block text-[10px] text-[#667085] mt-0.5">as of {metricsAsOfLabel}</span>}
        </div>
      </div>

      {weeks.map((w) => {
        const wkStartKey = addCalendarDays(viewStartKey, w * 7)
        const dateKeys = Array.from({ length: 7 }, (_, i) => addCalendarDays(wkStartKey, i))
        let planSum = 0, actSum = 0
        const done: Record<string, number> = {}, plnd: Record<string, number> = {}
        TARGET_KEYS.forEach((k) => { done[k] = 0; plnd[k] = 0 })
        let actHrs = 0, planHrs = 0
        dateKeys.forEach((key) => {
          const dayPlans = planned.filter((p) => p.date === key)
          const dayActs = actuals[key] ?? []
          const entries = buildDayEntries(dayPlans, dayActs, framework)
          for (const e of entries) {
            if (e.kind === 'merged') {
              actSum += e.activity.load
              actHrs += e.activity.moving_time / 3600
              const c = classifyActual(e.activity.sport_type, e.activity.name ?? '', e.activity.description, e.activity.moving_time, framework)
              if (c in done) done[c]++
            } else if (e.kind === 'planned') {
              planSum += e.plan.target_load ?? 0
              planHrs += (e.plan.duration_min ?? 0) / 60
              const c = classifyPlanned(e.plan.sport, e.plan.type)
              if (c in plnd) plnd[c]++
            } else {
              actSum += e.activity.load
              actHrs += e.activity.moving_time / 3600
              const c = classifyActual(e.activity.sport_type, e.activity.name ?? '', e.activity.description, e.activity.moving_time, framework)
              if (c in done) done[c]++
            }
          }
        })
        const projHrs = actHrs + planHrs
        const maxSum = Math.max(planSum, actSum, 1)
        return (
          <div key={w} className="bg-white border border-[#e7e9ee] rounded-xl p-3 mb-4">
            <div className="flex justify-between items-baseline mb-2 flex-wrap gap-2">
              <span className="font-bold text-sm">{weekLabel(w, wkStartKey)} · {parseCalendarDate(wkStartKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="text-xs text-[#667085]">Planned <b>{Math.round(planSum)}</b> · Actual <b>{Math.round(actSum)}</b>
                <span className="inline-block w-28 h-2 bg-[#eef0f4] rounded ml-2 relative align-middle">
                  <span className="absolute h-full bg-[#fcd9b6]" style={{ width: `${planSum / maxSum * 100}%` }} />
                  <span className="absolute h-full bg-[#2563eb] opacity-85" style={{ width: `${actSum / maxSum * 100}%` }} />
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full border ${projHrs >= framework.weekHoursMin && projHrs <= framework.weekHoursMax ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>⏱ {actHrs.toFixed(1)}h{planHrs ? ` +${planHrs.toFixed(1)}p` : ''} / {framework.weekHoursMin}–{framework.weekHoursMax}h</span>
              {TARGET_KEYS.map((key) => {
                const min = targetMin(framework, key)
                const dc = done[key], pc = plnd[key], met = dc >= min
                const cls = met ? 'bg-green-50 text-green-800' : dc > 0 ? 'bg-amber-50 text-amber-800' : pc > 0 ? 'border-dashed border-orange-300' : 'bg-gray-50 text-gray-400'
                const txt = met ? '✓' : dc > 0 ? `${dc}/${min}` : pc > 0 ? 'planned' : '—'
                return <span key={key} className={`px-2 py-0.5 rounded-full border ${cls}`}>{key} {txt}</span>
              })}
              <span className="text-amber-700">🧈 butter</span>
            </div>
            <div className="grid grid-cols-7 gap-1 overflow-x-auto min-w-0">
              {dateKeys.map((key) => {
                const d = parseCalendarDate(key)
                const dowLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
                const isToday = key === todayKey
                const isPast = key < todayKey
                const av = availabilityForDay(busy[key], framework)
                const dayRaces = races.filter((r) => r.date === key)
                return (
                  <div key={key} className={`border rounded-lg p-1.5 min-h-36 flex flex-col text-xs ${isToday ? 'border-[#2563eb] shadow-[inset_0_0_0_1px_#2563eb]' : ''} ${isPast ? 'bg-[#fafbfc]' : ''} ${dayRaces.length ? 'ring-1 ring-red-200/80' : ''}`}>
                    <div className={`flex justify-between font-semibold text-[#667085] mb-1 ${isToday ? 'text-[#2563eb]' : ''}`}>
                      <span>{dowLabel} {d.getDate()}</span>
                    </div>
                    <CalendarBusyStrip blocks={busy[key]} framework={framework} />
                    {!isPast && (
                      <div className="text-[10px] mb-1 flex items-center gap-1" title="Free hours">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: availColor(av.totalFreeH) }} />
                        {av.totalFreeH.toFixed(1)}h free
                        {av.biggest && (
                          <span className="text-[#98a2b3]"> · {minLabel(av.biggest[0])}–{minLabel(av.biggest[1])}</span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-1 flex-1">
                      {dayRaces.map((race) => (
                        <PlannerRaceEntry key={race.id} race={race} />
                      ))}
                      {buildDayEntries(
                        planned.filter((p) => p.date === key),
                        actuals[key] ?? [],
                        framework,
                      ).map((entry) => (
                        <PlannerDayEntry
                          key={entry.kind === 'merged' ? `m-${entry.plan.id}` : entry.kind === 'planned' ? `p-${entry.plan.id}` : `a-${entry.activity.id}`}
                          entry={entry}
                          framework={framework}
                          feelIds={feelIds}
                          onActivityClick={(id, plan) => setActivityDetail({ id, plan })}
                          onPlanClick={openEdit}
                        />
                      ))}
                    </div>
                    <button className="text-[#2563eb] text-left mt-1" onClick={() => openAdd(key)}>+ plan</button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {modal && (
        <div className="fixed inset-0 bg-black/35 flex items-center justify-center p-4 z-10" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-4 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">{modal.item ? 'Edit' : 'Add'} planned session</h3>
            <label className="text-xs text-[#667085] font-semibold">Sport</label>
            <select className="w-full border rounded mb-2 p-2 text-sm" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select>
            <label className="text-xs text-[#667085] font-semibold">Type</label>
            <select className="w-full border rounded mb-2 p-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Easy</option><option>Long</option><option>Interval</option></select>
            <label className="text-xs text-[#667085] font-semibold">Description</label>
            <input className="w-full border rounded mb-2 p-2 text-sm" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            <label className="text-xs text-[#667085] font-semibold">Duration (min)</label>
            <input type="number" className="w-full border rounded mb-2 p-2 text-sm" value={form.dur} onChange={(e) => setForm({ ...form, dur: e.target.value })} />
            <label className="text-xs text-[#667085] font-semibold">Target load</label>
            <input
              type="number"
              className="w-full border rounded mb-2 p-2 text-sm"
              value={form.load}
              onChange={(e) => setForm({ ...form, load: e.target.value, loadLocked: true })}
            />

            <label className="text-xs text-[#667085] font-semibold">Attach structured file</label>
            <input
              type="file"
              accept=".zwo,.mrc,.erg,.fit"
              className="w-full border rounded mb-1 p-2 text-sm file:mr-2 file:text-xs"
              disabled={fileBusy}
              onChange={(e) => void onStructuredFile(e.target.files?.[0] ?? null)}
            />
            {fileBusy && <p className="text-xs text-[#667085] mb-1">Parsing…</p>}
            {fileError && <p className="text-xs text-red-700 mb-1">{fileError}</p>}
            {form.structuredId && (
              <div className="text-xs bg-[#f0fdf4] border border-green-200 rounded p-2 mb-2 text-green-900">
                <div className="font-semibold truncate">{form.structuredName}</div>
                {form.structuredMins != null && <div>{form.structuredMins} min structured</div>}
                {form.structuredSteps && form.structuredSteps.length > 0 && (
                  <>
                    <label className="block text-[10px] text-[#667085] mt-2 mb-0.5">
                      Display FTP
                      <input
                        type="number"
                        className="ml-2 w-16 border rounded px-1 py-0.5 text-xs"
                        value={form.displayFtp}
                        onChange={(e) => setForm({ ...form, displayFtp: Number(e.target.value) || 229 })}
                      />
                    </label>
                    <StructuredTargetChart
                      steps={form.structuredSteps}
                      displayFtp={form.displayFtp}
                      assumedFtp={205}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="text-[10px] text-red-700 mt-1 underline"
                  onClick={() => setForm({
                    ...form,
                    structuredId: null,
                    structuredName: '',
                    structuredMins: null,
                    structuredSteps: null,
                  })}
                >
                  Detach
                </button>
              </div>
            )}

            <div className="flex justify-between mt-1">
              {modal.item && <button className="text-red-700 text-sm" onClick={deletePlanned}>Delete</button>}
              <div className="flex gap-2 ml-auto">
                <button className="text-sm px-3 py-1 bg-gray-100 rounded" onClick={() => setModal(null)}>Cancel</button>
                <button className="text-sm px-3 py-1 bg-[#2563eb] text-white rounded" onClick={savePlanned}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activityDetail && framework && (
        <ActivityDetailModal
          activityId={activityDetail.id}
          matchedPlan={activityDetail.plan}
          framework={framework}
          onClose={() => setActivityDetail(null)}
          onSaved={() => { loadAll(); loadViewData() }}
        />
      )}
    </div>
  )
}
