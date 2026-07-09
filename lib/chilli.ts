/** Chilli/Fi walk detection — same rules as chilli-journal. */
export function isChilliActivity(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.includes('chilli')) return true
  if (/\bfi\b/.test(lower)) return true
  if (lower.includes('fi smart') || lower.includes('fi collar')) return true
  return false
}
