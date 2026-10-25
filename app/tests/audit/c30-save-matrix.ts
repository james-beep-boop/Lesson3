/** Real save seam: role/scope, field split, server provenance, semver and stale/shape guards. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

type Version = Record<string, unknown> & {
  id: number
  uid: string
  updatedAt: string
  meta: Record<string, unknown>
  lessons: Array<Record<string, unknown>>
}
const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
const base = process.env.E2E_BASE_URL
assert(file && output && base)
assert.equal(new URL(base).origin, 'http://app:3000')
const fixture = JSON.parse(await readFile(file, 'utf8')) as {
  run: string
  password: string
  accounts: Record<string, { id: number; email: string; verified: boolean }>
  scopes: Record<string, number>
  plans: Record<string, { plan: number; version: number }>
}
assert(fixture.run.startsWith('l3audit-'))
const tokens: Record<string, string | undefined> = {}
const results: Array<Record<string, unknown>> = []
const created: Array<{ id: number; scope: string; semver: unknown }> = []
const sources: Record<string, Version> = {}
const normalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(normalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'id')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, normalize(item)]),
        )
      : value
async function api(method: string, route: string, actor: string, data?: unknown) {
  const form = data instanceof FormData
  const r = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(tokens[actor] ? { Authorization: `JWT ${tokens[actor]}` } : {}),
      ...(data !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  })
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}
function verify(actor: string, probe: string, actual: unknown, expected: unknown) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ actor, probe, passed, actual, expected })
  assert(passed, `${actor}: ${probe}`)
}
async function save(actor: string, scope: string, data: Version) {
  const form = new FormData()
  form.set('data', JSON.stringify(data))
  return api(
    'POST',
    `/api/lesson-bundle-versions/${fixture.plans[scope].version}/save-as-new`,
    actor,
    form,
  )
}
try {
  for (const [actor, user] of Object.entries(fixture.accounts)) {
    const r = await api('POST', '/api/users/login', actor, {
      email: user.email,
      password: fixture.password,
    })
    assert.equal(r.status, user.verified ? 200 : 403)
    if (user.verified) tokens[actor] = r.body.token as string
  }
  for (const [scope, { version }] of Object.entries(fixture.plans)) {
    const r = await api('GET', `/api/lesson-bundle-versions/${version}?depth=0`, 'siteAdmin')
    assert.equal(r.status, 200)
    sources[scope] = r.body as Version
  }
  for (const actor of ['anonymous', ...Object.keys(fixture.accounts)]) {
    for (const scope of ['A', 'B']) {
      const source = sources[scope]
      const data = structuredClone(source)
      const prose = `ZZ_AUDIT_${actor}_${scope}_prose`
      data.lessons[0].overview = prose
      data.lessons[0].duration = '45 min'
      data.lessons[0].resourceLinks = [
        { phase: 'forged', fallbackSearchUrl: 'https://invalid.example.test/' },
      ]
      data.lessons[0].number = 999
      data.meta.subject = 'ZZ_AUDIT_Repair_Label'
      data.subjectGrade = fixture.scopes[scope === 'A' ? 'B' : 'A']
      data.author = fixture.accounts.teacher.id
      data.semver = '77.77.77'
      data.uid = '00000000-0000-4000-8000-000000000000'
      data.sourceVersion = fixture.plans[scope === 'A' ? 'B' : 'A'].version
      const allowed =
        actor === 'siteAdmin' ||
        actor === 'subjectAdminA' ||
        (actor === 'subjectAdminB' && scope === 'B') ||
        (['editorA', 'editorAPeer'].includes(actor) && scope === 'A') ||
        (actor === 'editorB' && scope === 'B')
      const r = await save(actor, scope, data)
      verify(actor, `save in ${scope}`, r.status, !tokens[actor] ? 401 : allowed ? 200 : 403)
      if (!allowed) continue
      const id = r.body.id as number
      assert(Number.isInteger(id))
      created.push({ id, scope, semver: undefined })
      const stored = await api('GET', `/api/lesson-bundle-versions/${id}?depth=0`, 'siteAdmin')
      assert.equal(stored.status, 200)
      const version = stored.body as Version
      created[created.length - 1].semver = version.semver
      const structural = actor === 'siteAdmin' || actor === `subjectAdmin${scope}`
      verify(actor, `prose stored ${scope}`, version.lessons[0].overview, prose)
      verify(
        actor,
        `duration split ${scope}`,
        version.lessons[0].duration,
        structural ? '45 min' : source.lessons[0].duration,
      )
      verify(
        actor,
        `resource links preserved ${scope}`,
        normalize(version.lessons[0].resourceLinks),
        normalize(source.lessons[0].resourceLinks),
      )
      verify(actor, `row number derived ${scope}`, version.lessons[0].number, 1)
      verify(
        actor,
        `META identity split ${scope}`,
        version.meta.subject,
        actor === 'siteAdmin' ? 'ZZ_AUDIT_Repair_Label' : source.meta.subject,
      )
      verify(actor, `scope stamped ${scope}`, version.subjectGrade, fixture.scopes[scope])
      verify(actor, `author stamped ${scope}`, version.author, fixture.accounts[actor].id)
      verify(actor, `source lineage stamped ${scope}`, version.sourceVersion, source.id)
      verify(
        actor,
        `UID regenerated ${scope}`,
        version.uid !== source.uid && version.uid !== data.uid,
        true,
      )
      verify(actor, `semver forged input ignored ${scope}`, version.semver !== data.semver, true)
    }
  }
  for (const scope of ['A', 'B']) {
    verify(
      'system',
      `next patch sequence ${scope}`,
      created.filter((v) => v.scope === scope).map((v) => v.semver),
      ['1.0.1', '1.0.2', '1.0.3', '1.0.4'],
    )
    const original = await api(
      'GET',
      `/api/lesson-bundle-versions/${sources[scope].id}?depth=0`,
      'siteAdmin',
    )
    verify('system', `source snapshot unchanged ${scope}`, original.body, sources[scope])
    const plan = await api(
      'GET',
      `/api/lesson-plans/${fixture.plans[scope].plan}?depth=0`,
      'siteAdmin',
    )
    verify(
      'system',
      `Official pointer unchanged ${scope}`,
      plan.body.officialVersion,
      sources[scope].id,
    )
  }
  for (const [label, value, expected] of [
    ['missing', undefined, 400],
    ['invalid', 'not-a-time', 400],
    ['future', '2999-01-01T00:00:00.000Z', 409],
  ] as const) {
    const data = structuredClone(sources.A)
    data.lessons[0].overview = `ZZ_AUDIT_Stale_${label}`
    if (value === undefined) delete (data as Record<string, unknown>).updatedAt
    else data.updatedAt = value
    const r = await save('editorA', 'A', data)
    verify('editorA', `${label} base timestamp`, r.status, expected)
  }
  const removed = structuredClone(sources.A)
  removed.lessons = []
  verify('editorA', 'lesson deletion refused', (await save('editorA', 'A', removed)).status, 403)
} finally {
  for (const { id } of created) {
    const r = await api('DELETE', `/api/lesson-bundle-versions/${id}`, 'siteAdmin')
    results.push({
      actor: 'system',
      probe: 'candidate cleanup',
      passed: r.status === 200,
      status: r.status,
    })
  }
  await writeFile(output, JSON.stringify({ results, created: created.length }, null, 2), {
    mode: 0o600,
  })
  console.log(
    JSON.stringify({
      checks: results.length,
      created: created.length,
      failed: results.filter((r) => !r.passed),
    }),
  )
}
if (results.some((result) => !result.passed)) process.exitCode = 1
