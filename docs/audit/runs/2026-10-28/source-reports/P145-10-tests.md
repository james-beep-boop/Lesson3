# P145-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

**Read in full (supplied ranges only):**
- `app/tests/int/discussions4a.int.spec.ts:1-219`
- `app/tests/int/draftCombineSuggestion.int.spec.ts:1-54`
- `app/tests/int/editRecoveryAccess.int.spec.ts:1-329`

**Not assessed:** the implementations under test (`src/lib/discussionPages.ts`, `src/lib/editRecovery/draftCombineSuggestion`, the edit-recovery collection and hooks), `tests/helpers/*` (fixtures, `createTopicAs`, `clearPostingCaps`, `drizzleOf`), vitest config, and all callers. I have not checked runtime behavior. I compared test expectations only against the test files' own comments and the supplied policy excerpts.

## Purpose and invariants (as stated by the tests)

- **discussions4a:** pins form their own block, most-recently-pinned first, and stay out of activity pages. Search ignores pins. A thread opens at the page holding `lastReadSeq + 1`, with explicit page fallback. Redacted titles and posts render as null. A deleted referenced version keeps its label with no links.
- **draftCombineSuggestion:** editors are offered a related ARES release, then a descendant, then nothing. Teachers are offered nothing. Unrelated ingested uploads are never suggested.
- **editRecoveryAccess:** `edit-recovery` denies read, create, update and delete to every role, including Site Admin, with `overrideAccess: false`. Deleting the source version, the user, or the plan removes the recovery rows. One row per (user, sourceVersion) is intended.

## Candidates

No confirmed product defect in the supplied ranges. Two test-integrity leads and one assertion gap follow. Each is a test-only issue.

**C1 — Low, confirmed by local reading (test assertion gap).**
`app/tests/int/editRecoveryAccess.int.spec.ts:129-133`. The comment says the duplicate-row rejection must come from the unique index, not access control, and must not be satisfied "by accident." The assertion is `.rejects.toThrow()` with no error class or code. It passes for any failure of the second seed, including a validation error. The unique-index invariant is therefore not pinned.
- Reproduction: add a test that asserts the second `seedRecovery` rejects with the database unique-violation code (23505, or the equivalent Payload/Drizzle error), and confirm it fails when the index is absent.

**C2 — Low, uncertain (test isolation).**
`app/tests/int/discussions4a.int.spec.ts:92, 96, 106`. Line 85 filters pinned rows to `ours`, but line 92 compares the unfiltered `page1.rows` to this spec's 20 topics. Line 106 takes the first row unfiltered. Both assume no other unpinned topic in the shared database has activity ahead of this spec's offsets, which the comment on lines 34-35 states but does not enforce.
- Reproduction: before the first test, set an unrelated topic's `last_activity_at` to `now() + 1500 minutes` and run the file. Line 92 should fail. I have not checked whether vitest runs files in parallel against one database, which would make this more likely.

**C3 — Low, uncertain (module import).**
`app/tests/int/draftCombineSuggestion.int.spec.ts:2-3`. Its imports omit the `.js` extension used by the other `tests/int` specs. If the project uses NodeNext ESM resolution, this file would fail to load. Not verified; the tsconfig and loader are outside the supplied ranges.

## Unresolved questions

1. **draftCombineSuggestion.int.spec.ts:26-35.** The test offers ingested release 2.0.0 to a draft based on 1.0.1, where both share parent `fx.version`. The supplied policy says a version already based on the current Official gets no "Combine them?" suggestion. That rule covers the lesson-page prompt, not this function. I cannot tell from the excerpts whether this function is meant to follow the same rule, so I have not reported it as a mismatch.
2. **discussions4a.int.spec.ts:160.** The assertion `lastReadSeq === 0` ("the author joined at 0") depends on `createTopicAs`, which I did not read.
3. **editRecoveryAccess.int.spec.ts:40, 179-245.** Denying Site Admin all access to `edit-recovery` is consistent with this file's own docblock, which cites SPEC §13. That section is not in the supplied policy excerpts, so I cannot confirm the policy from them.

**Coverage statement:** partial. Three test files were read in full. No implementation, helper, caller or runtime behavior was assessed, so no completed coverage claim applies to these features.
