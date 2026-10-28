# P141-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope and coverage

- **Read (all supplied text, no tool calls):**
  - `app/tests/int/adminResetLinkCarveOut.int.spec.ts:1-114`
  - `app/tests/int/api.int.spec.ts:1-20`
  - `app/tests/int/assignmentProvenance.int.spec.ts:1-180`
  - `app/tests/int/authFavorites.int.spec.ts:1-196`
  - `app/tests/int/authRateLimit.int.spec.ts:1-120`
- **Policy excerpts:** read as context only. The excerpt ends mid-sentence at "The accurate title", so later policy text is not assessed.
- **Not checked:** I did not verify that the pasted text matches baseline `6e75a173`. Implementations the tests call (`authRateLimit.ts`, `offlineAdminRecovery.ts`, `fieldSplit.ts`, `helpers/fixtures.ts`, `helpers/db.ts`, favorites and message access) are not in the supplied ranges. I make no claim about their behavior or about callers.
- **Coverage:** partial by design. I assessed the supplied test text only.

## Purpose and invariants (as the tests state them)

- Auth rate limits: login is budgeted per target identifier, and forgot-password per requested address with no existence oracle.
- The admin reset-link and operator-recovery paths are carved out of the public forgot-password budget. The public path must stay throttled.
- `grantedBy`/`grantedAt` cannot be forged through the ordinary write path and are not restamped on unchanged rows.
- Non-admins cannot spoof `readAt` on create or update. Trusted system writes keep it.
- Favorites are personal to their owner, with administrative visibility through `find`.

## Candidates

**No confirmed product defect.** The supplied ranges show test-level issues only. Each is a lead.

1. **Uncertain: `authFavorites.int.spec.ts:116-124`.** The create path (line 107) expects a spoofed `readAt` to be silently stripped. The update path expects a 403 instead, including for `siteAdmin`. Under field-level access that nulls values rather than refusing them, the update would succeed and this assertion would fail. The 403 only holds if collection-level update access denies the sender, which the supplied ranges do not show.
   - Severity: low, uncertain.
   - Reproduction: a Teacher updates their own message with `readAt` set and `overrideAccess: false`. Record whether the response is 403 or a silent strip, and compare with the policy.

2. **Coverage gap and misattribution: `adminResetLinkCarveOut.int.spec.ts:4-8` and `:96-113`.** The docblock says the public-still-throttled assertion catches a change to `if (req.user) return args`. It does not. An anonymous public call would still be throttled under that mutation, so test 3 passes. Test 1 is the one that would fail, because it sets no `req.user`. No supplied test covers an authenticated non-admin calling the public path, which is the case that mutation would open. The docblock also says "TWO TESTS" but the file has three.
   - Severity: low (test coverage).
   - Reproduction: mutate the carve-out to `if (req.user)`, run with a signed-in Teacher on the public path, and observe that no assertion fails.

3. **Weak negative assertion: `authRateLimit.int.spec.ts:71-81`.** `rejects.not.toMatchObject({ status: 429 })` passes on any rejection that is not a 429, including a 500 or a DB error. It does not show that the second identifier's budget is intact.
   - Severity: low (test quality).

4. **Claim not exercised: `assignmentProvenance.int.spec.ts:150-179`.** The docblock says this pins the depth at which the JWT strategy loads `req.user`. The test calls `findByID` at `depth: 2` directly and never goes through the authenticated request path.
   - Severity: low (test quality).

5. **Vacuous assertion: `api.int.spec.ts:14-19`.** `toBeDefined()` on a `find` result passes for any returned object.
   - Severity: low (test quality).

6. **Uncertain lead: cleanup in `adminResetLinkCarveOut.int.spec.ts:56-60` and `authRateLimit.int.spec.ts:50-53`.** Cleanup uses `%RUN%` against `bucket_key`. The authRateLimit file says login target keys are hashed and lack the readable marker. If forgot-password keys are hashed too, budgets for `PUBLIC_TARGET` and the unknown address would survive the run and could break later specs.
   - Severity: low, unverified. The key format is not in the supplied ranges.

## Unresolved questions

- Does the reset endpoint set `ADMIN_RESET_LINK_CONTEXT` only after an admin check, and not from request input? The tests assume it, but the endpoint is not in the supplied ranges.
- What is the key format for forgot-password budgets?
- Does collection-level update access deny a message's sender? This decides whether item 1 is a defect.
- What does the third argument `true` to `recoverOfflineSiteAdmin` mean, and does that path reach the carve-out flag?
