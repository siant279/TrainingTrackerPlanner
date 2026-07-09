import { Suspense } from 'react'
import { ConnectClient } from '@/components/ConnectClient'

export default function ConnectPage() {
  return (
    <Suspense fallback={<p className="text-[#667085] py-10 text-center">Loading…</p>}>
      <ConnectClient />
    </Suspense>
  )
}
