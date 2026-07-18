/**
 * `canDeleteVersionDoc` — the per-document form of the version-deletion scope, DB-free.
 *
 * It MUST stay in lockstep with `deletableVersionsWhere` (the Where form the server access function +
 * the Manage list query use): Site Admin → any; Subject Admin → any in their sg; Editor → ONLY a
 * version they authored in their editor sg. The client (LessonControls) can't run a Where, so it uses
 * this to decide whether to OFFER Delete — a drift here shows a destructive button that then 403s.
 * The load-bearing case is the LAST one: authorship alone must NOT grant delete once the Editor role
 * for that sg is gone (a since-demoted author retaining a role elsewhere).
 */
import { describe, it, expect } from 'vitest'

import { canDeleteVersionDoc } from '../../src/access/versioning'
import type { User } from '../../src/payload-types'

const SG = 10
const OTHER_SG = 20
const ME = 7

const user = (over: Partial<User>): User => ({ id: ME, ...over }) as User

const version = { subjectGrade: SG, author: ME }

describe('canDeleteVersionDoc', () => {
  it('Site Admin can delete any version', () => {
    expect(canDeleteVersionDoc(user({ roles: ['siteAdmin'] }), { subjectGrade: SG, author: 999 })).toBe(true)
  })

  it('Subject Admin of the sg can delete any version there (author irrelevant)', () => {
    const u = user({ assignments: [{ subjectGrade: SG, role: 'subjectAdmin' }] })
    expect(canDeleteVersionDoc(u, { subjectGrade: SG, author: 999 })).toBe(true)
  })

  it('Editor of the sg can delete a version they authored', () => {
    const u = user({ assignments: [{ subjectGrade: SG, role: 'editor' }] })
    expect(canDeleteVersionDoc(u, version)).toBe(true)
  })

  it('Editor of the sg CANNOT delete a version authored by someone else', () => {
    const u = user({ assignments: [{ subjectGrade: SG, role: 'editor' }] })
    expect(canDeleteVersionDoc(u, { subjectGrade: SG, author: 999 })).toBe(false)
  })

  it('role loss: an author who is no longer an Editor for the sg cannot delete it', () => {
    // Authored the version while an Editor for SG, since reassigned to only OTHER_SG. Server refuses,
    // so the client must not offer Delete (the drift GPT flagged).
    const u = user({ assignments: [{ subjectGrade: OTHER_SG, role: 'editor' }] })
    expect(canDeleteVersionDoc(u, version)).toBe(false)
  })

  it('a plain Teacher who authored the version cannot delete it', () => {
    expect(canDeleteVersionDoc(user({ assignments: [] }), version)).toBe(false)
  })

  it('null user / null author are safe', () => {
    expect(canDeleteVersionDoc(null, version)).toBe(false)
    const u = user({ assignments: [{ subjectGrade: SG, role: 'editor' }] })
    expect(canDeleteVersionDoc(u, { subjectGrade: SG, author: null })).toBe(false)
  })
})
