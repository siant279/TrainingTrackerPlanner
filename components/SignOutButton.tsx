'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase-browser'

export function SignOutButton() {
  const pathname = usePathname()
  const router = useRouter()
  if (pathname === '/login') return null

  async function signOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      className="text-sm text-[#344054] hover:text-[#2563eb] ml-auto"
      onClick={() => void signOut()}
    >
      Sign out
    </button>
  )
}
