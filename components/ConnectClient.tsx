'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = {
  demo: boolean
  activities: number
  googleConnected: boolean
  ingestConfigured: boolean
  journalSyncConfigured: boolean
  cronConfigured: boolean
  googleConfigured: boolean
}

export function ConnectClient() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/connect/status').then((r) => r.json()).then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    const google = searchParams.get('google')
    const error = searchParams.get('error')
    if (google === 'connected') setMsg('Google Calendar connected.')
    if (error === 'google_not_configured') setMsg('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.')
    if (error === 'google_failed') setMsg('Google OAuth failed — check redirect URI matches NEXT_PUBLIC_APP_URL.')
  }, [searchParams])

  async function runRecompute() {
    setLoading(true)
    setMsg(null)
    const secret = prompt('Enter CRON_SECRET to authorize load recompute:')
    if (!secret) { setLoading(false); return }
    const resp = await fetch('/api/cron/recompute-load', {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await resp.json().catch(() => ({}))
    setMsg(resp.ok ? 'Daily load cache updated.' : (data.error || 'Recompute failed'))
    setLoading(false)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">Connect</h1>

      {status?.demo && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
          Demo mode — set DEMO_MODE=false and add Supabase keys for live data.
        </p>
      )}

      {status && !status.demo && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-900">
          <b>{status.activities.toLocaleString()}</b> activities in Supabase (TrainingPeaks history imported).
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 space-y-5 text-sm">
        <div>
          <h2 className="font-semibold mb-1">Strava (ongoing sync)</h2>
          <p className="text-[#667085] mb-2">
            New workouts sync via chilli-journal&apos;s Strava webhook → tracker ingest.
            History was imported from TrainingPeaks — no Strava backfill needed.
          </p>
          <ul className="text-xs text-[#667085] space-y-1 list-disc ml-4">
            <li>Tracker: set <code className="bg-gray-100 px-1 rounded">TRACKER_INGEST_SECRET</code> in .env.local</li>
            <li>Chilli-journal: set <code className="bg-gray-100 px-1 rounded">TRACKER_INGEST_URL</code> + same secret</li>
            <li>See <code className="bg-gray-100 px-1 rounded">docs/GO_LIVE.md</code> for deploy steps</li>
          </ul>
          {status && (
            <p className="text-xs mt-2 space-y-0.5">
              <span className="block">Ingest secret: {status.ingestConfigured ? '✓ configured' : '✗ not set'}</span>
              <span className="block">Backup sync (cron): {status.journalSyncConfigured ? '✓ journal token API' : '✗ set JOURNAL_INTERNAL_SECRET'}</span>
            </p>
          )}
        </div>

        <div>
          <h2 className="font-semibold mb-1">Google Calendar</h2>
          <p className="text-[#667085] mb-2">Read-only access for busy blocks on the planner.</p>
          {status?.googleConnected ? (
            <p className="text-green-700 text-sm mb-2">✓ Connected</p>
          ) : status?.googleConfigured ? (
            <a href="/api/google/connect" className="inline-block bg-[#2563eb] text-white px-4 py-2 rounded-lg">Connect Google Calendar</a>
          ) : (
            <p className="text-amber-800 text-sm">Add Google OAuth credentials to .env.local to enable.</p>
          )}
        </div>

        <div>
          <h2 className="font-semibold mb-1">Daily load cache</h2>
          <p className="text-[#667085] mb-2">Optional — dashboard computes live; this populates the nightly cache table.</p>
          <button
            type="button"
            onClick={runRecompute}
            disabled={loading || status?.demo}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Recompute daily load'}
          </button>
          {status && (
            <p className="text-xs mt-2 text-[#667085]">
              Cron secret: {status.cronConfigured ? '✓ configured' : '✗ not set'}
            </p>
          )}
        </div>

        {msg && <p className="text-sm border-t pt-3">{msg}</p>}
      </div>
    </div>
  )
}
