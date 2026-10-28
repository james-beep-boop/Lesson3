# P177-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read in full, as supplied in the message. No tools were run and no tests were executed.

- `app/tests/unit/emptyArraySerialization.spec.ts:1-213`
- `app/tests/unit/enforceAssignmentScope.spec.ts:1-163`
- `app/tests/unit/enqueueDetached.spec.ts:1-76`
- `app/tests/unit/entryPhase.spec.ts:1-100`

**Not assessed:** the imported source modules (`src/hooks/fieldSplit.ts`, `src/hooks/bundleVersion.ts`, `src/hooks/userRoles.ts`, `src/lib/enqueue.ts`, `src/components/LessonControls/entryPhase.ts`), all callers, and runtime behaviour. The policy excerpt was used only as the expectation source for the D6a and editing-access rules. This is a partial assessment, not a completed coverage claim.

## Purpose and invariants (as stated by the tests)

- **emptyArraySerialization:** a submitted array container must be an array, or `0` where the stored array is empty. `0` normalises to `[]` for editors and admins. Any other non-array, or a count against stored rows, is `Forbidden`. `null` is pinned as "no rows" (intentional carve-out).
- **enforceAssignmentScope (D6a):** a Subject Admin may hand over to an existing editor in scope, grant editing access in scope, and not appoint a non-editor, grant both in one write, or remove a `subjectAdmin` row. Site Admins are unrestricted. Actorless and `systemAssignmentWrite` writes are exempt. Site Admin targets stay protected.
- **enqueueDetached:** forwards only `{task, input}` and strips `req` at runtime.
- **entryPhase:** visit-scoped open state that closes on first pointerdown or keydown, not on scroll.

## Candidates

**1. Lead, uncertain: top-level `lessons: 0` against non-empty stored lessons is unpinned.**
- Evidence: `emptyArraySerialization.spec.ts:64-80` and `111-122`. The file's rules (lines 64, 96-97, 111-112) allow `0` only for stored-empty arrays and treat clearing rows as structural. The rejection matrix covers `finalExplanation.sections`, `rubric`, and `summaryTable.lessons`, but not top-level `lessons`. The only top-level `lessons: 0` case (line 80) uses stored `[]`.
- Precondition: a teacher with editing access. Policy makes lesson add/remove Subject-Admin only.
- Expected (per the file's own rule): `Forbidden`. Actual: not determinable from these files.
- Repro: `expect(() => run({ subjectGrade: SG_ID, lessons: 0 }, originalEmpty())).toThrow(Forbidden)`. `originalEmpty()` contains lesson `L1`.
- Severity if reachable: high, since it would allow structural deletion by a non-Subject-Admin. Confidence is low until `fieldSplit.ts` is read.

**2. Lead, uncertain: `null` against populated stored rows.**
- Evidence: `emptyArraySerialization.spec.ts:206-212` pins `null` as accepted. The header (lines 9-12) says every non-array other than `0` must be rejected "not read as 'no rows'." The pin is exercised only against empty stored data (line 210).
- Expected, per line 112 ("clearing rows is a structural change"): `Forbidden` for `sections: null` against populated stored rows. Actual: unknown.
- Repro: `expect(() => run({ subjectGrade: SG_ID, finalExplanation: { sections: null } }, originalPopulated())).toThrow(Forbidden)`.
- Severity if accepted: medium. The carve-out itself is intentional and is not reported as a bug.

## Test-strength notes (not product defects)

- `enforceAssignmentScope.spec.ts:69, 84, 93, 103, 120, 161` use bare `.toThrow()`. The sibling file (`emptyArraySerialization.spec.ts:91-94`) explains why that cannot separate a rejection from a crash. The D6a refusals should assert `Forbidden`.
- `entryPhase.spec.ts:56-67`: the test dispatches on `document`, where capture and bubble listeners both fire. It cannot verify the capture-phase claim or the pointerdown-before-click ordering. The title at line 89 says "after teardown," but no input after `detach()` is dispatched.
- `enqueueDetached.spec.ts:56-75`: the compile-time cases have no runtime assertion and only mean something if `tsc` includes this file.

## Unresolved questions

- Does the `fieldSplit` sequence check run before or after `0`→`[]` normalisation, and does it reject top-level `lessons` changes? (Candidate 1)
- Is `null` rejected against populated rows? (Candidate 2)
- The actorless exemption (`enforceAssignmentScope.spec.ts:129-134`) applies regardless of `systemAssignmentWrite`. Overriding access does not skip hooks, so the question is whether every actorless call site is trusted. Can any HTTP path reach these hooks with `req.user` null?
- Can request input set `systemAssignmentWrite`?
- Does the tsconfig include `app/tests/unit`?
