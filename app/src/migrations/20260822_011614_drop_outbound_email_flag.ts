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
 * ⚑ NO `flagChanges` CLEANUP. The provenance rows are keyed by flag NAME, so a stale
 * `flag = 'outboundEmail'` row would be harmless data about a flag that no longer exists — and there
 * are none anywhere to clean. `SYSTEM_FLAGS` no longer lists it, so the hook cannot write another.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" DROP COLUMN "features_outbound_email";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" ADD COLUMN "features_outbound_email" boolean DEFAULT true;`)
}
