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

import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'

const BASE = (process.env.E2E_BASE_URL ?? 'http://app:3000').replace(/\/$/, '')
const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}

const url = (path: string) => (path.startsWith('http') ? path : `${BASE}${path}`)
const auth = (key?: RoleKey): Record<string, string> =>
  key && token[key] ? { Authorization: `JWT ${token[key]}` } : {}

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

/** Full read-gated export handshake for one format/kind → returns the downloaded zip bytes. */
async function exportZip(versionId: number | string, key: RoleKey, as: 'docx' | 'pdf'): Promise<Buffer> {
  const exportUrl = `/api/lesson-bundle-versions/${versionId}/export?format=standard&as=${as}`

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
  const exportUrl = () => `/api/lesson-bundle-versions/${fx.version.id}/export?format=standard&as=docx`

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
      url(`/api/lesson-bundle-versions/${cold.id}/export/status?jobId=999999999&format=standard&as=docx`),
      { headers: auth('teacher') },
    )
    expect(res.status).toBe(404)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: cold.id, overrideAccess: true })
  })

  it('a repeated cold prepare coalesces onto the same in-flight job (dedupe)', async () => {
    // Cold throwaway version → POST prepare twice back-to-back. The second must coalesce onto the first
    // job (same {versionId, format, kind}) rather than enqueue a duplicate. autoRun cron is every 3s,
    // so both calls land inside the pending window and return the SAME jobId.
    const cold = await makeColdVersion('dedupe', '8.1.0')
    const prepare = () =>
      fetch(url(`/api/lesson-bundle-versions/${cold.id}/export?format=standard&as=docx`), {
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

  it('?deleteSource=true atomically deletes a NON-Official source', async () => {
    // A throwaway candidate to edit-from; saving with deleteSource should create the new one AND remove
    // this source in one request.
    const cand = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '7.1.0',
        title: `${MARK}del-src`,
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

    const res = await fetch(url(`/api/lesson-bundle-versions/${vB.id}/make-official?deletePrevious=true`), {
      method: 'POST',
      headers: auth('subjectAdmin'),
    })
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

  it('Editor cannot make-official → 4xx', async () => {
    const res = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/make-official`), {
      method: 'POST',
      headers: auth('editor'),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})
