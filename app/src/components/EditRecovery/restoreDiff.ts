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
