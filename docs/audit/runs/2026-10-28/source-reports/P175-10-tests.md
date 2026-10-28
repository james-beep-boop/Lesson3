# P175-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- Read in full: `app/tests/unit/editRecoveryProjection.spec.ts:1-400` and `:401-498`.
- Not assessed: `src/lib/editRecovery/projection.ts` (the code under test), `src/lib/proseFields.ts`, `hooks/fieldSplit.ts`, and every restore caller. The tests' truth against the implementation is unverified. I did not run them.

## Purpose and invariants (as the tests state them)

- `projectCapture` captures only whitelisted teacher prose, keyed `scope:rowId`, sparse, with `null` kept distinct from absent.
- It never captures admin/system fields (`number`, `duration`, `resourceLinks`, `phase`, `exemplar`, `rubric`, `meta`, `semver`, `author`, `summaryTable.title`).
- `applyCapture` preserves structure and admin/system values, drops unknown row keys (reported in `droppedKeys`), and never writes row ids as values.
- `captureAnchors` gives document-ordered headings using each lesson's own `number`.
- The tests are consistent with the §7 teacher/admin field split as excerpted.

## Candidates

**1. Coverage gap: teacher-editable framework prose is not exercised (Low; uncertain lead).**
- Evidence: policy §7 grants editing access to `framework[].sensemakingStrategy` and `framework[].formativeAssessment`. The fixture at `:100-110` and the `FrameworkRow` type at `:37-42` declare only `learnerExperience`, `teacherMoves` and `phase`. Neither test at `:137-156` nor `:158-183` would notice if the projection omitted the two policy fields.
- Expected: `framework:21` captures all four teacher prose fields and restores them.
- Actual: not determinable from this file. The projection could be missing them with all listed tests green.
- Reproduction: add `sensemakingStrategy: 'SS'` and `formativeAssessment: 'FA'` to framework row 21, extend `FrameworkRow`, and assert both appear in `projectCapture(...)['framework:21']` and survive a `applyCapture` round-trip. Check `projection.ts`'s whitelist against policy §7 first.

**2. Documented carve-out: `applyCapture` passes lone surrogates through (not a defect as written).**
- `:403-414` pins that `apply` does not re-normalise. The comment states the column is the read-path guarantee and that this is the intended "reaches past the only path" behaviour. This is an intentional carve-out, so I do not report it as a bug.
- Unresolved: whether any restore caller can supply a capture not produced by `projectCapture`. If one can, the invalid string reaches the save path, and whether that errors or corrupts is unknown. That needs the caller, which was not supplied.

**3. Unverified runtime claims in comments (not a product defect).**
- `:216-223` claims that disabling the `prompt:` branch fails exactly two tests.
- `:372-373` claims the NUL/surrogate behaviour was "verified against the live database."
- `:404-406` claims `jsonb` cannot store lone surrogates.
- I did not check any of these. They should be re-verified before anyone relies on them.

**Confirmed defects: none.** Everything asserted in the two supplied ranges is internally consistent with the stated policy. The only substantive issue is the uncovered teacher fields in candidate 1.

## Unresolved questions

- Does `projection.ts`'s whitelist match policy §7 exactly, including `sensemakingStrategy` and `formativeAssessment`, and does it match `proseFields.ts`?
- Which callers invoke `applyCapture`, and can any of them pass input not produced by `projectCapture`?
- Does `captureAnchors`' fallback to position (`:451-458`) ever apply in production? Policy §7 says `LESSONS[].number` is always system-set, so it may be dead code.
- Security and integrity claims in this file remain unreviewed until independent review.
