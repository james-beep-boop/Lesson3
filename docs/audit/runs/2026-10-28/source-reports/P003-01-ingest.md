# P003-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

**Coverage:** Assessed `app/src/ingest/index.ts:1-400` as supplied. `releasePreview` (385-400) is cut off mid-call, so its remainder is **not assessed**. Nothing beyond line 400 was read, and no callers, `toBundle.ts`, `taxonomy.ts`, `extract.ts`, or the transaction and lock helpers were checked.

**Purpose and invariants (as read):**
- Orchestrates ingest: file gathering, extraction via a thunk, taxonomy resolution by exact `(subject, grade)`, duplicate-plan lookup by `(subjectGrade, substrand_id)`, and approved taxonomy creation under an advisory lock.
- Invariant: nothing is created silently. Taxonomy is created only for approved keys, and near-miss names are caught by normalised comparison.
- Invariant: a sub-strand with more than one matching plan is refused rather than guessed.

**Candidates**

1. **Low, confirmed local reasoning: uppercase data files are silently dropped from directory input.** `app/src/ingest/index.ts:303, 312-313`. Precondition: a directory contains `a.JSON`. Actual: `gatherDataFiles` omits it with no entry in `rejected` or `skipped`. The same file passed explicitly is rejected at 315-318 ("Not a .js/.json file"). Expected: the two paths should behave consistently, and any omission should be reported. The policy does not say whether extensions are case-sensitive, so this is a mismatch in behaviour, not a proven policy breach. Test: `gatherDataFiles([dir])` with `a.JSON` and `b.json` should either return both or report `a.JSON`; the current result is `[b.json]` with no report.

2. **Low, confirmed local reasoning: the "Existing subjects" list is silently truncated.** `app/src/ingest/index.ts:210-212`. Precondition: more than 200 subjects exist and an unknown subject is named. Actual: the message lists the first 200 with no truncation note. Expected: the complete list, or an indication that it is partial. Test: seed 201 subjects, call `missingTaxonomyMessage` with an unknown name, and assert that all names or a truncation marker appear. This is unlikely in a school deployment, so severity is low.

3. **Uncertain: a race in taxonomy creation fails the whole upload.** `app/src/ingest/index.ts:264-268`. Precondition: a case- or spacing-variant subject is committed after pre-flight but before the write. Actual: `IngestError` is thrown inside the write transaction, and the message says "Nothing was imported" for the entire request. The policy covers pre-flight near-misses (per-file rejection, "the rest import") but says nothing about this in-transaction race. The expected behaviour is therefore not established. This needs an owner decision, not a fix.

4. **Uncertain lead: possible mismatch between trimmed identity and stored `substrand_id`.** `app/src/ingest/index.ts:112` trims the identity, while the equality query at 136 uses that trimmed value. If `toBundle.ts` stores `META.substrand_id` untrimmed (for example `" 1.2"`), a re-upload would miss the match and create a duplicate plan. This depends on `toBundle.ts`, which was not read. Test: ingest a file with `substrand_id: " A "`, re-upload it, and assert the same plan is versioned rather than a new one created.

5. **Uncertain: a per-file error may abort the whole request.** `app/src/ingest/index.ts:151-155`. `findExistingPlan` throws `IngestError` for an ambiguous sub-strand. The policy says invalid files are "rejected individually", but whether the caller catches this per file is unseen. If it does not, one ambiguous file fails the entire web upload. This is an open question for the caller.

**No high-severity candidates were confirmed in the range read.** Security and integrity properties (the `overrideAccess` writes, the advisory-lock semantics, and the lock helpers) remain unreviewed until independent review.

**Unresolved questions**
- Does the caller catch `IngestError` per file (candidate 5)?
- Does `toBundle.ts` trim `substrand_id` before storage (candidate 4)?
- Should an in-transaction near-miss race reject only the affected files, as pre-flight does (candidate 3)?
- Are file extensions case-sensitive by policy (candidate 1)?
- What do `releasePreview` (after line 400) and the write path do with the `IngestError` thrown from `createApprovedTaxonomy`?
