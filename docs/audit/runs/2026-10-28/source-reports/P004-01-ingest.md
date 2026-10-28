# P004-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Scope

- **Read (supplied in the prompt, no tool calls):** `app/src/ingest/index.ts:401-800`. Line 401 is mid-function, so the start of `releasePreview` is not assessed.
- **Not assessed:** `writePrepared` body (800+); `existing` construction and `releasePreview` header (<401); `decideRelease`, `resolveTaxonomy`, `classifyMissingTaxonomy`, `findExistingPlan`, `confirmationRequired`, `officialDecision`, `nextSemverFrom`, `taxonomyKey`; the upload endpoint and its authorization. No unseen caller or runtime behaviour was checked.

## Purpose and invariants (as read)

Shared upload orchestration: read-only pre-flight (`prepareItems`), release preview with set-level refusal (`releasePreview`), an Official-confirmation round, then a single write. Intended invariants, several stated in comments:
- Web uploads write nothing while taxonomy or Official confirmation is pending.
- Approvals may only create taxonomy the files need.
- A refused set contributes nothing and "never prevents unrelated sets' valid files" (line 749).
- Ambiguous duplicates are rejected, not resolved arbitrarily.

## Candidates

**C1 — Medium (confirmed from local ordering).** `app/src/ingest/index.ts:688-711` runs before `releasePreview` at `:750` and the refusal filter at `:754`.
- **Precondition:** Two ZIP sets. Set A's manifest release id conflicts with stored content for plan P (`:432-442`). Set B has a file for the same subject-grade and `substrandId`.
- **Expected:** A is refused alone; B imports, as line 749 states.
- **Actual:** In partial mode, both files are rejected as "duplicate of … in this batch" before the refusal is known. B is never considered by `releasePreview`.
- **Reproduction test:** Two sets as above, one with a conflicting manifest release. Assert B is created and A appears in `setRefused`. Expect failure with B in `rejected`.

**C2 — Low–Medium (confirmed from the catch branch; whether `writePrepared` can throw this for an unpreviewed set is unseen).** `:784-785`.
- **Precondition:** A set conflict surfaces only under the write lock (`writePrepared` throws `LessonSetRefused`), and at least one other set in the request is valid.
- **Expected:** Other valid sets are imported or reported.
- **Actual:** The catch returns `{...base, setRefused}` with `bundles`, `created` and `skipped` empty. The other valid files appear in neither `bundles` nor `rejected`.
- **Reproduction test:** Stub `writePrepared` to throw `LessonSetRefused` for set A while set B is prepared. Assert B's outcome is reported. Expect silent omission.

**C3 — Low, uncertain.** `:622-624` and `:671-680`.
- **Precondition:** The subject exists at resolution (`:575`), the grade is created concurrently before reconciliation, and the file is pended as "new grade".
- **Expected:** The reconcile comment (`:619-621`) implies a re-lookup, so the file should resolve to the existing grade.
- **Actual:** `p.subjectExists` short-circuits at `:624`, so the file is offered for creation. If approved, `:680` pushes `subjectGrade: null`. Whether this yields a duplicate SubjectGrade or a rollback depends on `writePrepared` and any unique index, neither of which I saw.
- **Reproduction test:** Create the grade between resolution and reconciliation, approve it, and assert no second SubjectGrade is created.

**C4 — Latent lead, low.** `:426`, `:434`, `:474`, `:753-754`.
- Refusals are keyed by `setId`, which may be `undefined`. If a conflict can occur for a file without a `setId`, `refused.has(undefined)` drops every `setId`-less file in the batch, and the refusal is labelled "Lesson set". I could not confirm whether such a conflict is reachable.

## Unresolved questions

1. How `existing` is defined. If it does not filter on `existingPlanId != null`, null-plan entries (`:680`) reach `historyOf.get(null)`.
2. Whether `olderNotImported` (`:466`) can yield a null `aresReleaseDate` in `decision.version!`.
3. Whether `writePrepared` re-checks grade existence before creating taxonomy (C3), and whether it can throw `LessonSetRefused` for an unpreviewed set (C2).
4. Whether `resolveTaxonomyCached` (`:529-531`) keys on grade type. A numeric and a string grade share a cache entry.

Security and integrity claims in this range remain unreviewed until independent review.
