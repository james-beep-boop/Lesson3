/**
 * Best-effort enqueues must not be able to destroy the write they ride on (L3-03, 2026-07-21).
 *
 * THE BUG THIS PINS. `messagePing` and `prewarmVersionArtifacts` are "best-effort": their comments
 * promised that a failure to ENQUEUE could never fail the primary write. It could. Both passed `req`
 * to `jobs.queue`, enlisting the insert in the caller's transaction, so a failed insert ABORTED that
 * transaction. The surrounding catch then swallowed the error and the hook returned normally —
 * and installed drizzle's `commitTransaction` is:
 *
 *     try { await session.resolve() }   // COMMIT — throws, transaction is aborted
 *     catch { await session.reject() }  // ROLLBACK, error swallowed
 *
 * so the commit silently became a rollback. Net effect: a 201 with the created document in the
 * response body and NOTHING PERSISTED. The swallow was not protecting the message; it was hiding
 * the message's death.
 *
 * The fix omits `req`, so the insert runs on its own connection (`jobs.queue` does
 * `args.req ?? createLocalReq({}, payload)`) and cannot poison the caller.
 *
 * WHY THE FAULT INJECTION RUNS REAL SQL. The first draft of this test simply mocked `jobs.queue` to
 * reject — and it PASSED against the broken code, proving nothing. A rejected mock is a JavaScript
 * throw; it never touches the database, so nothing poisons the transaction. The bug needs a real
 * FAILED STATEMENT on the caller's transaction connection. So the mock below executes one (`SELECT
 * 1/0`) on `args.req`'s transaction when a `req` is passed, faithfully reproducing what a failed job
 * insert does, and then throws.
 *
 * That makes the two designs genuinely distinguishable:
 *   • with `req` (the bug)  -> the tx is poisoned -> commit silently rolls back -> message GONE
 *   • without `req` (fixed) -> there is no caller tx to poison -> message SURVIVES
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { clearRateLimitBuckets } from '../helpers/db.js'
import {
  MARK,
  MARK_BASE,
  createUserVerified,
  minimalBundleContent,
  purgeMarked,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'

let payload: Payload
let sender: { id: number }
let fx: RoleFixture
let seq = 0

/** A FRESH recipient per test. The ping hook only fires on the recipient's FIRST unread message
 *  (`otherUnread > 0` returns early) and is capped per recipient per day — so reusing one recipient
 *  silently skips the enqueue and makes these tests pass without exercising anything. */
const newRecipient = async (): Promise<{ id: number }> =>
  (await createUserVerified(payload, {
    name: `${MARK}enq-recipient-${++seq}`,
    email: `${MARK}enq-recipient-${seq}@example.test`.toLowerCase(),
    password: 'enqueue-probe-pass',
  })) as unknown as { id: number }

/**
 * Replace `jobs.queue` with one that reproduces a FAILED JOB INSERT — the real fault, not a mocked
 * one. When handed a `req`, it runs an invalid statement on THAT transaction's connection, which is
 * what aborts the caller's transaction in Postgres; then it throws, as a failing enqueue would.
 *
 * Mocking the rejection alone is not enough and was the bug in this file's first draft: a rejected
 * promise never touches the database, so nothing is poisoned and the test passes against the broken
 * code. Everything below depends on this running real SQL.
 */
function mockFailingEnqueue() {
  const adapter = payload.db as unknown as {
    sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }>
  }
  return vi
    .spyOn(payload.jobs, 'queue')
    .mockImplementation(async (args: { req?: { transactionID?: unknown } }) => {
      const txId = args?.req?.transactionID
      if (txId != null) {
        const txDb = adapter.sessions?.[String(await txId)]?.db
        if (txDb) await txDb.execute(sql`SELECT 1/0`).catch(() => undefined)
      }
      throw new Error('simulated queue insert failure')
    })
}

/**
 * Run `write` with a failing enqueue installed, reporting how many enqueues it attempted.
 *
 * The attempt count is read BEFORE `mockRestore()`, which also CLEARS the recorded calls — asserting
 * after it silently reads zero (an earlier draft of this file did, and "failed" for that reason
 * rather than for anything about the product). Owning that ordering here means the two durability
 * tests cannot get it wrong independently; each keeps its own assertions, which is the part that
 * says what it proves.
 */
async function withFailingEnqueue<T>(
  write: () => Promise<T>,
): Promise<{ result: T; enqueueAttempts: number }> {
  const queueSpy = mockFailingEnqueue()
  try {
    return { result: await write(), enqueueAttempts: queueSpy.mock.calls.length }
  } finally {
    queueSpy.mockRestore()
  }
}

/**
 * Release the SHARED global sign-up budget.
 *
 * This suite creates users (a sender, a fresh recipient per test, and `setupRoleFixture`'s four
 * roles) purely as scaffolding — it is not testing the limiter. But `signupGlobal` is a single
 * site-wide bucket with a daily cap, so those creates spend budget that every LATER suite needs:
 * adding the role fixture here was enough to make six unrelated int files die in setup with
 * "Sign-ups are temporarily paused". `fileParallelism: false` means the damage is strictly
 * downstream and invisible when this file is run alone, which is exactly how it got missed.
 *
 * So we clear the global counter on the way in (guaranteeing headroom for our own fixture) and on
 * the way out (handing the budget back). Only the GLOBAL bucket is touched — per-target rows are
 * left alone so nothing here can weaken what `authRateLimit.int.spec.ts` asserts.
 */
const releaseSignupBudget = (p: Payload) => clearRateLimitBuckets(p, 'signupGlobal%')

beforeAll(async () => {
  // ORDER MATTERS: purge BEFORE building the fixture. `purgeMarked` sweeps the whole `MARK_BASE`
  // prefix, which `setupRoleFixture` also uses — running it second deletes the plan and subject-grade
  // this suite is about to reference, and the prewarm test then dies in setup with a bare `NotFound`
  // that looks like a product bug rather than a fixture-ordering one.
  const bootstrap = await getPayload({ config })
  await purgeMarked(bootstrap, MARK_BASE)
  await releaseSignupBudget(bootstrap)

  fx = await setupRoleFixture()
  payload = fx.payload
  sender = (await createUserVerified(payload, {
    name: `${MARK}enq-sender`,
    email: `${MARK}enq-sender@example.test`.toLowerCase(),
    password: 'enqueue-probe-pass',
  })) as unknown as { id: number }
})

afterAll(async () => {
  vi.restoreAllMocks()
  await purgeMarked(payload, MARK_BASE)
  await releaseSignupBudget(payload) // hand the shared budget back to the suites that run after us
})

describe('best-effort enqueue cannot destroy the primary write (L3-03)', () => {
  it('a message still persists when its ping enqueue throws', async () => {
    const recipient = await newRecipient()
    const body = `${MARK}survives-a-failed-enqueue`

    // If the caller passed `req` (the bug), the failing enqueue poisons the create's own transaction
    // and its commit silently becomes a rollback. See `mockFailingEnqueue`.
    const { result: created, enqueueAttempts } = await withFailingEnqueue(
      () =>
        payload.create({
          collection: 'messages',
          data: { sender: sender.id, recipient: recipient.id, body } as never,
          overrideAccess: true,
        }) as Promise<{ id: number | string }>,
    )

    // GUARD AGAINST A VACUOUS PASS: if the hook skipped the enqueue (it only pings a recipient's
    // FIRST unread), the mock never fires and this test would "pass" while proving nothing. An
    // earlier draft did exactly that.
    expect(enqueueAttempts).toBe(1)

    // The create must report success...
    expect(created?.id).toBeTruthy()

    // ...and — the part that actually failed before — the row must really be in the database.
    // Re-read rather than trusting the returned document: the old bug's whole signature was a
    // populated response object for a row that had been rolled back.
    const { totalDocs } = await payload.count({
      collection: 'messages',
      where: { body: { equals: body } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  /**
   * The SECOND best-effort enqueue site. `messagePing` above and `prewarmVersionArtifacts` here share
   * the mechanism but nothing else, and this is the one where a silent rollback actually hurts: it
   * rides make-official and first-ingest, so the write that vanishes is a promotion or a 42-file
   * corpus load rather than one chat message. Covering only the messages path (as this file did until
   * the 2026-07-21 review) left the more costly half of L3-03 unpinned.
   */
  it('an official-pointer promotion still persists when its prewarm enqueue throws', async () => {
    const version = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '9.9.9',
        title: `${MARK}prewarm-durability`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })

    // `user` is REQUIRED: `prewarmOfficialArtifacts` returns early without `req.user`, so an
    // unauthenticated update would skip the enqueue entirely and pass while proving nothing.
    const { enqueueAttempts } = await withFailingEnqueue(() =>
      payload.update({
        collection: 'lesson-plans',
        id: fx.plan.id,
        data: { officialVersion: version.id } as never,
        overrideAccess: true,
        user: fx.users.siteAdmin,
      }),
    )

    // Guard against a vacuous pass, exactly as above.
    expect(enqueueAttempts).toBeGreaterThan(0)

    // The promotion must have actually landed — re-read rather than trusting the returned document.
    const plan = await payload.findByID({
      collection: 'lesson-plans',
      id: fx.plan.id,
      depth: 0,
      overrideAccess: true,
    })
    const official = (plan as { officialVersion?: unknown }).officialVersion
    expect(String(typeof official === 'object' ? (official as { id: unknown }).id : official)).toBe(
      String(version.id),
    )
  })

  it('every best-effort enqueue is issued WITHOUT the caller req', async () => {
    // Belt-and-braces on the mechanism itself: passing `req` is what enlisted the insert in the
    // caller's transaction. Asserting this alone would be a weak test (see the header), but paired
    // with the durability check above it names the specific property that keeps it true.
    const recipient = await newRecipient()
    const queueSpy = vi.spyOn(payload.jobs, 'queue')
    const body = `${MARK}enqueue-arg-shape`
    await payload.create({
      collection: 'messages',
      data: { sender: sender.id, recipient: recipient.id, body } as never,
      overrideAccess: true,
    })
    expect(queueSpy).toHaveBeenCalled()
    for (const call of queueSpy.mock.calls) {
      expect((call[0] as { req?: unknown }).req).toBeUndefined()
    }
    queueSpy.mockRestore()
  })
})
