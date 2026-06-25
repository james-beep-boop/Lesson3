/**
 * Verify the Stage-2 teacher read path on the Official-version model, WITHOUT credentials.
 *
 * Loads the seeded Teacher user and runs the exact access-gated queries the browse + detail pages
 * run (overrideAccess:false + that user), then generates from the resolved Official version. Proves
 * the server-side data path the pages render: a Teacher sees every plan, each plan resolves to its
 * Official version (carrying meta/unit/lessons), and that version generates. The browser render +
 * download handshake are thin layers over this (and the export endpoints are separately auth-gated).
 *
 * Read-only (generates in memory, writes nothing). Run on the Rock:
 *   cd app && npx payload run scripts/verify-stage2-reads.ts -- [teacherEmail]
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { findReadablePlan, findReadableVersion } from '../src/lib/readBundle'
import { generateForVersion } from '../src/generator/generateForVersion'
import type { User } from '../src/payload-types'

const relId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return Number((value as { id: unknown }).id)
  return null
}

const run = async () => {
  const email = process.argv.slice(2).find((a) => a !== '--') ?? 'teacher@lesson3.local'
  const payload = await getPayload({ config })

  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const user = found.docs[0] as User | undefined
  if (!user) throw new Error(`No user ${email} — pass a seeded teacher email as an arg.`)
  console.log(`Acting as: ${user.name} <${email}> (roles=${JSON.stringify(user.roles ?? [])})`)

  // --- Browse: plans the teacher can read, then their Official versions (as the page does) ---
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    overrideAccess: false,
    user,
    depth: 0,
    limit: 200,
    select: { officialVersion: true },
  })
  const officialIds = plans.map((p) => relId(p.officialVersion)).filter((id): id is number => id != null)
  console.log(`Browse: ${plans.length} plans visible; ${officialIds.length} with an Official version.`)

  const { docs: versions } = officialIds.length
    ? await payload.find({
        collection: 'lesson-bundle-versions',
        where: { id: { in: officialIds } },
        overrideAccess: false,
        user,
        depth: 2,
        limit: 200,
        select: { title: true, subjectGrade: true, lessonPlan: true, meta: { substrand_id: true }, unit: { strand: true }, lessons: { id: true } },
      })
    : { docs: [] }

  let rowsOk = 0
  for (const v of versions) {
    const lessons = Array.isArray(v.lessons) ? v.lessons.length : 0
    const hasMeta = Boolean(v.meta?.substrand_id) && lessons > 0 && relId(v.lessonPlan) != null
    if (hasMeta) rowsOk++
    else console.warn(`  ⚠ version ${v.id} "${v.title}" missing substrand_id/lessons/plan link`)
  }
  console.log(`Browse rows: ${rowsOk}/${versions.length} have substrand_id + ≥1 lesson + a plan link.`)

  // --- Detail: for each plan, resolve Official version and generate (as the page does) ---
  let detailOk = 0
  for (const plan of plans) {
    const p = await findReadablePlan(payload, { id: plan.id, user })
    const officialId = relId(p?.officialVersion)
    if (!p || officialId == null) {
      console.warn(`  ⚠ plan ${plan.id} not readable or no Official version`)
      continue
    }
    const version = await findReadableVersion(payload, { id: officialId, user })
    if (!version) {
      console.warn(`  ⚠ plan ${plan.id} Official version ${officialId} not readable`)
      continue
    }
    const out = await generateForVersion(payload, officialId, 'compact')
    if (out.lessonSequence?.length) detailOk++
    else console.warn(`  ⚠ plan ${plan.id} generated an empty LessonSequence`)
  }
  console.log(`Detail: ${detailOk}/${plans.length} plans resolve Official + generate a LessonSequence.`)

  console.log(`\n${'='.repeat(50)}`)
  const ok = rowsOk === versions.length && detailOk === plans.length && plans.length > 0
  if (!ok) {
    console.error('✗ STAGE-2 READ VERIFY FAILED')
    process.exit(1)
  }
  console.log('✓ STAGE-2 READ VERIFY PASSED (teacher browse + detail + generate over the version model)')
}

await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
