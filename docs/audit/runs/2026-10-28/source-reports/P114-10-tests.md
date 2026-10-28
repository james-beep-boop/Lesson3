# P114-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read as supplied in the message (no tool calls, nothing executed):
- `app/tests/e2e/publicLibraryDisabled.e2e.spec.ts:1-89` (fully read)
- `app/tests/e2e/saveSnapshot.e2e.spec.ts:1-240` (fully read)
- `app/tests/e2e/schoolName.e2e.spec.ts:1-118` (fully read)
- `app/tests/e2e/uploadBundles.e2e.spec.ts:1-199` (fully read)

Not assessed: the helpers these specs import (`helpers/e2e`, `helpers/fixtures`, `helpers/editRecovery`, `helpers/editRecoveryUi`), `src/lib/setSchoolName`, `src/lib/publicLibrary`, the upload/save-as-new endpoints, and `hooks/fieldSplit.ts`. I did not check any runtime behaviour, callers, or the implementation these specs exercise. The e2e results are not evidence either way.

## Purpose and invariants (as encoded by the tests)

- **publicLibraryDisabled:** with public discovery off, `/explore` returns a real 404 and `/login` has no Explore link. The spec also seeds a user, since an empty database renders the bootstrap form.
- **saveSnapshot:** while a save is in flight the editor is locked and typed text is not lost. A failed save keeps the text and the source version. A successful save creates a new version, and `deleteSource=true` removes the source only for the Subject Administrator path. An ordinary save after the source is deleted returns 404 `unavailable: 'source'` and does not recreate the recovery draft.
- **schoolName:** an empty name leaves the UI unchanged. A set name appears in the five locations without changing the top bar, at 1280px and 375px. Save requires password confirmation, and Cancel leaves the value unchanged.
- **uploadBundles:** valid files import even when others are rejected. Unchanged uploads, release Official confirmation (409 round), and missing-taxonomy confirmation in one round are all exercised.

## Candidates

**1. Low severity, uncertain lead: "skipped" count includes unchanged JSON files.**
- Evidence: `app/tests/e2e/uploadBundles.e2e.spec.ts:87` expects `Imported 2 file(s); rejected 0; skipped 3.` after two files changed and two were unchanged, plus one `.txt`. Line 96 expects `Imported 0 file(s); rejected 0; skipped 5.` for an upload with four unchanged JSON files and one `.txt`.
- Policy says "skipped" means non-JSON archive entries, and that unchanged matches are a separate category ("already here") that yields 200.
- Expected (per policy): unchanged JSON files reported as unchanged, and "skipped" counting only non-JSON entries (here, 1 and 1).
- Actual (per test assertion): unchanged JSON files are counted under "skipped."
- Reproduction: upload a ZIP of N valid JSON files, upload it again, and check the status line. It should report N unchanged, not N skipped.
- Caveat: the test encodes the current wording, so this may be an intended label. The policy text is the only basis for calling it a mismatch. It is not confirmed as a defect.

No other confirmed product defects in the supplied ranges. Each assertion I checked is consistent with the policy excerpts, or is a test-level gap rather than a product mismatch.

## Unresolved questions

- `schoolName.e2e.spec.ts:49` fills the name with surrounding spaces, but the spec checks only the displayed text, not the stored value. Trimming is not stated in the policy excerpts, so I cannot say whether stored whitespace is wrong.
- `saveSnapshot.e2e.spec.ts:146` asserts `deleteSource=true` for every Subject Administrator save, and line 61 asserts it is absent after a failed draft lookup. The consent step is auto-accepted in the spec. Whether consent is always required is not visible in the excerpts.
- `uploadBundles` does not check the 422 versus 200 status for all-rejected versus unchanged uploads, the "Not Official" or "waiting for administrator" confirmation groups, or declining new taxonomy without invalidating Official decisions. These are policy requirements with no assertion here. An absent test is not a defect.
- `publicLibraryDisabled.e2e.spec.ts:74` asserts the heading is absent on a 404 page. That is a weak negative check, not a defect.
