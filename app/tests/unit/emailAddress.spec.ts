/**
 * Unit coverage for the email-a-doc recipient validator (`lib/emailAddress.ts`, SPEC §10). The
 * validator is the endpoint's 400-gate AND the header-smuggling guard (a validated address may not
 * contain whitespace/CR/LF), so both properties are pinned here. DB-free (`test:unit`).
 */
import { describe, it, expect } from 'vitest'

import { parseRecipientEmail, sanitizeEmailHeaderText } from '../../src/lib/emailAddress'

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

describe('sanitizeEmailHeaderText (audit 2026-07-04: stored titles reach the Subject header)', () => {
  it('passes ordinary titles through unchanged', () => {
    expect(sanitizeEmailHeaderText('BIOLOGY GRADE 10: Chemicals of Life')).toBe(
      'BIOLOGY GRADE 10: Chemicals of Life',
    )
  })

  it('strips CR/LF and other control characters (header injection)', () => {
    expect(sanitizeEmailHeaderText('Title\r\nBcc: victim@example.com')).toBe(
      'Title Bcc: victim@example.com',
    )
    expect(sanitizeEmailHeaderText('a\u0000b\tc\u007fd')).toBe('a b c d')
  })

  it('strips Unicode line/paragraph separators (NEL, LS, PS) too', () => {
    expect(sanitizeEmailHeaderText('a\u0085b\u2028c\u2029d')).toBe('a b c d')
  })

  it('collapses whitespace runs and trims; non-strings/empties become ""', () => {
    expect(sanitizeEmailHeaderText('  a \n\n  b  ')).toBe('a b')
    expect(sanitizeEmailHeaderText('\r\n')).toBe('')
    expect(sanitizeEmailHeaderText(null)).toBe('')
    expect(sanitizeEmailHeaderText(42)).toBe('')
  })
})
