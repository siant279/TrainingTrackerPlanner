'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { activityDateKey } from '@/lib/dates'
import { buildDailyLoadMap, computeLoadSeries, freshInterp, isoWeekKey } from '@/lib/load'
import type { Activity } from '@/lib/types'

const WINDOWS = [7, 30, 90, 180, 365]

export function DashboardClient() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [windowDays, setWindowDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/activities?days=${windowDays + 42}`)
      .then((r) => r.json())
      .then((d) => { setActivities(d.activities ?? []); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [windowDays])

  if (loading) return <p className="text-[#667085] py-10 text-center">Loading activities…</p>
  if (error) return <p className="text-red-700">Error: {error}</p>
  if (!activities.length) return <p className="text-[#667085]">No activities yet. Connect Strava and run a backfill from the Connect page.</p>

  const map = buildDailyLoadMap(activities)
  const { windowRows } = computeLoadSeries(map, windowDays)
  const last = windowRows[windowRows.length - 1]
  const interp = freshInterp(last?.base ?? 0, last?.tired ?? 0)

  const weeks: Record<string, number> = {}
  windowRows.forEach((r) => { const k = isoWeekKey(r.date); weeks[k] = (weeks[k] ?? 0) + r.load })
  const weekData = Object.keys(weeks).sort().slice(-16).map((k) => ({ week: k.slice(5), load: Math.round(weeks[k]) }))

  const recent = activities.filter((a) => a.count_toward_load && a.load > 0).slice(0, 14)

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Base · Tiredness · Restedness</h1>
      <p className="text-sm text-[#667085] mb-4">Rolling-average load · walks & e-bikes excluded</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-[#e7e9ee] rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-[#667085] font-semibold">Base fitness</div>
          <div className="text-3xl font-bold text-[#2563eb]">{Math.round(last?.base ?? 0)}</div>
          <div className="text-xs text-[#667085]">42-day average load</div>
        </div>
        <div className="bg-white border border-[#e7e9ee] rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-[#667085] font-semibold">Tiredness</div>
          <div className="text-3xl font-bold text-[#ea580c]">{Math.round(last?.tired ?? 0)}</div>
          <div className="text-xs text-[#667085]">7-day average load</div>
        </div>
        <div className="bg-white border border-[#e7e9ee] rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-[#667085] font-semibold">Restedness</div>
          <div className="text-3xl font-bold text-[#16a34a]">{(last?.rested ?? 0) >= 0 ? '+' : ''}{Math.round(last?.rested ?? 0)}</div>
          <div className="text-xs" style={{ color: interp.color }}>{interp.text}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {WINDOWS.map((d) => (
          <button key={d} onClick={() => setWindowDays(d)} className={`text-sm px-3 py-1 rounded-lg border ${windowDays === d ? 'bg-[#2563eb] text-white border-[#2563eb]' : 'bg-white border-[#d5d9e2]'}`}>{d === 365 ? '1 year' : `${d} days`}</button>
        ))}
      </div>

      <div className="bg-white border border-[#e7e9ee] rounded-xl p-4 mb-4 h-80">
        <h2 className="text-sm font-semibold mb-2">Base · Tiredness · Restedness over time</h2>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={windowRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="base" stroke="#2563eb" dot={false} name="Base" />
            <Line yAxisId="left" type="monotone" dataKey="tired" stroke="#ea580c" dot={false} name="Tiredness" />
            <Line yAxisId="right" type="monotone" dataKey="rested" stroke="#16a34a" dot={false} strokeDasharray="4 3" name="Restedness" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-[#e7e9ee] rounded-xl p-4 mb-4 h-52">
        <h2 className="text-sm font-semibold mb-2">Weekly training load</h2>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={weekData}>
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="load" fill="#93c5fd" stroke="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-[#e7e9ee] rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-2">Recent sessions</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[#667085] text-xs uppercase"><th className="py-2">Date</th><th>Sport</th><th>Activity</th><th className="text-right">Load</th></tr></thead>
          <tbody>
            {recent.map((a) => (
              <tr key={a.id} className="border-t border-[#eef0f4]">
                <td className="py-2">{activityDateKey(a)}</td>
                <td><span className="text-xs bg-[#eef2ff] text-[#3730a3] px-2 py-0.5 rounded-full">{a.sport_type}</span></td>
                <td>{(a.name ?? '').slice(0, 48)}</td>
                <td className="text-right font-medium">{a.load}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
