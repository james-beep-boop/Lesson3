/**
 * Public slug rules (`src/lib/publicSlug.ts`) — the permanent, human-readable half of a shared
 * lesson URL. `docs/DESIGN-public-library.md`.
 *
 * These are pure so they can be pinned without a database. The rules that need one — uniqueness, and
 * the freeze-once-published invariant — live in the hook and are covered by
 * `tests/int/publicPublication.int.spec.ts`.
 *
 * DB-free and Payload-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_PUBLIC_SLUG_LENGTH,
  derivePublicSlug,
  isValidPublicSlug,
  normalisePublicSlug,
  suffixedPublicSlug,
} from '../../src/lib/publicSlug.js'

describe('normalisePublicSlug', () => {
  it.each([
    ['Cells and Cell Structure', 'cells-and-cell-structure'],
    ['  Leading and trailing  ', 'leading-and-trailing'],
    ['Punctuation: it/goes — away!', 'punctuation-it-goes-away'],
    ['Multiple   spaces', 'multiple-spaces'],
    ['ALREADY-A-SLUG', 'already-a-slug'],
    ['numbers 123 kept', 'numbers-123-kept'],
  ])('folds %o to %o', (input, expected) => {
    expect(normalisePublicSlug(input)).toBe(expected)
  })

  /**
   * Accented characters appear in real curriculum titles. Without the NFD + combining-mark strip they
   * fall into the "not [a-z0-9]" bucket and become hyphens, so "Café" would slug to `caf-` → `caf`,
   * quietly losing a letter from a PERMANENT url.
   */
  it('folds accents to their base letters rather than dropping them', () => {
    expect(normalisePublicSlug('Café Ångström')).toBe('cafe-angstrom')
  })

  it('never emits a leading or trailing hyphen', () => {
    expect(normalisePublicSlug('---edges---')).toBe('edges')
    expect(normalisePublicSlug('!!!')).toBe('')
  })

  /**
   * ⚑ THE ORDERING CASE. Truncation happens before the trailing-hyphen trim, so a cut that lands on
   * a separator cannot leave `…-`, which `isValidPublicSlug` would then reject. Get this backwards
   * and "derive, then validate" fails only for titles of exactly the wrong length.
   */
  it('truncates without leaving a trailing hyphen at the cut', () => {
    const input = `${'a'.repeat(MAX_PUBLIC_SLUG_LENGTH - 1)} tail`
    const slug = normalisePublicSlug(input)
    expect(slug.length).toBeLessThanOrEqual(MAX_PUBLIC_SLUG_LENGTH)
    expect(slug.endsWith('-')).toBe(false)
    expect(isValidPublicSlug(slug)).toBe(true)
  })
})

describe('isValidPublicSlug', () => {
  it.each(['cells', 'biology-grade-10-cells', 'a1-b2', 'abc'])('accepts %o', (slug) => {
    expect(isValidPublicSlug(slug)).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['ab', 'below the minimum length'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['double--hyphen', 'consecutive hyphens'],
    ['Upper', 'uppercase'],
    ['has space', 'whitespace'],
    ['punct!', 'punctuation'],
  ])('rejects %o (%s)', (slug) => {
    expect(isValidPublicSlug(slug)).toBe(false)
  })

  /**
   * ⚑ ALL-DIGIT SLUGS ARE REFUSED, and this is a meaning rule rather than a formatting one. Every
   * other identifier a visitor sees in this system is a numeric id; a public URL ending in `/42`
   * both reads like one and invites walking to `/43`. Nothing else in this file would catch it.
   */
  it.each(['42', '007', '1234567'])('rejects the all-numeric %o so a slug cannot read as an id', (slug) => {
    expect(isValidPublicSlug(slug)).toBe(false)
  })

  it('rejects a slug past the maximum length', () => {
    expect(isValidPublicSlug('a'.repeat(MAX_PUBLIC_SLUG_LENGTH + 1))).toBe(false)
  })
})

describe('derivePublicSlug', () => {
  it('leads with subject and grade so sibling sub-strands read together', () => {
    expect(
      derivePublicSlug({ subjectName: 'Biology', grade: 10, title: 'Cells and Cell Structure' }),
    ).toBe('biology-grade-10-cells-and-cell-structure')
  })

  it('skips absent parts rather than rendering placeholders into a permanent URL', () => {
    expect(derivePublicSlug({ subjectName: null, grade: null, title: 'Cells' })).toBe('cells')
    expect(derivePublicSlug({ subjectName: 'Biology', grade: null, title: 'Cells' })).toBe(
      'biology-cells',
    )
  })

  /**
   * Returning '' means "cannot derive", and the hook turns that into a refusal to publish. The
   * alternative — inventing something — would mint a permanent nameless URL.
   */
  it.each([
    [{ title: '' }, 'no title'],
    [{ title: '!!!' }, 'a title that normalises to nothing'],
    [{ title: 'ab' }, 'a title too short to be a valid slug'],
  ])('returns empty for %o (%s)', (parts) => {
    expect(derivePublicSlug(parts)).toBe('')
  })

  it('never derives an all-numeric slug even from a numeric title', () => {
    expect(derivePublicSlug({ title: '2024' })).toBe('')
  })
})

describe('suffixedPublicSlug', () => {
  it('leaves the first attempt untouched', () => {
    expect(suffixedPublicSlug('cells', 1)).toBe('cells')
  })

  it('walks past collisions', () => {
    expect(suffixedPublicSlug('cells', 2)).toBe('cells-2')
    expect(suffixedPublicSlug('cells', 3)).toBe('cells-3')
  })

  /**
   * ⚑ A maximum-length base must make ROOM for its suffix. Appending first and truncating after
   * would cut the suffix straight back off, so attempt 2 would equal attempt 1 — an infinite
   * collision that only ever appears for the longest titles, and only for the second plan to use one.
   */
  it('shortens a maximum-length base to fit the suffix instead of truncating it away', () => {
    const base = 'a'.repeat(MAX_PUBLIC_SLUG_LENGTH)
    const second = suffixedPublicSlug(base, 2)

    expect(second).not.toBe(base)
    expect(second.endsWith('-2')).toBe(true)
    expect(second.length).toBeLessThanOrEqual(MAX_PUBLIC_SLUG_LENGTH)
    expect(isValidPublicSlug(second)).toBe(true)
  })
})
