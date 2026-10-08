/**
 * Give Payload's error classes their names back.
 *
 * ⚑ WHY THIS EXISTS (Next.js 16.4.0, found 2026-10-08 by the Manage-page browser tests). Payload sets every
 * error's `name` from `this.constructor.name`. The 16.4.0 production Turbopack build emits Payload's error
 * classes as ANONYMOUS class expressions (`a.s(["f",0,class extends d{…}])`), so `constructor.name` is `''`.
 * Payload's `formatErrors` only trusts an error that has a non-empty `name`, so EVERY server message —
 * "6 lesson plan(s) still use this subject grade", "Grade 10 already exists for that subject", a
 * Forbidden's text, and the generic "Something went wrong." — reached the client as
 * "An unknown error occurred.". Payload's `loggingLevels` is also keyed on `name`, so expected 4xx responses
 * logged at error level. Dev, `next dev` and every unit/integration test run the unbundled classes and are
 * unaffected: only the production build shows it, which is why `tests/http/apiErrorMessages.http.spec.ts`
 * exists and runs against the built app.
 *
 * The cheaper-looking fix, `experimental.turbopackMinify: false`, was measured and rejected: it restores the
 * names but grows the client JavaScript from ~0.8 MB to ~1.5 MB gzipped and the server bundle from 21 MB to
 * 54 MB — a real cost on a school network for a problem confined to a handful of class names.
 *
 * Idempotent and safe: a class that already has a name is left alone, so on a Next.js release that fixes the
 * naming this does nothing (and can then be deleted — see the unit test's "already named" case).
 */
export function restoreErrorClassNames(moduleExports: Record<string, unknown>): string[] {
  const restored: string[] = []
  for (const key of Object.keys(moduleExports)) {
    let value: unknown
    try {
      value = moduleExports[key]
    } catch {
      continue // a throwing getter on a namespace object is not ours to fix
    }
    if (typeof value !== 'function') continue
    const proto = (value as { prototype?: unknown }).prototype
    if (typeof proto !== 'object' || proto === null || !(proto instanceof Error)) continue
    if ((value as { name?: string }).name) continue // already named
    Object.defineProperty(value, 'name', { value: key, configurable: true })
    restored.push(key)
  }
  return restored
}
