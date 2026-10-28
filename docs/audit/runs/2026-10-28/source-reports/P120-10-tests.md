# P120-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/http/combineSave.http.spec.ts:1-558`, as supplied.
- **Not assessed:** the endpoint, hooks, helpers (`fixtures`, `rowLocks`, `editRecovery`, `httpWire`, `db`), schema, and any runtime behaviour. I ran nothing. Every claim below is about what these tests assert, not what the product does.
- **Coverage claim:** partial. This is one test file, read in full. It is not a completed audit of Combine.

## Purpose and invariants (as encoded by the tests)

Integration tests for `POST /api/lesson-bundle-versions/:id/save-as-new` with `mergeParent` and `combine-preview`. They assert:

- Auth gating: 401 anonymous, 403 teacher.
- Parent/source checks: 404 with `unavailable` for a missing second parent or source, 400 for duplicates, self, or a cross-plan parent, 409 for stale timestamps.
- Server-owned provenance: `sourceVersion`, `mergedFrom`, and `lineage` are overwritten from the client (lines 181-193).
- Preview base selection (lines 211-288).
- Atomic rollback on stale recovery retirement (289-306).
- Re-checks after waiting on the plan lock for caller, parent, and source (351-557).

## Candidates

**C1. Lineage cap appears to drop the new direct parents. Lead, Low–Medium. Possibly intended.**
- Evidence: `combineSave.http.spec.ts:307-323` expects the saved version's `lineage` to equal exactly the capped parent's 2,000 ids. It omits both `fx.version.id` (the `sourceVersion`) and `capped.id` (the `mergedFrom`). The same save at lines 193-194 with a short lineage includes both.
- Precondition: a parent whose lineage is already at the 2,000-id cap.
- Expected: not stated by the supplied policy. The policy only says "existing 2,000-id cap".
- Actual (per the test): the newest direct parents are silently excluded. The follow-up preview at 324-334 then returns `base: null`, which is the conservative fallback.
- Reproduction: keep the assertions at 318-323, then add a check that `lineage` contains `sourceVersion` and `mergedFrom`, or that the save is refused. Whichever the owning spec requires decides the result.

**C2. Revoked session returns 403, not 401. Lead, Low.**
- Evidence: `:440-469` (`'signed-out'` case) expects 403. `:80-91` expects 401 for an unauthenticated request.
- Precondition: the session is deleted during the plan-lock wait.
- Expected: the policy says the refresh "rejects ... a revoked authenticated session" but gives no status code.
- Actual: the test enforces 403 for a mid-request revocation, which differs from the 401 for no session at all.
- Question for owners: is 403 intended for mid-request session loss?

**C3. Weak assertion for provenance-only changes. Confirmed local reasoning, test-quality only, Low.**
- Evidence: `:203-210` is titled "does not mistake provenance-only changes for edited content", but asserts only `status === 400` and the absence of `unavailable`.
- Consequence: the test passes for any 400, including an unrelated validation failure. It does not show that the rejection is the "no content change" path.
- Reproduction: assert the error message or field in the response body.

**C4. Server-owned fields other than provenance are not asserted. Informational.**
- Evidence: the `form()` helper spreads `...fx.version` (`:53`), which carries `semver`, `id`, and any release or official fields. Tests at `:179-193` check only `sourceVersion`, `mergedFrom`, and `lineage`.
- The policy says teacher saves carry null release provenance and ignore submitted audit values. Whether this file's fixture sends non-null values for those fields, and whether the server ignores them, cannot be determined from these ranges. This is a coverage gap, not a defect claim.

## Unresolved questions

1. **Preview base rule.** The `:263-288` "highest numeric version" and `:247-262` "surviving ancestor" rules are not in the supplied policy excerpts. I cannot say whether they are the specified behaviour.
2. **Source deletion on Combine.** `?deleteSource=true` is rejected with 400 at `:157-169`. The excerpts do not define merge-time source deletion, so the policy basis is unknown.
3. **Check ordering.** Revoked callers get 403 before source existence is checked (`:406-439`), but active callers get the source 404 first (`:100-108`). This fits "refresh, then evaluate access" but needs the endpoint code to confirm.
4. **Schema assumptions.** Raw SQL against `users_sessions`, `users_assignments`, `sign_in_disabled`, and `_verified` (`:429-462`) assumes column names I could not verify from these ranges.

Security and integrity observations remain unreviewed until an independent review.
