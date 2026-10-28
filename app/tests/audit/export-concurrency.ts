/** Bounded native HTTP export probe against the dedicated upgrade-drill fixture only. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
const base = process.env.E2E_BASE_URL
assert.equal(base, 'http://app:3000', 'Only the private disposable upgrade network is supported')
const state = JSON.parse(await readFile('/audit-upgrade-state.json', 'utf8')) as {
  version: number
  users: Record<'teacher' | 'editor' | 'siteAdmin', { email: string }>
  password: string
}
const request = (path: string, token?: string, init?: RequestInit) =>
  fetch(base + path, {
    ...init,
    headers: { ...(token ? { Authorization: `JWT ${token}` } : {}), ...init?.headers },
    signal: AbortSignal.timeout(90000),
  })
const login = async (role: keyof typeof state.users) => {
  const response = await request('/api/users/login', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: state.users[role].email, password: state.password }),
  })
  assert.equal(response.status, 200)
  const body = (await response.json()) as { token: string }
  assert.ok(body.token)
  return body.token
}
// Start just after a native export-budget window boundary; do not reset or bypass its counters.
await new Promise((resolve) => setTimeout(resolve, 61000 - (Date.now() % 60000)))
const editing = await login('editor')
const teacher = await login('teacher')
const operator = await login('siteAdmin')
const original = await request(`/api/lesson-bundle-versions/${state.version}?depth=0`, teacher)
assert.equal(original.status, 200)
const content = (await original.json()) as { lessons: { overview: string }[] }
const sourceBefore = JSON.stringify(content)
content.lessons[0].overview = 'Audit bounded simultaneous export candidate'
const data = new FormData()
data.set('data', JSON.stringify(content))
const save = await request(`/api/lesson-bundle-versions/${state.version}/save-as-new`, editing, {
  method: 'POST',
  body: data,
})
assert.equal(save.status, 200)
const { id } = (await save.json()) as { id: number }
assert.ok(Number.isSafeInteger(id))
for (const kind of ['docx', 'pdf']) {
  const cold = await request(`/api/lesson-bundle-versions/${id}/export?as=${kind}`, teacher)
  assert.equal(cold.status, 409, 'Serve-only cold GET must not generate')
}
const started = performance.now()
const count = process.argv.includes('--barrier') ? 6 : 12
const batch = () =>
  Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const kind = i % 2 ? 'pdf' : 'docx'
      const response = await request(
        `/api/lesson-bundle-versions/${id}/export?as=${kind}`,
        teacher,
        { method: 'POST' },
      )
      const body = (await response.json()) as {
        jobId?: string | number
        errors?: { message: string }[]
      }
      return {
        kind,
        status: response.status,
        jobId: body.jobId == null ? null : String(body.jobId),
        errors: body.errors,
      }
    }),
  )
let prepared: Awaited<ReturnType<typeof batch>>
if (process.argv.includes('--barrier')) {
  const [{ getPayload }, { default: config }, { sql }, { whileLockHeld }, { poolDb, rowsOf }] =
    await Promise.all([
      import('payload'),
      import('../../src/payload.config'),
      import('@payloadcms/db-postgres'),
      import('../helpers/rowLocks'),
      import('../../src/lib/txDb'),
    ])
  const payload = await getPayload({ config })
  try {
    const { pending } = await whileLockHeld(
      payload,
      sql`LOCK TABLE payload_jobs IN SHARE MODE`,
      async () => {
        const pending = batch()
        let blocked = 0
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
          const result = await poolDb(payload).execute(
            sql`SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%insert into %payload_jobs%'`,
          )
          blocked = Number(rowsOf(result)[0]?.n ?? 0)
          if (blocked >= count) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        console.log(JSON.stringify({ stage: 'controlled overlap', blocked, expected: count }))
        assert.equal(
          blocked,
          count,
          'Every native enqueue must be observed waiting before releasing the barrier',
        )
        return { pending }
      },
    )
    prepared = await pending
    const row = rowsOf(
      await poolDb(payload).execute(
        sql`SELECT count(*)::integer AS n FROM payload_jobs WHERE task_slug='generateVersionArtifact' AND input->>'versionId'=${String(id)} AND completed_at IS NULL AND has_error IS NOT TRUE`,
      ),
    )[0]
    assert.equal(Number(row?.n), 2, 'The unique index must still retain exactly two pending jobs')
    const after = await request(`/api/lesson-bundle-versions/${state.version}?depth=0`, teacher)
    assert.equal(after.status, 200)
    assert.equal(
      JSON.stringify(await after.json()),
      sourceBefore,
      'Original snapshot remains immutable',
    )
    console.log(
      JSON.stringify({
        stage: 'post-barrier database controls',
        pendingJobs: Number(row?.n),
        sourceUnchanged: true,
      }),
    )
  } finally {
    await payload.destroy()
  }
} else prepared = await batch()
console.log(JSON.stringify({ stage: 'all prepare responses', prepared }))
assert.ok(
  prepared.every((x) => x.status === 202 && x.jobId),
  'All cold authorized prepares must return the coalesced job',
)
for (const kind of ['docx', 'pdf']) {
  assert.equal(
    new Set(prepared.filter((x) => x.kind === kind).map((x) => x.jobId)).size,
    1,
    'Same-kind concurrent requests must coalesce',
  )
}
const run = await request('/api/payload-jobs/run?limit=20', operator)
assert.equal(run.status, 200)
const results = await Promise.all(
  Array.from({ length: 12 }, async (_, i) => {
    const kind = i % 2 ? 'pdf' : 'docx'
    const response = await request(
      `/api/lesson-bundle-versions/${id}/export/doc?doc=lessonSequence&as=${kind}`,
      teacher,
    )
    assert.equal(response.status, 200)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(
      bytes.subarray(0, kind === 'pdf' ? 5 : 2).toString(),
      kind === 'pdf' ? '%PDF-' : 'PK',
    )
    return { kind, bytes: bytes.length, hash: createHash('sha256').update(bytes).digest('hex') }
  }),
)
for (const kind of ['docx', 'pdf'])
  assert.equal(
    new Set(results.filter((x) => x.kind === kind).map((x) => x.hash)).size,
    1,
    'Concurrent same-kind reads must receive identical complete artifacts',
  )
const healthy = await request('/api/users/me', teacher)
assert.equal(healthy.status, 200)
console.log(
  JSON.stringify({
    source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
    target: 'dedicated disposable upgrade stack',
    concurrentPrepare: count,
    controlledBarrier: process.argv.includes('--barrier'),
    coalescedJobs: 2,
    concurrentDeliveries: 12,
    seconds: (performance.now() - started) / 1000,
    health: healthy.status,
    results: results.map(({ kind, bytes }) => ({ kind, bytes })),
    limits: 'One small synthetic version; no saturation or large-school capacity claim',
  }),
)
