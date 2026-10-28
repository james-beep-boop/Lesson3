# P130-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage (partial)

Read as supplied in this message; no tool calls, no on-disk check, no baseline commit check (`6e75a173…`), and no tests run:

- `app/tests/http/loginProtection.http.spec.ts:1-162`: read in full.
- `app/tests/http/messageReferences.http.spec.ts:1-178`: read in full.
- `app/tests/http/nativeVersionAuthority.http.spec.ts:1-98`: read in full.
- Policy excerpts (§7 ingest/release, §8 roles): used as context only. §8 ends mid-sentence ("The accurate title"), so the user-model text is incomplete.
- **Not assessed:** `../helpers/*` (fixtures, db, httpWire, rowLocks), `relId`, `lessonReference`, and all login, rate-limit, refresh, message, and Official-pointer source. Behavior of the implementation is unverified.

## Purpose and invariants (as asserted by the tests)

- **loginProtection:** unknown-address and wrong-password responses are identical; per-client and per-account limits are independent; forwarding headers count only through trusted proxies; legacy locks are ignored; legacy PBKDF2 hashes upgrade; unverified and disabled accounts return 403 only after a correct password.
- **messageReferences:** the server chooses the recipient and the version label; a reply source is visible only to its recipient; a version must belong to the linked plan; anonymous create is refused with no write.
- **nativeVersionAuthority:** after a plan-lock wait, the caller is re-evaluated; a demoted, disabled, unverified, or signed-out caller gets 403 and Official and the candidate version are unchanged.

## Candidates

**None confirmed.** The three files assert plausible invariants, but they cannot show that the implementation satisfies them. The findings below are test-level leads, not product defects.

## Leads (uncertain, test-level)

- **L1 · Low · loginProtection.http.spec.ts:31-34, 106-116.** `beforeEach` clears buckets for `A` and `B` only. The direct-client test uses the `pdf-private` identity, which is never cleared.
  - Precondition: a second run, or any other run, within the same one-minute window against the same DB.
  - Expected: line 110 receives 401 for all 20 attempts.
  - Predicted (not run): line 110 receives 429 from carried-over count.
  - Repro: run the file twice within a minute without a DB reset.
  - Unverified: how the limiter keys the socket identity and what `clearRateLimitBuckets` matches.

- **L2 · Low · nativeVersionAuthority.http.spec.ts:79.** There is no control case. The 403 is not shown to come from the caller's change rather than from the harness.
  - Repro: add a `change='none'` case expecting success. If it also returns 403, the test does not discriminate.
  - The test also holds only the plan row lock. The policy names the shared administrator lock, which is not exercised.

- **L3 · Low · messageReferences.http.spec.ts:13.** Uses `E2E_BASE_URL ?? 'http://app:3000'`, while the other two suites use `HTTP_BASE`/`url()`. If the defaults diverge, this suite targets a different host. Unverified against `httpWire`.

- **L4 · Low · loginProtection.http.spec.ts:72, 87, 108.** `Number(process.env.RATE_LIMIT_LOGIN_*) || 20` (or 60) duplicates a default the server may own. If they differ, the expected budgets are wrong. Unverified.

- **L5 · Info · loginProtection.http.spec.ts:144-161.** The title promises "guidance," but only status codes are asserted. The policy's "waiting for approval" wording for unverified accounts is not checked.

- **L6 · Info · messageReferences.http.spec.ts:164-177.** A nonexistent version id returns "must belong to the linked lesson plan," which may read to users as a plan mismatch. The wording is pinned by the test, so whether it is intended is unknown.

## Unresolved questions

1. What status and body should an unverified or disabled account get beyond 403? The policy specifies only the "waiting for approval" wording for unverified accounts.
2. Is the 403 (original sender) versus 404 (others) split for reply sources intended?
3. What status should a refresh rejection return? The tests pin 403; the policy says only "rejects."
4. Do the server's `RATE_LIMIT_LOGIN_*` defaults match 20 and 60?
