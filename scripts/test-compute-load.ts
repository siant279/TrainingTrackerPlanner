/**
 * Quick checks for house Load math.
 * Usage: npx tsx scripts/test-compute-load.ts
 */
import {
  computeLoad,
  defaultIntensityFactor,
  isFlatEnough,
  loadFromIntensity,
  parseThresholdPace,
} from '../lib/compute-load'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function assertEq(a: unknown, b: unknown, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`)
}

// 1h @ IF 1.0 → 100
assertEq(loadFromIntensity(3600, 1), 100, '1h @ IF1')
// 1h @ IF 0.7 → 49
assertEq(loadFromIntensity(3600, 0.7), 49, '1h @ IF0.7')

assertEq(parseThresholdPace('5:30'), 330, 'pace 5:30')
assertEq(parseThresholdPace('8:51/mi'), Math.round((8 * 60 + 51) / 1.609344), 'pace mi')

assert(isFlatEnough(10000, 100), 'flat 10m/km')
assert(!isFlatEnough(10000, 300), 'hilly 30m/km')

const phys = { ftp: 200, thresholdPaceSecPerKm: 330, lthr: 160 }

const tss = computeLoad({
  sportType: 'Ride',
  movingTimeSec: 3600,
  tss: 85,
}, phys)
assertEq(tss.load, 85, 'TSS pass-through')
assertEq(tss.source, 'tss', 'TSS source')

const power = computeLoad({
  sportType: 'Ride',
  movingTimeSec: 3600,
  watts: 200,
}, phys)
assertEq(power.source, 'power', 'power source')
assertEq(power.load, 100, '1h @ FTP')

const hrRun = computeLoad({
  sportType: 'TrailRun',
  name: 'Trail hills',
  movingTimeSec: 3600,
  distanceM: 8000,
  elevationM: 400, // 50 m/km — not flat
  averageHeartrate: 144, // 0.9 IF
}, phys)
assertEq(hrRun.source, 'hr', 'trail uses HR not pace')
assertEq(hrRun.load, 81, '1h @ 0.9 IF')

const flatPace = computeLoad({
  sportType: 'Run',
  movingTimeSec: 3300, // 5:30/km for 10k
  distanceM: 10000,
  elevationM: 50,
}, phys)
assertEq(flatPace.source, 'pace', 'flat pace')
assertEq(flatPace.load, 92, '≈IF1 for 55 min') // 3300/3600 * 100 = 91.67 → 92

const strength = computeLoad({
  sportType: 'WeightTraining',
  movingTimeSec: 3600,
}, phys)
assertEq(strength.source, 'default', 'strength default')
assertEq(strength.load, loadFromIntensity(3600, defaultIntensityFactor('WeightTraining')), 'strength load')

const yoga = computeLoad({
  sportType: 'Workout',
  name: 'Afternoon Yoga',
  movingTimeSec: 1800,
}, phys)
assertEq(yoga.source, 'default', 'yoga default')
assertEq(yoga.load, loadFromIntensity(1800, 0.4), 'yoga IF 0.4')

const walk = computeLoad({
  sportType: 'Walk',
  movingTimeSec: 3600,
  averageHeartrate: 120,
}, phys)
assertEq(walk.load, 0, 'walks excluded')

console.log('OK — compute-load checks passed')
