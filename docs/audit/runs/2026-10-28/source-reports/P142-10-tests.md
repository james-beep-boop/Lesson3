# P142-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Assessed from the supplied text only. I did not run tests, open other files, or inspect callers.

- `app/tests/int/bestEffortEnqueue.int.spec.ts:1-304` (read in full)
- `app/tests/int/clearCollapsePrefs.int.spec.ts:1-138` (read in full)
- `app/tests/int/combineDraftMigration.int.spec.ts:1-48` (read in full)
- `app/tests/int/combineMigration.int.spec.ts:1-79` (read in full)

Not assessed: the migrations under test (`20261018_095242_combine_draft_context`, `20261018_072213_combine_lineage`), `scripts/lib/preferences.ts`, `scripts/lib/stripCollapsed.ts`, `src/lib/editRecovery/kernel`, `src/jobs/generateVersionArtifact`, `tests/helpers/*`, and the Payload internals the specs rely on.

## Purpose and invariants

These are Postgres-backed integration specs for three behaviours:

1. Best-effort enqueues (messages ping, official-pointer prewarm) must not roll back the primary write, and an orphaned prewarm job must not be reported as a failure.
2. The preference-clearing script writes only collapse state, leaves other preferences and the owning `user` relationship intact, and is safe to re-run.
3. Combine migrations are idempotent on rerun and rollback, keep content and timestamps unchanged, and preserve lineage past deleted parents.

## Candidates

No product-level defect is confirmed from these ranges. Each candidate below is a defect in the test's ability to detect a regression. None is a product defect.

**C1. Vacuous pass risk in `combineDraftMigration.int.spec.ts:29-47`** (low)
- `capture(...)` at line 29 has its result unchecked. Line 28 checks `begun.ok`, but there is no equivalent for capture.
- The `read()` helper filters by `user_id` and `source_version_id`. If capture returns a non-ok result without throwing, `before` is `[]`. Lines 42-47 then compare `[]` to `[]` and pass.
- The title says "adds and rolls back metadata", but nothing asserts the added columns exist before `down` or are absent after it. The migration is not supplied, so I cannot say what it adds.
- Repro: check `capture`'s result, then assert `before` has length 1 and that `information_schema.columns` shows the added column before `down` and not after.

**C2. Fault injection can silently degrade to a plain throw in `bestEffortEnqueue.int.spec.ts:83-95`** (medium, for L3-03 coverage)
- The SQL poisoning depends on `adapter.sessions?.[String(await txId)]?.db` resolving. This relies on an undocumented Payload adapter shape.
- If the lookup misses, no SQL runs. The mock then throws a plain error, and the tests at lines 141-173 and 182-221 pass even against the buggy `req`-passing code. The file header says a plain rejection "passes against the broken code, proving nothing", so this failure mode is already known.
- Repro: throw when `txDb` is undefined and `txId != null`. Then run a deliberately buggy variant that passes `req`, and confirm the spec fails.

**C3. Loose error match in `clearCollapsePrefs.int.spec.ts:88`** (low)
- `rejects.toThrow(/User/i)` matches any error mentioning "user". The header describes this assertion as proving the `user`-in-`data` dead end, but it does not pin the required-field failure.
- Repro: assert the specific Payload validation message or its error data path.

**C4. Shared-state ordering in `clearCollapsePrefs.int.spec.ts:130-137`** (low)
- The owner-relationship test relies on the write from the previous case. It is correct under sequential execution, but running it alone or with `.only` gives a different starting state. The test does not state this dependency.

## Unresolved questions

- Does the installed Payload version key `adapter.sessions` by `transactionID` as `bestEffortEnqueue.int.spec.ts` assumes? This decides whether C2 is live or only theoretical.
- The header states that `jobs.queue` falls back to `createLocalReq({}, payload)` when `req` is absent. I could not verify this, so the fix rationale is unconfirmed.
- What do the two combine migrations add or change? This determines whether C1 and the `combineMigration` equality checks cover the real schema change.
- Do `stripCollapsed` and `writePreferenceValue` behave as the spec assumes? I did not read them.
