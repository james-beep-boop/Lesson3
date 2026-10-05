/**
 * Null resource slots — a REAL Payload write (the gap that let this through). ARES's relevance
 * matcher returns `video: null` / `reading: null` when no library item is relevant enough (830 of
 * the Grade 10 slots in the v2 corpus). Payload's group handling throws on a null group
 * ("Cannot read properties of null (reading 'title')" → HTTP 500), and the unit suites only ever
 * validated the rows, never wrote them. This pins: write → read back → export projection → a later
 * save passes the version gate → re-ingest, with the null preserved and populated slots untouched.
 *
 * Seeds its own Subject/SubjectGrade, MARK-tagged, and tears down. Requires a DB (Rock/CI only).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { ingestItems } from '../../src/ingest/index.js'
import { toAresResourceLinks, type StoredResourceLinkRow } from '../../src/ingest/resourceLinks.js'
import { validateGeneratable } from '../../src/ingest/validateGeneratable.js'
import { MARK, MARK_BASE, minimalResourceLinks, purgeMarked } from '../helpers/fixtures.js'
import { relId } from '../../src/lib/relId.js'

let payload: Payload
const GRADE = 96 // owned by this suite (reingest uses 97; the shared fixture 99/98)

function nullSlots() {
  const links = minimalResourceLinks() as Record<string, Record<string, unknown>>
  links.predict!.video = null
  links.predict!.reading = null
  links.dqb!.reading = null
  return links
}

function rawBundle(substrandId: string): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    META: {
      subject: `${MARK}Biology`,
      grade: GRADE,
      substrand_id: substrandId,
      substrand_name: `${MARK}${substrandId} name`,
      titleDoc: `${MARK}Null resources`,
    },
    UNIT: null,
    LESSONS: [
      {
        number: 1,
        title: `${MARK}Lesson`,
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
        resourceLinks: nullSlots(),
      },
    ],
    FINAL_EXPLANATION: null,
    SUMMARY_TABLE: null,
  }
}

const item = (name: string, raw: Record<string, unknown>) => ({ name, extract: () => raw })

beforeAll(async () => {
  payload = await getPayload({ config })
  await purgeMarked(payload, MARK_BASE)
  const subject = await payload.create({
    collection: 'subjects',
    data: { name: `${MARK}Biology` },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade: GRADE },
    overrideAccess: true,
  })
}, 60_000)

afterAll(async () => {
  if (payload) await purgeMarked(payload, MARK)
})

async function officialVersion(planId: number) {
  const plan = await payload.findByID({
    collection: 'lesson-plans',
    id: planId,
    depth: 0,
    overrideAccess: true,
  })
  return payload.findByID({
    collection: 'lesson-bundle-versions',
    id: relId((plan as { officialVersion?: unknown }).officialVersion) as number,
    depth: 0,
    overrideAccess: true,
  })
}

const storedLinksOf = (version: unknown) =>
  (version as { lessons: { resourceLinks: StoredResourceLinkRow[] }[] }).lessons[0]!.resourceLinks

describe('null resource slots through a real Payload write', () => {
  it('ingests, stores an empty group (not null), and exports the null back out', async () => {
    const [r] = await ingestItems(payload, [item('n1.json', rawBundle('96.1'))])
    expect(r.action).toBe('created')

    const rows = storedLinksOf(await officialVersion(r.id))
    const byPhase = Object.fromEntries(rows.map((row) => [row.phase, row]))
    // Storage: an empty Payload group — an object with null leaves, never `null`.
    expect(byPhase.predict!.video).toEqual(expect.objectContaining({ title: null, tier: null }))
    expect(byPhase.predict!.reading).toEqual(expect.objectContaining({ title: null }))
    expect(byPhase.dqb!.reading).toEqual(expect.objectContaining({ title: null }))
    // …while the populated sibling is stored intact.
    expect(byPhase.dqb!.video).toEqual(expect.objectContaining({ title: `${MARK}dqb video` }))

    // Export projection: back to the exact ARES shape, nulls restored, populated slots identical.
    expect(toAresResourceLinks(rows)).toEqual(nullSlots())
  })

  it('the stored rows still pass the version gate that every later save runs', async () => {
    const [r] = await ingestItems(payload, [item('n2.json', rawBundle('96.2'))])
    const version = await officialVersion(r.id)
    expect(validateGeneratable(version as never)).toEqual([])
  })

  it('re-ingesting the same sub-strand attaches a new version and keeps the nulls', async () => {
    const first = (await ingestItems(payload, [item('n3a.json', rawBundle('96.3'))]))[0]!
    const second = (await ingestItems(payload, [item('n3b.json', rawBundle('96.3'))]))[0]!
    expect(second.action).toBe('revised')
    expect(second.id).toBe(first.id)
    const { docs } = await payload.find({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: first.id } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    expect(docs).toHaveLength(2)
    for (const doc of docs) expect(toAresResourceLinks(storedLinksOf(doc))).toEqual(nullSlots())
  })
})
