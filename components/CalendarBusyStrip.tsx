import type { BusyBlock } from '@/lib/availability'
import { busyBlocksTitle, clipBusyBlocks } from '@/lib/availability'
import type { Framework } from '@/lib/types'

export function CalendarBusyStrip({ blocks, framework }: { blocks: BusyBlock[] | undefined; framework: Framework }) {
  const clipped = clipBusyBlocks(blocks, framework)
  if (!clipped.length) return null

  const span = framework.dayEndMin - framework.dayStartMin
  const title = busyBlocksTitle(blocks ?? [], framework)

  return (
    <div
      className="relative h-2 bg-[#eef0f4] rounded mb-1 shrink-0"
      title={`Busy: ${title}`}
      aria-label={`Busy blocks ${title}`}
    >
      {clipped.map((b, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 bg-[#98a2b3] rounded-sm"
          style={{
            left: `${((b.startMin - framework.dayStartMin) / span) * 100}%`,
            width: `${Math.max(((b.endMin - b.startMin) / span) * 100, 1.5)}%`,
          }}
        />
      ))}
    </div>
  )
}
