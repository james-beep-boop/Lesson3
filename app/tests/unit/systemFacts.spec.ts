/**
 * Manage → System → Deployment: the facts, as a pure-ish function.
 *
 * ⚑ THE PROPERTY UNDER TEST IS "NEVER THROWS", and it needs a test because the failure mode is the
 * worst kind: this panel probes a network sidecar and stats a directory, and an unhandled rejection in
 * either would take down the whole Manage page — for a Site Admin, and most likely at exactly the
 * moment they opened it BECAUSE something was already broken. "PDF previews: unavailable" is useful;
 * a 500 on Manage teaches them nothing and hides the other facts.
 *
 * The second property is that every fact NAMES ITS ENV VAR. That is not cosmetic: the environment
 * controls each capability or destination, so the panel's job is to say where to change it (D1: "A
 * toggle that silently does nothing until restart is worse than no toggle… it must look like it").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const backupFileMock = vi.hoisted(() => ({
  close: vi.fn(),
  open: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual, open: backupFileMock.open }
})

/**
 * ⚑ THE CACHE MODULE IS MOCKED, because an env var CANNOT steer it. `artifactCache.ts` resolves
 * `CACHE_DIR` and `MAX_BYTES` ONCE at module load, so the earlier version of this spec — which set
 * `ARTIFACT_CACHE_DIR` in `beforeEach` — never changed the probed directory at all. It passed because
 * `<cwd>/.artifact-cache` happens not to exist in a clean checkout, and would have flipped to `ok` on
 * any machine where a previous run created it: a silent pass with a comment claiming otherwise.
 */
vi.mock('@/generator/artifactCache', () => ({
  artifactCacheDir: () => '/nonexistent/lesson3-facts-spec',
  artifactCacheMaxBytes: () => 536_870_912,
  isArtifactCacheEntry: (name: string) => name.endsWith('.bin'),
}))

const { collectSystemFacts } = await import('@/lib/systemFacts')
type SystemFact = import('@/lib/systemFacts').SystemFact

const ENV_KEYS = [
  'SERVER_URL',
  'PUBLIC_LIBRARY_ENABLED',
  'SMTP_HOST',
  'SENTRY_DSN',
  'GOTENBERG_URL',
  // ⚑ MUST BE IN THIS LIST, not just used by the destination cases below. `beforeEach` clears every key
  // here and `afterEach` restores it, so a key that is absent from the list both leaks into later tests
  // and picks up whatever the developer's real environment happens to hold — which would make the
  // "nothing is being backed up" case pass or fail depending on the machine.
  'BACKUP_RCLONE_REMOTE',
  'BACKUP_AGE_RECIPIENT_SCHOOL',
] as const

let saved: Record<string, string | undefined>

/**
 * The offline default: most cases are about env facts, and a live fetch would make them flaky.
 *
 * ⚑ TAKES A FACTORY, NOT A PROMISE. Passing `Promise.reject(...)` built the rejection eagerly in
 * `beforeEach`, so in the two cases that re-stub nothing ever consumed it and vitest reported two
 * unhandled errors beside six passing tests. A factory is only called if `fetch` is.
 */
const stubFetch = (make: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(make))
/**
 * ⚑ `readFile` RESOLVES A BUFFER, because the reader now hands the bytes to the shared
 * `decodeCachedJson` — the same decoder the artifact caches use — rather than parsing a string itself.
 * A string here would still satisfy `JSON.parse` and quietly skip the post-read length bound, so the
 * mock has to match the real call's shape and not merely its content.
 */
const stubBackupRecord = (raw: string, size = Buffer.byteLength(raw, 'utf8')) => {
  backupFileMock.stat.mockResolvedValue({ isFile: () => true, size })
  backupFileMock.readFile.mockResolvedValue(Buffer.from(raw, 'utf8'))
  backupFileMock.close.mockResolvedValue(undefined)
  backupFileMock.open.mockResolvedValue({
    close: backupFileMock.close,
    readFile: backupFileMock.readFile,
    stat: backupFileMock.stat,
  })
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  for (const mock of Object.values(backupFileMock)) mock.mockReset()
  backupFileMock.open.mockRejectedValue(new Error('no backup record'))
  // Default every case to an unreachable sidecar; the two cases that are ABOUT the response re-stub.
  // Five identical stub blocks used to open five cases that had nothing to do with fetch.
  stubFetch(() => Promise.reject(new Error('offline')))
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.unstubAllGlobals()
})

const byKey = (facts: SystemFact[], key: string): SystemFact => {
  const fact = facts.find((f) => f.key === key)
  if (!fact) throw new Error(`no fact named ${key}; got ${facts.map((f) => f.key).join(', ')}`)
  return fact
}

describe('collectSystemFacts', () => {
  it('never throws, even when the probe rejects and the cache directory is unreadable', async () => {
    const facts = await collectSystemFacts()
    // Both failure paths taken at once, and the panel still has every row.
    expect(byKey(facts, 'pdfEngine').status).toBe('unknown')
    expect(byKey(facts, 'artifactCache').status).toBe('unknown')
    expect(byKey(facts, 'backup').status).toBe('unknown')
    // ⚑ A COUNT, deliberately: it is what noticed the eighth row arriving, which is the point of
    // pinning it rather than only checking the rows this case names.
    expect(facts).toHaveLength(9)
  })

  /**
   * ⚑ THE ROW MUST NOT SAY THE WHOLE HISTORY BECAME RECOVERABLE. `age` cannot retro-encrypt uploaded
   * dumps, so configuring the school's key changes only backups written afterwards — and a row implying
   * otherwise would be discovered during a recovery, which is the worst possible time.
   */
  describe('backup recovery', () => {
    it('reports independent recovery once the school holds its own key', async () => {
      process.env.BACKUP_AGE_RECIPIENT_SCHOOL = 'age1schoolkey'
      const fact = byKey(await collectSystemFacts(), 'backupRecovery')
      expect(fact.status).toBe('ok')
      expect(fact.detail).toContain('BEFORE this key was configured')
    })

    it('says recovery needs ARES when no school key is set', async () => {
      delete process.env.BACKUP_AGE_RECIPIENT_SCHOOL
      const fact = byKey(await collectSystemFacts(), 'backupRecovery')
      expect(fact.status).toBe('off')
      expect(fact.value).toBe('Recovery needs ARES')
    })
  })

  /**
   * ⚑ WHERE BACKUPS GO IS A DIFFERENT QUESTION FROM WHETHER ONE HAPPENED, and the destination row exists
   * because the panel used to answer only the second — leaving an offline school setting up a USB drive
   * with no way to confirm where a backup would land until one succeeded.
   */
  describe('backup destination', () => {
    it('names a removable drive from an absolute path, and keeps the raw value in the detail', async () => {
      process.env.BACKUP_RCLONE_REMOTE = '/media/lesson3-backup/lesson3-backups'
      const fact = byKey(await collectSystemFacts(), 'backupDestination')
      expect(fact.status).toBe('ok')
      expect(fact.value).toBe('A removable drive')
      expect(fact.detail).toBe('/media/lesson3-backup/lesson3-backups')
    })

    it('names a cloud location from an rclone remote', async () => {
      process.env.BACKUP_RCLONE_REMOTE = 'drive:lesson3-backups'
      const fact = byKey(await collectSystemFacts(), 'backupDestination')
      expect(fact.status).toBe('ok')
      expect(fact.value).toBe('A cloud location')
      // ⚑ NOT "Google Drive": `drive:` is a nickname whoever configured rclone chose, conventional for
      // Drive but not a guarantee. The raw value rides along instead of being interpreted.
      expect(fact.detail).toBe('drive:lesson3-backups')
    })

    it('says plainly that nothing is being backed up when it is unset', async () => {
      delete process.env.BACKUP_RCLONE_REMOTE
      const fact = byKey(await collectSystemFacts(), 'backupDestination')
      expect(fact.status).toBe('off')
      expect(fact.detail).toContain('No backups can run')
    })
  })

  it('reports PDF output working when the sidecar answers', async () => {
    stubFetch(() => Promise.resolve(new Response('ok', { status: 200 })))
    const pdf = byKey(await collectSystemFacts(), 'pdfEngine')
    expect(pdf.status).toBe('ok')
    // ⚑ STILL SAYS IT IS LOCAL — this is the component people assume needs internet, and an offline
    // school seeing it "not working" needs to know the fix is not a connection. The claim moved from
    // the technical note (which also printed the container URL) to the plain-English description when
    // those notes were replaced, so the assertion follows it rather than being deleted.
    expect(pdf.description).toContain('does not require internet access')
  })

  /**
   * ⚑ THE PROPERTY IS THE DISTINCTION, NOT THE STATUS CODE. This asserted `value` contained "503",
   * which stopped being true when the row's wording was made plain — the code is meaningless to the
   * administrator reading this screen. But the distinction it was standing in for is real and worth
   * keeping: an engine that is *running and answering wrongly* has a different cause from one that is
   * *not there*, and collapsing both to "not working" would send someone to restart a service that is
   * already up. So compare the two branches directly, which also cannot rot when the copy changes.
   */
  it('distinguishes "answered badly" from "did not answer"', async () => {
    stubFetch(() => Promise.resolve(new Response('nope', { status: 503 })))
    const badly = byKey(await collectSystemFacts(), 'pdfEngine')

    stubFetch(() => Promise.reject(new Error('connection refused')))
    const silent = byKey(await collectSystemFacts(), 'pdfEngine')

    expect(badly.status).toBe('unknown')
    expect(silent.status).toBe('unknown')
    expect(
      badly.value,
      'answering badly and not answering must not read identically — the fixes differ',
    ).not.toBe(silent.value)
  })

  it('reads unset capabilities as OFF, which is a legitimate state and not a fault', async () => {
    const facts = await collectSystemFacts()
    // An offline ARES school has all of these unset by design; nothing here may read as an error.
    for (const key of ['serverUrl', 'publicLibrary', 'email', 'errorTracking']) {
      expect(byKey(facts, key).status, `${key} should be off, not unknown`).toBe('off')
    }
  })

  it('reports the host-written backup success with its stream, destination and size', async () => {
    stubBackupRecord(
      JSON.stringify({
        version: 1,
        completedAt: '2026-08-22T03:25:34Z',
        stream: 'premigrate',
        destination: 'drive:lesson3-backups',
        filename: 'lesson3-20260822T032534Z-premigrate-83b9ab0.dump.age',
        encryptedBytes: 1_572_864,
      }),
    )
    const backup = byKey(await collectSystemFacts(), 'backup')
    expect(backup).toMatchObject({
      status: 'ok',
      value: '2026-08-22 03:25:34 UTC',
      envVar: 'BACKUP_RCLONE_REMOTE',
    })
    // ⚑ THE ONE ROW THAT KEEPS A DETAIL LINE, because "and where it went" is the point of it. Exact
    // string, not a `toContain`: the destination and the kind are the two things an administrator
    // reads, and a premigration success quietly reported as a daily one is the misreading the whole
    // row exists to prevent. The filename was dropped on purpose — opaque on screen, and
    // `scripts/restore-db.sh --list` is where you go when you need it.
    // ⚑ THE DESTINATION IS DESCRIBED *AND* QUOTED. "a cloud backup location" is all we can honestly
    // infer from an rclone nickname — `drive:` is conventional for Google Drive but the remote could be
    // anything — so the raw value rides along for whoever needs to act on it.
    expect(backup.detail).toBe(
      'Premigration backup, 2 MB, sent to a cloud backup location (drive:lesson3-backups).',
    )
  })

  /**
   * ⚑ THE HANG IS THE FAILURE MODE THIS ROW ADDS. Every other fact is an env read or a bounded probe;
   * this one reads a bind mount of a host directory, and `collectSystemFacts` joins them all with one
   * `Promise.all` — so an unbounded read would not degrade one row, it would hold the whole Manage page
   * open. Verified by mutation: deleting the `withDeadline` wrapper makes this case hang until vitest
   * kills it, rather than failing an assertion.
   */
  it('degrades to unknown instead of hanging when the status file never resolves', async () => {
    backupFileMock.open.mockReturnValue(new Promise(() => {}))
    const started = Date.now()
    const backup = byKey(await collectSystemFacts(), 'backup')
    expect(backup.status).toBe('unknown')
    expect(
      Date.now() - started,
      'the read must give up on its own deadline, not wait for the caller',
    ).toBeLessThan(5_000)
  })

  it('does not mistake a malformed or oversized status file for backup evidence', async () => {
    stubBackupRecord(JSON.stringify({ version: 1, completedAt: 'yesterday' }))
    expect(byKey(await collectSystemFacts(), 'backup').status).toBe('unknown')

    // JavaScript normalizes this to March 2; it is not evidence that a backup completed on Feb 30.
    stubBackupRecord(
      JSON.stringify({
        version: 1,
        completedAt: '2026-02-30T03:25:34Z',
        stream: 'daily',
        destination: 'drive:lesson3-backups',
        filename: 'lesson3-20260230T032534Z.dump.age',
        encryptedBytes: 12,
      }),
    )
    expect(byKey(await collectSystemFacts(), 'backup').status).toBe('unknown')

    backupFileMock.readFile.mockClear()
    backupFileMock.close.mockClear()
    stubBackupRecord('must not be read', 4_097)
    expect(byKey(await collectSystemFacts(), 'backup').status).toBe('unknown')
    expect(backupFileMock.readFile).not.toHaveBeenCalled()
    expect(backupFileMock.close).toHaveBeenCalledOnce()
  })

  /**
   * ⚑ THIS CASE NOW PINS A CORRECTION, not just a phrase. It used to assert the row said nobody could
   * recover a forgotten password when email was absent — which is FALSE: `reveal-reset-link` (D5) lets
   * a Site Administrator mint a reset link and hand it over, and its docblock says it exists precisely
   * for deployments with no reliable email. An offline school reading the old wording would have
   * concluded it was locked out of its own accounts. So the property is now: when email is absent, the
   * row names the workaround rather than declaring a dead end.
   */
  it('offers the hand-delivered reset link when SMTP is absent, rather than a dead end', async () => {
    const email = byKey(await collectSystemFacts(), 'email')
    expect(email.status).toBe('off')
    expect(email.detail).toContain('password-reset')
    expect(
      `${email.description} ${email.detail}`,
      'the row must not claim password recovery is impossible — a Site Administrator can hand over a link',
    ).not.toMatch(/nobody can/i)
  })

  it('flips those to OK when the environment provides them', async () => {
    process.env.SERVER_URL = 'https://lessons.example.org'
    process.env.PUBLIC_LIBRARY_ENABLED = '1'
    process.env.SMTP_HOST = 'smtp.example.org'
    process.env.SENTRY_DSN = 'https://key@sentry.example.org/1'
    const facts = await collectSystemFacts()
    for (const key of ['serverUrl', 'publicLibrary', 'email', 'errorTracking']) {
      expect(byKey(facts, key).status, key).toBe('ok')
    }
    expect(byKey(facts, 'serverUrl').value).toBe('https://lessons.example.org')
  })

  /**
   * ⚑ EVERY ROW EXPLAINS ITSELF IN PLAIN ENGLISH. The labels name components and settings, so an
   * administrator who does not already know what a "document cache" is learns nothing from being told
   * its size. The operator's review of the shipped panel was blunt about this: one sentence was
   * comprehensible and the rest were not. This pins the fix so a new row cannot arrive without one —
   * the same reason the env-var case below exists.
   */
  it('explains every fact in plain English, not just its state', async () => {
    const facts = await collectSystemFacts()
    const missing = facts.filter((f) => !f.description?.trim()).map((f) => f.key)
    expect(
      missing,
      'a row whose label is the only explanation is a row only its author can read',
    ).toEqual([])
    // Long enough to be a sentence rather than a restated label.
    for (const f of facts) {
      expect(
        f.description!.length,
        `${f.key}'s description is too short to explain anything`,
      ).toBeGreaterThan(40)
    }
  })

  /**
   * ⚑ THIS ROW HAS CARRIED TWO FALSE PRIVACY CLAIMS, so both are pinned as negatives rather than trusted
   * to review. It first said self-hosting meant nothing reached a third party (untrue once a hosted DSN
   * was possible); the replacement promised "never names or email addresses" (also untrue — the
   * exception message and stack are transmitted, there is no `beforeSend` scrubber, and an SMTP failure
   * in `passwordResetEmail` can carry a recipient address in the error text).
   *
   * What the code actually guarantees is narrow: headers and bodies are never attached. The row may say
   * that and no more. Pinned like the PDF row's locality claim above, because this is the sentence a
   * school reads to decide whether it is comfortable.
   */
  it('claims only what the code guarantees about error reports', async () => {
    process.env.SENTRY_DSN = 'https://key@sentry.example.org/1'
    const fact = byKey(await collectSystemFacts(), 'errorTracking')
    // Guaranteed: headers/bodies are dropped at the seam. Order-independent on purpose — the first
    // draft of this assertion assumed "never request headers" and failed on copy that reads
    // "Request headers ... are never attached", which is the better sentence.
    expect(fact.description).toMatch(/headers[^.]*never|never[^.]*headers/i)
    // Says where it may go, and that the error text itself travels.
    expect(fact.description).toMatch(/outside the school|external/i)
    expect(fact.description, 'the error message itself is sent and may quote data').toMatch(
      /error message/i,
    )
    // NOT guaranteed, and must never be claimed again.
    expect(
      fact.description,
      'the exception message and stack are transmitted unscrubbed, so this cannot be promised',
    ).not.toMatch(/never[^.]*(name|email|personal)/i)
    expect(fact.description, 'reports may leave the box; do not imply otherwise').not.toMatch(
      /nothing (goes|leaves)|stays on (this|the) (box|server)/i,
    )
  })

  it('names the environment variable for every fact', async () => {
    const missing = (await collectSystemFacts()).filter((f) => !f.envVar).map((f) => f.key)
    expect(
      missing,
      'a fact without its controlling env var is a dead end for whoever must fix it',
    ).toEqual([])
  })
})
