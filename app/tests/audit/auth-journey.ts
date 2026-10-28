/** Native auth journey against the exclusive disposable target and local mail capture only. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { url } from '../helpers/httpWire'
const payload = await getPayload({ config })
const email = `audit-auth-${randomUUID()}@lesson3.local`
const password = 'audit-original-password'
const changed = 'audit-replacement-password'
const origin = 'http://localhost:3118'
let id: number | undefined
const checks: { check: string; status?: number; passed: boolean }[] = []
const record = (check: string, passed: boolean, status?: number) => {
  checks.push({ check, passed, status })
  assert.ok(passed, check)
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  })
async function tokenFor(pass: string) {
  const r = await post('/api/users/login', { email, password: pass })
  assert.equal(r.status, 200)
  return { response: r, body: (await r.json()) as { token: string } }
}
async function signedIn(token: string) {
  const r = await fetch(url('/api/users/me'), { headers: { Authorization: `JWT ${token}` } })
  const b = (await r.json()) as { user?: { id: number } | null }
  return b.user?.id === id
}
async function capturedToken(kind: 'verify-email' | 'reset-password') {
  const until = Date.now() + 120000
  while (Date.now() < until) {
    const search = await fetch(
      `http://mail:8025/api/v1/search?query=${encodeURIComponent('to:' + email)}`,
    )
    const box = (await search.json()) as { messages?: { ID: string; Subject: string }[] }
    for (const m of box.messages ?? []) {
      if (!(kind === 'verify-email' ? m.Subject.includes('Verify') : m.Subject.includes('Reset')))
        continue
      const response = await fetch(`http://mail:8025/api/v1/message/${m.ID}`)
      const message = (await response.json()) as { HTML?: string; Text?: string }
      const text = message.HTML ?? message.Text ?? ''
      const re = new RegExp(`https?://[^"<>\\s]+/${kind}\\?token=[^"<>\\s]+`)
      const match = text.match(re)?.[0]
      if (match) {
        const link = new URL(match.replaceAll('&amp;', '&'))
        assert.equal(
          link.origin,
          origin,
          'Captured email link must use configured administrator host',
        )
        const token = link.searchParams.get('token')
        assert.ok(token)
        return token
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Expected auth message did not reach the isolated mail capture within120 seconds')
}
try {
  const signup = await post('/api/users', {
    name: 'Audit email journey',
    email,
    password,
    roles: ['siteAdmin'],
    _verified: true,
  })
  assert.equal(signup.status, 201)
  id = ((await signup.json()) as { doc: { id: number } }).doc.id
  const user = await payload.findByID({ collection: 'users', id, overrideAccess: true, depth: 0 })
  record(
    'signup cannot self-verify or grant site administration',
    !user._verified && !user.roles?.includes('siteAdmin'),
  )
  const denied = await post('/api/users/login', { email, password })
  record('unverified login refused', denied.status === 403, denied.status)
  const verification = await capturedToken('verify-email')
  const verify = await post(`/api/users/verify/${encodeURIComponent(verification)}`, {})
  record('captured verification link works', verify.status === 200, verify.status)
  const reused = await post(`/api/users/verify/${encodeURIComponent(verification)}`, {})
  record('verification token single use', reused.status >= 400, reused.status)
  const a = await tokenFor(password)
  const b = await tokenFor(password)
  record(
    'two native sessions work concurrently',
    (await signedIn(a.body.token)) && (await signedIn(b.body.token)),
  )
  const cookie = a.response.headers.get('set-cookie') ?? ''
  record(
    'HTTP cookie is HttpOnly and SameSite Lax',
    /httponly/i.test(cookie) &&
      /samesite=lax/i.test(cookie) &&
      !/(?:^|;)\s*secure(?:;|$)/i.test(cookie),
  )
  const initial = await payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
    depth: 0,
  })
  const foreign = await fetch(url(`/api/users/${id}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://foreign.invalid',
      Cookie: `payload-token=${a.body.token}`,
    },
    body: JSON.stringify({ name: 'Audit forbidden foreign write' }),
  })
  const afterForeign = await payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
    depth: 0,
  })
  record(
    'foreign-origin cookie write denied before mutation',
    foreign.status === 403 &&
      afterForeign.name === initial.name &&
      afterForeign.updatedAt === initial.updatedAt,
    foreign.status,
  )
  const allowed = await fetch(url(`/api/users/${id}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: `payload-token=${a.body.token}`,
    },
    body: JSON.stringify({ name: 'Audit trusted-origin write' }),
  })
  record(
    'trusted-origin positive write control',
    allowed.status === 200 &&
      (await payload.findByID({ collection: 'users', id, overrideAccess: true, depth: 0 })).name ===
        'Audit trusted-origin write',
    allowed.status,
  )
  const logout = await post('/api/users/logout', {}, { Authorization: `JWT ${a.body.token}` })
  record(
    'logout revokes only its native session',
    logout.status === 200 && !(await signedIn(a.body.token)) && (await signedIn(b.body.token)),
    logout.status,
  )
  const known = await post('/api/users/forgot-password', { email })
  const unknown = await post('/api/users/forgot-password', {
    email: `unknown-${randomUUID()}@lesson3.local`,
  })
  record(
    'forgot-password pair has identical status and body',
    known.status === unknown.status &&
      JSON.stringify(await known.json()) === JSON.stringify(await unknown.json()),
    known.status,
  )
  const resetToken = await capturedToken('reset-password')
  const resetPage = await fetch(url(`/reset-password?token=${encodeURIComponent(resetToken)}`))
  record(
    'reset page strips cross-origin referrer query',
    resetPage.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
    resetPage.status,
  )
  const reset = await post('/api/users/reset-password', { token: resetToken, password: changed })
  record('captured reset link changes password', reset.status === 200, reset.status)
  record('reset revokes the other old native session', !(await signedIn(b.body.token)))
  const oldLogin = await post('/api/users/login', { email, password })
  record('old password fails after reset', oldLogin.status !== 200, oldLogin.status)
  const fresh = await tokenFor(changed)
  record('new password authenticates', await signedIn(fresh.body.token))
  const used = await post('/api/users/reset-password', {
    token: resetToken,
    password: 'audit-unwanted-reuse',
  })
  record('reset token single use', used.status >= 400, used.status)
  console.log(
    JSON.stringify({
      source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
      checks,
      passed: checks.filter((c) => c.passed).length,
      mode: 'isolated HTTP host with configured CSRF origin and capture-only SMTP',
    }),
  )
} finally {
  if (id) await payload.delete({ collection: 'users', id, overrideAccess: true })
  await payload.destroy()
}
process.exit(0)
