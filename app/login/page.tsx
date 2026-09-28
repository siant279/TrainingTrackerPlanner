import { LoginForm } from '@/components/LoginForm'
import { ALLOWED_EMAIL, authGateMisconfigured, supabaseAnonKey } from '@/lib/auth-gate'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; error?: string }>
}) {
  const params = await searchParams
  const denied = params.denied === '1'
  const failed = params.error === 'auth'
  const misconfigured = authGateMisconfigured() || !process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseAnonKey()

  return (
    <div className="max-w-md mx-auto mt-16 bg-white border border-[#e7e9ee] rounded-xl p-6">
      <h1 className="text-xl font-bold mb-1">Sign in</h1>
      <p className="text-sm text-[#667085] mb-4">
        This planner signs in with Google. Only {ALLOWED_EMAIL} can continue.
      </p>
      {denied ? (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 mb-4">
          That Google account is signed out. Sign in as {ALLOWED_EMAIL}.
        </p>
      ) : null}
      {failed ? (
        <p className="text-sm text-red-700 mb-4">Google sign-in did not finish. Try again.</p>
      ) : null}
      {misconfigured ? (
        <p className="text-sm text-[#667085] mb-4">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.
        </p>
      ) : null}
      <LoginForm disabled={misconfigured} />
    </div>
  )
}
