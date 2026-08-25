/**
 * What CHANGED inside one recovered prose field — word level, not whole field.
 *
 * ⚑ **The same engine the compare page uses** (`@payloadcms/ui/elements/HTMLDiff/diff`), reached for
 * on the operator's suggestion (2026-08-23): "you should be able to use the output of the diff
 * function in the compare feature to show just what unsaved changes are". Listing only the changed
 * FIELDS was the previous step; this makes the change itself visible, so a teacher reading the panel
 * sees the edit rather than a paragraph they have to scan for it.
 *
 * ⚑ **The engine, NOT the compare pipeline.** `diffVersionGroupsCached` diffs RENDERED DOCUMENTS and is
 * keyed on two SAVED version ids — reaching it from a capture would mean overlaying the capture onto
 * the bundle and running the generator (up to three `Packer.toBuffer` builds plus mammoth plus
 * DOMPurify, which that cache's own header measures in seconds of CPU on the 2-CPU box) at the exact
 * moment a teacher opens the editor. A capture is also not a version, so none of the immutability that
 * cache depends on holds. Only the engine is reused, on two short strings, synchronously.
 *
 * ⚑ **`getUnifiedContent`, not `getSideBySideContents`.** Compare has two panes to align; this panel is
 * 34rem wide and has one. Unified puts the removal and the insertion adjacent in a single flow, which
 * is what fits — and it means no second pane of context the reader has to cross-reference.
 *
 * ⚑ **WHY THE INJECTION IS SAFE.** `RestorePrompt` renders this with `dangerouslySetInnerHTML`, and the
 * input is raw prose a teacher typed — untrusted. It is escaped FIRST, so no literal `<` survives to be
 * tokenized as a tag, and the engine's own output is only its annotation spans wrapped around that
 * already-escaped text. Probed 2026-08-23: `Use <b> tags & "quotes"` round-trips as `&lt;b&gt;` /
 * `&amp;` with the changed token annotated and no live element anywhere in the output. Escaping is
 * therefore load-bearing, not hygiene — `escapeHtml` carries the matching note.
 *
 * ⚑ Not used for a READ-ONLY capture. There the panel exists so prose can be read and COPIED out, and
 * unified output interleaves the old words into the new — a copy would come back corrupted. That
 * decision lives at the `readOnly` branch in `RestorePrompt`, which is where the flag is.
 *
 * Output contract (`data-match-type` annotations, both methods) pinned by
 * `tests/unit/htmlDiffContract.spec.ts`.
 */
import { HtmlDiff } from '@payloadcms/ui/elements/HTMLDiff/diff'

import { escapeHtml } from '../../lib/escapeHtml'

/**
 * One field's change as annotated HTML: removals `data-match-type="delete"`, additions `"create"`.
 *
 * `was` is `''` for a field the saved version does not have — a row added during the session — and the
 * whole value then annotates as an addition, which is the honest rendering of "all of this is new".
 */
export const unifiedDiff = (was: string, now: string): string =>
  new HtmlDiff(escapeHtml(was), escapeHtml(now)).getUnifiedContent()

/**
 * How one changed field should be PRESENTED — because "show the diff" is not always possible.
 *
 * ⚑ A DIFF CAN BE INVISIBLE, and that was a real defect: `captureDiff` correctly reports `'' → '   '`
 * as a change (the restore really does write three spaces), but `HtmlDiff` tokenizes by word and
 * returns `""` for it — and for `'' → '\n'`, and for `'a' → 'a  '`, where it returns just `a` with no
 * annotation at all. Injecting that produced an EMPTY `<dd>`: the panel listed the field, which is
 * what the clearing fix was for, and then showed nothing under it. Probed 2026-08-23.
 *
 * ⚑ The condition is "HtmlDiff found nothing to annotate", NOT "the string is empty" — `'a' → 'a  '`
 * yields non-empty HTML with no annotation, and is just as invisible. This is the same test the
 * compare page already makes and names `structureOnly` (`generator/htmlDiffCache.ts`), for the same
 * reason: a spacing or paragraph-boundary edit that the engine cannot mark up.
 *
 * ⚑ AND "THE ENGINE ANNOTATED NOTHING" IS NOT THE SAME AS "NOTHING MEANINGFUL CHANGED" — a
 * distinction that cost a wrong label before it was measured. In this editor's grammar `\n` IS a
 * paragraph (CLAUDE.md), so splitting or merging paragraphs really does change the generated
 * document — and those are exactly the edits `HtmlDiff` hides, because it tokenizes by word.
 * Probed 2026-08-23:
 *
 *   hidden by the engine, but MEANINGFUL:  split a paragraph · merge two · add a blank line
 *   hidden by the engine, and meaningless: trailing spaces · leading spaces
 *   SHOWN by the engine, but meaningless:  a double space between two words
 *
 * So the engine's annotation is a poor proxy in both directions, and calling all of it "whitespace
 * only" would tell a teacher nothing had really changed when they had merged two paragraphs. The
 * shape comparison below is the honest test: same words, different lines ⇒ the paragraphs moved.
 *
 * The read-only branch takes the same treatment for the same reason — prose that is only whitespace
 * renders as nothing whether or not it went through a diff.
 */
export type FieldRender =
  /** Word-level diff, safe to inject — see the injection note above. */
  | { kind: 'diff'; html: string }
  /** The restore clears this field outright. */
  | { kind: 'emptied' }
  /** The words are identical but the PARAGRAPH BREAKS moved — a real change to the document. */
  | { kind: 'paragraphs' }
  /** Real, but genuinely invisible: trailing, leading or repeated spaces within a line. */
  | { kind: 'spacing' }
  /** Read-only: the captured prose verbatim, so it can be copied. */
  | { kind: 'plain'; text: string }

/**
 * The LINE SHAPE of a prose value: one entry per paragraph, inner runs of whitespace collapsed.
 *
 * Comparing two of these separates the two invisible cases cleanly, which is the whole point:
 * `'One.\nTwo.'` and `'One.\n\nTwo.'` differ (a blank line was added between paragraphs), while
 * `'a b'` and `'a  b'` do not (the same line, spaced differently). Trailing and leading spaces fall
 * out of the per-line `trim`.
 */
const lineShape = (text: string): string[] =>
  text.split('\n').map((line) => line.trim().replace(/\s+/g, ' '))

const sameShape = (a: string, b: string): boolean => {
  const [x, y] = [lineShape(a), lineShape(b)]
  return x.length === y.length && x.every((line, i) => line === y[i])
}

export const renderOf = (was: string, now: string, readOnly: boolean): FieldRender => {
  // ⚑ Read-only shows PLAIN text, never a diff: that path exists so stale prose can be COPIED out,
  // and unified output interleaves the removed words into the new.
  if (readOnly) {
    if (now === '') return { kind: 'emptied' }
    if (now.trim() === '') return { kind: 'spacing' }
    return { kind: 'plain', text: now }
  }
  const html = unifiedDiff(was, now)
  if (html.includes('data-match-type')) return { kind: 'diff', html }
  // The values differ — `captureDiff` only yields changed leaves — but the engine marked nothing, so
  // the difference is whitespace it does not tokenize. Name WHICH kind rather than render a blank row.
  if (now === '') return { kind: 'emptied' }
  return sameShape(was, now) ? { kind: 'spacing' } : { kind: 'paragraphs' }
}
