# P002-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Scope and coverage

- **Assessed in full:** `app/src/ingest/extract.ts:1-274`, `app/src/ingest/importLessons.ts:1-127`. I did not run tools or tests; this is a read of the supplied text.
- **Not assessed:** `ingestUploadItems` (`./index`), `lessonManifest.ts`, `errors.ts`, `taxonomy.ts`, `app/scripts/ingest.ts`. Caller behavior that these files would determine is unverified.

## Purpose and invariants

- **extract.ts:** Converts an ARES `.js` module (acorn AST, literal-only evaluation) or `.json` export into the five-group raw bundle without execution. Rejects executable syntax, non-literal keys, and `__proto__`.
- **importLessons.ts:** CLI directory import. Walks entries, rejects symlinks, reads the manifest, classifies files, and runs a confirmation loop over `ingestUploadItems`, returning exit codes 0–4.

## Candidates

1. **Medium-High: silent taxonomy creation under `--yes`.** `importLessons.ts:99-102`.
   - Precondition: `io.yes` is true; a file's subject/grade is absent and has no near-miss match.
   - Expected (policy): CLI missing taxonomy is a hard, actionable failure; nothing is created silently.
   - Actual: `accept` is true, so the item enters `approvals` and is passed at line 75 for creation.
   - Repro: empty taxonomy, one valid fixture, `importLessons(payload, dir, {yes: true, …})`; assert no Subject/SubjectGrade row and nonzero exit.
   - Confidence: confirmed from local reasoning; the server-side creation is unseen.

2. **Medium: CLI partial import vs. the all-or-nothing rule.** `importLessons.ts:1, 56, 75-92`.
   - Precondition: a directory with one malformed JSON and one valid file.
   - Expected (policy): CLI is all-or-nothing.
   - Actual: the shared `ingestUploadItems` path writes the valid subset and returns 2 (line 92). The header comment says "partial."
   - Repro: two-file directory; assert zero rows written.

3. **Low: silent cancel discards other files.** `importLessons.ts:119-120`.
   - Precondition: `!io.yes`, missing taxonomy, user declines every item, no Official moves, other valid files present.
   - Actual: returns 4 with no output. Policy text for non-taxonomy files suggests they import.
   - Intent unresolved.

4. **Low (uncertain): unbounded loop.** `importLessons.ts:74-122`.
   - Precondition: `io.yes`; a missing item has non-empty `similarTo`, so line 100 declines it. Line 119 does not return, so the loop repeats with `approvals=[]`.
   - Termination depends on unseen `ingestUploadItems` returning `needsConfirmation: false` on resubmission.
   - Repro: fixture "Maths" against existing "Mathematics", `yes: true`, with an iteration cap or timeout.

5. **Low (uncertain): non-`IngestError` escape.** `extract.ts:233-242, 256-266`.
   - `assertNoProtoKeys` recurses without a depth bound. Deeply nested JSON may throw `RangeError`.
   - Caller per-file handling is unseen. In `importLessons`, any non-`LessonSetRefused` error becomes exit 1 for the whole run (line 125).
   - Repro: a 200k-deep nested array.

6. **Low: FIFO can block import.** `importLessons.ts:36-38, 57`.
   - The walk pushes any non-directory, non-symlink entry, including FIFOs and devices. `readFile` at line 57 can block indefinitely.
   - Repro: `mkfifo dir/x.json`, run under `timeout`.

## Unresolved questions

- `extract.ts:108`: The policy describes `+` as string concatenation. The code also folds numeric addition (`1+2` → 3) and mixed `'a'+1` → `'a1'`. Is numeric folding intended?
- `extract.ts:186-194`: Top-level statements such as `META.x = …` before `module.exports` are ignored, so the extracted value can differ from what Node would export. The code documents these as inert. Is that an accepted fidelity gap?
- `importLessons.ts:113-118`: `--yes` skips the Official-move confirmation. Is that intended?
- Is `importLessons.ts` the `app/scripts/ingest.ts` entry point, or a separate tool? This determines whether candidates 1–3 violate the stated CLI policy.
