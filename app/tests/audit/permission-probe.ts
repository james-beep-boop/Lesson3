import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createUserVerified, MARK, setupRoleFixture } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'
const fx = await setupRoleFixture()
const outcomes: { check: string; status: number; observed?: unknown }[] = []
const extraUsers: number[] = []
let extraGrade: number | undefined
try {
  const sg = await fx.payload.create({
    collection: 'subject-grades',
    data: { subject: fx.subject.id, grade: 11 },
    overrideAccess: true,
  })
  extraGrade = sg.id
  const outside = await createUserVerified(fx.payload, {
    name: `${MARK}Outside capability`,
    email: `${MARK.toLowerCase()}outside@lesson3.local`,
    password: fx.password,
    assignments: [{ subjectGrade: sg.id, role: 'editor' }],
  })
  extraUsers.push(outside.id)
  const mixed = await createUserVerified(fx.payload, {
    name: `${MARK}Mixed capability`,
    email: `${MARK.toLowerCase()}mixed@lesson3.local`,
    password: fx.password,
    assignments: [
      { subjectGrade: fx.subjectGrade.id, role: 'editor' },
      { subjectGrade: sg.id, role: 'subjectAdmin' },
    ],
  })
  extraUsers.push(mixed.id)
  const unverified = await createUserVerified(fx.payload, {
    name: `${MARK}Unverified`,
    email: `${MARK.toLowerCase()}unverified@lesson3.local`,
    password: fx.password,
    _verified: false,
  })
  extraUsers.push(unverified.id)
  const failedLogin = await fetch(url('/api/users/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unverified.email, password: fx.password }),
  })
  assert.notEqual(failedLogin.status, 200)
  outcomes.push({ check: 'unverified login denied', status: failedLogin.status })
  const callers = [
    ['Teacher', fx.users.teacher],
    ['Teacher with editing access', fx.users.editor],
    ['Subject-grade administrator', fx.users.subjectAdmin],
    ['Site administrator', fx.users.siteAdmin],
    ['Teacher with editing access in another subject-grade', outside],
    ['Mixed capabilities', mixed],
  ] as const
  const before = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: fx.version.id,
    depth: 0,
    overrideAccess: true,
  })
  const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
  for (const [label, user] of callers) {
    const token = await login(user.email, fx.password)
    const headers = { 'Content-Type': 'application/json', Authorization: `JWT ${token}` }
    const res = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}`), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        semver: '99.0.0',
        author: user.id,
        lessons: (before.lessons ?? []).map((lesson, index) =>
          index === 0 ? { ...lesson, overview: 'AUDIT immutable write' } : lesson,
        ),
      }),
    })
    assert.equal(res.status, 403, label)
    outcomes.push({ check: `immutable PATCH: ${label}`, status: res.status })
    assert.equal(
      hash(
        await fx.payload.findByID({
          collection: 'lesson-bundle-versions',
          id: fx.version.id,
          depth: 0,
          overrideAccess: true,
        }),
      ),
      hash(before),
      `no version write: ${label}`,
    )
    const created = await fetch(url('/api/lesson-plans'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: `${MARK}forbidden`, subjectGrade: fx.subjectGrade.id }),
    })
    assert.equal(created.status, 403)
    outcomes.push({ check: `no direct plan creation: ${label}`, status: created.status })
    const createdVersion = await fetch(url('/api/lesson-bundle-versions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ lessonPlan: fx.plan.id }),
    })
    assert.equal(createdVersion.status, 403)
    outcomes.push({ check: `no direct version creation: ${label}`, status: createdVersion.status })
    const query = new URLSearchParams({
      'where[email][equals]': fx.users.subjectAdmin.email,
      depth: '2',
      limit: '10',
    })
    const listing = await fetch(url(`/api/users?${query}`), { headers })
    const body = (await listing.json()) as {
      docs?: { id: number; email?: string }[]
      errors?: unknown
    }
    const peer = body.docs?.find((d) => d.id === fx.users.subjectAdmin.id)
    outcomes.push({
      check: `hidden email filter: ${label}`,
      status: listing.status,
      observed: { matchedPeer: Boolean(peer), returnedEmail: Boolean(peer?.email) },
    })
    for (const method of ['GET', 'POST']) {
      const graph = await fetch(url('/api/graphql'), {
        method,
        headers,
        ...(method === 'POST'
          ? { body: JSON.stringify({ query: '{ __schema { types { name } } }' }) }
          : {}),
      })
      assert.equal(graph.status, 404)
      outcomes.push({ check: `GraphQL disabled ${method}: ${label}`, status: graph.status })
    }
  }
  const unauth = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}`))
  assert.ok([401, 403, 404].includes(unauth.status))
  outcomes.push({ check: 'anonymous private-version read denied', status: unauth.status })
  console.log(
    JSON.stringify({ source: '6e75a173e822e4c4be42821b0a4af48ca457bd36', outcomes }, null, 2),
  )
} finally {
  for (const id of extraUsers)
    await fx.payload.delete({ collection: 'users', id, overrideAccess: true })
  if (extraGrade)
    await fx.payload.delete({ collection: 'subject-grades', id: extraGrade, overrideAccess: true })
  await fx.teardown()
  await fx.payload.destroy()
}
