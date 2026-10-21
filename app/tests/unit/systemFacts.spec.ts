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
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
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
    // ⚑ A COUNT, deliberately: it is what noticed the eighth row arriving, which is the point of
    // pinning it rather than only checking the rows this case names. Six since the three backup rows
    // moved to Manage → System → Backups (`backupStatus.spec.ts`, design A5).
    expect(facts).toHaveLength(6)
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
    // Both halves of the exception travel, so both are named. The stack was missing from the first
    // draft of this sentence — an omission, not a lie, but the same direction of error.
    expect(fact.description, 'the error message itself is sent and may quote data').toMatch(
      /error message/i,
    )
    expect(fact.description, 'the stack trace is transmitted too').toMatch(/stack trace/i)
    // NOT guaranteed, and must never be claimed again.
    expect(
      fact.description,
      'the exception message and stack are transmitted unscrubbed, so this cannot be promised',
    ).not.toMatch(/never[^.]*(name|email|personal)|(name|email|personal)[^.]*never/i)
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
