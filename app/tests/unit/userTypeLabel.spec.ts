import { describe, expect, it } from 'vitest'

import { adminScopeIds, editingAccessScopeIds, userTypeLabel } from '../../src/access'
import type { User } from '../../src/payload-types'

/**
 * The displayed user model (DESIGN-user-model-language, 2026-07-29): three types only, with an
 * editor-only grant surfacing as Teacher + a separate editing-access scope — never "Editor" as a
 * type. These are pure presentation helpers over the UNCHANGED authorization model; the point of the
 * spec is to pin the three-type collapse and the disjoint scope partition (no double-listing).
 */

// Minimal User shapes — only the fields the helpers read (roles, assignments).
const user = (
  roles: string[],
  assignments: { sg: number; role: 'subjectAdmin' | 'editor' }[],
): User =>
  ({
    roles,
    assignments: assignments.map((a) => ({ subjectGrade: a.sg, role: a.role })),
  }) as unknown as User

describe('userTypeLabel — three displayed types, sentence case', () => {
  it('a plain authenticated user is a Teacher', () => {
    expect(userTypeLabel(user([], []))).toBe('Teacher')
  })

  it('an editor-only user is a Teacher (Editor is not a type)', () => {
    expect(userTypeLabel(user([], [{ sg: 10, role: 'editor' }]))).toBe('Teacher')
  })

  it('a subject-grade admin is a Subject-grade administrator', () => {
    expect(userTypeLabel(user([], [{ sg: 10, role: 'subjectAdmin' }]))).toBe(
      'Subject-grade administrator',
    )
  })

  it('a site admin is a Site administrator', () => {
    expect(userTypeLabel(user(['siteAdmin'], []))).toBe('Site administrator')
  })

  it('a mixed subjectAdmin-here / editor-there user is a Subject-grade administrator (admin wins the type)', () => {
    const u = user(
      [],
      [
        { sg: 10, role: 'subjectAdmin' },
        { sg: 11, role: 'editor' },
      ],
    )
    expect(userTypeLabel(u)).toBe('Subject-grade administrator')
  })

  it('handles a null/undefined user', () => {
    expect(userTypeLabel(null)).toBe('Teacher')
    expect(userTypeLabel(undefined)).toBe('Teacher')
  })
})

describe('scope-id helpers — role partitions (disjointness enforced by resolveAccessScopes)', () => {
  it('editor-only: an editing scope, no admin scope', () => {
    const u = user([], [{ sg: 10, role: 'editor' }])
    expect(adminScopeIds(u)).toEqual([])
    expect(editingAccessScopeIds(u)).toEqual([10])
  })

  it('subject admin: an admin scope, not double-listed under editing access', () => {
    const u = user([], [{ sg: 10, role: 'subjectAdmin' }])
    expect(adminScopeIds(u)).toEqual([10])
    expect(editingAccessScopeIds(u)).toEqual([])
  })

  it('mixed: admin and editing scopes are separate and disjoint', () => {
    const u = user(
      [],
      [
        { sg: 10, role: 'subjectAdmin' },
        { sg: 11, role: 'editor' },
      ],
    )
    expect(adminScopeIds(u)).toEqual([10])
    expect(editingAccessScopeIds(u)).toEqual([11])
    // No id appears in both lists.
    expect(adminScopeIds(u).some((id) => editingAccessScopeIds(u).includes(id))).toBe(false)
  })
})
