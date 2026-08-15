/**
 * Public-discovery deployment mode (SPEC §2 "Deployment modes and public discovery";
 * `docs/DESIGN-public-library.md` is the full brief).
 *
 * This product runs in two materially different settings: an internet service meant to put lesson
 * plans in front of as many teachers as possible, and local school servers that may have no internet
 * connection at all. Public discovery belongs to the first and must be absent from the second — not
 * merely hidden, absent: no Explore action, and 404 from every public route.
 *
 * ⚑ **NOT DERIVED FROM `SERVER_URL`.** That variable already owns the public *security* posture —
 * strict CSRF, Secure cookies, the empty-users boot refusal (`lib/publicPosture.ts`) — and coupling a
 * *product* decision to it would mean neither could be set without the other. An internet deployment
 * that does not want a public library is an ordinary, supported configuration.
 *
 * ⚑ **HIDING THE BUTTON IS NOT THE BOUNDARY.** Every public page and endpoint must call
 * {@link isPublicLibraryEnabled} server-side and 404 when it is off. A UI that omits a link still
 * serves the URL to anyone who types it.
 *
 * Pure except for {@link isPublicLibraryEnabled}'s single env read, so the boot rule is unit-testable
 * without a database or a server — the same split as `publicPosture.ts`, whose wiring call lives in
 * `payload.config.ts` rather than in the module that decides.
 */
import { notFound } from 'next/navigation'

/**
 * Is public discovery switched on for this deployment?
 *
 * Read as the exact string `'1'`, matching `ALLOW_FIRST_USER_BOOTSTRAP`'s idiom rather than the
 * truthiness test a boolean flag invites. `PUBLIC_LIBRARY_ENABLED=false` and `=0` are the two
 * spellings an operator reaches for when they want it OFF, and both are truthy strings in JS — so a
 * loose check would publish the library of an offline school installation on a typo. Only the
 * deliberate `1` enables it; everything else, including unset, means off.
 */
export const isPublicLibraryEnabled = (): boolean => process.env.PUBLIC_LIBRARY_ENABLED === '1'

/**
 * Decide whether boot may proceed for a given (public-library, SERVER_URL) combination.
 * Returns null to proceed, or the refusal message to throw.
 *
 * WHY THIS IS FATAL RATHER THAN A DEGRADED MODE. Public discovery exists to be shared: Open Graph
 * cards, "Share with a teacher" links, and the per-page footer URL printed on paper all need an
 * ABSOLUTE base. With `SERVER_URL` unset they render relative, or omit the host entirely, and the
 * failure is invisible from inside the app — it shows up as a WhatsApp preview that resolves
 * nowhere, or a printed page whose address a teacher cannot type in. That is precisely the class of
 * defect an operator should be told about at boot rather than discover weeks later from a user.
 *
 * Refusing also keeps the two switches independent in the direction that matters: `SERVER_URL`
 * without this flag is the ordinary authenticated internet deployment and boots normally. Only the
 * combination that cannot work is rejected.
 */
/**
 * The visibility values that put a lesson plan on the public internet.
 *
 * ONE definition, because this rule is read from both sides of the system and they must never
 * disagree: the write side decides what publishing MEANS (`hooks/lessonPlan.ts`), and the read side
 * decides what an anonymous visitor GETS (`lib/publicPlan.ts`). Those were briefly two spellings —
 * a `===` predicate and a `Set.has(String(...))` — in two modules with no link between them, which
 * is a rule that can be half-changed. Adding a fourth visibility must be one edit, not three.
 *
 * `listed` additionally appears in Explore's browse list; `unlisted` is reachable only by link.
 * Anything else — including a NULL that only raw SQL could produce — reads as private, so this
 * fails closed by construction.
 */
export const isPubliclyVisible = (visibility: unknown): boolean =>
  visibility === 'unlisted' || visibility === 'listed'

/**
 * The server-side gate every public route MUST call. Throws Next's not-found, so a disabled
 * deployment serves a real 404 rather than an empty shell.
 *
 * ⚑ WHY A SHARED CALLABLE AND NOT A LAYOUT. A layout cannot carry this boundary: `route.ts`
 * handlers are not wrapped by layouts at all — and the public artifact handler, the highest-stakes
 * route in the plan, is one — and neither are the `opengraph-image`, `sitemap` and `robots` special
 * files the design doc requires. (An earlier version of this comment said layouts "do not run for
 * every rendering path", which is simply wrong for nested pages; the real reason is narrower and is
 * the one above.)
 *
 * ⚑ WHY IT IS A FUNCTION AND NOT AN INLINE `if`. This codebase has already paid for the alternative:
 * *"duplication does not just risk divergence — it hides omission. The third and fourth copies are
 * the ones that never get written, and nothing points at their absence"* (DECISIONS 2026-08-08). An
 * inlined check is also individually mis-writable — an inverted condition, or a `return null` where
 * a 404 was meant — with no shared implementation to be wrong in exactly one place. Mirrors
 * `requireUser()` in `lib/session.ts`, which is this project's established idiom for a per-route
 * gate that deliberately is not a layout.
 */
export function requirePublicLibrary(): void {
  if (!isPublicLibraryEnabled()) notFound()
}

export function publicLibraryBootRefusal(opts: {
  enabled: boolean
  serverUrl: string | undefined
}): string | null {
  const { enabled, serverUrl } = opts
  if (!enabled) return null
  if (serverUrl) return null
  return (
    'PUBLIC_LIBRARY_ENABLED is set but SERVER_URL is empty — refusing to boot. Public discovery ' +
    'builds absolute URLs for social/share cards and the printed document footer, and without ' +
    'SERVER_URL those silently degrade on exactly the pages meant to be shared. Set SERVER_URL to ' +
    'this deployment’s public base URL (and work through docs/OPS.md "Going public"), or unset ' +
    'PUBLIC_LIBRARY_ENABLED to run the authenticated library only.'
  )
}
