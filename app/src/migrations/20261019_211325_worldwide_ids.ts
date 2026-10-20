import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { releaseMajor } from '../ingest/releaseAncestry'
import { releaseFingerprint } from '../lib/identity/releaseFingerprint'
import { relId } from '../lib/relId'

/**
 * Worldwide identity (2026-10-19; `fields/identity.ts`, DECISIONS 2026-10-19).
 *
 * Adds a UUID `uid` to lesson plans, versions and users, an `ares-content-v1` fingerprint to versions
 * created from an ARES upload, and this installation's id to the settings singleton. Additive: nothing
 * reads them yet, and ancestry still uses local ids.
 *
 * Hand-edited from `migrate:create`, whose `ADD COLUMN … NOT NULL` fails on tables that already have
 * rows. Here each column is added nullable, filled, and only then constrained. Every fill is
 * `WHERE … IS NULL`, so a rerun keeps the ids already issued — an id, once given, never changes.
 *
 * Release fingerprints are backfilled only for versions the AUDITED release rule recognises
 * (`releaseMajor`: a whole major N.0.0, no author, no second parent — never "no author" alone, since a
 * deleted author also reads as null). Every other version keeps a null fingerprint.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "lesson_plans" ADD COLUMN IF NOT EXISTS "uid" varchar;
    ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "uid" varchar;
    ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "release_fingerprint" varchar;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "uid" varchar;
    ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "installation_id" varchar;

    UPDATE "lesson_plans" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
    UPDATE "lesson_bundle_versions" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
    UPDATE "users" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
    -- The singleton exists since 20261009_082909_add_forum_enabled; ensure it regardless.
    INSERT INTO "system_settings" ("updated_at", "created_at")
      SELECT now(), now() WHERE NOT EXISTS (SELECT 1 FROM "system_settings");
    UPDATE "system_settings" SET "installation_id" = gen_random_uuid()::text
      WHERE "installation_id" IS NULL;

    ALTER TABLE "lesson_plans" ALTER COLUMN "uid" SET NOT NULL;
    ALTER TABLE "lesson_bundle_versions" ALTER COLUMN "uid" SET NOT NULL;
    ALTER TABLE "users" ALTER COLUMN "uid" SET NOT NULL;
    ALTER TABLE "system_settings" ALTER COLUMN "installation_id" SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS "lesson_plans_uid_idx" ON "lesson_plans" USING btree ("uid");
    CREATE UNIQUE INDEX IF NOT EXISTS "lesson_bundle_versions_uid_idx" ON "lesson_bundle_versions" USING btree ("uid");
    CREATE INDEX IF NOT EXISTS "lesson_bundle_versions_release_fingerprint_idx" ON "lesson_bundle_versions" USING btree ("release_fingerprint");
    CREATE UNIQUE INDEX IF NOT EXISTS "users_uid_idx" ON "users" USING btree ("uid");
  `)

  // Fingerprints need the stored content, which spans many child tables, so read through Payload
  // (inside the migration's transaction) one page at a time and write with a guarded UPDATE.
  let page = 1
  let filled = 0
  for (;;) {
    const result = await payload.find({
      collection: 'lesson-bundle-versions',
      // No filter on the fingerprint: filling one would move it out of a filtered result and shift
      // every later page. All rows in id order; the guarded UPDATE skips any already filled.
      depth: 0,
      limit: 25,
      page,
      sort: 'id',
      overrideAccess: true,
      req,
    })
    for (const version of result.docs) {
      const release =
        typeof version.semver === 'string' &&
        releaseMajor({
          semver: version.semver,
          author: relId(version.author),
          second: relId(version.mergedFrom),
        }) !== null
      if (!release) continue
      const fingerprint = releaseFingerprint(version as unknown as Record<string, unknown>)
      await db.execute(sql`
        UPDATE "lesson_bundle_versions" SET "release_fingerprint" = ${fingerprint}
        WHERE "id" = ${version.id} AND "release_fingerprint" IS NULL
      `)
      filled++
    }
    if (!result.hasNextPage) break
    page++
  }
  if (filled) payload.logger.info({ filled }, 'Release fingerprints backfilled (ares-content-v1)')
}

/** Removes the columns. Ids issued before a down are lost; an up afterwards issues new ones. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "lesson_plans_uid_idx";
    DROP INDEX IF EXISTS "lesson_bundle_versions_uid_idx";
    DROP INDEX IF EXISTS "lesson_bundle_versions_release_fingerprint_idx";
    DROP INDEX IF EXISTS "users_uid_idx";
    ALTER TABLE "lesson_plans" DROP COLUMN IF EXISTS "uid";
    ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "uid";
    ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "release_fingerprint";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "uid";
    ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "installation_id";
  `)
}
