# P005-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

No tool calls were made, and no tests were run. All reproductions below are proposed, not executed.

Read in full (supplied ranges only):
- `app/src/ingest/index.ts:801-1053` (begins mid-function, so the enclosing signature and `releasePreview`, `createApprovedTaxonomy`, `findExistingPlan` are not visible)
- `app/src/ingest/lessonManifest.ts:1-124`
- `app/src/ingest/releaseAncestry.ts:1-73`
- `app/src/ingest/releaseDecision.ts:1-82`
- `app/src/ingest/releaseFingerprintContext.ts:1-39`
- `app/src/ingest/releaseMessages.ts:1-75`

Not assessed: `lib/combine/backfill`, `lib/semver`, `lib/canonicalJson`, `fields/identity`, hooks, and all callers.

## Purpose and invariants

These files gate ARES release imports. The manifest parser refuses unsupported sets and classifies entries. Release decisions use identity before age, and the preview token binds every decision. Ancestry selection and audit set `sourceVersion` links inside locked transactions. Messages go to subject-grade administrators after commit.

## Candidates

**1. Medium-low (confirmed locally against the policy's general sentence).** `releaseDecision.ts:26-30, 36-42`
With a manifest, `decideRelease` never computes `olderContent`. Only the no-manifest branch does. The policy says "Content equal to an older ARES release is flagged in the confirmation preview," and does not limit this to the no-manifest case.
- Precondition: plan history has v1 (fingerprint A, release `r1`, 2026-01-01) and v2 (fingerprint B, `r2`, 2026-02-01). Incoming: fingerprint A, release `r3`, 2026-03-01.
- Expected: `action: 'new'`, `olderContent` = v1.
- Actual: `{ action: 'new' }`, so no warning.
- Test: `decideRelease(history, 'A', {id:'r3', date:'2026-03-01'})` asserts `olderContent?.id === v1.id`.
- Caveat: if the flag is meant only for the no-manifest path, this is a policy question, not a defect.

**2. Lead, uncertain.** `index.ts:906-910` with `releaseDecision.ts:13`
A `'conflict'` decision is not refused in the loop. Line 907 skips it, and line 910 files it under `olderNotImported`. This is safe only if `releasePreview` always returns conflicts in `refused`, which is not visible here.
- Precondition: `releasePreview` returns a `conflict` decision with `refused` empty.
- Expected: the whole set is refused (policy: "same id with different content refuses the whole set").
- Actual per this code: the file is reported as "older not imported" and the set proceeds.
- Test: stub `releasePreview` to return that shape and assert `ingestItems` throws.

**3. Lead, depends on unseen code.** `releaseAncestry.ts:57-66`
`lineage` is recomputed only from `source` pointers as passed in. For a row skipped because it has a surviving closure (`source` null, `lineage: [9]`), the recomputed map gives it `[]`. If the caller writes that map, the recorded deleted-ancestor closure is erased. The policy requires "preserving recorded deleted ancestors."
- Test: rows `{id:1,source:null}`, `{id:2,semver:'2.0.0',source:null,lineage:[1]}`, `{id:3,semver:'3.0.0'}`. Assert the written closure for row 2 still contains `1`. Resolving this needs `lib/combine/backfill` and the migration caller.

**4. Low, question.** `index.ts:938-941` vs `947-960`
A plan's `title` changes only when Official moves. A kept teacher-Official revision stores the new title in the version but leaves the plan title stale. The policy does not state which title should display.

**5. Low, question.** `releaseMessages.ts:51-54`
If a grade has no `subjectAdmin`, the loop `continue`s with no log and no warning. The policy says each administrator "receives" a message, but does not cover the no-admin case. Confirm whether this should be reported.

**6. Low, unverified.** `index.ts:1005-1012`
The new-plan `payload.update` for `officialVersion` omits `overrideAccess: true`, unlike the revision branch at `942-943`. This may be harmless under the Local API default, but it is inconsistent with the explicit-override rule in the comment at `966-978`.

**7. Low, integrity.** `lessonManifest.ts:69-83`
Duplicate keys in `files` are resolved by `JSON.parse` as last-wins. A first checksum is silently dropped. Impact is limited because checksum mismatch only warns.

## Unresolved questions

- Is `auditReleaseAncestry` called with one plan's rows only? The `majors` map spans all rows passed in.
- Does `releaseFingerprintContext` leak the fingerprint into nested creates during `payload.create`? Only the outer create's cleanup is visible.
- Does `classifyLessonSetEntry` receive full paths or basenames? A nested `sub/LESSONS.json` is treated as a data file only if full paths are passed.
