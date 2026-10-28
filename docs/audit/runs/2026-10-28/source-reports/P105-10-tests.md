# P105-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

**Read in full (as supplied in this message; no tool calls, not run):**
- `app/tests/e2e/draftCombineShortcut.e2e.spec.ts:1-236`
- `app/tests/e2e/drafts.e2e.spec.ts:1-220`
- `app/tests/e2e/editRecovery.e2e.spec.ts:1-156`

**Not assessed:** the helpers these files import (`helpers/fixtures`, `helpers/e2e`, `helpers/editRecoveryUi`, `helpers/editRecovery`, `helpers/manageUi`), the kernel, all product code, and the baseline commit `6e75a173`. I did not check out or verify the baseline. The policy excerpts were used only as context, and they end mid-§8.

**Purpose and invariants:** Browser journeys for edit-recovery drafts. The specs check that drafts are listed and discardable, that deleting a version warns about drafts, that the Combine shortcut appears only for trusted ids and editing-access callers, that a target deleted after Save does not destroy saved text, and that a 429 shows "not saved", a 409 on the pre-save flush blocks the save, and a transport failure on capture does not block the save.

## Candidates

**1. Vacuous negative assertion in case 27 — Medium (test integrity), confirmed local reasoning**
`editRecovery.e2e.spec.ts:151` uses `not.toHaveURL(/lesson-bundle-versions/${versionId}$)`. The `$` anchor fails to match if the editor URL carries a query string. `drafts.e2e.spec.ts:118` says the editor is unlocked with `?edit=1`, so an unsaved editor at `…/${versionId}?edit=1` does not match, and the assertion passes without any save. Line 154 (`/Viewing:|Editing:/`) may also match the unsaved editor.
- Expected: the test fails if save-as-new does not succeed.
- Actual (by reading; not run): it can pass when the save never happens.
- Reproduction: keep the capture abort, stub `**/save-as-new` to return 500, then assert the response status is 200, the returned id differs from `versionId`, and the Payload count for the plan increases by one.
- `draftCombineShortcut.e2e.spec.ts:156` uses `(?:\\?|$)` for the same check, so the two files are inconsistent.

**2. Negative checks without a positive control — Low–Medium (test integrity)**
`draftCombineShortcut.e2e.spec.ts:224-235` asserts `Combine with` count 0 for `bad`, own-source, foreign, and teacher cases. None of these first confirms that the editor rendered. A login redirect or blank page would satisfy `toHaveCount(0)`.
- Expected: each negative case first asserts a control element, such as `Save as new version` or the restore prompt, is visible in the same state.
- Reproduction: run the loop against a page with the editor unavailable and confirm the test still passes; then add the control and confirm it fails.

**3. Fixture realism for "ARES release" — Lead, unresolved**
`draftCombineShortcut.e2e.spec.ts:24-45, 71-80`: the `release` flag marks the target as an ARES release only by omitting `author` and changing `resourceLinks`. It sets no `releaseFingerprint`, `aresReleaseId`, or `aresReleaseDate`. The policy defines ARES provenance through those system fields, so the fixture may exercise a different signal from the one the product uses. I cannot tell from the supplied material.

## Unresolved questions

- **Restore-prompt offer behaviour** (`draftCombineShortcut.e2e.spec.ts:71-80, 147-159`): the supplied policy does not describe this offer. The expected behaviour, including that a newer teacher sibling does not suppress it, is encoded only in the test, so I have not treated it as a defect.
- **`start` routing** (`editRecovery.e2e.spec.ts:65-66, 103, 143`): the route glob matches any POST to `…/recovery`. The comment says `start` is unaffected. If `start` uses the same path, the 429/409/abort injections would also hit session start. Confirm against the route definition.
- **`?edit=1` on every editor path**: finding 1 depends on the `openEditor` helper, which was not supplied.

## Not candidates

- `drafts.e2e.spec.ts:162-165`: a declined delete does not assert that the draft survives. This is a coverage gap, not a product mismatch.
- `drafts.e2e.spec.ts:161`: `'1 other person'` is a substring match and would also match `'11 other person'`. Cosmetic.

**Overall:** no confirmed product defect in the supplied ranges. Findings 1 and 2 are test-integrity defects that could let regressions pass. Both need a run to confirm.
