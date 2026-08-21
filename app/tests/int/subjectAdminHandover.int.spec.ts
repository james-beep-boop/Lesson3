/**
 * D6a as amended 2026-08-19 — a Subject Administrator may HAND OVER administration, not take it away.
 *
 * The three rules, asserted through the Local API as the real actor so `enforceAssignmentScope` runs:
 *
 *   1. ADD a `subjectAdmin` row for someone who already holds editing access here → permitted, and the
 *      demote cascade removes the actor's own administratorship in the same write.
 *   2. ADD one for someone with NO editing access here → refused. This is the operator's blast-radius
 *      narrowing, and it is asserted at the SERVER because the picker is not a security boundary.
 *   3. REMOVE a `subjectAdmin` row → refused, whoever it belongs to. Nobody may eject an administrator
 *      and nobody may resign by deleting their own row.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { User } from '@/payload-types'

import {
  MARK,
  createUserVerified,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'

let fx: RoleFixture

const rowsOf = async (id: number) => {
  const doc = await fx.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
  return ((doc.assignments ?? []) as { subjectGrade: number; role: string }[]).map(
    (a) => `${a.subjectGrade}:${a.role}`,
  )
}

/** The stored role values — narrower than `string`, which is what Payload's generated types expect. */
type AssignmentRow = { subjectGrade: number; role: 'subjectAdmin' | 'editor' }

/** Write `assignments` as the given actor, i.e. through the guard rather than around it. */
const setAssignments = (targetId: number, rows: AssignmentRow[], actor: User) =>
  fx.payload.update({
    collection: 'users',
    id: targetId,
    data: { assignments: rows },
    overrideAccess: false,
    user: actor,
  })

/** Through the house helper, which owns `disableVerificationEmail` — see `fixtures.ts`. */
const makeUser = (slug: string) =>
  createUserVerified(fx.payload, {
    email: `${MARK.toLowerCase()}${slug}@example.com`,
    name: `${MARK}${slug}`,
    password: fx.password,
  })

beforeAll(async () => {
  fx = await setupRoleFixture()
})
afterAll(async () => {
  await fx?.teardown()
})

describe('D6a amended — handover', () => {
  it('REFUSES appointing someone who has no editing access in that subject-grade', async () => {
    const outsider = await makeUser('handover-outsider')
    await expect(
      setAssignments(
        outsider.id,
        [{ subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin' }],
        fx.users.subjectAdmin,
      ),
    ).rejects.toThrow()
    expect(await rowsOf(outsider.id)).toEqual([])
  })

  it('REFUSES removing a subjectAdmin row, even the actor’s own', async () => {
    // The fixture's subjectAdmin holds the role for this subject-grade; stripping it is a removal.
    await expect(
      setAssignments(fx.users.subjectAdmin.id, [], fx.users.subjectAdmin),
    ).rejects.toThrow()
    expect(await rowsOf(fx.users.subjectAdmin.id)).toContain(`${fx.subjectGrade.id}:subjectAdmin`)
  })

  it('PERMITS handing over to an existing editor, and demotes the outgoing administrator', async () => {
    const successor = await makeUser('handover-successor')
    // Grant editing access first — as a Subject Administrator legitimately may.
    await setAssignments(
      successor.id,
      [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
      fx.users.subjectAdmin,
    )
    expect(await rowsOf(successor.id)).toEqual([`${fx.subjectGrade.id}:editor`])

    // Now the handover: promote that editor. Two deliberate steps, which is the point.
    await setAssignments(
      successor.id,
      [{ subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin' }],
      fx.users.subjectAdmin,
    )
    expect(await rowsOf(successor.id)).toEqual([`${fx.subjectGrade.id}:subjectAdmin`])

    // ⚑ THE CONSEQUENCE, which is why the confirm has to say it: the outgoing administrator is demoted
    // to editing access by `autoDemotePriorSubjectAdmins`, in the same transaction, and loses the
    // Roles & Access panel entirely on their next request.
    expect(await rowsOf(fx.users.subjectAdmin.id)).toEqual([`${fx.subjectGrade.id}:editor`])
  })
})
