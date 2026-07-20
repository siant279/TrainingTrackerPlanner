export type ActivityCategory =
  | 'strength' | 'longRun' | 'longRide' | 'intervalRun' | 'intervalRide' | 'other'
export type PlannedType = 'Easy' | 'Long' | 'Interval'
export type PlannedStatus = 'planned' | 'completed' | 'skipped'
export type FeelFlag = 'strong' | 'normal' | 'tired'
export type RacePriority = 'A' | 'B' | 'C'

export interface FrameworkTargets {
  strength: { min: number; max: number }
  longRun: number; longRide: number; intervalRun: number; intervalRide: number
}
export interface Framework {
  weekHoursMin: number; weekHoursMax: number; targets: FrameworkTargets
  longRunMinSec: number; longRideMinSec: number; dayStartMin: number; dayEndMin: number
}
export interface Activity {
  id: number; sport_type: string; start_local: string; local_date?: string | null; moving_time: number
  distance: number | null; elevation: number | null; relative_effort: number | null
  load: number; category: ActivityCategory | null; category_override: ActivityCategory | null
  count_toward_load: boolean; perceived_exertion: number | null; name: string | null; description: string | null
}
export type StructuredFormat = 'zwo' | 'erg' | 'mrc' | 'fit'
export type StructuredStepKind = 'steady' | 'ramp' | 'interval' | 'free'

export interface StructuredStep {
  kind: StructuredStepKind
  duration_sec: number          // total incl. all repeats for interval kind
  target_low: number            // fraction of FTP (power_pct_ftp)
  target_high: number
  cadence?: number
  repeat?: number               // interval only
  on_sec?: number; off_sec?: number
  off_low?: number; off_high?: number
  label?: string
}

export interface StructuredWorkout {
  id: string
  name: string
  source_format: StructuredFormat
  sport: string
  ftp_reference: number | null
  duration_sec: number
  target_metric: 'power_pct_ftp' | 'power_watts' | 'pace' | 'hr'
  steps: StructuredStep[]
  original_filename: string | null
  created_at?: string
}

export interface PlannedWorkout {
  id: string; date: string; sport: string; type: PlannedType
  duration_min: number | null; target_load: number | null; description: string | null
  status: PlannedStatus; matched_activity_id: number | null
  structured_workout_id: string | null
}
export interface Race { id: string; date: string; name: string; sport: string | null; priority: RacePriority }
export interface FeelEntry { id: string; activity_id: number; rpe: number | null; feel_flag: FeelFlag | null; soreness: number | null; note: string | null }
export interface LoadSeriesPoint { date: string; load: number; base: number; tired: number; rested: number }
export interface StravaActivityPayload {
  id: number; name?: string; description?: string; sport_type?: string; type?: string
  start_date?: string; start_date_local?: string; moving_time?: number; distance?: number
  total_elevation_gain?: number; suffer_score?: number; perceived_exertion?: number
  average_heartrate?: number; max_heartrate?: number; has_heartrate?: boolean
  average_watts?: number; weighted_average_watts?: number; device_watts?: boolean
}
