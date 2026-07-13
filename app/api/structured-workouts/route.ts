import { NextRequest, NextResponse } from 'next/server'
import { demoStore, isDemoMode } from '@/lib/demo'
import {
  estimateStructuredLoad,
  parseStructuredFile,
  validateSteps,
} from '@/lib/structured-workout'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { StructuredFormat, StructuredWorkout } from '@/lib/types'

type UploadBody = {
  filename: string
  contents: string
  ftpForErg?: number
}

async function readUpload(request: NextRequest): Promise<UploadBody> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('Missing file')
    const buf = Buffer.from(await file.arrayBuffer())
    const filename = file.name || 'workout.zwo'
    const ext = filename.split('.').pop()?.toLowerCase()
    const contents = ext === 'fit' ? buf.toString('base64') : buf.toString('utf8')
    const ftpRaw = form.get('ftpForErg')
    const ftpForErg = typeof ftpRaw === 'string' && ftpRaw ? Number(ftpRaw) : undefined
    return { filename, contents, ftpForErg }
  }

  const body = await request.json() as Partial<UploadBody>
  if (!body.filename || typeof body.contents !== 'string') {
    throw new Error('Expected JSON { filename, contents }')
  }
  return {
    filename: body.filename,
    contents: body.contents,
    ftpForErg: body.ftpForErg,
  }
}

function sourceFormat(filename: string): StructuredFormat {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'zwo' || ext === 'mrc' || ext === 'erg' || ext === 'fit') return ext
  throw new Error(`Unsupported format: .${ext ?? '?'}`)
}

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (isDemoMode()) {
    if (id) {
      const structured = demoStore.getStructured(id)
      if (!structured) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ structured })
    }
    return NextResponse.json({ structured: demoStore.listStructured() })
  }

  const supabase = getSupabaseAdmin()
  if (id) {
    const { data, error } = await supabase.from('structured_workouts').select('*').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { raw: _raw, ...rest } = data
    return NextResponse.json({ structured: rest as StructuredWorkout })
  }

  const { data, error } = await supabase
    .from('structured_workouts')
    .select('id,name,source_format,sport,ftp_reference,duration_sec,target_metric,steps,original_filename,created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ structured: data ?? [] })
}

export async function POST(request: NextRequest) {
  let upload: UploadBody
  try {
    upload = await readUpload(request)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Bad request' }, { status: 400 })
  }

  let format: StructuredFormat
  try {
    format = sourceFormat(upload.filename)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Bad format' }, { status: 400 })
  }

  let parsed
  try {
    const contents =
      format === 'fit'
        ? Buffer.from(upload.contents, upload.contents.match(/^[A-Za-z0-9+/=]+$/) ? 'base64' : 'utf8')
        : upload.contents
    parsed = parseStructuredFile(upload.filename, contents, { ftpForErg: upload.ftpForErg })
    validateSteps(parsed.steps, parsed.duration_sec)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Parse failed' }, { status: 400 })
  }

  const estimatedLoad = estimateStructuredLoad(parsed.steps)
  const row = {
    name: parsed.name,
    source_format: format,
    sport: parsed.sport,
    ftp_reference: parsed.ftp_reference,
    duration_sec: parsed.duration_sec,
    target_metric: parsed.target_metric,
    steps: parsed.steps,
    original_filename: upload.filename,
    raw: typeof upload.contents === 'string' ? upload.contents : null,
  }

  if (isDemoMode()) {
    const structured = demoStore.addStructured(row)
    return NextResponse.json({ structured, estimatedLoad })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('structured_workouts')
    .insert(row)
    .select('id,name,source_format,sport,ftp_reference,duration_sec,target_metric,steps,original_filename,created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ structured: data as StructuredWorkout, estimatedLoad })
}
