/**
 * Is this `DATABASE_URI` pointing at the developer's own machine?
 *
 * The gate half of `scripts/seed-local-dev.ts` — it lives here, apart from the script, because that
 * script boots Payload and seeds at import time and so cannot be imported by a unit test. (Same
 * split, for the same reason, as `stripCollapsed.ts`.)
 *
 * This decides whether a script that mints accounts with a KNOWN password may touch the database in
 * front of it. That is not a judgement to leave unpinned, hence `tests/unit/localDbGuard.spec.ts`.
 *
 * `new URL` rather than a hand-rolled split: it resolves credentials correctly, where a password
 * containing '@' would fool a regex into reading the wrong segment as the host.
 *
 * ⚑ WHATWG `hostname` returns IPv6 literals WITH their brackets — `[::1]`, not `::1`. Comparing
 * against the bare form silently refused a valid loopback URI (caught in review pre-merge). Both
 * spellings are accepted so the rule matches what the parser actually produces.
 *
 * Fails CLOSED: anything unparseable, empty, or unrecognised is "not local", so a mistake in this
 * function refuses a legitimate run rather than permitting a dangerous one.
 */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

export function isLocalDatabaseUri(uri: string): boolean {
  let host: string
  try {
    host = new URL(uri).hostname
  } catch {
    return false
  }
  return LOOPBACK_HOSTS.includes(host)
}
