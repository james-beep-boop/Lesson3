import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Message } from '../../src/payload-types.js'
import { clearRateLimitBuckets } from '../helpers/db.js'
import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'

let fx: RoleFixture
const tokens: Partial<Record<RoleKey, string>> = {}
const SPOOFED_READ_AT = '2000-01-01T00:00:00.000Z'
const roles: { label: string; role: RoleKey }[] = [
  { label: 'Teacher', role: 'teacher' },
  { label: 'Teacher with editing access', role: 'editor' },
  { label: 'Subject Administrator', role: 'subjectAdmin' },
  { label: 'Site Administrator', role: 'siteAdmin' },
]

const headers = (role?: RoleKey): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(role ? { Authorization: `JWT ${tokens[role]}` } : {}),
})
const post = (path: string, body: unknown, role?: RoleKey) =>
  fetch(url(path), { method: 'POST', headers: headers(role), body: JSON.stringify(body) })
const readMessage = (id: number) =>
  fx.payload.findByID({ collection: 'messages', id, overrideAccess: true, depth: 0 })

beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const { role } of roles) tokens[role] = await login(fx.users[role].email, fx.password)
})

afterAll(async () => {
  if (!fx) return
  try {
    for (const user of Object.values(fx.users)) {
      await clearRateLimitBuckets(fx.payload, `message:${user.id}`)
      await clearRateLimitBuckets(fx.payload, `messagePingRecipient:${user.id}`)
      await clearRateLimitBuckets(fx.payload, `login:${user.email.toLowerCase()}`)
    }
  } finally {
    await fx.teardown()
  }
})

describe('POST /api/users/unlock', () => {
  let lockUntil: string
  const lockState = () =>
    fx.payload.findByID({
      collection: 'users',
      id: fx.users.siteAdmin.id,
      overrideAccess: true,
      showHiddenFields: true,
      depth: 0,
    })

  beforeEach(async () => {
    lockUntil = new Date(Date.now() + 3_600_000).toISOString()
    // Existing JWTs remain valid during a password-login lock; seed only the target's lock state.
    await fx.payload.db.updateOne({
      collection: 'users',
      id: fx.users.siteAdmin.id,
      data: { loginAttempts: 5, lockUntil },
    })
  })

  afterEach(async () => {
    await fx.payload.db.updateOne({
      collection: 'users',
      id: fx.users.siteAdmin.id,
      data: { loginAttempts: 0, lockUntil: null },
    })
  })

  it.each([
    { label: 'anonymous caller', role: undefined },
    ...roles.filter(({ role }) => role !== 'siteAdmin'),
  ])('403 for $label, leaving the Site Administrator locked', async ({ role }) => {
    // Native Payload access denials are 403, including anonymous callers (not custom-route 401).
    const res = await post('/api/users/unlock', { email: fx.users.siteAdmin.email }, role)
    expect(res.status).toBe(403)
    expect(await lockState()).toMatchObject({ loginAttempts: 5, lockUntil })
  })

  it('allows a Site Administrator and clears both lock fields', async () => {
    const res = await post('/api/users/unlock', { email: fx.users.siteAdmin.email }, 'siteAdmin')
    expect(res.status).toBe(200)
    expect(await lockState()).toMatchObject({ loginAttempts: 0, lockUntil: null })
  })

  it('keeps the native unknown-email 403 response without changing another account', async () => {
    const res = await post('/api/users/unlock', { email: `${MARK}absent@example.com` }, 'siteAdmin')
    expect(res.status).toBe(403)
    expect(await lockState()).toMatchObject({ loginAttempts: 5, lockUntil })
  })
})

describe('message read receipts over HTTP', () => {
  it('403s anonymous message creation even with a forged receipt', async () => {
    const res = await post('/api/messages', {
      recipient: fx.users.editor.id,
      body: `${MARK}anonymous spoof`,
      readAt: SPOOFED_READ_AT,
    })
    expect(res.status).toBe(403)
  })

  it.each(roles)(
    'strips readAt from a $label create in both response and storage',
    async ({ role }) => {
      const res = await post(
        '/api/messages?depth=0',
        {
          recipient: fx.users.editor.id,
          body: `${MARK}wire read receipt spoof`,
          readAt: SPOOFED_READ_AT,
        },
        role,
      )
      expect(res.status).toBe(201)
      const { doc } = (await res.json()) as { doc: Message }
      expect(doc.readAt).toBeFalsy()
      expect((await readMessage(doc.id)).readAt).toBeFalsy()

      const patch = await fetch(url(`/api/messages/${doc.id}`), {
        method: 'PATCH',
        headers: headers(role),
        body: JSON.stringify({ readAt: SPOOFED_READ_AT }),
      })
      expect(patch.status).toBe(403)
      expect((await readMessage(doc.id)).readAt).toBeFalsy()
    },
  )

  it("only marks the recipient's selected messages, preserving foreign and already-read rows", async () => {
    const create = async (recipient: number) => {
      const res = await post(
        '/api/messages?depth=0',
        { recipient, body: `${MARK}recipient-only mark`, readAt: SPOOFED_READ_AT },
        'teacher',
      )
      expect(res.status).toBe(201)
      return ((await res.json()) as { doc: Message }).doc
    }
    const mine = await create(fx.users.editor.id)
    const foreign = await create(fx.users.subjectAdmin.id)
    const body = { ids: [mine.id, foreign.id, 2_147_483_647], readAt: SPOOFED_READ_AT }

    expect((await post('/api/messages/mark-read', body)).status).toBe(401)
    for (const role of ['teacher', 'siteAdmin'] as const) {
      const res = await post('/api/messages/mark-read', body, role)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, updated: 0 })
    }
    expect((await readMessage(mine.id)).readAt).toBeFalsy()
    expect((await readMessage(foreign.id)).readAt).toBeFalsy()

    const marked = await post('/api/messages/mark-read', body, 'editor')
    expect(marked.status).toBe(200)
    expect(await marked.json()).toEqual({ ok: true, updated: 1 })
    const readAt = (await readMessage(mine.id)).readAt
    expect(Number.isFinite(Date.parse(readAt!))).toBe(true)
    expect(readAt).not.toBe(SPOOFED_READ_AT)
    expect((await readMessage(foreign.id)).readAt).toBeFalsy()

    const repeated = await post('/api/messages/mark-read', body, 'editor')
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toEqual({ ok: true, updated: 0 })
    expect((await readMessage(mine.id)).readAt).toBe(readAt)
  })
})
