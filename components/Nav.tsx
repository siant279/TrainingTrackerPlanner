import Link from 'next/link'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/planner', label: 'Planner' },
  { href: '/races', label: 'Races' },
  { href: '/settings', label: 'Settings' },
  { href: '/connect', label: 'Connect' },
]

export function Nav() {
  return (
    <nav className="border-b border-[#e7e9ee] bg-white px-5 py-3 flex gap-4 flex-wrap items-center">
      <Link href="/dashboard" className="font-bold text-[#1a2230] mr-2">Training Tracker</Link>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm text-[#344054] hover:text-[#2563eb]">{l.label}</Link>
      ))}
    </nav>
  )
}
