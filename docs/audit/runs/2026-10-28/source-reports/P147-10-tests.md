# P147-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full from the supplied text:** `app/tests/int/editRecoveryExpiry.int.spec.ts:1-299` and `app/tests/int/editRecoveryMetadata.int.spec.ts:1-176`.
- **Not assessed:** the helpers they import (`../helpers/editRecovery.js`, `../helpers/fixtures.js`), the kernel and projection modules (`src/lib/editRecovery/kernel.js`, `projection.js`), and the vitest config. Nothing was run, and no callers or runtime behaviour were checked. Baseline `6e75a173` was not verified.
- **Policy excerpts:** not assessed against code. No source for the ingest, save, role, or upload rules was supplied, so no policy candidates are raised.

## Purpose and invariants (as the tests state them)

- Expiry selects only active rows with `updated_at` strictly before the cutoff, skips tombstones, skips rows touched or retired between selection and update, and continues past conflicts.
- Metadata lists only active captures for the requested version, exposes no content, and reports `bytes` as an approximation of the compact size.

These are the tests' claims. I have not confirmed that the product implements them.

## Candidates

**C1 — Low (test integrity; confirmed locally, conditional on the `rawRow` contract)**
- Location: `editRecoveryExpiry.int.spec.ts:64-65`.
- `isRetired` returns `(await rawRow(...))?.retired_at !== null`. If `rawRow` returns `undefined` for a missing row, `undefined !== null` is `true`, so a missing row reports as retired.
- Affected positive assertions: B2 (line 72), B3 (lines 249-250), B9 (line 289). These can pass vacuously if the row is absent or the lookup misses. The `?.` in lines 139-151 suggests `rawRow` can return `undefined`.
- Expected: a missing row fails a "retired" assertion.
- Actual: it passes.
- Reproduction: `expect(await isRetired(999999)).toBe(false)`. This passes now when it should fail. Confirming it needs `rawRow`'s return value for a missing row, which was not supplied.

**C2 — Low (lead; depends on fixture state)**
- Location: `editRecoveryExpiry.int.spec.ts:105-110` (B8) and `:81-82` (B1).
- The file's own convention (lines 59-63, 101-102) says totals are asserted only under a cutoff "no other row meets". B8 asserts exact global `{retired:0, skipped:0}` at cutoff `2024-06-01`, but nothing enforces that no older row exists.
- Expected: either a scoped assertion or an enforced precondition.
- Actual: a stale older row in the shared database would make B8 fail for an unrelated reason.
- Reproduction: seed an active row dated `2023-01-01`, then run B8. Expected to fail on `retired`/`skipped` totals.

**C3 — Low (test hygiene; confirmed locally)**
- Location: `editRecoveryExpiry.int.spec.ts:116` (B8 tidy-up).
- The cleanup is not in a `finally`. If an assertion at lines 107-112 fails, the 2024-dated active row remains. The file's own comment (lines 113-115) says such a row wins `limit: 1` slots in later tests.
- Affected: B6 (line 144, `limit: 1`) and B10 (line 296, `limit: 1`) would then select the stray row instead of the intended one.
- Expected: one B8 failure does not cascade.
- Actual: B6 and B10 fail for an unrelated reason.

**C4 — Unresolved (lead, not a finding)**
- The expiry file runs global sweeps with `CUTOFF = 2026-02-01`. If vitest runs files in parallel against one database, another spec's active row with a pre-cutoff timestamp could be retired mid-run. Whether this can happen depends on the vitest config, which was not supplied.

**C5 — Unresolved (lead, not a finding)**
- `editRecoveryMetadata.int.spec.ts:66` compares `rows[0].revision` with `token.revision` using `toBe`. The expiry file coerces revisions with `Number(...)` (lines 152, 241), which suggests raw values may be strings. Whether `readCaptureMetadata` returns a number depends on code not supplied.

## Unresolved questions

1. What does `rawRow` return for a missing row (C1)?
2. Is the vitest config sequential for `app/tests/int` (C4)?
3. What type does `readCaptureMetadata` return for `revision` (C5)?
4. Does `formDoc` produce the `lesson:L1` key that line 214 reads?
