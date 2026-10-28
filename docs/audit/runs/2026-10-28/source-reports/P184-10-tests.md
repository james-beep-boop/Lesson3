# P184-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/tests/unit/guideCompareVisual.spec.tsx:1-400` and `:401-533` (the whole 533-line file), and `app/tests/unit/guidePanelState.spec.ts:1-35`.
- **Policy excerpts:** read as context. They contain no guide or compare requirement, so I derived no product expectation for those screens.
- **Not assessed:** `styles.css`, `custom.scss`, `PageHeader`, `Accordion.tsx`, `@/components/Guide/panelState`, and the other files these specs import or read. I did not run the specs, so I have no pass/fail result. Nothing here is a claim about unseen callers or runtime behaviour.

## Purpose and invariants

The two specs guard the Guide and Compare visual system. `guideCompareVisual` compiles `custom.scss` with `sass` and parses both stylesheets with postcss, then asserts cascade facts such as selector ownership, ≤640px touch targets, source order and specificity. It also checks `PageHeader` DOM shape and the accordion source. `guidePanelState` checks that deep links open available ancestors, drop inaccessible panels, and accept comma-separated values.

## Candidates

I found no product-level defect from the supplied code. The candidates below are all weaknesses in the tests themselves. Each is confirmed by local reasoning about the regexes and helpers, but none is confirmed against the real stylesheet.

**C1. Low: competing `.guide h1` size can evade the guard.**
- Location: `guideCompareVisual.spec.tsx:164-176`, predicate at `:170`.
- Precondition: a rule `.guide h1 { font: 600 1.4rem/1.2 var(--font) }` is added to `styles.css`.
- Expected (the test's stated invariant, "no such competitor exists at all"): the test fails.
- Actual: the predicate `/font-size|font-weight/` does not match the `font:` shorthand, so the test passes.
- Also, the selector match is exact `^\.guide\s+h1$`, so `.guide > h1` or `.guide .page-heading h1` are not seen.
- Reproduction: extract the predicate and assert it flags `font: 600 1.4rem/1.2 x` and `.guide > h1 { font-size: 1rem }`.

**C2. Low to medium: `bodyOf` checks only the first matching rule.**
- Location: `guideCompareVisual.spec.tsx:93-97`, used at `:101-106`, `:159-161`, `:191-195`, `:318-322`.
- Precondition: a later rule in `styles.css` re-declares `.page-heading h1 { font-size: 1rem }`, or `.guide-footer__donate { display: block }`. Later declarations win on source order, which is the defect class these tests exist for.
- Expected (the test's stated intent, "one owner" and "not display"): failure.
- Actual: `rulesFor(sel)[0]` is the earlier, correct rule, so the test passes.
- Reproduction: a fixture with two rules for one selector, asserting that every matching body satisfies the predicate.

**C3. Low: the "≤640px" touch-target test does not check the media query.**
- Location: `guideCompareVisual.spec.tsx:202-208`.
- The test takes any rule that contains `--app-btn-touch-min-height` with selector `.compare-picker`. It never reads `r.media`.
- Precondition: the touch token is applied to `.compare-picker` at desktop width.
- Expected (per the test name): the rule lives under `max-width: 640px`.
- Actual: the test passes. This is not a shipped defect, but the breakpoint is not pinned.
- Reproduction: assert `media` matches `/max-width:\s*640px/`.

Two smaller notes, not counted as candidates:
- `:452-461`: the base `.lp-manage__row` rule is only checked for existence, not for `flex-direction: column`, even though the comment says it is the column rule.
- `:294`: the narrow-grid regex `1fr(?!\s+1fr)` would also match `1fr auto`.

**Guide panel state (`guidePanelState.spec.ts`):** I found no mismatch between the three tests and the expected outcomes in the file. Test 3 expects parent `teachers` to be added before `teachers.find-read`, which is consistent with test 1's parent rule. The spec does not cover an `at` target whose parent is unavailable.

## Unresolved questions

1. Do `styles.css` or `custom.scss` already contain later duplicate or shorthand rules for the guarded selectors? I did not read them, so C1 and C2 are guard gaps, not confirmed regressions.
2. What is the real type of `resolveGuidePanelState`'s `open` input? Test 1 passes a string, and test 3 passes an array.
3. Do the specs pass on `6e75a173`? Nothing was run.
