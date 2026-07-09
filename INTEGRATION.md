# Chilli Journal Integration

Apply these changes to `chilli-journal` to complete Strava sync (M1).

## 1. Environment variables (chilli-journal `.env`)

```
TRACKER_INGEST_URL=https://your-tracker.vercel.app/api/ingest/strava-activity
TRACKER_INGEST_SECRET=<same as tracker TRACKER_INGEST_SECRET>
JOURNAL_INTERNAL_SECRET=<same as tracker JOURNAL_INTERNAL_SECRET>
```

## 2. Create `lib/trackerForward.ts`

See the file in this repo at `docs/chilli-journal/trackerForward.ts`.

## 3. Create `app/api/internal/strava-token/route.ts`

See `docs/chilli-journal/strava-token-route.ts`.

## 4. Update `app/api/strava/webhook/route.ts`

At the top, add:
```ts
import { forwardActivityToTracker } from '@/lib/trackerForward'
```

In `POST`, after parsing `activityId`, also handle `update` and `delete`:
```ts
if (body.object_type !== 'activity') { /* existing ignore */ }
const aspect = body.aspect_type as string
if (!['create', 'update', 'delete'].includes(aspect)) { /* ignore */ }

// Forward training activities to tracker (non-blocking)
void forwardActivityToTracker(activityId, aspect as 'create' | 'update' | 'delete').catch(console.error)

// Existing journal logic: only process create + isChilliActivity
if (aspect !== 'create') return NextResponse.json({ ok: true })
// ... rest of existing processNewActivity
```

## 5. Tracker setup

1. Create Supabase project and run `supabase/schema.sql`
2. Copy `.env.example` to `.env.local` and fill values
3. Deploy tracker to Vercel
4. Set chilli-journal env vars to point at deployed tracker ingest URL
