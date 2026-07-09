'use client'
import { useEffect, useState } from 'react'

interface PendingActivity {
  id: number; name: string | null; sport_type: string; start_local: string; load: number
  category: string | null; category_override: string | null; perceived_exertion: number | null
}

export function FeelClient() {
  const [pending, setPending] = useState<PendingActivity[]>([])
  const [form, setForm] = useState<Record<number, { rpe: string; feel: string; soreness: string; note: string; category: string }>>({})

  const load = () => fetch('/api/feel').then((r) => r.json()).then((d) => setPending(d.pending ?? []))
  useEffect(() => { load() }, [])

  async function save(activityId: number) {
    const f = form[activityId] ?? { rpe: '', feel: 'normal', soreness: '', note: '', category: '' }
    await fetch('/api/feel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_id: activityId,
        rpe: f.rpe ? +f.rpe : null,
        feel_flag: f.feel || null,
        soreness: f.soreness ? +f.soreness : null,
        note: f.note || null,
        category_override: f.category || null,
      }),
    })
    load()
  }

  if (!pending.length) return <div><h1 className="text-xl font-bold mb-4">Feel entry</h1><p className="text-[#667085]">All recent activities have feel data — nice work.</p></div>

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Feel entry</h1>
      <p className="text-sm text-[#667085] mb-4">Log RPE, feel, soreness, and confirm session category.</p>
      <div className="space-y-4">
        {pending.map((a) => {
          const f = form[a.id] ?? { rpe: String(a.perceived_exertion ?? ''), feel: 'normal', soreness: '', note: '', category: a.category_override ?? a.category ?? '' }
          return (
            <div key={a.id} className="bg-white border rounded-xl p-4 text-sm">
              <div className="font-semibold mb-2">{a.start_local.slice(0, 10)} · {a.sport_type} · {a.name}</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <label>RPE (1–10)<input type="number" min={1} max={10} className="w-full border rounded p-2 mt-1" value={f.rpe} onChange={(e) => setForm({ ...form, [a.id]: { ...f, rpe: e.target.value } })} /></label>
                <label>Feel<select className="w-full border rounded p-2 mt-1" value={f.feel} onChange={(e) => setForm({ ...form, [a.id]: { ...f, feel: e.target.value } })}><option value="strong">Strong</option><option value="normal">Normal</option><option value="tired">Tired</option></select></label>
                <label>Soreness (1–10)<input type="number" className="w-full border rounded p-2 mt-1" value={f.soreness} onChange={(e) => setForm({ ...form, [a.id]: { ...f, soreness: e.target.value } })} /></label>
                <label>Category override<select className="w-full border rounded p-2 mt-1" value={f.category} onChange={(e) => setForm({ ...form, [a.id]: { ...f, category: e.target.value } })}><option value="">Auto ({a.category})</option><option value="strength">Strength</option><option value="longRun">Long run</option><option value="longRide">Long ride</option><option value="intervalRun">Interval run</option><option value="intervalRide">Interval ride</option><option value="other">Other</option></select></label>
              </div>
              <label>Note<textarea className="w-full border rounded p-2 mt-1" value={f.note} onChange={(e) => setForm({ ...form, [a.id]: { ...f, note: e.target.value } })} /></label>
              <button onClick={() => save(a.id)} className="mt-2 bg-[#2563eb] text-white px-3 py-1 rounded">Save</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
