# Current API and route surface

Source: `bd5f07863a150cd51245b9c942502efa19d4014d`. Node 24.22.1, Payload 3.92.0. `c20-inventory.ts` resolved sanitized config without database initialization. This is static inventory; per-role browser/XHR crawl remains pending.

Collections: 16; globals: 2; root endpoints: 4; tasks: 5; GraphQL disabled: True.

## Access wiring

Function names are wiring descriptors, not semantic proof. Native version handlers can be registered with version storage disabled; registration does not prove an accessible history surface.

| Surface | Versions configured | Access descriptors |
|---|---|---|
| lesson-plans | False | create=lessonPlanCreate; delete=lessonPlanDelete; read=lessonPlanRead; unlock=defaultUnlockAccess; update=lessonPlanUpdate |
| lesson-bundle-versions | False | create=lessonBundleVersionCreate; delete=lessonBundleVersionDelete; read=lessonBundleVersionRead; unlock=defaultUnlockAccess; update=versionUpdateGrantForFormRenderOnly |
| subjects | False | create=siteAdminOnly; delete=siteAdminOnly; read=authenticated; unlock=defaultUnlockAccess; update=siteAdminOnly |
| subject-grades | False | create=siteAdminOnly; delete=siteAdminOnly; read=authenticated; unlock=defaultUnlockAccess; update=siteAdminOnly |
| users | False | create=usersCollectionCreate; delete=siteAdminOnly; read=usersCollectionRead; unlock=siteAdminOnly; update=usersCollectionUpdate; admin=adminPanelAccess |
| favorites | False | create=create; delete=ownFavorites; read=ownFavorites; unlock=defaultUnlockAccess; update=update |
| messages | False | create=create; delete=delete; read=senderOrRecipient; unlock=defaultUnlockAccess; update=update |
| edit-recovery | False | create=closed; delete=closed; read=closed; unlock=defaultUnlockAccess; update=closed |
| discussion-topics | False | create=forumPosting; delete=delete; read=forumReading; unlock=defaultUnlockAccess; update=update |
| discussion-replies | False | create=forumPosting; delete=delete; read=forumReading; unlock=defaultUnlockAccess; update=update |
| discussion-participation | False | create=create; delete=delete; read=ownParticipation; unlock=defaultUnlockAccess; update=update |
| payload-kv | False | create=create; delete=delete; read=read; unlock=defaultUnlockAccess; update=update |
| payload-jobs | False | create=create; delete=delete; read=read; unlock=defaultUnlockAccess; update=update |
| payload-locked-documents | False | create=lockCreate; delete=lockDelete; read=authenticated; unlock=defaultUnlockAccess; update=lockUpdate |
| payload-preferences | False | create=defaultAccess; delete=preferenceAccess; read=preferenceAccess; unlock=defaultUnlockAccess; update=preferenceAccess |
| payload-migrations | False | create=defaultAccess; delete=defaultAccess; read=defaultAccess; unlock=defaultUnlockAccess; update=defaultAccess |
| system-settings | global | read=siteAdminOnly; update=update |
| payload-jobs-stats | global | read=siteAdminOnly; update=noApiWrites |

## Resolved endpoints

| Method | Route | Handler |
|---|---|---|
| POST | `/api/lesson-plans/upload` | handler |
| POST | `/api/lesson-plans/:id/request-editing` | handler |
| GET | `/api/lesson-plans/count` | countHandler |
| POST | `/api/lesson-plans/` | (anonymous) |
| DELETE | `/api/lesson-plans/` | deleteHandler |
| DELETE | `/api/lesson-plans/:id` | deleteByIDHandler |
| POST | `/api/lesson-plans/access/:id?` | (anonymous) |
| GET | `/api/lesson-plans/versions` | findVersionsHandler |
| POST | `/api/lesson-plans/:id/duplicate` | (anonymous) |
| GET | `/api/lesson-plans/` | findHandler |
| GET | `/api/lesson-plans/:id` | findByIDHandler |
| GET | `/api/lesson-plans/versions/:id` | findVersionByIDHandler |
| POST | `/api/lesson-plans/versions/:id` | (anonymous) |
| PATCH | `/api/lesson-plans/` | (anonymous) |
| PATCH | `/api/lesson-plans/:id` | (anonymous) |
| POST | `/api/lesson-bundle-versions/:id/recovery/start` | handler |
| POST | `/api/lesson-bundle-versions/:id/recovery` | handler |
| GET | `/api/lesson-bundle-versions/:id/recovery` | handler |
| DELETE | `/api/lesson-bundle-versions/:id/recovery` | handler |
| GET | `/api/lesson-bundle-versions/:id/recovery/meta` | handler |
| POST | `/api/lesson-bundle-versions/:id/recovery/meta/cleanup` | handler |
| GET | `/api/lesson-bundle-versions/:id/recovery/unsaved-count` | handler |
| GET | `/api/lesson-bundle-versions/:id/combine-preview` | handler |
| GET | `/api/lesson-bundle-versions/:id/export` | handler |
| GET | `/api/lesson-bundle-versions/:id/export/doc` | handler |
| POST | `/api/lesson-bundle-versions/:id/export` | handler |
| GET | `/api/lesson-bundle-versions/:id/export/status` | handler |
| GET | `/api/lesson-bundle-versions/:id/preview` | handler |
| POST | `/api/lesson-bundle-versions/:id/preview` | handler |
| POST | `/api/lesson-bundle-versions/:id/preview-pdf` | handler |
| POST | `/api/lesson-bundle-versions/:id/save-as-new` | handler |
| POST | `/api/lesson-bundle-versions/:id/make-official` | handler |
| POST | `/api/lesson-bundle-versions/:id/email` | handler |
| GET | `/api/lesson-bundle-versions/:id/ares-export` | handler |
| GET | `/api/lesson-bundle-versions/count` | countHandler |
| POST | `/api/lesson-bundle-versions/` | (anonymous) |
| DELETE | `/api/lesson-bundle-versions/` | deleteHandler |
| DELETE | `/api/lesson-bundle-versions/:id` | deleteByIDHandler |
| POST | `/api/lesson-bundle-versions/access/:id?` | (anonymous) |
| GET | `/api/lesson-bundle-versions/versions` | findVersionsHandler |
| GET | `/api/lesson-bundle-versions/` | findHandler |
| GET | `/api/lesson-bundle-versions/:id` | findByIDHandler |
| GET | `/api/lesson-bundle-versions/versions/:id` | findVersionByIDHandler |
| POST | `/api/lesson-bundle-versions/versions/:id` | (anonymous) |
| PATCH | `/api/lesson-bundle-versions/` | (anonymous) |
| PATCH | `/api/lesson-bundle-versions/:id` | (anonymous) |
| GET | `/api/subjects/count` | countHandler |
| POST | `/api/subjects/` | (anonymous) |
| DELETE | `/api/subjects/` | deleteHandler |
| DELETE | `/api/subjects/:id` | deleteByIDHandler |
| POST | `/api/subjects/access/:id?` | (anonymous) |
| GET | `/api/subjects/versions` | findVersionsHandler |
| POST | `/api/subjects/:id/duplicate` | (anonymous) |
| GET | `/api/subjects/` | findHandler |
| GET | `/api/subjects/:id` | findByIDHandler |
| GET | `/api/subjects/versions/:id` | findVersionByIDHandler |
| POST | `/api/subjects/versions/:id` | (anonymous) |
| PATCH | `/api/subjects/` | (anonymous) |
| PATCH | `/api/subjects/:id` | (anonymous) |
| GET | `/api/subject-grades/count` | countHandler |
| POST | `/api/subject-grades/` | (anonymous) |
| DELETE | `/api/subject-grades/` | deleteHandler |
| DELETE | `/api/subject-grades/:id` | deleteByIDHandler |
| POST | `/api/subject-grades/access/:id?` | (anonymous) |
| GET | `/api/subject-grades/versions` | findVersionsHandler |
| POST | `/api/subject-grades/:id/duplicate` | (anonymous) |
| GET | `/api/subject-grades/` | findHandler |
| GET | `/api/subject-grades/:id` | findByIDHandler |
| GET | `/api/subject-grades/versions/:id` | findVersionByIDHandler |
| POST | `/api/subject-grades/versions/:id` | (anonymous) |
| PATCH | `/api/subject-grades/` | (anonymous) |
| PATCH | `/api/subject-grades/:id` | (anonymous) |
| GET | `/api/users/search` | handler |
| POST | `/api/users/:id/assign-editor` | handler |
| POST | `/api/users/:id/unassign-editor` | handler |
| POST | `/api/users/:id/assign-subject-admin` | handler |
| POST | `/api/users/:id/unassign-subject-admin` | handler |
| POST | `/api/users/forgot-password` | handler |
| POST | `/api/users/verify/:id` | handler |
| POST | `/api/users/:id/reveal-reset-link` | handler |
| POST | `/api/users/:id/set-site-admin` | handler |
| POST | `/api/users/:id/set-sign-in-disabled` | handler |
| POST | `/api/users/forgot-password` | (anonymous) |
| GET | `/api/users/init` | initHandler |
| POST | `/api/users/login` | (anonymous) |
| POST | `/api/users/logout` | (anonymous) |
| GET | `/api/users/me` | meHandler |
| POST | `/api/users/refresh-token` | (anonymous) |
| POST | `/api/users/first-register` | (anonymous) |
| POST | `/api/users/reset-password` | (anonymous) |
| POST | `/api/users/unlock` | (anonymous) |
| POST | `/api/users/verify/:id` | (anonymous) |
| GET | `/api/users/count` | countHandler |
| POST | `/api/users/` | (anonymous) |
| DELETE | `/api/users/` | deleteHandler |
| DELETE | `/api/users/:id` | deleteByIDHandler |
| POST | `/api/users/access/:id?` | (anonymous) |
| GET | `/api/users/versions` | findVersionsHandler |
| GET | `/api/users/` | findHandler |
| GET | `/api/users/:id` | findByIDHandler |
| GET | `/api/users/versions/:id` | findVersionByIDHandler |
| POST | `/api/users/versions/:id` | (anonymous) |
| PATCH | `/api/users/` | (anonymous) |
| PATCH | `/api/users/:id` | (anonymous) |
| GET | `/api/favorites/count` | countHandler |
| POST | `/api/favorites/` | (anonymous) |
| DELETE | `/api/favorites/` | deleteHandler |
| DELETE | `/api/favorites/:id` | deleteByIDHandler |
| POST | `/api/favorites/access/:id?` | (anonymous) |
| GET | `/api/favorites/versions` | findVersionsHandler |
| POST | `/api/favorites/:id/duplicate` | (anonymous) |
| GET | `/api/favorites/` | findHandler |
| GET | `/api/favorites/:id` | findByIDHandler |
| GET | `/api/favorites/versions/:id` | findVersionByIDHandler |
| POST | `/api/favorites/versions/:id` | (anonymous) |
| PATCH | `/api/favorites/` | (anonymous) |
| PATCH | `/api/favorites/:id` | (anonymous) |
| POST | `/api/messages/mark-read` | handler |
| GET | `/api/messages/count` | countHandler |
| POST | `/api/messages/` | (anonymous) |
| DELETE | `/api/messages/` | deleteHandler |
| DELETE | `/api/messages/:id` | deleteByIDHandler |
| POST | `/api/messages/access/:id?` | (anonymous) |
| GET | `/api/messages/versions` | findVersionsHandler |
| POST | `/api/messages/:id/duplicate` | (anonymous) |
| GET | `/api/messages/` | findHandler |
| GET | `/api/messages/:id` | findByIDHandler |
| GET | `/api/messages/versions/:id` | findVersionByIDHandler |
| POST | `/api/messages/versions/:id` | (anonymous) |
| PATCH | `/api/messages/` | (anonymous) |
| PATCH | `/api/messages/:id` | (anonymous) |
| GET | `/api/edit-recovery/count` | countHandler |
| POST | `/api/edit-recovery/` | (anonymous) |
| DELETE | `/api/edit-recovery/` | deleteHandler |
| DELETE | `/api/edit-recovery/:id` | deleteByIDHandler |
| POST | `/api/edit-recovery/access/:id?` | (anonymous) |
| GET | `/api/edit-recovery/versions` | findVersionsHandler |
| POST | `/api/edit-recovery/:id/duplicate` | (anonymous) |
| GET | `/api/edit-recovery/` | findHandler |
| GET | `/api/edit-recovery/:id` | findByIDHandler |
| GET | `/api/edit-recovery/versions/:id` | findVersionByIDHandler |
| POST | `/api/edit-recovery/versions/:id` | (anonymous) |
| PATCH | `/api/edit-recovery/` | (anonymous) |
| PATCH | `/api/edit-recovery/:id` | (anonymous) |
| GET | `/api/discussion-topics/nav-state` | handler |
| POST | `/api/discussion-topics/:id/delete` | handler |
| POST | `/api/discussion-topics/:id/mark-read` | handler |
| POST | `/api/discussion-topics/:id/pin` | handler |
| POST | `/api/discussion-topics/:id/redact` | handler |
| GET | `/api/discussion-topics/count` | countHandler |
| POST | `/api/discussion-topics/` | (anonymous) |
| DELETE | `/api/discussion-topics/` | deleteHandler |
| DELETE | `/api/discussion-topics/:id` | deleteByIDHandler |
| POST | `/api/discussion-topics/access/:id?` | (anonymous) |
| GET | `/api/discussion-topics/versions` | findVersionsHandler |
| POST | `/api/discussion-topics/:id/duplicate` | (anonymous) |
| GET | `/api/discussion-topics/` | findHandler |
| GET | `/api/discussion-topics/:id` | findByIDHandler |
| GET | `/api/discussion-topics/versions/:id` | findVersionByIDHandler |
| POST | `/api/discussion-topics/versions/:id` | (anonymous) |
| PATCH | `/api/discussion-topics/` | (anonymous) |
| PATCH | `/api/discussion-topics/:id` | (anonymous) |
| POST | `/api/discussion-replies/:id/redact` | handler |
| GET | `/api/discussion-replies/count` | countHandler |
| POST | `/api/discussion-replies/` | (anonymous) |
| DELETE | `/api/discussion-replies/` | deleteHandler |
| DELETE | `/api/discussion-replies/:id` | deleteByIDHandler |
| POST | `/api/discussion-replies/access/:id?` | (anonymous) |
| GET | `/api/discussion-replies/versions` | findVersionsHandler |
| POST | `/api/discussion-replies/:id/duplicate` | (anonymous) |
| GET | `/api/discussion-replies/` | findHandler |
| GET | `/api/discussion-replies/:id` | findByIDHandler |
| GET | `/api/discussion-replies/versions/:id` | findVersionByIDHandler |
| POST | `/api/discussion-replies/versions/:id` | (anonymous) |
| PATCH | `/api/discussion-replies/` | (anonymous) |
| PATCH | `/api/discussion-replies/:id` | (anonymous) |
| GET | `/api/discussion-participation/count` | countHandler |
| POST | `/api/discussion-participation/` | (anonymous) |
| DELETE | `/api/discussion-participation/` | deleteHandler |
| DELETE | `/api/discussion-participation/:id` | deleteByIDHandler |
| POST | `/api/discussion-participation/access/:id?` | (anonymous) |
| GET | `/api/discussion-participation/versions` | findVersionsHandler |
| POST | `/api/discussion-participation/:id/duplicate` | (anonymous) |
| GET | `/api/discussion-participation/` | findHandler |
| GET | `/api/discussion-participation/:id` | findByIDHandler |
| GET | `/api/discussion-participation/versions/:id` | findVersionByIDHandler |
| POST | `/api/discussion-participation/versions/:id` | (anonymous) |
| PATCH | `/api/discussion-participation/` | (anonymous) |
| PATCH | `/api/discussion-participation/:id` | (anonymous) |
| GET | `/api/payload-kv/count` | countHandler |
| POST | `/api/payload-kv/` | (anonymous) |
| DELETE | `/api/payload-kv/` | deleteHandler |
| DELETE | `/api/payload-kv/:id` | deleteByIDHandler |
| POST | `/api/payload-kv/access/:id?` | (anonymous) |
| GET | `/api/payload-kv/versions` | findVersionsHandler |
| POST | `/api/payload-kv/:id/duplicate` | (anonymous) |
| GET | `/api/payload-kv/` | findHandler |
| GET | `/api/payload-kv/:id` | findByIDHandler |
| GET | `/api/payload-kv/versions/:id` | findVersionByIDHandler |
| POST | `/api/payload-kv/versions/:id` | (anonymous) |
| PATCH | `/api/payload-kv/` | (anonymous) |
| PATCH | `/api/payload-kv/:id` | (anonymous) |
| GET | `/api/payload-jobs/run` | handler |
| GET | `/api/payload-jobs/handle-schedules` | handler |
| GET | `/api/payload-jobs/count` | countHandler |
| POST | `/api/payload-jobs/` | (anonymous) |
| DELETE | `/api/payload-jobs/` | deleteHandler |
| DELETE | `/api/payload-jobs/:id` | deleteByIDHandler |
| POST | `/api/payload-jobs/access/:id?` | (anonymous) |
| GET | `/api/payload-jobs/versions` | findVersionsHandler |
| POST | `/api/payload-jobs/:id/duplicate` | (anonymous) |
| GET | `/api/payload-jobs/` | findHandler |
| GET | `/api/payload-jobs/:id` | findByIDHandler |
| GET | `/api/payload-jobs/versions/:id` | findVersionByIDHandler |
| POST | `/api/payload-jobs/versions/:id` | (anonymous) |
| PATCH | `/api/payload-jobs/` | (anonymous) |
| PATCH | `/api/payload-jobs/:id` | (anonymous) |
| GET | `/api/payload-locked-documents/count` | countHandler |
| POST | `/api/payload-locked-documents/` | (anonymous) |
| DELETE | `/api/payload-locked-documents/` | deleteHandler |
| DELETE | `/api/payload-locked-documents/:id` | deleteByIDHandler |
| POST | `/api/payload-locked-documents/access/:id?` | (anonymous) |
| GET | `/api/payload-locked-documents/versions` | findVersionsHandler |
| POST | `/api/payload-locked-documents/:id/duplicate` | (anonymous) |
| GET | `/api/payload-locked-documents/` | findHandler |
| GET | `/api/payload-locked-documents/:id` | findByIDHandler |
| GET | `/api/payload-locked-documents/versions/:id` | findVersionByIDHandler |
| POST | `/api/payload-locked-documents/versions/:id` | (anonymous) |
| PATCH | `/api/payload-locked-documents/` | (anonymous) |
| PATCH | `/api/payload-locked-documents/:id` | (anonymous) |
| GET | `/api/payload-preferences/:key` | findByIDHandler |
| DELETE | `/api/payload-preferences/:key` | deleteHandler |
| POST | `/api/payload-preferences/:key` | updateHandler |
| GET | `/api/payload-preferences/count` | countHandler |
| POST | `/api/payload-preferences/` | (anonymous) |
| DELETE | `/api/payload-preferences/` | deleteHandler |
| DELETE | `/api/payload-preferences/:id` | deleteByIDHandler |
| POST | `/api/payload-preferences/access/:id?` | (anonymous) |
| GET | `/api/payload-preferences/versions` | findVersionsHandler |
| POST | `/api/payload-preferences/:id/duplicate` | (anonymous) |
| GET | `/api/payload-preferences/` | findHandler |
| GET | `/api/payload-preferences/:id` | findByIDHandler |
| GET | `/api/payload-preferences/versions/:id` | findVersionByIDHandler |
| POST | `/api/payload-preferences/versions/:id` | (anonymous) |
| PATCH | `/api/payload-preferences/` | (anonymous) |
| PATCH | `/api/payload-preferences/:id` | (anonymous) |
| POST | `/api/globals/system-settings/save` | handler |
| POST | `/api/globals/system-settings/access` | (anonymous) |
| GET | `/api/globals/system-settings/` | findOneHandler |
| GET | `/api/globals/system-settings/versions/:id` | findVersionByIDHandler |
| GET | `/api/globals/system-settings/versions` | findVersionsHandler |
| POST | `/api/globals/system-settings/versions/:id` | (anonymous) |
| POST | `/api/globals/system-settings/` | (anonymous) |
| POST | `/api/globals/payload-jobs-stats/access` | (anonymous) |
| GET | `/api/globals/payload-jobs-stats/` | findOneHandler |
| GET | `/api/globals/payload-jobs-stats/versions/:id` | findVersionByIDHandler |
| GET | `/api/globals/payload-jobs-stats/versions` | findVersionsHandler |
| POST | `/api/globals/payload-jobs-stats/versions/:id` | (anonymous) |
| POST | `/api/globals/payload-jobs-stats/` | (anonymous) |
| GET | `/api/resource-library` | handler |
| GET | `/api/resource-library/file/:token` | handler |
| GET | `/api/server-time` | handler |
| GET | `/api/access` | accessHandler |

## Job tasks

Job access descriptors: {"cancel": "cancel", "queue": "queue", "run": "run"}.

| Task | Retries |
|---|---|
| generateVersionArtifact | 0 |
| emailVersionArtifact | 0 |
| expireEditRecovery | framework default |
| messagePing | 0 |
| passwordResetEmail | 3 |

## App route source files

Parenthesized route groups are not URL segments. Dynamic segments, middleware and feature gates require live reconciliation.

| Source file |
|---|
| `app/src/app/(frontend)/discuss/[id]/page.tsx` |
| `app/src/app/(frontend)/discuss/new/page.tsx` |
| `app/src/app/(frontend)/discuss/page.tsx` |
| `app/src/app/(frontend)/explore/page.tsx` |
| `app/src/app/(frontend)/forgot-password/page.tsx` |
| `app/src/app/(frontend)/guide/page.tsx` |
| `app/src/app/(frontend)/lessons/[id]/compare/page.tsx` |
| `app/src/app/(frontend)/lessons/[id]/page.tsx` |
| `app/src/app/(frontend)/login/page.tsx` |
| `app/src/app/(frontend)/messages/page.tsx` |
| `app/src/app/(frontend)/page.tsx` |
| `app/src/app/(frontend)/reset-password/page.tsx` |
| `app/src/app/(frontend)/signup/page.tsx` |
| `app/src/app/(frontend)/verify-email/page.tsx` |
| `app/src/app/(payload)/admin/[[...segments]]/page.tsx` |
| `app/src/app/(payload)/api/[...slug]/route.ts` |
