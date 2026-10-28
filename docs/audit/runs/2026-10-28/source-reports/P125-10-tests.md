# P125-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read as supplied:** `app/tests/http/endpoints.http.spec.ts:1201-1600`. I did not run tools or tests, and I did not open any other file.
- **Not assessed:** lines 1-1200 and 1601 onward. Line 1600 ends mid-assertion, so the assign/unassign round-trip is only partly covered.
- **Not visible in range:** the save request that begins the test at 1201 (its caller role and inputs), and the helpers and fixtures used throughout (`fx`, `auth`, `dataForm`, `checkedSaveForm`, `withProseEdit`, `minimalBundleContent`, `url`, `saveUrl`). I cannot confirm what they do at runtime.
- **Not verified:** whether any assertion passes when run. Security and integrity claims are unreviewed until independent review.

## Purpose and invariants (as the tests encode them)

- Save-as-new preserves Subject Admin `META.subject`, `META.grade` and `META.substrand_id` from source, while keeping legitimate prose edits (1201-1208).
- Site Admin may change `META.subject` and `META.grade` (1216-1240).
- Stale or forged-future `updatedAt` returns 409 (1242-1267).
- `?deleteSource=true` deletes only a non-Official source the caller authored. It is skipped for authorless or other-author sources and ignored for the Official source (1269-1398).
- Make-official requires a matching `expectedPreviousOfficialId` for `deletePrevious`, and a stale value returns 409 with no change. Teachers get 4xx (1401-1551).
- Editor assign/unassign requires `expectedUpdatedAt` (1554-1600).

## Candidates

**No confirmed correctness, integrity or security defect in the supplied range.** The assertions match the policy excerpts I was given.

Test-level leads only. Per the policy, a test title or absent test is not a product defect.

1. **Low (coverage overstatement).** `endpoints.http.spec.ts:1216-1240`. The title says "CAN change META identity", and the policy lists `META.substrand_id` as a Site-Admin identity field. The test changes only `subject` and `grade`. Repro: add `substrand_id: 'changed'` to the spread and assert it is stored.
2. **Low (test does not exercise its stated scenario).** `endpoints.http.spec.ts:1475-1512`. The comment describes a stale previous Official, but the request passes `expectedPreviousOfficialId=${vB.id}`, which is the target itself. Repro: supersede an earlier Official, then send that former id and assert 409 with nothing deleted.
3. **Low (coverage gap).** `endpoints.http.spec.ts:1402-1463`. The policy requires Make Official to stamp `officialChangedAt`, `officialChangedFrom` and `officialChangedBy`, and says related deletions clear the nullable references. This test checks neither. Repro: read the plan after the call and assert the stamps, then check that deleting `vA` nulls any `officialChangedFrom` pointing at it.

## Unresolved questions

- The policy says `subjectGrade` is immutable, but the save at 1216-1240 does not assert that the new version's `subjectGrade` equals the source's. Is the relationship asserted elsewhere?
- The 409 tests at 1475 and 1242 do not check the response body, so they cannot tell which guard fired.
- Does the 1201 test's save use a Subject Admin or a Teacher? The role is outside the range, and it determines which field-split rule applies.
- Does the unassign half of the round-trip (after line 1600) restore the teacher's assignment exactly?
