/**
 * SECTION IDENTITY for the editor jump nav ({@link ./EditJumpNav}) — what counts as a section: the
 * DOM id shapes, the containment selector, and the which-one-am-I-in rule. The component owns the
 * other half: measurement and observation. Keeping identity here means the id shapes have ONE owner,
 * and the rule can be unit-tested away from the browser.
 *
 * DOM ids double as section keys. Verified against payload@3.85.1
 * (`@payloadcms/ui/dist/fields/Array/ArrayRow.js`): an array row's OUTER wrapper is
 * `id={parentPath.split('.').join('-')}-row-{i}`, and it encloses the row's whole Collapsible — so a
 * focused field really does have a `lessons-row-<i>` ancestor. Because dots become dashes, the nested
 * Summary-Table array renders `summaryTable-lessons-row-0`, which the `^="lessons-row-"` prefix does
 * NOT match; likewise a phase row is `lessons-0-framework-row-0`. So the selector below picks out
 * top-level lesson rows only. (The row HEADER carries a different id, built from `scrollIdPrefix`, so
 * there is no collision.)
 *
 * `custom.scss` restates these same three SELECTOR shapes for `scroll-margin-top`; that one crosses
 * the SCSS/TS boundary and cannot be shared — keep it in step by hand. Its VALUE no longer needs
 * hand-syncing: {@link ./EditJumpNav} reads the computed margin back out of the DOM to place the
 * crossing line, after restating it in TS drifted 6px and made every chip jump light the previous
 * section (2026-07-28).
 */

export const LESSON_ROW_PREFIX = 'lessons-row-'
export const FINAL_EXPLANATION_ID = 'field-finalExplanation'
export const SUMMARY_TABLE_ID = 'field-summaryTable'

/** The row wrapper for top-level lesson index `i` — the jump target and the tracking key. */
export const lessonRowId = (index: number): string => `${LESSON_ROW_PREFIX}${index}`

/** Nearest enclosing tracked section: a top-level lesson row, or either trailing group. */
export const SECTION_SELECTOR = `[id^="${LESSON_ROW_PREFIX}"], #${FINAL_EXPLANATION_ID}, #${SUMMARY_TABLE_ID}`

export interface SectionPosition {
  /** The section's DOM id, which is also its key. */
  key: string
  /** `getBoundingClientRect().top` — viewport-relative, so it may be negative. */
  top: number
}

/** Sub-pixel slack, so a header resting exactly on the line counts as crossed. */
const CROSS_TOLERANCE_PX = 1

/**
 * The y a section header must reach to count as current, from the two constraints that bound it.
 * Pure on purpose: the component measures, this decides, so the rule is unit-testable.
 *
 * They are NOT the same quantity and neither dominates by construction:
 *   • `toolbarBottom` — what you can actually see past while reading;
 *   • `landingLine` — `scroll-margin-top`, where a chip jump PARKS its target (custom.scss owns
 *     that value and shrinks it below 640px, where the bar isn't sticky).
 * Taking the LOWER of the two is what makes a jump self-consistent: park a header above the line the
 * tracker uses and it is not "crossed", so the rule returns the PREVIOUS section and the clicked chip
 * lights its neighbour — 7rem (105px) over a 99px bar did exactly that (see DECISIONS 2026-07-28).
 * The reverse can happen too: let the bar wrap to a third row past 105px and `landingLine` alone
 * would reproduce the same bug from the other side. Hence `max`, not a preference for either.
 *
 * A non-finite `landingLine` (no section in the DOM yet to measure) falls back to the toolbar alone.
 */
export function crossingLine(toolbarBottom: number, landingLine: number): number {
  return Number.isFinite(landingLine) ? Math.max(toolbarBottom, landingLine) : toolbarBottom
}

/**
 * Scroll-spy rule: the current section is the LAST one whose header has crossed `threshold`
 * (the bottom of the floating toolbar) — i.e. among the sections at or above the line, the lowest.
 *
 * "Last crossed" rather than "currently intersecting" is deliberate: lesson rows are collapsed by
 * default, so several short headers can share the viewport at once and "intersecting" would be
 * ambiguous. Input order does not matter — the winner is chosen by position, not by index.
 *
 * Returns `null` when nothing has crossed yet (the reader is still above the first section, e.g. up in
 * the Title field), which correctly leaves every chip unhighlighted rather than guessing.
 */
export function pickCurrentSection(
  positions: readonly SectionPosition[],
  threshold: number,
): string | null {
  let best: SectionPosition | null = null
  for (const pos of positions) {
    if (pos.top > threshold + CROSS_TOLERANCE_PX) continue
    if (best === null || pos.top > best.top) best = pos
  }
  return best?.key ?? null
}

/**
 * The section containing `el` (typically `document.activeElement`), or `null` if it is outside all of
 * them — e.g. focus sitting in the toolbar itself. Used to let KEYBOARD FOCUS override scroll
 * position: while someone is typing, the field they are in is a truer answer to "which lesson am I
 * working on" than whatever happens to be under the toolbar.
 */
export function sectionKeyForFocus(el: Element | null | undefined): string | null {
  return el?.closest(SECTION_SELECTOR)?.id ?? null
}

/**
 * The toggle that opens jump target `target` itself, or `null` when the target needs no opening.
 *
 * Only the target's OWN collapsible counts: either its DIRECT child, per `ArrayRow.js`
 * (`<div id={rowId}><Collapsible …>`), or the single presentational collapsible directly inside the
 * named Final Explanation group's wrapper. A plain descendant search would reach *nested* rows, and since
 * 2026-07-25 every nested array (`framework`, `sections`, `rubric`, `summaryTable.lessons`) also starts
 * collapsed: jumping to an already-open lesson would then expand its first phase, and jumping to Final
 * Explanation would expand its first section — neither of which the user asked for.
 *
 * Summary Table and Title have no collapsible of their own, so they correctly yield `null` and are
 * only scrolled to. Final Explanation does have one, so its jump-nav chip opens it before scrolling.
 */
export function ownCollapsedToggle(target: Element | null | undefined): HTMLElement | null {
  // Both selectors are tightly anchored to the target. In particular, neither can reach a nested
  // Section/Rubric/Phase row. `--collapsed` is Payload's own state class.
  const own = target?.querySelector(
    ':scope > .collapsible--collapsed, ' +
      ':scope > .group-field__wrap > .render-fields > .collapsible-field > .collapsible--collapsed',
  )
  // The toggle-wrap precedes the content, so the row's own toggle is first in document order.
  const toggle = own?.querySelector('.collapsible__toggle')
  return toggle instanceof HTMLElement ? toggle : null
}
