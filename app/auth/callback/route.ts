import { NextResponse } from 'next/server'
import { emailFromClaims, isAllowedEmail } from '@/lib/auth-gate'
import { createServerSupabase } from '@/lib/supabase-server'

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data } = await supabase.auth.getClaims()
      if (!isAllowedEmail(emailFromClaims(data?.claims))) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?denied=1`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
