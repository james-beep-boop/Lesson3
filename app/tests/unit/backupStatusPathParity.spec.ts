/**
 * The backup-status path is one contract written in three files, and nothing but a matching string
 * joined them.
 *
 * ⚑ WHY THIS IS A TEST AND NOT A COMMENT. `scripts/backup-db.sh` writes the record to a HOST path,
 * `docker-compose.yml` bind-mounts that host directory to a CONTAINER path, and `lib/systemFacts.ts`
 * reads a hardcoded container path. Rename any one of the three and nothing fails: no type error, no
 * broken import, no red test. The System row just reports "Last successful backup: Unknown" forever,
 * on a box whose backups are running perfectly — the failure mode is a *silent pass*, which is the
 * expensive kind, because the panel exists precisely so an operator can stop guessing.
 *
 * That class of drift already cost this project once: `ARTIFACT_CACHE_DIR` was absent from the root
 * env template, the cache fell back to an unwritable path, and every export job failed with `EACCES`
 * while the client polled a 202 forever (see `envTemplateParity.spec.ts`). The lesson recorded then was
 * to make the sync mechanical rather than reconcile it by hand a second time. Same shape, same fix.
 *
 * ⚑ IT ALSO PINS `:ro`. The app must never be able to write the record it reports — the host script is
 * the sole writer, which is what makes the row evidence rather than an assertion the app makes about
 * itself. A read-write mount would keep every assertion here passing while quietly removing that.
 *
 * ⚑ THE HOST SIDE IS A NESTED DIRECTORY (`out/ops`), so these patterns allow a slash in it. That is
 * not incidental: mounting the whole of `out/` gave the app read access to unrelated host artifacts,
 * and narrowing it is the reason the directory is nested at all. A pattern that only matched a
 * single-segment directory would quietly stop matching and this file would throw rather than pass —
 * which is the right failure, but worth understanding before someone "fixes" the regex.
 *
 * The three files are read as text on purpose. Importing the constant would widen a module's API for a
 * test's benefit, and neither the compose file nor a bash script can be imported at all.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'

import { describe, expect, it } from 'vitest'

const APP_DIR = join(__dirname, '..', '..')
const REPO_DIR = process.env.LESSON3_REPO_ROOT ?? join(APP_DIR, '..')

/**
 * ⚑ FAIL LOUDLY WHEN A SOURCE IS MISSING, never silently pass. A checker that cannot see its input and
 * says nothing certifies a completeness it never verified — the same false-authority failure as a
 * docstring describing behaviour the code does not have.
 */
function read(path: string, why: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `${path} not readable, so this parity check proved nothing. ${why} If this is CI or the deps ` +
        `container, mount THAT ONE FILE at $LESSON3_REPO_ROOT — never the workspace, which would put ` +
        `.git and its token inside a container running third-party dev dependencies (scripts/in-deps.sh).`,
    )
  }
}

function extract(source: string, pattern: RegExp, what: string, path: string): string {
  const match = source.match(pattern)
  if (!match?.[1]) {
    throw new Error(
      `could not find ${what} in ${path}. It was renamed or reshaped, which is exactly the drift this ` +
        `test exists to catch — update the pattern deliberately, do not delete the assertion.`,
    )
  }
  return match[1]
}

describe('the backup status file: one path, three files, no drift', () => {
  const factsSrc = read(
    join(APP_DIR, 'src', 'lib', 'systemFacts.ts'),
    'It is the app-side reader.',
  )
  const scriptSrc = read(
    join(REPO_DIR, 'scripts', 'backup-db.sh'),
    'It is the host-side sole writer.',
  )
  const composeSrc = read(
    join(REPO_DIR, 'docker-compose.yml'),
    'It is the only thing joining the writer to the reader.',
  )

  const appPath = extract(
    factsSrc,
    /const BACKUP_STATUS_FILE = '([^']+)'/,
    'BACKUP_STATUS_FILE',
    'lib/systemFacts.ts',
  )
  const scriptRelPath = extract(
    scriptSrc,
    /^BACKUP_STATUS_FILE="\$REPO_DIR\/([^"]+)"/m,
    'BACKUP_STATUS_FILE',
    'scripts/backup-db.sh',
  )
  const mount = extract(
    composeSrc,
    /-\s+\.\/([\w./-]+):(\/[\w./-]+):ro/,
    'a read-only ./<dir>:<container-dir>:ro operations mount',
    'docker-compose.yml',
  )
  const mountTarget = extract(
    composeSrc,
    /-\s+\.\/[\w./-]+:(\/[\w./-]+):ro/,
    'the container side of the operations mount',
    'docker-compose.yml',
  )

  it('mounts the host directory the script writes into', () => {
    expect(
      mount,
      'compose mounts a host directory the backup script does not write to',
    ).toBe(dirname(scriptRelPath))
  })

  it('mounts it at the container directory the app reads from', () => {
    expect(
      mountTarget,
      'the app reads a container path compose does not mount — the row would read Unknown forever',
    ).toBe(dirname(appPath))
  })

  it('agrees on the filename itself, not just the directory', () => {
    expect(appPath.split('/').pop()).toBe(scriptRelPath.split('/').pop())
  })

  it('keeps the app OUT of the writer role by mounting read-only', () => {
    // The `:ro` is inside the pattern above, so reaching here means it was present. Assert the
    // negative too: no read-write mount of the same host directory may exist alongside it.
    const writable = new RegExp(`-\\s+\\./${dirname(scriptRelPath)}:[\\w./-]+(?!:ro)$`, 'm')
    expect(
      writable.test(composeSrc),
      'a read-write mount of the operations directory would let the app forge its own evidence',
    ).toBe(false)
  })
})
