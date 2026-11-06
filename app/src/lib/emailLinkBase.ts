/**
 * Base URL for links in outbound email: ADMIN_URL, falling back to SERVER_URL. Deliberately NOT
 * payload.config's serverURL, which is '' on the internal host so it can't be used for the email
 * base there (see payload.config.ts). One owner for the policy (/simplify 2026-07-09 — it had
 * grown three prose-linked copies): the password-reset and verification emails (Users auth
 * config) and the message ping all build links from it, and the Phase-5 public-host work changes
 * it in one place. A function, not a const, so env is read at send time.
 */
export const emailLinkBase = (): string => process.env.ADMIN_URL || process.env.SERVER_URL || ''

/**
 * True when a link built from that base names this computer only (`localhost`, a loopback address),
 * so it cannot be opened from any other device: on a phone, "localhost" is the phone. Happens when
 * the installer was given no `LESSON3_URL` (docs/LOCAL-SERVER-DEPLOYMENT.md), or when an
 * administrator opens Manage on the server itself. An unparseable link
 * counts as loopback too: it is no more usable elsewhere. Pure, so client code can import it.
 */
export function linkIsLoopback(link: string): boolean {
  let host: string
  try {
    host = new URL(link).hostname.toLowerCase()
  } catch {
    return true
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    /^127\./.test(host)
  )
}

/**
 * The same link, but at the address this browser is using (operator decision 2026-11-01, after Mark
 * at ARES: school servers have no fixed address — `ares.local`, `10.42.0.1`, whatever the school's
 * network gives — and clones share the master's `ADMIN_URL`). A link the administrator hands over
 * on the spot should use the address they themselves opened Manage at: by definition it works on
 * that network. Only the origin changes; path and token are kept. Relative links (no `ADMIN_URL` at
 * all) resolve against the same origin.
 */
export function atOrigin(link: string, origin: string): string {
  const url = new URL(link, origin)
  return `${origin}${url.pathname}${url.search}`
}
