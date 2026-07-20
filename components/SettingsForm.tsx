'use client'
import { useEffect, useState } from 'react'
import type { Framework } from '@/lib/types'

type Physiology = {
  ftp: number | null
  threshold_pace: string | null
  lthr: number | null
}

export function SettingsForm() {
  const [fw, setFw] = useState<Framework | null>(null)
  const [phys, setPhys] = useState<Physiology>({ ftp: null, threshold_pace: null, lthr: null })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      setFw(d.framework)
      setPhys({
        ftp: d.physiology?.ftp ?? null,
        threshold_pace: d.physiology?.threshold_pace ?? null,
        lthr: d.physiology?.lthr ?? null,
      })
    })
  }, [])

  async function save() {
    if (!fw) return
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework: fw, physiology: phys }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!fw) return <p className="text-[#667085]">Loading…</p>

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">Settings</h1>
        <p className="text-sm text-[#667085]">
          Load = hours × intensity² × 100. TrainingPeaks TSS passes through; Strava uses power, HR, flat pace, RPE, or sport defaults.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Physiology (for Load)</h2>
        <div className="grid grid-cols-2 gap-3">
          <label>FTP (watts)
            <input
              type="number"
              className="w-full border rounded p-2 mt-1"
              value={phys.ftp ?? ''}
              placeholder="e.g. 205"
              onChange={(e) => setPhys({ ...phys, ftp: e.target.value ? +e.target.value : null })}
            />
          </label>
          <label>LTHR (bpm)
            <input
              type="number"
              className="w-full border rounded p-2 mt-1"
              value={phys.lthr ?? ''}
              placeholder="e.g. 165"
              onChange={(e) => setPhys({ ...phys, lthr: e.target.value ? +e.target.value : null })}
            />
          </label>
          <label className="col-span-2">Threshold pace (flat, min:sec / km)
            <input
              type="text"
              className="w-full border rounded p-2 mt-1"
              value={phys.threshold_pace ?? ''}
              placeholder="e.g. 5:30"
              onChange={(e) => setPhys({ ...phys, threshold_pace: e.target.value || null })}
            />
          </label>
        </div>
        <p className="text-xs text-[#667085]">
          Runs prefer heart rate over pace when LTHR is set (better for hills/trails). Pace is only used when elevation gain is under ~20&nbsp;m/km.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Framework</h2>
        <div className="grid grid-cols-2 gap-3">
          <label>Week hours min<input type="number" className="w-full border rounded p-2 mt-1" value={fw.weekHoursMin} onChange={(e) => setFw({ ...fw, weekHoursMin: +e.target.value })} /></label>
          <label>Week hours max<input type="number" className="w-full border rounded p-2 mt-1" value={fw.weekHoursMax} onChange={(e) => setFw({ ...fw, weekHoursMax: +e.target.value })} /></label>
          <label>Long run min (sec)<input type="number" className="w-full border rounded p-2 mt-1" value={fw.longRunMinSec} onChange={(e) => setFw({ ...fw, longRunMinSec: +e.target.value })} /></label>
          <label>Long ride min (sec)<input type="number" className="w-full border rounded p-2 mt-1" value={fw.longRideMinSec} onChange={(e) => setFw({ ...fw, longRideMinSec: +e.target.value })} /></label>
          <label>Day start (min from midnight)<input type="number" className="w-full border rounded p-2 mt-1" value={fw.dayStartMin} onChange={(e) => setFw({ ...fw, dayStartMin: +e.target.value })} /></label>
          <label>Day end (min from midnight)<input type="number" className="w-full border rounded p-2 mt-1" value={fw.dayEndMin} onChange={(e) => setFw({ ...fw, dayEndMin: +e.target.value })} /></label>
        </div>
        <h3 className="font-semibold pt-2">Weekly targets (min counts)</h3>
        <div className="grid grid-cols-2 gap-3">
          <label>Strength min<input type="number" className="w-full border rounded p-2 mt-1" value={fw.targets.strength.min} onChange={(e) => setFw({ ...fw, targets: { ...fw.targets, strength: { ...fw.targets.strength, min: +e.target.value } } })} /></label>
          <label>Strength max<input type="number" className="w-full border rounded p-2 mt-1" value={fw.targets.strength.max} onChange={(e) => setFw({ ...fw, targets: { ...fw.targets, strength: { ...fw.targets.strength, max: +e.target.value } } })} /></label>
          <label>Long runs<input type="number" className="w-full border rounded p-2 mt-1" value={fw.targets.longRun} onChange={(e) => setFw({ ...fw, targets: { ...fw.targets, longRun: +e.target.value } })} /></label>
          <label>Long rides<input type="number" className="w-full border rounded p-2 mt-1" value={fw.targets.longRide} onChange={(e) => setFw({ ...fw, targets: { ...fw.targets, longRide: +e.target.value } })} /></label>
          <label>Interval runs<input type="number" className="w-full border rounded p-2 mt-1" value={fw.targets.intervalRun} onChange={(e) => setFw({ ...fw, targets: { ...fw.targets, intervalRun: +e.target.value } })} /></label>
          <label>Interval rides<input type="number" className="w-full border rounded p-2 mt-1" value={fw.targets.intervalRide} onChange={(e) => setFw({ ...fw, targets: { ...fw.targets, intervalRide: +e.target.value } })} /></label>
        </div>
      </div>

      <div>
        <button onClick={save} className="bg-[#2563eb] text-white px-4 py-2 rounded-lg text-sm">Save</button>
        {saved && <span className="text-green-700 text-sm ml-2">Saved</span>}
      </div>
    </div>
  )
}
