/**
 * Recipient-address validation for email-a-doc (SPEC §10). Deliberately small: one address,
 * syntactically plausible, bounded — deliverability is proven by the send itself, not the regex.
 * Kept DB-free so it runs under `test:unit`.
 */

/** RFC 5321 caps the whole address at 254 octets. */
const MAX_EMAIL_LENGTH = 254

/**
 * Parse a candidate recipient address from an untrusted body value. Returns the trimmed address,
 * or null when it isn't a single plausible email. The `\S`-only classes also reject CR/LF and
 * spaces, so a validated address can never smuggle extra SMTP headers or a second recipient.
 */
export function parseRecipientEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const to = raw.trim()
  if (to.length === 0 || to.length > MAX_EMAIL_LENGTH) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return null
  return to
}
