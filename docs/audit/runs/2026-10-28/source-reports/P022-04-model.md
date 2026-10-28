# P022-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

Read from the supplied text only. No tools were run, and nothing was executed.

- `app/src/fields/lessonContent.ts:1-400` and `:401-495` (full file)
- `app/src/fields/officialChange.ts:1-28` (full file)
- `app/src/fields/phases.ts:1-25` (full file)

Not assessed: `access/*`, `hooks/fieldSplit.ts`, `bundleFields`, `ingest/resourceLinks`, `validateGeneratable`, `lib/relId`, `lib/frameworkProse`, the generation adapter, callers, and runtime Payload behaviour. Nothing here is a claim about unseen callers or runtime.

## Purpose and invariants (as stated in the source)

- `lessonContent.ts` defines the bundle's content fields and their admin/teacher split. Teacher prose is listed in the comments; everything else is admin-only by default. Write-time enforcement is delegated to `fieldSplit`.
- `officialChange.ts` stamps `officialChangedAt/From/By` when the official pointer changes, and ignores submitted audit values.
- `phases.ts` is the five-value phase vocabulary feeding the dropdown and the completeness gate.

Local check against the policy excerpt: teacher-editable prose (`title` at :294, `slo.*`, `overview`, framework prose, `teacherReflection`, `summaryTablePrompt.*`, `finalExplanation.instructions` :398, `sections[].prompt` :406, summary `observed/learned/explained` :471–473) and admin-only items (`duration`, `exemplar` :408, `rubric` :411–424, summary `title` :470, `drivingQuestion` :455, `framework.phase` :360) match the stated policy. `outputDir`, `substrand`, and `aresKeywords` are hidden and read-only (:228, :302–303). `resourceLinks` and `number` are system-only.

## Candidates

No confirmed defects from local reasoning in the supplied ranges. The following are leads, each dependent on unseen code.

**C1. Medium (unverified). Field-level access inside open arrays contradicts the recorded resolution.**
- Evidence: `lessonContent.ts:158-168` says Payload field access nulls optional admin-only subfields in open arrays, and that access was removed from those fields in favour of the hook. Yet `lessons[].number` (:290, `systemOnly` update), `lessons[].resourceLinks` (:326, required, `systemOnly`), `summaryTable.lessons[].number` (:466), and `framework[].phase` (:360, required, `canEditStructure`) still carry array-subfield access.
- Expected: no array-subfield field access, per the stated decision.
- Actual: present. Outcome depends on `fieldSplit` restoring these before validation.
- Possible effect: a teacher save fails required validation on `phase` or `resourceLinks`, or the values are nulled.
- Repro test: teacher save submitting a full array copied from source; assert save succeeds and `framework[].phase` and `resourceLinks` equal source.

**C2. Low-Medium (unverified). "Explicit null" for `video`/`reading`.**
- Evidence: `lessonContent.ts:50-51` says the optional columns let the group "represent ARES's explicit null".
- Concern: a Payload group is normally read back as an object, possibly `{title: null, …}` rather than `null`.
- Repro test: store a lesson with no video, round-trip it, and assert the generator receives `video: null`.

**C3. Low (unverified). Comment versus import.**
- Evidence: `lessonContent.ts:119-121` says `@/access` is type-only at runtime. Line :4 imports runtime values (`isSubjectAdminFor`, `siteAdminField`, `toId`) from `'../access'`, not `import type`. `structureCondition` (:123) is a client-bundled condition.
- Concern: if `../access` pulls server modules, the client bundle could break or leak.
- Repro test: import `lessonContent.ts` in a client-environment build and check for server-only dependencies.

**C4. Low (unverified). Structure-panel visibility.**
- Evidence: `structureCondition` (:123-131) uses `isSubjectAdminFor` only. The comment at :117-118 says Site Admins also see these panels. It also reads `data.subjectGrade`, which must be present on the version doc.
- Concern: Site Admins may not see META/UNIT, or Subject Admins may not see them if `subjectGrade` is absent.
- Repro test: render the admin form as a Site Admin and as a Subject Admin for a document with `subjectGrade` set; assert the panels are visible.

**C5. Note (non-behavioural).** `lessonContent.ts:453-454` refers to `meta.drivingQuestion`, but the field is `unit.drivingQuestion` (:264). Stale pointer only.

## Unresolved questions

1. `officialChange.ts:12-13`: does `relId` normalise types? If one side returns a string and the other a number, `from === to` fails and a spurious stamp is written.
2. Does `fieldSplit` restore `number`, `resourceLinks`, and `phase` before validation (C1)?
3. Does Payload return an empty group as `null` or as an object (C2)?
4. Does `isSubjectAdminFor` return true for Site Admins, and is `subjectGrade` on the version schema (C4)?
5. Do `subject`/`grade`/`substrand_id` (:200–223) render read-only for Subject Admins, as the policy requires? Payload derives read-only from field access; this is assumed, not checked.
