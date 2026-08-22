/**
 * Manage → System → Deployment: the facts, as a pure-ish function.
 *
 * ⚑ THE PROPERTY UNDER TEST IS "NEVER THROWS", and it needs a test because the failure mode is the
 * worst kind: this panel probes a network sidecar and stats a directory, and an unhandled rejection in
 * either would take down the whole Manage page — for a Site Admin, and most likely at exactly the
 * moment they opened it BECAUSE something was already broken. "PDF engine: not reachable" is useful;
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
const stubBackupRecord = (raw: string, size = Buffer.byteLength(raw, 'utf8')) => {
  backupFileMock.stat.mockResolvedValue({ isFile: () => true, size })
  backupFileMock.readFile.mockResolvedValue(raw)
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
    expect(facts).toHaveLength(7)
  })

  it('reports the PDF engine reachable when the sidecar answers', async () => {
    stubFetch(() => Promise.resolve(new Response('ok', { status: 200 })))
    const pdf = byKey(await collectSystemFacts(), 'pdfEngine')
    expect(pdf.status).toBe('ok')
    // ⚑ Says it is LOCAL, because "PDF engine" is the component people assume needs internet.
    expect(pdf.detail).toContain('no internet')
  })

  it('distinguishes "answered badly" from "did not answer"', async () => {
    stubFetch(() => Promise.resolve(new Response('nope', { status: 503 })))
    const pdf = byKey(await collectSystemFacts(), 'pdfEngine')
    expect(pdf.status).toBe('unknown')
    expect(pdf.value).toContain('503')
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
    expect(backup.detail).toBe(
      'Premigration · drive:lesson3-backups · ' +
        'lesson3-20260822T032534Z-premigrate-83b9ab0.dump.age · 1.5 MiB encrypted',
    )
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

  it('names account verification among the capabilities lost when SMTP is absent', async () => {
    expect(byKey(await collectSystemFacts(), 'email').detail).toContain('Account verification')
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

  it('names the environment variable for every fact', async () => {
    const missing = (await collectSystemFacts()).filter((f) => !f.envVar).map((f) => f.key)
    expect(
      missing,
      'a fact without its controlling env var is a dead end for whoever must fix it',
    ).toEqual([])
  })
})
