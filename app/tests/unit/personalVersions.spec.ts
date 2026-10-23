/**
 * `listPersonalVersions`'s fail-closed branch. Against a real database every plan behind a readable
 * version is readable too (`lessonPlanRead` is any signed-in user), so an unresolved plan cannot be
 * staged there; the integration spec covers everything else. Here the plan read comes back without
 * the plan, and the row must be listed as `unknown` — never treated as "not Official".
 */
import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import { listPersonalVersions } from '../../src/lib/personalVersions'
import type { User } from '../../src/payload-types'

const user = {
  id: 7,
  roles: [],
  assignments: [{ subjectGrade: 3, role: 'editor' }],
} as unknown as User

const version = {
  id: 40,
  title: 'Fractions',
  semver: '1.0.2',
  subjectGrade: 3,
  lessonPlan: 9,
  author: 7,
  meta: { substrand_name: 'Fractions' },
  createdAt: '2026-10-22T10:00:00.000Z',
}

function reqWith(plans: unknown[]) {
  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: collection === 'lesson-bundle-versions' ? [version] : plans,
  }))
  return { req: { payload: { find } } as unknown as PayloadRequest, find }
}

describe('listPersonalVersions', () => {
  it('reads the caller’s own versions and projects author, so Delete can be decided', async () => {
    const { req, find } = reqWith([{ id: 9, officialVersion: 1 }])
    const [row] = await listPersonalVersions(req, user)
    const versionsQuery = find.mock.calls[0]![0] as unknown as {
      where: unknown
      select: Record<string, unknown>
      overrideAccess: boolean
    }
    expect(versionsQuery.where).toEqual({ author: { equals: 7 } })
    expect(versionsQuery.select.author).toBe(true)
    expect(versionsQuery.overrideAccess).toBe(false)
    expect(row).toMatchObject({ official: 'no', officialVersionId: 1, canDelete: true })
  })

  it('an unreadable plan fails closed: unknown, no Delete, no Official baseline', async () => {
    const { req } = reqWith([])
    const [row] = await listPersonalVersions(req, user)
    expect(row).toMatchObject({
      official: 'unknown',
      officialVersionId: null,
      canDelete: false,
      canEdit: true,
    })
  })

  it('a version that IS its plan’s Official is marked, not deletable, with no Compare baseline', async () => {
    const { req } = reqWith([{ id: 9, officialVersion: 40 }])
    const [row] = await listPersonalVersions(req, user)
    expect(row).toMatchObject({ official: 'yes', officialVersionId: null, canDelete: false })
  })

  // ⚑ Distinct from `unknown` (Codex, /simplify review): the plan WAS read and simply has no Official
  // pointer, so the version is known non-Official — deletable — but there is nothing to compare with.
  it('a readable plan with no Official: deletable, no Compare baseline', async () => {
    const { req } = reqWith([{ id: 9, officialVersion: null }])
    const [row] = await listPersonalVersions(req, user)
    expect(row).toMatchObject({ official: 'no', officialVersionId: null, canDelete: true })
  })
})
