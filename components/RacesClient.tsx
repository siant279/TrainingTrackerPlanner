'use client'
import { useEffect, useState } from 'react'
import type { Race } from '@/lib/types'

export function RacesClient() {
  const [races, setRaces] = useState<Race[]>([])
  const [form, setForm] = useState({ date: '', name: '', sport: 'Run', priority: 'B' })

  const load = () => fetch('/api/races').then((r) => r.json()).then((d) => setRaces(d.races ?? []))
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.date || !form.name) return
    await fetch('/api/races', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setForm({ date: '', name: '', sport: 'Run', priority: 'B' })
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/races?id=${id}`, { method: 'DELETE' })
    load()
  }

  function daysUntil(date: string) {
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">Races</h1>
      <div className="bg-white border rounded-xl p-4 mb-4 space-y-2 text-sm">
        <input type="date" className="border rounded p-2 w-full" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input placeholder="Race name" className="border rounded p-2 w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="border rounded p-2 w-full" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}><option>Run</option><option>Ride</option><option>Triathlon</option></select>
        <select className="border rounded p-2 w-full" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>A</option><option>B</option><option>C</option></select>
        <button onClick={add} className="bg-[#2563eb] text-white px-4 py-2 rounded-lg">Add race</button>
      </div>
      <ul className="space-y-2">
        {races.map((r) => (
          <li key={r.id} className="bg-white border rounded-lg p-3 flex justify-between items-center text-sm">
            <div><span className="font-bold">{r.name}</span> · {r.date} · {r.priority}-race · <span className="text-[#667085]">{daysUntil(r.date)}d</span></div>
            <button className="text-red-600 text-xs" onClick={() => remove(r.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
