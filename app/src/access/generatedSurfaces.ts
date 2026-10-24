/**
 * ACCESS FOR SURFACES PAYLOAD GENERATES ITSELF — globals and collections that never appear in
 * `payload.config.ts` because Payload adds them during config sanitization. They inherit Payload's
 * `defaultAccess` (any signed-in user may read AND write), so a lockdown written next to our own
 * collections silently misses them. Plan: `docs/PLAN-job-stats-global-access-2026-10-24.md`;
 * decisions: DECISIONS 2026-10-24 "Job-statistics global closed to API writes".
 *
 * ⚑ WHY THIS RUNS ON THE *BUILT* CONFIG. Payload offers no override for these surfaces (the jobs
 * collection has `jobsCollectionOverrides`; the statistics global has nothing), and plugins run BEFORE
 * sanitization, so they cannot see what sanitization adds. `payload.config.ts` therefore applies this to
 * the resolved `buildConfig(...)` promise, which every consumer imports through `@payload-config` (the
 * API route, the admin, scripts, the Payload CLI). `payload.globals.config` holds `config.globals` by
 * reference, so mutating the resolved entries reaches all of them. Do NOT move this into `onInit`: by
 * then request handling may already hold derived config.
 *
 * ⚑ FAIL CLOSED. If a surface we expect is missing, a Payload upgrade has probably renamed it, and a
 * silent no-op would reopen exactly the hole this file closes. Boot refuses instead; the unit spec
 * (`tests/unit/generatedSurfaces.spec.ts`) catches it in CI first.
 *
 * NOT A POLICY ENGINE: one explicit, named assignment per surface, no slug-pattern matching. Add a
 * surface here only with its own decision and wire test.
 */
import type { Access, SanitizedConfig } from 'payload'

import { siteAdminOnly } from './index'
import {
  LOCKED_DOCUMENTS_SLUG,
  lockCreate,
  lockDelete,
  lockRead,
  lockUpdate,
} from './lockedDocuments'

/**
 * Payload's job-statistics global (installed `payload/dist/queues/config/global.js`). Payload does
 * not export the slug, so it is named here; the unit spec proves it still exists in the built config.
 */
export const JOB_STATS_GLOBAL_SLUG = 'payload-jobs-stats'

/**
 * Nobody writes the job statistics over the API — Site Administrators included (operator decision D2,
 * 2026-10-24). The scheduler is the only writer and uses `payload.db.*`, which never consults access;
 * a hand edit can stop the job queue exactly as the defect did.
 */
export const noApiWrites: Access = () => false

export const applyGeneratedSurfacePolicy = (config: SanitizedConfig): SanitizedConfig => {
  applyLockedDocumentsPolicy(config)
  const jobStats = config.globals.find((global) => global.slug === JOB_STATS_GLOBAL_SLUG)
  if (!jobStats) {
    // Payload only generates the global when some task has a `schedule` (expireEditRecovery does).
    if (config.jobs?.scheduling) {
      throw new Error(
        `Payload no longer generates the '${JOB_STATS_GLOBAL_SLUG}' global, but scheduled jobs are ` +
          'configured. A Payload upgrade has probably renamed it: find the new job-statistics global ' +
          'and update src/access/generatedSurfaces.ts before booting.',
      )
    }
    return config
  }
  jobStats.access = {
    ...jobStats.access,
    // D1: Site Administrators only, matching who may read job rows.
    read: siteAdminOnly,
    update: noApiWrites,
  }
  return config
}

/**
 * Payload's native editing-lock collection (audit F-C22-002). The rules and their reasons live in
 * access/lockedDocuments.ts. Payload generates the collection whenever anything is lockable, and four
 * collections are, so a missing one means a rename, not "nothing to lock".
 */
const applyLockedDocumentsPolicy = (config: SanitizedConfig): void => {
  const locks = config.collections.find((collection) => collection.slug === LOCKED_DOCUMENTS_SLUG)
  if (!locks) {
    throw new Error(
      `Payload no longer generates the '${LOCKED_DOCUMENTS_SLUG}' collection, but documents are ` +
        'lockable. A Payload upgrade has probably renamed it: find the new lock collection and update ' +
        'src/access/generatedSurfaces.ts before booting.',
    )
  }
  locks.access = {
    ...locks.access,
    create: lockCreate,
    read: lockRead,
    update: lockUpdate,
    delete: lockDelete,
  }
}
