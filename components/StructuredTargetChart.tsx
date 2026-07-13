'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { stepsToChartSeries, wattsAt } from '@/lib/structured-workout'
import type { StructuredStep } from '@/lib/types'

type Props = {
  steps: StructuredStep[]
  displayFtp: number
  assumedFtp?: number | null
}

export function StructuredTargetChart({ steps, displayFtp, assumedFtp = 205 }: Props) {
  const data = stepsToChartSeries(steps)
  if (!data.length) return null
  const peakPct = Math.max(...data.map((d) => d.pct), 100)

  return (
    <div className="mb-2">
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
            <XAxis
              dataKey="min"
              tick={{ fontSize: 9 }}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              label={{ value: 'min', position: 'insideBottomRight', offset: -2, fontSize: 9 }}
            />
            <YAxis
              domain={[0, Math.ceil(peakPct / 10) * 10]}
              tick={{ fontSize: 9 }}
              tickFormatter={(v: number) => `${v}%`}
              width={36}
            />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(value) => {
                const pct = typeof value === 'number' ? value : Number(value)
                if (!Number.isFinite(pct)) return ['—', '%FTP']
                return [`${pct}% · ${wattsAt(pct / 100, displayFtp)} W @ FTP ${displayFtp}`, '%FTP']
              }}
              labelFormatter={(label) => `${label} min`}
            />
            <Area
              type="linear"
              dataKey="pct"
              stroke="#2563eb"
              fill="#93c5fd"
              fillOpacity={0.45}
              strokeWidth={1.5}
              isAnimationActive={false}
              name="%FTP"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[#667085] mt-1">
        Targets shown at FTP {displayFtp}
        {assumedFtp != null && assumedFtp !== displayFtp
          ? ` — this file was often built for ~${assumedFtp}`
          : null}
        . Shape is %FTP; watts rescale with FTP.
      </p>
    </div>
  )
}
