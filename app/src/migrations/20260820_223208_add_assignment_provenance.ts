import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * `grantedBy` / `grantedAt` on `users_assignments` — provenance for every role grant (operator
 * decision 2026-08-19).
 *
 * It exists for what it makes auditable: a Subject Administrator handing administration of their own
 * subject-grade to a colleague without a Site Administrator in the loop. That transfer cannot be
 * undone by the person who made it, and until now the data carried no record of who made it —
 * DECISIONS' D6a audit query says so outright, that it "cannot distinguish a legitimate Site-Admin
 * grant from a self-appointment".
 *
 * ⚑ NULLABLE, WITH NO BACKFILL, and that is the honest shape rather than the convenient one. Every row
 * that predates this migration knows nothing about its own origin; a `DEFAULT` would have invented a
 * grantor, and picking one (the row's own user? the first site admin?) would be a lie the audit trail
 * then repeats forever. Consumers must read null as "unknown", never as "nobody". Unlike
 * `20260817_141942_add_sign_in_disabled`'s `DEFAULT false`, there is no safe default here — that one
 * had a correct answer for existing rows, this one does not.
 *
 * ⚑ `ON DELETE set null`, which means PROVENANCE IS NOT PERMANENT. Deleting the granting account
 * nulls the reference rather than deleting the assignment — correct, since the grant outlives the
 * grantor and cascading would silently revoke someone's access when an unrelated account is removed.
 * The cost is that provenance degrades to "unknown" exactly when the person is gone, which is often
 * when you most want it. Storing a denormalised label instead would survive, at the price of an
 * unverifiable string; the reference is the better trade, but the limitation is real and belongs here
 * rather than being discovered later.
 *
 * The index is on `granted_by_id` — the generator's, kept: "what did this person grant?" is the
 * question an audit asks, and it is the only one the column supports.
 *
 * ⚑ `{ db }` only, dropping the generator's unused `payload`/`req` args, matching every other
 * migration in this directory — a deliberate house edit, since the repo lints at `--max-warnings=0`.
 *
 * Verified by RUNNING both directions (not reading them) against a database with the full chain
 * applied, on 2026-08-20: `up` created both columns, the FK and the index; `down` removed all four and
 * `migrate:status` reported this migration un-applied.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_assignments" ADD COLUMN "granted_by_id" integer;
  ALTER TABLE "users_assignments" ADD COLUMN "granted_at" timestamp(3) with time zone;
  ALTER TABLE "users_assignments" ADD CONSTRAINT "users_assignments_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_assignments_granted_by_idx" ON "users_assignments" USING btree ("granted_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_assignments" DROP CONSTRAINT "users_assignments_granted_by_id_users_id_fk";
  DROP INDEX "users_assignments_granted_by_idx";
  ALTER TABLE "users_assignments" DROP COLUMN "granted_by_id";
  ALTER TABLE "users_assignments" DROP COLUMN "granted_at";`)
}
