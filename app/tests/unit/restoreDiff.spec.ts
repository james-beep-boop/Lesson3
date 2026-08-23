/**
 * `unifiedDiff` — the per-field diff the restore offer injects, and why injecting it is safe.
 *
 * ⚑ THIS IS THE SPEC THAT MAKES `dangerouslySetInnerHTML` DEFENSIBLE. Everywhere else the compare
 * machinery runs, its input is HTML that has already been through DOMPurify; here the input is raw
 * prose out of a textarea, typed by a user, and it reaches an injection point. The escaping is
 * therefore a security control rather than tidiness, and a control with no test is a comment.
 *
 * The engine's own output contract lives in `htmlDiffContract.spec.ts`. This file is about what
 * happens to OUR input on the way in.
 */
import { describe, expect, it } from 'vitest'

import { unifiedDiff } from '../../src/components/EditRecovery/restoreDiff'

describe('the injection is safe because the prose is escaped first', () => {
  it('neutralises a script tag a teacher typed', () => {
    const html = unifiedDiff('harmless', '<script>alert(1)</script>')
    expect(html, 'no live element may survive into the injected string').not.toMatch(/<script/i)
    expect(html).toContain('&lt;script&gt;')
  })

  it('neutralises an event-handler attribute', () => {
    // The other shape that matters: not a tag on its own, but one carrying an attribute.
    const html = unifiedDiff('', '<img src=x onerror="steal()">')
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('&lt;img')
  })

  it('escapes ampersands without double-escaping the entities it just wrote', () => {
    // ⚑ Order-dependent: escape `&` after `<` and the `&` of a fresh `&lt;` is escaped again, so the
    // reader sees the literal text `&lt;`. The one-copy note on `escapeHtml` says the same.
    const html = unifiedDiff('', 'Tom & Jerry <b>')
    expect(html).toContain('Tom &amp; Jerry')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('&amp;lt;')
  })

  it('leaves the only markup in the output the engine’s own annotations', () => {
    const html = unifiedDiff('was <i>this</i>', 'now <b>that</b>')
    // Every tag in the result is a span — nothing from the prose became an element.
    const tags = [...html.matchAll(/<\/?([a-z][a-z0-9]*)/gi)].map((m) => m[1].toLowerCase())
    expect(new Set(tags)).toEqual(new Set(['span']))
  })
})

describe('what the panel actually shows', () => {
  it('annotates only the words that moved', () => {
    const html = unifiedDiff(
      'Learners observe the mitochondria under a microscope.',
      'Learners observe the chloroplast under a microscope.',
    )
    // The unchanged frame stays unannotated — this is the improvement over showing the whole field.
    expect(html).toMatch(/^Learners observe the /)
    expect(html).toMatch(/ under a microscope\.$/)
    expect(html).toContain('<span data-match-type="delete">mitochondria</span>')
    expect(html).toContain('<span data-match-type="create">chloroplast</span>')
  })

  it('marks a field with no saved side as wholly added', () => {
    // `was` is '' for a row added during the session — `restoreGroups` normalises a stored null to it.
    expect(unifiedDiff('', 'brand new')).toBe('<span data-match-type="create">brand new</span>')
  })

  it('returns the text unannotated when nothing differs', () => {
    // `restoreGroups` filters these out before the panel ever asks, so this is a property of the
    // function rather than a state the UI reaches — it must not invent a change.
    expect(unifiedDiff('identical', 'identical')).not.toContain('data-match-type')
  })
})
