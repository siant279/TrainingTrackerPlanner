import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  authGateEnabled,
  authGateMisconfigured,
  emailFromClaims,
  isAllowedEmail,
  isAuthPublicPath,
  isSharedSecretRoute,
  supabaseAnonKey,
} from '@/lib/auth-gate'

function withAuthCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.headers.getSetCookie()) {
    target.headers.append('set-cookie', cookie)
  }
  return target
}

function redirectTo(request: NextRequest, pathname: string, params?: Record<string, string>) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  }
  return NextResponse.redirect(url)
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isSharedSecretRoute(pathname)) return NextResponse.next()
  if (!authGateEnabled()) {
    if (authGateMisconfigured() && !isAuthPublicPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return redirectTo(request, '/login', { error: 'config' })
    }
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    },
  )

  let email: string | null = null
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (!error) email = emailFromClaims(data?.claims)
  } catch {
    email = null
  }

  const allowed = isAllowedEmail(email)

  if (email && !allowed) {
    await supabase.auth.signOut()
    if (pathname.startsWith('/api/')) {
      return withAuthCookies(supabaseResponse, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    if (pathname === '/login' && request.nextUrl.searchParams.get('denied') === '1') return supabaseResponse
    return withAuthCookies(supabaseResponse, redirectTo(request, '/login', { denied: '1' }))
  }

  if (!allowed && !isAuthPublicPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return withAuthCookies(supabaseResponse, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    return withAuthCookies(supabaseResponse, redirectTo(request, '/login'))
  }

  if (allowed && pathname === '/login') {
    return withAuthCookies(supabaseResponse, redirectTo(request, '/dashboard'))
  }

  return supabaseResponse
}
