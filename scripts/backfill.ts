/**
 * CLI backfill — requires .env.local with JOURNAL_TOKEN_URL, JOURNAL_INTERNAL_SECRET, Supabase vars, CRON_SECRET
 * Usage: CRON_SECRET=xxx npx tsx scripts/backfill.ts
 */
async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('Set CRON_SECRET')
  const resp = await fetch(`${base}/api/backfill`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const data = await resp.json()
  console.log(resp.ok ? data : data.error)
}
main().catch(console.error)
