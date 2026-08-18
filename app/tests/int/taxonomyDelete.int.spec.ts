/**
 * Taxonomy delete-guard integration tests (audit 2026-07-04, Phase 2 invariant tripwires).
 *
 * `lesson_plans` / `lesson_bundle_versions` / `users_assignments` all carry a NOT NULL
 * `subject_grade_id` with an ON DELETE SET NULL FK, and `subject_grades.subject_id` is the same
 * shape — so deleting a referenced SubjectGrade/Subject used to raise an opaque Postgres 23502
 * ("An unknown error has occurred"). The guards (collections/SubjectGrade + Subject) now:
 *   - BLOCK on referenced content (lesson plans / versions) with an actionable 409,
 *   - CASCADE dangling role assignments off their holders,
 *   - BLOCK a Subject delete while it still has SubjectGrades.
 *
 * Requires a DB → Rock only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  MARK,
  createUserVerified,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import {
  assignmentCountsBySubjectGrade,
  deleteConsequences,
  NO_ASSIGNMENTS,
} from '../../src/lib/assignmentCounts'
import { toId } from '../../src/access/index.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('SubjectGrade delete guard', () => {
  it('blocks deletion while lesson plans reference it (actionable, not 23502)', async () => {
    // The fixture SubjectGrade has the fixture plan + its Official version.
    await expect(
      fx.payload.delete({
        collection: 'subject-grades',
        id: fx.subjectGrade.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/lesson plan/i)
  })

  it('blocks the parent Subject delete while it still has SubjectGrades', async () => {
    await expect(
      fx.payload.delete({ collection: 'subjects', id: fx.subject.id, overrideAccess: true }),
    ).rejects.toThrow(/subject grade/i)
  })

  it('cascades dangling role assignments, then deletes cleanly once content is gone', async () => {
    // A fresh, content-free SubjectGrade with an editor assigned to it.
    const sg = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: fx.subject.id, grade: 98 },
      overrideAccess: true,
    })
    const holder = await createUserVerified(fx.payload, {
      name: `${MARK}sgDeleteEditor`,
      email: `${MARK.toLowerCase()}sgdel@example.com`,
      password: 'test1234',
      assignments: [{ subjectGrade: sg.id, role: 'editor' }],
    })

    await fx.payload.delete({ collection: 'subject-grades', id: sg.id, overrideAccess: true })

    // The assignment row to the now-gone SG is cascaded off the holder (not left dangling).
    const after = await fx.payload.findByID({
      collection: 'users',
      id: holder.id,
      depth: 0,
      overrideAccess: true,
    })
    expect((after.assignments ?? []).some((a) => toId(a.subjectGrade) === sg.id)).toBe(false)
  })

  /**
   * ⚑ THE COUNTS THE DELETE CONFIRMATION IS BUILT FROM, against REAL rows.
   *
   * `assignmentCountsBySubjectGrade` is raw SQL with two `FILTER (WHERE role = …)` clauses, and
   * nothing else can pin that they land in the right fields: the unit spec feeds hand-written rows,
   * and the E2E fixture seeds at least one of each role. Swap the two clauses and the panel would
   * tell an administrator that N people lose editing access when N is the count of Subject
   * Administrators — with every other test in this PR still green.
   *
   * The two counts are deliberately DIFFERENT here, so a swap cannot produce the same numbers.
   */
  it('counts assignments by role, mapping each role to its own field', async () => {
    const sg = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: fx.subject.id, grade: 97 },
      overrideAccess: true,
    })
    for (const n of [1, 2]) {
      await createUserVerified(fx.payload, {
        name: `${MARK}sgCount${n}`,
        email: `${MARK.toLowerCase()}sgcount${n}@example.com`,
        password: 'test1234',
        assignments: [{ subjectGrade: sg.id, role: 'editor' }],
      })
    }
    await createUserVerified(fx.payload, {
      name: `${MARK}sgCountAdmin`,
      email: `${MARK.toLowerCase()}sgcountadmin@example.com`,
      password: 'test1234',
      assignments: [{ subjectGrade: sg.id, role: 'subjectAdmin' }],
    })

    const counts = await assignmentCountsBySubjectGrade(fx.payload)
    expect(counts.get(sg.id)).toEqual({ editors: 2, subjectAdmins: 1 })

    // …and the sentence an administrator actually reads, built from those real counts.
    expect(
      deleteConsequences({ displayName: 'X', assignments: counts.get(sg.id) ?? NO_ASSIGNMENTS }),
    ).toContain('2 people lose editing access and 1 Subject Administrator is demoted')

    await fx.payload.delete({ collection: 'subject-grades', id: sg.id, overrideAccess: true })
  })
})

/**
 * The duplicate-(subject, grade) guard must surface a READABLE message, not a 500.
 *
 * `SubjectGrade.beforeValidate` exists for exactly one reason — the compound unique index is the real
 * guarantee, and the hook is there so an operator sees "Grade 10 already exists for that subject."
 * instead of an opaque constraint violation. It threw a bare `Error`, which Payload treats as an
 * unexpected fault: logged at error level, returned as a generic **500 "Something went wrong."** So
 * the hook produced an opaque failure of its own, and did so for its whole life.
 *
 * Pinned here because that regression is invisible: the guard still BLOCKS correctly either way, so
 * every behavioural test passes while the message the hook exists to deliver never arrives. The only
 * observable difference is the status code and the string.
 *
 * Found 2026-08-03 while chasing an operator report of a "stale subject" on this form. That report is
 * still unreproduced, but this is the most likely thing behind it: the save fails with no explanation,
 * Payload keeps the submitted values, and a form that will not save while showing the values you typed
 * reads exactly like a value that is stuck.
 */
describe('SubjectGrade duplicate guard surfaces a readable error', () => {
  /** Payload's APIError carries `status`; a bare Error would arrive as 500 with a generic message. */
  const statusOf = (e: unknown) => (e as { status?: number } | null)?.status
  const messageOf = (e: unknown) => (e as { message?: string } | null)?.message

  /**
   * The fixture subject-grade's `subject` as a plain id.
   *
   * Narrowed inline rather than through `toId`, and WITHOUT `as never`. `toId` is typed for a
   * subject-GRADE reference (`number | SubjectGrade`); this is a SUBJECT reference
   * (`number | Subject`) — structurally different types, which is exactly what the cast was hiding.
   * Same two-branch narrowing `SubjectGrade.beforeChange` uses on this field, and `subject` is
   * non-nullable in the generated type so there is no null case.
   *
   * ⚑ Shared by both cases below on purpose. A previous pass fixed the UPDATE occurrence and left its
   * twin in CREATE two functions away — the reviewed line got fixed, the problem did not. One helper
   * makes that impossible to repeat here.
   *
   * NOT a repo-wide cleanup: `toId(x as never)` appears in ~30 places under `src/`, because `toId` is
   * typed for one relationship shape and used on many. Generalising it is the real fix and belongs
   * with that helper, not in a test — recorded as a follow-up.
   */
  const fixtureSubjectId = () => {
    const s = fx.subjectGrade.subject
    return typeof s === 'object' ? s.id : s
  }

  it('rejects a duplicate (subject, grade) on CREATE with a 400 naming the clash', async () => {
    // The fixture's subject-grade already occupies (fixture subject, its grade).
    const sg = fx.subjectGrade
    let caught: unknown
    try {
      await fx.payload.create({
        collection: 'subject-grades',
        data: { subject: fixtureSubjectId(), grade: sg.grade },
        overrideAccess: true,
      })
    } catch (e) {
      caught = e
    }
    expect(caught, 'a duplicate (subject, grade) must be rejected').toBeDefined()
    expect(messageOf(caught)).toBe(`Grade ${sg.grade} already exists for that subject.`)
    expect(statusOf(caught), 'must be a 400 APIError, not an unexplained 500').toBe(400)
  })

  it('rejects a duplicate on UPDATE too, and still allows a legitimate move', async () => {
    // ⚑ "Legitimate MOVE" means a successful UPDATE. An earlier version of this test only did a
    // successful CREATE and then a rejected update, so the name overclaimed: the guard could have been
    // rejecting every update — including valid ones — and this test would still have passed. The
    // free-grade update below is what actually earns the second half of the name.
    const sg = fx.subjectGrade
    const subjectId = fixtureSubjectId()
    const base = sg.grade ?? 10
    const row = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: subjectId, grade: base + 41 },
      overrideAccess: true,
    })
    expect(row.displayName, 'displayName is maintained on create').toContain(`Grade ${base + 41}`)

    // A legitimate move: another free grade on the same subject. Must SUCCEED, and must re-derive the
    // stored title — the beforeChange hook is the only thing keeping `displayName` true.
    const legit = await fx.payload.update({
      collection: 'subject-grades',
      id: row.id,
      data: { grade: base + 42 },
      overrideAccess: true,
    })
    expect(legit.grade, 'a free grade must be accepted').toBe(base + 42)
    expect(legit.displayName, 'displayName follows the new grade without losing its subject').toBe(
      `${typeof fx.subjectGrade.subject === 'object' ? fx.subjectGrade.subject.name : fx.subject.name} — Grade ${base + 42}`,
    )

    // The state the rejected update below must leave completely untouched.
    const before = await fx.payload.findByID({
      collection: 'subject-grades',
      id: row.id,
      overrideAccess: true,
    })

    // Now move it onto the OCCUPIED pair — must be refused, readably.
    let caught: unknown
    try {
      await fx.payload.update({
        collection: 'subject-grades',
        id: row.id,
        data: { grade: sg.grade },
        overrideAccess: true,
      })
    } catch (e) {
      caught = e
    }
    expect(messageOf(caught)).toBe(`Grade ${sg.grade} already exists for that subject.`)
    expect(statusOf(caught)).toBe(400)

    // …and the refusal left the row alone — the WHOLE row, not just the field the update named.
    // Checking only `grade` would miss a partial write to a DERIVED field: `displayName` is rebuilt by
    // `beforeChange`, which runs after `beforeValidate`, so "the guard threw but the title already
    // moved" is a shape worth excluding rather than assuming. Captured before, compared after.
    const after = await fx.payload.findByID({
      collection: 'subject-grades',
      id: row.id,
      overrideAccess: true,
    })
    expect(
      { grade: after.grade, subject: after.subject, displayName: after.displayName },
      'a rejected update must not partially apply — including derived fields',
    ).toEqual({ grade: before.grade, subject: before.subject, displayName: before.displayName })

    // ⚑ THE case the self-exclusion exists for: re-saving a row WITHOUT changing (subject, grade).
    // The row then clashes with ITSELF, and only `clash.id !== originalDoc?.id` keeps the save legal —
    // so an operator opening a subject-grade and pressing Save would be refused without it.
    //
    // Added after checking whether the tests above could see that: they could NOT. Deleting the
    // self-exclusion left all of them green, because every "legitimate" update they perform moves to a
    // FREE grade, where no clash is found and the exclusion never runs. A successful update is not the
    // same test as a successful *self*-colliding update.
    const resaved = await fx.payload.update({
      collection: 'subject-grades',
      id: row.id,
      data: { grade: base + 42 },
      overrideAccess: true,
    })
    expect(resaved.grade, 'an unchanged re-save must be allowed').toBe(base + 42)

    await fx.payload.delete({ collection: 'subject-grades', id: row.id, overrideAccess: true })
  })

  it('merges the stored grade into a subject-only partial update and refreshes displayName', async () => {
    const subjectId = fixtureSubjectId()
    const grade = (fx.subjectGrade.grade ?? 10) + 43
    const targetSubject = await fx.payload.create({
      collection: 'subjects',
      data: { name: `${MARK}Partial-update target` },
      overrideAccess: true,
    })
    const row = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: subjectId, grade },
      overrideAccess: true,
    })

    // PATCH semantics: only `subject` is submitted. The hook must use originalDoc.grade for both
    // duplicate validation and the derived title rather than skipping either operation.
    const moved = await fx.payload.update({
      collection: 'subject-grades',
      id: row.id,
      data: { subject: targetSubject.id },
      overrideAccess: true,
    })
    expect(moved.grade).toBe(grade)
    expect(moved.displayName).toBe(`${targetSubject.name} — Grade ${grade}`)

    await fx.payload.delete({ collection: 'subject-grades', id: row.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'subjects', id: targetSubject.id, overrideAccess: true })
  })

  it('lets the database serialize concurrent subject-only moves onto the same unique pair', async () => {
    const grade = (fx.subjectGrade.grade ?? 10) + 44
    const [sourceA, sourceB, target] = await Promise.all(
      ['A', 'B', 'target'].map((suffix) =>
        fx.payload.create({
          collection: 'subjects',
          data: { name: `${MARK}Concurrent ${suffix}` },
          overrideAccess: true,
        }),
      ),
    )
    const [rowA, rowB] = await Promise.all([
      fx.payload.create({
        collection: 'subject-grades',
        data: { subject: sourceA.id, grade },
        overrideAccess: true,
      }),
      fx.payload.create({
        collection: 'subject-grades',
        data: { subject: sourceB.id, grade },
        overrideAccess: true,
      }),
    ])

    // Both friendly pre-checks can observe the target pair as free. The compound unique index is the
    // authoritative race-safe guarantee: exactly one transaction may claim it.
    const outcomes = await Promise.allSettled(
      [rowA, rowB].map((row) =>
        fx.payload.update({
          collection: 'subject-grades',
          id: row.id,
          data: { subject: target.id },
          overrideAccess: true,
        }),
      ),
    )
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)

    const claimed = await fx.payload.find({
      collection: 'subject-grades',
      depth: 0,
      overrideAccess: true,
      where: { and: [{ subject: { equals: target.id } }, { grade: { equals: grade } }] },
    })
    expect(claimed.totalDocs, 'the unique pair must exist exactly once after the race').toBe(1)
    expect(claimed.docs[0]?.displayName).toBe(`${target.name} — Grade ${grade}`)

    await Promise.all(
      [rowA, rowB].map((row) =>
        fx.payload.delete({ collection: 'subject-grades', id: row.id, overrideAccess: true }),
      ),
    )
    await Promise.all(
      [sourceA, sourceB, target].map((subject) =>
        fx.payload.delete({ collection: 'subjects', id: subject.id, overrideAccess: true }),
      ),
    )
  })
})
