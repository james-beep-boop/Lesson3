# P138-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/tests/http/userAssignments.http.spec.ts`

**Result: no confirmed product defects in the supplied range.** This is a test file. Its assertions describe endpoint and hook behavior, but the implementations it exercises (`endpoints/userAssignments.ts`, `enforceAssignmentScope`, `autoDemotePriorSubjectAdmins`, `ADVISORY_LOCKS`, the fixtures and row-lock helpers) were not supplied, so I cannot confirm that any assertion holds at runtime.

**Ranges read**
- `app/tests/http/userAssignments.http.spec.ts:1-400`, read in full.
- `app/tests/http/userAssignments.http.spec.ts:401-546`, read in full. The file ends at line 546.
- Not assessed: the policy excerpts (used only as the stated rules), `endpoints/userAssignments.ts`, `hooks/`, `src/access/`, `src/lib/txDb.ts`, `tests/helpers/*`, and the baseline commit `6e75a173…`. I did not verify that the working file matches that baseline.

**Purpose and invariants asserted**
- Route gate for `assign-subject-admin` and `unassign-subject-admin`: 401 unauthenticated, 403 for Teachers and for Subject Administrators who appoint a target with no editing access, 403 before body parse for a Subject Administrator vacating, 400 without a freshness token, 409 on a stale token or an already-held or not-held role, and 404 for an unknown user.
- Happy paths: appointment demotes the prior administrator to `editor`; vacating leaves the subject-grade with none.
- Generic `PATCH /api/users/:id`: refuses an ineligible `subjectAdmin` append, permits the same append once the target has editing access, and refuses an administrator removing their own `subjectAdmin` row while a no-op write of the same rows succeeds.
- Lock-wait races: after the administrator-count lock is released, a caller who is unverified, demoted, or disabled is refused with 403, and target roles and `updatedAt` are unchanged.

**Candidates**
None meet the bar for a confirmed defect.

**Leads (uncertain, not defects)**
1. **Lines 395-412 (comment, uncertain).** The comment says the Roles & Access panel "is gone from their next request." This UI behavior is not asserted or checked in this file.
2. **Lines 477, 459-461 (unverified).** The `unassign-editor` and `assign-editor` route shapes and bodies are used in the race block, but the supplied ranges do not show that those routes exist or accept this body.
3. **Lines 487, 502, 510, 494 (unverified).** Raw SQL names `users_assignments`, `users_roles`, and `sign_in_disabled` are unchecked against the schema. A wrong name either throws, which fails the test loudly, or deletes zero rows, which makes the caller stay privileged and the test fail. I found no path where a wrong name produces a false pass.
4. **Lines 525-527 (unverified).** The test assumes `ADVISORY_LOCKS.adminCount` is the lock the routes actually take. A mismatch would make `stillPendingAfterWindow` fail, not pass.
5. **Lines 540-543 (coverage gap).** "Writes nothing" checks only the target's roles and `updatedAt`. Side effects on other accounts, such as `autoDemotePriorSubjectAdmins` demoting someone else, are not checked.
6. **Coverage gap.** No positive test in this file shows a Subject Administrator successfully granting or revoking editing access through the routes. The only `editor` route cases are refusals in the race block. Whether this is a gap in product coverage or an intentional split depends on the spec, which is not in the supplied ranges.

**Unresolved questions**
- Does the route take the same administrator-count lock and target row lock that these tests assume?
- Does `refreshCaller` run before or after collection access, and does a refused unverified caller get 403 rather than 401 under all paths?
- Is the Roles & Access panel behavior described at lines 409-411 specified elsewhere, and is there a UI test for it?
- Do `assign-editor` and `unassign-editor` have a documented Subject Administrator permission matrix that this file should assert?

Security and integrity claims in this file remain unreviewed until independent review of the endpoint, hook, and lock implementations.
