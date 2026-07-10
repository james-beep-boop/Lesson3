import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Email verification on signup (auth.verify, 2026-07-09): adds Payload's `_verified` +
 * `_verificationtoken` columns to `users`, plus the token index (Codex 2026-07-10 — the public
 * verify endpoint looks the token up per request). Generated OFFLINE on the Mac —
 * `disableDBConnect` getPayload + `payload.db.createMigration` (which only diffs the config-built
 * schema against the latest .json snapshot; the CLI's DB connect is what needs a stack) — then
 * guarded idempotent (project rule) and given the LOAD-BEARING backfill: every PRE-EXISTING
 * account must become `_verified = true`, because with verify enabled the JWT strategy rejects
 * any user whose `_verified` is FALSY (not just false) and resetPassword coerces NULL to false —
 * a plain column-add would lock every existing account out on its next request. The NULL guard
 * keeps a re-run from verifying accounts that signed up (unverified, false) after the migration
 * first ran; `tests/int/verifyBackfill.int.spec.ts` executes this `up` and pins both properties.
 * `down` drops only what this migration owns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "_verified" boolean;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "_verificationtoken" varchar;
  CREATE INDEX IF NOT EXISTS "users__verificationtoken_idx" ON "users" USING btree ("_verificationtoken");
  UPDATE "users" SET "_verified" = true WHERE "_verified" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "users__verificationtoken_idx";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "_verified";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "_verificationtoken";`)
}
