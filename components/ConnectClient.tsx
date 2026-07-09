'use client'
import { useState } from 'react'

export function ConnectClient() {
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runBackfill() {
    setLoading(true)
    setMsg(null)
    const secret = prompt('Enter CRON_SECRET to authorize backfill:')
    if (!secret) { setLoading(false); return }
    const resp = await fetch('/api/backfill', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: '{}' })
    const data = await resp.json()
    setMsg(resp.ok ? `Imported ${data.imported} activities` : data.error)
    setLoading(false)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">Connect</h1>
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">Demo mode — Strava backfill and Google OAuth are disabled until you connect Supabase.</p>}
      <div className="bg-white border rounded-xl p-4 space-y-4 text-sm">
        <div>
          <h2 className="font-semibold mb-1">Strava</h2>
          <p className="text-[#667085]">Reuses your Chilli journal OAuth token and webhook. Training activities are forwarded automatically when the journal webhook is configured.</p>
        </div>
        <div>
          <h2 className="font-semibold mb-1">Google Calendar</h2>
          <p className="text-[#667085] mb-2">Read-only access for daily availability in the planner.</p>
          <a href="/api/google/connect" className="inline-block bg-[#2563eb] text-white px-4 py-2 rounded-lg">Connect Google Calendar</a>
        </div>
        <div>
          <h2 className="font-semibold mb-1">Backfill history</h2>
          <p className="text-[#667085] mb-2">One-time import of Strava activities via the journal token API.</p>
          <button onClick={runBackfill} disabled={loading} className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50">{loading ? 'Running…' : 'Run backfill'}</button>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  )
}
