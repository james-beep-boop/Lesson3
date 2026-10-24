/**
 * The scheduler still writes its statistics after the API is closed (access/generatedSurfaces.ts).
 *
 * The job-statistics global now refuses every API write (audit F-C22-001, 2026-10-24). That is safe
 * only because Payload's scheduler reads and writes it through `payload.db.*`, which never consults
 * access — verified in installed Payload 3.91.0 (`handleSchedules/index.js`,
 * `defaultAfterSchedule.js`). This pins that invariant: if a future Payload routes the write through
 * access checks, scheduling would silently stop and 30-day draft expiry with it. Nothing else would
 * notice.
 *
 * The in-process autoRun cron may tick during this test and write the same row, so assertions compare
 * against a timestamp taken before the call rather than exact values.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { JOB_STATS_GLOBAL_SLUG } from '../../src/access/generatedSurfaces.js'
import { EXPIRE_EDIT_RECOVERY_SLUG } from '../../src/jobs/expireEditRecovery.js'

let payload: Payload
let jobIdsBefore: Set<string | number>

type Stats = {
  stats?: {
    scheduledRuns?: {
      queues?: Record<string, { tasks?: Record<string, { lastScheduledRun?: string }> }>
    }
  }
}

const expiryJobIds = async () => {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: EXPIRE_EDIT_RECOVERY_SLUG } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

beforeAll(async () => {
  payload = await getPayload({ config })
  jobIdsBefore = new Set((await expiryJobIds()).map((job) => job.id))
})

afterAll(async () => {
  // Remove only what this file queued; the cron re-queues the daily run on its next tick anyway.
  for (const job of await expiryJobIds()) {
    if (!jobIdsBefore.has(job.id) && !job.completedAt && !job.processing) {
      await payload.delete({ collection: 'payload-jobs', id: job.id, overrideAccess: true })
    }
  }
})

describe('job-statistics global stays writable by the scheduler', () => {
  it('handleSchedules records the expiry run and keeps one scheduled expiry job', async () => {
    const before = Date.now()

    await payload.jobs.handleSchedules({ queue: 'default' })

    const stats = (await payload.findGlobal({
      slug: JOB_STATS_GLOBAL_SLUG,
      overrideAccess: true,
    })) as Stats
    const recorded =
      stats.stats?.scheduledRuns?.queues?.default?.tasks?.[EXPIRE_EDIT_RECOVERY_SLUG]
        ?.lastScheduledRun
    expect(recorded, 'the scheduler must still write its statistics').toBeDefined()
    // Second resolution: allow for the database round-trip truncating milliseconds.
    expect(new Date(recorded as string).getTime()).toBeGreaterThanOrEqual(before - 1000)

    // Either this call queued the daily run or one was already pending (Payload's default guard skips
    // a second). Both are correct; what must never happen is no pending scheduled expiry at all.
    const pending = (await expiryJobIds()).filter(
      (job) =>
        !job.completedAt && !job.hasError && (job.meta as { scheduled?: boolean })?.scheduled,
    )
    expect(pending.length, 'exactly one pending scheduled expiry run').toBe(1)
  })
})
