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
import type { Where } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import {
  MARK,
  enqueuedKindsFor,
  minimalBundleContent,
  minimalResourceLinks,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { consumeRateLimit } from '../../src/lib/rateLimit.js'
import { RESOURCE_PHASE_KEYS } from '../../src/ingest/resourceLinks.js'
import { stripIds } from '../../src/lib/stripIds.js'

const BASE = (process.env.E2E_BASE_URL ?? 'http://app:3000').replace(/\/$/, '')
const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

type HttpResourceLinkRow = Record<string, unknown> & {
  id?: string | number
  fallback_search_url: string
}
type HttpLesson = Record<string, unknown> & {
  id?: string | number
  title?: string
  resourceLinks: HttpResourceLinkRow[]
}
type HttpVersion = Record<string, unknown> & { lessons?: HttpLesson[] }

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
/** POST prepare (+ poll if cold) until the (version, kind) export is ready to serve. */
async function prepareExport(versionId: number | string, key: RoleKey, as: 'docx' | 'pdf'): Promise<void> {
  const prep = await fetch(url(`/api/lesson-bundle-versions/${versionId}/export?as=${as}`), {
    method: 'POST',
    headers: auth(key),
  })
  expect([200, 202]).toContain(prep.status)
  if (prep.status === 202) {
    const { statusUrl } = (await prep.json()) as { statusUrl: string }
    await pollExportReady(statusUrl, key)
  }
}

async function exportZip(versionId: number | string, key: RoleKey, as: 'docx' | 'pdf'): Promise<Buffer> {
  const exportUrl = `/api/lesson-bundle-versions/${versionId}/export?as=${as}`

  // Cold GET (never prepared) is serve-only and must NOT enqueue → 409.
  const cold = await fetch(url(exportUrl), { headers: auth(key) })
  expect(cold.status).toBe(409)

  await prepareExport(versionId, key, as)

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

describe('Document CSP (Phase 5 A3 — per-request nonce via middleware)', () => {
  it('GET /login → strict nonce CSP; the nonce reaches the rendered scripts; fresh per request', async () => {
    const res = await fetch(url('/login'))
    expect(res.status).toBe(200)
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).toContain("object-src 'none'") // old baseline directives carried over
    expect(csp).not.toContain('unsafe-eval') // dev-only allowance must never ship
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeTruthy()
    // Next's renderer must pick the nonce up from the forwarded request header and stamp it onto
    // its inline/framework scripts — a CSP whose nonce never reaches the <script> tags would block
    // hydration everywhere.
    expect(await res.text()).toContain(nonce!)

    const res2 = await fetch(url('/login'))
    const nonce2 = /'nonce-([^']+)'/.exec(res2.headers.get('content-security-policy') ?? '')?.[1]
    expect(nonce2).toBeTruthy()
    expect(nonce2).not.toBe(nonce) // a static nonce is no nonce at all
  })

  it('the admin surface carries the same strict CSP (authenticated document request)', async () => {
    const res = await fetch(url('/admin'), { redirect: 'manual', headers: auth('siteAdmin') })
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("'strict-dynamic'")
  })

  it('…and on the unauthenticated /admin response (redirect or shell — still a document)', async () => {
    const res = await fetch(url('/admin'), { redirect: 'manual' })
    // Whatever the shell answers without auth (redirect to login / unauthorized view), the
    // middleware must have stamped the document policy on that response.
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("'strict-dynamic'")
  })

  it('API routes carry no middleware CSP (documents only; preview keeps its own strict one)', async () => {
    const res = await fetch(url('/api/users/me'))
    expect(res.headers.get('content-security-policy')).toBeNull()
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

describe('Preview-as-PDF endpoint (SPEC §5/§9) — same gate as unsaved preview, per-document PDF', () => {
  const pdfUrl = (doc = 'lessonSequence') =>
    `/api/lesson-bundle-versions/${fx.version.id}/preview-pdf?doc=${doc}`
  // POST the given lessons overlay as an Editor; return the raw Response.
  const postOverlay = (lessons: unknown, doc = 'lessonSequence') => {
    const form = new FormData()
    form.set('data', JSON.stringify({ lessons }))
    return fetch(url(pdfUrl(doc)), { method: 'POST', headers: auth('editor'), body: form })
  }

  it('POST without auth → 401', async () => {
    const res = await fetch(url(pdfUrl()), { method: 'POST', body: new FormData() })
    expect(res.status).toBe(401)
  })

  it('Editor POST with a missing/invalid ?doc → 400', async () => {
    const res = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/preview-pdf`), {
      method: 'POST',
      headers: auth('editor'),
      body: new FormData(),
    })
    expect(res.status).toBe(400)
  })

  it('Teacher POST → 404 (EDIT-gated, not just read)', async () => {
    const form = new FormData()
    form.set('data', JSON.stringify({ lessons: (fx.version as any).lessons ?? [] }))
    const res = await fetch(url(pdfUrl()), { method: 'POST', headers: auth('teacher'), body: form })
    expect(res.status).toBe(404)
  })

  it('Editor POST for a deliverable the plan lacks (no Final Explanation) → 404', async () => {
    const res = await postOverlay((fx.version as any).lessons ?? [], 'finalExplanation')
    expect(res.status).toBe(404)
  })

  it('Editor POST with a STRUCTURAL change → 422 (field boundary)', async () => {
    const lessons = [...((fx.version as any).lessons ?? [])]
    lessons.push({ ...lessons[0], id: undefined, title: `${MARK}extra-row` }) // cardinality change
    const res = await postOverlay(lessons)
    expect(res.status).toBe(422)
  })

  it('Editor POST with a prose overlay → 200 inline PDF (Gotenberg)', async () => {
    const lessons = ((fx.version as any).lessons ?? []).map((l: any, i: number) =>
      i === 0 ? { ...l, overview: `${MARK}PDF-OVERLAY` } : l,
    )
    const res = await postOverlay(lessons)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('inline')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(0)
    // A real PDF starts with the %PDF- magic bytes — proves Gotenberg produced a document.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('the UNSAVED edit actually reaches the PDF (more text in → a larger PDF)', async () => {
    // The central promise: the endpoint renders the SUBMITTED working copy, not the stored version.
    // Proven WITHOUT a PDF text-extraction dependency by comparing byte LENGTHS: a small overlay vs a
    // large, low-redundancy overlay (distinct tokens resist compression). PDF metadata timestamps are
    // length-stable, so a substantial text difference dominates the size — if the endpoint ignored the
    // form both would be the same size. (A byte-inequality check would be unsound: LibreOffice may
    // stamp a per-conversion CreationDate, so two PDFs can differ without any content difference.)
    const overlay = (text: string) =>
      ((fx.version as any).lessons ?? []).map((l: any, i: number) =>
        i === 0 ? { ...l, overview: text } : l,
      )
    const bigText = Array.from({ length: 1200 }, (_, i) => `token${i}`).join(' ')
    const [small, big] = await Promise.all([
      postOverlay(overlay(`${MARK}x`)),
      postOverlay(overlay(bigText)),
    ])
    expect(small.status).toBe(200)
    expect(big.status).toBe(200)
    const [sLen, bLen] = [
      (await small.arrayBuffer()).byteLength,
      (await big.arrayBuffer()).byteLength,
    ]
    // ~1200 distinct tokens (~8 KB of text) must enlarge the PDF well beyond any timestamp jitter.
    expect(bLen).toBeGreaterThan(sLen + 2000)
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

  it("a DOCX job's id cannot report status for a PDF poll (kind-scoped binding)", async () => {
    // The kinds are separate jobs/cache specs — polling status with a mismatched `as` must 404
    // rather than echo the other kind's state (Codex 2026-07-08 P2). Cold throwaway version:
    // enqueue a DOCX job, then poll its jobId with as=pdf (pdf is NOT ready → binding has teeth).
    const cold = await makeColdVersion('kind-bind', '8.4.0')
    const prep = await fetch(url(`/api/lesson-bundle-versions/${cold.id}/export?as=docx`), {
      method: 'POST',
      headers: auth('teacher'),
    })
    expect(prep.status).toBe(202)
    const { jobId } = (await prep.json()) as { jobId: string | number }
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${cold.id}/export/status?jobId=${jobId}&as=pdf`),
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

describe('per-document export (teacher-first T1) — GET /:id/export/doc', () => {
  const docUrl = (id: number | string, doc: string, as: 'docx' | 'pdf') =>
    `/api/lesson-bundle-versions/${id}/export/doc?doc=${doc}&as=${as}`

  it('401 without auth', async () => {
    const res = await fetch(url(docUrl(fx.version.id, 'lessonSequence', 'docx')))
    expect(res.status).toBe(401)
  })

  it('400 on an unknown doc tag', async () => {
    const res = await fetch(url(docUrl(fx.version.id, 'notADoc', 'docx')), { headers: auth('teacher') })
    expect(res.status).toBe(400)
  })

  it('404 on a nonexistent version (read gate)', async () => {
    const res = await fetch(url(docUrl(999999999, 'lessonSequence', 'docx')), { headers: auth('teacher') })
    expect(res.status).toBe(404)
  })

  it('409 cold — serve-only, never generates', async () => {
    const cold = await makeColdVersion('doc-cold', '8.2.0')
    const res = await fetch(url(docUrl(cold.id, 'lessonSequence', 'docx')), { headers: auth('teacher') })
    expect(res.status).toBe(409)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: cold.id, overrideAccess: true })
  })

  it('a Teacher gets a warm DOCX deliverable → attachment', async () => {
    await prepareExport(fx.version.id, 'teacher', 'docx')
    const res = await fetch(url(docUrl(fx.version.id, 'lessonSequence', 'docx')), { headers: auth('teacher') })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition.startsWith('attachment; filename="')).toBe(true)
    expect(disposition.endsWith('.docx"')).toBe(true)
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // docx = zip container magic
  })

  it('a Teacher gets a warm PDF deliverable → INLINE (opens in the browser)', async () => {
    await prepareExport(fx.version.id, 'teacher', 'pdf')
    const res = await fetch(url(docUrl(fx.version.id, 'lessonSequence', 'pdf')), { headers: auth('teacher') })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition.startsWith('inline; filename="')).toBe(true)
    expect(disposition.endsWith('.pdf"')).toBe(true)
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('404 when the version has no such deliverable (fixture has no Final Explanation)', async () => {
    await prepareExport(fx.version.id, 'teacher', 'docx')
    const res = await fetch(url(docUrl(fx.version.id, 'finalExplanation', 'docx')), { headers: auth('teacher') })
    expect(res.status).toBe(404)
  })

  it('make-official pre-warms BOTH kinds (jobs committed with the promotion)', async () => {
    const cold = await makeColdVersion('doc-prewarm', '8.3.0')
    const promote = await fetch(
      url(`/api/lesson-bundle-versions/${cold.id}/make-official?deletePrevious=false`),
      { method: 'POST', headers: auth('subjectAdmin') },
    )
    expect(promote.status).toBe(200)
    expect(await enqueuedKindsFor(fx.payload, cold.id)).toEqual(new Set(['docx', 'pdf']))

    // Restore the fixture Official, then drop the throwaway (deletable only once non-Official).
    const restore = await fetch(
      url(`/api/lesson-bundle-versions/${fx.version.id}/make-official?deletePrevious=false`),
      { method: 'POST', headers: auth('subjectAdmin') },
    )
    expect(restore.status).toBe(200)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: cold.id, overrideAccess: true })
  })
})

describe('Version create/duplicate denied over HTTP (edit-view cleanup 2026-07-18)', () => {
  // The version editor's "Create New" + "Duplicate" removal is enforced server-side, not just hidden:
  // `lessonBundleVersionCreate → () => false` refuses a direct REST create (versions are born only via
  // system paths — ingest/re-ingest/save-as-new, all overrideAccess), and `disableDuplicate` blocks the
  // duplicate action from all APIs. Pin both over the wire, as the highest-privilege caller.
  it('authenticated REST create of a version → rejected (4xx), nothing persisted', async () => {
    const title = `${MARK}http-version-create`
    const res = await fetch(url('/api/lesson-bundle-versions'), {
      method: 'POST',
      headers: { ...auth('siteAdmin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        title,
        ...minimalBundleContent(),
      }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const { totalDocs } = await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { title: { equals: title } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('REST duplicate of a version → rejected (disableDuplicate), no new row', async () => {
    const before = await fx.payload.count({ collection: 'lesson-bundle-versions', overrideAccess: true })
    const res = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/duplicate`), {
      method: 'POST',
      headers: { ...auth('siteAdmin'), 'Content-Type': 'application/json' },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const after = await fx.payload.count({ collection: 'lesson-bundle-versions', overrideAccess: true })
    expect(after.totalDocs).toBe(before.totalDocs)
  })
})

describe('Lesson-plan create denied over HTTP (audit 2026-07-20, L3-04)', () => {
  // `lessonPlanCreate → () => false`. A plan is born ONLY from ingest (plan → 1.0.0 → Official
  // pointer, one transaction, Local API where overrideAccess defaults to true). Before this, a
  // Subject Admin could POST an in-scope plan WITHOUT `officialVersion` — legitimately absent at
  // create — and mint permanently unusable rows: invisible in the library (it lists via the Official
  // version), unrepairable (caller version-create is denied), and undeletable by them
  // (`lessonPlanDelete` is Site-Admin-only). Pinned for BOTH privileged roles: the Subject Admin is
  // the actual reported vector, the Site Admin proves the deny is unconditional rather than scoped.
  for (const role of ['siteAdmin', 'subjectAdmin'] as const) {
    it(`${role} REST create of a bare lesson-plan → rejected (4xx), nothing persisted`, async () => {
      const title = `${MARK}http-plan-create-${role}`
      const res = await fetch(url('/api/lesson-plans'), {
        method: 'POST',
        headers: { ...auth(role), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, subjectGrade: fx.subjectGrade.id }),
      })
      // Pin 403 exactly (L3-R3): the submitted plan is VALID, so the only reason to reject it is the
      // access deny. A broad 4xx would also be satisfied by an unrelated future validation error,
      // silently turning this authorization test into a false positive.
      expect(res.status).toBe(403)
      const { totalDocs } = await fx.payload.count({
        collection: 'lesson-plans',
        where: { title: { equals: title } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)
    })
  }

  // The one real risk of this change — that the deny also blocks INGEST — is already covered by the
  // Site-Admin upload test in the "Upload endpoint (SPEC §7)" block below, which creates a plan end
  // to end and would fail outright if the gate applied. Ingest runs on the Local API, where
  // `overrideAccess` defaults to true, so it bypasses this gate exactly as version creation already
  // does under its own `() => false`. Not duplicated here (an extra upload is slow in CI).
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
  // A minimal REAL prose edit (editor-editable key), for tests whose subject is something other
  // than the content — since the no-op guard (2026-07-17), posting a doc back unchanged is 400.
  const withProseEdit = (doc: unknown) => {
    const d = doc as { lessons?: { overview?: string }[] }
    return {
      ...(d as object),
      lessons: (d.lessons ?? []).map((l, i) =>
        i === 0 ? { ...l, overview: `${l.overview ?? ''} ${MARK}prose-edit` } : l,
      ),
    }
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

  it('no-op save (identical content) → 400, no new version minted (2026-07-17 guard)', async () => {
    // The exact working-copy round-trip: the client opens the version and Saves without editing.
    // The endpoint must refuse (400) and create NOTHING — identical snapshots are pointless rows.
    const before = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any) }),
    })
    expect(res.status).toBe(400)
    const after = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    expect(after.totalDocs).toBe(before.totalDocs)

    // Same for an admin (the field-split passes admin content through unchanged — the guard must
    // fire on that path too, not just on the editor prose-overlay path).
    const resAdmin = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('subjectAdmin'),
      body: dataForm({ ...(fx.version as any) }),
    })
    expect(resAdmin.status).toBe(400)
    const afterAdmin = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    expect(afterAdmin.totalDocs).toBe(before.totalDocs)
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

  it('Subject Admin adds a duplicated lesson row with server-preserved resource links', async () => {
    const version = fx.version as unknown as HttpVersion
    const sourceLesson = structuredClone(version.lessons![0]!)
    const duplicatedLesson = {
      ...sourceLesson,
      id: undefined,
      title: `${MARK}duplicated-lesson`,
      // Payload may assign client-side ids while duplicating nested rows. They are not provenance;
      // the server compares values without ids and restores the stored source rows.
      resourceLinks: sourceLesson.resourceLinks.map((row, index) => ({
        ...row,
        id: `client-copy-${index}`,
      })),
    }
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('subjectAdmin'),
      body: dataForm({
        ...version,
        lessons: [...(version.lessons ?? []), duplicatedLesson],
      }),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number }
    const created = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: out.id,
      depth: 0,
    })) as unknown as HttpVersion
    const added = created.lessons?.at(-1)
    expect(added?.title).toBe(`${MARK}duplicated-lesson`)
    expect(stripIds(added?.resourceLinks)).toEqual(stripIds(sourceLesson.resourceLinks))
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })

  it('Subject Admin cannot invent resource links for a new lesson row', async () => {
    const version = fx.version as unknown as HttpVersion
    const sourceLesson = structuredClone(version.lessons![0]!)
    sourceLesson.id = undefined
    sourceLesson.title = `${MARK}forged-resource-lesson`
    sourceLesson.resourceLinks[0].fallback_search_url = 'https://example.org/invented'
    const before = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('subjectAdmin'),
      body: dataForm({
        ...version,
        lessons: [...(version.lessons ?? []), sourceLesson],
      }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const after = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it("Subject Admin's META identity edit is silently preserved (Site-Admin-only repair fields)", async () => {
    // subject / grade / substrand_id are corruption-repair data (decided 2026-07-05): the split
    // restores them from the source; the rest of META (titleDoc here) stays Subject-Admin-editable.
    const srcMeta = (fx.version as any).meta ?? {}
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('subjectAdmin'),
      body: dataForm({
        ...(fx.version as any),
        meta: {
          ...srcMeta,
          subject: 'Chemistry',
          grade: 12,
          substrand_id: `${MARK}wrong-key`,
          titleDoc: `${MARK}ADMIN-TITLEDOC`,
        },
      }),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number }
    const created = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: out.id,
      depth: 0,
    })) as any
    expect(created.meta.subject).toBe(srcMeta.subject) // preserved
    expect(created.meta.grade).toBe(srcMeta.grade) // preserved
    expect(created.meta.substrand_id).toBe(srcMeta.substrand_id) // preserved (re-ingest key)
    expect(created.meta.titleDoc).toBe(`${MARK}ADMIN-TITLEDOC`) // legitimate META edit kept
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })

  it('Site Admin CAN change META identity (the corruption-repair path)', async () => {
    const srcMeta = (fx.version as any).meta ?? {}
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('siteAdmin'),
      body: dataForm({
        ...(fx.version as any),
        meta: { ...srcMeta, subject: `${MARK}Repaired`, grade: 7 },
      }),
    })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { id: number }
    const created = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: out.id,
      depth: 0,
    })) as any
    expect(created.meta.subject).toBe(`${MARK}Repaired`)
    expect(created.meta.grade).toBe(7)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: out.id, overrideAccess: true })
  })

  it('stale base updatedAt → 409 (source changed since opened)', async () => {
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any), updatedAt: '2000-01-01T00:00:00.000Z' }),
    })
    expect(res.status).toBe(409)
  })

  it('forged FUTURE base updatedAt → 409 (must equal the source, not just be >=)', async () => {
    // A base timestamp newer than the source is not evidence of a fresh load — it can only come from
    // a stale/forged client. The guard is exact equality, so a "2999" timestamp cannot slip past the
    // reload-before-branching contract.
    const res = await fetch(url(saveUrl()), {
      method: 'POST',
      headers: auth('editor'),
      body: dataForm({ ...(fx.version as any), updatedAt: '2999-01-01T00:00:00.000Z' }),
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
      body: dataForm(withProseEdit(candDoc)),
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
      body: dataForm(withProseEdit(candDoc)),
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
      body: dataForm(withProseEdit({ ...(fx.version as any) })),
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

describe('open self-registration (2026-07-09) — POST /api/users', () => {
  // example.com blackhole (RFC 2606), same idiom as the fixture users: with auth.verify on, every
  // REST signup here sends a REAL verification email on a live stack — a fake TLD could be
  // rejected at the relay and fail the create itself.
  const signupEmail = (tag: string) => `${MARK.toLowerCase()}${tag}-signup@example.com`
  const signupName = (tag: string) => `${MARK}signup-${tag}`
  const post = (body: Record<string, unknown>) =>
    fetch(url('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const login = (email: string, password: string) =>
    fetch(url('/api/users/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  /** The emailed single-use token, read server-side (hidden field → showHiddenFields). */
  const tokenOf = async (email: string) => {
    const { docs } = await fx.payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    return (docs[0] as { _verificationToken?: string | null } | undefined)?._verificationToken
  }

  afterAll(async () => {
    await fx.payload.delete({
      collection: 'users',
      where: { name: { like: `${MARK}signup-` } },
      overrideAccess: true,
    })
  })

  it('an anonymous visitor can register; hostile roles/assignments/_verified are STRIPPED', async () => {
    const email = signupEmail('a')
    const res = await post({
      name: signupName('a'),
      email,
      password: 'signup-pass-1',
      // Hostile payload: privilege smuggling must strip at the field create gates —
      // _verified included, or verification is self-service (auth.verify, 2026-07-09).
      roles: ['siteAdmin'],
      assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin' }],
      _verified: true,
    })
    expect([200, 201]).toContain(res.status)

    const { docs } = await fx.payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      depth: 0,
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0].roles ?? []).toEqual([])
    expect(docs[0].assignments ?? []).toEqual([])
    expect(docs[0]._verified ?? false).toBe(false) // the smuggled flag stripped
  })

  it('login before verification → 403 (UnverifiedEmail)', async () => {
    const res = await login(signupEmail('a'), 'signup-pass-1')
    expect(res.status).toBe(403)
    const body = (await res.json()) as { errors?: { message?: string }[] }
    expect(body.errors?.[0]?.message ?? '').toMatch(/verify your email/i)
  })

  it('a bogus verification token → 403, account stays unverified', async () => {
    const res = await fetch(url('/api/users/verify/not-a-real-token'), { method: 'POST' })
    expect(res.status).toBe(403)
    expect((await login(signupEmail('a'), 'signup-pass-1')).status).toBe(403)
  })

  it('verifying with the emailed token unlocks login as a plain Teacher', async () => {
    const email = signupEmail('a')
    const token = await tokenOf(email)
    expect(token).toBeTruthy()
    const verify = await fetch(url(`/api/users/verify/${token}`), { method: 'POST' })
    expect(verify.status).toBe(200)

    const res = await login(email, 'signup-pass-1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token?: string; user?: { roles?: string[] } }
    expect(body.token).toBeTruthy()
    expect(body.user?.roles ?? []).toEqual([])
  })

  it('over the site-global budget the verify endpoint 429s — proof the throttled custom endpoint SHADOWS the native one', async () => {
    // Payload's native verify handler has no throttle at all, so a 429 can only come from our
    // shadow endpoint (endpoints/verifyEmail.ts). If a Payload bump renames the built-in path out
    // from under the shadow, this assertion is what fails. Budget drains through the SAME
    // Postgres counter the app reads (shared DB), then the row is deleted so nothing leaks into
    // other tests.
    const req = { payload: fx.payload } as never
    const VERIFY_MAX = Number(process.env.RATE_LIMIT_VERIFY_EMAIL_GLOBAL_MAX) || 300
    try {
      for (let i = 0; i < VERIFY_MAX; i++) {
        await consumeRateLimit(req, 'verifyEmailGlobal', 'all')
      }
      const res = await fetch(url('/api/users/verify/throttle-probe-token'), { method: 'POST' })
      expect(res.status).toBe(429)
    } finally {
      const db = (fx.payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } })
        .drizzle
      await db.execute(sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" = ${'verifyEmailGlobal:all'};`)
    }
  })

  it('an AUTHENTICATED non-admin cannot create users → 403', async () => {
    const res = await fetch(url('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth('teacher') },
      body: JSON.stringify({ name: signupName('x'), email: signupEmail('x'), password: 'signup-pass-2' }),
    })
    expect(res.status).toBe(403)
  })

  it('the per-address signup cap bites on the 4th attempt → 429', async () => {
    const email = signupEmail('capped')
    const first = await post({ name: signupName('capped'), email, password: 'signup-pass-3' })
    expect([200, 201]).toContain(first.status)
    // Attempts 2–3 fail as duplicates (400) but still spend signup budget (probing is not free).
    for (let i = 0; i < 2; i++) {
      const dup = await post({ name: signupName('capped'), email, password: 'signup-pass-3' })
      expect(dup.status).toBe(400)
    }
    const fourth = await post({ name: signupName('capped'), email, password: 'signup-pass-3' })
    expect(fourth.status).toBe(429)
  })
})

describe('request-editing (teacher-first T3) — POST /api/lesson-plans/:id/request-editing', () => {
  const reqUrl = (id: number | string) => `/api/lesson-plans/${id}/request-editing`

  // Only THIS feature's messages — the earlier messaging block leaves teacher-sent rows behind,
  // so both the assertion and the cleanup must scope by content, not just sender. Lazy (a
  // function, not a const): the describe body is collected BEFORE beforeAll populates `fx`.
  const requestMessagesWhere = (): Where => ({
    and: [
      { sender: { equals: fx.users.teacher.id } },
      { body: { like: 'editing access' } },
    ],
  })

  afterAll(async () => {
    await fx.payload.delete({
      collection: 'messages',
      where: requestMessagesWhere(),
      overrideAccess: true,
    })
  })

  it('401 without auth', async () => {
    const res = await fetch(url(reqUrl(fx.plan.id)), { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('404 on a nonexistent plan', async () => {
    const res = await fetch(url(reqUrl(999999999)), { method: 'POST', headers: auth('teacher') })
    expect(res.status).toBe(404)
  })

  it('409 for a caller who already has edit rights', async () => {
    const res = await fetch(url(reqUrl(fx.plan.id)), { method: 'POST', headers: auth('editor') })
    expect(res.status).toBe(409)
  })

  it('a Teacher request messages every Site Admin + the sg Subject Admin (server-resolved recipients)', async () => {
    // Derive the EXPECTED recipient set from live DB state, mirroring the endpoint
    // (`resolveRecipients`): every `roles contains 'siteAdmin'` + the subject-grade's Subject
    // Admins, minus the requester. Hardcoding "2" assumed exactly one Site Admin and failed against a
    // populated DB (production correctly notifies ALL Site Admins) — this stays correct either way.
    const sgId = String(fx.subjectGrade.id)
    const [siteAdmins, holders] = await Promise.all([
      fx.payload.find({
        collection: 'users',
        where: { roles: { contains: 'siteAdmin' } },
        depth: 0,
        limit: 1000,
        overrideAccess: true,
      }),
      fx.payload.find({
        collection: 'users',
        where: { 'assignments.subjectGrade': { equals: sgId } },
        depth: 0,
        limit: 1000,
        overrideAccess: true,
      }),
    ])
    const subjectAdmins = holders.docs.filter((u) =>
      (u.assignments ?? []).some(
        (a) => String((a as { subjectGrade?: unknown }).subjectGrade) === sgId && (a as { role?: string }).role === 'subjectAdmin',
      ),
    )
    const expected = new Set([...siteAdmins.docs, ...subjectAdmins].map((u) => String(u.id)))
    expected.delete(String(fx.users.teacher.id)) // the requester is never messaged
    // Sanity: the fixture's two admins must be in the derived set (guards the derivation itself).
    expect(expected.has(String(fx.users.subjectAdmin.id))).toBe(true)
    expect(expected.has(String(fx.users.siteAdmin.id))).toBe(true)

    const res = await fetch(url(reqUrl(fx.plan.id)), { method: 'POST', headers: auth('teacher') })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sent: number }
    expect(body.sent).toBe(expected.size)

    const { docs } = await fx.payload.find({
      collection: 'messages',
      where: requestMessagesWhere(),
      depth: 0,
      overrideAccess: true,
    })
    expect(docs).toHaveLength(expected.size)
    expect(new Set(docs.map((m) => String(m.recipient)))).toEqual(expected)
    for (const m of docs) {
      expect(String(m.body)).toContain('editing access')
      expect(String(m.lessonPlan)).toBe(String(fx.plan.id))
    }
  })

  it('a repeat request the same day → 429 (one per user per subject-grade)', async () => {
    const res = await fetch(url(reqUrl(fx.plan.id)), { method: 'POST', headers: auth('teacher') })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
  })
})

describe('mark-read endpoint (SPEC §10; Codex #4) — POST /api/messages/mark-read', () => {
  // Read-state moved OFF the GET render onto a state-changing POST — CSRF-safe for every browser via
  // the SameSite=Lax cookie (a cross-site POST arrives unauthenticated → 401), replacing the old
  // Sec-Fetch heuristic. The write is hard-scoped to the caller's OWN messages, so foreign ids in the
  // body match nothing. Drive the real endpoint over the wire and check the DB.
  const markRead = (key: RoleKey | undefined, ids: unknown) =>
    fetch(url('/api/messages/mark-read'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(key) },
      body: JSON.stringify({ ids }),
    })
  const readAtOf = async (id: number) =>
    (await fx.payload.findByID({ collection: 'messages', id, depth: 0, overrideAccess: true })).readAt

  const mkMsg = (recipient: RoleKey, tag: string) =>
    fx.payload.create({
      collection: 'messages',
      data: { sender: fx.users.teacher.id, recipient: fx.users[recipient].id, body: `${MARK}${tag}` },
      overrideAccess: true,
    })

  it('without auth → 401 (a forged cross-site POST carries no SameSite cookie)', async () => {
    expect((await markRead(undefined, [1])).status).toBe(401)
  })

  it('marks the caller’s own shown messages read', async () => {
    const msg = await mkMsg('editor', 'mr-own')
    try {
      expect(await readAtOf(msg.id)).toBeFalsy()
      const res = await markRead('editor', [msg.id])
      expect(res.status).toBe(200)
      expect((await res.json()).updated).toBe(1)
      expect(await readAtOf(msg.id)).toBeTruthy()
    } finally {
      await fx.payload.delete({ collection: 'messages', id: msg.id, overrideAccess: true })
    }
  })

  it('cannot mark ANOTHER user’s message read — the recipient scope ignores foreign ids', async () => {
    const mine = await mkMsg('editor', 'mr-mine')
    const theirs = await mkMsg('subjectAdmin', 'mr-theirs')
    try {
      // The editor tries to mark BOTH its own and the subject-admin's message read.
      const res = await markRead('editor', [mine.id, theirs.id])
      expect(res.status).toBe(200)
      expect((await res.json()).updated).toBe(1) // only its own counted
      expect(await readAtOf(mine.id)).toBeTruthy()
      expect(await readAtOf(theirs.id)).toBeFalsy() // untouched
    } finally {
      await fx.payload.delete({ collection: 'messages', id: mine.id, overrideAccess: true })
      await fx.payload.delete({ collection: 'messages', id: theirs.id, overrideAccess: true })
    }
  })

  it('an empty / absent id list is a no-op 200', async () => {
    expect((await markRead('editor', [])).status).toBe(200)
    const res = await markRead('editor', 'not-an-array')
    expect(res.status).toBe(200)
    expect((await res.json()).updated).toBe(0)
  })
})

/**
 * Site-Admin upload endpoint (SPEC §7 deviation) — the wire-level authorization coverage the
 * standing rule (CLAUDE.md) owes every custom endpoint, added retroactively (Codex 2026-07-13, P2:
 * the endpoint had none). Proves the server-side gate — NOT the hidden UI button — is the boundary:
 * unauthenticated → 401, any non-Site-Admin → 403, and only then the validation + happy path.
 */
describe('forgot-password (L3-R1) — responses must not reveal whether an account exists', () => {
  // The oracle this closes: Payload's native operation returns EARLY for an unknown address (no send
  // attempted => 200) but falls through to an UNGUARDED `sendEmail` for a real one (=> non-2xx when
  // SMTP fails). Status therefore discriminated registered users on an UNAUTHENTICATED endpoint.
  // `endpoints/forgotPassword.ts` shadows it, runs the operation with `disableEmail: true` (so no
  // send can throw in-request) and queues delivery instead.
  const forgot = (email: string) =>
    fetch(url('/api/users/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

  const clearBudget = async (email: string) => {
    const db = (fx.payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } })
      .drizzle
    await db.execute(sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" LIKE ${'forgotPassword%'};`)
    void email
  }

  it('a REGISTERED and an UNKNOWN address return byte-identical status AND body', async () => {
    await clearBudget('')
    const unknownRes = await forgot(`${MARK}absolutely-no-such-account@example.invalid`)
    const knownRes = await forgot(fx.users.teacher.email)

    expect(unknownRes.status).toBe(200)
    expect(knownRes.status).toBe(unknownRes.status)
    expect(await knownRes.text()).toBe(await unknownRes.text())
  })

  it('queues a delivery job for a REGISTERED address and none for an unknown one', async () => {
    // Delivery is off the request path — that is what lets the two branches answer identically.
    // Count immediately: succeeded jobs are removed (`deleteJobOnComplete` defaults true).
    await clearBudget('')
    const countJobs = async () => {
      const { totalDocs } = await fx.payload.count({
        collection: 'payload-jobs' as never,
        where: { taskSlug: { equals: 'passwordResetEmail' } } as never,
        overrideAccess: true,
      })
      return totalDocs
    }

    const before = await countJobs()
    await forgot(`${MARK}still-no-such-account@example.invalid`)
    expect(await countJobs()).toBe(before) // unknown → nothing queued

    await forgot(fx.users.editor.email)
    expect(await countJobs()).toBeGreaterThan(before) // registered → queued
  })

  it('the per-address cap still bites → 429, proving the shadow did NOT lose the throttle', async () => {
    // The one real risk of shadowing. Unlike the verify endpoint (whose native op runs no hooks and
    // needed the limit re-applied by hand), forgotPasswordOperation DOES run collection
    // `beforeOperation` hooks, so `rateLimitAuthOperations` still fires through our endpoint. If a
    // Payload bump changed that, this is the assertion that fails.
    await clearBudget('')
    const email = `${MARK}throttle-probe@example.invalid`
    const MAX = Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX) || 5
    for (let i = 0; i < MAX; i++) expect((await forgot(email)).status).toBe(200)
    expect((await forgot(email)).status).toBe(429)
    await clearBudget('')
  })
})

describe('Upload endpoint (SPEC §7) — Site-Admin-only ingest boundary', () => {
  const UPLOAD = '/api/lesson-plans/upload'

  /** A valid definitive-1.0.0 ARES raw-JSON export (all five groups, complete resourceLinks;
   *  UNIT/FE/ST null) resolving to the fixture's subject-grade, as a multipart File. A unique
   *  substrand_id → a fresh plan, never a re-ingest. */
  const jsonFile = (name: string, substrandId: string): File => {
    const raw = {
      schemaVersion: '1.0.0',
      META: {
        subject: `${MARK}Biology`,
        grade: 99,
        substrand_id: substrandId,
        substrand_name: `${MARK}${substrandId}`,
        titleDoc: `${MARK}Upload ${substrandId}`,
      },
      UNIT: null,
      LESSONS: [
        {
          number: 1,
          title: `${MARK}Lesson`,
          duration: '40 minutes',
          slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
          framework: [
            {
              phase: 'Predict Phase',
              learnerExperience: 'x',
              teacherMoves: 'y',
              sensemakingStrategy: 'z',
              formativeAssessment: 'w',
            },
          ],
          resourceLinks: minimalResourceLinks(),
          summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
        },
      ],
      FINAL_EXPLANATION: null,
      SUMMARY_TABLE: null,
    }
    return new File([JSON.stringify(raw)], name, { type: 'application/json' })
  }

  const post = (role: RoleKey | undefined, build: (f: FormData) => void) => {
    const form = new FormData()
    build(form)
    return fetch(url(UPLOAD), { method: 'POST', headers: auth(role), body: form })
  }

  it('401 without auth', async () => {
    const res = await post(undefined, (f) => f.append('files', jsonFile('a.json', '90.1')))
    expect(res.status).toBe(401)
  })

  it('403 for a Teacher (server-side gate, not the hidden button)', async () => {
    const res = await post('teacher', (f) => f.append('files', jsonFile('a.json', '90.2')))
    expect(res.status).toBe(403)
  })

  it('403 for an Editor and a Subject Admin (only Site Admin may upload)', async () => {
    expect((await post('editor', (f) => f.append('files', jsonFile('a.json', '90.3')))).status).toBe(403)
    expect((await post('subjectAdmin', (f) => f.append('files', jsonFile('a.json', '90.4')))).status).toBe(
      403,
    )
  })

  it('400 when no "files" field is present', async () => {
    const res = await post('siteAdmin', (f) => f.append('other', 'x'))
    expect(res.status).toBe(400)
  })

  it('400 on a non-.json file (JSON-only web surface)', async () => {
    const res = await post('siteAdmin', (f) =>
      f.append('files', new File(['x = 1'], 'evil.js', { type: 'text/javascript' })),
    )
    expect(res.status).toBe(400)
  })

  it('422 on a well-formed-but-invalid bundle (pre-flight rejects, nothing written)', async () => {
    // Valid JSON, all five groups, but LESSONS empty → validateGeneratable fails in pre-flight.
    const bad = JSON.stringify({
      META: { subject: `${MARK}Biology`, grade: 99, substrand_id: '90.5' },
      UNIT: null,
      LESSONS: [],
      FINAL_EXPLANATION: null,
      SUMMARY_TABLE: null,
    })
    const res = await post('siteAdmin', (f) =>
      f.append('files', new File([bad], 'empty.json', { type: 'application/json' })),
    )
    expect(res.status).toBe(422)
    expect((await res.json()).ok).toBe(false)
  })

  it('a Site Admin uploads and reads a full resource bundle without the Postgres argument-limit 500', async () => {
    const res = await post('siteAdmin', (f) => f.append('files', jsonFile('good.json', '90.9')))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      count: number
      bundles: Array<{ id: number | string }>
    }
    expect(body.ok).toBe(true)
    expect(body.count).toBe(1)

    // Regression for the 2026-07-19 production failure: the old five-group representation put
    // 95 resource columns on the parent lesson row, so Payload's read-after-create generated a
    // json_build_array call with >100 arguments and PostgreSQL rolled the transaction back.
    const { docs } = await fx.payload.find({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: body.bundles[0]!.id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    const rows = docs[0]?.lessons?.[0]?.resourceLinks ?? []
    expect(rows).toHaveLength(RESOURCE_PHASE_KEYS.length)
    expect(rows.map((row) => row.phase)).toEqual([...RESOURCE_PHASE_KEYS])
  })
})
