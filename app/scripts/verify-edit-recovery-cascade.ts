/**
 * Post-deploy probe for edit recovery: does THIS BOX's schema actually support the delete-time
 * cascade?
 *
 * ⚑ **READ WHAT THIS IS NOT, FIRST.** It is not the primary guard, and treating it as one would be a
 * mistake. The cascade's behaviour is already covered automatically, at better levels:
 *
 *   - `tests/http/saveAsNewRecovery.http.spec.ts` deletes a real version that has a seeded capture
 *     and asserts the row went with it — over the wire, against a MIGRATION-ONLY schema, because CI
 *     runs that step with `NODE_ENV=production` so dev-mode schema push cannot paper over a missing
 *     migration.
 *   - `tests/int/editRecoveryAccess.int.spec.ts` covers matrix cases 17-18: version delete, user
 *     delete, and the transitive plan→version→recovery path.
 *   - `docker-compose.yml` gates `app` on `migrate: service_completed_successfully`, so a deploy that
 *     fails to migrate does not yield a quietly-broken app — it yields no app at all.
 *
 * What none of those can see is **the state of one particular deployed database**: a schema that
 * drifted, a migration applied by hand, a restore from a stale dump. That is the entire remaining gap,
 * and it is what this script closes.
 *
 * DEFAULT MODE IS READ-ONLY and safe on a live box at any time: it checks the table, the compound
 * unique index the protocol depends on, and that both cascade queries execute against real rows.
 *
 * `APPLY=1` additionally runs the full drill — create a throwaway version, seed a real recovery row,
 * delete through the **Payload Local API**, assert the row is gone. That is a genuine write to
 * production data, which is why it is opt-in, exactly as `clear-editor-collapse-prefs.ts` is. Deleting
 * through Payload and not SQL is the point: a raw `DELETE` exercises the foreign key and never runs
 * the hook, and the hook is the thing that has to work.
 *
 * ⚑ Seeding a row before deleting is also the point. Deleting a version with no captures proves the
 * cascade's query PARSES; it proves nothing about whether the cascade CLEARS anything.
 *
 *   cd app && npx payload run scripts/verify-edit-recovery-cascade.ts              # read-only
 *   cd app && APPLY=1 npx payload run scripts/verify-edit-recovery-cascade.ts      # + the write drill
 *
 * ON THE ROCK, run from the `migrate` service, NOT `app` — the prod `app` image is a minimal Next
 * standalone with no Payload CLI and no `scripts/` source. `APPLY=1` must go INSIDE the container via
 * `-e`; a shell prefix would only set it for the local docker CLI. Runbook: `docs/OPS.md` → Deploy.
 *
 *   docker compose run --rm [-e APPLY=1] migrate npx payload run scripts/verify-edit-recovery-cascade.ts
 *
 * Exits non-zero on any failed check.
 */
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'

import { rowsOf } from '../src/lib/txDb'
import { stripIds } from '../src/lib/stripIds'

/** Title prefix for the throwaway version, matching `verify-rbac.ts`'s `ZZ_RBAC_TEST_` convention. */
const MARK = 'ZZ_DEPLOY_VERIFY_'

/** The seeded row's content, used to find it again. See `probeRowsLeft` for why not the version id. */
const PROBE = '{"probe":"x"}'

const ok = (label: string) => console.log(`  ✓ ${label}`)
const fail = (label: string) => {
  console.error(`  ✖ ${label}`)
  process.exitCode = 1
}
const check = (condition: boolean, label: string) => (condition ? ok(label) : fail(label))

/**
 * Exit, but FLUSH FIRST.
 *
 * ⚑ `process.exit()` truncates a PIPED stdout. Writes to a pipe are asynchronous, and exiting drops
 * whatever is still buffered — so this script printed its full report when stdout was a file and
 * NOTHING AT ALL through `| tail`, while still exiting 0. For a verification tool that is the same
 * silent-success failure the top-level-await comment below describes, reached by a different route,
 * and it would hit anyone running this in a pipeline or capturing it in CI.
 */
const exit = async (): Promise<never> => {
  await new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve())
  })
  process.exit()
}

const run = async (): Promise<void> => {
  const apply = process.env.APPLY === '1'
  const payload = await getPayload({ config })
  const db = (
    payload as unknown as { db: { drizzle: { execute: (q: unknown) => Promise<unknown> } } }
  ).db.drizzle

  const count = async (q: unknown): Promise<number> =>
    Number((rowsOf(await db.execute(q))[0] as { n?: unknown } | undefined)?.n ?? 0)

  // ── Read-only: the schema this box actually has ────────────────────────────────────────────────
  console.log('Schema:')
  const tables = await count(
    sql`SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'edit_recovery'`,
  )
  check(tables === 1, '`edit_recovery` table exists')
  if (tables !== 1) {
    console.error('\nFAILED — the migration has not been applied to this database.')
    await exit()
  }

  // The protocol leans on this: it is `start`'s conflict target, and what makes one row per
  // (user, source version) a database guarantee rather than a convention.
  const unique = await count(
    sql`SELECT count(*) AS n FROM pg_indexes WHERE tablename = 'edit_recovery' AND indexname = 'user_sourceVersion_idx'`,
  )
  check(unique === 1, 'compound unique index on (user_id, source_version_id) exists')

  // The exact shapes the two cascade hooks run on every version and user delete. If a column or the
  // table is wrong, these throw HERE rather than during someone's save.
  await db.execute(
    sql`SELECT count(*) AS n FROM edit_recovery WHERE source_version_id = (SELECT min(id) FROM lesson_bundle_versions)`,
  )
  ok('the version-delete cascade query executes against a real version')
  await db.execute(
    sql`SELECT count(*) AS n FROM edit_recovery WHERE user_id = (SELECT min(id) FROM users)`,
  )
  ok('the user-delete cascade query executes against a real user')

  if (!apply) {
    console.log(
      process.exitCode
        ? '\nFAILED'
        : '\nOK (read-only). Re-run with APPLY=1 for the full create-seed-delete drill.',
    )
    await exit()
  }

  // ── APPLY=1: the write drill, on real data ─────────────────────────────────────────────────────
  console.log('\nCascade drill (APPLY=1 — this writes):')

  /**
   * ⚑ Counted by CONTENT, not by `source_version_id`. Once the version is gone that column is no
   * longer a usable handle, and this predicate also sweeps rows orphaned by an earlier run that died
   * before its cleanup.
   */
  const probeRowsLeft = () =>
    count(sql`SELECT count(*) AS n FROM edit_recovery WHERE content = ${PROBE}::jsonb`)

  const cleanup = async () => {
    // By title, so it is idempotent and also clears a previous run's leftovers. A bulk delete reports
    // failures rather than throwing, so surface them instead of letting them vanish.
    const res = (await payload.delete({
      collection: 'lesson-bundle-versions',
      where: { title: { equals: `${MARK}cascade-check` } },
      overrideAccess: true,
    })) as { errors?: unknown[] }
    if (res.errors?.length) {
      fail(`could not clean up the throwaway version: ${JSON.stringify(res.errors)}`)
    }
    await db.execute(sql`DELETE FROM edit_recovery WHERE content = ${PROBE}::jsonb`)
  }

  try {
    const plan = (await payload.find({ collection: 'lesson-plans', limit: 1, depth: 0 }))
      .docs[0] as { id: number } | undefined
    const user = (await payload.find({ collection: 'users', limit: 1, depth: 0 })).docs[0] as
      | { id: number }
      | undefined
    if (!plan || !user) {
      fail('no lesson plan or no user on this box — nothing to drill against')
      return
    }

    const source = (
      await payload.find({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { equals: plan.id } },
        limit: 1,
        depth: 0,
      })
    ).docs[0] as unknown as Record<string, unknown> | undefined
    if (!source) {
      fail('that plan has no versions to copy from')
      return
    }

    // Copy an existing version so the throwaway satisfies whatever the schema requires, rather than
    // guessing at required fields that may change. `stripIds` drops EVERY `id` — including the root's
    // — which is why only the timestamps need naming here; it is the same call save-as-new makes when
    // forking. `semver` and `title` are overwritten by the spread below.
    const { createdAt: _c, updatedAt: _u, ...rest } = source
    const created = (await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...(stripIds(rest) as object),
        semver: '0.0.1',
        title: `${MARK}cascade-check`,
      } as never,
      overrideAccess: true,
    })) as { id: number }
    ok(`created throwaway version ${created.id} (semver 0.0.1, NOT Official)`)

    await db.execute(sql`
      INSERT INTO edit_recovery
        (user_id, source_version_id, lesson_plan_id, generation, revision,
         base_updated_at, schema_version, content)
      VALUES (${user.id}, ${created.id}, ${plan.id}, 1, 1, NOW(), 'v1', ${PROBE}::jsonb)
    `)
    // Not redundant with the INSERT: it proves the sentinel round-trips through jsonb, without which
    // the post-delete assertion below would read zero for the wrong reason.
    check((await probeRowsLeft()) === 1, 'seeded one edit_recovery row against it')

    // THE CHECK. Through Payload, so the beforeDelete cascade runs.
    await payload.delete({
      collection: 'lesson-bundle-versions',
      id: created.id,
      overrideAccess: true,
    })
    ok('version deleted through Payload — the cascade hook ran without error')
    check((await probeRowsLeft()) === 0, 'its edit_recovery row was removed by the cascade')
  } catch (e) {
    fail(`threw: ${(e as Error).message}`)
  } finally {
    await cleanup()
  }

  console.log(process.exitCode ? '\nFAILED' : '\nOK — the delete-time cascade works on this box.')
  await exit()
}

// ⚑ Top-level `await`, matching every other script here. `payload run` does NOT keep the event loop
// alive for a floating promise: with `void run()` this script printed nothing and exited 0, which
// reads exactly like a passing check — the worst failure mode a verification tool can have.
await run()
