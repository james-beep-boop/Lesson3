# P019-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- **Assessed (supplied text, not runtime):** `app/src/collections/LessonBundleVersions.ts:1-313` and `app/src/collections/LessonPlans.ts:1-160`. Both were read in full from the supplied ranges. I did not open any imported module.
- **Not assessed:** `access/*`, `hooks/bundleVersion`, `hooks/lessonPlan`, `fields/identity`, `fields/officialChange`, `fields/lessonContent`, `hooks/mutationAuthority`, `endpoints/*`, and all callers. Nothing here verifies their behavior.
- **Token limit:** not reached.

## Purpose and invariants (as stated in the supplied code)

- **LessonBundleVersions:** versions are immutable (`enforceVersionImmutable`). `lessonPlan`, `subjectGrade`, `sourceVersion`, `author`, `semver`, and lineage fields are system-only. `semver` is unique per plan via the index at line 59. The Official version cannot be deleted (`enforceOfficialNotDeletable`).
- **LessonPlans:** `subjectGrade` is intended to be immutable, enforced by `enforcePlanSubjectGradeImmutable`. `officialVersion` is gated by `canSetOfficialVersion`. `visibility` and `publicSlug` are gated by `siteAdminField` on update.

## Candidates

No confirmed defect follows from the supplied local reasoning alone. All three candidates below depend on unseen code.

**C1. Plan delete may collide with the Official-version delete guard.** *Uncertain lead. Severity: Medium if confirmed.*
- Evidence: `LessonPlans.ts:57-60` says a plan delete first removes its child versions via `cascadeDeleteLessonPlanVersions`. `LessonBundleVersions.ts:104-112` runs `enforceOfficialNotDeletable` per row, and the comment at 105-107 says the cascade path runs through that per-row hook.
- Precondition: a plan whose `officialVersion` points at one of its versions.
- Expected: the plan and all its versions are deleted (the comment at 57-60 describes this as the intended path).
- Actual: unknown. If the plan row still points at the Official version when that version's `beforeDelete` runs, the guard may throw and block the plan delete. Alternatively, the plan hook may clear the pointer first.
- Repro: as Site Admin, create a plan with a 1.0.0 Official and a second version, then delete the plan via Local API. Expect success with zero remaining versions.

**C2. Publication and pointer fields gate update only.** *Uncertain lead. Severity: Low to Medium, depending on `lessonPlanCreate`.*
- Evidence: `LessonPlans.ts:103-105` (`officialVersion`), `:132-145` (`visibility`), and `:148-157` (`publicSlug`) define `update` access but no `create` access. Collection create is `lessonPlanCreate` (`:43`), which is not in the supplied range.
- Precondition: a caller holding collection create but not Site Admin.
- Expected: the comment at `:113-115` states publication is a Site-Admin decision. This is the file's stated intent, not the supplied policy excerpts.
- Actual: field-level create access is not restricted. Whether a non-Site-Admin can create `visibility: 'listed'` depends entirely on `lessonPlanCreate`.
- Repro: as a Subject Administrator, `POST /api/lesson-plans` with `visibility: 'listed'`. Expect the field to be stripped or the request refused.

**C3. `publicSlug` freeze is not enforced in the supplied range.** *Uncertain lead. Severity: Low.*
- Evidence: `LessonPlans.ts:148-157` says the slug is "FROZEN once the plan has been published". Field access only restricts who can update it to Site Admins.
- Precondition: a plan with `visibility` set to `unlisted` or `listed`.
- Expected: a Site Admin update to `publicSlug` is refused.
- Actual: unknown. The freeze would have to live in `validatePublication` (`LessonPlans.ts:52`), which is not supplied.
- Repro: publish a plan, then update `publicSlug` as Site Admin. Expect rejection.

## Unresolved questions

1. Does `enforceOfficialNotDeletable` run during the plan cascade, and does `cascadeDeleteLessonPlanVersions` clear `officialVersion` first? (C1)
2. What does `lessonPlanCreate` allow, and is it Site-Admin-only? (C2)
3. Does `enforcePlanSubjectGradeImmutable` compare against the stored value, run when the key is absent, and apply under `overrideAccess` on Local API update? The comment at `LessonPlans.ts:86-93` says so, but the hook is not supplied.
4. Do `aresReleaseId`, `aresReleaseDate`, `releaseFingerprint`, and `officialChangeFields` have the system-only and immutable access the policy requires? Their definitions are in `fields/identity` and `fields/officialChange`, which were not supplied.
5. Do `validatePublication`, `validateOfficialVersionPointer`, and `canSetOfficialVersion` enforce the "one Official per plan" and "Official belongs to this plan" invariants? Both are referenced here and not supplied.

Security and integrity claims in this report remain unreviewed until independent review.
