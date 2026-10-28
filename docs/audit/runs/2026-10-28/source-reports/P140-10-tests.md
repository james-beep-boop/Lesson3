# P140-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/tests/int/access.int.spec.ts:1-400` and `:401-636` (the supplied file, 636 lines).
- **Not assessed:** `helpers/fixtures.js`, `relId`, `semver`, the access functions and hooks (including `enforceVersionImmutable`, `enforceAssignmentScope`, the Official retention guard, and the auto-demote logic), the schema, `tests/http/endpoints.http.spec.ts`, `tests/int/messages.int.spec.ts`, and the admin UI claims in comments. I ran no tools, so no runtime behavior is claimed.

## Purpose and invariants (as the file states them)

Integration tests, run through the Local API with `overrideAccess: false`, for:
- No authenticated in-place version updates. Authoring goes through save-as-new.
- Version deletion scoped by authorship.
- No caller-access version create.
- Official-pointer guards on create and update, plus the retention guard.
- `subjectGrade` matching the plan, semver format and uniqueness, `nextSemverForPlan`, and plan-delete cascade.
- ≤1 Subject Admin per subject-grade, the password guard, assignment scope, and the names-only directory.

## Candidates

No product defect is confirmed from these ranges. Every candidate below is a test-harness weakness, and each is a local reading.

**1. Denial tests may pass for a reason other than access control (medium-low, lead).**
`app/tests/int/access.int.spec.ts:174-187` and `:215-232`. The denied creates omit `semver`, while every create expected to succeed supplies it (for example `:395-405`, `:447-457`). Whether `semver` is required is unconfirmed, because the schema is not in scope.
- Expected: a fully formed payload is rejected for access reasons, and the same payload succeeds under `overrideAccess: true`.
- Actual: `.rejects.toThrow()` cannot tell an access denial from a missing-field error.
- Repro: add `semver: '9.9.9'` to each denied create. Assert the rejection is an access error (not a `ValidationError`). Add a positive control that resolves with `overrideAccess: true` on the same payload.

**2. Guard rejections are asserted without checking the reason (low, test-integrity).**
Bare `.rejects.toThrow()` at `:58-68`, `:70-83`, `:190-200`, `:264-273`, `:347-359`, `:574-584`, and `:598-609`. Any error passes, including fixture or validation errors.
- Repro: assert the specific guard message or error class in each block.

**3. Fixture state leaks when an assertion fails (low, test-integrity).**
- `:541-572` has no `try/finally`. If the assertion at `:557` fails, the restore at `:560-571` is skipped, and the tests at `:586-617` run against a mutated roster.
- Cleanup after `expect` (for example `:83-88`, `:122-136`, `:139-153`, `:343-344`) is skipped on failure. A leaked `1.0.1` candidate would make `makeWorkingCopy()` at `:92`, `:191`, or `:350` hit the unique `(plan, semver)` index and fail later tests in cascade.
- Repro: temporarily change `:557` to expect a different role and observe the failures that follow.

**4. Test titles claim more than the assertions check (low).**
- `:619-635` is titled "names-only roster" but asserts only `docs.length === 4`. The count is hardcoded to the fixture size, and field stripping is deferred elsewhere in the comment at `:620-623`.
- `:347-359` says "(and every field)" but asserts only `semver`.
- `:541-557` says "≤1 Subject Admin" but asserts only the displaced admin's role. It does not count admins or check the promoted user's role.

**5. Unverified expectation (not a candidate yet).**
`:557` expects a displaced Subject Admin to become `'editor'`. The supplied policy requires ≤1 admin and handover to an existing editor, but does not state what role a displaced admin receives. Do not treat `'editor'` as policy until it is confirmed.

## Unresolved questions

- Is `semver` required on `lesson-bundle-versions`? This decides candidate 1.
- Does the fixture give the Site Admin zero assignments? `:616` depends on it.
- Policy requires `LessonPlans.subjectGrade` to be immutable, including by Site Admins through the Local API. No assertion in these ranges covers it. That is an absent test in this file, not a defect, and it may live elsewhere.
- The header states "only self or Site Admin" for password changes, but no positive self-change case appears in these ranges.
- Security and integrity claims remain unreviewed until independent review.
