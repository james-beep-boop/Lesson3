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

import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'

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

beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const key of ROLES) token[key] = await login(fx.users[key].email, fx.password)
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
    // The preview shell is locked down: no scripts, no external loads.
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
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

  it('a stray jobId cannot probe an unrelated version → 404', async () => {
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${fx.version.id}/export/status?jobId=999999999&format=standard&as=docx`),
      { headers: auth('teacher') },
    )
    expect(res.status).toBe(404)
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
