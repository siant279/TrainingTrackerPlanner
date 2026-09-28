/** The only Google account that may use the app. */
export const ALLOWED_EMAIL = 'siant279@gmail.com'

export function supabaseAnonKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return key && key.trim() ? key.trim() : undefined
}

/** Sign-in is required whenever the Supabase project URL and anon key are set. */
export function authGateEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseAnonKey())
}

/** URL is set but the browser key is missing — keep the app closed. */
export function authGateMisconfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !supabaseAnonKey()
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === ALLOWED_EMAIL
}

export function emailFromClaims(claims: { email?: unknown } | null | undefined): string | null {
  return typeof claims?.email === 'string' ? claims.email : null
}

/** Machine routes that already check a shared secret. Not a browser login. */
export function isSharedSecretRoute(pathname: string): boolean {
  return pathname === '/api/ingest'
    || pathname.startsWith('/api/ingest/')
    || pathname === '/api/cron'
    || pathname.startsWith('/api/cron/')
    || pathname === '/api/backfill'
}

export function isAuthPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/auth/callback'
}
