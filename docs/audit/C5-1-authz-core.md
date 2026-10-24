# C5.1 — Authorization core (access/*), source plus live

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; 2026-10-24.
- **Environment:** disposable cloud stack (as C23/C24/C31/C41). Live probes **locally reproduced**;
  source reading **source-confirmed**.
- **Mandatory checks:** the predicates in `access/index.ts`, `access/versioning.ts`, `access/bundle.ts`
  and `access/generatedSurfaces.ts`; every role-escalation and scope-crossing write that the core is
  meant to refuse, attempted as a live caller.
- **Exclusions:** the user-deletion cascade and the race half of C31 stay with C30/C31.
- **Exit:** each predicate answered; no escalation or cross-scope write persisted; leads filed.

## Outcome

**No defect.** Every escalation and cross-scope write that reached the database was refused or
dropped. Two latent inconsistencies recorded as leads. No candidate filed.

## Source

- **Predicates.** `isSiteAdmin`, `isSubjectAdminFor`, `isEditorFor`, `subjectGradeIdsByRole` are the
  only scope checks, and each takes the user object, so a caller cannot name a scope it does not hold.
- **Users.** `usersCollectionRead` is `Boolean(user)`; the sensitive fields carry their own field
  access (`emailReadAccess`, `siteAdminField`, `assignmentsReadField`). `usersCollectionUpdate` admits
  a Subject Administrator of any scope to the row, and the field access plus the `userRoles.ts` hook
  scope what is writable (this is the C22 surface, cross-referenced).
- **Plans.** `lessonPlanUpdate` scopes a Subject Administrator to `subjectGrade in <their grants>`.
  `enforcePlanSubjectGradeImmutable` (hooks/lessonPlan.ts) refuses any change to `subjectGrade` on
  update, unconditionally, so a plan cannot leave its scope.
- **Versions.** `lessonBundleVersionCreate` and update are closed to REST; updates are refused by the
  immutability hook (C31). Delete is scoped by `deletableVersionsWhere`.
- **Generated surfaces.** The job-statistics global is Site-Admin read and no API write.

### Lead L-C5-01 — `subjectGrade` precedence differs between two helpers

`access/bundle.ts` `subjectGradeIdFor` prefers the stored `doc.subjectGrade`; the one in
`access/versioning.ts` prefers the incoming `data.subjectGrade`. Access for `canSetOfficialVersion`
therefore reads the *requested* scope on an update, while `canEditProse` reads the *stored* scope. No
exploit today: plan `subjectGrade` is immutable (`enforcePlanSubjectGradeImmutable`), and version
updates are closed by immutability. Recommended: one helper that prefers `doc`, so a future relaxation
of either guard cannot silently change the authorization basis.

### Lead L-C5-02 — silent 200 on refused fields

A field the caller may not write (`roles`, `assignments`, `_verified` by a non-admin) returns 200 with
the field absent, rather than a 403. This is Payload's field-access behaviour. It is safe (see live
results), but a client cannot tell a dropped write from a saved one. Possible UX/API clarity item;
not a security issue.

## Live results (2026-10-24)

| Attempt | Response | Persisted? |
|---|---|---|
| Subject Administrator A PATCHes self `roles: ['siteAdmin']` | 200, `roles` absent from response | No — `users_roles` holds only user 1 |
| Subject Administrator A PATCHes Subject Administrator B `roles: ['siteAdmin']` | 200, `roles` absent | No |
| Subject Administrator A adds an editing-access grant to user 8 in scope 1 | 403 | No |
| Subject Administrator A adds a grant to a teacher | 403 | No |
| Editing-access A PATCHes self `roles: ['siteAdmin']` | 200, field dropped | No |
| Editing-access A PATCHes self `assignments` → Subject Administrator scope 1 | 200, field dropped | No (`/me` shows the original `editor` grant only) |
| Editing-access A PATCHes self `_verified: false` | 200 | No (login still succeeds) |
| Editing-access B / Subject Administrator B set `officialVersion` on a scope 1 plan | 403 | No |
| Editing-access A (scope 1) sets `officialVersion` on own scope plan | 403 | No (Official pointer is Subject Administrator's) |
| Subject Administrator A moves a plan's `subjectGrade` to scope 2 | 400 "field is invalid: subjectGrade" | No |
| Subject Administrator A sets a scope-1 plan's pointer to a scope-2 version | 400 "field is invalid: officialVersion" | No |
| Subject Administrator A PATCHes a scope-2 plan | 403 | No |

The administrator fixture's `users_roles` row is intact; `/me` for the Subject Administrator A
shows the unchanged assignments.

## Resume point

- Re-run after any change to `usersCollectionUpdate` or `assignmentsUpdateField`; those are the
  two places a Subject Administrator's write scope is widened.
- Decide L-C5-01 with the operator (one helper or documented split).
