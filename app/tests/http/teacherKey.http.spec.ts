/**
 * Student document vs teacher key, over the WIRE, against the real running (production-mode) app.
 *
 * Until the 2026-10 generator re-pin, a single "Final Explanation" document was titled *Student Assessment
 * Document* yet printed the exemplar answers beside each prompt. It is now two documents from the same data:
 * the student version (blank answer space, no exemplars) and a teacher key. This pins, end to end:
 *   - a version with a final explanation exports FOUR documents, DOCX and PDF, with exact names;
 *   - the exemplar answer reaches ONLY the teacher key — never the student document;
 *   - the key follows the plan's existing read access (401 / 400 / 404 on the new tag);
 *   - attribution is rendered in all four deliverables out of the production image (`js-yaml` and the
 *     attribution config both have to be present there — a missing one fails the first export, here).
 *
 * HOW IT RUNS: same as `endpoints.http.spec.ts` (running app + the DB it serves; `E2E_BASE_URL`).
 */
import { randomUUID } from 'node:crypto'

import JSZip from 'jszip'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'

const ROLES: RoleKey[] = ['siteAdmin', 'editor', 'teacher']
const EXEMPLAR = `EXEMPLAR-${randomUUID()}`
const PREFIX = 'KeyProbe'

let fx: RoleFixture
let withFe: { id: number; lessons?: unknown[] }
const token: Record<string, string> = {}
const auth = (key: RoleKey) => ({ Authorization: `JWT ${token[key]}` })

async function prepare(id: number, key: RoleKey, as: 'docx' | 'pdf') {
  const prep = await fetch(url(`/api/lesson-bundle-versions/${id}/export?as=${as}`), {
    method: 'POST',
    headers: auth(key),
  })
  expect([200, 202]).toContain(prep.status)
  if (prep.status === 200) return
  const { statusUrl } = (await prep.json()) as { statusUrl: string }
  const deadline = Date.now() + 170_000
  for (;;) {
    const s = (await (await fetch(url(statusUrl), { headers: auth(key) })).json()) as {
      state?: string
      message?: string
    }
    if (s.state === 'ready') return
    if (s.state === 'error') throw new Error(`export errored: ${s.message}`)
    if (Date.now() > deadline) throw new Error('export not ready in time')
    await new Promise((r) => setTimeout(r, 1500))
  }
}

const exportZip = async (id: number, as: 'docx' | 'pdf') => {
  await prepare(id, 'teacher', as)
  const res = await fetch(url(`/api/lesson-bundle-versions/${id}/export?as=${as}`), {
    headers: auth('teacher'),
  })
  expect(res.status).toBe(200)
  return JSZip.loadAsync(Buffer.from(await res.arrayBuffer()))
}

const docXml = async (docx: Buffer) =>
  (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string')
const xmlOf = async (zip: JSZip, name: string) => docXml(await zip.files[name]!.async('nodebuffer'))

// Three tests read the SAME cold DOCX export; prepare, download and unzip it once.
let docxZip: Promise<JSZip> | undefined
const docxZipOf = () => (docxZip ??= exportZip(withFe.id, 'docx'))

const docUrl = (id: number, doc: string, as: 'docx' | 'pdf') =>
  `/api/lesson-bundle-versions/${id}/export/doc?doc=${doc}&as=${as}`

beforeAll(async () => {
  fx = await setupRoleFixture()
  const base = minimalBundleContent()
  withFe = (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '7.1.0',
      title: `${MARK}teacher-key`,
      ...base,
      meta: { ...base.meta, filePrefix: PREFIX },
      finalExplanation: {
        subjectLabel: 'Biology',
        instructions: 'Explain your thinking.',
        sections: [{ title: 'Evidence', prompt: 'What happened?', exemplar: EXEMPLAR }],
        rubric: [{ criterion: 'Clarity', excellent: '4', proficient: '3', developing: '2' }],
      },
      summaryTable: {
        subStrand: 'Probe',
        drivingQuestion: 'Why?',
        lessons: [{ number: 1, title: 'One', observed: 'o', learned: 'l', explained: 'e' }],
      },
    } as never,
    overrideAccess: true,
  })) as { id: number; lessons?: unknown[] }
  const tokens = await Promise.all(ROLES.map((key) => login(fx.users[key].email, fx.password)))
  ROLES.forEach((key, i) => (token[key] = tokens[i]!))
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('a version with a final explanation exports four documents', () => {
  it('DOCX zip: exactly the four expected names', async () => {
    const zip = await docxZipOf()
    expect(Object.keys(zip.files).sort()).toEqual(
      [
        `${PREFIX}_CBE_LessonSequence.docx`,
        `${PREFIX}_FinalExplanation.docx`,
        `${PREFIX}_FinalExplanation_TeacherKey.docx`,
        `${PREFIX}_SummaryTable.docx`,
      ].sort(),
    )
  }, 200_000)

  it('PDF zip: the same four names, every file a real PDF', async () => {
    const zip = await exportZip(withFe.id, 'pdf')
    expect(Object.keys(zip.files).sort()).toEqual(
      [
        `${PREFIX}_CBE_LessonSequence.pdf`,
        `${PREFIX}_FinalExplanation.pdf`,
        `${PREFIX}_FinalExplanation_TeacherKey.pdf`,
        `${PREFIX}_SummaryTable.pdf`,
      ].sort(),
    )
    for (const name of Object.keys(zip.files)) {
      const head = (await zip.files[name]!.async('nodebuffer')).subarray(0, 4).toString('latin1')
      expect(head, name).toBe('%PDF')
    }
  }, 200_000)

  it('the exemplar answer is in the teacher key and NEVER in the student document', async () => {
    const zip = await docxZipOf()
    const student = await xmlOf(zip, `${PREFIX}_FinalExplanation.docx`)
    const key = await xmlOf(zip, `${PREFIX}_FinalExplanation_TeacherKey.docx`)
    expect(student).not.toContain(EXEMPLAR)
    expect(student).toContain('Write your answer here')
    expect(key).toContain(EXEMPLAR)
    expect(key).toContain('do not give to students')
  }, 200_000)

  it('attribution is rendered in all four deliverables, from the production image', async () => {
    const zip = await docxZipOf()
    expect(Object.keys(zip.files)).toHaveLength(4)
    for (const name of Object.keys(zip.files)) {
      const xml = await xmlOf(zip, name)
      expect(xml, `${name} carries the licence block`).toContain('This work is licensed under a')
      expect(xml, `${name} carries the fixed year`).toContain('© 2026 SeaVuria and ARES')
    }
  }, 200_000)
})

describe('per-document download of the teacher key follows the plan’s read access', () => {
  it('401 without auth', async () => {
    const res = await fetch(url(docUrl(withFe.id, 'teacherKey', 'docx')))
    expect(res.status).toBe(401)
  })

  it('a Teacher (read access) gets the key as a DOCX attachment with the key filename', async () => {
    await prepare(withFe.id, 'teacher', 'docx')
    const res = await fetch(url(docUrl(withFe.id, 'teacherKey', 'docx')), {
      headers: auth('teacher'),
    })
    expect(res.status).toBe(200)
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toBe(`attachment; filename="${PREFIX}_FinalExplanation_TeacherKey.docx"`)
    expect(await docXml(Buffer.from(await res.arrayBuffer()))).toContain(EXEMPLAR)
  }, 200_000)

  it('the student document served by the same endpoint has no exemplar', async () => {
    await prepare(withFe.id, 'teacher', 'docx')
    const res = await fetch(url(docUrl(withFe.id, 'finalExplanation', 'docx')), {
      headers: auth('teacher'),
    })
    expect(res.status).toBe(200)
    expect(await docXml(Buffer.from(await res.arrayBuffer()))).not.toContain(EXEMPLAR)
  }, 200_000)

  it('404 for the key on a version that has no final explanation', async () => {
    await prepare(fx.version.id, 'teacher', 'docx')
    const res = await fetch(url(docUrl(fx.version.id, 'teacherKey', 'docx')), {
      headers: auth('teacher'),
    })
    expect(res.status).toBe(404)
  }, 200_000)

  it('400 on a near-miss tag (the tag list is exact)', async () => {
    const res = await fetch(url(docUrl(withFe.id, 'teacherkey', 'docx')), {
      headers: auth('teacher'),
    })
    expect(res.status).toBe(400)
  })
})

describe('preview-as-PDF accepts the new tag with the unchanged edit gate', () => {
  const previewUrl = (id: number, doc: string) =>
    `/api/lesson-bundle-versions/${id}/preview-pdf?doc=${doc}`
  // The plan's REAL lessons: an empty overlay is a structural change and is refused (422) before the
  // missing-document check is reached.
  const overlay = (lessons: unknown[] = withFe.lessons ?? []) => {
    const form = new FormData()
    form.set('data', JSON.stringify({ lessons }))
    return form
  }

  it('a plain Teacher is refused (404, edit-gated like every preview)', async () => {
    const res = await fetch(url(previewUrl(withFe.id, 'teacherKey')), {
      method: 'POST',
      headers: auth('teacher'),
      body: overlay(),
    })
    expect(res.status).toBe(404)
  })

  it('a Teacher with editing access gets the key as an inline PDF', async () => {
    const res = await fetch(url(previewUrl(withFe.id, 'teacherKey')), {
      method: 'POST',
      headers: auth('editor'),
      body: overlay(),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect((res.headers.get('content-disposition') ?? '').startsWith('inline; filename="')).toBe(
      true,
    )
    expect(
      Buffer.from(await res.arrayBuffer())
        .subarray(0, 4)
        .toString('latin1'),
    ).toBe('%PDF')
  }, 200_000)

  it('404 for the key on a version without a final explanation', async () => {
    const res = await fetch(url(previewUrl(fx.version.id, 'teacherKey')), {
      method: 'POST',
      headers: auth('editor'),
      body: overlay((fx.version as unknown as { lessons?: unknown[] }).lessons ?? []),
    })
    expect(res.status).toBe(404)
  })
})
