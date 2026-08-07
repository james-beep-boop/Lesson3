/**
 * Shared wire scaffolding for `tests/http` — the base URL, URL building, and login.
 *
 * ⚑ **Written because the third copy had already drifted.** `endpoints.http.spec.ts` and
 * `recovery.http.spec.ts` each carry a byte-identical `BASE` and a near-identical `login`; when
 * `saveAsNewRecovery.http.spec.ts` added a third, it dropped the `if (!body.token) throw` check the
 * other two have. The cost of that omission is not abstract: a 200 carrying no token then produces
 * `Authorization: JWT undefined` and a puzzling 401 several lines later, instead of a fixture failure
 * that names itself.
 *
 * Same charter as `helpers/db.ts`: this is the one definition NEW specs should use. The two existing
 * files keep their local copies for now — converting them is worthwhile but is churn beyond the
 * change that created this file, so they are a landing place rather than rewritten in passing.
 *
 * ⚑ `auth` is deliberately NOT here. The two shapes in the suite differ in kind — a role-keyed lookup
 * over a shared token map versus a closure over one role's token — and forcing them together would
 * make both call sites worse to read. Duplication is not the only cost worth avoiding.
 */

/** The running app under test. The compose network reaches it by service name. */
export const HTTP_BASE = (process.env.E2E_BASE_URL ?? 'http://app:3000').replace(/\/$/, '')

/**
 * Absolute URL for an API path. Passes an already-absolute URL through unchanged, which is what
 * `endpoints.http.spec.ts` needs for the artifact-download handshake.
 */
export const url = (path: string): string =>
  path.startsWith('http') ? path : `${HTTP_BASE}${path}`

/**
 * Log in over the wire and return the JWT.
 *
 * Both failure modes throw with the address in the message, because these run in `beforeAll` where an
 * unnamed rejection tells you only that a whole file collapsed.
 */
export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(url('/api/users/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status}) for ${email}`)
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`login returned no token for ${email}`)
  return body.token
}
