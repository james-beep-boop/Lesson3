/**
 * The short one-time reset code (operator decision 2026-11-01). Most teachers who forget a password
 * are at a laptop and may have no phone, so the QR code does not reach them and a ~90-character
 * link is impractical to type. Beside the link, `reveal-reset-link` also mints a code like
 * `K7QM-3XPA`; the teacher types their email and the code on Forgot password, and a correct pair
 * hands back the reset token for the ordinary `/reset-password` page. The code never sets a password
 * itself — the already-hardened reset flow does.
 *
 * ⚑ STRENGTH COMES FROM THE PER-CODE ATTEMPT CAP, NOT THE ALPHABET. 8 characters from 30 is ~39
 * bits; a code dies after `RESET_CODE_MAX_ATTEMPTS` wrong tries or `RESET_CODE_TTL_MINUTES`, so an
 * online guesser gets 5 tries at roughly 1 in 6.6×10¹¹, whatever address or network they come from.
 * The per-client rate limit only bounds load.
 *
 * Only an HMAC of the code (keyed by the Payload secret and bound to the user id) is stored, so a
 * database read does not hand out live codes.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/** No 0/O, 1/I/L or U: the characters people misread when one person reads a code to another. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const LENGTH = 8

export const RESET_CODE_TTL_MINUTES = 15
export const RESET_CODE_MAX_ATTEMPTS = 5

/** A fresh code, formatted for reading aloud: `XXXX-XXXX`. */
export function newResetCode(): string {
  let raw = ''
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)]
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

/**
 * What the person typed, reduced to the canonical 8 characters: case, spaces and dashes are forgiven.
 * Anything outside the alphabet makes it unusable (null) — it cannot match any issued code.
 */
export function normalizeResetCode(typed: string): string | null {
  const s = typed.toUpperCase().replace(/[\s-]/g, '')
  return s.length === LENGTH && [...s].every((c) => ALPHABET.includes(c)) ? s : null
}

export function hashResetCode(secret: string, userId: number, normalized: string): string {
  return createHmac('sha256', secret).update(`${userId}:${normalized}`).digest('hex')
}

export function resetCodeMatches(
  secret: string,
  userId: number,
  normalized: string,
  stored: string,
) {
  const a = Buffer.from(hashResetCode(secret, userId, normalized), 'hex')
  const b = Buffer.from(stored, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
