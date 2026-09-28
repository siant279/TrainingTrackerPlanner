'use client'

import { useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase-browser'

export function LoginForm({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const supabase = createBrowserSupabase()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (authError) throw authError
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        className="w-full text-sm px-3 py-2 bg-[#2563eb] text-white rounded-lg disabled:opacity-40"
        disabled={disabled || busy}
        onClick={() => void signIn()}
      >
        {busy ? 'Redirecting to Google…' : 'Sign in with Google'}
      </button>
      {error ? <p className="text-sm text-red-700 mt-3">{error}</p> : null}
    </div>
  )
}
