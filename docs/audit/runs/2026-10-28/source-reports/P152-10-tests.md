# P152-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made. All three supplied ranges were read as pasted:

- `app/tests/int/officialPointerLock.int.spec.ts:1-130`: read in full.
- `app/tests/int/personalVersions.int.spec.ts:1-172`: read in full.
- `app/tests/int/planIdentityImmutable.int.spec.ts:1-136`: read in full.

Not assessed: the product code these tests exercise (`hooks/bundleVersion.ts`, `hooks/lessonPlan.ts`, `src/lib/personalVersions.ts`, `helpers/rowLocks.ts`, `helpers/fixtures.ts`, `helpers/payloadErrors.ts`). Runtime behaviour of those modules is not established here. The SPEC sections cited in the headers (§5, §7) were only partly supplied.

## Purpose and invariants (as the tests state them)

- **officialPointerLock:** a version delete must wait on the plan row while a pointer move holds it, rather than decide from a stale `official_version_id`. The test pins the locking mechanism, not the original interleaving, and says so.
- **personalVersions:** `listPersonalVersions` lists only the caller's own saves, with `canEdit`/`canDelete` derived per subject-grade scope. Official versions are listed but not deletable. Uploaded, authorless versions never appear in a user's list.
- **planIdentityImmutable:** `lesson-plans.subjectGrade` cannot change via a trusted `overrideAccess` Local API update, including for plans with no Official pointer. A same-value write is accepted. The rejection is asserted by message and path.

## Candidates

**1. Weak ordering assertion in personalVersions P1 (test gap, Low, not a product defect)**
- Evidence: `personalVersions.int.spec.ts:94` is `expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(mine.id))`. If `newer` is missing from the list, `indexOf` returns `-1`, and `-1 < k` passes for any present `mine`. Only `mine`'s presence is asserted (line 92). `newer` is never asserted present.
- Precondition: a regression that drops the newest save from the list.
- Expected: the test fails. Actual: it passes.
- Reproduction: in a test double, return `[mine]` only from `listPersonalVersions`; line 94 still passes.
- Suggested fix in test: assert `ids` contains `newer.id` before comparing indices.

**2. Lead: P1 ordering may depend on timestamp ties (uncertain)**
- `saveAs` calls run back-to-back at `personalVersions.int.spec.ts:88-90`. If `listPersonalVersions` orders by a timestamp with coarse resolution, `newer` and `mine` could tie, making line 94 flaky. The ordering key lives in unsupplied source, so this is unverified.

**3. Lead: "blocked" signal may not prove the lock caused the wait (uncertain)**
- `officialPointerLock.int.spec.ts:107` uses `stillPendingAfterWindow`. A delete that is slow for another reason (for example pool exhaustion) would also return `true`. The helper's implementation was not supplied, so whether this is a false-positive risk is unknown. The header says the test went red against a reverted lock, which supports the check but does not rule out other causes.
- On failure at line 113, the pending `deleting` promise is left unawaited. This is hygiene only.

No confirmed product defect was found in the supplied ranges.

## Unresolved questions

1. **personalVersions P4 (line 152-158):** does the policy grant a teacher with editing access the right to delete their own non-Official version? The supplied excerpts do not say. I have not treated `canDelete: true` as a mismatch.
2. **officialPointerLock header (line 11):** the claim that `official_version_id` is `ON DELETE SET NULL` is attributed to the live schema. I could not check that, and I am not treating it as confirmed.
3. **personalVersions P2 (line 119-125):** the expectation that a lost-scope administrator cannot delete their own version in C is consistent with the header, but the policy excerpt on "source-deletion permission" is not complete enough to confirm it.
