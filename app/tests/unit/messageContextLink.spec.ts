/**
 * `validateContextLink` (`collections/Messages.ts`) — the CONSUMER-level guard that the version
 * lookup's failures are classified, not flattened.
 *
 * ⚑ WHY THIS EXISTS SEPARATELY FROM `readBundleVisibility.spec.ts`. That file proves
 * `findReadableVersion` rethrows operational errors. It does NOT prove this hook still calls it —
 * and that is the gap that matters, because the bug being fixed was never in the helper. It was a
 * call site that had its own `.catch(() => null)` and therefore never reached the helper's rule at
 * all. A helper contract with no consumer test lets the exact original defect be reintroduced with
 * the whole suite green; that was demonstrated on this branch by reverting the call site and
 * watching all 685 tests pass.
 *
 * WHAT THE ORIGINAL DEFECT LOOKED LIKE. A database outage during the lookup was reported as
 * `400 A linked lesson version must belong to the linked lesson plan` — a specific, confident,
 * wrong diagnosis, which also skipped the 500 path and the error tracker, so the fault left no
 * trace. The rule: only Payload's 404/403 mean "not visible"; everything else is an outage and must
 * escape with its identity intact.
 *
 * Fully faked `req` — no DB, no Payload boot → runs in `test:unit`.
 */
import { describe, expect, it, vi } from 'vitest'

import { validateContextLink } from '../../src/collections/Messages.js'

/** The hook's argument shape, with a `findByID` the test controls. */
const hookArgs = (findByID: () => Promise<unknown>, data: Record<string, unknown>) =>
  ({
    data,
    operation: 'create',
    req: { user: { id: 1 }, payload: { findByID: vi.fn(findByID) } },
  }) as never

const LINKED = { version: 5, lessonPlan: 9 }

describe('operational failures escape with their identity intact', () => {
  /**
   * ⚑ THE REGRESSION THIS FILE EXISTS FOR. Each of these, under the old `.catch(() => null)`,
   * became a 400 about lesson plans.
   */
  it.each([
    ['a 500 from Payload', { status: 500, message: 'internal' }],
    ['a driver fault', Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['a status-less runtime error', new TypeError('undefined is not a function')],
  ])('%s propagates rather than becoming a 400', async (_label, err) => {
    await expect(
      validateContextLink(hookArgs(() => Promise.reject(err), { ...LINKED })),
    ).rejects.toBe(err)
  })

  it('does NOT report an outage as a lesson-plan mismatch', async () => {
    const outage = new Error('connection terminated unexpectedly')
    await validateContextLink(hookArgs(() => Promise.reject(outage), { ...LINKED })).then(
      () => expect.fail('an outage must not resolve'),
      (e: unknown) => {
        expect((e as { status?: number }).status, 'an outage is not a client error').not.toBe(400)
        expect(String((e as Error).message)).not.toContain('must belong to the linked lesson plan')
      },
    )
  })
})

describe('genuine not-visible answers are still a 400', () => {
  it.each([404, 403])('a Payload %i becomes the lesson-plan 400', async (status) => {
    await expect(
      validateContextLink(hookArgs(() => Promise.reject({ status }), { ...LINKED })),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('a version belonging to a DIFFERENT plan is a 400', async () => {
    await expect(
      validateContextLink(
        hookArgs(() => Promise.resolve({ id: 5, lessonPlan: 99 }), { ...LINKED }),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('a version without its plan is a 400 before any lookup happens', async () => {
    const findByID = vi.fn(() => Promise.resolve({}))
    await expect(validateContextLink(hookArgs(findByID, { version: 5 }))).rejects.toMatchObject({
      status: 400,
    })
    expect(findByID, 'the missing plan is decidable without a read').not.toHaveBeenCalled()
  })
})

describe('the happy path and the paths that skip the check entirely', () => {
  it('derives the snapshot label when the version belongs to the plan, ignoring a supplied label', async () => {
    const data = { ...LINKED, versionLabel: 'forged' }
    await expect(
      validateContextLink(
        hookArgs(
          () => Promise.resolve({ id: 5, lessonPlan: 9, title: 'Fractions', semver: '1.0.1' }),
          data,
        ),
      ),
    ).resolves.toEqual({ ...LINKED, versionLabel: 'Fractions · v1.0.1' })
  })

  it.each([['no version link at all', { lessonPlan: 9 }]])(
    '%s skips the lookup',
    async (_label, data) => {
      const findByID = vi.fn(() => Promise.resolve({}))
      await expect(
        validateContextLink(hookArgs(findByID, { ...data, versionLabel: 'forged' })),
      ).resolves.toEqual({ ...data, versionLabel: null })
      expect(findByID).not.toHaveBeenCalled()
    },
  )

  /** System paths (fixtures, tests, seeds) run without `req.user` and are trusted by design. */
  it('a system path with no user still derives its label from the version', async () => {
    const data = { ...LINKED }
    const args = {
      data,
      operation: 'create',
      req: {
        payload: {
          findByID: vi.fn(async () => ({
            id: 5,
            title: 'Fractions',
            semver: '1.0.1',
            lessonPlan: 9,
          })),
        },
      },
    } as never
    await expect(validateContextLink(args)).resolves.toEqual({
      ...data,
      versionLabel: 'Fractions · v1.0.1',
    })
  })
})

describe('reply reference inheritance', () => {
  const original = {
    id: 8,
    sender: 2,
    recipient: 1,
    lessonPlan: 9,
    version: null,
    versionLabel: 'Fractions · v1.0.1',
  }

  it('copies the server snapshot and reply recipient, ignoring forged browser context', async () => {
    const findByID = vi.fn(async () => original)
    const args = hookArgs(findByID, {
      replyTo: 8,
      recipient: 77,
      lessonPlan: 99,
      version: 100,
      versionLabel: 'forged',
      body: 'Thanks',
    })
    await expect(validateContextLink(args)).resolves.toMatchObject({
      recipient: 2,
      lessonPlan: 9,
      version: null,
      versionLabel: original.versionLabel,
    })
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        id: 8,
        overrideAccess: false,
        user: { id: 1 },
      }),
    )
  })

  it('refuses a caller who is not the original recipient', async () => {
    const findByID = vi.fn(async () => ({ ...original, recipient: 99 }))
    await expect(validateContextLink(hookArgs(findByID, { replyTo: 8 }))).rejects.toMatchObject({
      status: 403,
    })
    expect(findByID).toHaveBeenCalledTimes(1)
  })

  it.each([403, 404])('maps an inaccessible original (%s) to 404', async (status) => {
    await expect(
      validateContextLink(hookArgs(() => Promise.reject({ status }), { replyTo: 8 })),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('does not hide an operational failure during the original-message lookup', async () => {
    const failure = new Error('database unavailable')
    await expect(
      validateContextLink(hookArgs(() => Promise.reject(failure), { replyTo: 8 })),
    ).rejects.toBe(failure)
  })

  it('keeps the original label if the version disappears or becomes unreadable while replying', async () => {
    const findByID = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'messages') return { ...original, version: 5 }
      throw { status: 404 }
    })
    await expect(
      validateContextLink(hookArgs(findByID as never, { replyTo: 8 })),
    ).resolves.toMatchObject({ version: null, versionLabel: original.versionLabel })
  })
})
