# P158-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

**Read (supplied text only; no tool calls, no tests run):**
- `app/tests/int/userSecurity.int.spec.ts:1-479`, covering the supplied 1-400 and 401-479 ranges.
- `app/tests/int/verifyBackfill.int.spec.ts:1-105`.

**Not assessed:** the imported helpers (`helpers/fixtures.js`, `helpers/db.ts`, `helpers/rowLocks.ts`), `src/payload.config.ts`, `src/errors/AccountDisabled.ts`, `src/hooks/userRoles.ts`, the migration module, and all endpoints. Product behaviour is therefore unverified. The assertions below describe what these tests check, not what the product does.

## Purpose and invariants (as stated in the tests)

- **Login gate:** a disabled account is refused with `ACCOUNT_DISABLED_CODE`, cannot consume a reset token, and loses live sessions when disabled.
- **Last usable Site Admin:** demotion, disable, delete, or unverify is refused when it would leave no usable (enabled, verified) admin. Admin-count changes block on `ADMIN_COUNT_LOCK`.
- **Self-action guards:** an admin cannot disable or delete their own account.
- **Backfill:** the migration sets `_verified` to true only where it is NULL, and backfilled accounts can log in.

## Candidates

No confirmed product defect is supported by the supplied ranges. The items below are test-integrity leads, all low severity.

**1. Vacuous closing assertion and unchecked demotion outcome: `userSecurity.int.spec.ts:474-477` (confirmed by local reasoning).**
- Precondition: the test runs normally.
- Expected: the comment at 476 says "`b` is untouched", so the test should check that `b` still holds `siteAdmin` and that the demotion of `a` completed.
- Actual: line 477 is `expect(b).toBeTruthy()`, which is always true for a numeric id. Line 474 (`demote.catch(() => undefined)`) swallows any rejection, so a refused or failed demotion still passes.
- Repro: after the lock is released, await `demote` without swallowing, then assert `a`'s roles no longer include `siteAdmin` and `b`'s roles still include it.

**2. Demotion not awaited on the failure path: `userSecurity.int.spec.ts:467-474` (unverified lead).**
- Precondition: the `expect` at 467 fails.
- Expected: per the comment at 452-455, the demotion should always be settled before the test ends.
- Actual: the throw skips line 474, leaving `demote` un-awaited. This is the cross-test mutation that comment says the helper exists to prevent. Whether `whileLockHeld` awaits the callback's pending promise is in `helpers/rowLocks.ts`, which was not supplied.

**3. Swallowed DELETE error followed by duplicate role rows: `userSecurity.int.spec.ts:100-113` (confirmed by local reasoning; needs a DB error to trigger).**
- Precondition: the `DELETE FROM users_roles` at 100-102 fails. Its error is swallowed by `.catch(() => undefined)`.
- Expected: if the fixture cannot be cleaned, its roles are restored exactly as found.
- Actual: the roles were never removed, but the catch path at 108-113 re-inserts every captured role, duplicating `users_roles` rows for that user.

**4. Test title overclaims the uniformity check: `userSecurity.int.spec.ts:208-220` (test gap, not a product defect).**
- The title says "stays uniform… (no status oracle)". The body only asserts that a token is truthy for a disabled account. It never compares that response with one for an enabled account, so the anti-oracle property is not tested.

**5. Unverified precondition: `verifyBackfill.int.spec.ts:90` (low).**
- `toBeNull()` assumes Payload's `findByID` returns `null` for a NULL boolean column. If it returns `false` or `undefined`, the precondition fails spuriously. Not confirmed without the Payload adapter.

## Unresolved questions

- After a refused reset (`userSecurity.int.spec.ts:180-206`), should the reset token remain consumable once the account is re-enabled? The supplied policy does not say, so I have not treated this as a defect.
- `verifyBackfill.int.spec.ts:92` runs `up()`, whose `WHERE "_verified" IS NULL` is not scoped to `legacyId`. It will touch any other NULL row in the shared test database. Is that intended?
- Whether `ADMIN_COUNT_LOCK` and the `whileLockHeld` / `stillPendingAfterWindow` helpers behave as the comments describe needs the unsupplied source files.
