/**
 * Editing is a wider-screen affordance (operator decision 2026-07-28, see docs/DECISIONS.md and
 * SPEC §5). At 640px or narrower the lesson-content Edit / Save / Cancel controls and the `?edit=1`
 * deep-link intent are unavailable, replaced by a short explanatory notice. This is progressive
 * disclosure, NOT an authorization boundary: server RBAC is untouched, and a wider viewport (rotate,
 * widen the window, larger screen) simply restores the controls.
 *
 * This constant is the ONE TypeScript declaration of the breakpoint; `editingAvailableAtWidth` below
 * is the predicate the LessonControls mount guard runs against `window.innerWidth`. The same 640px
 * literal also lives in the CSS `@media (max-width: 640px)` blocks (custom.scss + frontend
 * styles.css), which do the button↔notice swap. TS and CSS must agree, but they are independent
 * layers — the guard decides edit mode, the CSS is cosmetic — so a sub-pixel disagreement at the
 * boundary is a cosmetic edge, not a broken state.
 */
export const MOBILE_EDIT_MAX_WIDTH = 640

/**
 * True when the viewport is wide enough to offer lesson-content editing. This is the predicate the
 * LessonControls mount guard actually runs (`!editingAvailableAtWidth(window.innerWidth)` → force
 * view mode), so the unit test on it covers the shipping decision, not a parallel copy of it.
 */
export function editingAvailableAtWidth(width: number): boolean {
  return width > MOBILE_EDIT_MAX_WIDTH
}

/** The one wording of the wider-screen notice, shared by both surfaces (the admin version editor and
 *  the frontend lesson page) so their copy can't drift. Names the remedy (widen the viewport) rather
 *  than a device class — the rule is on width, so a split-screen tablet can be blocked and a
 *  landscape phone can pass. */
export const EDITING_NEEDS_WIDER_SCREEN =
  'Editing needs more screen space. Rotate your device, widen the window, or open this lesson on a larger screen.'
