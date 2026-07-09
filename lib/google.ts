import { getSupabaseAdmin } from './supabase'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

export function getGoogleAuthUrl(redirectUri: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  })
  if (!resp.ok) throw new Error(`Google token exchange failed: ${resp.status}`)
  return resp.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

export async function getValidGoogleAccessToken() {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('athlete').select('google_access_token,google_refresh_token,google_token_expires_at').limit(1).single()
  if (!data?.google_refresh_token) throw new Error('Google Calendar not connected')
  if (data.google_access_token && data.google_token_expires_at && new Date(data.google_token_expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return data.google_access_token
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: data.google_refresh_token, grant_type: 'refresh_token',
    }),
  })
  if (!resp.ok) throw new Error('Google token refresh failed')
  const tokens = await resp.json()
  const { data: athlete } = await supabase.from('athlete').select('id').limit(1).single()
  if (athlete) {
    await supabase.from('athlete').update({
      google_access_token: tokens.access_token,
      google_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }).eq('id', athlete.id)
  }
  return tokens.access_token as string
}

export async function fetchCalendarEvents(timeMin: string, timeMax: string, timeZone?: string) {
  const token = await getValidGoogleAccessToken()
  const tz = timeZone || process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'
  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeZone: tz,
  })
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Calendar fetch failed: ${resp.status}`)
  const data = await resp.json()
  return data.items ?? []
}
