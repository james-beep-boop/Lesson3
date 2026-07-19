/**
 * A tiny non-blocking concurrency bound for SYNCHRONOUS heavy conversions done inside an HTTP request
 * (the editor's unsaved "View as PDF" — `generateDeliverableDocx` → `docxToPdf`/Gotenberg).
 *
 * Why this exists: the export path runs its heavy conversion through Payload's Jobs Queue, which is
 * globally capped (`payload.config.ts` → `jobs.limit`). The unsaved PDF preview cannot use that queue
 * (working-copy bytes are uncacheable and the affordance is a one-shot synchronous open), so without a
 * bound a burst of clicks — even from one Editor — could pin many multi-second LibreOffice conversions
 * and exhaust Node request slots. Per-user rate limiting caps RATE, not CONCURRENCY; this caps
 * concurrency.
 *
 * SCOPE: in-process (per app instance). The Rock runs a single app container, so this is effectively
 * global today; a multi-instance deployment would want a shared (Postgres) bound, like the rate
 * limiter — tracked as a follow-up, not built while there is one instance.
 *
 * Non-blocking by design: `acquire()` returns false immediately when saturated (the caller returns a
 * 503) rather than queueing, so waiters can't themselves pile up and hold request slots.
 */
import { positiveIntEnv } from './env'

const maxConcurrent = (): number => positiveIntEnv('PREVIEW_PDF_MAX_CONCURRENT', 2)

let active = 0

/** Try to take a conversion slot. Returns false (do not proceed) when already at the cap. */
export function acquireConversionSlot(): boolean {
  if (active >= maxConcurrent()) return false
  active++
  return true
}

/** Release a slot taken by `acquireConversionSlot`. Safe to call once per successful acquire. */
export function releaseConversionSlot(): void {
  if (active > 0) active--
}
