// Reused from historical audit package 3b5dc1a; adapted for the current isolated target.
/** C01 role-login and captured-mail proof; raw fixture/reset credentials stay private. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
assert(file, 'Private fixture file required')
const fixture = JSON.parse(await readFile(file, 'utf8')) as {
  run: string
  password: string
  accounts: Record<
    string,
    {
      id: number
      email: string
      verified: boolean
      roles: string[]
      assignments: Array<{ subjectGrade: number; role: string }>
    }
  >
  resetLink?: string
}
assert(fixture.run.startsWith('l3audit-'))
const base = process.env.E2E_BASE_URL || 'http://app:3000'
let signedIn = 0
let refused = 0
for (const user of Object.values(fixture.accounts)) {
  const response = await fetch(`${base}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: fixture.password }),
  })
  if (user.verified) {
    assert.equal(response.status, 200, 'A verified synthetic role must sign in')
    const body = (await response.json()) as {
      token?: string
      user?: {
        id: number
        roles?: string[]
        assignments?: Array<{ subjectGrade: number | { id: number }; role: string }>
      }
    }
    assert(body.token, 'Login must return a token')
    assert.equal(body.user?.id, user.id)
    assert.deepEqual(body.user?.roles ?? [], user.roles)
    assert.deepEqual(
      (body.user?.assignments ?? []).map((row) => ({
        subjectGrade: typeof row.subjectGrade === 'object' ? row.subjectGrade.id : row.subjectGrade,
        role: row.role,
      })),
      user.assignments,
    )
    signedIn++
  } else {
    assert.equal(response.status, 403, 'The unverified fixture must be refused')
    refused++
  }
}
assert.equal(signedIn, 8)
assert.equal(refused, 1)

if (process.env.LESSON3_AUDIT_CHECK_MAIL === '1') {
  const response = await fetch(`${base}/api/users/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.accounts.teacher.email }),
  })
  assert.equal(response.status, 200)
  let found = false
  for (let attempt = 0; attempt < 60; attempt++) {
    const listing = (await (await fetch('http://mail:8025/api/v1/messages')).json()) as {
      messages: Array<{ ID: string; To: Array<{ Address: string }> }>
    }
    const captured = listing.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === fixture.accounts.teacher.email),
    )
    if (captured) {
      const message = (await (
        await fetch(`http://mail:8025/api/v1/message/${captured.ID}`)
      ).json()) as {
        HTML?: string
        Text?: string
      }
      const link = `${message.HTML ?? ''}\n${message.Text ?? ''}`.match(
        /https?:\/\/[^\s"<>]+\/reset-password\?token=[^\s"<>]+/,
      )?.[0]
      assert(link, 'Captured reset email must contain its reset link')
      const url = new URL(link)
      assert.equal(url.origin, new URL(process.env.ADMIN_URL || base).origin)
      assert.equal(url.pathname, '/reset-password')
      assert(url.searchParams.get('token'))
      fixture.resetLink = link
      await writeFile(file, JSON.stringify(fixture, null, 2), { mode: 0o600 })
      found = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert(found, 'Queued reset email must reach the internal catcher within the bounded window')
}
console.log(
  JSON.stringify({
    verifiedLogins: signedIn,
    unverifiedRefused: refused,
    capturedResetLink: process.env.LESSON3_AUDIT_CHECK_MAIL === '1',
  }),
)
