/**
 * Pins the OUTPUT CONTRACT of Payload's HtmlDiff engine (`@payloadcms/ui/elements/HTMLDiff/diff`,
 * a public `./elements/*` export) that the version-compare page depends on (decided 2026-07-05):
 *
 *   - `getSideBySideContents()` returns [oldHtml, newHtml]
 *   - removed content in the OLD pane is annotated `data-match-type="delete"`
 *   - added content in the NEW pane is annotated `data-match-type="create"`
 *   - table markup survives the diff (lesson documents are mostly tables)
 *   - `getUnifiedContent()` returns ONE string carrying both annotations
 *
 * Our compare CSS (`.compare-diff [data-match-type=…]`, styles.css) styles exactly these
 * annotations red/green. Payload's compare VIEW can't be reused (native-versions only, internals
 * unexported) — only this engine is public API, so if a Payload bump changes the annotation format
 * this spec fails fast instead of the compare page silently losing its highlighting.
 *
 * ⚑ TWO CONSUMERS NOW, AND TWO METHODS (2026-08-23). The edit-recovery restore offer
 * (`EditRecovery/restoreDiff.ts`) diffs one prose field at a time and takes `getUnifiedContent()`,
 * because that panel is 34rem wide and has a single pane. Both methods are therefore load-bearing, and
 * the admin's `.lp-restore [data-match-type=…]` rules style the same two attribute values from the
 * same shared tokens. A bump that changed only the unified format would otherwise pass this file.
 */
import { describe, it, expect } from 'vitest'

import { HtmlDiff } from '@payloadcms/ui/elements/HTMLDiff/diff'

describe('HtmlDiff output contract (version-compare dependency)', () => {
  it('returns [old, new] with delete/create data-match-type annotations', () => {
    const [oldHtml, newHtml] = new HtmlDiff(
      '<p>The mitochondria is small</p>',
      '<p>The mitochondria is the powerhouse</p>',
    ).getSideBySideContents()

    expect(oldHtml).toContain('data-match-type="delete"')
    expect(oldHtml).not.toContain('data-match-type="create"')
    expect(newHtml).toContain('data-match-type="create"')
    expect(newHtml).not.toContain('data-match-type="delete"')
    // The changed tokens are the annotated ones.
    expect(oldHtml).toContain('small')
    expect(newHtml).toContain('powerhouse')
  })

  it('identical inputs produce no annotations', () => {
    const [oldHtml, newHtml] = new HtmlDiff('<p>same</p>', '<p>same</p>').getSideBySideContents()
    expect(oldHtml).not.toContain('data-match-type')
    expect(newHtml).not.toContain('data-match-type')
  })

  it('preserves table structure through the diff (lesson content is table-heavy)', () => {
    const table = (cell: string) => `<table><tbody><tr><td>${cell}</td></tr></tbody></table>`
    const [oldHtml, newHtml] = new HtmlDiff(table('before'), table('after')).getSideBySideContents()
    for (const html of [oldHtml, newHtml]) {
      // The engine adds its own data-seq attributes to block tags — structure intact, tags kept.
      expect(html).toMatch(/<table[\s>]/)
      expect(html).toMatch(/<td[\s>]/)
    }
    expect(oldHtml).toContain('data-match-type="delete"')
    expect(newHtml).toContain('data-match-type="create"')
  })

  it('a side diffed against empty is fully annotated (section present in only one version)', () => {
    const [, newHtml] = new HtmlDiff('', '<p>brand new section</p>').getSideBySideContents()
    expect(newHtml).toContain('data-match-type="create"')
  })
})

/**
 * The unified form, which the restore offer depends on. Separate describe because it is a separate
 * method with a separate shape — one string rather than a pair — and the restore panel would lose its
 * highlighting silently if only the side-by-side contract were pinned.
 */
describe('HtmlDiff unified output contract (edit-recovery dependency)', () => {
  it('returns ONE string carrying both the removal and the addition', () => {
    const unified = new HtmlDiff(
      'Learners observe the mitochondria',
      'Learners observe the chloroplast',
    ).getUnifiedContent()

    expect(typeof unified, 'one string, not a pair').toBe('string')
    expect(unified).toContain('data-match-type="delete"')
    expect(unified).toContain('data-match-type="create"')
    // Word level: the shared opening is NOT annotated, which is the whole reason to diff at all.
    expect(unified).toMatch(/^Learners observe the /)
    expect(unified).toContain('mitochondria')
    expect(unified).toContain('chloroplast')
  })

  it('annotates the whole value when there was nothing before', () => {
    // A field on a row added during the session: the restore panel has no saved side to compare.
    const unified = new HtmlDiff('', 'a wholly new overview').getUnifiedContent()
    expect(unified).toBe('<span data-match-type="create">a wholly new overview</span>')
  })

  it('produces no annotations when the two sides agree', () => {
    expect(new HtmlDiff('same', 'same').getUnifiedContent()).not.toContain('data-match-type')
  })

  it('preserves newlines, which carry the editor’s paragraph grammar', () => {
    // ⚑ Prose fields are plain strings where `\n` is a paragraph break (CLAUDE.md). The panel renders
    // this with `white-space: pre-wrap`, so the engine dropping or collapsing newlines would silently
    // reflow a teacher's paragraphs into one.
    const unified = new HtmlDiff(
      'Intro paragraph.\n- first bullet',
      'Intro paragraph.\n- first bullet changed',
    ).getUnifiedContent()
    expect(unified).toContain('\n- first bullet')
    expect(unified).toContain('data-match-type="create"')
  })
})
