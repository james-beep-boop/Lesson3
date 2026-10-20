/** Exercise the numeric grade range through the same collection API used by Manage. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'

let fx: RoleFixture
let admin: string
let boundarySubjectId: number

beforeAll(async () => {
  fx = await setupRoleFixture()
  admin = await login(fx.users.siteAdmin.email, fx.password)
  const subject = await fx.payload.create({
    collection: 'subjects',
    data: { name: `${MARK}Grade boundaries` },
    overrideAccess: true,
  })
  boundarySubjectId = subject.id
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

const write = (path: string, method: string, data: unknown) =>
  fetch(url(path), {
    method,
    headers: { Authorization: `JWT ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

describe('subject-grade range', () => {
  for (const grade of [-1, 0, 13, 100, 1.5, null]) {
    it(`rejects grade ${grade} on create with a readable validation error`, async () => {
      const response = await write('/api/subject-grades', 'POST', {
        subject: boundarySubjectId,
        grade,
      })
      expect(response.status).toBe(400)
      // Production Payload names the invalid field but omits the validator's detailed message.
      expect(await response.json()).toMatchObject({
        errors: [{ message: expect.stringContaining('Grade') }],
      })
      const rows = await fx.payload.count({
        collection: 'subject-grades',
        where: { subject: { equals: boundarySubjectId } },
        overrideAccess: true,
      })
      expect(rows.totalDocs).toBe(0)
    })

    it(`rejects grade ${grade} on update without changing the stored grade or title`, async () => {
      const response = await write(`/api/subject-grades/${fx.subjectGrade.id}`, 'PATCH', { grade })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        errors: [{ message: expect.stringContaining('Grade') }],
      })
      const row = await fx.payload.findByID({
        collection: 'subject-grades',
        id: fx.subjectGrade.id,
        overrideAccess: true,
      })
      expect(row.grade).toBe(fx.subjectGrade.grade)
      expect(row.displayName).toBe(fx.subjectGrade.displayName)
    })
  }

  it('accepts both boundaries on create and edit, retaining numeric storage and derived titles', async () => {
    for (const grade of [1, 12]) {
      const response = await write('/api/subject-grades', 'POST', {
        subject: boundarySubjectId,
        grade,
      })
      expect(response.status).toBe(201)
      const { doc } = await response.json()
      expect(doc.grade).toBe(grade)
      expect(doc.displayName).toBe(`${MARK}Grade boundaries — Grade ${grade}`)

      const otherBoundary = grade === 1 ? 12 : 1
      const updated = await write(`/api/subject-grades/${doc.id}`, 'PATCH', {
        grade: otherBoundary,
      })
      expect(updated.status).toBe(200)
      const { doc: saved } = await updated.json()
      expect(saved.grade).toBe(otherBoundary)
      expect(saved.displayName).toBe(`${MARK}Grade boundaries — Grade ${otherBoundary}`)
      const stored = await fx.payload.findByID({
        collection: 'subject-grades',
        id: doc.id,
        overrideAccess: true,
      })
      expect(stored.grade).toBe(otherBoundary)
      await fx.payload.delete({ collection: 'subject-grades', id: doc.id, overrideAccess: true })
    }
  })
})
