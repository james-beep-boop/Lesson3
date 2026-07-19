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
 * Non-blocking by design: when all slots are taken, `runWithConversionSlot` returns `null` immediately
 * (the caller returns a 503) rather than queueing, so waiters can't themselves pile up and hold request
 * slots. The acquire/release pairing lives HERE, not in callers, so a slot can never leak.
 */
import { positiveIntEnv } from './env'

const maxConcurrent = (): number => positiveIntEnv('PREVIEW_PDF_MAX_CONCURRENT', 2)

let active = 0

/**
 * Run `fn` while holding one of the limited conversion slots, releasing it on completion OR throw.
 * Returns `fn`'s result, or `null` when every slot is already taken (the caller should surface a 503).
 * Owning the try/finally here means no call site can forget to release. `async` by design so the future
 * cross-instance (Postgres-lease) bound is a change to this module alone, not to every call site.
 */
export async function runWithConversionSlot<T>(fn: () => Promise<T>): Promise<T | null> {
  if (active >= maxConcurrent()) return null
  active++
  try {
    return await fn()
  } finally {
    active--
  }
}
