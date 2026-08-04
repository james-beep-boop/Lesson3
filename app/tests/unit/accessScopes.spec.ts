import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { resolveAccessScopes, resolveAccessSummary, scopeLines } from '../../src/lib/accessScopes'
import type { User } from '../../src/payload-types'

/**
 * The display-model resolver (DESIGN-user-model-language, 2026-07-29). These are the cases the
 * pure-helper spec (userTypeLabel.spec.ts) can't reach because they need the id→label resolution:
 * the site-admin treatment, same-subject-grade dual-role disjointness, deleted-scope handling, and
 * the exact formatted lines shared by the user menu and the Manage page.
 */

type Row = { sg: number; role: 'subjectAdmin' | 'editor' }
const user = (roles: string[], assignments: Row[]): User =>
  ({ roles, assignments: assignments.map((a) => ({ subjectGrade: a.sg, role: a.role })) }) as unknown as User

// A stub Payload whose `find` returns the subject-grades it's asked for by id — so the resolver's
// label lookup can be exercised without a database. `find` is a spy so tests can assert it is (not)
// called. A subject-grade absent from `catalogue` models a deleted/missing relationship.
const stubPayload = (catalogue: { id: number; subject: string; grade: number }[]) => {
  const find = vi.fn(async ({ where }: { where?: { id?: { in?: number[] } } }) => {
    const ids = where?.id?.in ?? []
    return {
      docs: catalogue
        .filter((sg) => ids.includes(sg.id))
        .map((sg) => ({ id: sg.id, subject: { name: sg.subject }, grade: sg.grade })),
    }
  })
  return { payload: { find } as unknown as Payload, find }
}

const CATALOGUE = [
  { id: 10, subject: 'Biology', grade: 10 },
  { id: 11, subject: 'Chemistry', grade: 11 },
]

describe('scopeLines — formatting (pure)', () => {
  it('is empty when there are no scopes', () => {
    expect(scopeLines({ adminScopes: [], editingScopes: [] })).toEqual([])
  })

  it('renders admin first, then editing, joining multiple scopes with a comma', () => {
    expect(
      scopeLines({ adminScopes: ['Biology · Grade 10', 'Physics · Grade 9'], editingScopes: ['Chemistry · Grade 11'] }),
    ).toEqual(['Administrator: Biology · Grade 10, Physics · Grade 9', 'Editing access: Chemistry · Grade 11'])
  })

  it('omits the line for an empty side', () => {
    expect(scopeLines({ adminScopes: [], editingScopes: ['Chemistry · Grade 11'] })).toEqual([
      'Editing access: Chemistry · Grade 11',
    ])
  })
})

describe('resolveAccessScopes — id resolution + disjointness', () => {
  it('makes no query and returns empty for a user with no assignments', async () => {
    const { payload, find } = stubPayload(CATALOGUE)
    expect(await resolveAccessScopes(payload, user([], []))).toEqual({ adminScopes: [], editingScopes: [] })
    expect(find).not.toHaveBeenCalled()
  })

  it('resolves an editor-only grant to an editing scope, no admin scope', async () => {
    const { payload } = stubPayload(CATALOGUE)
    expect(await resolveAccessScopes(payload, user([], [{ sg: 10, role: 'editor' }]))).toEqual({
      adminScopes: [],
      editingScopes: ['Biology · Grade 10'],
    })
  })

  it('resolves a subject-admin grant to an admin scope, no editing scope', async () => {
    const { payload } = stubPayload(CATALOGUE)
    expect(await resolveAccessScopes(payload, user([], [{ sg: 10, role: 'subjectAdmin' }]))).toEqual({
      adminScopes: ['Biology · Grade 10'],
      editingScopes: [],
    })
  })

  it('keeps admin and editing scopes for different subject-grades separate', async () => {
    const { payload } = stubPayload(CATALOGUE)
    const u = user([], [{ sg: 10, role: 'subjectAdmin' }, { sg: 11, role: 'editor' }])
    expect(await resolveAccessScopes(payload, u)).toEqual({
      adminScopes: ['Biology · Grade 10'],
      editingScopes: ['Chemistry · Grade 11'],
    })
  })

  it('lists a same-subject-grade admin+editor pair ONCE, under Administrator (enforced disjointness)', async () => {
    const { payload } = stubPayload(CATALOGUE)
    // Reachable via the demote path (hooks/userRoles.ts): a subjectAdmin row rewritten to editor can
    // coexist with an existing editor row for the same subject-grade.
    const u = user([], [{ sg: 10, role: 'subjectAdmin' }, { sg: 10, role: 'editor' }])
    expect(await resolveAccessScopes(payload, u)).toEqual({
      adminScopes: ['Biology · Grade 10'],
      editingScopes: [],
    })
  })

  it('silently drops a grant whose subject-grade no longer exists', async () => {
    const { payload } = stubPayload(CATALOGUE)
    const u = user([], [{ sg: 10, role: 'editor' }, { sg: 99, role: 'editor' }])
    expect(await resolveAccessScopes(payload, u)).toEqual({
      adminScopes: [],
      editingScopes: ['Biology · Grade 10'],
    })
  })

  it('renders a duplicate same-role grant once (ids are distinct before mapping)', async () => {
    const { payload } = stubPayload(CATALOGUE)
    // Two identical rows for the same subject-grade — `subjectGradeIdsByRole` returns distinct ids,
    // so the label is not repeated (no per-list re-dedupe needed in the resolver).
    const u = user([], [{ sg: 10, role: 'subjectAdmin' }, { sg: 10, role: 'subjectAdmin' }])
    expect(await resolveAccessScopes(payload, u)).toEqual({
      adminScopes: ['Biology · Grade 10'],
      editingScopes: [],
    })
  })

  it('propagates a query failure (callers own the fallback — see AppNav)', async () => {
    const find = vi.fn(async () => {
      throw new Error('db down')
    })
    const payload = { find } as unknown as Payload
    await expect(resolveAccessScopes(payload, user([], [{ sg: 10, role: 'editor' }]))).rejects.toThrow('db down')
  })
})

describe('resolveAccessSummary — type + lines, one source of truth for both surfaces', () => {
  it('shows a site admin the type only, no scope line and no query, even with assignment rows', async () => {
    const { payload, find } = stubPayload(CATALOGUE)
    const u = user(['siteAdmin'], [{ sg: 10, role: 'subjectAdmin' }])
    expect(await resolveAccessSummary(payload, u)).toEqual({
      typeLabel: 'Site administrator',
      lines: [],
    })
    expect(find).not.toHaveBeenCalled()
  })

  it('shows a plain teacher just the type, no query', async () => {
    const { payload, find } = stubPayload(CATALOGUE)
    expect(await resolveAccessSummary(payload, user([], []))).toEqual({ typeLabel: 'Teacher', lines: [] })
    expect(find).not.toHaveBeenCalled()
  })

  it('shows an editor-only user as Teacher + an editing-access line', async () => {
    const { payload } = stubPayload(CATALOGUE)
    expect(await resolveAccessSummary(payload, user([], [{ sg: 10, role: 'editor' }]))).toEqual({
      typeLabel: 'Teacher',
      lines: ['Editing access: Biology · Grade 10'],
    })
  })

  it('shows a mixed subject-admin/editor user both lines, admin first', async () => {
    const { payload } = stubPayload(CATALOGUE)
    const u = user([], [{ sg: 10, role: 'subjectAdmin' }, { sg: 11, role: 'editor' }])
    expect(await resolveAccessSummary(payload, u)).toEqual({
      typeLabel: 'Subject-grade administrator',
      lines: ['Administrator: Biology · Grade 10', 'Editing access: Chemistry · Grade 11'],
    })
  })
})
