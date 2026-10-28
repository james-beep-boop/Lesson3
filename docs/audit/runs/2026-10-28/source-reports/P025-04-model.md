# P025-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- **Read:** `app/src/hooks/fieldSplit.ts:1-387` (full range, as supplied in the request). I did not re-fetch it at baseline `6e75a173`, and I ran no tools or tests.
- **Not assessed:** imports (`../access`, `../ingest/resourceLinks`, `../lib/canonicalJson`, `../lib/stripIds`, `../lib/proseFields`), callers (`enforceVersionFieldSplit`, `endpoints/versionEdit.ts`), Payload update semantics, existing tests.

## Purpose and invariants (as stated in the file)

- A teacher with editing access may not change lesson, framework, section, rubric or summary-row cardinality or order. Their write is the original plus a prose overlay.
- Subject Admins are restricted only on META identity fields. Site Admins are unrestricted.
- `resourceLinks` is system-owned for authenticated users.
- Malformed submitted containers are refused, not read as empty. Payload's `0` sentinel and nullish arrays are the only carve-outs.

## Candidates

**1. Omitted top-level keys are not restored for teachers. Medium. Confirmed locally; impact depends on Payload (unchecked).**
`fieldSplit.ts:308-311` iterates `Object.keys(d)`, so a non-editor key absent from the submission is never copied from `orig`. This contradicts the comment at 305-307 ("Restore EVERY top-level key from the original"). `lessons` (313) is also skipped when absent, which the comment at 349-350 justifies only via a later generatability gate.
- Precondition: teacher with editing access; update body omits `meta`.
- Expected: `meta` unchanged. Actual: `meta` is absent from the merged document. Whether it is lost depends on Payload's update semantics.
- Repro: teacher update omitting `meta`, then omitting `lessons`; assert the stored row is unchanged.

**2. Teacher overlay may cover `summaryTable.lessons[].title`. Medium. Lead, conditional on `proseFields`.**
`fieldSplit.ts:384` uses `SUMMARY_LESSON_PROSE` as the teacher overlay. The policy excerpt says `SUMMARY_TABLE.lessons[].title` is Subject-Admin-only and was once listed in that constant. If the constant still contains `title`, a teacher can alter it.
- Precondition: teacher with editing access submits a changed `summaryTable.lessons[0].title`.
- Expected (per policy): preserved. Actual: overlaid, if the constant includes `title`.
- Repro: teacher save with a changed summary title; assert it is preserved.

**3. Non-object array elements throw `TypeError` rather than `Forbidden`. Low. Confirmed locally.**
`submittedRows` (80-84) returns submitted arrays without checking their elements. `idsOf` (46) reads `r.id`, which throws on `null`. The same happens at `prevById.get(lesson.id)` (266-267) and `overlayRows` (134).
- Precondition: teacher submits `finalExplanation.sections: [null]`.
- Expected: refusal, as the file requires for `2` or `'bad'` (lines 69-75). Actual: `TypeError` from `idsOf` via `guardRows` (284). I observed no write, so this fails closed, but it surfaces as a bare 500, the failure mode the file says it fixed for `0` (65-67).
- Repro: teacher PATCH with `[null]` in each array container; expect 403, not 500.

**4. Null group containers: the file contradicts itself. Low. Documentation/behaviour mismatch.**
Lines 336-338 say a null `finalExplanation` or `summaryTable` "means unchanged". But `submittedGroup` (102-103, used at 291 and 298) rejects null with `Forbidden`, and lines 95-96 say null is deliberately refused. The code refuses. The policy excerpt does not state the intended behaviour.
- Repro: teacher submits `summaryTable: null`; record whether the result is 403 or unchanged. Owner decision needed.

## Unresolved questions

- Does Payload's `update` keep absent top-level fields? This sets the severity of candidate 1.
- What do the prose constants in `lib/proseFields.ts` contain? This is needed to confirm candidate 2. `overlayProse` (121) also copies any value shape, so teacher-writable prose shape is unchecked.
- Does `isObject` accept arrays? If so, `asSubmittedGroup` admits an array as a group.
- Does the save-as-new `overrideAccess` path set `req.user`? If not, `preserveLessonResourceLinks` (225) is skipped on that path.
- Does the schema contain nested arrays beyond those normalised at 167-177 that could receive the `0` sentinel?

Security and integrity claims in this file remain unreviewed until independent review.
