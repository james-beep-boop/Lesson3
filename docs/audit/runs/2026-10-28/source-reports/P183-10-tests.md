# P183-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/unit/generatorUpgrade.spec.ts:401-646` (full range). The range begins inside an enclosing `describe` whose start (before line 401) I did not read.
- **Read:** `app/tests/unit/guideAccess.spec.tsx:1-148` (full range).
- **Not assessed:** helpers and fixtures referenced but outside the ranges (`PIPE_TABLE`, `LINK`, `PHASE_VALUES`, `FRAMEWORK_KEYS`, `lesson()`, `data()`, `links()`, `parts()`, `count()`), the generator sources, the guide page component, the walkthrough copy, and `systemFlagsForRender`. I did not check callers or runtime behaviour, and I did not run any tests.
- **Partial assessment:** the review is limited to the assertions in these ranges.

## Purpose and invariants (as the tests assert them)

- **Generator (`generatorUpgrade.spec.ts`):** pipe tables in instructions and framework/overview fields render as Word tables. A link in the same field is kept as a hyperlink only when no table is present. Framework-field tables move to a full-width row under their phase, with a `(table below)` pointer left in the cell. The `overview` field keeps its table in place with no pointer. A lone `|x|` line is text. Two consecutive pipe rows form a table and take precedence over a link.
- **Guide (`guideAccess.spec.tsx`):** walkthrough visibility by role. Forum posting tasks are hidden when `forumEnabled` is false, and site-admin moderation remains. Editing access is shown to a scoped Teacher without admin walkthroughs.

## Candidates

I found **no confirmed product defect** in the supplied ranges. The items below are leads or test-quality notes.

1. **`guideAccess.spec.tsx:129-147` (uncertain lead, low).** The test requires "Set up the first Site administrator" to be visible to every Site Administrator. The policy says first-register works only while the users table is empty and refuses afterwards. If the walkthrough copy tells an existing admin to perform that setup, the guide would point them at a refused action.
   - Expected: bootstrap guidance shown only on an empty installation.
   - Actual (per the test): shown to all site admins. Copy not supplied, so the mismatch is unconfirmed.
   - Check: read the walkthrough body and compare it with the refusal path.

2. **`generatorUpgrade.spec.ts:594-601` (test robustness, not a product defect).** The loop over phases `[0,1,3]` reads `rows[i+1]!.cellCount` with no guard. If phase 3 is the last row of Section C, `rows[i+1]` is `undefined` and the test fails with a TypeError rather than an assertion. This depends on a Section C layout I have not seen.
   - Check: run the test; add a bounds guard if it throws.

3. **`generatorUpgrade.spec.ts:408` (test strength, not a product defect).** `rawPipes` checks only the literal strings `| Heart |` and `|---|`. Its coverage depends on `PIPE_TABLE`, which is outside the range. A regression that leaks raw pipes with different text would pass.

4. **`guideAccess.spec.tsx:47-49` (oracle concern).** The expected visibility of "Discuss your saved changes" is computed as `roles.length || assignments.length`. That mirrors the implementation's condition rather than a stated policy. The excerpts do not say whether a plain Teacher should see this task, so passing this test does not confirm the intended behaviour.

## Unresolved questions

- Should a plain Teacher see "Discuss your saved changes"? (Item 4.)
- Should a Site Administrator see "Hand administration to another person" in the guide? `guideAccess.spec.tsx:136-138` deliberately hides it. The policy says Site Admin has global scope, but it gives no explicit statement for this guide entry.
- What does the "Set up the first Site administrator" walkthrough say? (Item 1.)
- Does Section C contain a row after phase index 3? (Item 2.)
- Do these tests pass? Not run.

No security or integrity claims are made here. Those remain unreviewed until independent review.
