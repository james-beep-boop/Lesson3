# P118-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope:** Read-only review of the seven supplied ranges. No tools were run, and I did not inspect callers, fixtures, `src/` modules, or runtime behaviour beyond the text supplied.

**Ranges read**
- `app/tests/helpers/manageUi.ts:1-45`
- `app/tests/helpers/nullResourceLinks.ts:1-18`
- `app/tests/helpers/payloadErrors.ts:1-33`
- `app/tests/helpers/renderSql.ts:1-59`
- `app/tests/helpers/rowLocks.ts:1-127`
- `app/tests/http/apiErrorMessages.http.spec.ts:1-68`
- `app/tests/http/authFavorites.http.spec.ts:1-221`

Not assessed: the policy excerpts (context only), and everything they import or call (`fixtures.ts`, `httpWire.ts`, `db.ts`, `src/ingest/resourceLinks`, the Payload hooks, and the mark-read/favorites routes).

**Purpose and invariants (as stated in the code)**
- Test helpers: Playwright accordion navigation, field-error extraction from rejected writes, drizzle SQL rendering for lock-statement assertions, and row/advisory lock holders with a bounded "still blocked" check.
- HTTP specs: built-app error messages reach clients; unlock is Site-Admin-only; message read receipts cannot be forged on create or PATCH; mark-read touches only the recipient's rows; favorites reject nonexistent or non-integer versions with 404 or 400 and create nothing.

**Candidates**

1. **Low (test harness): `renderSql` silently drops non-number bound values.**
   `app/tests/helpers/renderSql.ts:28-54`. Only `number` values are pushed to `params` and given a `¶` placeholder. A `value` that is a string, boolean, `null`, `bigint` or `Date` falls through with no text and no param.
   - Precondition: a lock or query statement binds a non-number value. This assumes drizzle wraps such values as `Param` objects with a non-number `value`. I did not verify the installed drizzle version.
   - Expected: text includes a placeholder and params include the value, or the helper throws.
   - Actual: both are silently omitted.
   - Repro: `renderSql(sql\`SELECT ${'x'}\`)` should give `text: 'SELECT ¶'`, `params: ['x']`. Assert that, or assert it throws. The helper's own header warns that a confident wrong answer is worse than none.

2. **Low (test harness): `whileLockHeld` hangs instead of failing when the lock statement fails.**
   `app/tests/helpers/rowLocks.ts:91-98`. `started()` runs only after `await tx.execute(lockStatement)` succeeds. If that call rejects, `holding` never resolves, so `await holding` at line 98 never returns. The `holder` rejection is also not awaited, so it is unhandled.
   - Precondition: `lockStatement` is invalid, for example a bad column name.
   - Expected: a prompt rejection.
   - Actual: the call stays pending until the vitest timeout, and the holder's rejection is unhandled.
   - Repro: `await expect(whileLockHeld(payload, sql\`SELECT no_such_col FROM users FOR UPDATE\`, async () => 1)).rejects.toThrow()` should pass quickly. Expect it to hang today.

No product-level mismatch was found in the supplied ranges.

**Considered and not reported**
- `apiErrorMessages` 403/404 cases check only "not UNKNOWN and non-empty". That is weak test strength, not a defect.
- `authFavorites` removes the favorite only at the end of the last test, so a failing duplicate assertion leaves a row behind. This is test isolation, not a product defect.
- Anonymous mark-read returns 401 while native denials return 403. The test's own comment says custom routes use 401, so this is consistent with the stated carve-out.

**Unresolved questions**
- Does the installed drizzle wrap string or null bound values in `Param`? This determines whether candidate 1 is reachable in practice.
- Is a sender's PATCH to a message expected to be 403 for every role? The excerpts do not state the policy. The test asserts it, but I cannot say it is intended.
- Does `aresResourceLinksToRows` with the all-null fixture satisfy the mandatory `resourceLinks` contract? That source was not supplied.
- Security or integrity claims in these ranges remain unreviewed until independent review.
