import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { readDeckSpec } from '../../src/decks/storage'
import spec from '../../src/decks/vendor/fixtures/L1.spec.json'
import type { Deck, DeckVersion, SupportingFile } from '../../src/payload-types'
import {
  createVersionFixture,
  MARK,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'

const base = process.env.E2E_BASE_URL ?? 'http://app:3000'
const missing = 2_147_483_647
const roles: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']
const tokens: Partial<Record<RoleKey, string>> = {}
let fx: RoleFixture
let otherPlan: number
let pilot: File

function wire(path: string, role?: RoleKey, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (role) headers.set('Authorization', `JWT ${tokens[role]}`)
  return fetch(`${base}/api/${path}`, { ...init, headers })
}

function upload(role?: RoleKey, file = pilot, plan = fx.plan.id, replace = false) {
  const body = new FormData()
  body.set('lessonPlan', String(plan))
  body.set('file', file)
  if (replace) body.set('replace', 'yes')
  return wire('decks/upload', role, { method: 'POST', body })
}

function save(id: number, role?: RoleKey, candidate: unknown = {}) {
  const body = new FormData()
  body.set('data', JSON.stringify(candidate))
  return wire(`deck-versions/${id}/save-as-new`, role, { method: 'POST', body })
}

function promote(id: number, role?: RoleKey) {
  return wire(`deck-versions/${id}/make-official`, role, { method: 'POST' })
}

async function body<T>(response: Response, status = 200): Promise<T> {
  const result = await response.json()
  expect(response.status, JSON.stringify(result)).toBe(status)
  return result as T
}

async function version(id: number, role: RoleKey = 'teacher') {
  return body<DeckVersion>(await wire(`deck-versions/${id}?depth=0`, role))
}

type ImportResult = {
  decks: { id: number; lessonNumber: number; status: string; semver?: string }[]
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const otherGrade = await fx.payload.create({
    collection: 'subject-grades',
    data: { subject: fx.subject.id, grade: 11 },
  })
  otherPlan = (
    await fx.payload.create({
      collection: 'lesson-plans',
      data: { subjectGrade: otherGrade.id, title: `${MARK}Outside assigned grade` },
    })
  ).id
  const otherVersion = await createVersionFixture(fx.payload, {
    planId: otherPlan,
    subjectGradeId: otherGrade.id,
    semver: '1.0.0',
  })
  await fx.payload.update({
    collection: 'lesson-plans',
    id: otherPlan,
    data: { officialVersion: otherVersion.id },
  })
  for (const role of roles) {
    const login = await body<{ token: string }>(
      await wire('users/login', undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fx.users[role].email, password: fx.password }),
      }),
    )
    tokens[role] = login.token
  }
  const zip = new JSZip()
  zip.file('specs/Biology/1.1/L1.spec.json', JSON.stringify(spec))
  zip.file('__MACOSX/specs/Biology/1.1/._L1.spec.json', 'Finder metadata')
  zip.file('specs/Biology/1.1/._L1.spec.json', 'Finder metadata')
  zip.file(`__MACOSX/art/final/${spec.hero.art_id}.png`, 'Finder metadata')
  zip.file(
    `art/final/${spec.hero.art_id}.png`,
    await readFile(new URL('../../src/decks/vendor/data/logos/Seavuria_Logo.png', import.meta.url)),
  )
  zip.file('ignored.js', 'throw new Error("This file must never run")')
  pilot = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'pilot.zip')
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

it('lists only the sub-strands the administrator can import decks for', async () => {
  for (const role of ['subjectAdmin', 'siteAdmin'] as const) {
    const response = await fetch(`${base}/decks/import`, {
      headers: { Cookie: `payload-token=${tokens[role]}` },
      redirect: 'manual',
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain(`<option value="${fx.plan.id}"`)
    expect(html.includes(`<option value="${otherPlan}"`)).toBe(role === 'siteAdmin')
  }
})

it('requires an administrator of the selected sub-strand to import decks', async () => {
  expect((await upload()).status).toBe(401)
  for (const role of ['teacher', 'editor'] as const) {
    expect((await upload(role)).status).toBe(403)
  }
  expect((await upload('subjectAdmin', pilot, otherPlan)).status).toBe(403)
  expect((await upload('subjectAdmin', pilot, missing)).status).toBe(404)
  const wrongPhase = { ...spec, slides: [{ ...spec.slides[0], phase: 'made-up' }] }
  expect(
    (await upload('subjectAdmin', new File([JSON.stringify(wrongPhase)], 'L1.spec.json'))).status,
  ).toBe(400)
  expect(
    (await upload('subjectAdmin', new File([JSON.stringify(spec)], 'L99.spec.json'))).status,
  ).toBe(404)
  expect((await upload('siteAdmin', new File(['{}'], 'L1.js'))).status).toBe(400)
})

it('rejects a ZIP containing only a manifest and art', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', '{}')
  zip.file(`art/${spec.hero.art_id}.png`, 'picture omitted for this test')
  const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'art.zip')
  const result = await body<{ errors: { message: string }[] }>(
    await upload('subjectAdmin', file),
    400,
  )
  expect(result.errors[0]?.message).toContain('The ZIP has no specs')
})

it('imports the pilot with art and replaces changed decks', async () => {
  const imported = await body<ImportResult>(await upload('subjectAdmin'))
  const first = imported.decks[0]!
  expect(first).toMatchObject({ lessonNumber: 1, status: 'imported', semver: '1.0.0' })
  const deck = await body<Deck>(await wire(`decks/${first.id}?depth=0`, 'teacher'))
  expect(deck).toMatchObject({
    lessonPlan: fx.plan.id,
    subjectGrade: fx.subjectGrade.id,
    substrandId: '99.1',
  })
  const official = Number(deck.officialVersion)
  const original = await version(official)
  const stored = await fx.payload.findByID({ collection: 'deck-versions', id: official, depth: 0 })
  expect(readDeckSpec(stored.spec)).toEqual(spec)
  expect(original.spec?.build_log).toBeUndefined()
  expect(original.spec?.hero?.prompt).toBeUndefined()
  expect(original.spec?.slides?.[0]?.blocks?.[0]?.art_prompt).toBeUndefined()

  const art = async () => {
    const query = `supporting-files?where[lessonPlan][equals]=${fx.plan.id}&where[kind][equals]=deck-art`
    return (await body<{ docs: SupportingFile[] }>(await wire(query, 'teacher'))).docs
  }
  const [picture] = await art()
  expect(picture).toMatchObject({ title: spec.hero.art_id, kind: 'deck-art', lessonNumber: 1 })
  expect((await wire(`supporting-files/file/${picture.filename}`, 'teacher')).status).toBe(200)
  const unchanged = await body<ImportResult>(await upload('siteAdmin'))
  expect(unchanged.decks).toEqual([{ id: first.id, lessonNumber: 1, status: 'already here' }])
  expect(await art()).toHaveLength(1)

  expect((await save(official)).status).toBe(401)
  expect((await save(official, 'teacher')).status).toBe(403)
  expect((await save(missing, 'editor')).status).toBe(404)
  expect((await promote(official)).status).toBe(401)
  expect((await promote(official, 'editor')).status).toBe(403)
  expect((await promote(missing, 'subjectAdmin')).status).toBe(404)

  const edited = structuredClone(original)
  const slide = edited.spec!.slides![0]!
  slide.title = 'Changed slide title'
  slide.phase = 'model'
  slide.minutes = 9
  const timer = edited.spec!.slides![1]!.timers![0]!
  timer.time = '9:00'
  edited.spec!.hero!.art_id = 'new_art'
  edited.spec!.hero!.prompt = 'Forged prompt'
  edited.spec!.goals![0]!.value = 'Changed goal'
  edited.spec!.key_words![0]!.definition = 'Changed definition'
  slide.notes!.say![0]!.value = 'Changed notes'

  const reordered = structuredClone(edited)
  reordered.spec!.slides!.reverse()
  expect((await save(official, 'editor', reordered)).status).toBe(403)
  const copy = await body<{ id: number }>(await save(official, 'editor', edited))
  const authored = await version(copy.id)
  expect(authored.semver).toBe('1.0.1')
  expect(authored.author).toBe(fx.users.editor.id)
  expect(authored.spec?.slides?.[0]).toMatchObject({
    title: 'Changed slide title',
    phase: original.spec!.slides![0]!.phase,
    minutes: original.spec!.slides![0]!.minutes,
  })
  expect(authored.spec!.slides![1]!.timers![0]!.time).toBe(
    original.spec!.slides![1]!.timers![0]!.time,
  )
  expect(authored.spec?.hero?.art_id).toBe(spec.hero.art_id)
  expect(authored.spec?.goals?.[0]?.value).toBe('Changed goal')
  expect(authored.spec?.key_words?.[0]?.definition).toBe('Changed definition')
  expect(authored.spec?.slides?.[0]?.notes?.say?.[0]?.value).toBe('Changed notes')

  const withQuiz = structuredClone(edited)
  withQuiz.spec!.slides![0]!.quiz_links = [{ value: 'https://quiz.example/lesson1' }]
  expect((await save(official, 'editor', withQuiz)).status).toBe(403)
  const adminCopy = await body<{ id: number }>(await save(official, 'subjectAdmin', withQuiz))
  const adminVersion = await version(adminCopy.id)
  expect(adminVersion.semver).toBe('1.0.2')
  expect(adminVersion.spec?.slides?.[0]).toMatchObject({ phase: 'model', minutes: 9 })
  expect(adminVersion.spec!.slides![1]!.timers![0]!.time).toBe('9:00')
  expect(adminVersion.spec?.hero?.art_id).toBe('new_art')
  expect(adminVersion.spec?.slides?.[0]?.quiz_links?.[0]?.value).toBe(
    'https://quiz.example/lesson1',
  )
  const adminStored = await fx.payload.findByID({
    collection: 'deck-versions',
    id: adminCopy.id,
    depth: 0,
  })
  expect(adminStored.spec?.hero?.prompt).toBe(spec.hero.prompt)
  expect((await version(official)).spec).toEqual(original.spec)

  expect(
    (
      await wire(`deck-versions/${official}`, 'siteAdmin', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec: { lesson_title_short: 'Do not overwrite' } }),
      })
    ).status,
  ).toBe(403)
  await body(await promote(adminCopy.id, 'subjectAdmin'))
  const current = await body<Deck>(await wire(`decks/${first.id}?depth=0`, 'teacher'))
  expect(current.officialVersion).toBe(adminCopy.id)
  expect(
    (await wire(`deck-versions/${adminCopy.id}`, 'siteAdmin', { method: 'DELETE' })).status,
  ).toBe(409)

  const changed = new File(
    [JSON.stringify({ ...spec, lesson_title_short: 'Replacement title' })],
    'L1.spec.json',
  )
  expect((await upload('subjectAdmin', changed)).status).toBe(409)
  expect((await wire(`decks/${first.id}`, 'teacher')).status).toBe(200)
  const replacement = await body<ImportResult>(
    await upload('subjectAdmin', changed, fx.plan.id, true),
  )
  expect(replacement.decks[0]).toMatchObject({
    lessonNumber: 1,
    status: 'replaced',
    semver: '1.0.0',
  })
  const newId = replacement.decks[0]!.id
  expect(newId).not.toBe(first.id)
  expect((await wire(`decks/${first.id}`, 'teacher')).status).toBe(404)
  for (const id of [official, copy.id, adminCopy.id]) {
    expect((await wire(`deck-versions/${id}`, 'teacher')).status).toBe(404)
  }
  const newDeck = await body<Deck>(await wire(`decks/${newId}?depth=0`, 'teacher'))
  const newVersion = await version(Number(newDeck.officialVersion))
  expect(newVersion.semver).toBe('1.0.0')
  expect(newVersion.spec?.lesson_title_short).toBe('Replacement title')
  const history = await body<{ totalDocs: number }>(
    await wire(`deck-versions?where[deck][equals]=${newId}&depth=0`, 'teacher'),
  )
  expect(history.totalDocs).toBe(1)
}, 60_000)
