import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey } from '@/lib/auth-gate'

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = supabaseAnonKey()
  if (!url || !key) throw new Error('Missing Supabase auth env')
  return createBrowserClient(url, key)
}
