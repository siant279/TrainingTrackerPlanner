/**
 * Unit checks for .zwo parse against the aerobic-tempo-openers fixture.
 * Usage: npm run test:structured
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  estimateStructuredLoad,
  parseStructuredFile,
  validateSteps,
} from '../lib/structured-workout'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function main() {
  const path = join(process.cwd(), 'demo/structured-samples/2026-07-13_aerobic-tempo-openers.zwo')
  const xml = readFileSync(path, 'utf8')
  const parsed = parseStructuredFile('2026-07-13_aerobic-tempo-openers.zwo', xml)

  assertEq(parsed.duration_sec, 6180, 'duration_sec')
  assertEq(parsed.target_metric, 'power_pct_ftp', 'target_metric')
  assertEq(parsed.ftp_reference, null, 'ftp_reference')
  assertEq(parsed.sport, 'bike', 'sport')

  const sweet = parsed.steps.find(
    (s) => s.kind === 'interval' && s.repeat === 3 && s.on_sec === 480,
  )
  assert(sweet, 'sweet-spot IntervalsT (3×8min) missing')
  assertEq(sweet.target_low, 0.88, 'sweet-spot target_low')
  assertEq(sweet.target_high, 0.88, 'sweet-spot target_high')

  const opener = parsed.steps.find(
    (s) => s.kind === 'interval' && s.repeat === 4 && s.on_sec === 30,
  )
  assert(opener, 'opener IntervalsT (4×30s) missing')
  assertEq(opener.target_low, 1.10, 'opener target_low')
  assertEq(opener.target_high, 1.10, 'opener target_high')

  validateSteps(parsed.steps, parsed.duration_sec)

  const load = estimateStructuredLoad(parsed.steps)
  assert(load >= 95 && load <= 110, `estimateStructuredLoad ${load} not in 95–110`)

  // validation rejects bad targets
  let threw = false
  try {
    validateSteps([{ kind: 'steady', duration_sec: 60, target_low: 5, target_high: 5 }], 60)
  } catch {
    threw = true
  }
  assert(threw, 'validateSteps should reject target 5.0')

  console.log('OK — zwo fixture:')
  console.log(`  name: ${parsed.name}`)
  console.log(`  steps: ${parsed.steps.length}`)
  console.log(`  duration_sec: ${parsed.duration_sec}`)
  console.log(`  sweet-spot: ${sweet.target_low}`)
  console.log(`  opener: ${opener.target_low}`)
  console.log(`  estimatedLoad: ${load}`)
}

main()
