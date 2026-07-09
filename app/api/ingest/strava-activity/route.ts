import { NextRequest, NextResponse } from 'next/server'
import { verifyIngestSecret } from '@/lib/auth'
import { ingestStravaActivity } from '@/lib/ingest-service'
import type { StravaActivityPayload } from '@/lib/types'

export async function POST(request: NextRequest) {
  if (!verifyIngestSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const aspect = (body.aspect_type || 'create') as 'create' | 'update' | 'delete'
  const activity = (body.activity || body) as StravaActivityPayload
  if (!activity?.id && aspect !== 'delete') return NextResponse.json({ error: 'Missing activity id' }, { status: 400 })
  try {
    const result = await ingestStravaActivity(activity, aspect)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Ingest error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ingest failed' }, { status: 500 })
  }
}
