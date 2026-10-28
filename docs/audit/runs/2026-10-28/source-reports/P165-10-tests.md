# P165-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/unit/buttonSystem.spec.ts:1-441` (complete; I read 1-400 and 401-441) and `app/tests/unit/canDeleteVersionDoc.spec.ts:1-62` (complete).
- **Not assessed:** the stylesheets the tests read (`src/app/(frontend)/styles.css`, `app-tokens.scss`, `(payload)/custom.scss`), `src/access/versioning` (including `canDeleteVersionDoc` and `deletableVersionsWhere`), and the policy-cited `hooks/fieldSplit.ts`. The policy excerpts were context, not source, and I did not audit them.
- **Not verified:** the baseline commit `6e75a173`. I made no tool calls.

Both files are test code, so nothing below is a confirmed product defect. Every candidate is a weakness in what a guard can detect. Whether the real stylesheet currently has the problem is unknown.

## Summary

`buttonSystem.spec.ts` asserts CSS cascade invariants by parsing the stylesheet with postcss and checking selector specificity, source order, and reachability with `Element.matches`. Its header states that order is decided from top-level rules and that the glyph bug lived inside `@media`. `canDeleteVersionDoc.spec.ts` checks a DB-free per-document delete predicate against Site Admin, Subject Admin, editing-access, and role-loss cases.

## Candidates

**1. Phone-width guards do not check `@media` scope (medium, test integrity)**
- `buttonSystem.spec.ts:175-177` builds `hideRules` from every rule containing `display:none`, at any nesting depth. `reaches()` only checks selector matches.
- `buttonSystem.spec.ts:198-204` then asserts the Word controls are "hidden at phone width."
- Expected: the test fails if the hide rule applies at all widths. Actual: an unconditional `display:none` on those selectors passes all four assertions, so a desktop regression would not be caught.
- The same gap applies to the touch-target test at `:154-161`, which claims a "≤640px" rule but only checks that the token appears somewhere.
- Repro: feed a synthetic stylesheet with `.share-menu .doc-buttons .btn.doc-buttons__word{display:none}` at top level into the same helpers. The test still passes. A fix is to require the rule's `parent` to be `@media` with `max-width: 640px`.

**2. Order and single-class checks read only top-level rules (low to medium, test scope)**
- `buttonSystem.spec.ts:136-143` (`rules.filter`), `:246-248`, `:365-370` and `:425-429` use `posOf`/`bodyOf`, which see only top-level rules. The header at `:74-77` acknowledges that `@media` rules are invisible to these.
- Expected: a `.btn:disabled`, `.btn.is-active`, or `.btn--x` redefinition inside `@media` is caught. Actual: it is invisible to these assertions.

**3. Unbounded slice in the admin-primary guard (low, test integrity)**
- `buttonSystem.spec.ts:357-360`: if `&.btn--style-error` is absent from the scoped block, `indexOf` returns `-1`, and `slice(start, -1)` runs to near end-of-file. A `--bg-color:` declared in a later, unrelated block would then satisfy the assertion at `:361`.
- Repro: a synthetic `adminCss` with the anchor, a `&.btn--style-primary` block with no `--bg-color`, and a later `--bg-color:` elsewhere. The test should fail, but it passes.

**4. Token and fill regexes have blind spots (low, coverage)**
- `buttonSystem.spec.ts:435`: `var\((--app-btn-[a-z-]+)\)` does not match names with digits or the fallback form `var(--app-btn-x, …)`. Definition check `:438` (`toContain(\`${name}:\`)`) also passes for a comment mention.
- `:376`: `background:\s*var\(--accent\)` does not match `background-color:` or fallback forms, so the "Favorite is never filled" check can miss a filling rule.
- `:274` and `:265-283`: dimmers are checked against static element states only. A `:hover`- or `:focus-visible`-scoped `opacity` on a disabled control is not detected.

**5. `canDeleteVersionDoc` tests cover the stated cases but not all of the lockstep claim (low, coverage)**
- The header (`canDeleteVersionDoc.spec.ts:1-10`) says the function must match `deletableVersionsWhere`. Nothing in this file checks that, and I could not inspect either function.
- Not tested: a Subject Admin of a different subject-grade deleting a version in this one, and a populated `subjectGrade` relationship object instead of a number.
- Whether the function handles those correctly is unknown from this file.

## Unresolved questions

- Does the real stylesheet currently place any hide, opacity, or fill rule inside `@media` or on `:hover`/`:focus-visible`? That decides whether candidates 1–2 and 4 are guarding anything real.
- Does `canDeleteVersionDoc` match `deletableVersionsWhere` for populated relationships and for Subject Admins of other subject-grades?
- Is the comment at `canDeleteVersionDoc.spec.ts:8` ("the LAST one") meant to point at the role-loss case at `:46`? It currently refers to the null-user test at `:57`.
