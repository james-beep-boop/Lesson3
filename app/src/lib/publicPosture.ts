/**
 * Public-exposure posture helpers (Phase 5 A5 — the pre-VPS checklist's two code guards).
 *
 * `SERVER_URL` doubles as the public-posture signal: setting it opts into Payload's strict CSRF
 * allowlist (see payload.config.ts), and these helpers hang the other two exposure invariants off
 * the same switch so the checklist can't be half-applied:
 *
 *   1. Secure auth cookies — an https SERVER_URL means the auth cookie must refuse plaintext
 *      transport (Codex 2026-07-05 #1's "Secure-cookie check", made structural rather than a
 *      runbook step someone has to remember).
 *   2. No first-user window while public — on an EMPTY users table, Payload's unauthenticated
 *      `first-register` creates user #1 as Site Admin (grantSiteAdminToFirstUser; empirically
 *      verified 2026-07-05: 200 + roles:['siteAdmin'] on a fresh DB). Private bootstrap relies on
 *      that; a public host must never expose it, so boot REFUSES when SERVER_URL is set and no
 *      users exist. Seed users first (restore a backup / create the admin in a private window),
 *      or set ALLOW_FIRST_USER_BOOTSTRAP=1 for one deliberate boot (same escape-hatch pattern as
 *      deploy.sh's ALLOW_UNBACKED_DEPLOY). See docs/OPS.md "Going public".
 *
 * Pure functions — the wiring calls live in collections/Users.ts (cookie) and payload.config.ts
 * onInit (boot check); tests/unit/publicPosture.spec.ts pins both.
 */

/** True when the configured base URL commits us to TLS (https). */
export const isHttpsServerUrl = (serverUrl: string | undefined): boolean =>
  Boolean(serverUrl?.startsWith('https://'))

/**
 * Decide whether boot may proceed for a given (posture, user-count) combination.
 * Returns null to proceed, or the refusal message to throw. `userCount === null` means the count
 * could not be taken (e.g. the very first migrate against an empty database, before the users
 * table exists) — enforcement is skipped rather than bricking schema creation.
 */
export function firstUserBootRefusal(opts: {
  serverUrl: string | undefined
  userCount: number | null
  allowBootstrap: boolean
}): string | null {
  const { serverUrl, userCount, allowBootstrap } = opts
  if (!serverUrl) return null // private posture — bootstrap via first-register is the design
  if (userCount === null || userCount > 0) return null
  if (allowBootstrap) return null
  return (
    'SERVER_URL is set (public posture) but the users table is EMPTY — refusing to boot, because ' +
    "Payload's unauthenticated first-register would hand Site Admin to the first visitor. Seed " +
    'users first (restore a backup, or create the admin while unexposed), or set ' +
    'ALLOW_FIRST_USER_BOOTSTRAP=1 for one deliberate bootstrap boot. See docs/OPS.md "Going public".'
  )
}
