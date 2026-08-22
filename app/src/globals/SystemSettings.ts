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

/**
 * The flags, as one list, so the field set and the provenance diff cannot disagree.
 *
 * ⚑ `outboundEmail` WAS REMOVED, not renamed (operator decision 2026-08-22, while nothing read it). It
 * failed its own standard — a label asserting what the code does not do. Enqueue-gating leaves
 * already-queued mail to send, so it never was an egress control; and it bundled account verification
 * and password reset, which are how an account stays REACHABLE, with message pings and emailed
 * documents, which are conveniences. Turning it off with open registration live could mint accounts
 * that can never verify and make a reset request look successful while deliberately producing nothing.
 * A narrower notification-only flag may return once that design exists — renaming this one would have
 * preserved a decision nobody had earned. `docs/DESIGN-system-panel-2026-08-21.md` holds the open
 * question.
 */
export const SYSTEM_FLAGS = ['publicLibraryLive'] as const
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

  type Row = { flag: string; enabled: boolean; changedBy?: unknown; changedAt?: string }
  const stored = (originalDoc?.flagChanges ?? []) as Row[]
  const before = (originalDoc?.features ?? {}) as Partial<Record<SystemFlag, boolean>>
  const after = (data.features ?? {}) as Partial<Record<SystemFlag, boolean>>
  const changed = SYSTEM_FLAGS.filter(
    (flag) => flag in after && Boolean(after[flag]) !== Boolean(before[flag]),
  )
  const kept = stored.filter((row) => !changed.includes(row.flag as SystemFlag))
  const actorId = (req.user as User | undefined)?.id

  /**
   * ⚑ ALWAYS REASSIGN `flagChanges`, even when nothing changed — this hook OWNS the field, and an
   * incoming value must never survive.
   *
   * ⚑ THIS IS THE ONLY THING PROTECTING PROVENANCE ON THE TRUSTED PATH, and discovering that is what
   * this rewrite is for. The field access below is `create/update: () => false`, which stops a client
   * writing these keys through the ordinary door — but `overrideAccess: true` bypasses FIELD access as
   * well as collection access, and the Save endpoint writes on exactly that path. So the earlier
   * version, which returned early whenever no flag had moved, let a forged `flagChanges` array through
   * untouched on the one path that will carry real traffic. An int case now pins it.
   *
   * Rebuilding from `originalDoc` rather than trusting `data` also means the endpoint does not have to
   * remember to strip the key: it can pass a whole body and provenance is still ours. That is
   * defence-in-depth for the design's separate requirement that the endpoint validate an explicit flag
   * allowlist rather than passing a body through — belt AND braces, because this one is cheap.
   */
  if (actorId == null) {
    // A userless write (seeds, system paths) records nothing new but still may not be told what the
    // history is — keep exactly what was stored.
    data.flagChanges = stored
    return data
  }

  const now = new Date().toISOString()
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
  /**
   * ⚑ NOBODY UPDATES THIS THROUGH THE ORDINARY DOOR — not even a Site Administrator.
   *
   * `update: siteAdminOnly` (what part 1 shipped) made every ceremony the panel specifies OPTIONAL: a
   * Site Administrator could `PATCH /api/globals/system-settings` and skip the password
   * re-authentication, the `expectedUpdatedAt` freshness token, the public-exposure acknowledgement and
   * the provenance path. Re-authentication that a plain REST call walks past is UI theatre, so the
   * custom Save endpoint has to be the SOLE writer (operator blocker, 2026-08-22).
   *
   * ⚑ `admin: { hidden: true }` DID NOT DO THIS, and I said it did. Verified in the installed 3.87.1
   * source: `globals/operations/update.js` never consults `admin.hidden` — it gates on `executeAccess`
   * alone. Hiding the global removed the admin FORM and left the API wide open, which is a narrowed
   * surface reported as a closed door.
   *
   * ⚑ AND THE TRUSTED PATH SURVIVES, which is why `() => false` is the right shape rather than a
   * clever predicate. That same line reads `!overrideAccess ? await executeAccess(...) : true`, so
   * `payload.updateGlobal({ overrideAccess: true, user })` bypasses this check entirely — and hooks are
   * NOT access-gated, so `stampFlagChanges` still runs and still stamps the real actor. The future Save
   * endpoint authorizes, rate-limits, re-authenticates and validates FIRST, then writes on that path.
   * Read stays Site-Admin-only for the panel; the enforcement readers are server-only modules that use
   * `overrideAccess: true` because the public route must resolve its flag with no user at all.
   */
  access: { read: siteAdminOnly, update: () => false },
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
