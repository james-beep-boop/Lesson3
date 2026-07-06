/**
 * Pins the OUTPUT CONTRACT of Payload's HtmlDiff engine (`@payloadcms/ui/elements/HTMLDiff/diff`,
 * a public `./elements/*` export) that the version-compare page depends on (decided 2026-07-05):
 *
 *   - `getSideBySideContents()` returns [oldHtml, newHtml]
 *   - removed content in the OLD pane is annotated `data-match-type="delete"`
 *   - added content in the NEW pane is annotated `data-match-type="create"`
 *   - table markup survives the diff (lesson documents are mostly tables)
 *
 * Our compare CSS (`.compare-diff [data-match-type=…]`, styles.css) styles exactly these
 * annotations red/green. Payload's compare VIEW can't be reused (native-versions only, internals
 * unexported) — only this engine is public API, so if a Payload bump changes the annotation format
 * this spec fails fast instead of the compare page silently losing its highlighting.
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
