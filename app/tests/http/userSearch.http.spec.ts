/** Real-network contract for the lazy Manage → Users directory. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createUserVerified,
  MARK,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'
import type { UserSearchResponse } from '../../src/lib/userSearchContract.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Partial<Record<RoleKey, string>> = {}
let extraSubjectGradeId = 0
let hybridId = 0
let nameNeedleId = 0
let emailNeedleId = 0

async function search(
  params: Record<string, string> = {},
  as?: RoleKey,
): Promise<{ status: number; body: UserSearchResponse }> {
  const query = new URLSearchParams(params)
  const res = await fetch(url(`/api/users/search?${query}`), {
    headers: as ? { Authorization: `JWT ${token[as]}` } : {},
  })
  return { status: res.status, body: (await res.json()) as UserSearchResponse }
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((role) => login(fx.users[role].email, fx.password)))
  ROLES.forEach((role, index) => (token[role] = tokens[index]))

  const extra = await fx.payload.create({
    collection: 'subject-grades',
    data: { subject: fx.subject.id, grade: 98 },
    overrideAccess: true,
  })
  extraSubjectGradeId = extra.id
  const hybrid = await createUserVerified(fx.payload, {
    name: `${MARK}Hybrid administrator`,
    email: `${MARK.toLowerCase()}hybrid@example.com`,
    password: fx.password,
    assignments: [
      { subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin' },
      { subjectGrade: extra.id, role: 'editor' },
    ],
  })
  hybridId = hybrid.id
  const nameNeedle = await createUserVerified(fx.payload, {
    name: `${MARK}Visible Name Needle`,
    email: `${MARK.toLowerCase()}plain-address@example.com`,
    password: fx.password,
  })
  nameNeedleId = nameNeedle.id
  const emailNeedle = await createUserVerified(fx.payload, {
    name: `${MARK}Plain Display`,
    email: `${MARK.toLowerCase()}email-needle@example.com`,
    password: fx.password,
  })
  emailNeedleId = emailNeedle.id
}, 120_000)

afterAll(async () => {
  for (const id of [hybridId, nameNeedleId, emailNeedleId]) {
    if (id) {
      await fx?.payload
        .delete({ collection: 'users', id, overrideAccess: true })
        .catch(() => undefined)
    }
  }
  if (extraSubjectGradeId) {
    await fx?.payload
      .delete({ collection: 'subject-grades', id: extraSubjectGradeId, overrideAccess: true })
      .catch(() => undefined)
  }
  await fx?.teardown()
})

describe('GET /api/users/search', () => {
  it('401 unauthenticated', async () => {
    expect((await search({ q: MARK })).status).toBe(401)
  })

  it.each(['subjectAdmin', 'editor', 'teacher'] as RoleKey[])('403 for %s', async (role) => {
    expect((await search({ q: MARK }, role)).status).toBe(403)
  })

  it('searches both display name and email without returning auth secrets', async () => {
    const byName = await search({ q: 'Visible Name Needle' }, 'siteAdmin')
    expect(byName.status).toBe(200)
    expect(byName.body.docs.map((doc) => doc.id)).toEqual([nameNeedleId])

    const byEmail = await search({ q: 'email-needle' }, 'siteAdmin')
    expect(byEmail.status).toBe(200)
    expect(byEmail.body.docs.map((doc) => doc.id)).toEqual([emailNeedleId])
    expect(Object.keys(byEmail.body.docs[0] ?? {}).sort()).toEqual(
      [
        'authoredVersions',
        'email',
        'grants',
        'id',
        'name',
        'officialVersions',
        'signInDisabled',
        'siteAdmin',
        'type',
        'updatedAt',
        'verified',
      ].sort(),
    )
  })

  it('paginates on the server', async () => {
    const first = await search({ q: MARK, limit: '2', page: '1' }, 'siteAdmin')
    expect(first.status).toBe(200)
    expect(first.body.docs).toHaveLength(2)
    expect(first.body.limit).toBe(2)
    expect(first.body.page).toBe(1)
    expect(first.body.totalDocs).toBeGreaterThan(2)
    expect(first.body.hasNextPage).toBe(true)
    expect(first.body.hasPrevPage).toBe(false)
  })

  it('honours the computed type filter server-side, including Teachers with editing access', async () => {
    const [site, subject, teacher] = await Promise.all([
      search({ q: MARK, type: 'siteAdmin', limit: '50' }, 'siteAdmin'),
      search({ q: MARK, type: 'subjectAdmin', limit: '50' }, 'siteAdmin'),
      search({ q: MARK, type: 'teacher', limit: '50' }, 'siteAdmin'),
    ])
    expect(site.status).toBe(200)
    expect(subject.status).toBe(200)
    expect(teacher.status).toBe(200)

    expect(site.body.docs.every((doc) => doc.type === 'Site administrator')).toBe(true)
    expect(subject.body.docs.every((doc) => doc.type === 'Subject-grade administrator')).toBe(true)
    expect(teacher.body.docs.every((doc) => doc.type === 'Teacher')).toBe(true)
    expect(teacher.body.docs.map((doc) => doc.id)).toContain(fx.users.editor.id)
    expect(subject.body.docs.map((doc) => doc.id)).toContain(hybridId)
    expect(teacher.body.docs.map((doc) => doc.id)).not.toContain(hybridId)
  })

  it('returns grant labels for the row disclosure jump target', async () => {
    const result = await search({ q: `${MARK}Hybrid administrator` }, 'siteAdmin')
    expect(result.status).toBe(200)
    expect(result.body.docs[0]?.grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'subjectAdmin',
          subjectGradeId: fx.subjectGrade.id,
          subjectGradeLabel: fx.subjectGrade.displayName,
        }),
      ]),
    )
  })
})
