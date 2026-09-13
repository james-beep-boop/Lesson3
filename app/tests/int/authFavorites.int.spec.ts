import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { findPersonalFavorites } from '../../src/lib/personalFavorites.js'
import { clearRateLimitBuckets } from '../helpers/db.js'
import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'

let fx: RoleFixture
const SPOOFED_READ_AT = '2000-01-01T00:00:00.000Z'
const nonAdmins: { label: string; role: RoleKey }[] = [
  { label: 'Teacher', role: 'teacher' },
  { label: 'Teacher with editing access', role: 'editor' },
  { label: 'Subject Administrator', role: 'subjectAdmin' },
]

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  if (!fx) return
  try {
    for (const user of Object.values(fx.users)) {
      await clearRateLimitBuckets(fx.payload, `message:${user.id}`)
      await clearRateLimitBuckets(fx.payload, `messagePingRecipient:${user.id}`)
    }
  } finally {
    await fx.teardown()
  }
})

describe('native unlock Local API authorization', () => {
  let lockUntil: string
  // Generated types require password, but Payload's unlock operation ignores it. HTTP omits it.
  const unlockData = () => ({ email: fx.users.siteAdmin.email, password: '' })
  const lockState = () =>
    fx.payload.findByID({
      collection: 'users',
      id: fx.users.siteAdmin.id,
      depth: 0,
      showHiddenFields: true,
      overrideAccess: true,
    })

  beforeEach(async () => {
    lockUntil = new Date(Date.now() + 3_600_000).toISOString()
    // Seed the auth engine's private state directly, as Payload's login/unlock operations do.
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

  it.each([{ label: 'anonymous caller', role: undefined }, ...nonAdmins])(
    'refuses $label unlocking a Site Administrator without changing lock state',
    async ({ role }) => {
      await expect(
        fx.payload.unlock({
          collection: 'users',
          data: unlockData(),
          overrideAccess: false,
          req: { user: role ? { ...fx.users[role], collection: 'users' } : null },
        }),
      ).rejects.toMatchObject({ status: 403 })
      expect(await lockState()).toMatchObject({ loginAttempts: 5, lockUntil })
    },
  )

  it('allows a Site Administrator through the actual unlock operation', async () => {
    await expect(
      fx.payload.unlock({
        collection: 'users',
        data: unlockData(),
        overrideAccess: false,
        req: { user: { ...fx.users.siteAdmin, collection: 'users' } },
      }),
    ).resolves.toBe(true)
    expect(await lockState()).toMatchObject({ loginAttempts: 0, lockUntil: null })
  })
})

describe('readAt create protection through Payload field access', () => {
  it.each([...nonAdmins, { label: 'Site Administrator', role: 'siteAdmin' as const }])(
    'strips a spoofed read receipt from a $label create and preserves system marking',
    async ({ role }) => {
      const user = fx.users[role]
      const message = await fx.payload.create({
        collection: 'messages',
        data: {
          sender: user.id,
          recipient: fx.users.editor.id,
          body: `${MARK}spoofed read receipt from ${role}`,
          readAt: SPOOFED_READ_AT,
        },
        overrideAccess: false,
        user,
        depth: 0,
      })
      expect(message.readAt).toBeFalsy()
      const stored = await fx.payload.findByID({
        collection: 'messages',
        id: message.id,
        overrideAccess: true,
        depth: 0,
      })
      expect(stored.readAt).toBeFalsy()

      await expect(
        fx.payload.update({
          collection: 'messages',
          id: message.id,
          data: { readAt: SPOOFED_READ_AT },
          overrideAccess: false,
          user,
        }),
      ).rejects.toMatchObject({ status: 403 })

      const readAt = new Date().toISOString()
      const marked = await fx.payload.update({
        collection: 'messages',
        id: message.id,
        data: { readAt },
        overrideAccess: true,
      })
      expect(marked.readAt).toBe(readAt)
    },
  )

  it('still permits trusted system creates with an existing read receipt', async () => {
    const message = await fx.payload.create({
      collection: 'messages',
      data: {
        sender: fx.users.teacher.id,
        recipient: fx.users.editor.id,
        body: `${MARK}trusted read receipt`,
        readAt: SPOOFED_READ_AT,
      },
      overrideAccess: true,
    })
    expect(message.readAt).toBe(SPOOFED_READ_AT)
  })
})

describe('personal favorites versus administrative favorites access', () => {
  it("never borrows another owner's star or delete id, including for Site Administrators", async () => {
    const foreign = await fx.payload.create({
      collection: 'favorites',
      data: { user: fx.users.teacher.id, version: fx.version.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })
    const user = fx.users.siteAdmin
    expect((await findPersonalFavorites(fx.payload, { user })).docs).toEqual([])
    expect(
      (await findPersonalFavorites(fx.payload, { user, versionId: fx.version.id })).docs,
    ).toEqual([])

    const own = await fx.payload.create({
      collection: 'favorites',
      data: { user: user.id, version: fx.version.id },
      overrideAccess: false,
      user,
    })
    for (const owner of [fx.users.teacher, user]) {
      const expected = owner.id === user.id ? own : foreign
      const browse = await findPersonalFavorites(fx.payload, { user: owner })
      const detail = await findPersonalFavorites(fx.payload, {
        user: owner,
        versionId: fx.version.id,
      })
      expect(browse.docs).toEqual([{ id: expected.id, version: fx.version.id }])
      expect(detail.docs).toEqual(browse.docs)
      expect(
        (await findPersonalFavorites(fx.payload, { user: owner, versionId: 2_147_483_647 })).docs,
      ).toEqual([])
    }

    const administrative = await fx.payload.find({
      collection: 'favorites',
      where: { version: { equals: fx.version.id } },
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
    })
    expect(administrative.docs.map((row) => row.id).sort()).toEqual([foreign.id, own.id].sort())
  })
})
