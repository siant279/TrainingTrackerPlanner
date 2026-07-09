const EXCLUDED_FROM_LOAD = new Set(['Walk', 'EBikeRide', 'EMountainBikeRide'])

export function countsTowardLoad(sportType: string): boolean {
  return !EXCLUDED_FROM_LOAD.has(sportType)
}

export function isExcludedSport(sportType: string): boolean {
  return EXCLUDED_FROM_LOAD.has(sportType)
}
