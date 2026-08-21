import { describe, expect, it } from 'vitest'

import { enforceAssignmentScope } from '../../src/hooks/userRoles'

/**
 * The D6a guard, tested where it can actually be falsified.
 *
 * ⚑ THIS FILE EXISTS BECAUSE THE WIRE TEST COULD NOT DO IT. The first version of PR 4's coverage put
 * the D6a assertions in `tests/http/userAssignments.http.spec.ts`, after a happy-path test that
 * appoints a new Subject Administrator — which, through `autoDemotePriorSubjectAdmins`, demotes the
 * fixture account those assertions then used as their CALLER. From that point the caller was a
 * Teacher with editing access, so the "refuses a subjectAdmin row" case 403'd at COLLECTION ACCESS
 * before the hook ran, and passed identically with the guard deleted. The wire spec still covers the
 * route and the generic PATCH; what it cannot do cheaply is hold the caller's own role still.
 *
 * Here the hook is called directly with hand-built rows: no fixtures, no ordering, no HTTP, and every
 * branch reachable in one line. `rowSignature` includes the role, so a promotion is an ADDED
 * `subjectAdmin` row, a demotion a REMOVED one, and a role change both — the three cases below.
 */
const t = ((k: string) => k) as never

const call = (args: {
  actor: Record<string, unknown> | null
  before: { subjectGrade: number; role: string }[]
  after: { subjectGrade: number; role: string }[]
  targetIsSiteAdmin?: boolean
  systemWrite?: boolean
}) =>
  enforceAssignmentScope({
    context: args.systemWrite ? { systemAssignmentWrite: true } : {},
    data: { assignments: args.after },
    originalDoc: {
      assignments: args.before,
      ...(args.targetIsSiteAdmin ? { roles: ['siteAdmin'] } : {}),
    },
    req: { user: args.actor, t },
  } as never)

/** A Subject Administrator of subject-grade 1 — the actor D6a is about. */
const scopedAdmin = { id: 7, assignments: [{ subjectGrade: 1, role: 'subjectAdmin' }] }
const siteAdmin = { id: 1, roles: ['siteAdmin'] }

describe('enforceAssignmentScope — D6a amended: hand administration over, never take it away', () => {
  /**
   * ⚑ THE RULE CHANGED ON 2026-08-19 AND THIS BLOCK CHANGED WITH IT. It previously asserted that a
   * Subject Administrator could neither add nor remove a `subjectAdmin` row. Addition is now permitted
   * as a HANDOVER, because ≤1 per subject-grade means appointing a successor fires
   * `autoDemotePriorSubjectAdmins` and costs the actor their own role in the same write — append-only
   * in form, self-demoting in effect.
   *
   * ⚑ The case that used to read "refuses CHANGING a row between the two roles" is now the PRIMARY
   * PERMITTED case, and it failed loudly when the guard was split — which is what a unit pin is for.
   */
  it('PERMITS handing over to someone who already holds editing access here', () => {
    expect(() =>
      call({
        actor: scopedAdmin,
        before: [{ subjectGrade: 1, role: 'editor' }],
        after: [{ subjectGrade: 1, role: 'subjectAdmin' }],
      }),
    ).not.toThrow()
  })

  it('refuses appointing someone with NO editing access in that subject-grade', () => {
    // The operator's blast-radius narrowing: you may only hand the role to someone already trusted
    // with this subject-grade's content. Server-side, because the picker is not a boundary.
    expect(() =>
      call({ actor: scopedAdmin, before: [], after: [{ subjectGrade: 1, role: 'subjectAdmin' }] }),
    ).toThrow()
  })

  it('refuses granting editing access and administration in ONE write', () => {
    // Eligibility is read from `before`, not `after`, so a single PATCH cannot bootstrap both. Two
    // deliberate steps is the point — this is the mis-click the narrowing exists to prevent.
    expect(() =>
      call({
        actor: scopedAdmin,
        before: [],
        after: [
          { subjectGrade: 1, role: 'editor' },
          { subjectGrade: 1, role: 'subjectAdmin' },
        ],
      }),
    ).toThrow()
  })

  it('refuses a Subject Administrator REMOVING a subjectAdmin row in their own scope', () => {
    // Unchanged by the amendment, and the half that keeps it safe: nobody may eject an administrator,
    // and nobody may resign by deleting their own row. It reaches the guard through the `before`-side
    // of the diff, which is exactly why added and removed rows are now named separately.
    expect(() =>
      call({ actor: scopedAdmin, before: [{ subjectGrade: 1, role: 'subjectAdmin' }], after: [] }),
    ).toThrow()
  })

  it('refuses a handover OUTSIDE the actor’s scope, even to an existing editor there', () => {
    expect(() =>
      call({
        actor: scopedAdmin,
        before: [{ subjectGrade: 2, role: 'editor' }],
        after: [{ subjectGrade: 2, role: 'subjectAdmin' }],
      }),
    ).toThrow()
  })

  /**
   * ⚑ THE ASSERTION THAT MAKES THE OTHERS MEAN SOMETHING. A guard that simply refused every
   * assignment write by a Subject Administrator would pass all three cases above while removing the
   * power they are supposed to keep — the whole point of D6a is that it is NARROW.
   */
  it('still allows the same actor to grant EDITING ACCESS in their own scope', () => {
    expect(() =>
      call({ actor: scopedAdmin, before: [], after: [{ subjectGrade: 1, role: 'editor' }] }),
    ).not.toThrow()
  })

  it('still refuses an editor grant OUTSIDE their scope — the pre-existing rule is unchanged', () => {
    expect(() =>
      call({ actor: scopedAdmin, before: [], after: [{ subjectGrade: 2, role: 'editor' }] }),
    ).toThrow()
  })

  it('leaves a SITE ADMIN unrestricted', () => {
    expect(() =>
      call({ actor: siteAdmin, before: [], after: [{ subjectGrade: 9, role: 'subjectAdmin' }] }),
    ).not.toThrow()
  })

  it('treats an actorless (system/trusted) write as unrestricted', () => {
    // `overrideAccess` bypasses access control but NOT hooks, so system cascades re-enter here.
    expect(() =>
      call({ actor: null, before: [{ subjectGrade: 1, role: 'subjectAdmin' }], after: [] }),
    ).not.toThrow()
  })

  /**
   * ⚑ A CASCADE IS NOT AN ACTOR. `overrideAccess` bypasses access control but not hooks, so
   * `autoDemotePriorSubjectAdmins` and `guardSubjectGradeDelete` re-enter this hook carrying the
   * requesting user — and both legitimately rewrite `subjectAdmin` rows. Without the exemption a
   * Subject Administrator's own valid grant could 403 from a cascade they never asked for.
   */
  it('exempts a system write that maintains an invariant', () => {
    expect(() =>
      call({
        actor: scopedAdmin,
        before: [{ subjectGrade: 1, role: 'subjectAdmin' }],
        after: [{ subjectGrade: 1, role: 'editor' }],
        systemWrite: true,
      }),
    ).not.toThrow()
  })

  it('keeps refusing any change to a SITE ADMIN target — the pre-existing rule is unchanged', () => {
    expect(() =>
      call({
        actor: scopedAdmin,
        before: [],
        after: [{ subjectGrade: 1, role: 'editor' }],
        targetIsSiteAdmin: true,
      }),
    ).toThrow()
  })
})
