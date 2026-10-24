/** Bounded follow-up against the marked synthetic audit database. No product changes. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { APIError, getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../../src/payload.config'
import { minimalBundleContent } from '../helpers/fixtures'
import { drizzleOf, rowsOf } from '../helpers/db'

const fixture = JSON.parse(readFileSync('/audit/fixture.json', 'utf8'))
assert.equal(fixture.run, 'l3audit-20261024-d3714a5')
assert.equal(process.env.NODE_ENV, 'production')
const payload = await getPayload({ config })
// Only the existing production app drives cron; this observer must not consume jobs itself.
for (const cron of payload.crons) cron.stop()
const marker = rowsOf<{ marker: string }>(
  await drizzleOf(payload).execute(
    sql`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`,
  ),
)[0]?.marker
assert.equal(marker, fixture.run)
const result: Record<string, unknown> & { checks: Record<string, Record<string, unknown>> } = {
  started: new Date().toISOString(),
  baseline: 'd3714a5b210e1bac7bfa8884f4fce9a34add37b5',
  checks: {},
}
const save = () =>
  writeFileSync('/audit-output/result.json', JSON.stringify(result, null, 2), { mode: 0o600 })
const tokens = new Map<string, string>()
async function api(actor: string, method: string, path: string, data?: unknown) {
  const response = await fetch(`http://lesson3-audit:3000/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokens.has(actor) ? { Authorization: `JWT ${tokens.get(actor)}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  })
  const body = await response.json()
  return { status: response.status, body }
}
for (const actor of ['siteAdmin', 'teacher', 'editorA', 'subjectAdminA']) {
  const login = await api(actor, 'POST', '/users/login', {
    email: fixture.accounts[actor].email,
    password: fixture.password,
  })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.id, fixture.accounts[actor].id)
  tokens.set(actor, login.body.token)
}
const fingerprint = async () => {
  const docs = []
  for (const collection of ['lesson-plans', 'lesson-bundle-versions'] as const)
    docs.push(
      (await payload.find({ collection, depth: 0, limit: 100, sort: 'id', overrideAccess: true }))
        .docs,
    )
  docs.push(await payload.findGlobal({ slug: 'system-settings', depth: 0, overrideAccess: true }))
  return createHash('sha256').update(JSON.stringify(docs)).digest('hex')
}
result.before = await fingerprint()
save()
const versions: number[] = []
const locks: number[] = []
let restoreStats: unknown
let statsTouched = false
let jobId: number | string | undefined
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function present(id: number | string) {
  return (
    await payload.find({
      collection: 'payload-jobs',
      where: { id: { equals: id } },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
}
async function queueControl() {
  const user = await payload.findByID({
    collection: 'users',
    id: fixture.accounts.teacherPeer.id,
    showHiddenFields: true,
    overrideAccess: true,
  })
  assert(
    !user.resetPasswordToken,
    'Control account must have no reset token, so no email can be sent',
  )
  const job = await payload.jobs.queue({
    task: 'passwordResetEmail',
    input: { userId: user.id },
    queue: 'default',
  })
  jobId = job.id
  return job.id
}
async function awaitConsumed(id: number | string) {
  for (let n = 0; n < 16; n++) {
    if (!(await present(id))) return true
    await pause(1000)
  }
  return false
}
async function createVersion(semver: string) {
  const doc = await payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      lessonPlan: fixture.plans.A.plan,
      subjectGrade: fixture.scopes.A,
      semver,
      author: fixture.accounts.editorA.id,
      title: 'ZZ_AUDIT_PR437_followup',
      ...minimalBundleContent(),
    } as never,
  })
  versions.push(doc.id)
  return doc
}
try {
  const control = await queueControl()
  assert(
    await awaitConsumed(control),
    'Healthy autorun must consume the harmless positive-control job',
  )
  result.checks.healthyAutorun = { consumed: true, job: control }
  save()
  const statsResponse = await api('siteAdmin', 'GET', '/globals/payload-jobs-stats')
  assert.equal(statsResponse.status, 200)
  restoreStats = statsResponse.body.stats ?? null
  writeFileSync('/audit-output/stats-backup.json', JSON.stringify({ stats: restoreStats }), {
    mode: 0o600,
  })
  const stats = structuredClone(restoreStats ?? {}) as {
    scheduledRuns?: {
      queues?: Record<string, { tasks?: Record<string, { lastScheduledRun?: string }> }>
    }
  }
  stats.scheduledRuns ??= {}
  stats.scheduledRuns.queues ??= {}
  stats.scheduledRuns.queues.default ??= {}
  stats.scheduledRuns.queues.default.tasks ??= {}
  stats.scheduledRuns.queues.default.tasks.expireEditRecovery = {
    ...(stats.scheduledRuns.queues.default.tasks.expireEditRecovery ?? {}),
    lastScheduledRun: 'ZZ_AUDIT_INVALID_DATE',
  }
  statsTouched = true
  const poisoned = await api('teacher', 'POST', '/globals/payload-jobs-stats', { stats })
  result.checks.scheduler = { teacherWriteStatus: poisoned.status }
  save()
  assert.equal(poisoned.status, 200)
  const blocked = await queueControl()
  for (let tick = 1; tick <= 4; tick++) {
    await pause(3200)
    const job = await present(blocked)
    assert(job, 'Poisoned scheduling must retain the queued control job')
    assert.equal(job.totalTried ?? 0, 0)
    const read = await api('siteAdmin', 'GET', '/globals/payload-jobs-stats')
    assert.equal(
      read.body.stats.scheduledRuns.queues.default.tasks.expireEditRecovery.lastScheduledRun,
      'ZZ_AUDIT_INVALID_DATE',
    )
    result.checks.scheduler.observedTicks = tick
    result.checks.scheduler.pendingJob = blocked
    save()
  }
  const restored = await api('siteAdmin', 'POST', '/globals/payload-jobs-stats', {
    stats: restoreStats,
  })
  assert.equal(restored.status, 200)
  assert.deepEqual(
    (await api('siteAdmin', 'GET', '/globals/payload-jobs-stats')).body.stats ?? null,
    restoreStats,
  )
  statsTouched = false
  assert(await awaitConsumed(blocked), 'Restoring metadata must resume the same pending job')
  result.checks.scheduler.recoveredSameJob = true
  save()

  const version = await createVersion('987.437.1')
  const full: Partial<typeof version> = { ...version, title: 'ZZ_AUDIT_PR437_valid_change' }
  delete full.id
  delete full.createdAt
  delete full.updatedAt
  // A real no-user system update establishes that the complete candidate passes validation.
  const valid = await payload.update({
    collection: 'lesson-bundle-versions',
    id: version.id,
    data: full,
    overrideAccess: true,
  })
  assert.equal(valid.title, full.title)
  result.checks.immutability = { validSystemUpdate: true, actors: [] }
  for (const actor of ['editorA', 'subjectAdminA', 'siteAdmin']) {
    const user = await payload.findByID({
      collection: 'users',
      id: fixture.accounts[actor].id,
      overrideAccess: true,
    })
    let localError: unknown
    try {
      await payload.update({
        collection: 'lesson-bundle-versions',
        id: version.id,
        data: { ...full, title: 'ZZ_AUDIT_PR437_refused' },
        user,
        overrideAccess: false,
      })
    } catch (error) {
      localError = error
    }
    assert(localError instanceof APIError)
    assert.equal(localError.status, 403)
    assert.match(localError.message, /Versions are immutable/)
    const wire = await api(actor, 'PATCH', `/lesson-bundle-versions/${version.id}`, {
      ...full,
      title: 'ZZ_AUDIT_PR437_refused',
    })
    assert.equal(wire.status, 403)
    assert.match(JSON.stringify(wire.body), /Versions are immutable/)
    ;(result.checks.immutability.actors as Array<Record<string, unknown>>).push({
      actor,
      localStatus: localError.status,
      wireStatus: wire.status,
      exactImmutabilityMessage: true,
    })
    save()
  }
  assert.equal(
    (
      await payload.findByID({
        collection: 'lesson-bundle-versions',
        id: version.id,
        depth: 0,
        overrideAccess: true,
      })
    ).title,
    valid.title,
  )

  const unlocked = await createVersion('987.437.2')
  assert.equal(
    (await api('editorA', 'DELETE', `/lesson-bundle-versions/${unlocked.id}`)).status,
    200,
  )
  const locked = await createVersion('987.437.3')
  const forge = await api('teacher', 'POST', '/payload-locked-documents', {
    document: { relationTo: 'lesson-bundle-versions', value: locked.id },
    user: { relationTo: 'users', value: fixture.accounts.siteAdmin.id },
  })
  assert.equal(forge.status, 201)
  locks.push(forge.body.doc.id)
  const refused = await api('editorA', 'DELETE', `/lesson-bundle-versions/${locked.id}`)
  const bypass = await api(
    'editorA',
    'DELETE',
    `/lesson-bundle-versions/${locked.id}?overrideLock=true`,
  )
  result.checks.lock = {
    forgedStatus: forge.status,
    unlockedDelete: 200,
    lockedDelete: refused.status,
    lockedMessage: refused.body,
    explicitTakeoverDelete: bypass.status,
  }
  save()
  assert.equal(refused.status, 423)
  assert.equal(bypass.status, 200)
} catch (error) {
  result.error = { name: (error as Error).name, message: (error as Error).message }
  process.exitCode = 1
} finally {
  if (statsTouched) {
    const response = await api('siteAdmin', 'POST', '/globals/payload-jobs-stats', {
      stats: restoreStats,
    })
    assert.equal(response.status, 200)
    assert.deepEqual(
      (await api('siteAdmin', 'GET', '/globals/payload-jobs-stats')).body.stats ?? null,
      restoreStats,
    )
    result.statsRestoredInCleanup = true
  }
  if (jobId && (await present(jobId)))
    await payload.delete({ collection: 'payload-jobs', id: jobId, overrideAccess: true })
  for (const id of locks) {
    const found = await payload.find({
      collection: 'payload-locked-documents',
      where: { id: { equals: id } },
      overrideAccess: true,
    })
    if (found.totalDocs)
      await payload.delete({ collection: 'payload-locked-documents', id, overrideAccess: true })
  }
  for (const id of versions) {
    const found = await payload.find({
      collection: 'lesson-bundle-versions',
      where: { id: { equals: id } },
      overrideAccess: true,
    })
    if (found.totalDocs)
      await payload.delete({ collection: 'lesson-bundle-versions', id, overrideAccess: true })
  }
  result.after = await fingerprint()
  result.contentUnchanged = result.before === result.after
  assert(
    result.contentUnchanged,
    'Native content, Official pointers and settings must be unchanged',
  )
  result.finished = new Date().toISOString()
  save()
  console.log(JSON.stringify(result, null, 2))
  await payload.destroy()
  // Imported application modules retain timers; all writes and cleanup have completed above.
  process.exit(process.exitCode ?? 0)
}
