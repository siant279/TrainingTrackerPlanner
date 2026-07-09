export function verifyIngestSecret(request: Request) {
  const secret = process.env.TRACKER_INGEST_SECRET
  if (!secret) return false
  return request.headers.get('x-tracker-ingest-secret') === secret
}

export function verifyCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}
