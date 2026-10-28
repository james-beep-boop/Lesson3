# P016-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- `app/src/endpoints/userAssignments.ts:1-285`: read in full.
- `app/src/endpoints/userSearch.ts:1-257`: read in full.
- `app/src/endpoints/verifyEmail.ts:1-43`: read in full.
- **Not assessed:** `access` (`isSubjectAdminFor`, `userTypeLabel`), `hooks/userRoles` (`takeAdminCountLock`, `enforceAssignmentScope`), `hooks/fieldSplit.ts`, `lib/txDb`, `lib/assignmentRoles`, `lib/relId`, `lib/rateLimit`, `lib/userSearchContract`, `endpoints/respond`, the tests, and Payload's `initTransaction`/`killTransaction`/`verifyEmailOperation`. No callers or runtime behaviour were checked. No commands or reproductions were run.

## Purpose and invariants

- **userAssignments:** four POST routes apply a one-row delta to `users.assignments`. They require a fresh `expectedUpdatedAt`, take the admin-count lock and the target row lock, re-read the caller after the wait, and write as the caller with `overrideAccess: false`. The file treats `enforceAssignmentScope` as the authority.
- **userSearch:** an SQL query selects ids and counts. Documents are then read through Payload with `overrideAccess: false`. Type and status filters are computed in SQL.
- **verifyEmail:** shadows Payload's native `/verify/:id` route to add a site-global rate cap. Token semantics stay in `verifyEmailOperation`.

## Candidates

**C1: LIKE wildcards are not escaped.** Severity: low. Confirmed by local reasoning.
- Evidence: `userSearch.ts:126-127` builds `%${q}%` with no escaping of `%` or `_`.
- Precondition: a Site Administrator searches.
- Expected: a literal substring match. This is inferred from the code's apparent intent, not from a supplied policy.
- Actual: `_` matches any single character and `%` matches anything. `q=%` returns every user.
- Reproduction: seed users `Ann_Lee` and `AnnXLee`. `GET /api/users/search?q=Ann_Lee` should return only the first, but the code returns both with `totalDocs: 2`.

**C2: `subjectGradeId` coercion admits invalid ids.** Severity: low pending the hook. Confirmed by local reasoning.
- Evidence: `userAssignments.ts:86-89` uses `Number(body?.subjectGradeId)` with `Number.isFinite`. `Number(null)` is `0`, `Number(true)` is `1`, `Number([7])` is `7`, and `1.5` is finite.
- Precondition: a Site Administrator calls `assign-subject-admin` with `subjectGradeId: null`.
- Expected: 400, since ids are positive integers.
- Actual: the value `0` passes the guard and reaches `nextRows`, which writes `{subjectGrade: 0}`. Whether the hook or the database rejects this is unknown, because the hook was not reviewed. The `true` and `[7]` cases are the same type gap, but they are consistent between the check and the write, so they do not by themselves bypass authority.

**C3: Editor routes disclose role state before authorization is enforced here.** Severity: low, pending the hook. Confirmed by local reasoning on the ordering.
- Evidence: `userAssignments.ts:172-187` has no caller gate for `editor`. The lock, freshness check, and `nextRows` 409s (lines 259, 144, 149-152) run before the `req.payload.update` call at 263. Editor authorization is delegated entirely to the unseen `enforceAssignmentScope`.
- Expected: per the policy in §8, a Teacher should not grant or revoke editing access, and should get a 403 without learning role state.
- Actual, locally: a caller who presents the current `updatedAt` receives `409 "already has editing access"` or `409 "does not have editing access"` before any authorization check in this file.
- Reproduction: as a Teacher with no subject-grade role, call `assign-editor` with the target's current `updatedAt`. Expect 403 with no 409 and no row change. The test needs a way to learn `updatedAt`, which is unverified.

**C4 (lead, uncertain): the catch may roll back a transaction this call did not open.** Severity: unknown.
- Evidence: `userAssignments.ts:209` sets `shouldCommit` from `initTransaction`, but the catch at 274-276 calls `killTransaction(req)` regardless of `shouldCommit`.
- Precondition: the handler runs inside an outer transaction, so `initTransaction` returns false, and then something throws.
- Expected: only a transaction this handler opened is rolled back.
- Actual: depends on Payload's semantics, which I did not verify.
- Reproduction: invoke the handler inside an outer transaction, force an error after the update, and check whether the outer transaction is rolled back.

**C5 (lead, low): documents can be dropped without changing totals.** Severity: low, impact depends on access rules I did not read.
- Evidence: `userSearch.ts:191-208` reads documents through access control. `userSearch.ts:233-236` silently drops any id that is missing from the result. `totalDocs` and `totalPages` come from the SQL at lines 129-139.
- Precondition: the access rule hides a row that the SQL counted.
- Actual: the page is shorter than `limit` and the totals still count the hidden row.

## Unresolved questions

1. Does `enforceAssignmentScope` reject a Teacher caller on editor grant and revoke, and does it run before or after the 409 path in C3?
2. Does `initTransaction` return false for nested calls, which would make C4 real?
3. What do the hook and the database do with `subjectGrade: 0` (C2)?
4. Can the Site Administrator access rule hide any row the SQL counted (C5)?
5. Does `userTypeLabel` agree with the SQL classifier in `typeCondition` (`userSearch.ts:57-71`)? A disagreement would make the type filter and the displayed label contradict each other.
6. `verifyEmail.ts` depends on Payload route precedence to shadow the native handler. That is documented as covered by a wire-level test, but I did not read that test, so I make no claim about it.
