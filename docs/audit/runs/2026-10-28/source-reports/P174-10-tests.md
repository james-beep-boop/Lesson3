# P174-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

**Read in full (supplied ranges, no tool calls):**
- `app/tests/unit/editJumpNav.spec.tsx:1-141`
- `app/tests/unit/editRecoveryIndicator.spec.tsx:1-114`
- `app/tests/unit/editRecoveryMigrationOrder.spec.ts:1-94`

**Policy excerpts** were read as context only, not as source.

**Not assessed:** the components and code these tests exercise (`EditJumpNav`, `EditRecovery/Indicator`, `protocol`, `custom.scss`, the migration file, `fieldSplit.ts`). Test results were not run, so no runtime behaviour is confirmed. This is a partial assessment with no completed coverage claim.

## Purpose and invariants (as stated in the tests)

- **editJumpNav:** one chip per top-level `lessons.<i>` row; the nested `summaryTable.lessons.*` array is not counted; a missing lesson number falls back to row position; "Top" scrolls instantly to `top: 0` without looking up any element id.
- **editRecoveryIndicator:** every recovery outcome is visible text, the live region is `polite`, and the stylesheet gives the indicator a base-width full row and never `display:none`.
- **editRecoveryMigrationOrder:** in `down`, the FK drop precedes the `CASCADE`, job-log and job rows are deleted before either `task_slug` enum is shrunk, and rebuilt enums omit `expireEditRecovery`.

## Candidates

**No confirmed product defect.** The supplied tests do not contain the behaviour they guard, so I cannot confirm a mismatch between implementation and policy. The items below are test-strength gaps (leads), not product defects.

**L1 — Low (test gap): `editRecoveryIndicator.spec.tsx:94, 104-113`**
- Precondition: a rule hides an ancestor of the indicator, for example `.<bar-class> { display: none }` inside a media query. Unverified whether such a rule exists.
- Expected: the "never hidden" guard fails.
- Actual: line 94 keeps only rules whose selector contains `.lp-recovery`, so the ancestor rule is never inspected and the test passes.
- The regex at line 108 also misses `visibility: hidden`, the `hidden` attribute, and `height:0; overflow:hidden`.
- Repro: compile a fixture SCSS containing `.lesson-controls__bar{display:none}` and assert the guard fails.

**L2 — Low (overclaimed test): `editJumpNav.spec.tsx:128-140`**
- Title: "does not reach for a field element at all." Only `document.getElementById` is spied.
- Precondition: a future change uses `document.querySelector('#field-title')?.scrollIntoView()` in the Top handler.
- Expected: the test fails, since the title says the handler never asks for a field.
- Actual: the spy does not see `querySelector`, so the test passes.
- Repro: add that call to the Top handler and run the spec.

**L3 — Low (ordering check fragile): `editRecoveryMigrationOrder.spec.ts:45, 48-52`**
- Precondition: `down` contains a block comment (`/* … */`) quoting a statement before the real one. The strip at line 45 removes only `--` comments.
- Expected: order is checked against executable SQL.
- Actual: `indexOf` matches the quoted text inside the block comment first. The test would report an order that does not hold for the real statement.
- Also, `at()` checks only the first occurrence, so a duplicate statement later in `down` is never checked.

**L4 — Unknown (coverage): `editJumpNav.spec.tsx:24, 29`**
- `mocks.lesson` is never set, so the `?lesson=` search-param branch has no test in this file. Whether the component reads that parameter is unverified.

## Unresolved questions

1. Does `EditJumpNav` call `window.scrollTo` or global `scrollTo`? `vi.stubGlobal('scrollTo')` at `:106` only intercepts the latter if the two are the same object in this environment.
2. Does `down` (`editRecoveryMigrationOrder.spec.ts:72-74`) deleting `payload_jobs` and `payload_jobs_log` rows for `expireEditRecovery` match the intended rollback policy? The supplied policy excerpts do not address this migration.
3. Does `custom.scss` hide the indicator through any ancestor rule (L1)?
4. Do the "Lesson 1: Cells" tooltip and chip text match the component's actual output? Those strings were not supplied.
