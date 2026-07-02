/**
 * Unit coverage for the email-a-doc recipient validator (`lib/emailAddress.ts`, SPEC §10). The
 * validator is the endpoint's 400-gate AND the header-smuggling guard (a validated address may not
 * contain whitespace/CR/LF), so both properties are pinned here. DB-free (`test:unit`).
 */
import { describe, it, expect } from 'vitest'

import { parseRecipientEmail } from '../../src/lib/emailAddress'

describe('parseRecipientEmail', () => {
  it('accepts a plausible address and trims surrounding whitespace', () => {
    expect(parseRecipientEmail('teacher@example.com')).toBe('teacher@example.com')
    expect(parseRecipientEmail('  first.last+tag@sub.example.co.ke ')).toBe(
      'first.last+tag@sub.example.co.ke',
    )
  })

  it('rejects non-strings and empty values', () => {
    expect(parseRecipientEmail(undefined)).toBeNull()
    expect(parseRecipientEmail(null)).toBeNull()
    expect(parseRecipientEmail(42)).toBeNull()
    expect(parseRecipientEmail(['a@b.com'])).toBeNull()
    expect(parseRecipientEmail('')).toBeNull()
    expect(parseRecipientEmail('   ')).toBeNull()
  })

  it('rejects structurally implausible addresses', () => {
    expect(parseRecipientEmail('not-an-email')).toBeNull()
    expect(parseRecipientEmail('missing-domain@')).toBeNull()
    expect(parseRecipientEmail('@missing-local.com')).toBeNull()
    expect(parseRecipientEmail('no-tld@host')).toBeNull()
    expect(parseRecipientEmail('two@@example.com')).toBeNull()
    expect(parseRecipientEmail('a@b.c')).toBeNull() // 1-char TLD
  })

  it('rejects malformed domains a looser pattern would admit (mirrors Payload\'s own email regex)', () => {
    expect(parseRecipientEmail('a@ex..ample.com')).toBeNull() // consecutive dots
    expect(parseRecipientEmail('a@-example.com')).toBeNull() // leading domain-label hyphen
    expect(parseRecipientEmail('a@example-.com')).toBeNull() // trailing domain-label hyphen
  })

  it('rejects embedded whitespace and CR/LF (header smuggling / multi-recipient)', () => {
    expect(parseRecipientEmail('a b@example.com')).toBeNull()
    expect(parseRecipientEmail('a@example.com\nBcc: victim@example.com')).toBeNull()
    expect(parseRecipientEmail('a@example.com\r\nSubject: spam')).toBeNull()
    expect(parseRecipientEmail('a@example.com, b@example.com')).toBeNull()
  })

  it('rejects an address over the RFC 5321 length cap', () => {
    const long = `${'x'.repeat(250)}@example.com`
    expect(long.length).toBeGreaterThan(254)
    expect(parseRecipientEmail(long)).toBeNull()
  })
})
