import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportingFileReport } from '../../src/ingest/importSupportingFiles'
import type { SupportingFile } from '../../src/payload-types'
import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'

const base = process.env.E2E_BASE_URL ?? 'http://app:3000'
const collection = '/api/supporting-files'
const roles: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']
const tokens: Partial<Record<RoleKey, string>> = {}
const pdf = new Uint8Array(
  await readFile(new URL('../fixtures/pdf-library/public-wire.pdf', import.meta.url)),
)
const missingId = 2_147_483_647
const prefix = `${MARK}BIO_10_SS99.1`
const quickCheck = `${prefix}_L1_QuickCheck.pdf`
const answerKey = `${prefix}_L1_AnswerKey.pdf`
const unmatched = `${prefix}_missing_L1_QuickCheck.pdf`
let fx: RoleFixture
let otherPlanId: number

function wire(path: string, role?: RoleKey, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (role) headers.set('Authorization', `JWT ${tokens[role]}`)
  return fetch(base + path, { ...init, headers })
}

function upload(role?: RoleKey, data: Partial<SupportingFile> = {}) {
  const body = new FormData()
  body.append(
    '_payload',
    JSON.stringify({
      lessonPlan: fx.plan.id,
      kind: 'quick-check',
      title: `${MARK}Quick check worksheet`,
      ...data,
    }),
  )
  body.append('file', new File([pdf], 'worksheet.pdf', { type: 'application/pdf' }))
  return wire(collection, role, { method: 'POST', body })
}

const remove = (id: number, role?: RoleKey) =>
  wire(`${collection}/${id}`, role, { method: 'DELETE' })

async function expectUpload(response: Response): Promise<SupportingFile> {
  const body = await response.json()
  expect(response.status, JSON.stringify(body)).toBe(201)
  return body.doc
}

function bulkImport(files: File[], role?: RoleKey, confirm?: string) {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  if (confirm) body.append('confirm', confirm)
  return wire(`${collection}/import`, role, { method: 'POST', body })
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const content = minimalBundleContent()
  const version = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      ...content,
      meta: { ...content.meta, filePrefix: prefix },
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.1',
      title: `${MARK}Plan with summary`,
      lessons: [
        {
          ...content.lessons[0],
          number: 1,
          framework: content.lessons[0].framework.map((phase) => ({
            ...phase,
            phase: 'Predict Phase' as const,
          })),
        },
      ],
      summaryTable: { lessons: [{ number: 1, title: 'Lesson One', observed: 'What we saw' }] },
    },
  })
  await fx.payload.update({
    collection: 'lesson-plans',
    id: fx.plan.id,
    data: { officialVersion: version.id },
  })
  const otherGrade = await fx.payload.create({
    collection: 'subject-grades',
    data: { subject: fx.subject.id, grade: 11 },
  })
  const otherPlan = await fx.payload.create({
    collection: 'lesson-plans',
    data: { subjectGrade: otherGrade.id, title: `${MARK}Outside assigned grade` },
  })
  otherPlanId = otherPlan.id
  for (const role of roles) {
    const response = await wire('/api/users/login', undefined, {
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

describe('supporting files', () => {
  it('requires authentication and limits uploads to the administrators of the sub-strand', async () => {
    expect((await upload()).status).toBe(401)
    for (const role of ['teacher', 'editor'] as const) {
      expect((await upload(role)).status).toBe(403)
    }
    expect((await upload('subjectAdmin', { lessonPlan: otherPlanId })).status).toBe(403)
    expect((await upload('subjectAdmin', { lessonPlan: missingId })).status).toBe(404)
    expect((await upload('subjectAdmin', { lessonNumber: 2 })).status).toBe(400)
  })

  it('lists bundle and lesson files after generated documents and lets every signed-in role download', async () => {
    const key = await expectUpload(
      await upload('siteAdmin', {
        kind: 'answer-key',
        title: `${MARK}Answer sheet`,
        lessonNumber: 1,
      }),
    )
    const quiz = await expectUpload(await upload('subjectAdmin'))
    const download = `${collection}/file/${quiz.filename}`
    expect((await wire(download)).status).toBe(401)
    expect((await wire(`${collection}/file/missing.pdf`, 'teacher')).status).toBe(404)
    for (const role of roles) {
      const response = await wire(download, role)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/pdf')
      expect(response.headers.get('content-disposition')).toContain('attachment')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf)
    }

    const response = await wire('/', undefined, {
      headers: { Cookie: `payload-token=${tokens.teacher}` },
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    const linkIndex = html.indexOf(`href="${download}"`)
    expect(linkIndex).toBeGreaterThanOrEqual(0)
    const start = html.lastIndexOf('<details', linkIndex)
    const disclosure = html.slice(start, html.indexOf('</details>', linkIndex))
    expect(disclosure).toContain('<summary>Supporting documents (5)</summary>')
    expect(disclosure).toContain(`href="${collection}/file/${key.filename}"`)
    for (const label of ['Summary table', 'Compact Teacher Guide', 'Student Summary Table']) {
      expect(disclosure.indexOf(label)).toBeGreaterThanOrEqual(0)
      expect(disclosure.indexOf(label)).toBeLessThan(disclosure.indexOf('Quick Check'))
    }
    expect(disclosure.indexOf('Quick Check')).toBeLessThan(disclosure.indexOf('Answer Key'))
    expect(disclosure).toContain('Lesson 1 ·')

    const update = await wire(`${collection}/${quiz.id}`, 'siteAdmin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Changed' }),
    })
    expect(update.status).toBe(403)
    expect((await remove(quiz.id)).status).toBe(401)
    for (const role of ['teacher', 'editor'] as const) {
      expect((await remove(quiz.id, role)).status).toBe(403)
    }
    expect((await remove(quiz.id, 'subjectAdmin')).status).toBe(200)
    expect((await remove(quiz.id, 'siteAdmin')).status).toBe(404)
    expect((await wire(download, 'teacher')).status).toBe(404)
    expect((await remove(key.id, 'siteAdmin')).status).toBe(200)
  })

  it('lets site administrators manage files across grades', async () => {
    const file = await expectUpload(await upload('siteAdmin', { lessonPlan: otherPlanId }))
    expect((await remove(file.id, 'subjectAdmin')).status).toBe(403)
    expect((await remove(file.id, 'siteAdmin')).status).toBe(200)
  })

  it('requires a site administrator to check or confirm a bulk import', async () => {
    for (const confirm of [undefined, '0'.repeat(64)]) {
      expect((await bulkImport([], undefined, confirm)).status).toBe(401)
      for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
        expect((await bulkImport([], role, confirm)).status).toBe(403)
      }
    }
  })

  it('checks the files before saving, attaches each match, and recognises the same bytes on repeat', async () => {
    const files = [quickCheck, answerKey, unmatched].map(
      (name) => new File([pdf], name, { type: 'application/pdf' }),
    )
    const saved = async () =>
      (
        await fx.payload.find({
          collection: 'supporting-files',
          where: { lessonPlan: { equals: fx.plan.id } },
          depth: 0,
        })
      ).docs

    const previewResponse = await bulkImport(files, 'siteAdmin')
    expect(previewResponse.status).toBe(200)
    const preview: SupportingFileReport = await previewResponse.json()
    expect(preview.imported).toBe(0)
    expect(preview.rows).toMatchObject([
      {
        file: quickCheck,
        status: 'matched',
        attachment: { lessonPlan: fx.plan.id, lessonNumber: 1, kind: 'quick-check' },
      },
      {
        file: answerKey,
        status: 'matched',
        attachment: { lessonPlan: fx.plan.id, lessonNumber: 1, kind: 'answer-key' },
      },
      { file: unmatched, status: 'unmatched' },
    ])
    expect(await saved()).toHaveLength(0)

    const changed = [
      new File([pdf, '\n'], quickCheck, { type: 'application/pdf' }),
      ...files.slice(1),
    ]
    expect((await bulkImport(changed, 'siteAdmin', preview.previewToken)).status).toBe(409)
    expect(await saved()).toHaveLength(0)

    const confirmed = await bulkImport(files, 'siteAdmin', preview.previewToken)
    expect(confirmed.status).toBe(200)
    expect(await confirmed.json()).toMatchObject({ imported: 2 })
    const docs = await saved()
    expect(docs).toHaveLength(2)
    expect(docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: quickCheck, lessonNumber: 1, kind: 'quick-check' }),
        expect.objectContaining({ title: answerKey, lessonNumber: 1, kind: 'answer-key' }),
      ]),
    )
    expect((await wire(`${collection}/file/${unmatched}`, 'teacher')).status).toBe(404)

    const zip = new JSZip()
    for (const file of files) zip.file(`nested/${file.name}`, await file.arrayBuffer())
    const archive = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'worksheets.zip')
    const repeat = await bulkImport([archive], 'siteAdmin')
    expect(repeat.status).toBe(200)
    expect(await repeat.json()).toMatchObject({
      imported: 0,
      rows: [
        { file: `worksheets.zip/nested/${quickCheck}`, status: 'alreadyHere' },
        { file: `worksheets.zip/nested/${answerKey}`, status: 'alreadyHere' },
        { file: `worksheets.zip/nested/${unmatched}`, status: 'unmatched' },
      ],
    })
    expect(await saved()).toHaveLength(2)
    for (const doc of docs) expect((await remove(doc.id, 'siteAdmin')).status).toBe(200)
  })
})
