/**
 * `validateOfficialVersionPointer` — that its checks survive a PARTIAL update, and that they cost
 * nothing on a write that cannot affect them.
 *
 * The full argument for the guard lives on the ⚑ at `hooks/lessonPlan.ts` and is not restated here.
 * Two things worth recording that the hook cannot say about itself:
 *
 *   ⚑ The old early return was ALSO doing type narrowing. Removing `if (!data?.officialVersion)`
 *     surfaced an unguarded `data.subjectGrade` that `tsc` had never complained about — a guard
 *     silently doubling as a type assertion is part of how the hole hid.
 *
 *   ⚑ `'officialVersion' in data` vs `??` is pinned by two cases below, because the difference only
 *     shows up on an explicit `null` (a system clear) and is otherwise invisible.
 *
 * DB-free: only `payload.findByID` is stubbed, so the hook's own control flow is what runs.
 */
import { describe, expect, it, vi } from 'vitest'

import { validateOfficialVersionPointer } from '@/hooks/lessonPlan'
import { fieldErrors } from '../helpers/payloadErrors'

/** The stored Official version the plan points at, as the hook reads it back. */
const OFFICIAL_VERSION = { id: 900, lessonPlan: 1, subjectGrade: 5 }
/** The plan as stored: subject-grade 5, pointing at version 900. */
const STORED_PLAN = { id: 1, subjectGrade: 5, officialVersion: 900 }

const run = (args: {
  data: Record<string, unknown>
  /** Override the stored plan — e.g. one with no Official version yet. */
  originalDoc?: Record<string, unknown>
  /** Override what the Official version looks up as — e.g. one owned by another plan. */
  version?: Record<string, unknown>
  /** `null` for a SYSTEM write (no `req.user`) — ingest, migrations, fixture teardown. */
  user?: { id: number } | null
}) => {
  const findByID = vi.fn().mockResolvedValue(args.version ?? OFFICIAL_VERSION)
  return {
    findByID,
    call: () =>
      validateOfficialVersionPointer({
        data: args.data,
        operation: 'update',
        originalDoc: args.originalDoc ?? STORED_PLAN,
        req: {
          user: args.user === undefined ? { id: 7 } : args.user,
          t: (k: string) => k,
          payload: { findByID },
        },
      } as never) as Promise<unknown>,
  }
}

describe('a partial update cannot slip past the invariants', () => {
  it('REJECTS moving the plan to another subject-grade when only subjectGrade is submitted', async () => {
    // The shape that used to slip through: no `officialVersion` key at all.
    const { call } = run({ data: { subjectGrade: 6 } })
    expect(await fieldErrors(call())).toEqual([
      {
        message: expect.stringMatching(/must match this lesson plan subject-grade/i),
        path: 'officialVersion',
      },
    ])
  })

  it('still checks ownership on a partial update', async () => {
    // Same omission, but the stored Official version belongs to a different plan.
    const { call } = run({
      data: { subjectGrade: 5 },
      version: { id: 900, lessonPlan: 42, subjectGrade: 5 },
    })
    const [error] = await fieldErrors(call())
    expect(error.message).toMatch(/must belong to this lesson plan/i)
  })

  it('still rejects an explicit pointer that mismatches, as it always did', async () => {
    const { call } = run({ data: { officialVersion: 900, subjectGrade: 6 } })
    const [error] = await fieldErrors(call())
    expect(error.message).toMatch(/must match this lesson plan subject-grade/i)
  })

  it('allows a same-subject-grade partial update, having actually looked the version up', async () => {
    const { findByID, call } = run({ data: { subjectGrade: 5 } })
    await expect(call()).resolves.toEqual({ subjectGrade: 5 })
    // The lookup is what makes the two rejections above reachable at all.
    expect(findByID).toHaveBeenCalledOnce()
  })
})

describe('and costs nothing when it cannot apply', () => {
  it('does NOT look up the version when the request touches neither key', async () => {
    // ⚑ Both remaining checks compare stored state against stored state, so a write that moves
    // neither side cannot change their answer. Every edit to `title`, `visibility` or `publicSlug`
    // takes this path — interactive admin paths that would otherwise pay for a read each.
    const { findByID, call } = run({ data: { title: 'Renamed' } })
    await expect(call()).resolves.toEqual({ title: 'Renamed' })
    expect(findByID).not.toHaveBeenCalled()
  })

  it('does NOT look up the version when a SYSTEM write clears the pointer', async () => {
    // ⚑ Why `'officialVersion' in data` and not `??`: an explicit null is a system clear. `??` read
    // that null as "not mentioned" and fell back to the stored pointer, so every clear fetched and
    // validated the very version it was about to unpoint — and `purgeMarked` clears up to 200 plans
    // per batch on every int/http spec teardown.
    //
    // `user: null` is the real shape: an AUTHENTICATED clear is refused higher up in this same hook
    // ("a lesson plan must keep one Official version"), so only system paths reach here — which the
    // next case pins, so this one cannot quietly start testing the wrong branch.
    const { findByID, call } = run({ data: { officialVersion: null }, user: null })
    await expect(call()).resolves.toEqual({ officialVersion: null })
    expect(findByID).not.toHaveBeenCalled()
  })

  it('and an AUTHENTICATED clear is still refused, before any lookup', async () => {
    const { findByID, call } = run({ data: { officialVersion: null } })
    const [error] = await fieldErrors(call())
    expect(error.message).toMatch(/must keep one Official version/i)
    expect(findByID).not.toHaveBeenCalled()
  })

  it('does nothing when the plan has no Official version yet', async () => {
    // The legitimate early return this always had: a freshly ingested plan, before its pointer is set.
    const { findByID, call } = run({
      data: { subjectGrade: 6 },
      originalDoc: { id: 1, subjectGrade: 5 },
    })
    await expect(call()).resolves.toEqual({ subjectGrade: 6 })
    expect(findByID).not.toHaveBeenCalled()
  })
})
