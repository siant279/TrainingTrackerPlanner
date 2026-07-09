'use client'
import { useEffect, useState } from 'react'
import { CAT_TAG, classifyActual } from '@/lib/classify'
import { activityDateKey } from '@/lib/dates'
import type { Activity, ActivityCategory, FeelEntry, Framework } from '@/lib/types'

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function fmtElevation(m: number | null) {
  if (!m) return '—'
  return `${Math.round(m * 3.28084).toLocaleString()} ft`
}

function fmtDistance(m: number | null, sport: string) {
  if (!m) return '—'
  if (sport.includes('Run') || sport === 'TrailRun') return `${(m / 1609.34).toFixed(1)} mi`
  return `${(m / 1000).toFixed(1)} km`
}

interface Props {
  activityId: number
  framework: Framework
  onClose: () => void
  onSaved: () => void
}

export function ActivityDetailModal({ activityId, framework, onClose, onSaved }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [feel, setFeel] = useState<FeelEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ rpe: '', feel: 'normal', soreness: '', note: '', category: '' })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/activities/${activityId}`)
      .then((r) => r.json())
      .then((d) => {
        const a = d.activity as Activity
        const f = d.feel as FeelEntry | null
        setActivity(a)
        setFeel(f)
        const autoCat = classifyActual(a.sport_type, a.name ?? '', a.description, a.moving_time, framework)
        setForm({
          rpe: String(f?.rpe ?? a.perceived_exertion ?? ''),
          feel: f?.feel_flag ?? 'normal',
          soreness: f?.soreness != null ? String(f.soreness) : '',
          note: f?.note ?? '',
          category: a.category_override ?? '',
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activityId, framework])

  async function save() {
    setSaving(true)
    await fetch('/api/feel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_id: activityId,
        rpe: form.rpe ? +form.rpe : null,
        feel_flag: form.feel || null,
        soreness: form.soreness ? +form.soreness : null,
        note: form.note || null,
        category_override: form.category || null,
      }),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  const autoCategory = activity
    ? classifyActual(activity.sport_type, activity.name ?? '', activity.description, activity.moving_time, framework)
    : null
  const effectiveCategory = (activity?.category_override ?? autoCategory) as ActivityCategory | null
  const tag = effectiveCategory ? CAT_TAG[effectiveCategory] : ''

  return (
    <div className="fixed inset-0 bg-black/35 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading || !activity ? (
          <p className="text-[#667085] text-sm py-8 text-center">Loading workout…</p>
        ) : (
          <>
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <h3 className="font-bold text-lg leading-tight">{activity.name || activity.sport_type}</h3>
                <p className="text-sm text-[#667085] mt-1">
                  {activityDateKey(activity)} · {activity.sport_type.replace(/([A-Z])/g, ' $1').trim()}
                  {tag && <span className="ml-2 text-[10px] uppercase bg-black/5 px-1.5 py-0.5 rounded">{tag}</span>}
                </p>
              </div>
              <a
                href={`https://www.strava.com/activities/${activity.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#fc4c02] font-semibold whitespace-nowrap hover:underline"
              >
                Open in Strava ↗
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <div className="bg-[#f7f8fa] rounded-lg p-3"><div className="text-[10px] uppercase text-[#667085] font-semibold">Load</div><div className="text-xl font-bold text-[#2563eb]">{activity.load}</div></div>
              <div className="bg-[#f7f8fa] rounded-lg p-3"><div className="text-[10px] uppercase text-[#667085] font-semibold">Duration</div><div className="text-xl font-bold">{fmtDuration(activity.moving_time)}</div></div>
              <div className="bg-[#f7f8fa] rounded-lg p-3"><div className="text-[10px] uppercase text-[#667085] font-semibold">Distance</div><div className="font-semibold">{fmtDistance(activity.distance, activity.sport_type)}</div></div>
              <div className="bg-[#f7f8fa] rounded-lg p-3"><div className="text-[10px] uppercase text-[#667085] font-semibold">Elevation</div><div className="font-semibold">{fmtElevation(activity.elevation)}</div></div>
            </div>

            {activity.description && (
              <p className="text-sm text-[#344054] mb-4 whitespace-pre-wrap border-l-2 border-[#eef0f4] pl-3">{activity.description}</p>
            )}

            {activity.relative_effort != null && (
              <p className="text-xs text-[#667085] mb-4">Strava Relative Effort: <b>{activity.relative_effort}</b>
                {activity.perceived_exertion != null && <> · Strava RPE: <b>{activity.perceived_exertion}</b></>}
              </p>
            )}

            <hr className="border-[#eef0f4] my-4" />
            <h4 className="font-semibold text-sm mb-3">How did it feel?</h4>
            <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
              <label>RPE (1–10)
                <input type="number" min={1} max={10} className="w-full border rounded p-2 mt-1" value={form.rpe} onChange={(e) => setForm({ ...form, rpe: e.target.value })} />
              </label>
              <label>Feel
                <select className="w-full border rounded p-2 mt-1" value={form.feel} onChange={(e) => setForm({ ...form, feel: e.target.value })}>
                  <option value="strong">Strong</option>
                  <option value="normal">Normal</option>
                  <option value="tired">Tired</option>
                </select>
              </label>
              <label>Soreness (1–10)
                <input type="number" min={1} max={10} className="w-full border rounded p-2 mt-1" value={form.soreness} onChange={(e) => setForm({ ...form, soreness: e.target.value })} />
              </label>
              <label>Category
                <select className="w-full border rounded p-2 mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="">Auto ({autoCategory})</option>
                  <option value="strength">Strength</option>
                  <option value="longRun">Long run</option>
                  <option value="longRide">Long ride</option>
                  <option value="intervalRun">Interval run</option>
                  <option value="intervalRide">Interval ride</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label className="text-sm block mb-4">Note
              <textarea className="w-full border rounded p-2 mt-1 text-sm" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>

            <div className="flex justify-end gap-2">
              <button className="text-sm px-3 py-1.5 bg-gray-100 rounded-lg" onClick={onClose}>Close</button>
              <button className="text-sm px-3 py-1.5 bg-[#2563eb] text-white rounded-lg disabled:opacity-50" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : feel ? 'Update feel' : 'Save feel'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
