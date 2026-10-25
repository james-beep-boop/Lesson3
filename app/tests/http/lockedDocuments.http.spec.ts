/**
 * Wire-level authorization for Payload's GENERATED native-lock collection (`payload-locked-documents`).
 *
 * ⚑ WHY THIS FILE EXISTS. Payload generates the collection with any-signed-in-user create/read/
 * update/delete, and REST deletes of a locked document answer 423. The 2026-10-24 audit (F-C22-002,
 * confirmed at runtime) found that any Teacher could POST a lock in anyone's name and keep an
 * administrator's delete failing. The fix is `access/lockedDocuments.ts`, applied on the built config
 * by `access/generatedSurfaces.ts`; the operator's decisions are DECISIONS 2026-10-24 "Native
 * document locks". This file proves it at the wire, and keeps the two things the native editing UI
 * needs as positive controls: Take over (a PATCH of another holder's row, to yourself) and unlock on
 * leave (the holder's own DELETE).
 *
 * Locks are seeded on the TRUSTED path (`overrideAccess`), which is how Payload's editing form writes
 * them (`payload.db.create`), so each case starts from a lock that could really exist.
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, over the real
 * network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  createVersionFixture,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'
import { LOCKED_DOCUMENTS_SLUG } from '../../src/access/lockedDocuments.js'
import { DOCUMENT_LOCKED_MESSAGE } from '../../src/lib/wireError.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

/**
 * ⚑ FIXTURE KEY IS NOT A USER TYPE. `editor` is the key `setupRoleFixture` uses; the user it names is a
 * **Teacher with editing access** (CLAUDE.md, SPEC §8). Test names are prose, so they use the label.
 */
const LABEL: Record<RoleKey, string> = {
  siteAdmin: 'Site Administrator',
  subjectAdmin: 'Subject Administrator',
  editor: 'Teacher with editing access',
  teacher: 'Teacher',
}

let fx: RoleFixture
const token: Record<string, string> = {}
let semverSeq = 0

type LockRow = { id: number; user?: { value?: number | { id: number } } }

async function wire(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  as?: RoleKey,
  body?: unknown,
): Promise<Response> {
  const authToken = as ? token[as] : undefined
  if (as && !authToken) throw new Error(`no token for ${as} — fixture login did not complete`)
  return fetch(url(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `JWT ${authToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** A lock on a version, written the way the editing form writes one. */
async function seedLock(holder: RoleKey, versionId = fx.version.id): Promise<LockRow> {
  return (await fx.payload.create({
    collection: LOCKED_DOCUMENTS_SLUG,
    data: {
      document: { relationTo: 'lesson-bundle-versions', value: versionId },
      user: { relationTo: 'users', value: fx.users[holder].id },
    },
    overrideAccess: true,
  })) as unknown as LockRow
}

/** Read on the trusted path, so assertions cannot be fooled by the access rules under test. */
async function storedLock(id: number): Promise<LockRow | null> {
  return (await fx.payload
    .findByID({ collection: LOCKED_DOCUMENTS_SLUG, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as LockRow | null
}

const holderOf = (lock: LockRow | null) =>
  typeof lock?.user?.value === 'object' ? lock.user.value.id : lock?.user?.value

const allLocks = async () =>
  (
    await fx.payload.find({
      collection: LOCKED_DOCUMENTS_SLUG,
      depth: 0,
      limit: 1000,
      overrideAccess: true,
      pagination: false,
    })
  ).docs as unknown as LockRow[]

let locksBefore: Set<number>

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens: string[] = []
  for (const k of ROLES) tokens.push(await login(fx.users[k].email, fx.password))
  ROLES.forEach((k, i) => (token[k] = tokens[i]!))
  locksBefore = new Set((await allLocks()).map((lock) => lock.id))
})

// Remove only the lock rows this file created, so each case starts unlocked.
afterEach(async () => {
  for (const lock of await allLocks()) {
    if (!locksBefore.has(lock.id)) {
      await fx.payload.delete({
        collection: LOCKED_DOCUMENTS_SLUG,
        id: lock.id,
        overrideAccess: true,
      })
    }
  }
})

afterAll(async () => {
  await fx?.teardown()
})

describe('creating a lock over the API — nobody', () => {
  for (const role of ROLES) {
    it(`refuses a ${LABEL[role]} creating a lock, even in their own name`, async () => {
      const res = await wire('POST', `/api/${LOCKED_DOCUMENTS_SLUG}`, role, {
        document: { relationTo: 'lesson-bundle-versions', value: fx.version.id },
        user: { relationTo: 'users', value: fx.users[role].id },
      })
      expect(res.status, 'locks come only from the editing form').toBe(403)
      expect(await allLocks(), 'the refused lock must not exist').toHaveLength(locksBefore.size)
    })
  }

  it('refuses a Teacher creating a lock in a Site Administrator’s name (the audit’s forgery)', async () => {
    const res = await wire('POST', `/api/${LOCKED_DOCUMENTS_SLUG}`, 'teacher', {
      document: { relationTo: 'lesson-bundle-versions', value: fx.version.id },
      user: { relationTo: 'users', value: fx.users.siteAdmin.id },
    })
    expect(res.status).toBe(403)
    expect(await allLocks()).toHaveLength(locksBefore.size)
  })

  it('refuses an unauthenticated create', async () => {
    // ⚑ NOT 404, which would mean the route is unrouted and the test is probing nothing.
    const res = await wire('POST', `/api/${LOCKED_DOCUMENTS_SLUG}`, undefined, {
      document: { relationTo: 'lesson-bundle-versions', value: fx.version.id },
      user: { relationTo: 'users', value: fx.users.siteAdmin.id },
    })
    expect([401, 403]).toContain(res.status)
    expect(await allLocks()).toHaveLength(locksBefore.size)
  })
})

describe('reading locks — every signed-in user (decision 1)', () => {
  it('lets a Teacher see a real lock, so the "Document locked" warning keeps working', async () => {
    const lock = await seedLock('editor')
    const res = await wire(
      'GET',
      `/api/${LOCKED_DOCUMENTS_SLUG}?where[document.relationTo][equals]=lesson-bundle-versions&where[document.value][equals]=${fx.version.id}&depth=0`,
      'teacher',
    )
    expect(res.status).toBe(200)
    const { docs } = (await res.json()) as { docs: LockRow[] }
    expect(docs.map((doc) => doc.id)).toContain(lock.id)
  })
})

describe('Take over — only to yourself, only where you may edit', () => {
  it('lets a Subject Administrator take over a peer’s lock (positive control)', async () => {
    const lock = await seedLock('editor')
    const res = await wire('PATCH', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'subjectAdmin', {
      user: { relationTo: 'users', value: fx.users.subjectAdmin.id },
    })
    expect(res.status, 'native Take over must keep working').toBe(200)
    expect(holderOf(await storedLock(lock.id))).toBe(fx.users.subjectAdmin.id)
  })

  it('lets a Teacher with editing access take over a peer’s lock (positive control)', async () => {
    const lock = await seedLock('subjectAdmin')
    const res = await wire('PATCH', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'editor', {
      user: { relationTo: 'users', value: fx.users.editor.id },
    })
    expect(res.status).toBe(200)
    expect(holderOf(await storedLock(lock.id))).toBe(fx.users.editor.id)
  })

  it('refuses handing a lock to somebody else', async () => {
    const lock = await seedLock('editor')
    const res = await wire('PATCH', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'subjectAdmin', {
      user: { relationTo: 'users', value: fx.users.siteAdmin.id },
    })
    expect(res.status).toBe(403)
    expect(holderOf(await storedLock(lock.id))).toBe(fx.users.editor.id)
  })

  it('refuses a Teacher, who cannot edit the version, taking over', async () => {
    const lock = await seedLock('editor')
    const res = await wire('PATCH', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'teacher', {
      user: { relationTo: 'users', value: fx.users.teacher.id },
    })
    expect(res.status).toBe(403)
    expect(holderOf(await storedLock(lock.id))).toBe(fx.users.editor.id)
  })

  it('refuses a Take over that also moves the lock to another document', async () => {
    const lock = await seedLock('editor')
    const res = await wire('PATCH', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'subjectAdmin', {
      user: { relationTo: 'users', value: fx.users.subjectAdmin.id },
      document: { relationTo: 'lesson-plans', value: fx.plan.id },
    })
    expect(res.status).toBe(403)
    expect(holderOf(await storedLock(lock.id))).toBe(fx.users.editor.id)
  })

  it('refuses an unauthenticated Take over', async () => {
    const lock = await seedLock('editor')
    const res = await wire('PATCH', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, undefined, {
      user: { relationTo: 'users', value: fx.users.siteAdmin.id },
    })
    expect([401, 403]).toContain(res.status)
    expect(holderOf(await storedLock(lock.id))).toBe(fx.users.editor.id)
  })
})

describe('unlocking — the holder’s own lock only', () => {
  it('lets the holder remove their own lock on leaving (positive control)', async () => {
    const lock = await seedLock('editor')
    const res = await wire('DELETE', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'editor')
    expect(res.status).toBe(200)
    expect(await storedLock(lock.id)).toBeNull()
  })

  for (const role of ['teacher', 'subjectAdmin', 'siteAdmin'] as const) {
    it(`refuses a ${LABEL[role]} deleting someone else’s lock`, async () => {
      const lock = await seedLock('editor')
      const res = await wire('DELETE', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, role)
      // Payload answers a row outside the caller's delete scope as not found.
      expect([403, 404]).toContain(res.status)
      expect(await storedLock(lock.id), 'the lock must survive').not.toBeNull()
    })
  }
})

describe('App deletes honour a real lock (decision 3)', () => {
  it('refuses deleting a version someone has open, with 423, and allows it once they leave', async () => {
    const candidate = await createVersionFixture(fx.payload, {
      planId: fx.plan.id,
      subjectGradeId: fx.subjectGrade.id,
      semver: `61.${++semverSeq}.0`,
    })
    const lock = await seedLock('editor', candidate.id)

    const refused = await wire(
      'DELETE',
      `/api/lesson-bundle-versions/${candidate.id}`,
      'subjectAdmin',
    )
    // 423 is what the App's three delete buttons translate into DOCUMENT_LOCKED_MESSAGE.
    expect(refused.status, DOCUMENT_LOCKED_MESSAGE).toBe(423)
    expect(
      await fx.payload
        .findByID({ collection: 'lesson-bundle-versions', id: candidate.id, overrideAccess: true })
        .catch(() => null),
      'the version must survive',
    ).not.toBeNull()

    expect(
      (await wire('DELETE', `/api/${LOCKED_DOCUMENTS_SLUG}/${lock.id}`, 'editor')).status,
    ).toBe(200)
    expect(
      (await wire('DELETE', `/api/lesson-bundle-versions/${candidate.id}`, 'subjectAdmin')).status,
    ).toBe(200)
  })
})
