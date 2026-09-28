import { stepsToChartSeries } from '@/lib/structured-workout'
import type { StructuredStep } from '@/lib/types'

const WIDTH = 200
const HEIGHT = 32

/** Mini %FTP shape. Same series and colors as StructuredTargetChart, drawn as a single area. */
export function StructuredSparkline({ steps }: { steps: StructuredStep[] }) {
  const data = stepsToChartSeries(steps)
  if (data.length < 2) return null

  let maxMin = 0
  let maxPct = 0
  for (const point of data) {
    if (point.min > maxMin) maxMin = point.min
    if (point.pct > maxPct) maxPct = point.pct
  }
  if (maxMin <= 0) maxMin = 1
  if (maxPct <= 0) maxPct = 100

  const x = (min: number) => (min / maxMin) * WIDTH
  const y = (pct: number) => HEIGHT - (pct / maxPct) * (HEIGHT - 2) - 1

  let line = ''
  for (let i = 0; i < data.length; i++) {
    const point = data[i]
    const cmd = i === 0 ? 'M' : 'L'
    line += `${cmd}${x(point.min).toFixed(1)} ${y(point.pct).toFixed(1)} `
  }
  const area = `${line}L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-2 h-10 w-full"
      role="img"
      aria-label="Structured workout shape"
    >
      <path d={area} fill="#93c5fd" fillOpacity="0.45" />
      <path d={line.trim()} fill="none" stroke="#2563eb" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
