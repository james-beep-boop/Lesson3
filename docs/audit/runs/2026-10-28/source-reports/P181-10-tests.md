# P181-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope and coverage**

No tool calls were made. All ranges below were reviewed from the supplied text only; no repository files were opened.

- `app/tests/unit/fieldSplitContainers.spec.ts:1-168`: read
- `app/tests/unit/filterRows.spec.ts:1-56`: read
- `app/tests/unit/firstUserBootstrap.spec.ts:1-49`: read
- `app/tests/unit/firstUserRoleLock.spec.ts:1-96`: read
- `app/tests/unit/firstUserVerificationEmail.spec.ts:1-49`: read
- `app/tests/unit/forgotPasswordFailure.spec.tsx:1-89`: read
- Policy excerpts: used only as the expected-behaviour reference for the field split, bootstrap and forgot-password flows.
- Implementation files these tests exercise (`hooks/fieldSplit.ts`, `hooks/bundleVersion.ts`, `access`, `hooks/userRoles.ts`, `lib/firstUserBootstrap`, `ForgotPasswordForm.tsx`, `lib/substrand.ts`): **not assessed**. Every claim below about their behaviour is unverified.

**Purpose and invariants pinned by the supplied tests**

- Editing-access field split: a teacher's submission cannot delete or malform `finalExplanation` or `summaryTable`. Omitted containers are rebuilt from the original. Prose is overlaid, while admin-only headers, rubric and row titles are preserved. Cardinality is enforced.
- Filtering: subject, grade and query compose with AND semantics. Empty criteria and NaN grade mean no grade filter.
- First-user bootstrap: anonymous signup is refused while the users table is empty. Initialization runs under an advisory lock, and the first-register path is refused once a user exists. Verification email is suppressed only for trusted in-process first-register creates.
- Forgot-password: the rendered outcome is identical for every server status except 429 and client-side network failure.

**Candidates**

No confirmed product defect is supported by the supplied text.

1. **Uncertain lead, unverified. Severity: medium if real.** `app/tests/unit/firstUserBootstrap.spec.ts:10-19, 24-32`
   - Precondition: `usersCollectionCreate` (not assessed) counts users through an access-restricted path.
   - Expected: after initialization, anonymous signup is allowed (line 29-32). The `hasRegisteredUsers` test requires `overrideAccess: true` (line 15-19). The gate test's `count` mock does not assert its arguments, so nothing shows the gate uses the bypass.
   - Actual: unknown. If the count is restricted and returns 0 for anonymous callers, the gate would refuse anonymous signup permanently.
   - Repro: a test with a real Payload users collection that denies anonymous reads. After one user exists, assert that anonymous `usersCollectionCreate` returns true, and that the count call carries `overrideAccess: true`.

2. **Uncertain lead, unverified. Severity: medium if real (account enumeration).** `app/tests/unit/forgotPasswordFailure.spec.tsx:75-81, 53-65`
   - Precondition: a per-address rate limit on forgot-password that is evaluated after the account lookup.
   - Expected: the 429 carve-out (line 75-81) is account-independent, as its title states. Timing is also account-independent, since the header says the real fix is server-side.
   - Actual: the supplied test only compares DOM output for a single request per address. It cannot show that 429 onset or response timing is independent of account existence. The timing channel is not covered by any supplied assertion.
   - Repro: for known and unknown addresses, send the same number of requests and compare the first 429 index and response-time distributions.

**Test-strength notes (not product defects)**

- `app/tests/unit/firstUserRoleLock.spec.ts:82` uses a bare `.rejects.toThrow()` for the lost-race refusal. The file header of `fieldSplitContainers.spec.ts` warns that this pattern can pass on an unrelated TypeError. The refusal message is not pinned.
- `app/tests/unit/firstUserRoleLock.spec.ts:39` matches the lock SQL through a `queryChunks` string join. A lock issued through a non-array chunk would be missed, which could cause a false negative.
- `app/tests/unit/filterRows.spec.ts:53` is titled "hand-edited ?grade=abc" but passes `Number('abc')` directly. It does not exercise any query-string parsing.

**Unresolved questions**

- Does `usersCollectionCreate` call `count` with `overrideAccess`, and does the anonymous gate evaluate before or after the authenticated-admin short-circuit?
- Is `req.pathname` in `firstUserVerificationEmail.spec.ts:8, 19` client-influenced in any deployment? Suppression depends on it together with `overrideAccess`.
- Is the forgot-password rate limiter keyed by address before or after account lookup?
- Is there a server-side timing test that matches the header's claim?
- Does `VERSION_EDITOR_KEYS` contain any key besides `lessons`, `finalExplanation`, `summaryTable` and `updatedAt`? The `it.each` at `fieldSplitContainers.spec.ts:100-107` depends on that set.
