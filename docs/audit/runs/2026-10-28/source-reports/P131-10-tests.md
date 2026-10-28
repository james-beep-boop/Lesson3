# P131-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/http/nullResources.http.spec.ts:1-270` (end of file) and `app/tests/http/pendingAuthority.http.spec.ts:1-309` (end of file), as supplied in the message. No tools were run and nothing was executed.
- **Not assessed:** imported helpers (`helpers/fixtures`, `helpers/db`, `helpers/editRecovery`, `helpers/rowLocks`, `helpers/httpWire`), `src/fields/phases.js`, `src/ingest/resourceLinks.js`, the save-as-new/upload/export endpoints, `hooks/fieldSplit.ts`, and the generator. Any expectation that depends on them is unverified.

## Purpose and invariants

- **nullResources spec:** An ARES bundle with `video: null`/`reading: null` slots must upload (Site Admin), read back as empty groups, survive a Teacher-with-editing-access save-as-new, and export with search fallbacks. An uploaded `{}` or half-populated resource must be refused with 422 and no writes.
- **pendingAuthority spec:** Native user PATCH/DELETE, save-as-new with source deletion, and Make Official must re-check authority after a lock wait. A caller revoked during the wait (demoted, disabled, unverified, or signed out) must get 403 and roll back all writes.

## Candidates

**C1 — Low (test sensitivity, confirmed by reading).** `pendingAuthority.http.spec.ts:147-209` and `:211-276`
- The "revoked during wait" cases never assert that the same request succeeds before revocation. The caller starts as Site Admin plus editor, so the 403 is attributed to the revocation by inference only.
- At `:211-276` the payload changes `duration` (`:244`), which the policy excerpt lists as Subject-Admin-only. The 403 may therefore come from a different refusal path rather than the lock-wait re-check.
- Reproduction: add an unrevoked control with the same payload and assert 200 (or the expected outcome). Add a demoted case that changes only `overview` and assert 403. The revocation is shown to be the cause only if both pass.

**C2 — Low (lead, uncertain).** `pendingAuthority.http.spec.ts:198` vs `nullResources.http.spec.ts:173`
- The pendingAuthority spec reads the new version id as `out.id`. The nullResources spec reads `saved.doc?.id ?? saved.id`. The two specs assume different response shapes from the same endpoint.
- If the response is `{doc:{id}}`, `:198` yields `undefined` and `findByID` at `:200-206` fails for an unrelated reason. Which shape is correct cannot be determined from the supplied ranges.

**C3 — Minor (test strength).** `nullResources.http.spec.ts:171`
- `toBeLessThan(300)` would accept a 201 or any other 2xx, and also a 3xx. The sibling tests use exact statuses. This is a weaker assertion, not a product defect.

No confirmed product defect is established by the supplied ranges.

## Unresolved questions

1. Does a revoked session return 403 or 401? Every `signed-out` case expects 403 (`pendingAuthority:108, 137, 264, 298`). The policy excerpt says the refresh "rejects" a revoked session but does not state a status code, so the expected status is not derivable from policy.
2. What does save-as-new return (`{doc:{id}}` or `{id}`)? This decides C2.
3. What do `minimalResourceLinks` and the generator produce? The export counts at `nullResources:220-223` and the fallback URLs at `:225-226` cannot be checked from the supplied ranges.
4. Does `fieldSplit` refuse or silently preserve a non-permitted field edit? The excerpt says Subject Admin values are "preserved from the source", which would produce 2xx, not 403. This affects how the 403 expectations should be read if a non-admin edit is ever tested.
5. Does `signed-out` deletion of `users_sessions` invalidate an existing JWT under the configured Payload auth settings? The tests assume it does.

These are test-code observations based only on the supplied text. Security and integrity claims remain unreviewed until independent review.
