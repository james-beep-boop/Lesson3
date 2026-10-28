# P156-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope read

- `app/tests/int/subjectAdminHandover.int.spec.ts:1-105`: read in full, as supplied.
- `app/tests/int/systemSettings.int.spec.ts:1-289`: read in full, as supplied.

**Not assessed:** all product source, including the access definitions, `enforceAssignmentScope`, `autoDemotePriorSubjectAdmins`, `stampFlagChanges`, `readSystemFlags`, the `system-settings` global definition, `helpers/fixtures.js`, and the migrations. I had no tool access and worked only from the supplied text. Payload behaviour asserted in comments (for example, the `overrideAccess` branch cited at `systemSettings.int.spec.ts:15`) is unverified. This is a partial assessment of two test files, not a coverage claim for the product.

## Purpose and invariants (as the tests state them)

- **Handover (`subjectAdminHandover`):** adding a `subjectAdmin` row succeeds only for an existing editor in that subject-grade; removing any `subjectAdmin` row is refused; promoting an editor demotes the outgoing administrator.
- **System settings:** no ordinary-door write or read for any tested role; trusted writes record the actor; a changed flag loses its provenance row on a userless write; forged provenance is ignored on the trusted path; one provenance row per flag.

## Candidates

**None confirmed.** These ranges establish no product defect.

## Uncertain leads (test-side; not product defects)

1. **`systemSettings.int.spec.ts:93-97`**: `afterAll` unconditionally sets `publicLibraryLive: true`. The comment at `:92` says it restores "the migration's defaults", but the file does not show that default and the teardown never reads the prior value. If the stored value differed before the run, the suite overwrites it. Severity: low. Reproduce by reading the flag, running the suite, and comparing. Uncertain.

2. **`systemSettings.int.spec.ts:268-288` and `:184-189`**: both write `features` with a single key. Whether Payload's `updateGlobal` merges or replaces the `features` group decides whether the sibling flag survives. No assertion checks that `publicLibraryLive` is untouched after the `forumEnabled` write. Severity: unknown until Payload behaviour is confirmed. Focused reproduction: set `publicLibraryLive: false`, write `features: { forumEnabled: true }` with `overrideAccess: true`, then read `publicLibraryLive`.

3. **`subjectAdminHandover.int.spec.ts:64-70, 76-78`**: `rejects.toThrow()` has no message or code check, so a setup failure or unrelated error would also pass. This weakens the tests but does not show the guard is missing.

4. **`subjectAdminHandover.int.spec.ts:82-104`**: the third test changes `fx.users.subjectAdmin`, and the earlier removal test depends on that row existing. The tests pass only because they run sequentially in declaration order. Test isolation issue only.

5. **`subjectAdminHandover.int.spec.ts:6-7`**: the header says demotion happens "in the same write". The test checks only the end state after two writes and never asserts atomicity.

6. **`systemSettings.int.spec.ts:175-201`**: the comment at `:144-151` acknowledges that isolation cannot be tested with one flag. An unchanged flag keeping its row through a userless write is therefore untested. Coverage gap only.

## Unresolved questions

- **Read policy:** who may read `system-settings`? The supplied policy excerpts are silent, so `:131-139` pins a read-refusal rule I cannot judge against any stated expectation.
- **Payload semantics:** does `updateGlobal` replace or merge a group? This decides lead 2.
- **Migration default:** what is the stored default for `publicLibraryLive`? This decides lead 1.
- **Handover enforcement:** does `enforceAssignmentScope` confirm that the successor's editing access is in the same subject-grade, and does the demotion run in the same transaction? Both need the product source.
- **Global access:** is `update` really `() => false`, as the header states? Not verifiable from these ranges.

Security and integrity claims in these files remain unreviewed until independent review of the access and hook implementations.
