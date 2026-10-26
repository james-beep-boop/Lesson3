/**
 * Wire-level authorization for Payload's GENERATED job-statistics global (`payload-jobs-stats`).
 *
 * ⚑ WHY THIS FILE EXISTS. The global is not in `payload.config.ts`: Payload adds it during
 * sanitization whenever a task has a `schedule`, with any-signed-in-user read AND write. The
 * 2026-06-23 jobs lockdown predates it and could not see it. The 2026-10-24 audit (F-C22-001,
 * confirmed at runtime) found that a baseline Teacher could overwrite the scheduler's metadata and
 * stop the `default` job queue — exports, emailed exports, password-reset emails, draft expiry.
 * The fix is `access/generatedSurfaces.ts`; this file proves it at the wire.
 *
 * As in systemSettings.http.spec.ts, the assertion that matters is the SITE ADMINISTRATOR's refusal:
 * the scheduler is the only writer (operator decision D2, 2026-10-24), and a hand edit can break the
 * queue exactly as the defect did. That the scheduler itself still writes is
 * tests/int/jobStatsScheduling.int.spec.ts.
 *
 * The probe writes a harmless marker key only, never a scheduling value, and removes it on the
 * trusted path if a write ever lands (the red-before run against an unfixed build).
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, over the real
 * network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, MARK, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'
import { JOB_STATS_GLOBAL_SLUG } from '../../src/access/generatedSurfaces.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

/**
 * ⚑ FIXTURE KEY IS NOT A USER TYPE. `editor` is the key `setupRoleFixture` uses; the user it names is a
 * **Teacher with editing access** (CLAUDE.md, SPEC §8). Test names are prose, so they use the label.
 */
const LABEL: Record<'subjectAdmin' | 'editor' | 'teacher', string> = {
  subjectAdmin: 'Subject Administrator',
  editor: 'Teacher with editing access',
  teacher: 'Teacher',
}

let fx: RoleFixture
const token: Record<string, string> = {}
const PROBE_KEY = 'l3WireProbe'
const marker = `${MARK}job-stats-probe`

type StatsDoc = { stats?: Record<string, unknown> | null }

/** Read on the trusted path, so the assertion cannot be fooled by the read gate under test. */
async function storedStats(): Promise<Record<string, unknown>> {
  const doc = (await fx.payload.findGlobal({
    slug: JOB_STATS_GLOBAL_SLUG,
    depth: 0,
    overrideAccess: true,
  })) as StatsDoc
  return doc.stats ?? {}
}

/** Remove the marker if a write ever landed. The scheduler's own keys are left exactly as found. */
async function removeMarkerIfPresent(): Promise<void> {
  const stats = await storedStats()
  if (!(PROBE_KEY in stats)) return
  const { [PROBE_KEY]: _removed, ...rest } = stats
  await fx.payload.updateGlobal({
    slug: JOB_STATS_GLOBAL_SLUG,
    data: { stats: rest } as never,
    overrideAccess: true,
  })
}

/**
 * ⚑ THE WRITE VERB IS `POST`. Payload routes a global update as POST; PATCH and PUT are unrouted (404),
 * so a PATCH-based test would "pass" while proving nothing (see systemSettings.http.spec.ts).
 */
async function request(method: 'GET' | 'POST', as?: RoleKey): Promise<{ status: number }> {
  const authToken = as ? token[as] : undefined
  if (as && !authToken) throw new Error(`no token for ${as} — fixture login did not complete`)

  const res = await fetch(url(`/api/globals/${JOB_STATS_GLOBAL_SLUG}`), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `JWT ${authToken}` } : {}),
    },
    ...(method === 'GET'
      ? {}
      : { body: JSON.stringify({ stats: { ...(await storedStats()), [PROBE_KEY]: marker } }) }),
  })
  return { status: res.status }
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens: string[] = []
  for (const k of ROLES) tokens.push(await login(fx.users[k].email, fx.password))
  ROLES.forEach((k, i) => (token[k] = tokens[i]!))
})

afterAll(async () => {
  if (fx) await removeMarkerIfPresent()
  await fx?.teardown()
})

describe('job statistics — no API writes, by anyone', () => {
  // The scheduler rewrites its own keys every autoRun tick, so "unchanged" is asserted on the probe
  // key alone; comparing whole snapshots would race the cron.
  it('refuses a Site Administrator writing the global, and nothing lands', async () => {
    try {
      const res = await request('POST', 'siteAdmin')
      expect(res.status, 'the scheduler is the only writer, Site Administrators included').toBe(403)
      expect(await storedStats(), 'the refused write must not have landed').not.toHaveProperty(
        PROBE_KEY,
      )
    } finally {
      await removeMarkerIfPresent()
    }
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${LABEL[role]} writing the global, and nothing lands`, async () => {
      try {
        expect((await request('POST', role)).status).toBe(403)
        expect(await storedStats()).not.toHaveProperty(PROBE_KEY)
      } finally {
        await removeMarkerIfPresent()
      }
    })
  }

  it('refuses an unauthenticated write', async () => {
    // 401 or 403 depending on how Payload frames an anonymous denial; ⚑ NOT 404, which would mean the
    // verb is unrouted and the test is probing nothing.
    try {
      expect([401, 403]).toContain((await request('POST')).status)
      expect(await storedStats()).not.toHaveProperty(PROBE_KEY)
    } finally {
      await removeMarkerIfPresent()
    }
  })
})

describe('job statistics — reads are Site-Admin-only', () => {
  it('lets a Site Administrator read it', async () => {
    expect((await request('GET', 'siteAdmin')).status).toBe(200)
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${LABEL[role]} reading it`, async () => {
      expect((await request('GET', role)).status).toBe(403)
    })
  }

  it('refuses an unauthenticated read', async () => {
    expect([401, 403]).toContain((await request('GET')).status)
  })
})
