/**
 * The in-server check behind `scripts/restore-db.sh --force-prod` (design A1, steps 2, 3 and 6).
 *
 * Run through the `migrate` service, which holds the Payload CLI and this source; the production
 * `app` image has neither. `restore-db.sh` points `DATABASE_URI` at the database under test through
 * the environment, so the same check runs against the staged `lesson3_incoming_<UTC>` and, after the
 * swap, against the live `lesson3`:
 *
 *   docker compose run --rm --no-deps -T -e DATABASE_URI migrate npx payload run scripts/restore-check.ts
 *   docker compose run --rm --no-deps -T -e RESTORE_CHECK_MODE=migrations \
 *     migrate npx payload run scripts/restore-check.ts
 *
 * MODES
 *   migrations  Print the installed software's migration names, in order, one `MIGRATION <name>` per
 *               line. Needs no database: it is the list the restore's schema check compares against.
 *   check       (default) Read one lesson-plan version through the Local API and render its DOCX and
 *               PDF with the existing generator entry points (`generateFromVersionSnapshot`, then
 *               `docxToPdf` through the running Gotenberg). Prints `RESTORE_CHECK_OK …`, or
 *               `RESTORE_CHECK_NONE` when the database holds no lesson-plan version to render.
 *
 * WHICH VERSION (check mode): `RESTORE_CHECK_VERSION=<id>` exactly; else `RESTORE_CHECK_PLAN=<id>`'s
 * Official version (or its newest version); else the most recently updated plan with an Official
 * version; else the newest version of any plan. `restore-db.sh` records the id it checked on the
 * incoming database and asks for the same id again on the live one.
 *
 * ⚑ NO PASSWORD, AND NO WRITES. Trusted system reads (`overrideAccess`), the same path an export job
 * takes; nothing goes into the artifact cache, and `getPayload` is called without `cron`, so the job
 * queue never runs here — a restored database's queued emails are not sent by checking it.
 */
import { getPayload, type Payload } from 'payload'

import type { LessonBundleVersion } from '../src/payload-types'

const say = (line: string) => console.log(`restore-check: ${line}`)

const positiveId = (name: string): number | null => {
  const raw = process.env[name]?.trim()
  if (!raw) return null
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${name} must be a positive integer id`)
  return Number(raw)
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

const newestVersionId = async (payload: Payload, planId?: number): Promise<number | null> => {
  const { docs } = await payload.find({
    collection: 'lesson-bundle-versions',
    ...(planId ? { where: { lessonPlan: { equals: planId } } } : {}),
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0]?.id ?? null
}

const chooseVersionId = async (payload: Payload): Promise<number | null> => {
  const exact = positiveId('RESTORE_CHECK_VERSION')
  if (exact) return exact

  const planId = positiveId('RESTORE_CHECK_PLAN')
  if (planId) {
    const plan = await payload.findByID({
      collection: 'lesson-plans',
      id: planId,
      depth: 0,
      overrideAccess: true,
    })
    return idOf(plan.officialVersion) ?? (await newestVersionId(payload, planId))
  }

  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    where: { officialVersion: { exists: true } },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return idOf(plans[0]?.officialVersion) ?? (await newestVersionId(payload))
}

const startsWith = (bytes: Buffer, magic: string) =>
  bytes.subarray(0, magic.length).toString('latin1') === magic

const listMigrations = async () => {
  const { migrations } = await import('../src/migrations')
  for (const { name } of migrations) console.log(`MIGRATION ${name}`)
}

const check = async () => {
  // ⚑ NEVER PUSH A SCHEMA INTO THE DATABASE UNDER CHECK. The Postgres adapter pushes the development
  // schema on connect whenever NODE_ENV is not `production` — which would silently reshape a restored
  // database to the model and make the migration check meaningless. An installation's .env says
  // production; a CI or hand-made one may not, so the check does not depend on it.
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
  const { default: config } = await import('@payload-config')
  const { generateFromVersionSnapshot } = await import('../src/generator/generateForVersion')
  const { docxToPdf } = await import('../src/generator/docxToPdf')
  const payload = await getPayload({ config })
  try {
    const users = (await payload.count({ collection: 'users', overrideAccess: true })).totalDocs
    say(`Local API read ${users} account(s)`)

    const versionId = await chooseVersionId(payload)
    if (!versionId) {
      say('no lesson-plan version in this database, so DOCX and PDF rendering was not exercised')
      console.log('RESTORE_CHECK_NONE')
      return
    }
    const version = (await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: versionId,
      depth: 0,
      overrideAccess: true,
    })) as LessonBundleVersion
    const planId = idOf(version.lessonPlan)
    say(`read lesson plan ${planId} version ${version.id} (${version.semver})`)

    const docx = await generateFromVersionSnapshot(version)
    if (!startsWith(docx.lessonSequence, 'PK'))
      throw new Error('the lesson-sequence DOCX is not a DOCX')
    const docxBytes = Object.values(docx).reduce((n, b) => n + (b ? b.length : 0), 0)
    say(
      `rendered DOCX (${docxBytes} bytes across ${Object.values(docx).filter(Boolean).length} documents)`,
    )

    const pdf = await docxToPdf(docx.lessonSequence, 'restore-check.docx')
    if (!startsWith(pdf, '%PDF')) throw new Error('Gotenberg returned something that is not a PDF')
    say(`rendered PDF through Gotenberg (${pdf.length} bytes)`)

    console.log(
      `RESTORE_CHECK_OK version=${version.id} plan=${planId} docx=${docxBytes} pdf=${pdf.length}`,
    )
  } finally {
    await payload.destroy()
  }
}

try {
  if (process.env.RESTORE_CHECK_MODE === 'migrations') await listMigrations()
  else await check()
  process.exit(0)
} catch (error) {
  console.error(`restore-check: FAILED — ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
