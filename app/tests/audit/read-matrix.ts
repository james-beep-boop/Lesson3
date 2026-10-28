/** Explicit native read expectations; this supplements, rather than replaces, write-path suites. */
import assert from 'node:assert/strict'
import { setupRoleFixture, createUserVerified, MARK, type RoleKey } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'
const fx = await setupRoleFixture()
try {
  const otherGrade = await fx.payload.create({
    collection: 'subject-grades',
    data: { subject: fx.subject.id, grade: 11 },
    overrideAccess: true,
  })
  const extra = async (label: string, assignments: unknown) =>
    createUserVerified(fx.payload, {
      name: MARK + label,
      email: `${MARK.toLowerCase()}${label}@example.com`,
      password: fx.password,
      assignments: assignments as never,
    })
  const otherEdit = await extra('outside-edit', [{ subjectGrade: otherGrade.id, role: 'editor' }])
  const otherAdmin = await extra('outside-admin', [
    { subjectGrade: otherGrade.id, role: 'subjectAdmin' },
  ])
  const mixed = await extra('mixed', [
    { subjectGrade: fx.subjectGrade.id, role: 'editor' },
    { subjectGrade: otherGrade.id, role: 'subjectAdmin' },
  ])
  const unverified = await extra('later-unverified', [])
  const oldToken = await login(unverified.email, fx.password)
  await fx.payload.update({
    collection: 'users',
    id: unverified.id,
    data: { _verified: false },
    overrideAccess: true,
  })
  const actors: {
    label: string
    token?: string
    signed: boolean
    site: boolean
    allowedEmail?: string
  }[] = [
    { label: 'anonymous', signed: false, site: false },
    { label: 'unverified existing session', token: oldToken, signed: false, site: false },
  ]
  for (const [key, label] of [
    ['teacher', 'Teacher'],
    ['editor', 'Teacher with editing access, own subject-grade'],
    ['subjectAdmin', 'Subject administrator, own subject-grade'],
    ['siteAdmin', 'Site administrator'],
  ] as [RoleKey, string][]) {
    actors.push({
      label,
      token: await login(fx.users[key].email, fx.password),
      signed: true,
      site: key === 'siteAdmin',
      allowedEmail: fx.users[key].email,
    })
  }
  for (const [user, label] of [
    [otherEdit, 'Teacher with editing access, other subject-grade'],
    [otherAdmin, 'Subject administrator, other subject-grade'],
    [mixed, 'Mixed capabilities'],
  ] as const)
    actors.push({
      label,
      token: await login(user.email, fx.password),
      signed: true,
      site: false,
      allowedEmail: user.email,
    })
  const settings = await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })
  await fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features: { ...settings.features, forumEnabled: true } },
    overrideAccess: true,
  })
  const ordinary = [
    'lesson-plans',
    'lesson-bundle-versions',
    'subjects',
    'subject-grades',
    'users',
    'favorites',
    'messages',
    'discussion-topics',
    'discussion-replies',
    'discussion-participation',
    'payload-locked-documents',
    'payload-preferences',
  ]
  const rows = []
  try {
    for (const actor of actors) {
      const headers = actor.token ? { Authorization: `JWT ${actor.token}` } : { Authorization: '' }
      const targets = [
        ...ordinary.map((slug) => ({
          path: `/api/${slug}?limit=50&depth=2`,
          expected: actor.signed ? 'allow' : 'deny',
        })),
        ...['edit-recovery', 'payload-kv'].map((slug) => ({
          path: `/api/${slug}?limit=5`,
          expected: 'deny',
        })),
        { path: '/api/payload-jobs?limit=5', expected: actor.site ? 'allow' : 'deny' },
        ...['system-settings', 'payload-jobs-stats'].map((slug) => ({
          path: `/api/globals/${slug}`,
          expected: actor.site ? 'allow' : 'deny',
        })),
        { path: '/api/payload-migrations', expected: 'disabled' },
      ]
      for (const target of targets) {
        const res = await fetch(url(target.path), { headers, redirect: 'manual' })
        const matched =
          target.expected === 'allow'
            ? res.status === 200
            : target.expected === 'disabled'
              ? res.status === 501
              : [401, 403].includes(res.status)
        let forbiddenEmails = 0
        let exposedAuthSecrets = 0
        if (res.status === 200) {
          const inspect = (v: unknown): void => {
            if (!v || typeof v !== 'object') return
            for (const [key, value] of Object.entries(v)) {
              if (
                key === 'email' &&
                typeof value === 'string' &&
                value &&
                !actor.site &&
                value !== actor.allowedEmail
              )
                forbiddenEmails++
              if (
                ['hash', 'salt', 'resetPasswordToken', 'password'].includes(key) &&
                typeof value === 'string' &&
                value
              )
                exposedAuthSecrets++
              inspect(value)
            }
          }
          inspect(await res.json())
        }
        rows.push({
          actor: actor.label,
          path: target.path,
          expected: target.expected,
          status: res.status,
          matched: matched && forbiddenEmails === 0 && exposedAuthSecrets === 0,
          forbiddenEmails,
          exposedAuthSecrets,
        })
      }
    }
  } finally {
    await fx.payload.updateGlobal({
      slug: 'system-settings',
      data: { features: settings.features },
      overrideAccess: true,
    })
  }
  console.log(
    JSON.stringify({
      source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
      cells: rows.length,
      matched: rows.filter((r) => r.matched).length,
      rows,
    }),
  )
  assert.deepEqual(
    rows.filter((r) => !r.matched),
    [],
    'Every native read cell must match its independent policy expectation',
  )
} finally {
  await fx.teardown()
}
process.exit(0)
