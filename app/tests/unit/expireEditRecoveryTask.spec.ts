/**
 * The expiry task's WIRING, not its behaviour — `editRecoveryExpiry.int.spec.ts` owns what a pass
 * does. This file exists because of a specific defect: the task was registered in `payload.config.ts`
 * and had no `schedule`, so nothing ever queued it. Registration teaches the job system that a task
 * exists; it neither queues nor runs it. Captures would have expired only if an operator manually
 * queued the task — a retention policy that silently never runs.
 *
 * Pure config assertions, so this stays in the DB-free unit suite.
 */
import { describe, expect, it } from 'vitest'

import {
  EXPIRE_EDIT_RECOVERY_CRON,
  EXPIRE_EDIT_RECOVERY_SLUG,
  expireEditRecoveryTask,
} from '../../src/jobs/expireEditRecovery'

describe('expireEditRecovery task wiring', () => {
  it('carries a schedule — registration alone would never run it', () => {
    expect(expireEditRecoveryTask.schedule, 'no schedule ⇒ nothing ever queues this').toBeDefined()
    expect(expireEditRecoveryTask.schedule).toHaveLength(1)
    expect(expireEditRecoveryTask.schedule?.[0]).toMatchObject({
      cron: EXPIRE_EDIT_RECOVERY_CRON,
      // Must match the queue the config's `autoRun` entry drains, or it is scheduled into a queue
      // nothing processes — the same silent failure one layer along.
      queue: 'default',
    })
  })

  it('uses a six-field cron, matching the autoRun convention', () => {
    expect(EXPIRE_EDIT_RECOVERY_CRON.trim().split(/\s+/), 'seconds field included').toHaveLength(6)
  })

  it('is registered in the Payload config', async () => {
    const config = (await import('../../src/payload.config')).default
    const resolved = await config
    const slugs = (resolved.jobs?.tasks ?? []).map((t) => t.slug)
    expect(slugs).toContain(EXPIRE_EDIT_RECOVERY_SLUG)
  })
})
