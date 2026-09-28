import type { Metadata } from 'next'
import { DemoBanner } from '@/components/DemoBanner'
import { Nav } from '@/components/Nav'
import { authGateEnabled } from '@/lib/auth-gate'
import './globals.css'

export const metadata: Metadata = {
  title: 'Training Tracker',
  description: 'Strava-linked fitness dashboard and training planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DemoBanner />
        <Nav showSignOut={authGateEnabled()} />
        <main className="p-5 max-w-6xl mx-auto">{children}</main>
      </body>
    </html>
  )
}
