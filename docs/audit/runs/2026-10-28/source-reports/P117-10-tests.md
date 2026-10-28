# P117-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Reviewed as supplied in the request. No tools were run and no tests were executed.

- `app/tests/helpers/fixtures.ts:1-534` (both supplied chunks, 1-400 and 401-534)
- `app/tests/helpers/generatorHtml.ts:1-27`
- `app/tests/helpers/httpWire.ts:1-46`
- `app/tests/helpers/login.ts:1-41`

**Not assessed:** imported modules (`src/payload.config.js`, `db.js`, `jobs/generateVersionArtifact.js`, `ingest/resourceLinks.js`, the `rowsOf`/`drizzleOf` helpers), Payload's `like`, group-update, and bulk-delete semantics, and every spec that calls these helpers. No product code path is covered, so this is not a claim about product correctness.

## Purpose and invariants (as stated in comments)

- Test-only fixtures seed a role world (Site Admin, Subject Admin, editing-access user, Teacher) and one plan with an Official 1.0.0 version through the Local API.
- Records are tagged with a per-run `MARK` and removed by `like` matches on title or name.
- Official pointers are cleared before version deletion. Test-owned users are removed without permanently stripping the last-admin guard.
- Two login helpers (HTTP and Playwright) and HTML fixtures for mammoth-shaped tables.

## Candidates

No product-code defects were found in the supplied ranges. All candidates are test-harness issues.

1. **LOW–MEDIUM, lead (destructive sweep).** `fixtures.ts:44, 60, 251, 349-368`. `MARK_BASE` and `MARK` contain `_`, which is a single-character wildcard in SQL `LIKE`. `purgeMarked` uses `like` without escaping.
   - Unverified: whether Payload's `like` wraps values in `%` or escapes wildcards.
   - Precondition: a live row whose name or title matches the pattern with `_` read as any character, on the database the suite targets.
   - Expected: only `ZZ_INT_` rows are deleted. Actual, if unescaped: a wider match, including user deletion at `:432-454`.
   - Reproduction: on a scratch DB, create a user named `ZZXINTX…` and run `setupRoleFixture`. Check whether it is deleted.
   - The safety comments also conflict: `:19` says "runs on the Rock", `:252` says "disposable DB", `:51` says "live lesson3 DB". The sweep at `:251` runs unconditionally.

2. **LOW, lead (state leak).** `fixtures.ts:501-506` writes `features: { forumEnabled }`. By contrast, `setAdvancedTools` at `:513-523` reads and merges, with the comment at `:508-511` saying the other switches "keep their values".
   - If `updateGlobal` replaces the `features` group, every `setForumEnabled` call resets `advancedTools`.
   - Expected: other switches retained. Actual: unverified.
   - Reproduction: set `advancedTools: true`, call `setForumEnabled(false)`, then read `features.advancedTools`.
   - Affects `withForumOff` (`:527-534`) callers that enable Advanced tools in `beforeAll`.

3. **LOW (false negative in a helper).** `fixtures.ts:483-494` fetches `payload-jobs` with `limit: 100`, no sort, and no pagination, then filters by version. The comment at `:476-477` says job rows persist.
   - Precondition: more than 100 `generateVersionArtifact` rows exist and the target's rows fall outside the returned set. Default ordering is unverified.
   - Effect: pre-warm assertions in the make-official and first-ingest tests can fail spuriously, or pass vacuously if they assert absence.
   - Reproduction: seed 101 jobs for other versions, then one for the target, and assert the target's kind is returned.

4. **LOW, lead.** `fixtures.ts:456-463` purges subject-grades by `displayName`. The fixture creates subject-grades with only `{subject, grade}` (`:271-274`). If `displayName` is derived rather than stored, the bulk delete may match nothing and leave rows behind, or error. Unresolved from the supplied range.

5. **LOW, lead.** `login.ts:20` defaults `serverURL` to `http://localhost:3000`, while `httpWire.ts:21` uses `E2E_BASE_URL ?? 'http://app:3000'`. Callers that omit `serverURL` in a compose run would target a different host. Not checked against any caller.

6. **LOW, minor.** `fixtures.ts:93-97` deletes a user's roles in a separate statement before the user delete. A crash between the two leaves a roleless user behind. The restore path at `:102-113` covers only handled errors.

7. **Question, not a finding.** `fixtures.ts:171` sets `META.subject: 'Biology'`, but the Subject row is `${MARK}Biology` (`:268`). If any validation compares them, the fixture data is inconsistent. Intent is unknown.

Comment-only items, not reported: `fixtures.ts:261-263` attributes CI retries to a per-address signup limit, but the fixture uses Local API `payload.create`, so the attribution is unverified.

## Unresolved questions

- Does Payload's `like` escape `_` and `%`? (Decides candidate 1.)
- Does `updateGlobal` replace a nested group or merge it? (Decides candidate 2.)
- Is `displayName` a stored column on `subject-grades`? (Decides candidate 4.)
- Which database do the Vitest HTTP and Playwright suites actually target?
