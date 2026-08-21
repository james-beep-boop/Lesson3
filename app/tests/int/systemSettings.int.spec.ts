/**
 * `system-settings` — the project's first Payload global: who may read and write it, and whether its
 * provenance survives a real write.
 *
 * ⚑ THE AUTHORIZATION HALF IS THE POINT. A global is reachable through its own REST/GraphQL routes, so
 * "the panel is only rendered for a Site Admin" is not the boundary — the same lesson D6a learned about
 * the Roles & Access picker, where the design doc was blunt that "hiding the picker is explicitly NOT
 * the fix". Every role that must be refused is asserted here, per role, rather than inferred from one.
 *
 * ⚑ AND THE PROVENANCE HALF IS ASSERTED THE WAY #258's WAS, because that is where the measuring
 * happened: field access says no to everyone and the hook is the only writer, so a client's forged
 * value must not survive and an unchanged flag must not be restamped.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'

let fx: RoleFixture

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

/** Write as a real actor, i.e. through access control rather than around it. */
const setFlags = (
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
    data: { features: { publicLibraryLive: true, outboundEmail: true } } as never,
    overrideAccess: true,
  })
  await fx?.teardown()
})

describe('system-settings: who may touch it', () => {
  it('lets a Site Administrator write it', async () => {
    await setFlags({ publicLibraryLive: false, outboundEmail: true }, fx.users.siteAdmin)
    const doc = await readSettings()
    expect((doc.features as { publicLibraryLive?: boolean }).publicLibraryLive).toBe(false)
  })

  /**
   * ⚑ EVERY OTHER ROLE, INDIVIDUALLY. A Subject Administrator is the interesting one — they administer
   * a subject-grade and legitimately write `users.assignments`, so "an admin of something" is exactly
   * the caller who might be assumed to pass. `siteAdminOnly` is the whole gate; this proves it.
   */
  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${role} writing it`, async () => {
      await expect(setFlags({ publicLibraryLive: true }, fx.users[role])).rejects.toThrow()
    })

    it(`refuses a ${role} reading it`, async () => {
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
  it('stamps who changed a flag, and only the flag that changed', async () => {
    await setFlags({ publicLibraryLive: true, outboundEmail: true }, fx.users.siteAdmin)
    // Change exactly one flag as a DIFFERENT actor, so "which row moved" is unambiguous.
    const before = await changesByFlag()
    await setFlags({ publicLibraryLive: true, outboundEmail: false }, fx.users.siteAdmin)
    const after = await changesByFlag()

    expect(after.outboundEmail?.enabled).toBe(false)
    expect(after.outboundEmail?.changedBy).toBe(fx.users.siteAdmin.id)
    expect(after.outboundEmail?.changedAt).toBeTruthy()
    // ⚑ The unchanged flag's row is untouched — a single pair for the whole global could not express
    // this, which is why provenance is per-flag (operator decision 2026-08-21).
    if (before.publicLibraryLive) {
      expect(after.publicLibraryLive?.changedAt).toBe(before.publicLibraryLive.changedAt)
    }
  })

  it('keeps one row per flag rather than growing a history', async () => {
    await setFlags({ publicLibraryLive: false, outboundEmail: true }, fx.users.siteAdmin)
    await setFlags({ publicLibraryLive: true, outboundEmail: true }, fx.users.siteAdmin)
    await setFlags({ publicLibraryLive: false, outboundEmail: true }, fx.users.siteAdmin)
    const doc = await readSettings()
    const rows = (doc.flagChanges ?? []) as FlagChange[]
    const forFlag = rows.filter((r) => r.flag === 'publicLibraryLive')
    // "Last change only" was the brief: three flips, still one row.
    expect(forFlag).toHaveLength(1)
    expect(forFlag[0]!.enabled).toBe(false)
  })

  /**
   * ⚑ THE PATH THE HOOK DOES NOT COVER, and the reason field access is load-bearing here rather than
   * belt-and-braces. `stampFlagChanges` returns early when NO flag changed — so on a write that only
   * carries `flagChanges`, the hook rewrites nothing and field access is the ONLY thing standing
   * between a forged row and the database. (#258's equivalent was different: that hook reassigned every
   * row unconditionally, so either guard alone sufficed. Here they cover different paths.)
   */
  it('ignores forged provenance even when no flag changed, where only field access can stop it', async () => {
    await setFlags({ publicLibraryLive: true, outboundEmail: true }, fx.users.siteAdmin)
    const before = await changesByFlag()
    const forgedAt = '1999-12-31T00:00:00.000Z'
    await fx.payload.updateGlobal({
      slug: 'system-settings',
      // Same feature values as above — nothing for the hook to do.
      data: {
        features: { publicLibraryLive: true, outboundEmail: true },
        flagChanges: [{ flag: 'publicLibraryLive', enabled: false, changedAt: forgedAt }],
      } as never,
      overrideAccess: false,
      user: fx.users.siteAdmin,
    })
    const after = await changesByFlag()
    expect(after.publicLibraryLive?.changedAt).not.toBe(forgedAt)
    expect(after.publicLibraryLive?.changedAt).toBe(before.publicLibraryLive?.changedAt)
    expect(after.publicLibraryLive?.enabled).toBe(before.publicLibraryLive?.enabled)
  })

  it('ignores provenance a client tries to forge', async () => {
    const forgedAt = '2000-01-01T00:00:00.000Z'
    await fx.payload.updateGlobal({
      slug: 'system-settings',
      data: {
        features: { publicLibraryLive: true, outboundEmail: true },
        flagChanges: [
          {
            flag: 'publicLibraryLive',
            enabled: true,
            changedBy: fx.users.teacher.id,
            changedAt: forgedAt,
          },
        ],
      } as never,
      overrideAccess: false,
      user: fx.users.siteAdmin,
    })
    const rows = ((await readSettings()).flagChanges ?? []) as FlagChange[]
    expect(rows.some((r) => r.changedAt === forgedAt)).toBe(false)
    expect(rows.some((r) => r.changedBy === fx.users.teacher.id)).toBe(false)
  })
})
