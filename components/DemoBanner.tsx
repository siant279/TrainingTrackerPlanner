export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-5 py-2 text-center">
      Demo mode — sample Strava data and calendar events. Connect Supabase to use live data.
    </div>
  )
}
