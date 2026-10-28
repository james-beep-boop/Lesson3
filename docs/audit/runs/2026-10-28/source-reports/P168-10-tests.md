# P168-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made. All assessment is from the supplied text.

**Read (supplied ranges):**
- `app/tests/unit/combineEngine.spec.ts:401-577`
- `app/tests/unit/combineFields.spec.ts:1-41`
- `app/tests/unit/combineLineage.spec.ts:1-103`
- `app/tests/unit/combineOutcome.spec.ts:1-13`
- `app/tests/unit/combineRetry.spec.tsx:1-198`

**Not assessed:**
- `combineEngine.spec.ts:1-400`, which was not supplied.
- All source under test: `src/lib/combine/{engine,ancestry,backfill,lineage,outcome}`, `src/lib/versionContent`, `src/lib/editRecovery/projection`, `src/components/CombineVersions/applyOverlay`, and `src/components/LessonControls`. Expected behaviour below is what the tests assert, not verified against implementation.
- The policy excerpt ends mid-sentence in §8, so later role rules were not read.

## Summary of purpose and invariants (as asserted by these tests)

- **Engine:** Combine merges only against a usable common ancestor. Without one, every difference is a `no-ancestor` choice and the overlay is empty. Differing `resourceLinks` are refused without a shared ancestor, and an unaligned ancestor does not authorize them. Lesson reordering is refused when resource updates are present.
- **Lineage:** Union keeps the newest ids under the cap. A side with a full ancestry window and unknown completeness yields no automatic base. The newest-semver common ancestor is chosen, with ties broken by `createdAt` then id. Backfill handles unordered rows, diamonds and cycles.
- **Field mapping:** Only the teacher-prose scopes in the policy map to form paths. Subject-Admin fields, unknown rows and prototype keys return `null`. The overlay is validated atomically, so one bad field rejects the whole batch.
- **Retry:** A failed overlay application can be retried, and Save stays disabled until it succeeds. A restored draft is not auto-saved. A 404 on the stored second parent degrades the draft to an ordinary one.

## Candidates

**None confirmed.** Every asserted behaviour is consistent with the policy excerpts that were supplied, and nothing here is a demonstrated product mismatch.

**Uncertain lead (low):**
- `combineLineage.spec.ts:19-25` and `:45-55`: when lineage exceeds `MAX_LINEAGE`, the oldest recorded ids are dropped. Policy §7 says backfill uses "the existing 2,000-id cap, preserving recorded deleted ancestors." The tests show truncation of the oldest entries (ids 1–2 in the 3-extra-row case). Whether this conflicts with "preserving" depends on intent the excerpt does not state. As tested, the effect is conservative: a dropped ancestor can only push Combine toward the two-way fallback. Reproduction: run `backfillLineages` on a chain of `MAX_LINEAGE + 3` rows and inspect `lineage[0]`. This is the same assertion the test already makes, so it is a question about intent, not a failing check.

## Test-only observations (not product defects)

- `combineRetry.spec.tsx:151` asserts an exact `dispatch` call count of 2, which is brittle to any refactor of the apply loop.
- `combineRetry.spec.tsx:118` stubs global `fetch` with an unrelated `officialVersion` payload. It does not affect the asserted behaviour.

## Unresolved questions

1. Does the two-way fallback for an unaligned ancestor (`combineEngine.spec.ts:504-511`) match the intended Official-content policy? The excerpt does not define it, so I have not judged it.
2. `combineFields.spec.ts:33-40` asserts that the overlay is rejected whole when it contains an admin field. Confirming that Combine never writes Subject-Admin fields in the apply path requires `applyOverlay` and `planCombine` source, which were not supplied.
3. Tie-breaking by `createdAt` then id (`combineLineage.spec.ts:65-71`) is not stated in the policy excerpt. I cannot judge whether it is intended.
4. Whether `combineEngine.spec.ts:1-400` contains cases that change any conclusion above is unknown.

**Partial assessment:** This is a test-level review of five files. It does not establish that the implementation satisfies these tests.
