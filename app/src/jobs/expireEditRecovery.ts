/**
 * `expireEditRecovery` task — the 30-day pass over unsaved-work captures (SPEC §5; design §4).
 *
 * A Payload job rather than SQL in `scripts/prune-db.sh`, and that is a design requirement rather
 * than a preference: expiry is one of retirement's FOUR CALLERS, and they must share one transition.
 * A second implementation in a shell script would be free to drift from what "retired" means, and
 * nothing would notice until a capture was destroyed differently from how the endpoints destroy one.
 *
 * TRUST: a system path with no user. It runs with no transaction — each row is retired independently,
 * so one conflicting row cannot roll back the rest — which is why `retire` does not demand one for
 * this caller.
 */
import type { TaskConfig } from 'payload'

import { CAPTURE_TTL_DAYS, EXPIRY_BATCH_LIMIT, expireCaptures } from '../lib/editRecovery/kernel'
import { captureException } from '../lib/errorTracking'

export const EXPIRE_EDIT_RECOVERY_SLUG = 'expireEditRecovery' as const

export const expireEditRecoveryTask: TaskConfig<{
  input: { ttlDays?: number; limit?: number }
  output: { retired: number; skipped: number }
}> = {
  slug: EXPIRE_EDIT_RECOVERY_SLUG,
  handler: async ({ input, req }) => {
    const ttlDays = input?.ttlDays ?? CAPTURE_TTL_DAYS
    const cutoff = new Date(Date.now() - ttlDays * 86_400_000)
    try {
      const report = await expireCaptures(req, {
        cutoff,
        limit: input?.limit ?? EXPIRY_BATCH_LIMIT,
      })
      return { output: report }
    } catch (err) {
      // A failed pass must not be silent: the next run would simply try again, so an operator would
      // never learn that captures stopped expiring.
      captureException(err, { task: EXPIRE_EDIT_RECOVERY_SLUG, cutoff: cutoff.toISOString() })
      throw err
    }
  },
}
