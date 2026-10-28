# P157-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope and coverage

**Read in full (supplied ranges only):**
- `app/tests/int/taxonomyDelete.int.spec.ts:1-361`
- `app/tests/int/uploadTaxonomy.int.spec.ts:1-201`

**Not assessed:** the product code these tests exercise (`SubjectGrade`/`Subject` hooks and access, `ingestUploadItems`, `assignmentCountsBySubjectGrade`, `deleteConsequences`, `helpers/fixtures.js`). I did not run the tests, so nothing here confirms they pass or that the implementation matches them. I did not check callers or runtime behaviour.

## Purpose and invariants

- **taxonomyDelete:** SubjectGrade delete is blocked while lesson plans reference it (`:40-49`). Subject delete is blocked while SubjectGrades exist (`:51-55`). Deleting a SubjectGrade cascades its dangling assignments (`:57-81`). Role counts map to the correct fields (`:94-124`). A duplicate (subject, grade) returns a readable 400 on create and update, with no partial write, and a subject-only move re-derives `displayName` (`:172-300`). Concurrent moves onto one unique pair yield exactly one winner (`:302-360`).
- **uploadTaxonomy:** approved taxonomy is created in the same transaction as the plan writes, so a failed plan write leaves no orphan Subject or SubjectGrade (`:71-103`). Two uploads approving the same new subject create it once (`:105-125`). Approvals the files do not need are refused (`:127-149`). A concurrent creation between lookup and pre-flight does not falsely reject the file (`:157-200`).

## Candidates

**Confirmed defects:** none. The supplied tests and the policy excerpts do not establish a product mismatch on their own.

**Uncertain lead U1 (medium, unverified):** SubjectGrade `subject` can be changed by update. Tests assert this succeeds (`taxonomyDelete:289-296`, and the race at `:331-333`), but only on SubjectGrades with no lesson plans. The policy excerpt says plan categorisation is fixed at ingest through `LessonPlans.subjectGrade`. Moving a SubjectGrade that already has plans would change those plans' effective subject without touching their relationship. I cannot tell from the excerpts whether that is intended, because the policy does not state whether SubjectGrade's subject may change once plans reference it.
- *Reproduction to write (no edit made):* in `taxonomyDelete`, create a SubjectGrade with a plan using the fixture helpers, update its `subject` to another Subject with `overrideAccess: true`, then record the outcome. Do not assert an expected result until policy says what it should be.

**Lead U2 (low, unverified):** `displayName` is derived from the Subject name at SubjectGrade write time (`:203-216`, `:296`). No supplied test renames a Subject and checks whether SubjectGrade `displayName` follows. Whether a Subject rename refreshes it depends on hooks I have not read.

**Coverage gaps, not defects:**
- No supplied test covers the near-miss rules: case or whitespace collisions rejected, or "similar name" prompts. The policy requires these. Absent tests alone are not defects.
- No supplied test covers trimming of `META.subject` on creation.
- The losing side of the concurrent-move race (`:338-339`) asserts only the rejection count, not that the rejection is the readable 400 rather than a raw unique-index error.
- No supplied test covers the "new SubjectGrade has no Subject Administrator" rule.

## Unresolved questions

1. Should a SubjectGrade that has lesson plans be movable to another Subject? (Basis for U1.)
2. Does a Subject rename refresh SubjectGrade `displayName`, and is that refresh tested anywhere? (Basis for U2.)
3. Are the near-miss and trimming rules covered in a file outside this range?

Security and integrity claims remain unreviewed until independent review.
