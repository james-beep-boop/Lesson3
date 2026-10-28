# P137-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

- **Read in full from the supplied text:** `app/tests/http/teacherKey.http.spec.ts:1-253` and `app/tests/http/userAdminActions.http.spec.ts:1-390`.
- **Not read:** the implementation files these specs exercise (for example `endpoints/userAdminActions.ts`, the export endpoints, and `hooks/fieldSplit.ts`). I did not check source baseline `6e75a173e822e4c4be42821b0a4af48ca457bd36` or any commit state. No tools were run.
- **Policy excerpts:** used only as the stated intent. I did not infer policy from these tests.

## Purpose and invariants (as the specs state them)

- **teacherKey.http.spec.ts:** A version with a final explanation exports four documents (DOCX and PDF) with exact names. The exemplar answer appears only in the teacher key, never in the student document. The key is served at the plan's read access, with 401/400/404 for no auth, a near-miss tag, and a version with no final explanation. Preview-as-PDF is edit-gated. Attribution appears in all four deliverables.
- **userAdminActions.http.spec.ts:** The three account actions require Site Admin (403 for Teacher, editor and Subject Admin), check the caller before the `overrideAccess` write, and enforce `expectedUpdatedAt` freshness (400/409). Happy paths write the expected state. A per-admin rate limit returns 429. If the caller is demoted, disabled or unverified while waiting on the admin-count lock, the action returns 403 and writes nothing.

The Site-Admin-only gate on user actions matches the role table in the policy excerpt.

## Candidates (product defects)

**None confirmed.** Both files are test specifications. Their assertions are consistent with the policy excerpts where those excerpts speak to the behaviour, and I found no assertion that is self-contradictory on its face. Without the implementation I cannot say whether any of these assertions would fail.

## Harness leads (uncertain, low severity)

1. **teacherKey.http.spec.ts:212 and :249.** The fallback `?? []` sends an empty overlay when `lessons` is absent from the fixture response. The spec's own comment (lines 210-211) says an empty overlay is refused with 422 before the 404 check. If `withFe.lessons` or `fx.version.lessons` is missing, the 404 test at 245-252 and the 200 test at 227-243 would fail for a harness reason. Confirm that the create response includes populated `lessons`.
2. **userAdminActions.http.spec.ts:39 and :300-316.** The client reads `RATE_LIMIT_ADMIN_RESET_LINK_MAX` with a default of 30. If the server's limit is higher than the client's value, the loop ends without a 429 and the assertion at 316 fails. If the server's limit is lower, the test passes. Confirm the two values are set from the same source.
3. **userAdminActions.http.spec.ts:367-383 (disabled and unverified cases).** These assert exactly 403. A revoked or unverified session could instead be rejected at authentication with 401, which would fail the test without showing the re-read is missing. The "demoted" case is the one that isolates the re-read. Confirm which status the authentication layer returns.
4. **userAdminActions.http.spec.ts:353-376.** `acting` is assigned inside the lock callback. If `whileLockHeld` throws before the fetch is awaited, the pending promise is left unhandled.
5. **teacherKey.http.spec.ts:159.** The copyright year is hard-coded to `2026`. The test name says "fixed year", so this may be intentional. It will fail in 2027 if the generator derives the year.

## Unresolved questions

- **Teacher access to answer keys.** teacherKey.http.spec.ts:171-180 asserts that any Teacher with read access receives the exemplar answer key as a DOCX. The policy excerpts say Subject Admins alone may edit `sections[].exemplar` and `rubric[*]`, and that Teachers hold view/export. They do not say whether Teachers may download the key. This is a policy question, not a defect: is the key intended to be read by every Teacher on the plan?
- **Expected status for revoked or unverified callers** (see lead 3). Is 401 or 403 the intended response when the session is no longer valid?
- **Preview gating.** teacherKey.http.spec.ts:218-225 asserts that a plain Teacher gets 404 from preview. The policy says preview is part of the edit view, which supports this. Confirm that 404 (rather than 403) is the intended refusal for non-editors.
