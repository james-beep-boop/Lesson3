/**
 * Null resource slots, over the WIRE. An ARES bundle whose relevance matcher found nothing for a
 * slot carries `video: null` / `reading: null` (e.g. Biology_Animal_Gaseous_Exchange…: 30 of 120).
 * Uploading it used to 500 — Payload throws on a null group — so a Site administrator could not
 * import more than half the Grade 10/11 corpus. This drives the real routes end to end:
 *
 *   upload (Site admin) → read back as a Teacher → edit as a Teacher with editing access via
 *   `save-as-new` → export DOCX, asserting at every step that the null is preserved and the
 *   populated slots are byte-for-byte what was uploaded; plus the negative cases — an
 *   uploaded `{}` (or a half-populated record) must still be refused, because the empty group is an
 *   INTERNAL storage form, never an accepted input.
 *
 * No endpoint is new or changed, so no new authorization behaviour is under test; the 401/403
 * gates for upload, save-as-new and export are asserted in their own specs.
 *
 * HOW IT RUNS: same as `endpoints.http.spec.ts` (running app + the DB it serves; `E2E_BASE_URL`).
 */
import JSZip from 'jszip'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  MARK,
  minimalResourceLinks,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { PHASE_VALUES } from '../../src/fields/phases.js'
import { toAresResourceLinks, type StoredResourceLinkRow } from '../../src/ingest/resourceLinks.js'

const BASE = (process.env.E2E_BASE_URL ?? 'http://app:3000').replace(/\/$/, '')
const url = (path: string) => `${BASE}${path}`
const ROLES: RoleKey[] = ['siteAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}
const auth = (key: RoleKey) => ({ Authorization: `JWT ${token[key]}` })

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(url('/api/users/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status}) for ${email}`)
  return ((await res.json()) as { token: string }).token
}

type Slots = Record<string, Record<string, unknown>>
/** Predict has both slots null, dqb only its reading; every other slot is a populated record. */
const nullSlots = (): Slots => {
  const links = minimalResourceLinks() as Slots
  links.predict!.video = null
  links.predict!.reading = null
  links.dqb!.reading = null
  return links
}

function rawBundle(substrandId: string, resourceLinks: unknown): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    META: {
      subject: `${MARK}Biology`,
      grade: 99, // the role fixture's SubjectGrade
      substrand_id: substrandId,
      substrand_name: `${MARK}${substrandId} name`,
      titleDoc: `${MARK}Null resources ${substrandId}`,
    },
    UNIT: null,
    LESSONS: [
      {
        number: 1,
        title: `${MARK}Lesson`,
        duration: '40 minutes',
        slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
        // All five phases: the generator prints each bucket's resources under ITS phase, so a bundle
        // with fewer phases never renders (and so never exercises) the remaining resource buckets.
        framework: PHASE_VALUES.map((phase) => ({
          phase,
          learnerExperience: 'x',
          teacherMoves: 'y',
          sensemakingStrategy: 'z',
          formativeAssessment: 'w',
        })),
        summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
        resourceLinks,
      },
    ],
    FINAL_EXPLANATION: null,
    SUMMARY_TABLE: null,
  }
}

const upload = (name: string, raw: unknown) => {
  const form = new FormData()
  form.append('files', new File([JSON.stringify(raw)], name, { type: 'application/json' }))
  return fetch(url('/api/lesson-plans/upload'), {
    method: 'POST',
    headers: auth('siteAdmin'),
    body: form,
  })
}

type Version = Record<string, unknown> & {
  id: number
  updatedAt: string
  lessons: { overview?: string; resourceLinks: StoredResourceLinkRow[] }[]
}
const getVersion = async (id: number, key: RoleKey): Promise<Version> => {
  const res = await fetch(url(`/api/lesson-bundle-versions/${id}?depth=0`), {
    headers: auth(key),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as Version
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((key) => login(fx.users[key].email, fx.password)))
  ROLES.forEach((key, i) => (token[key] = tokens[i]!))
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('uploading a bundle with null resource slots', () => {
  let versionId: number

  it('is accepted (was a 500: "Cannot read properties of null (reading \'title\')")', async () => {
    const res = await upload('nulls.json', rawBundle('99.71', nullSlots()))
    const body = (await res.json()) as {
      ok?: boolean
      error?: string
      bundles?: { action: string; semver: string; official: boolean; id: number }[]
    }
    expect(res.status, JSON.stringify(body)).toBe(200)
    expect(body.bundles![0]).toMatchObject({ action: 'created', semver: '1.0.0', official: true })

    const plan = await fetch(url(`/api/lesson-plans/${body.bundles![0]!.id}?depth=0`), {
      headers: auth('teacher'),
    })
    versionId = ((await plan.json()) as { officialVersion: number }).officialVersion
    expect(versionId).toBeTypeOf('number')
  })

  it('reads back as an empty group over the wire, and exports as the original null', async () => {
    const version = await getVersion(versionId, 'teacher')
    const rows = version.lessons[0]!.resourceLinks
    const predict = rows.find((r) => r.phase === 'predict')!
    expect(predict.video).not.toBeNull()
    expect(predict.video).toEqual(expect.objectContaining({ title: null, tier: null }))
    // The ARES projection: nulls restored, every populated slot identical to what was uploaded.
    expect(toAresResourceLinks(rows)).toEqual(nullSlots())
  })

  it('a Teacher with editing access can save an edit, and the nulls survive it', async () => {
    const version = await getVersion(versionId, 'editor')
    const lessons = version.lessons.map((l, i) =>
      i === 0 ? { ...l, overview: `${MARK}edited prose` } : l,
    )
    const form = new FormData()
    form.set('data', JSON.stringify({ ...version, lessons }))
    const res = await fetch(url(`/api/lesson-bundle-versions/${versionId}/save-as-new`), {
      method: 'POST',
      headers: auth('editor'),
      body: form,
    })
    const saved = (await res.json()) as { doc?: { id: number }; id?: number; message?: string }
    expect(res.status, JSON.stringify(saved)).toBeLessThan(300)

    const newId = (saved.doc?.id ?? saved.id) as number
    expect(newId).toBeTypeOf('number')
    const next = await getVersion(newId, 'editor')
    expect(next.lessons[0]!.overview).toBe(`${MARK}edited prose`)
    expect(toAresResourceLinks(next.lessons[0]!.resourceLinks)).toEqual(nullSlots())
  })

  it('the DOCX export renders a null slot as its search fallback, and populated slots as before', async () => {
    const prep = await fetch(url(`/api/lesson-bundle-versions/${versionId}/export?as=docx`), {
      method: 'POST',
      headers: auth('teacher'),
    })
    expect([200, 202]).toContain(prep.status)
    if (prep.status === 202) {
      const { statusUrl } = (await prep.json()) as { statusUrl: string }
      const deadline = Date.now() + 150_000
      for (;;) {
        const s = (await (await fetch(url(statusUrl), { headers: auth('teacher') })).json()) as {
          state?: string
          message?: string
        }
        if (s.state === 'ready') break
        if (s.state === 'error') throw new Error(`export errored: ${s.message}`)
        if (Date.now() > deadline) throw new Error('export not ready in time')
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
    const dl = await fetch(url(`/api/lesson-bundle-versions/${versionId}/export?as=docx`), {
      headers: auth('teacher'),
    })
    expect(dl.status).toBe(200)

    // The download is a zip of .docx files; a .docx is itself a zip. A bare signature check would pass
    // on a document that silently dropped the fallback, so read the rendered text and link targets.
    const outer = await JSZip.loadAsync(Buffer.from(await dl.arrayBuffer()))
    const docxNames = Object.keys(outer.files).filter((n) => n.toLowerCase().endsWith('.docx'))
    expect(docxNames.length).toBeGreaterThan(0)
    let text = ''
    let rels = ''
    for (const name of docxNames) {
      const inner = await JSZip.loadAsync(await outer.files[name]!.async('nodebuffer'))
      text += await inner.file('word/document.xml')!.async('string')
      rels += (await inner.file('word/_rels/document.xml.rels')?.async('string')) ?? ''
    }
    const count = (needle: string) => text.split(needle).length - 1

    // nullSlots(): predict video + predict reading + dqb reading are null; the other seven are populated.
    expect(count('Search ARES for videos')).toBe(1)
    expect(count('Search ARES for readings')).toBe(2)
    expect(count('Search ARES for similar videos')).toBe(4)
    expect(count('Search ARES for similar readings')).toBe(3)
    // The fallback is a real link to the bucket's `fallback_search_url`.
    expect(rels).toContain('https://ares.example/search/predict')
    expect(rels).toContain('https://ares.example/search/dqb')
  }, 200_000)
})

describe('the empty group is an internal storage form, never an accepted input', () => {
  const withSlot = (slot: unknown) => {
    const links = minimalResourceLinks() as Slots
    links.observe!.video = slot as never
    return links
  }

  it.each([
    ['an empty object', {}],
    ['has_transcript alone', { has_transcript: true }],
    ['an unexpected key', { foo: 1 }],
    ['a half-populated record', { title: 'only a title' }],
  ])('refuses an uploaded resource that is %s (422, nothing written)', async (_label, slot) => {
    const res = await upload('bad.json', rawBundle('99.72', withSlot(slot)))
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/contract drift|not generatable/)
  })
})
