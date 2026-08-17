import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * `signInDisabled` on `users` — the offboarding flag (D13a,
 * `docs/DESIGN-manage-accordion-2026-08-16.md`).
 *
 * `DEFAULT false` means every existing account is backfilled to ENABLED by the ADD COLUMN itself, so
 * nobody is disabled by being migrated — the same shape, and the same reasoning, as
 * `20260814_235248_add_public_publication`'s `DEFAULT 'private'`. Postgres 11+ backfills a defaulted
 * column without rewriting the table, so this is not a long lock on a large `users`.
 *
 * ⚑ The column is only ever written by `POST /api/users/:id/set-sign-in-disabled`, which sets it and
 * clears `sessions` atomically. That is enforced in the field's access (`update: () => false`), not
 * here — the schema cannot express it, and a nullable boolean is exactly what the field's optional
 * type expects.
 *
 * ⚑ `{ db }` only, dropping the generator's unused `payload`/`req` args, matching every other
 * migration in this directory. That is a deliberate house edit to generator output, not a lint
 * workaround: the repo lints at `--max-warnings=0` and the unused args would trip it.
 *
 * Verified by RUNNING both directions (not reading them) against a fresh, push-disabled database on
 * 2026-08-17: the full chain applied through this migration and `sign_in_disabled` existed with
 * `default false`; `migrate:down` then removed it and `migrate:status` reported it un-applied.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "sign_in_disabled" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "sign_in_disabled";`)
}
