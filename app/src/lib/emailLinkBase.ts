/**
 * Base URL for links in outbound email: ADMIN_URL, falling back to SERVER_URL. Deliberately NOT
 * payload.config's serverURL, which is '' on the internal host so it can't be used for the email
 * base there (see payload.config.ts). One owner for the policy (/simplify 2026-07-09 — it had
 * grown three prose-linked copies): the password-reset and verification emails (Users auth
 * config) and the message ping all build links from it, and the Phase-5 public-host work changes
 * it in one place. A function, not a const, so env is read at send time.
 */
export const emailLinkBase = (): string => process.env.ADMIN_URL || process.env.SERVER_URL || ''
