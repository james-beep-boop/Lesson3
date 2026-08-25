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

import { renderOf, unifiedDiff } from '../../src/components/EditRecovery/restoreDiff'

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

/**
 * ⚑ THE DEFECT THESE PIN. `captureDiff` correctly reports `'' → '   '` as a change — the restore
 * really does write three spaces — but `HtmlDiff` tokenizes by word and annotates none of it. The
 * panel therefore listed the field (which is what the clearing fix was for) and then rendered an
 * EMPTY `<dd>` under it, which is the same "shows nothing" failure one layer further down.
 *
 * The condition is "the engine annotated nothing", not "the HTML is empty": `'a' → 'a  '` yields the
 * non-empty string `a` with no annotation and is just as invisible.
 */
describe('a change the diff engine cannot show', () => {
  it.each([
    ['spaces added to an empty field', '', '   '],
    ['a blank line added to an empty field', '', '\n'],
    ['trailing spaces added to real text', 'a', 'a  '],
    ['a trailing newline added to real text', 'x', 'x\n'],
  ])('says "whitespace only" for %s', (_name, was, now) => {
    expect(unifiedDiff(was, now), 'precondition: the engine marks nothing here').not.toContain(
      'data-match-type',
    )
    expect(renderOf(was, now, false)).toEqual({ kind: 'whitespace' })
  })

  it('still shows a real word change as a diff', () => {
    const r = renderOf('the mitochondria', 'the chloroplast', false)
    expect(r.kind).toBe('diff')
    expect(r.kind === 'diff' && r.html).toContain('data-match-type="create"')
  })

  it('calls a cleared field emptied, not whitespace', () => {
    // Whitespace-to-empty annotates nothing either, but "Emptied" is the more useful of the two.
    expect(renderOf('   ', '', false)).toEqual({ kind: 'emptied' })
    // And the ordinary clearing, which DOES annotate, still reports as a diff so the lost text shows.
    expect(renderOf('a real paragraph', '', false).kind).toBe('diff')
  })
})

describe('the read-only path never diffs, because its prose is for copying', () => {
  it('returns the captured text verbatim', () => {
    expect(renderOf('saved', 'captured text', true)).toEqual({
      kind: 'plain',
      text: 'captured text',
    })
  })

  it('names an emptied field rather than rendering nothing', () => {
    expect(renderOf('saved', '', true)).toEqual({ kind: 'emptied' })
  })

  it('names whitespace-only content, which would otherwise render blank', () => {
    expect(renderOf('saved', '   ', true)).toEqual({ kind: 'whitespace' })
  })
})
