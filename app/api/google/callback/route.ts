import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleCode } from '@/lib/google'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const code = new URL(request.url).searchParams.get('code')
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  if (!code) return NextResponse.redirect(`${base}/connect?error=missing_code`)
  try {
    const tokens = await exchangeGoogleCode(code, `${base}/api/google/callback`)
    const supabase = getSupabaseAdmin()
    const { data: athlete } = await supabase.from('athlete').select('id').limit(1).single()
    if (athlete) {
      await supabase.from('athlete').update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token ?? undefined,
        google_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      }).eq('id', athlete.id)
    }
    return NextResponse.redirect(`${base}/connect?google=connected`)
  } catch {
    return NextResponse.redirect(`${base}/connect?error=google_failed`)
  }
}
