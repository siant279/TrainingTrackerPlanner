import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

/** Resolve chilli-journal repo (handles curly vs straight apostrophe in path). */
export function resolveChilliJournalDir(): string {
  const explicit = process.env.CHILLI_JOURNAL_DIR?.trim()
  if (explicit && existsSync(join(explicit, '.env.local'))) return explicit

  const home = homedir()
  const candidates = [
    join(home, 'Documents/Documents - Sian\u2019s MacBook Air/dev/chilli-journal'),
    join(home, "Documents/Documents - Sian's MacBook Air/dev/chilli-journal"),
    join(home, 'dev/chilli-journal'),
  ]
  for (const c of candidates) {
    if (existsSync(join(c, '.env.local'))) return c
  }

  try {
    const found = execSync(
      `find "${join(home, 'Documents')}" -maxdepth 4 -type d -name "chilli-journal" ! -path "*/docs/*" 2>/dev/null | head -1`,
      { encoding: 'utf8' },
    ).trim()
    if (found && existsSync(join(found, '.env.local'))) return found
  } catch { /* ignore */ }

  throw new Error(
    'Could not find chilli-journal. Set CHILLI_JOURNAL_DIR in .env.local to your repo path '
    + '(the folder name uses a curly apostrophe: Sian\u2019s MacBook Air).',
  )
}
