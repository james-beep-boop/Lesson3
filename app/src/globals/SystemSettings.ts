import type { GlobalConfig, GlobalBeforeChangeHook } from 'payload'

import { siteAdminOnly } from '../access'
import type { User } from '../payload-types'

/**
 * System settings — the runtime capability flags for THIS installation (Manage → System).
 *
 * Design: `docs/DESIGN-system-panel-2026-08-21.md`. The deployment model it sits inside — the env
 * CEILING above these flags, and why a flag is never the ceiling — is D1 of
 * `docs/DESIGN-next-direction-2026-08-19.md` plus sections A–G of
 * `docs/DESIGN-d1-deployment-amendments-2026-08-21.md`. Read those before adding a flag.
 *
 * ⚑ THE PROJECT'S FIRST PAYLOAD GLOBAL. Payload-first: globals are built in, so there is no custom
 * persistence here. Two consequences worth knowing before you extend it:
 *
 *   - `GlobalConfig.access` has **no `create`** (verified in the installed 3.87.1 source) — a global
 *     always exists, and its first write is an update. So `read` + `update` is the whole surface.
 *   - `versions: false`, deliberately. Enabling them would give a free change history, and if that is
 *     ever wanted `drafts` MUST stay false: `draft` is RESERVED in this project (SPEC §13) — it
 *     already means an unofficial saved version, and the Guide tells users their drafts live in
 *     Manage → My saved versions.
 *
 * ⚑ WHAT PR 1 DOES **NOT** DO: nothing reads these flags yet. `PUBLIC_LIBRARY_ENABLED` alone still
 * governs public discovery, and outbound email is still unconditional. The flags, their provenance and
 * their access land here so the enforcement PR is a change to readers only — no second migration, and
 * the authorization surface is provable on its own. Until then a value stored here is inert, which is
 * why the panel in PR 1 renders FACTS ONLY and shows nobody a switch that does nothing (the
 * never-render-a-toggle-for-something-absent rule, amendments §D).
 *
 * ⚑ AND WHY THERE ARE NO `studentAccess` / `studentQuiz` COLUMNS. The design doc listed them as
 * flags; on implementation that was wrong. Those features are **not built anywhere**, which is a
 * different state from "present but off" (amendments §D), and a DB column for an unbuilt feature is
 * exactly the "ship functions they will never use" the operator was arguing against. They become
 * facts-with-a-reason in the panel, needing no storage. Add a column when there is something to gate.
 */

/** The flags, as one list, so the field set and the provenance diff cannot disagree. */
export const SYSTEM_FLAGS = ['publicLibraryLive', 'outboundEmail'] as const
export type SystemFlag = (typeof SYSTEM_FLAGS)[number]

/**
 * Record who changed which flag, and when — per flag, not one pair for the whole global.
 *
 * ⚑ PER-FLAG IS THE POINT (operator decision 2026-08-21). "Last change only" was the brief, and a
 * single `changedBy`/`changedAt` pair satisfies it while answering the wrong question: *who last
 * touched settings* rather than *who turned public discovery on*. One row per flag is the same storage
 * class and a migration later.
 *
 * Same shape and the same reasoning as `users.assignments`' `grantedBy`/`grantedAt` (#258): the client
 * cannot send these — field access says no to everyone — and the hook below is the only writer. A null
 * means **unknown**, never **nobody**.
 */
const stampFlagChanges: GlobalBeforeChangeHook = ({ data, originalDoc, req }) => {
  // `!data` alone, matching `stampAssignmentProvenance`'s guard — Payload passes an object here, so
  // the `typeof` half this had was unreachable.
  if (!data) return data
  const actorId = (req.user as User | undefined)?.id
  // A userless write (seeds, system paths) leaves provenance alone rather than inventing a grantor.
  if (actorId == null) return data

  const before = (originalDoc?.features ?? {}) as Partial<Record<SystemFlag, boolean>>
  const after = (data.features ?? {}) as Partial<Record<SystemFlag, boolean>>
  const changed = SYSTEM_FLAGS.filter(
    (flag) => flag in after && Boolean(after[flag]) !== Boolean(before[flag]),
  )
  if (changed.length === 0) return data

  const now = new Date().toISOString()
  type Row = { flag: string; enabled: boolean; changedBy?: unknown; changedAt?: string }
  const kept = ((originalDoc?.flagChanges ?? []) as Row[]).filter(
    (row) => !changed.includes(row.flag as SystemFlag),
  )
  data.flagChanges = [
    ...kept,
    ...changed.map((flag) => ({
      flag,
      enabled: Boolean(after[flag]),
      changedBy: actorId,
      changedAt: now,
    })),
  ]
  return data
}

export const SystemSettings: GlobalConfig = {
  slug: 'system-settings',
  label: 'System settings',
  // Site-Admin-only both ways. ⚑ Omitting the panel from the UI is NOT the boundary — a global is
  // reachable through its own REST/GraphQL routes, the same lesson D6a learned about the picker. The
  // enforcement readers in the next PR are server-only modules using `overrideAccess: true`, because
  // the public-library route must resolve its flag with no user at all; that bypass is documented at
  // the reader, not here.
  access: { read: siteAdminOnly, update: siteAdminOnly },
  /**
   * ⚑ `hidden: true`, AND IT STAYS HIDDEN. Without it, Payload's built-in globals UI renders both
   * checkboxes and a Save button at `/admin/globals/system-settings`, reachable from the admin nav —
   * so part 1 would have shipped exactly the thing it claims not to: a live-looking switch that
   * changes nothing, because no reader consults these flags yet (amendments §D, "NEVER RENDER A
   * TOGGLE FOR SOMETHING ABSENT"). `hidden` excludes it from the nav AND the routes (verified in the
   * installed 3.87.1 `GlobalAdminOptions`).
   *
   * ⚑ AND DO NOT REMOVE IT IN PART 2, which is the tempting reading. The Manage → System panel is the
   * intended surface precisely because its Save carries a re-authentication and an `expectedUpdatedAt`
   * freshness token; the built-in form carries neither, so exposing it would leave a second writer
   * that bypasses both and make the re-auth decorative. Access control still gates the global to Site
   * Administrators either way — this is about not offering a route around the ceremony.
   */
  admin: { group: 'System', hidden: true },
  versions: false,
  hooks: { beforeChange: [stampFlagChanges] },
  fields: [
    {
      name: 'features',
      type: 'group',
      admin: {
        description:
          'Runtime capabilities. Each one sits INSIDE a deploy-time env ceiling — a flag can never grant what the environment forbids.',
      },
      fields: [
        {
          name: 'publicLibraryLive',
          type: 'checkbox',
          // ⚑ DEFAULTS TRUE, and that is not carelessness about failing closed. Fail-closed governs a
          // failed READ (absence, error, a stale cache) — not the stored default, which must preserve
          // today's behaviour so the enforcement PR is not a silent outage. And it cannot over-grant:
          // `PUBLIC_LIBRARY_ENABLED` is the ceiling, so on an installation that never set it this
          // value is unreachable regardless.
          defaultValue: true,
          label: 'Public library live',
          admin: {
            description:
              'Serve the public Explore routes. Requires PUBLIC_LIBRARY_ENABLED=1 and SERVER_URL at boot — off by env means these routes 404 whatever this says.',
          },
        },
        {
          name: 'outboundEmail',
          type: 'checkbox',
          defaultValue: true,
          label: 'Outbound email',
          admin: {
            description:
              'Send password resets, message pings and emailed documents. Requires SMTP_HOST at boot.',
          },
        },
      ],
    },
    {
      name: 'flagChanges',
      type: 'array',
      admin: { readOnly: true, description: 'System-written. The last change to each flag.' },
      // System-only, exactly as `grantedBy`/`grantedAt` are: the schema cannot say "only this path may
      // write it", so field access says no to everyone and `stampFlagChanges` is the one writer.
      access: { create: () => false, update: () => false },
      fields: [
        { name: 'flag', type: 'text', required: true },
        { name: 'enabled', type: 'checkbox' },
        {
          name: 'changedBy',
          type: 'relationship',
          relationTo: 'users',
          // ⚑ `maxDepth: 0` for the reason #258 MEASURED: a relationship into `users` populates on
          // every read at `config.defaultDepth` (2, since Payload never defaults `auth.depth`).
          // Nothing reads this populated.
          maxDepth: 0,
        },
        { name: 'changedAt', type: 'date' },
      ],
    },
  ],
}
