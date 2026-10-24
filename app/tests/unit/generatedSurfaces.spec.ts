/**
 * Access on surfaces Payload GENERATES (access/generatedSurfaces.ts) — DB-free.
 *
 * The job-statistics global never appears in `payload.config.ts`; Payload adds it during sanitization
 * with any-signed-in-user read AND write (audit F-C22-001, 2026-10-24). These assertions run against
 * the BUILT config, the object every consumer receives, so they fail the moment the post-build policy
 * is unwired, the slug moves in a Payload upgrade, or a role gains a write. The wire-level proof is
 * tests/http/jobStatsGlobal.http.spec.ts; that the scheduler still writes is
 * tests/int/jobStatsScheduling.int.spec.ts.
 */
import { describe, expect, it } from 'vitest'
import type { SanitizedConfig } from 'payload'

import {
  JOB_STATS_GLOBAL_SLUG,
  applyGeneratedSurfacePolicy,
  noApiWrites,
} from '../../src/access/generatedSurfaces'
import { siteAdminOnly } from '../../src/access'

// Synthetic users, one per user type plus the editing-access capability (SPEC §8).
const ACTORS = {
  anonymous: null,
  teacher: { id: 1, roles: [], assignments: [] },
  'teacher with editing access': {
    id: 2,
    roles: [],
    assignments: [{ subjectGrade: 10, role: 'editor' }],
  },
  'subject-grade administrator': {
    id: 3,
    roles: [],
    assignments: [{ subjectGrade: 10, role: 'subjectAdmin' }],
  },
  'site administrator': { id: 4, roles: ['siteAdmin'], assignments: [] },
} as const

type AccessFn = (args: { req: { user: unknown } }) => unknown
const call = (fn: unknown, user: unknown) => (fn as AccessFn)({ req: { user } })

// Importing the whole Payload config takes ~1–2 s and has crossed vitest's 5 s default under parallel
// load (see expireEditRecoveryTask.spec.ts), hence the longer timeout.
const builtJobStats = async () => {
  const config = await (await import('../../src/payload.config')).default
  return config.globals.find((global) => global.slug === JOB_STATS_GLOBAL_SLUG)
}

describe('job-statistics global on the built config', () => {
  it('still exists under the expected slug', { timeout: 30_000 }, async () => {
    expect(
      await builtJobStats(),
      'missing ⇒ a Payload upgrade renamed it; boot would refuse',
    ).toBeDefined()
  })

  it('refuses every API write, Site Administrator included', { timeout: 30_000 }, async () => {
    const global = await builtJobStats()
    expect(global?.access.update).toBe(noApiWrites)
    for (const [label, user] of Object.entries(ACTORS)) {
      expect(call(global?.access.update, user), `${label} must not write`).toBe(false)
    }
  })

  it('is readable by Site Administrators only', { timeout: 30_000 }, async () => {
    const global = await builtJobStats()
    expect(global?.access.read).toBe(siteAdminOnly)
    for (const [label, user] of Object.entries(ACTORS)) {
      expect(call(global?.access.read, user), `${label} read`).toBe(label === 'site administrator')
    }
  })
})

describe('applyGeneratedSurfacePolicy', () => {
  const fakeConfig = (
    globals: { slug: string; access: Record<string, unknown> }[],
    scheduling = true,
  ) => ({ globals, jobs: { scheduling } }) as unknown as SanitizedConfig

  it('fails closed when scheduling is on but the global is missing', () => {
    expect(() => applyGeneratedSurfacePolicy(fakeConfig([]))).toThrow(JOB_STATS_GLOBAL_SLUG)
  })

  it('is a no-op when nothing is scheduled (Payload generates no global then)', () => {
    const config = fakeConfig([], false)
    expect(applyGeneratedSurfacePolicy(config)).toBe(config)
  })

  it('is idempotent and leaves unrelated globals alone', () => {
    const other = { slug: 'system-settings', access: { read: siteAdminOnly } }
    const config = fakeConfig([{ slug: JOB_STATS_GLOBAL_SLUG, access: {} }, other])
    applyGeneratedSurfacePolicy(applyGeneratedSurfacePolicy(config))
    expect(config.globals[0].access).toMatchObject({ read: siteAdminOnly, update: noApiWrites })
    expect(other.access).toEqual({ read: siteAdminOnly })
  })
})
