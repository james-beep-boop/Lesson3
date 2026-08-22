import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drop `features_outbound_email` — the flag is removed, not renamed (operator decision 2026-08-22).
 *
 * ⚑ SAFE TO DROP BECAUSE NOTHING EVER READ IT. It was added yesterday by
 * `20260821_234341_add_system_settings`, no enforcement reader consults the flags, and the panel
 * renders facts only — so no behaviour depends on the value and no operator has meaningfully set one.
 * `system_settings` has zero rows locally and the table does not exist in production at all (the
 * add-system-settings migration has not been deployed), so this drops a column that in practice has
 * never held data. Doing it now costs one migration; doing it after part 2 ships would be a rename
 * against live values.
 *
 * ⚑ WHY REMOVED RATHER THAN RENAMED: the flag conflated account verification and password reset — how
 * an account stays reachable — with message pings and emailed documents. It also promised egress
 * control it could not deliver, since gating the enqueue leaves already-queued mail to send. A narrower
 * notification-only flag may return once that design exists; keeping the column would have preserved a
 * decision nobody had earned. See `docs/DESIGN-system-panel-2026-08-21.md`.
 *
 * ⚑ AND ITS PROVENANCE ROWS GO WITH IT. An earlier draft kept them, reasoning they were harmless data
 * about a flag that no longer exists. That is the wrong instinct for an audit table: a row saying who
 * turned on a flag the system does not have is not harmless, it is junk that a future reader has to
 * work out how to disbelieve. Deliberately retaining provenance for a removed flag also contradicts
 * what the column means — a record of a decision about something real (operator review, 2026-08-22).
 * There are none to delete in practice, which is exactly why doing it now is free.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "system_settings_flag_changes" WHERE "flag" = 'outboundEmail';
  ALTER TABLE "system_settings" DROP COLUMN "features_outbound_email";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" ADD COLUMN "features_outbound_email" boolean DEFAULT true;`)
}
