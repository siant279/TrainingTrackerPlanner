/**
 * Unit checks for structured parsers (.zwo / .mrc / .erg).
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

function assertNear(actual: number, expected: number, tol: number, label: string) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ~${expected} (±${tol}), got ${actual}`)
  }
}

function sample(name: string) {
  return join(process.cwd(), 'demo/structured-samples', name)
}

function testZwo() {
  const xml = readFileSync(sample('2026-07-13_aerobic-tempo-openers.zwo'), 'utf8')
  const parsed = parseStructuredFile('2026-07-13_aerobic-tempo-openers.zwo', xml)

  assertEq(parsed.duration_sec, 6180, 'zwo duration_sec')
  assertEq(parsed.target_metric, 'power_pct_ftp', 'zwo target_metric')
  assertEq(parsed.ftp_reference, null, 'zwo ftp_reference')

  const sweet = parsed.steps.find((s) => s.kind === 'interval' && s.repeat === 3 && s.on_sec === 480)
  assert(sweet, 'zwo sweet-spot missing')
  assertEq(sweet.target_low, 0.88, 'zwo sweet-spot target_low')

  const opener = parsed.steps.find((s) => s.kind === 'interval' && s.repeat === 4 && s.on_sec === 30)
  assert(opener, 'zwo opener missing')
  assertEq(opener.target_low, 1.10, 'zwo opener target_low')

  validateSteps(parsed.steps, parsed.duration_sec)
  const load = estimateStructuredLoad(parsed.steps)
  assert(load >= 95 && load <= 110, `zwo load ${load} not in 95–110`)
  console.log(`OK — zwo: ${parsed.duration_sec}s · sweet ${sweet.target_low} · opener ${opener.target_low} · load ${load}`)
}

function testMrc() {
  const text = readFileSync(sample('2026-07-13_aerobic-tempo-openers.mrc'), 'utf8')
  const parsed = parseStructuredFile('2026-07-13_aerobic-tempo-openers.mrc', text)

  assertEq(parsed.duration_sec, 6180, 'mrc duration_sec')
  assertEq(parsed.ftp_reference, null, 'mrc ftp_reference')

  const fracs = parsed.steps.flatMap((s) => [s.target_low, s.target_high])
  assert(fracs.some((f) => Math.abs(f - 0.88) < 0.011), 'mrc missing ~0.88 sweet-spot')
  assert(fracs.some((f) => Math.abs(f - 1.10) < 0.011), 'mrc missing ~1.10 opener')

  validateSteps(parsed.steps, parsed.duration_sec)
  console.log(`OK — mrc: ${parsed.duration_sec}s · steps ${parsed.steps.length}`)
}

function testErg() {
  const text = readFileSync(sample('2026-07-13_aerobic-tempo-openers.erg'), 'utf8')
  const parsed = parseStructuredFile('2026-07-13_aerobic-tempo-openers.erg', text)

  assertEq(parsed.duration_sec, 6180, 'erg duration_sec')
  assertEq(parsed.ftp_reference, 205, 'erg ftp_reference from header')

  const fracs = parsed.steps.flatMap((s) => [s.target_low, s.target_high])
  assert(fracs.some((f) => Math.abs(f - 0.88) < 0.02), 'erg missing ~0.88 after watts÷205')
  assert(fracs.some((f) => Math.abs(f - 1.10) < 0.02), 'erg missing ~1.10 after watts÷205')

  // override FTP changes fractions
  const at250 = parseStructuredFile('w.erg', text, { ftpForErg: 250 })
  assertNear(at250.ftp_reference!, 250, 0, 'erg ftpForErg override')
  assert(at250.steps.some((s) => s.target_low < 0.88), 'erg at FTP 250 should lower %FTP vs 205')

  let threw = false
  try {
    parseStructuredFile('noftp.erg', text.replace(/^\s*FTP\s*=\s*\d+(?:\.\d+)?\s*$/im, ''))
  } catch {
    threw = true
  }
  assert(threw, 'erg without FTP should throw')

  validateSteps(parsed.steps, parsed.duration_sec)
  console.log(`OK — erg: ${parsed.duration_sec}s · ftp_reference ${parsed.ftp_reference}`)
}

function testValidation() {
  let threw = false
  try {
    validateSteps([{ kind: 'steady', duration_sec: 60, target_low: 5, target_high: 5 }], 60)
  } catch {
    threw = true
  }
  assert(threw, 'validateSteps should reject target 5.0')
  console.log('OK — validateSteps rejects out-of-range targets')
}

function main() {
  testZwo()
  testMrc()
  testErg()
  testValidation()
  console.log('All structured parser tests passed')
}

main()
