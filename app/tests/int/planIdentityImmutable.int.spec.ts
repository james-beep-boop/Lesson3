/**
 * A lesson plan's subject-grade is fixed at ingest — and this pins the claim the SPEC actually makes,
 * which the other two tests cannot reach.
 *
 * ⚑ WHAT WAS ALREADY COVERED, AND WHY IT IS NOT ENOUGH. `tests/unit/planSubjectGradeImmutable.spec.ts`
 * calls `enforcePlanSubjectGradeImmutable` directly: it proves the rule, not that the rule is WIRED
 * into the collection. `tests/http/endpoints.http.spec.ts` proves the REST door is shut for a Site
 * Administrator. Neither touches the strongest sentence in SPEC §5 — that a **trusted Local API**
 * update is refused too, `overrideAccess: true` and all. That is the claim an operator would lean on
 * when deciding whether a script can "just fix" a mis-categorised plan, so it is the one worth a test.
 *
 * The distinction is real rather than pedantic: `overrideAccess: true` bypasses ACCESS, and the field
 * still carries `access: { update: canEditStructure }` — so if the invariant lived only in field
 * access, this exact call would succeed. It lives in a collection hook precisely so it does not.
 *
 * ⚑ Deleting and re-uploading is the intended remedy, and it is safe by construction rather than by
 * convention: ingest matches an existing plan on `subjectGrade` AND `meta.substrand_id` together
 * (`src/ingest/index.ts`), so a re-upload under a different grade creates a NEW plan and never tries
 * to move one. Verified 2026-08-25 — this is why the immutability rule cannot collide with re-ingest.
 *
 * ⚑ AND THE ASSERTIONS NAME THE ERROR, which is not fussiness — the first draft of this file used a
 * bare `rejects.toThrow()` and PASSED with the hook unwired from the collection. `validateOfficialVersionPointer`
 * (#291) already refuses a move on a plan that HAS an Official version, so a loose assertion proves
 * the older guard, not this one. Caught by mutation. The second case below is the one the older guard
 * cannot reach at all: a plan with NO Official pointer, which #291 lets through by design.
 *
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { fieldErrors } from '../helpers/payloadErrors.js'

let fx: RoleFixture
let otherSubjectGrade: number

beforeAll(async () => {
  fx = await setupRoleFixture()
  const sg = await fx.payload.create({
    collection: 'subject-grades',
    data: { subject: fx.subject.id, grade: 97 } as never,
    overrideAccess: true,
  })
  otherSubjectGrade = Number(sg.id)
})

afterAll(async () => {
  // ⚑ The explicit delete is kept even though `purgeMarked` would sweep this row too (its
  // `displayName` derives from the MARK-tagged fixture subject). Leaning on the sweep reads as tidier
  // and is how int-suite residue turns into six unrelated failures in the next run — which cost real
  // time on 2026-08-25. Explicit teardown of what a spec explicitly created.
  await fx.payload.delete({
    collection: 'subject-grades',
    id: otherSubjectGrade,
    overrideAccess: true,
  })
  await fx.teardown()
})

/** The stored relationship, read at depth 0 so the answer is an id rather than a document. */
const storedSubjectGrade = async (): Promise<string> => {
  const plan = await fx.payload.findByID({
    collection: 'lesson-plans',
    id: fx.plan.id,
    depth: 0,
    overrideAccess: true,
  })
  return String(plan.subjectGrade)
}

describe('a plan cannot be moved between subject-grades', () => {
  it('refuses a trusted Local API update with overrideAccess, by THIS rule', async () => {
    const before = await storedSubjectGrade()

    // The message and path are asserted so a pass cannot come from the Official-pointer guard.
    expect(
      await fieldErrors(
        fx.payload.update({
          collection: 'lesson-plans',
          id: fx.plan.id,
          data: { subjectGrade: otherSubjectGrade } as never,
          overrideAccess: true,
        }),
      ),
    ).toEqual([
      { message: expect.stringMatching(/fixed when it is uploaded/i), path: 'subjectGrade' },
    ])

    expect(await storedSubjectGrade(), 'the stored relationship must be untouched').toBe(before)
  })

  it('refuses it even for a plan with NO Official version — the case #291 cannot reach', async () => {
    // ⚑ THE REASON THIS HOOK EXISTS AT ALL. `validateOfficialVersionPointer` returns early when the
    // plan has no Official pointer, so without this rule a freshly ingested or repaired plan would
    // still be movable. Nothing else covers it.
    const bare = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}Plan with no Official version`, subjectGrade: fx.subjectGrade.id },
      overrideAccess: true,
    })
    try {
      expect(bare.officialVersion ?? null, 'precondition: no Official pointer').toBeNull()
      const [error] = await fieldErrors(
        fx.payload.update({
          collection: 'lesson-plans',
          id: bare.id,
          data: { subjectGrade: otherSubjectGrade } as never,
          overrideAccess: true,
        }),
      )
      expect(error.path).toBe('subjectGrade')
      expect(error.message).toMatch(/fixed when it is uploaded/i)
    } finally {
      await fx.payload.delete({ collection: 'lesson-plans', id: bare.id, overrideAccess: true })
    }
  })

  it('accepts a same-value write through the whole hook chain', async () => {
    // ⚑ The unit spec already pins the no-op at hook level; what this adds is that it survives the
    // REST of the chain — `validateOfficialVersionPointer` runs next and does a `findByID`, so a
    // same-value write has to pass two guards, not one.
    //
    // (An earlier version of this comment said "which is what the admin form submits". That is no
    // longer true: the same change made `LessonPlans.subjectGrade` `admin: { hidden: true }`, so the
    // repair form no longer renders the control. The claim above does not depend on it.)
    const current = await storedSubjectGrade()
    await expect(
      fx.payload.update({
        collection: 'lesson-plans',
        id: fx.plan.id,
        data: { subjectGrade: Number(current) } as never,
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()
  })
})
