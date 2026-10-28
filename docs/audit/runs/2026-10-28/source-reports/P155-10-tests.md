# P155-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: reingest and schoolName integration tests

**Coverage (no tool calls; tests not executed)**
- Read: `app/tests/int/reingest.int.spec.ts:401-800` and `:801-983`.
- Read: `app/tests/int/schoolName.int.spec.ts:1-43`.
- Not assessed: `reingest.int.spec.ts:1-400`, all source under `app/src`, and the helpers the tests call (`item`, `rawBundle`, `ingestUploadItems`, `officialOf`, `backfillReleases`, `retainReleaseAncestry`, `read`). Behaviour of those is unverified.
- This is a test-file review. Nothing here confirms product runtime behaviour.

**Purpose and invariants (as encoded by the tests)**
- Re-ingest of ARES releases: release identity and fingerprint dedupe, whole-major allocation, Official moves, preview tokens with stale-token rejection, lock recheck, rollback, and immutability of release metadata.
- `schoolName`: the operator command sets, trims and clears the name, preserves flags, and refuses invalid input without changing state.

**Candidates**

1. **Older-content flag omitted for restored content.** Severity: low–medium (warning omission). Lead, pending owner ruling.
   - Evidence: `reingest.int.spec.ts:734-739`. The January upload `'A'` has the same content as the November release (1.0.0). The test expects `olderContent: null`.
   - Policy: "Content equal to an older ARES release is flagged in the confirmation preview." The same file flags equal content at `:581-582` (`olderContent` `'2.0.0'`).
   - Expected: `olderContent` names the November release. Asserted: `null`.
   - Precondition: plan with a November release as 1.0.0 Official, a December release as Official, then a January upload identical to November.
   - Repro: keep the existing setup and assert `preview.official?.[0].olderContent` is `'1.0.0'`. If the policy owner intends "latest matching only", the policy text needs amending.

2. **Forged audit values not fully asserted.** Severity: test gap, not a product defect.
   - Evidence: `reingest.int.spec.ts:824-829` submits `officialChangedAt` and `officialChangedBy: null`. Only `officialChangedAt` is checked at `:829`.
   - Policy: "Submitted audit values are ignored" covers all three fields. A regression that accepted a forged `officialChangedBy` would still pass.
   - Repro: after the update, assert `relId(plan.officialChangedBy) === user.id` and that `officialChangedFrom` is unchanged.

3. **Exit-code assertions cannot distinguish refusal from crash.** Severity: low, test precision.
   - Evidence: `schoolName.int.spec.ts:23` maps any error without a numeric code to `1`. Lines `:34-35` assert exactly `1` for invalid input, and the same code would result from a script that fails to load or connect.
   - State is checked at `:36-38`, which limits the damage, but the test does not show that validation caused the refusal.
   - Repro: capture stderr and assert the validation message for `'Bad\nName'` and `[]`.

4. **Disjunctive assertion weakens the cannot-suppress check.** Severity: test gap.
   - Evidence: `reingest.int.spec.ts:457` uses `needsConfirmation || bundles.length === 1`. Either branch passes, so the test does not show the release is identified as awaiting confirmation.
   - Repro: assert the specific expected branch.

5. **`confirmationChanged` asserted without a token.** Severity: unclear; lead.
   - Evidence: `reingest.int.spec.ts:892-896` calls `ingestUploadItems` with no `previewToken` yet expects `confirmationChanged: true`. Its meaning in that path is not defined by the excerpts.

6. **Dev CLI revision does not move Official.** Severity: unresolved; policy silent.
   - Evidence: `reingest.int.spec.ts:594-608` creates 13.0.0 via the dev CLI, and the test asserts Official stays 12.0.0. The web revision at `:589-593` moved Official.
   - The policy's Official-on-import rules name upload and the supported import script. They do not state the dev CLI's Official behaviour, so I have not called this a mismatch.

7. **Unverified title claim.** Severity: none (title only).
   - `reingest.int.spec.ts:944` says ingest context is "cleared from the live request after each create". No assertion checks this.

8. **Rollback spy may not intercept the real write path.** Severity: unverified.
   - Evidence: `reingest.int.spec.ts:912-918` spies on `payload.create`. If the write path uses another handle, the test could pass without exercising the failure.

**Unresolved questions**
- Does the policy intend the older-content flag to cover restored content, or only the latest matching release (candidate 1)?
- Should the dev CLI move Official on ARES releases (candidate 6)?
- What does `confirmationChanged` mean when no token is supplied (candidate 5)?
- Do the spies at `:868` and `:912` intercept the real write path (candidate 8)?
- What do `reingest.int.spec.ts:1-400` and the helpers contribute to these assertions?

Security and integrity claims remain unreviewed until independent review.
