# C30 — Version write-path analysis

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; 2026-10-24.
- **Mandatory checks:** enumerate every path that can create, modify or delete a
  `lesson-bundle-versions` row, or move a plan's Official pointer: REST (including bulk and native
  handlers), custom endpoints, Local API calls in endpoints/hooks/jobs, ingest, migrations and
  scripts. State the guard for each and flag any Local API write without one.
- **Method:** grep of `src/` and `scripts/` for every Local API/`db.*`/raw-SQL write and every raw SQL
  string naming `lesson_bundle_versions`/`lesson_plans`; each hit read in place with its hooks; Payload
  3.91.0 checked for native operations that skip collection hooks (versions/drafts, duplicate, trash).
- **Artifacts:** this report; [findings/C30-version-write-paths.md](findings/C30-version-write-paths.md).
- **Exclusions:** races and checksums are C31 (runtime). Hand-edited migration logic beyond
  identifying its version writes is C5.14.
- **Exit:** every write path in the table has a named guard, or is a finding.

## Outcome

**Complete for source. No defect candidates.** Every path has a guard; three leads are recorded for
C31/C5.6 to test rather than claimed as defects.

## Write-path table

"System" means the call carries no authenticated `req.user` (ingest, migrations, CLI scripts).

| # | Path | Operation | Guard(s) |
|---|---|---|---|
| 1 | `POST /api/lesson-bundle-versions` (REST create) | create | `lessonBundleVersionCreate = () => false` (`access/versioning.ts:116`) |
| 2 | `PATCH /api/lesson-bundle-versions/:id` and bulk `PATCH ?where=` | update | Access is a form-render grant only; `enforceVersionImmutable` (`access/versionImmutability.ts:53–57`) refuses every update with a `req.user`, per document, bulk included. Anonymous callers fail access first |
| 3 | Duplicate / Payload versions / drafts / trash | create/restore | `disableDuplicate: true`; no `versions`, `drafts` or `trash` on either collection |
| 4 | `DELETE /api/lesson-bundle-versions/:id` and bulk | delete | `lessonBundleVersionDelete` Where (`versioning.ts:133–146`); `refreshMutationAuthority` locks the plan and re-reads the caller before access (`hooks/mutationAuthority.ts`); `enforceOfficialNotDeletable` locks the plan row then refuses the Official (`hooks/bundleVersion.ts:88–141`) |
| 5 | `POST /:id/save-as-new` (`endpoints/versionEdit.ts:122–394`) | create (+ optional source delete) | Read access, then an editing-access check; field split against the source; plan row lock; caller re-read after lock and again before commit; system fields (`semver`, `author`, `sourceVersion`, `lessonPlan`, `subjectGrade`) set by the server, submitted ones dropped (`lib/versionContent.ts` `DROP_KEYS`); unique `(lessonPlan, semver)` index; source delete only with a recovery token, never the Official, re-checked with `canDeleteVersionDoc` |
| 6 | `POST /:id/make-official` (`versionEdit.ts:408–488`) | plan pointer + optional previous delete | Subject-Admin check; `expectedPreviousOfficialId` required for delete; pointer written with `overrideAccess: false` so field access and `validateOfficialVersionPointer` apply; caller re-read before commit |
| 7 | `PATCH /api/lesson-plans/:id` (`officialVersion`, title, visibility, slug) | plan update | `lessonPlanUpdate` (Site/Subject Admin in scope); `canSetOfficialVersion`; `refreshMutationAuthority`; `enforcePlanSubjectGradeImmutable`; `validateOfficialVersionPointer` (same plan, same grade, cannot clear) |
| 8 | `DELETE /api/lesson-plans/:id` → `cascadeDeleteLessonPlanVersions` (`hooks/lessonPlan.ts:386–398`) | delete all versions of a plan | `lessonPlanDelete` = Site Admin; Official guard stands down only for plans named in this request's `req.context` |
| 9 | Ingest, new plan (`ingest/index.ts:765–793`) | create plan + 1.0.0 + pointer | Upload endpoint is Site-Admin-only; contract gate + `validateGeneratable`; data is the fixed top-level shape from `rawToBundle`; system create with explicit `overrideAccess` |
| 10 | Ingest, re-ingest (`ingest/index.ts:670–744`) | create next major (not Official) | Same as 9, plus subject-grade advisory lock and plan row lock; semver from history; unique index backstop |
| 11 | User delete (`collections/Users.ts` beforeDelete) | sets `author` to NULL on that user's versions (FK `ON DELETE SET NULL`) | Site Admin only. Intended: deletion destroys attribution, disable is the default (D13a) |
| 12 | Version delete | sets `sourceVersion` / `mergedFrom` to NULL on surviving children (FK) | As 4/5/6/8. Intended provenance loss |
| 13 | Migrations `20261019_120000_release_ancestry`, `20261019_211325_worldwide_ids` | UPDATE `source_version_id`, `uid`, `release_fingerprint` where NULL | Operator-approved backfills (NEXT-SESSION release work); each only fills NULLs. Content columns untouched. C5.14 owns the detail |
| 14 | Scripts (`seed-local-dev`, `verify-*`, `roundtrip-regression`, `restore-check`) | create/delete with `overrideAccess` | CLI only, not reachable over HTTP; operator authority |

Jobs, artifact caches, edit recovery and discussions read versions but never write their rows (the
only raw SQL naming them is a read in `jobs/generateVersionArtifact.ts:134`).

## Leads (for C31 / C5.6, not findings)

- **L-C30-01 — The immutability exemption is "no `req.user`", not "trusted caller".** Today every
  user-less caller is a system path, and anonymous REST fails access first. A future Local API update
  run with an anonymous request's `req` would pass the hook. The auth rate limiter uses
  `overrideAccess` as its trust signal (`hooks/authRateLimit.ts:132–147`); this hook could too. Hardening.
- **L-C30-02 — `DELETING_LESSON_PLAN_IDS` stays set for the rest of the request**
  (`hooks/lessonPlan.ts:386–391`). The Official guard stands down for those plans until the request
  ends. Only plan deletion follows today, which is Site-Admin-only; the same set-and-forget shape was
  fixed for the reset-link allowance (`withAdminResetLinkAllowance`). Hardening.
- **L-C30-03 — C31 checksums must allow for rows 11–13.** User deletion and version deletion change
  `author`/`source_version_id`/`merged_from_id` on surviving rows by design. C31's "any change to a
  surviving row is a finding" needs those columns either excluded or logged as permitted, like
  permitted deletions.

## Resume point

C31 on the C01 target: checksum all version rows, attempt rows 1–8 as every role (C22 already covers
part of 2 and 4), then the plan-lock races named in rows 4–6.
