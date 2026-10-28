# P136-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/http/systemSettings.http.spec.ts:1-400` and `:401-539` (the full supplied ranges, to end of file as provided).
- **Not assessed:** imported helpers (`helpers/db.js`, `helpers/rowLocks.js`, `helpers/fixtures.js`, `helpers/httpWire.js`), `src/lib/txDb.js` (`ADVISORY_LOCKS`), the `system-settings` global, the Save endpoint, and the rate limiter. Behavior asserted here is not verified against those. Runtime claims in comments (e.g. `:62-68` "POST → 403, PATCH → 404") were not checked.

## Purpose and invariants

The file is a wire-level authorization suite for `system-settings`. The invariants it asserts are:

1. The ordinary `POST /api/globals/system-settings` door refuses every role, including Site Administrators (`:123-144`).
2. Reads are Site-Admin-only (`:147-161`).
3. The Save endpoint is the sole writer. It requires the caller's password, a fresh `expectedUpdatedAt`, and the settings advisory lock. It stamps provenance and leaves sessions unchanged (`:163-348`).
4. Revoked administrators are refused mid-wait (`:403-452`).
5. Password checks are rate-bounded without an account lock (`:454-494`).
6. School-name saves are validated and do not disturb other flags (`:496-539`).

Each refusal case checks that stored state is unchanged, not only the status code.

## Candidates (product defects)

**None confirmed.** These ranges are tests. They can show that the suite asserts the stated invariants, but not that the product satisfies them.

## Leads (test-side, uncertain or low)

1. **Misdescribed intervening change — low.** `:329-336` writes `forumEnabled: before.forumEnabled`, which equals the stored value. The title at `:318` says "a change made while it waited." The 409 therefore proves only that `updatedAt` moved, not that a value changed. *Repro:* flip the intervening value and confirm the 409 still holds, and separately confirm the Save compares timestamps.

2. **"Before reading it" is not observed — low.** `:300-303` asserts only `413`. It does not check that nothing changed, and nothing shows the size check runs before parsing. *Repro:* send an oversized body containing a valid `changes` and password, then assert 413 and unchanged stored state.

3. **Inconsistent anonymous-status pinning — low.** `:139-143` deliberately accepts `[401, 403]` to avoid testing Payload's framing. `:245-247` and `:363-364` pin exactly `401` for anonymous callers. The two rationales conflict, and the pinned cases are brittle against framework changes.

4. **Login-budget cleanup may be partial — unverified.** `:111-113` clears only the Site Administrator's login budget, but `:99` logs in all four fixture users, and `:251`/`:366` may spend budgets for others. Whether this leaks depends on the teardown and how budgets are keyed. Not determinable from this file.

5. **Environment coupling in the 429 step — unverified.** `:490` reads `RATE_LIMIT_LOGIN_MAX` from the test process with fallback `20`. If the test runner lacks the app's value, the seeded counter may not reach the real limit, and `:492` would fail spuriously or pass for the wrong reason.

6. **Comment-asserted history — unverified.** `:4-17`, `:62-68`, and `:309-316` describe prior failures and mutation tests. These are author claims, not verified here.

## Unresolved questions

- Does the global `updatedAt` change on the intervening `updateGlobal` at `:331`? Lead 1 depends on it.
- What is `clearLoginTargetBudget`'s keying, and does `fx.teardown()` remove budgets for non-admin fixture users?
- Is the limiter default actually `20`, and is `RATE_LIMIT_LOGIN_MAX` passed into the test container?
- Does the Save endpoint perform the size check before parsing, and does it run the password login before or after the role check? Required to settle leads 2 and 3.
