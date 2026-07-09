import { NextResponse } from 'next/server'
import { getGoogleAuthUrl } from '@/lib/google'

export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${base}/connect?error=google_not_configured`)
  }
  return NextResponse.redirect(getGoogleAuthUrl(`${base}/api/google/callback`))
}
