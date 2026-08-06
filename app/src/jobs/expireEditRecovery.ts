/**
 * `expireEditRecovery` task — the 30-day pass over unsaved-work captures (SPEC §5; design §4).
 *
 * A Payload job rather than SQL in `scripts/prune-db.sh`, and that is a design requirement rather
 * than a preference: expiry is one of retirement's FOUR CALLERS, and they must share one transition.
 * A second implementation in a shell script would be free to drift from what "retired" means, and
 * nothing would notice until a capture was destroyed differently from how the endpoints destroy one.
 *
 * ⚑ **`schedule` is what makes this RUN.** Registering a task in `payload.config.ts` only teaches the
 * job system that it exists — it neither queues it nor runs it. An earlier version of this file had
 * exactly that shape, so captures would have expired only if an operator manually queued the task: a
 * retention policy that silently never runs, which is the worst way for one to fail. The config's
 * `autoRun` cron handles queued jobs AND configured schedules (`AutorunCronConfig.disableScheduling`
 * defaults to false — verified in installed Payload 3.85.1), so this entry needs no other wiring.
 *
 * Payload's default `beforeSchedule` will not queue a second run while one is queued, running, or
 * retriable, so a slow pass cannot pile up behind itself.
 *
 * ⚑ **No task input, deliberately.** The policy is fixed at 30 days and 500 rows. An earlier version
 * accepted `ttlDays` and `limit`, which was unnecessary and unsafe: a NEGATIVE `ttlDays` yields a
 * cutoff in the FUTURE, and the pass would then retire every active capture in the system — destroying
 * exactly the unsaved work this feature exists to protect. Zero, fractional, and enormous values were
 * all likewise accepted. The queue endpoint is Site-Admin gated but still reachable, so the safest
 * contract is no input at all. The KERNEL still takes an injected cutoff and limit; that is the
 * testing seam, and it is not reachable over the wire.
 *
 * TRUST: a system path with no user. It runs with no transaction — each row is retired independently,
 * so one conflicting row cannot roll back the rest — which is why `retire` does not demand one here.
 */
import type { TaskConfig } from 'payload'

import { CAPTURE_TTL_DAYS, EXPIRY_BATCH_LIMIT, expireCaptures } from '../lib/editRecovery/kernel'
import { captureException } from '../lib/errorTracking'

export const EXPIRE_EDIT_RECOVERY_SLUG = 'expireEditRecovery' as const

/** Daily at 03:15. Six-field cron (leading seconds), matching the autoRun entry's convention. */
export const EXPIRE_EDIT_RECOVERY_CRON = '0 15 3 * * *'

export const expireEditRecoveryTask: TaskConfig<{
  input: Record<string, never>
  output: { retired: number; skipped: number }
}> = {
  slug: EXPIRE_EDIT_RECOVERY_SLUG,
  schedule: [{ cron: EXPIRE_EDIT_RECOVERY_CRON, queue: 'default' }],
  handler: async ({ req }) => {
    const cutoff = new Date(Date.now() - CAPTURE_TTL_DAYS * 86_400_000)
    try {
      const report = await expireCaptures(req, { cutoff, limit: EXPIRY_BATCH_LIMIT })
      return { output: report }
    } catch (err) {
      // A failed pass must not be silent: the next run simply tries again, so without this an
      // operator would never learn that captures had stopped expiring at all.
      captureException(err, { task: EXPIRE_EDIT_RECOVERY_SLUG, cutoff: cutoff.toISOString() })
      throw err
    }
  },
}
