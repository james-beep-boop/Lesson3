// Real HTTP upload corpus. Private inputs/results; never executes uploaded source.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.E2E_BASE_URL
const root = process.env.LESSON3_AUDIT_CORPUS_DIR
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(base, 'http://app:3000')
assert(root && output && process.env.LESSON3_AUDIT_FIXTURE_FILE)
const fixture = JSON.parse(await readFile(process.env.LESSON3_AUDIT_FIXTURE_FILE, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
const selected = process.env.LESSON3_AUDIT_CORPUS_GROUP
if (selected) assert(manifest.groups.some((group) => group.name === selected))
const tokens = {}
const results = []
const owned = new Set()
let failure
async function api(method, route, actor = 'siteAdmin', data) {
  const form = data instanceof FormData
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(tokens[actor] ? { Authorization: `JWT ${tokens[actor]}` } : {}),
      ...(data !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
    signal: AbortSignal.timeout(60000),
  })
  return { status: response.status, body: await response.json() }
}
async function snapshot() {
  const all = {}
  for (const collection of [
    'subjects',
    'subject-grades',
    'lesson-plans',
    'lesson-bundle-versions',
  ]) {
    const response = await api('GET', `/api/${collection}?depth=0&limit=1000&sort=id`)
    assert.equal(response.status, 200)
    assert(response.body.totalDocs <= 1000)
    all[collection] = response.body.docs
  }
  return all
}
async function cleanup() {
  for (const id of owned) {
    const response = await api('DELETE', `/api/lesson-plans/${id}`)
    assert.equal(response.status, 200, `cleanup plan ${id}`)
    owned.delete(id)
  }
}
async function upload(group, actor) {
  const form = new FormData()
  for (const name of group.files) {
    assert.equal(path.basename(name), name)
    const expected = manifest.files.find((item) => item.name === name)
    const bytes = await readFile(path.join(root, name))
    assert.equal(bytes.length, expected.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256)
    form.append('files', new File([bytes], name))
  }
  for (const [key, value] of Object.entries(group.fields)) form.set(key, value)
  const started = performance.now()
  const response = await api('POST', '/api/lesson-plans/upload', actor, form)
  const entry = {
    group: group.name,
    actor,
    ms: Math.round(performance.now() - started),
    ...response,
  }
  results.push(entry)
  for (const bundle of response.body.bundles || []) {
    assert(Number.isInteger(bundle.id))
    owned.add(bundle.id)
  }
  console.log(
    JSON.stringify({
      group: group.name,
      actor,
      status: response.status,
      count: response.body.count,
      ms: entry.ms,
    }),
  )
  return response
}
let before
try {
  for (const [actor, user] of Object.entries(fixture.accounts)) {
    const response = await api('POST', '/api/users/login', actor, {
      email: user.email,
      password: fixture.password,
    })
    assert.equal(response.status, user.verified ? 200 : 403)
    if (user.verified) tokens[actor] = response.body.token
  }
  before = await snapshot()
  const control = manifest.groups[0]
  for (const actor of ['anonymous', ...Object.keys(fixture.accounts)]) {
    const response = await upload(control, actor)
    assert.equal(response.status, actor === 'siteAdmin' ? 200 : tokens[actor] ? 403 : 401)
    if (actor === 'siteAdmin') assert.equal(response.body.count, 1)
    await cleanup()
  }
  for (const group of manifest.groups
    .slice(1)
    .filter((group) => !selected || group.name === selected)) {
    const response = await upload(group, 'siteAdmin')
    if (group.http !== 'observe') {
      assert.equal(response.status, group.http, group.name)
      assert.equal(response.body.count || 0, group.count, `${group.name}: count`)
    } else {
      for (const id of owned) {
        const plan = await api('GET', `/api/lesson-plans/${id}?depth=0`)
        assert.equal(plan.status, 200)
        const version = await api(
          'GET',
          `/api/lesson-bundle-versions/${plan.body.officialVersion}?depth=0`,
        )
        assert.equal(version.status, 200)
        results.at(-1).storedMeta = version.body.meta
      }
    }
    await cleanup()
    assert.deepEqual(await snapshot(), before, `${group.name}: lesson/taxonomy state`)
    const health = await api('GET', '/api/users/me')
    assert.equal(health.status, 200)
    assert(health.body.user)
  }
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
} finally {
  try {
    await cleanup()
  } catch (error) {
    failure = `${failure || ''}\nCleanup: ${error}`
  }
  let unchanged = false
  try {
    unchanged = JSON.stringify(await snapshot()) === JSON.stringify(before)
  } catch (error) {
    failure = `${failure || ''}\nSnapshot: ${error}`
  }
  if (!unchanged) failure = `${failure || ''}\nFinal snapshot differs`
  await writeFile(
    output,
    JSON.stringify({ results, unchanged, failure, remainingOwned: [...owned] }, null, 2),
    { mode: 0o600 },
  )
  if (failure) {
    console.error(failure)
    process.exitCode = 1
  }
}
