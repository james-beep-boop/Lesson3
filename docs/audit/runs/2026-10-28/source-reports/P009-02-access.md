# P009-02-access

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- **Read:** `app/src/access/versioning.ts:1-114` (complete range).
- **Not read:** `./index` (`isSiteAdmin`, `isSubjectAdminFor`, `subjectGradeIdsByRole`, `toId`), `access/versionImmutability.ts`, `hooks/lessonPlan.ts`, `hooks/fieldSplit.ts`, and the Manage `AdminDashboard` query. The policy excerpt is also cut off mid-§8, so the role table is only partly visible.
- **Scope note:** I did not run tools. Every claim below is local reasoning about these 114 lines. Nothing here says how the helpers, hooks, or callers behave at runtime.

## Purpose and invariants (as implemented)

- Plans are created only by system paths (`lessonPlanCreate`, L31, always false). Versions are created only by system paths (`lessonBundleVersionCreate`, L59, always false).
- Plan update: Site Admin, or a Subject Admin restricted by a `subjectGrade in [...]` where clause on the existing document (L33–38).
- Official pointer: field access by Site Admin or the Subject Admin for the subject-grade (L42–46).
- Version deletion: one Where-form policy (L76–89) and one per-document form (L100–114), which the comments say must not drift from each other.
- Immutable versions and non-deletable Official are enforced elsewhere (L61–65, L70–71).

## Candidates

No confirmed defect in the supplied range. Leads, all uncertain:

**1. Uncertain lead: plan `subjectGrade` immutability is not enforced in this range.** *Severity: high if the hook is absent; unverified.*
- Evidence: `lessonPlanUpdate` (L33–38) constrains only the stored document via `where`. It does not constrain the submitted `subjectGrade`. A Subject Admin for SG1 whose request sets `subjectGrade` to SG2 passes this gate. The policy requires that identity be fixed after ingest, including for Site Admin, so the gate must be backed by a hook in `hooks/lessonPlan.ts` (not read).
- Precondition: no unseen hook rejects a changed `subjectGrade` on update.
- Expected: request rejected; row unchanged.
- Actual: not determinable from this file.
- Reproduction test: as a Subject Admin of SG1, `PATCH /api/lesson-plans/:id` with `{ subjectGrade: <SG2 id> }` on an SG1 plan. Assert a 4xx response and an unchanged row. Repeat as Site Admin.

**2. Uncertain lead: `canSetOfficialVersion` checks the submitted value, not the stored one.** *Severity: low–medium; depends on lead 1.*
- Evidence: `subjectGradeIdFor` (L10–14) prefers `data.subjectGrade` over `doc.subjectGrade`. The authorisation check at L45 therefore uses whatever the request says the plan's SG is. Combined with lead 1, the Official check and the update `where` can evaluate different subject-grades within one request.
- Expected: the check should use the SG the write would leave the plan in, and that SG should equal the stored one.
- Actual: the check follows the submitted value.
- Reproduction test: a Subject Admin of SG1 and SG2 sends `PATCH` with `{ officialVersion: <id>, subjectGrade: <SG2> }` on an SG1 plan. Assert the write is rejected. Expect it to pass only if lead 1 is unguarded.

**3. Uncertain lead: Manage deletion list may offer the Official version.** *Severity: low (user-visible mismatch).*
- Evidence: `deletableVersionsWhere` (L76–86) does not exclude the Official version. L67–71 say `enforceOfficialNotDeletable` blocks it, and L70–72 and L75 say the Manage list must not drift from server policy. The Manage query lives in `AdminDashboard`, which was not read.
- Expected: the Manage list excludes Official, or the drift invariant is documented as intentionally broken.
- Actual: unknown.
- Reproduction test: as Site Admin, fetch the deletable-candidates query for a plan with an Official version. Assert Official is absent from the result.

**4. Not a defect, parity unverified: Site Admin in per-document form.** `canDeleteVersionDoc` (L100–114) returns true for Site Admin only if `isSubjectAdminFor` returns true for Site Admin with any subject-grade, including `undefined`. That behaviour lives in `./index`. The Where form (L77) returns true for Site Admin unconditionally.

## Unresolved questions

- Does a hook reject `subjectGrade` changes on plan update? (Decides lead 1.)
- Do `isSiteAdmin` and `isSubjectAdminFor` return true for Site Admin with `undefined` subject-grade, and do they treat a null `user` safely?
- Does `AdminDashboard` reuse `deletableVersionsWhere` and does it exclude Official?
- Does `toId` handle a populated `author` object, since `canDeleteVersionDoc` (L112) casts it as a subject-grade?
