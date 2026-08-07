/**
 * Post-deploy verification for edit recovery PR 1: prove the delete-time cascade actually REMOVES
 * `edit_recovery` rows, on the real deployed stack.
 *
 * WHY THIS EXISTS. Registering the `edit-recovery` collection made two hooks run on **every version
 * delete and every user delete**, and those hooks query a table that only the migration creates. If a
 * deploy applies the app but not the migration, nothing looks wrong until someone deletes a version —
 * and then save-as-new `deleteSource`, make-official `deletePrevious`, plan deletion and user deletion
 * all fail at once. This script is the check that surfaces that in seconds instead of in production.
 *
 * ⚑ It deletes through the **Payload Local API**, not SQL. A raw `DELETE` would exercise the foreign
 * key and prove nothing about the hook — and the hook is the thing that has to run, because the FKs are
 * `ON DELETE SET NULL` against NOT NULL columns (a parent delete that reaches the database without the
 * cascade having run first raises 23502).
 *
 * ⚑ It seeds a real recovery row before deleting. Deleting a version that has no captures only proves
 * the cascade's query parses; it does not prove the cascade CLEARS anything. The row seeded here is
 * what makes the assertion meaningful.
 *
 * SAFE ON A LIVE BOX. Everything it creates is its own — a throwaway version on an existing plan,
 * marked in the title, plus one recovery row pointing at it — and the `finally` removes both even when
 * an assertion fails. It never touches an Official version, never writes to an existing row, and
 * refuses to run if it cannot find a plan to attach to.
 *
 * ON THE ROCK, run from the `migrate` service, NOT `app` — the prod `app` image is a minimal Next
 * standalone with no Payload CLI and no `scripts/` source:
 *
 *   docker compose run --rm migrate npx payload run scripts/verify-edit-recovery-cascade.ts
 *
 * Exits non-zero on any failed assertion, so it can gate a deploy script.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { stripIds } from '../src/lib/stripIds'

const MARK = 'ZZ_DEPLOY_VERIFY_'

const ok = (label: string) => console.log(`  ✓ ${label}`)
const fail = (label: string) => {
  console.error(`  ✖ ${label}`)
  process.exitCode = 1
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const db = (
    payload as unknown as { db: { drizzle: { execute: (q: unknown) => Promise<unknown> } } }
  ).db.drizzle
  // `sql` comes from the same adapter the app uses, so this matches production's driver exactly.
  const { sql } = await import('@payloadcms/db-postgres')

  const rowsOf = <T = Record<string, unknown>>(r: unknown): T[] =>
    (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? [])) as T[]

  let versionId: number | null = null

  try {
    // A plan to attach to, and a user to own the capture. Both must already exist.
    const plan = (await payload.find({ collection: 'lesson-plans', limit: 1, depth: 0 }))
      .docs[0] as { id: number; subjectGrade?: unknown } | undefined
    const user = (await payload.find({ collection: 'users', limit: 1, depth: 0 })).docs[0] as
      | { id: number }
      | undefined
    if (!plan || !user) {
      console.error('No lesson plan or no user on this box — nothing to verify against.')
      process.exitCode = 1
      return
    }

    // Copy an existing version's content so the throwaway satisfies whatever the schema requires,
    // rather than guessing at required fields that may change.
    const source = (
      await payload.find({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { equals: plan.id } },
        limit: 1,
        depth: 0,
      })
    ).docs[0] as unknown as Record<string, unknown> | undefined
    if (!source) {
      console.error('That plan has no versions to copy from.')
      process.exitCode = 1
      return
    }

    // ⚑ `stripIds` is not optional here. The copied document carries the SOURCE's nested row ids, and
    // Payload rejects those on create with "The following field is invalid: id" — the same reason
    // save-as-new strips them when forking.
    const { id: _id, semver: _s, createdAt: _c, updatedAt: _u, ...rest } = source
    const content = stripIds(rest) as Record<string, unknown>
    const created = (await payload.create({
      collection: 'lesson-bundle-versions',
      data: { ...content, semver: '0.0.1', title: `${MARK}cascade-check` } as never,
      overrideAccess: true,
    })) as { id: number }
    versionId = created.id
    ok(`created throwaway version ${versionId} (semver 0.0.1, NOT Official)`)

    // Seed a capture against it, so the cascade has something real to clear.
    await db.execute(sql`
      INSERT INTO edit_recovery
        (user_id, source_version_id, lesson_plan_id, generation, revision,
         base_updated_at, schema_version, content)
      VALUES (${user.id}, ${versionId}, ${plan.id}, 1, 1, NOW(), 'v1', '{"probe":"x"}'::jsonb)
    `)
    const seeded = rowsOf<{ n: string }>(
      await db.execute(
        sql`SELECT count(*) AS n FROM edit_recovery WHERE source_version_id = ${versionId}`,
      ),
    )
    if (Number(seeded[0]?.n) === 1) ok('seeded one edit_recovery row against it')
    else fail(`expected 1 seeded recovery row, saw ${seeded[0]?.n}`)

    // THE CHECK. Through Payload, so the beforeDelete cascade runs.
    await payload.delete({
      collection: 'lesson-bundle-versions',
      id: versionId,
      overrideAccess: true,
    })
    versionId = null
    ok('version deleted through Payload — the cascade hook ran without error')

    const left = rowsOf<{ n: string }>(
      await db.execute(
        sql`SELECT count(*) AS n FROM edit_recovery WHERE content = '{"probe":"x"}'::jsonb`,
      ),
    )
    if (Number(left[0]?.n) === 0) ok('its edit_recovery row was removed by the cascade')
    else fail(`cascade left ${left[0]?.n} orphaned recovery row(s)`)
  } catch (e) {
    fail(`threw: ${(e as Error).message}`)
  } finally {
    // Belt and braces: if an assertion failed after the version was created, remove it anyway.
    if (versionId != null) {
      try {
        await payload.delete({
          collection: 'lesson-bundle-versions',
          id: versionId,
          overrideAccess: true,
        })
        console.log(`  (cleaned up throwaway version ${versionId})`)
      } catch (e) {
        console.error(
          `  ⚠ COULD NOT clean up throwaway version ${versionId}: ${(e as Error).message}`,
        )
        process.exitCode = 1
      }
    }
    await db.execute(sql`DELETE FROM edit_recovery WHERE content = '{"probe":"x"}'::jsonb`)
  }

  console.log(process.exitCode ? '\nFAILED' : '\nOK — the delete-time cascade works on this box.')
  process.exit(process.exitCode ?? 0)
}

// ⚑ Top-level `await`, matching every other script in this directory. `payload run` does NOT keep the
// event loop alive for a floating promise: with `void run()` this script printed nothing at all and
// exited 0, which reads exactly like a passing check. That is the worst possible failure mode for a
// verification tool, and it is why the house pattern is what it is.
await run()
