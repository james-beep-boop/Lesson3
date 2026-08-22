/**
 * `system-settings` — the project's first Payload global: who may read and write it, and whether its
 * provenance survives a real write.
 *
 * ⚑ THE AUTHORIZATION HALF IS THE POINT, AND IT INVERTED ON 2026-08-21. A global is reachable through
 * its own REST/GraphQL routes, so "the panel is only rendered for a Site Admin" is not the boundary —
 * the same lesson D6a learned about the Roles & Access picker. But `update: siteAdminOnly` was not the
 * boundary either: it let a Site Administrator `POST` the global (the verb Payload routes for a global
 * update) and skip the re-authentication, the
 * freshness token, the acknowledgement and the provenance path that the Save endpoint exists to carry.
 *
 * So `update` is now `() => false` and **nobody** writes through the ordinary door. What used to be
 * this file's happy path — "lets a Site Administrator write it" — is now a REFUSAL, and the writes
 * below take the shape the Save endpoint will: `overrideAccess: true` with a real `user`, which skips
 * access control (verified: `!overrideAccess ? await executeAccess(...) : true`) while still running
 * hooks, so provenance still records the actor.
 *
 * ⚑ AND THE PROVENANCE HALF IS ASSERTED THE WAY #258's WAS, because that is where the measuring
 * happened: field access says no to everyone and the hook is the only writer, so a client's forged
 * value must not survive and an unchanged flag must not be restamped.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'

let fx: RoleFixture
/**
 * ⚑ FIXTURE KEY IS NOT A USER TYPE. `editor` is the key `setupRoleFixture` uses; the user it names is a
 * **Teacher with editing access**. CLAUDE.md and SPEC §8 are explicit that "Editor" is not one of the
 * three types and must not appear as one in prose — and a test name IS prose: it is what a person reads
 * in a failure report. (It also read "a editor".)
 */
const LABEL: Record<'subjectAdmin' | 'editor' | 'teacher', string> = {
  subjectAdmin: 'Subject Administrator',
  editor: 'Teacher with editing access',
  teacher: 'Teacher',
}

type FlagChange = {
  flag: string
  enabled?: boolean | null
  changedBy?: number | { id: number } | null
  changedAt?: string | null
}

const readSettings = async () =>
  fx.payload.findGlobal({ slug: 'system-settings', depth: 0, overrideAccess: true })

const changesByFlag = async (): Promise<Record<string, FlagChange>> => {
  const doc = await readSettings()
  const rows = ((doc.flagChanges ?? []) as FlagChange[]).map((r) => [r.flag, r] as const)
  return Object.fromEntries(rows)
}

/**
 * Write the way the Save endpoint will: trusted internal access, with the real actor attached.
 *
 * ⚑ `overrideAccess: true` is the POINT, not a shortcut around the test's own subject. `update` is
 * `() => false`, so this is the only path that can write at all — and it is exactly what the endpoint
 * does after it has authorized, rate-limited and re-authenticated the caller itself. The `user` still
 * matters: hooks are not access-gated, so `stampFlagChanges` reads it and provenance records a person
 * rather than "unknown".
 */
const setFlags = (
  features: Record<string, boolean>,
  actor: RoleFixture['users'][keyof RoleFixture['users']],
) =>
  fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features } as never,
    overrideAccess: true,
    user: actor,
  })

/** The ordinary door: access-respecting, which is what must now be shut for everyone. */
const setFlagsThroughAccess = (
  features: Record<string, boolean>,
  actor: RoleFixture['users'][keyof RoleFixture['users']],
) =>
  fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features } as never,
    overrideAccess: false,
    user: actor,
  })

beforeAll(async () => {
  fx = await setupRoleFixture()
})
afterAll(async () => {
  // Leave the global as the migration's defaults found it, so spec order cannot matter.
  await fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features: { publicLibraryLive: true } } as never,
    overrideAccess: true,
  })
  await fx?.teardown()
})

describe('system-settings: who may touch it', () => {
  /**
   * ⚑ THE INVERTED CASE, and the one that would have caught the original hole. A Site Administrator is
   * the caller everyone assumes may write settings — and that assumption is exactly what made the
   * re-authentication optional. The wire-level twin lives in `tests/http/systemSettings.http.spec.ts`.
   */
  it('refuses even a Site Administrator through the ordinary door', async () => {
    await expect(
      setFlagsThroughAccess({ publicLibraryLive: false }, fx.users.siteAdmin),
    ).rejects.toThrow()
  })

  it('permits the trusted internal path the Save endpoint will use', async () => {
    await setFlags({ publicLibraryLive: false }, fx.users.siteAdmin)
    const doc = await readSettings()
    expect((doc.features as { publicLibraryLive?: boolean }).publicLibraryLive).toBe(false)
  })

  /**
   * ⚑ EVERY OTHER ROLE, INDIVIDUALLY. A Subject Administrator is the interesting one — they administer
   * a subject-grade and legitimately write `users.assignments`, so "an admin of something" is exactly
   * the caller who might be assumed to pass. `siteAdminOnly` is the whole gate; this proves it.
   */
  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${LABEL[role]} writing it`, async () => {
      await expect(
        setFlagsThroughAccess({ publicLibraryLive: true }, fx.users[role]),
      ).rejects.toThrow()
    })

    it(`refuses a ${LABEL[role]} reading it`, async () => {
      await expect(
        fx.payload.findGlobal({
          slug: 'system-settings',
          depth: 0,
          overrideAccess: false,
          user: fx.users[role],
        }),
      ).rejects.toThrow()
    })
  }
})

describe('system-settings: per-flag provenance', () => {
  /**
   * ⚑ WHAT ONE FLAG CAN AND CANNOT PROVE. Removing `outboundEmail` took away the second flag these
   * cases used to demonstrate ISOLATION — "changing one flag does not restamp the other" is not
   * expressible with a single flag, and writing an assertion that looks like it covers that would be
   * worse than admitting the gap. So: the actor and the change are pinned here, and the isolation
   * property becomes testable again the moment a second flag exists. It is the reason provenance is
   * per-flag rather than one pair for the whole global, so it is worth re-adding then.
   */
  it('stamps who changed a flag, and what it changed to', async () => {
    await setFlags({ publicLibraryLive: true }, fx.users.siteAdmin)
    await setFlags({ publicLibraryLive: false }, fx.users.siteAdmin)
    const after = await changesByFlag()

    expect(after.publicLibraryLive?.enabled).toBe(false)
    expect(after.publicLibraryLive?.changedBy).toBe(fx.users.siteAdmin.id)
    expect(after.publicLibraryLive?.changedAt).toBeTruthy()
  })

  /**
   * ⚑ A USERLESS WRITE MUST NOT LEAVE A LIE. Seeds and system paths write with `overrideAccess: true`
   * and no `user`, so there is nobody to attribute a change to. The hook first handled that by keeping
   * the stored rows untouched — which meant a userless write that CHANGED a flag left provenance
   * asserting the old value and naming a person who did not make the change (operator review,
   * 2026-08-21). False audit data on the record an operator consults precisely when they distrust the
   * state.
   *
   * The contract: a changed flag loses its row, so absent means UNKNOWN — the same meaning a null
   * `changedBy` carries everywhere else. An UNCHANGED flag keeps its history, because nothing about it
   * became doubtful.
   */
  it('drops provenance for a flag a USERLESS write changed, rather than keeping a stale actor', async () => {
    // A known, attributed starting point.
    await setFlags({ publicLibraryLive: true }, fx.users.siteAdmin)
    const before = await changesByFlag()
    expect(before.publicLibraryLive?.changedBy, 'precondition: the row names someone').toBe(
      fx.users.siteAdmin.id,
    )

    // Now the same flag changes with no actor at all.
    await fx.payload.updateGlobal({
      slug: 'system-settings',
      data: { features: { publicLibraryLive: false } } as never,
      overrideAccess: true,
      // no `user`
    })

    const after = await readSettings()
    expect(
      (after.features as { publicLibraryLive?: boolean }).publicLibraryLive,
      'the flag itself still changed',
    ).toBe(false)
    const rows = (after.flagChanges ?? []) as FlagChange[]
    expect(
      rows.find((r) => r.flag === 'publicLibraryLive'),
      'a row here would assert the OLD value and name someone who did not do it',
    ).toBeUndefined()
  })

  it('keeps one row per flag rather than growing a history', async () => {
    await setFlags({ publicLibraryLive: false }, fx.users.siteAdmin)
    await setFlags({ publicLibraryLive: true }, fx.users.siteAdmin)
    await setFlags({ publicLibraryLive: false }, fx.users.siteAdmin)
    const doc = await readSettings()
    const rows = (doc.flagChanges ?? []) as FlagChange[]
    const forFlag = rows.filter((r) => r.flag === 'publicLibraryLive')
    // "Last change only" was the brief: three flips, still one row.
    expect(forFlag).toHaveLength(1)
    expect(forFlag[0]!.enabled).toBe(false)
  })

  /**
   * ⚑ THE CASE THAT FOUND A REAL HOLE, and it is worth reading before touching the hook.
   *
   * Field access on `changedBy`/`changedAt` is `() => false`, which stops a client writing them through
   * the ordinary door. But `overrideAccess: true` bypasses FIELD access as well as collection access —
   * and that is the path the Save endpoint uses. So when this case was first written against the
   * trusted path, the forged timestamp LANDED: the hook returned early because no flag had moved, and
   * nothing else was left to stop it.
   *
   * The fix was to make the hook own `flagChanges` on every write rather than only when a flag moves.
   * This case now pins that ownership on the one path that will carry real traffic.
   */
  it('ignores forged provenance on the TRUSTED path, where field access does not apply', async () => {
    await setFlags({ publicLibraryLive: true }, fx.users.siteAdmin)
    const before = await changesByFlag()
    const forgedAt = '1999-12-31T00:00:00.000Z'
    await fx.payload.updateGlobal({
      slug: 'system-settings',
      // Same feature values as above — nothing for the hook to do.
      data: {
        features: { publicLibraryLive: true },
        // Both keys forged: a self-serving grantor AND an invented timestamp.
        flagChanges: [
          {
            flag: 'publicLibraryLive',
            enabled: false,
            changedBy: fx.users.teacher.id,
            changedAt: forgedAt,
          },
        ],
      } as never,
      // ⚑ The trusted path, because the ordinary one is now shut. An earlier version of this comment
      // credited FIELD access with stripping the forged row — it does not: `overrideAccess: true`
      // bypasses field access as well as collection access, which is the whole discovery. The HOOK is
      // what strips it, by owning `flagChanges` on every write.
      overrideAccess: true,
      user: fx.users.siteAdmin,
    })
    const after = await changesByFlag()
    expect(after.publicLibraryLive?.changedAt).not.toBe(forgedAt)
    expect(after.publicLibraryLive?.changedAt).toBe(before.publicLibraryLive?.changedAt)
    expect(after.publicLibraryLive?.enabled).toBe(before.publicLibraryLive?.enabled)
    expect(after.publicLibraryLive?.changedBy).toBe(before.publicLibraryLive?.changedBy)
    expect(after.publicLibraryLive?.changedBy).not.toBe(fx.users.teacher.id)
  })
})
