# P146-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/tests/int/editRecoveryCap.int.spec.ts:1-182`, `app/tests/int/editRecoveryCapture.int.spec.ts:1-355`.
- **Not assessed:** the kernel (`src/lib/editRecovery/kernel.ts`), `../helpers/editRecovery.js`, `../helpers/fixtures.js`, `../helpers/db.js`, and SPEC §5 / design §8. Both files exercise these, so every behavioural claim below about `start`, `capture`, `retireDirectly`, or `MAX_CAPTURE_BYTES` is unverified against the implementation.
- **Policy excerpts:** used only for comparison where a test touches a policy-named field.
- **Not run:** no tests were executed, and this audit made no tool calls.

## Purpose and invariants (as the tests state them)

- **Cap (`editRecoveryCap`):** a per-user count of active captures, excluding retired rows, with resume always admitted, reactivation counted, and refusals creating or modifying nothing.
- **Capture (`editRecoveryCapture`):**
  - Compare-and-set on revision and generation.
  - Never inserts.
  - Refuses retired rows.
  - Stores prose only through a projection.
  - Replaces lone surrogates.
  - Enforces a hard byte ceiling.
  - Fails closed on an unresolvable transaction.
  - Stores malformed `combineContext` as NULL without losing prose.

## Candidates

**None confirmed.** The reviewed tests are internally consistent, and I found no concrete product mismatch from the supplied text alone.

## Leads (uncertain, not confirmed)

1. **Projection coverage gap** (`editRecoveryCapture.int.spec.ts:183-220`). The policy names fields that are never editable or are Subject-Admin-only: `SUMMARY_TABLE.lessons[].title`, `LESSONS[].substrand`, `LESSONS[].aresKeywords`, and `META.outputDir`. The hostile sentinel test does not cover them. Whether a draft should exclude them is not stated in the supplied policy. *Repro:* add sentinels for each field and assert `stored` does not contain them. Severity: low, pending the kernel's whitelist.

2. **Surrogate coverage gap** (`:268-280`). Only a lone high surrogate is tested. A lone low surrogate and a reversed pair (low then high) are not. *Repro:* store `'x\uDC00y'` and `'x\uDC00\uD800y'`, then assert each becomes U+FFFD and the output is valid. Absence of a test is not a defect by itself.

3. **Byte-ceiling measurement** (`:306-309`). The test measures `Buffer.byteLength(JSON.stringify(huge))`. The kernel may measure a different serialisation, such as after projection or sanitising. The test only proves the kernel agrees if it measures the same way. Unverified.

4. **Silent discard of malformed `combineContext`** (`:328-354`). The test asserts that prose survives and `combine_context` is NULL. It does not report the discard. Whether silent discard is intended is not in the supplied policy. This is a question, not a finding.

5. **Weak concurrency bound** (`editRecoveryCap.int.spec.ts:158-171`). With one seeded row and `CAP = 2`, the test allows up to `CAP + 1`. The lower bound `>= CAP` holds on the seeded row alone and is weak. The production cap (stated as 20) and the overshoot policy come from SPEC §5, which was not supplied. Not a defect.

6. **Unverified kernel assumptions.** These tests assume behaviour I could not check:
   - `retireDirectly` clears `content` (`:108`, `:140`).
   - Reactivation clears `content` (`:172`).
   - `ageRecoveryRow(…, 60)` ages by a positive amount in some unit (`:45`).

## Unresolved questions

- Does SPEC §5 define the cap per user across all sources, as the header and `beforeEach` assume?
- Does the policy intend drafts to exclude the Subject-Admin-only and never-editable fields listed in Lead 1?
- Is silent NULLing of malformed `combineContext` (Lead 4) the intended contract?
