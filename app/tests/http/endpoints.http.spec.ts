/**
 * Endpoint / authorization e2e (production-hardening backlog #6/#4) — drives the REAL HTTP surface of
 * a RUNNING app against the live database, complementing the Local-API `tests/int` suite (which
 * exercises access functions + hooks in-process but never the wire). This proves the things only an
 * over-the-network test can:
 *
 *   - GraphQL is gone (backlog #7 regression): `POST /api/graphql` + `GET /api/graphql-playground` 404.
 *   - The preview/export endpoints enforce auth (401), READ gating, and the harder EDIT gate on the
 *     unsaved-preview POST (SPEC §5/§9).
 *   - Export is read-gated with NO published/Official gate — a Teacher can export any retained version
 *     end-to-end (POST prepare → poll status → GET zip), for DOCX and PDF (Gotenberg).
 *   - The Bucket-A server invariants reject over HTTP too (create-with-pointer ⓪, clear-pointer #2).
 *
 * HOW IT RUNS (Rock only — needs the running app + a DB; see DECISIONS 2026-06-28):
 *   - Seeds the shared role fixture via the Local API into the SAME DB the app serves (`--env-file
 *     .env` → live `lesson3`; MARK-tagged + self-cleaning, exactly like the verify-* scripts).
 *   - Talks to the app at `E2E_BASE_URL` (default `http://app:3000`, the compose service) and
 *     authenticates with the login token via `Authorization: JWT …` (token auth → no CSRF dance).
 *   - Run in the deps image on `--network lesson3_default`:
 *       docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
 *         -w /app --env-file .env -e E2E_BASE_URL=http://app:3000 lesson3-deps npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'

const BASE = (process.env.E2E_BASE_URL ?? 'http://app:3000').replace(/\/$/, '')
const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}

const url = (path: string) => (path.startsWith('http') ? path : `${BASE}${path}`)
const auth = (key?: RoleKey): Record<string, string> =>
  key && token[key] ? { Authorization: `JWT ${token[key]}` } : {}

/** Raw drizzle handle on the same DB the app serves — to observe the `rate_limit_counters` table. */
const drizzle = () =>
  (fx.payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: unknown[] }> } })
    .drizzle

/** The current count for a rate-limit `bucket_key`, or 0 when the row was never created. */
async function rateCount(bucketKey: string): Promise<number> {
  const res = await drizzle().execute(
    sql`SELECT "count" FROM "rate_limit_counters" WHERE "bucket_key" = ${bucketKey};`,
  )
  const rows = res.rows as Array<{ count: number | string }>
  return rows.length > 0 ? Number(rows[0].count) : 0
}

/** Log in over HTTP and return the JWT (Payload's REST login returns it in the body). */
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(url('/api/users/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status}) for ${email}`)
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`login returned no token for ${email}`)
  return body.token
}

/** Poll an export status URL until the artifact is ready (or fail loudly). */
async function pollExportReady(statusUrl: string, key: RoleKey, timeoutMs = 150_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const res = await fetch(url(statusUrl), { headers: auth(key) })
    const body = (await res.json().catch(() => ({}))) as { state?: string; message?: string }
    if (body.state === 'ready') return
    if (body.state === 'error') throw new Error(`export job errored (${res.status}): ${body.message}`)
    if (Date.now() > deadline) throw new Error(`export not ready within ${timeoutMs}ms (last: ${body.state})`)
    await new Promise((r) => setTimeout(r, 1500))
  }
}

/** Full read-gated export handshake for one deliverable kind → returns the downloaded zip bytes. */
async function exportZip(versionId: number | string, key: RoleKey, as: 'docx' | 'pdf'): Promise<Buffer> {
  const exportUrl = `/api/lesson-bundle-versions/${versionId}/export?as=${as}`

  // Cold GET (never prepared) is serve-only and must NOT enqueue → 409.
  const cold = await fetch(url(exportUrl), { headers: auth(key) })
  expect(cold.status).toBe(409)

  // POST prepare: warm → 200 {ready}; cold → 202 + a status URL to poll.
  const prep = await fetch(url(exportUrl), { method: 'POST', headers: auth(key) })
  expect([200, 202]).toContain(prep.status)
  if (prep.status === 202) {
    const { statusUrl } = (await prep.json()) as { statusUrl: string }
    await pollExportReady(statusUrl, key)
  }

  // GET serve now warm → the zip.
  const dl = await fetch(url(exportUrl), { headers: auth(key) })
  expect(dl.status).toBe(200)
  expect(dl.headers.get('content-type')).toBe('application/zip')
  const buf = Buffer.from(await dl.arrayBuffer())
  expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // zip magic
  return buf
}

/** Create a cold (uncached) throwaway version under the fixture plan, for tests needing a not-yet-
 *  exported version. Caller deletes it (overrideAccess). */
const makeColdVersion = (tag: string, semver: string) =>
  fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}${tag}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  }) as Promise<{ id: number }>

beforeAll(async () => {
  fx = await setupRoleFixture()
  // Independent logins → run concurrently (one HTTP round-trip each).
  const tokens = await Promise.all(ROLES.map((key) => login(fx.users[key].email, fx.password)))
  ROLES.forEach((key, i) => (token[key] = tokens[i]))
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('GraphQL disabled (backlog #7 regression)', () => {
  it('POST /api/graphql → 404', async () => {
    const res = await fetch(url('/api/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    })
    expect(res.status).toBe(404)
  })

  it('GET /api/graphql-playground → 404', async () => {
    const res = await fetch(url('/api/graphql-playground'))
    expect(res.status).toBe(404)
  })
})

describe('Preview endpoint (SPEC §5)', () => {
  const previewUrl = () => `/api/lesson-bundle-versions/${fx.version.id}/preview`

  it('GET without auth → 401', async () => {
    const res = await fetch(url(previewUrl()))
    expect(res.status).toBe(401)
  })

  it('Teacher GET (READ-gated) → 200 script-free HTML', async () => {
    const res = await fetch(url(previewUrl()), { headers: auth('teacher') })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    // CSP posture: next.config excludes the preview path from its baseline CSP rule (negative-lookahead
    // source), so the endpoint's OWN strict standalone CSP survives to the client (item ③, curl-verified
    // on the Rock 2026-06-28). Assert the strict directives ARE present and the baseline `object-src`
    // CSP did NOT clobber them.
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('object-src') // baseline CSP no longer overrides the preview
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const html = await res.text()
    expect(html).toContain('Content preview')
  })

  it('Teacher POST unsaved-preview → 404 (EDIT-gated, not just read)', async () => {
    const form = new FormData()
    form.set('data', JSON.stringify({ lessons: (fx.version as any).lessons ?? [] }))
    const res = await fetch(url(previewUrl()), { method: 'POST', headers: auth('teacher'), body: form })
    expect(res.status).toBe(404)
  })

  it('Editor POST unsaved-preview with a prose overlay → 200 (shows the edit)', async () => {
    const lessons = ((fx.version as any).lessons ?? []).map((l: any, i: number) =>
      i === 0 ? { ...l, overview: `${MARK}PREVIEW-OVERLAY` } : l,
    )
    const form = new FormData()
    form.set('data', JSON.stringify({ lessons }))
    const res = await fetch(url(previewUrl()), { method: 'POST', headers: auth('editor'), body: form })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('unsaved edits')
    expect(html).toContain(`${MARK}PREVIEW-OVERLAY`)
  })

  it('Editor POST unsaved-preview with a STRUCTURAL change → 422', async () => {
    const lessons = [...((fx.version as any).lessons ?? [])]
    lessons.push({ ...lessons[0], id: undefined, title: `${MARK}extra-row` }) // cardinality change
    const form = new FormData()
    form.set('data', JSON.stringify({ lessons }))
    const res = await fetch(url(previewUrl()), { method: 'POST', headers: auth('editor'), body: form })
    expect(res.status).toBe(422)
  })
})

describe('Export endpoint (SPEC §9) — read-gated, no Official/published gate', () => {
  const exportUrl = () => `/api/lesson-bundle-versions/${fx.version.id}/export?as=docx`

  it('POST prepare without auth → 401', async () => {
    const res = await fetch(url(exportUrl()), { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('a Teacher (read-only role) can export DOCX end-to-end → zip', async () => {
    const zip = await exportZip(fx.version.id, 'teacher', 'docx')
    expect(zip.length).toBeGreaterThan(0)
  })

  it('a Teacher can export PDF end-to-end → zip (Gotenberg)', async () => {
    const zip = await exportZip(fx.version.id, 'teacher', 'pdf')
    expect(zip.length).toBeGreaterThan(0)
  })

  it('a stray jobId 404s on a not-ready version (binding has teeth when uncached)', async () => {
    // Contract: status readiness is version/spec-scoped, so a warm version returns {ready} for any
    // jobId by design (the caller holds READ; the job row may be pruned). The jobId binding therefore
    // only has teeth when NOT ready — so probe a COLD throwaway version: a bogus jobId must 404.
    const cold = await makeColdVersion('cold-status', '8.0.0')
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${cold.id}/export/status?jobId=999999999&as=docx`),
      { headers: auth('teacher') },
    )
    expect(res.status).toBe(404)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: cold.id, overrideAccess: true })
  })

  it('a repeated cold prepare coalesces onto the same in-flight job (dedupe)', async () => {
    // Cold throwaway version → POST prepare twice back-to-back. The second must coalesce onto the first
    // job (same {versionId, kind}) rather than enqueue a duplicate. autoRun cron is every 3s,
    // so both calls land inside the pending window and return the SAME jobId.
    const cold = await makeColdVersion('dedupe', '8.1.0')
    const prepare = () =>
      fetch(url(`/api/lesson-bundle-versions/${cold.id}/export?as=docx`), {
        method: 'POST',
        headers: auth('teacher'),
      }).then((r) => r.json() as Promise<{ state: string; jobId?: string | number }>)
    const a = await prepare()
    const b = await prepare()
    expect(a.state).toBe('preparing')
    expect(b.state).toBe('preparing')
    expect(String(b.jobId)).toBe(String(a.jobId))
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: cold.id, overrideAccess: true })
  })
})

describe('Bucket-A server invariants over HTTP', () => {
  it('⓪ authenticated CREATE with an officialVersion pointer → rejected (4xx)', async () => {
    const res = await fetch(url('/api/lesson-plans'), {
      method: 'POST',
      headers: { ...auth('siteAdmin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${MARK}http-create-guard`,
        subjectGrade: fx.subjectGrade.id,
        officialVersion: fx.version.id,
      }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    // Nothing should have persisted — the create was rejected before save.
    const { totalDocs } = await fx.payload.count({
      collection: 'lesson-plans',
      where: { title: { equals: `${MARK}http-create-guard` } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('#2 authenticated UPDATE clearing the officialVersion pointer → rejected (4xx)', async () => {
    const res = await fetch(url(`/api/lesson-plans/${fx.plan.id}`), {
      method: 'PATCH',
      headers: { ...auth('siteAdmin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ officialVersion: null }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    // Pointer untouched.
    const plan = await fx.payload.findByID({ collection: 'lesson-plans', id: fx.plan.id, depth: 0 })
    expect(plan.officialVersion).toBeTruthy()
  })
})

describe('save-as-new (Stage 2 versioning) — POST /:id/save-as-new', () => {
  const saveUrl = () => `/api/lesson-bundle-versions/${fx.version.id}/save-as-new`
  const dataForm = (content: unknown): FormData => {
    const f = new FormData()
    f.set('data', JSON.stringify(content))
    return f
  }

  it('Editor saves a new candidate — Official pointer unchanged, source unchanged', async () => {
    const before = await fx.payload.findByID({ collection: 'lesson-plans', id: fx.plan.id, depth: 0 })
    const lessons = ((fx.version as any).lessons ?? []).map((l: any, i: number) =>
      i === 0 ? { ...l, overview: `${MARK}SAVED-AS-NEW` } : l,
    )
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any), lessons }),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number; sourceId: number; sourceIsOfficial: boolean }
    expect(String(out.sourceId)).toBe(String(fx.version.id))
    expect(out.sourceIsOfficial).toBe(true) // fx.version is the plan's Official

    // Official pointer did NOT move; the new candidate carries the prose edit + sourceVersion.
    const after = await fx.payload.findByID({ collection: 'lesson-plans', id: fx.plan.id, depth: 0 })
    expect(String(after.officialVersion)).toBe(String(before.officialVersion))
    const created = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: out.id,
      depth: 0,
    })) as any
    expect(created.lessons[0].overview).toBe(`${MARK}SAVED-AS-NEW`)
    expect(String(created.sourceVersion)).toBe(String(fx.version.id))

    // The source version is untouched (immutable snapshot).
    const src = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: fx.version.id,
      depth: 0,
    })) as any
    expect(src.lessons[0].overview).not.toBe(`${MARK}SAVED-AS-NEW`)

    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })

  it('Teacher cannot save-as-new → 4xx', async () => {
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('teacher'),
      body: dataForm({ lessons: (fx.version as any).lessons ?? [] }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it("Editor's structural change is rejected (prose-only field-split) → 4xx", async () => {
    const lessons = [...((fx.version as any).lessons ?? [])]
    lessons.push({ ...lessons[0], id: undefined, title: `${MARK}extra-row` }) // cardinality change
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any), lessons }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it('stale base updatedAt → 409 (source changed since opened)', async () => {
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any), updatedAt: '2000-01-01T00:00:00.000Z' }),
    })
    expect(res.status).toBe(409)
  })

  it('?deleteSource=true atomically deletes a NON-Official source the editor AUTHORED', async () => {
    // A throwaway candidate the editor authored (author stamped at creation); saving with deleteSource
    // should create the new one AND remove this source in one request.
    const cand = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '7.1.0',
        title: `${MARK}del-src`,
        author: fx.users.editor.id,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number }
    const candDoc = await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: cand.id, depth: 0 })
    const res = await fetch(url(`/api/lesson-bundle-versions/${cand.id}/save-as-new?deleteSource=true`), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm(candDoc),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number; sourceDeleted: boolean }
    expect(out.sourceDeleted).toBe(true)
    const gone = await fx.payload.find({
      collection: 'lesson-bundle-versions',
      where: { id: { equals: cand.id } },
      overrideAccess: true,
    })
    expect(gone.totalDocs).toBe(0)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })

  it('?deleteSource=true is skipped for a source the editor did NOT author (kept)', async () => {
    // Authorship delete scope (IA redesign 2026-07-01): an AUTHORLESS candidate (pre-authorship /
    // system-created) is admin-only-deletable, so an Editor's deleteSource is skipped — the save still
    // succeeds and the source stays. The NEW version carries the caller's authorship stamp.
    const cand = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '7.2.0',
        title: `${MARK}del-src-unowned`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number }
    const candDoc = await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: cand.id, depth: 0 })
    const res = await fetch(url(`/api/lesson-bundle-versions/${cand.id}/save-as-new?deleteSource=true`), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm(candDoc),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number; sourceDeleted: boolean }
    expect(out.sourceDeleted).toBe(false)
    const still = await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: cand.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(still).toBeTruthy()
    const created = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: out.id,
      depth: 0,
      overrideAccess: true,
    })) as { author?: unknown }
    expect(Number(created.author)).toBe(fx.users.editor.id)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: cand.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })

  it('?deleteSource=true is ignored for the Official source (kept)', async () => {
    const res = await fetch(url(`${saveUrl()}?deleteSource=true`), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any) }),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number; sourceIsOfficial: boolean; sourceDeleted: boolean }
    expect(out.sourceIsOfficial).toBe(true)
    expect(out.sourceDeleted).toBe(false)
    const still = await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: fx.version.id, depth: 0 })
    expect(still).toBeTruthy()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })
})

describe('make-official (Stage 2b) — POST /:id/make-official', () => {
  it('?deletePrevious=true moves the pointer and atomically deletes the previous Official', async () => {
    // Self-contained throwaway plan + two versions, so the fixture plan's pointer is untouched.
    const p = (await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}mo-plan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })) as { id: number }
    const mk = (semver: string, tag: string) =>
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: p.id,
          subjectGrade: fx.subjectGrade.id,
          semver,
          title: `${MARK}${tag}`,
          ...minimalBundleContent(),
        } as never,
        overrideAccess: true,
      }) as Promise<{ id: number }>
    const vA = await mk('1.0.0', 'mo-A')
    const vB = await mk('1.0.1', 'mo-B')
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: vA.id } as never,
      overrideAccess: true,
    })

    const res = await fetch(
      url(
        `/api/lesson-bundle-versions/${vB.id}/make-official?deletePrevious=true&expectedPreviousOfficialId=${vA.id}`,
      ),
      { method: 'POST', headers: auth('subjectAdmin') },
    )
    expect(res.status).toBe(200)
    const out = (await res.json()) as { officialVersion: number; previousDeleted: boolean }
    expect(String(out.officialVersion)).toBe(String(vB.id))
    expect(out.previousDeleted).toBe(true)

    const goneA = await fx.payload.find({
      collection: 'lesson-bundle-versions',
      where: { id: { equals: vA.id } },
      overrideAccess: true,
    })
    expect(goneA.totalDocs).toBe(0)
    const plan = await fx.payload.findByID({ collection: 'lesson-plans', id: p.id, depth: 0 })
    expect(String(plan.officialVersion)).toBe(String(vB.id))

    // cleanup
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: null } as never,
      overrideAccess: true,
    })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: vB.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-plans', id: p.id, overrideAccess: true })
  })

  it('deletePrevious WITHOUT expectedPreviousOfficialId → 400 (guard is mandatory, not client-optional)', async () => {
    // Codex round-2 #1: server-side safety must not depend on the React client — a direct API caller
    // omitting the consent token is rejected before anything happens.
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${fx.version.id}/make-official?deletePrevious=true`),
      { method: 'POST', headers: auth('subjectAdmin') },
    )
    expect(res.status).toBe(400)
  })

  it('deletePrevious with a STALE expectedPreviousOfficialId → 409, nothing changes', async () => {
    // Stale-consent guard (Codex 2026-07-01 #2): the caller consented to delete the version that was
    // Official when their page rendered. If the pointer moved meanwhile, the request must 409 and
    // delete nothing — atomically (the pointer move rolls back too).
    const p = (await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}mo-stale-plan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })) as { id: number }
    const mk = (semver: string, tag: string) =>
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: p.id,
          subjectGrade: fx.subjectGrade.id,
          semver,
          title: `${MARK}${tag}`,
          ...minimalBundleContent(),
        } as never,
        overrideAccess: true,
      }) as Promise<{ id: number }>
    const vA = await mk('1.0.0', 'mo-stale-A')
    const vB = await mk('1.0.1', 'mo-stale-B')
    // The plan's Official is vA — but the caller's page rendered when it was (supposedly) vB.
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: vA.id } as never,
      overrideAccess: true,
    })

    const res = await fetch(
      url(
        `/api/lesson-bundle-versions/${vB.id}/make-official?deletePrevious=true&expectedPreviousOfficialId=${vB.id}`,
      ),
      { method: 'POST', headers: auth('subjectAdmin') },
    )
    expect(res.status).toBe(409)

    // Nothing changed: pointer still vA, and vA still exists.
    const plan = await fx.payload.findByID({ collection: 'lesson-plans', id: p.id, depth: 0 })
    expect(String(plan.officialVersion)).toBe(String(vA.id))
    const stillA = await fx.payload.find({
      collection: 'lesson-bundle-versions',
      where: { id: { equals: vA.id } },
      overrideAccess: true,
    })
    expect(stillA.totalDocs).toBe(1)

    // cleanup
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: null } as never,
      overrideAccess: true,
    })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: vB.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: vA.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-plans', id: p.id, overrideAccess: true })
  })

  it('Editor cannot make-official → 4xx', async () => {
    const res = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/make-official`), {
      method: 'POST',
      headers: auth('editor'),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('editor assignment endpoints — POST /users/:id/{assign,unassign}-editor', () => {
  // Codex round-2 #2: the Manage Editors widget writes through these narrow, freshness-guarded
  // endpoints instead of a full-array PATCH — a stale page can no longer overwrite a concurrent
  // admin's role change. `expectedUpdatedAt` is REQUIRED; the server applies a one-row delta to
  // the FRESH user row.
  const freshUpdatedAt = async (id: number) =>
    String(
      ((await fx.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })) as {
        updatedAt: string
      }).updatedAt,
    )

  const call = (
    mode: 'assign' | 'unassign',
    userId: number,
    body: Record<string, unknown>,
    as: RoleKey = 'subjectAdmin',
  ) =>
    fetch(url(`/api/users/${userId}/${mode}-editor`), {
      method: 'POST',
      headers: { ...auth(as), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('assign → unassign round-trip with fresh tokens; stale + missing tokens rejected', async () => {
    const teacherId = fx.users.teacher.id
    const sgId = fx.subjectGrade.id

    // Missing expectedUpdatedAt → 400 (mandatory, like make-official's consent token).
    const missing = await call('assign', teacherId, { subjectGradeId: sgId })
    expect(missing.status).toBe(400)

    // Fresh token → assigned.
    const t0 = await freshUpdatedAt(teacherId)
    const ok = await call('assign', teacherId, { subjectGradeId: sgId, expectedUpdatedAt: t0 })
    expect(ok.status).toBe(200)
    const after = (await fx.payload.findByID({
      collection: 'users',
      id: teacherId,
      depth: 0,
      overrideAccess: true,
    })) as { assignments?: { role: string }[] }
    expect((after.assignments ?? []).some((a) => a.role === 'editor')).toBe(true)

    // The OLD token is now stale → 409 (a page rendered before the change cannot mutate roles).
    const stale = await call('unassign', teacherId, { subjectGradeId: sgId, expectedUpdatedAt: t0 })
    expect(stale.status).toBe(409)

    // Fresh token → unassigned (back to Teacher; fixture state restored).
    const t1 = await freshUpdatedAt(teacherId)
    const undo = await call('unassign', teacherId, { subjectGradeId: sgId, expectedUpdatedAt: t1 })
    expect(undo.status).toBe(200)
    const restored = (await fx.payload.findByID({
      collection: 'users',
      id: teacherId,
      depth: 0,
      overrideAccess: true,
    })) as { assignments?: unknown[] }
    expect(restored.assignments ?? []).toHaveLength(0)
  })

  it('a Site Admin target is untouchable by a Subject Admin → 4xx (roles are hidden from them)', async () => {
    // Codex round-3 #2 over the wire: even with a perfectly fresh token, assigning an Editor row to
    // a Site Admin is rejected server-side (enforceAssignmentScope), and nothing changes.
    const t = await freshUpdatedAt(fx.users.siteAdmin.id)
    const res = await call('assign', fx.users.siteAdmin.id, {
      subjectGradeId: fx.subjectGrade.id,
      expectedUpdatedAt: t,
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const unchanged = (await fx.payload.findByID({
      collection: 'users',
      id: fx.users.siteAdmin.id,
      depth: 0,
      overrideAccess: true,
    })) as { assignments?: unknown[] }
    expect(unchanged.assignments ?? []).toHaveLength(0)
  })

  it('a non-admin (Editor) cannot grant roles → 4xx', async () => {
    const t = await freshUpdatedAt(fx.users.teacher.id)
    const res = await call(
      'assign',
      fx.users.teacher.id,
      { subjectGradeId: fx.subjectGrade.id, expectedUpdatedAt: t },
      'editor',
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    // And nothing changed.
    const unchanged = (await fx.payload.findByID({
      collection: 'users',
      id: fx.users.teacher.id,
      depth: 0,
      overrideAccess: true,
    })) as { assignments?: unknown[] }
    expect(unchanged.assignments ?? []).toHaveLength(0)
  })
})

describe('email-a-doc (SPEC §10) — POST /:id/email', () => {
  // Read the daily budget the way the limiter does, so the exhaustion test tracks env overrides.
  const EMAIL_MAX = Number(process.env.RATE_LIMIT_EMAIL_MAX) || 10
  const emailUrl = (versionId: number | string) =>
    `/api/lesson-bundle-versions/${versionId}/email?as=docx`
  const post = (versionId: number | string, key: RoleKey | undefined, body: unknown) =>
    fetch(url(emailUrl(versionId)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(key) },
      body: JSON.stringify(body),
    })

  it('without auth → 401', async () => {
    const res = await post(fx.version.id, undefined, { to: 'someone@example.com' })
    expect(res.status).toBe(401)
  })

  it('missing / invalid recipient → 400, nothing queued', async () => {
    expect((await post(fx.version.id, 'teacher', {})).status).toBe(400)
    expect((await post(fx.version.id, 'teacher', { to: 'not-an-email' })).status).toBe(400)
    expect(
      (await post(fx.version.id, 'teacher', { to: 'a@example.com\nBcc: x@example.com' })).status,
    ).toBe(400)
  })

  it('unknown version → 404 (read gate), nothing queued', async () => {
    const res = await post(999_999_999, 'teacher', { to: 'someone@example.com' })
    expect(res.status).toBe(404)
  })

  it('an unauthorized email does NOT spend the shared recipient cap (authorize before pooled caps)', async () => {
    // Codex audit 2026-07-03 #1: the version is authorized (READ gate) BEFORE the pooled
    // emailRecipient/emailGlobal caps are charged, so a probe against a version the caller can't
    // read (here: unknown → 404) must not burn another recipient's daily quota. The recipient is
    // unique to this test, so its counter reflects ONLY this request.
    const to = `${MARK.toLowerCase()}authz-probe@example.com`
    const key = `emailRecipient:${to.toLowerCase()}`
    expect(await rateCount(key)).toBe(0) // untouched before…
    expect((await post(999_999_999, 'teacher', { to })).status).toBe(404)
    expect(await rateCount(key)).toBe(0) // …and still untouched: the 404 spent no shared budget.
  })

  it('Teacher emails a version → 202 {queued} and the job is enqueued', async () => {
    // RFC 2606-reserved recipient: on the Rock the send goes to example.com's blackhole; in CI
    // (no SMTP_HOST) the console adapter logs it. The contract under test is queue-and-202.
    const to = 'mailbox@example.com'
    const res = await post(fx.version.id, 'teacher', { to })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { state?: string; to?: string }
    expect(body.state).toBe('queued')
    expect(body.to).toBe(to)

    // The enqueue is real: an emailVersionArtifact job row exists for this recipient (completed
    // rows are retained — see payload.config jobs notes). input is a JSON column → match in-memory.
    const { docs } = await fx.payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'emailVersionArtifact' } },
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
    const mine = docs.find((j) => (j.input as { to?: string } | undefined)?.to === to)
    expect(mine).toBeTruthy()
  })

  it('the per-user DAILY cap → 429 with Retry-After (invalid bodies spend budget too)', async () => {
    // Run as the Editor (fresh per-run fixture user, so the bucket starts empty) and post INVALID
    // bodies: the limiter is checked before validation, so budget is spent without ever enqueuing
    // a job or sending mail — probing is not free, and this test emits nothing.
    for (let i = 0; i < EMAIL_MAX; i++) {
      expect((await post(fx.version.id, 'editor', {})).status).toBe(400)
    }
    const blocked = await post(fx.version.id, 'editor', {})
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
  })
})

describe('messaging (SPEC §10 PR ③) — POST /api/messages (Payload default REST)', () => {
  // Fixture users' emails are @example.com (RFC 2606 blackhole), so the content-free ping a create
  // may enqueue is safe on a live stack — same posture as the email-a-doc send test above. The
  // full hook matrix (zero-unread gate, ping budget, sender cap, cascades) is int-covered; this
  // block proves the WIRE contract: auth, stamping, private reads, and the closed update/delete.
  const post = (key: RoleKey | undefined, body: unknown) =>
    fetch(url('/api/messages'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(key) },
      body: JSON.stringify(body),
    })
  let messageId: number

  it('without auth → 403 (Payload default REST maps a denied create to Forbidden)', async () => {
    // Unlike the custom endpoints (which throw an explicit 401), collection REST runs the access
    // function and answers any denial — unauthenticated included — with 403. Either way: no row.
    const res = await post(undefined, { recipient: fx.users.editor.id, body: 'hi' })
    expect(res.status).toBe(403)
  })

  it('missing recipient/body → 400', async () => {
    expect((await post('teacher', { body: 'no recipient' })).status).toBe(400)
    expect((await post('teacher', { recipient: fx.users.editor.id })).status).toBe(400)
  })

  it('create stamps the sender — a spoofed sender id is overridden — and enqueues the ping', async () => {
    const res = await post('teacher', {
      sender: fx.users.editor.id, // hostile: send "as" the editor
      recipient: fx.users.editor.id,
      body: `${MARK}wire-hello`,
    })
    expect(res.status).toBe(201)
    const { doc } = (await res.json()) as { doc: { id: number; sender: number | { id: number } } }
    const senderId = typeof doc.sender === 'object' ? doc.sender.id : doc.sender
    expect(senderId).toBe(fx.users.teacher.id)
    messageId = doc.id

    // First unread for this recipient → the content-free ping job exists (retained row).
    const { docs } = await fx.payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'messagePing' } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    expect(
      docs.some((j) => (j.input as { messageId?: number } | undefined)?.messageId === messageId),
    ).toBe(true)
  })

  it('messages are private over the wire: a non-participant admin sees nothing', async () => {
    const list = await fetch(url('/api/messages'), { headers: auth('siteAdmin') })
    expect(list.status).toBe(200)
    const body = (await list.json()) as { docs: { id: number }[] }
    expect(body.docs.map((d) => d.id)).not.toContain(messageId)

    const byId = await fetch(url(`/api/messages/${messageId}`), { headers: auth('subjectAdmin') })
    expect([403, 404]).toContain(byId.status)
  })

  it('update and delete are closed — even for the participants', async () => {
    const patch = await fetch(url(`/api/messages/${messageId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth('editor') }, // the recipient
      body: JSON.stringify({ readAt: new Date().toISOString() }),
    })
    expect(patch.status).toBe(403)

    const del = await fetch(url(`/api/messages/${messageId}`), {
      method: 'DELETE',
      headers: auth('teacher'), // the sender
    })
    expect(del.status).toBe(403)
  })
})

describe('/messages page (SPEC §10 PR ③) — mark-read is a same-origin-only side effect', () => {
  // Codex audit 2026-07-03 #2: "viewing is reading" marks shown messages read on GET, but a
  // cross-origin navigation must not be able to silently clear a logged-in user's unread state.
  // The page skips the write when `Sec-Fetch-Site: cross-site`. We drive the REAL page render (JWT
  // header auth works for the server component exactly as for the API endpoints) and check the DB.
  const getMessages = async (key: RoleKey, secFetchSite?: string) => {
    const res = await fetch(url('/messages'), {
      headers: { ...auth(key), ...(secFetchSite ? { 'Sec-Fetch-Site': secFetchSite } : {}) },
      redirect: 'manual',
    })
    await res.text().catch(() => {}) // drain the body → the server component (incl. mark-read) finished
    return res
  }
  const readAtOf = async (id: number) =>
    (await fx.payload.findByID({ collection: 'messages', id, depth: 0, overrideAccess: true })).readAt

  it('a cross-site GET leaves unread unread; a same-origin GET marks it read', async () => {
    // Fresh unread to the editor (its own message id, so other inbox state can't confuse the assert).
    const msg = await fx.payload.create({
      collection: 'messages',
      data: { sender: fx.users.teacher.id, recipient: fx.users.editor.id, body: `${MARK}sfs-guard` },
      overrideAccess: false,
      user: fx.users.teacher,
    })
    try {
      // Cross-site render → the guard skips the write.
      expect((await getMessages('editor', 'cross-site')).status).toBe(200)
      expect(await readAtOf(msg.id)).toBeFalsy()

      // Same-origin render → "viewing is reading" marks the shown message read.
      expect((await getMessages('editor', 'same-origin')).status).toBe(200)
      expect(await readAtOf(msg.id)).toBeTruthy()
    } finally {
      await fx.payload.delete({ collection: 'messages', id: msg.id, overrideAccess: true })
    }
  })
})
