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
 * the installer was given no `LESSON3_URL` (docs/LOCAL-SERVER-DEPLOYMENT.md). An unparseable link
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
