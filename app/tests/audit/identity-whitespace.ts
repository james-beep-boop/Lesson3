import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../../src/payload.config.js'
import { ingestUploadItems, type IngestItem } from '../../src/ingest/index.js'
import { minimalResourceLinks } from '../helpers/fixtures.js'
const payload = await getPayload({ config })
const subjectName = `AUDIT_${randomUUID()}_Identity`
let subjectId: number | undefined
let gradeId: number | undefined
const plans = new Set<number>()
try {
  const subject = await payload.create({
    collection: 'subjects',
    data: { name: subjectName },
    overrideAccess: true,
  })
  subjectId = subject.id
  const grade = await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade: 10 },
    overrideAccess: true,
  })
  gradeId = grade.id
  const raw = (id: string, title: string) => ({
    schemaVersion: '1.0.0',
    META: {
      subject: subjectName,
      grade: 10,
      substrand_id: id,
      substrand_name: 'Audit sub-strand',
      titleDoc: title,
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
  const run = async (data: Record<string, unknown>, name: string) => {
    const items: IngestItem[] = [{ name, extract: () => data }]
    let r = await ingestUploadItems(payload, items)
    if (r.needsConfirmation) r = await ingestUploadItems(payload, items, undefined, r.previewToken)
    for (const b of r.bundles) plans.add(b.id)
    return r
  }
  const observations = []
  for (const [kind, id] of [
    ['plain', '77.1'],
    ['padded', ' 77.2 '],
  ] as const) {
    const a = await run(raw(id, 'Initial'), 'first.json')
    const b = await run(raw(id, 'Revision'), 'second.json')
    const v = await payload.find({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: a.bundles[0]?.id } },
      overrideAccess: true,
      depth: 0,
      pagination: false,
    })
    observations.push({
      kind,
      first: a.bundles.map((x) => ({ id: x.id, semver: x.semver })),
      second: b.bundles.map((x) => ({ id: x.id, semver: x.semver })),
      storedIds: v.docs.map((x) => x.meta?.substrand_id),
      samePlan: a.bundles[0]?.id === b.bundles[0]?.id,
    })
  }
  console.log(
    JSON.stringify({ source: '6e75a173e822e4c4be42821b0a4af48ca457bd36', observations }, null, 2),
  )
  assert.ok(
    observations.every((o) => o.samePlan),
    'Re-import must retain plan identity for the same nonempty sub-strand ID',
  )
} finally {
  for (const id of plans)
    await payload.delete({ collection: 'lesson-plans', id, overrideAccess: true })
  if (gradeId)
    await payload.delete({ collection: 'subject-grades', id: gradeId, overrideAccess: true })
  if (subjectId)
    await payload.delete({ collection: 'subjects', id: subjectId, overrideAccess: true })
  await payload.destroy()
}
