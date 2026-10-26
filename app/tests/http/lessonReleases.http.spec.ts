/** Upload permission gates and token binding over HTTP, on a migrated disposable database. */
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  setupRoleFixture,
  MARK,
  minimalResourceLinks,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'
import { relId } from '../../src/lib/relId'
import { sha256 } from '../../src/ingest/lessonManifest'

let fx: RoleFixture
const tokens: Partial<Record<RoleKey, string>> = {}
const base = process.env.E2E_BASE_URL ?? 'http://app:3000'
const raw = (
  id: string,
  text: string,
  subject = fx.subject.name,
  grade = fx.subjectGrade.grade,
) => ({
  schemaVersion: '1.0.0',
  META: {
    subject,
    grade,
    substrand_id: id,
    substrand_name: `${MARK}${id}`,
    titleDoc: `${MARK}${text}`,
  },
  UNIT: null,
  LESSONS: [
    {
      number: 1,
      title: 'Lesson',
      duration: '40 minutes',
      slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'x',
          teacherMoves: 'y',
          sensemakingStrategy: 'z',
          formativeAssessment: 'w',
        },
      ],
      summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
      resourceLinks: minimalResourceLinks(),
    },
  ],
  FINAL_EXPLANATION: null,
  SUMMARY_TABLE: null,
})
async function archive(id: string, text: string, release: string) {
  const content = JSON.stringify(raw(id, text))
  const zip = new JSZip().file('a.json', content).file(
    'LESSONS.json',
    JSON.stringify({
      format: 1,
      release: { id: release, date: '2026-11-14' },
      schemaVersion: '1.0.0',
      minProgram: '1.08',
      files: { 'a.json': { sha256: sha256(content), kind: 'lesson-plan' } },
    }),
  )
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'lessons.zip')
}
const post = (files: File[], role?: RoleKey, token?: string, approvals?: unknown[]) => {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  if (token !== undefined) form.append('confirmOfficial', token)
  if (approvals) form.append('createTaxonomy', JSON.stringify(approvals))
  return fetch(`${base}/api/lesson-plans/upload`, {
    method: 'POST',
    headers: role ? { Authorization: `JWT ${tokens[role]}` } : {},
    body: form,
  })
}
beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const role of ['siteAdmin', 'subjectAdmin', 'editor', 'teacher'] as RoleKey[]) {
    const response = await fetch(`${base}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fx.users[role].email, password: fx.password }),
    })
    expect(response.status).toBe(200)
    tokens[role] = (await response.json()).token
  }
}, 60_000)
afterAll(async () => {
  await fx?.teardown()
})
describe('ARES release upload', () => {
  it('authorizes before any import write, even with a forged confirmation', async () => {
    const files = [await archive('99.releaseAuth', 'Forbidden', 'Nov')]
    const before = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    expect((await post(files, undefined, 'forged')).status).toBe(401)
    for (const role of ['teacher', 'editor', 'subjectAdmin'] as RoleKey[])
      expect((await post(files, role, 'forged')).status).toBe(403)
    expect(await fx.payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
  })
  it('previews, rejects missing/forged/stale tokens, confirms and messages once', async () => {
    const first = await post([await archive('99.releaseWire', 'A', 'Nov')], 'siteAdmin')
    expect(first.status).toBe(200)
    const id = (await first.json()).bundles[0].id
    const files = [await archive('99.releaseWire', 'B', 'Dec')]
    const before = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    const preview = await post(files, 'siteAdmin')
    expect(preview.status).toBe(409)
    const p = await preview.json()
    expect(p.official[0].willMove).toBe(true)
    expect(p.previewToken).toMatch(/^[a-f0-9]{64}$/)
    expect((await post(files, 'siteAdmin', 'forged')).status).toBe(409)
    expect(await fx.payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
    // Change the current Official under the reviewer's feet.
    await fx.payload.update({ collection: 'lesson-plans', id, data: { officialVersion: null } })
    const stale = await post(files, 'siteAdmin', p.previewToken)
    expect(stale.status).toBe(409)
    const refreshed = await stale.json()
    expect(refreshed.confirmationChanged).toBe(true)
    expect(refreshed.official[0].willMove).toBe(false)
    expect(await fx.payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
    const beforeMessages = await fx.payload.count({ collection: 'messages' })
    const confirmed = await post(files, 'siteAdmin', refreshed.previewToken)
    expect(confirmed.status).toBe(200)
    expect((await confirmed.json()).bundles[0].official).toBe(false)
    expect((await fx.payload.count({ collection: 'messages' })).totalDocs).toBe(
      beforeMessages.totalDocs + 1,
    )
    const message = (
      await fx.payload.find({ collection: 'messages', sort: '-id', limit: 1, depth: 0 })
    ).docs[0]
    expect(relId(message.sender)).toBe(fx.users.siteAdmin.id)
    expect(relId(message.recipient)).toBe(fx.users.subjectAdmin.id)
    expect(message.body).toContain(`/lessons/${id}`)
    // A later ARES Official can be replaced using the exact preview token.
    const versions = (
      await fx.payload.find({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { equals: id } },
        sort: '-id',
        depth: 0,
      })
    ).docs
    await fx.payload.update({
      collection: 'lesson-plans',
      id,
      data: { officialVersion: versions[0].id },
    })
    const thirdFiles = [await archive('99.releaseWire', 'C', 'Jan')]
    const thirdPreview = await post(thirdFiles, 'siteAdmin')
    const third = await thirdPreview.json()
    expect(thirdPreview.status).toBe(409)
    const moved = await post(thirdFiles, 'siteAdmin', third.previewToken)
    expect(moved.status).toBe(200)
    expect((await moved.json()).bundles[0]).toMatchObject({
      official: true,
      outcome: 'officialMoved',
    })
    const plan = await fx.payload.findByID({ collection: 'lesson-plans', id, depth: 0 })
    expect(relId(plan.officialChangedFrom)).toBe(versions[0].id)
    expect(plan.officialChangedBy).toBeNull()
    const current = relId(plan.officialVersion)
    const manual = await fetch(
      `${base}/api/lesson-bundle-versions/${versions[0].id}/make-official`,
      {
        method: 'POST',
        headers: { Authorization: `JWT ${tokens.subjectAdmin}` },
      },
    )
    expect(manual.status).toBe(200)
    const changed = await fx.payload.findByID({ collection: 'lesson-plans', id, depth: 0 })
    expect(relId(changed.officialChangedBy)).toBe(fx.users.subjectAdmin.id)
    expect(relId(changed.officialChangedFrom)).toBe(current)
  })
  it('combines taxonomy and Official approval in the same read-only round', async () => {
    await post([await archive('99.releaseCombined', 'A', 'Nov')], 'siteAdmin')
    const newGrade = new File(
      [JSON.stringify(raw('99.newGradeRelease', 'New grade', fx.subject.name, 9))],
      'new.json',
    )
    const files = [await archive('99.releaseCombined', 'B', 'Dec'), newGrade]
    const response = await post(files, 'siteAdmin')
    expect(response.status).toBe(409)
    const p = await response.json()
    expect(p.missing).toHaveLength(1)
    expect(p.official.some((o: { willMove: boolean }) => o.willMove)).toBe(true)
    const confirmed = await post(files, 'siteAdmin', p.previewToken, [
      { subject: fx.subject.name, grade: 9 },
    ])
    expect(confirmed.status).toBe(200)
    expect((await confirmed.json()).count).toBe(2)
  })
  it('retains the 5,000-character limit for authenticated messages', async () => {
    const response = await fetch(`${base}/api/messages`, {
      method: 'POST',
      headers: { Authorization: `JWT ${tokens.teacher}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: fx.users.siteAdmin.id, body: 'x'.repeat(5001) }),
    })
    expect(response.status).toBe(400)
  })
})
