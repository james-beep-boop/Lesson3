# C20 — Static surface inventory

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Resolved from the pinned Payload configuration on Node 24.22.1
with production-mode configuration, without calling `getPayload`, opening the database or starting
job runners. This is registration evidence, **not** a permission/reachability verdict. Native handlers
may reject disabled features, and a registered handler is not proof an operation succeeds.

**Inventory:** 15 frontend/admin page patterns, 16 configured collections,
2 globals, 4 root endpoint descriptors, 5 tasks and
263 endpoint descriptors including framework defaults. Dynamic factories are resolved rather
than guessed from source text. Role-specific Chromium/WebKit crawl/XHR and explicit read outcomes
are now in [crawl.md](crawl.md); collection/field and all application custom handler gates are mapped
in [rbac-implemented.md](rbac-implemented.md). GraphQL remains disabled and GET/POST probes return 404
for every C20 actor. Full method/ownership/field attacks remain C22 work.

## Next.js page patterns

| Route pattern | Baseline source | Live role/crawl evidence |
|---|---|---|
| `/` | `app/src/app/(frontend)/page.tsx` | both browsers / all actors; crawl.md |
| `/admin/[[...segments]]` | `app/src/app/(payload)/admin/[[...segments]]/page.tsx` | both browsers / all actors; crawl.md |
| `/discuss` | `app/src/app/(frontend)/discuss/page.tsx` | both browsers / all actors; crawl.md |
| `/discuss/[id]` | `app/src/app/(frontend)/discuss/[id]/page.tsx` | both browsers / all actors; crawl.md |
| `/discuss/new` | `app/src/app/(frontend)/discuss/new/page.tsx` | both browsers / all actors; crawl.md |
| `/explore` | `app/src/app/(frontend)/explore/page.tsx` | both browsers / all actors; crawl.md |
| `/forgot-password` | `app/src/app/(frontend)/forgot-password/page.tsx` | both browsers / all actors; crawl.md |
| `/guide` | `app/src/app/(frontend)/guide/page.tsx` | both browsers / all actors; crawl.md |
| `/lessons/[id]` | `app/src/app/(frontend)/lessons/[id]/page.tsx` | both browsers / all actors; crawl.md |
| `/lessons/[id]/compare` | `app/src/app/(frontend)/lessons/[id]/compare/page.tsx` | both browsers / all actors; crawl.md |
| `/login` | `app/src/app/(frontend)/login/page.tsx` | both browsers / all actors; crawl.md |
| `/messages` | `app/src/app/(frontend)/messages/page.tsx` | both browsers / all actors; crawl.md |
| `/reset-password` | `app/src/app/(frontend)/reset-password/page.tsx` | both browsers / all actors; crawl.md |
| `/signup` | `app/src/app/(frontend)/signup/page.tsx` | both browsers / all actors; crawl.md |
| `/verify-email` | `app/src/app/(frontend)/verify-email/page.tsx` | both browsers / all actors; crawl.md |

The API catch-all `app/src/app/(payload)/api/[...slug]/route.ts` exports GET, POST, DELETE,
PATCH, PUT and OPTIONS via installed Payload route handlers. It is distinct from the admin page
catch-all. Public `/explore` is conditional; a page file does not establish it is enabled.

## Collections and named guards

Guard names below identify code to inspect; anonymous functions and default guards require source
reading and live evidence. Function names cannot define intended policy or prove authorization.

| Collection | Auth configured | Payload versions configured | Guard references |
|---|---|---|---|
| `lesson-plans` | false | false | create: `lessonPlanCreate`; delete: `lessonPlanDelete`; read: `lessonPlanRead`; unlock: `defaultUnlockAccess`; update: `lessonPlanUpdate` |
| `lesson-bundle-versions` | false | false | create: `lessonBundleVersionCreate`; delete: `lessonBundleVersionDelete`; read: `lessonBundleVersionRead`; unlock: `defaultUnlockAccess`; update: `versionUpdateGrantForFormRenderOnly` |
| `subjects` | false | false | create: `siteAdminOnly`; delete: `siteAdminOnly`; read: `authenticated`; unlock: `defaultUnlockAccess`; update: `siteAdminOnly` |
| `subject-grades` | false | false | create: `siteAdminOnly`; delete: `siteAdminOnly`; read: `authenticated`; unlock: `defaultUnlockAccess`; update: `siteAdminOnly` |
| `users` | true | false | create: `usersCollectionCreate`; delete: `siteAdminOnly`; read: `usersCollectionRead`; unlock: `siteAdminOnly`; update: `usersCollectionUpdate`; admin: `adminPanelAccess` |
| `favorites` | false | false | create: `create`; delete: `ownFavorites`; read: `ownFavorites`; unlock: `defaultUnlockAccess`; update: `update` |
| `messages` | false | false | create: `create`; delete: `delete`; read: `senderOrRecipient`; unlock: `defaultUnlockAccess`; update: `update` |
| `edit-recovery` | false | false | create: `closed`; delete: `closed`; read: `closed`; unlock: `defaultUnlockAccess`; update: `closed` |
| `discussion-topics` | false | false | create: `forumPosting`; delete: `delete`; read: `forumReading`; unlock: `defaultUnlockAccess`; update: `update` |
| `discussion-replies` | false | false | create: `forumPosting`; delete: `delete`; read: `forumReading`; unlock: `defaultUnlockAccess`; update: `update` |
| `discussion-participation` | false | false | create: `create`; delete: `delete`; read: `ownParticipation`; unlock: `defaultUnlockAccess`; update: `update` |
| `payload-kv` | false | false | create: `create`; delete: `delete`; read: `read`; unlock: `defaultUnlockAccess`; update: `update` |
| `payload-jobs` | false | false | create: `create`; delete: `delete`; read: `read`; unlock: `defaultUnlockAccess`; update: `update` |
| `payload-locked-documents` | false | false | create: `defaultAccess`; delete: `defaultAccess`; read: `defaultAccess`; unlock: `defaultUnlockAccess`; update: `defaultAccess` |
| `payload-preferences` | false | false | create: `defaultAccess`; delete: `preferenceAccess`; read: `preferenceAccess`; unlock: `defaultUnlockAccess`; update: `preferenceAccess` |
| `payload-migrations` | false | false | create: `defaultAccess`; delete: `defaultAccess`; read: `defaultAccess`; unlock: `defaultUnlockAccess`; update: `defaultAccess` |

Framework-owned collections remain explicit scope. A custom immutable-version collection is not
the same thing as Payload drafts/versions; verify disabled native routes rather than assuming that
registration enables them. Field-level guards, hooks and custom handler checks still need C21/C22.

## Ordered endpoint descriptors

Ordinal is within each configuration scope. Keep duplicate method/path descriptors: custom auth
shadowing and dispatcher ordering require installed-source and wire confirmation, not deduplication.
No side-effecting request was sent to generate this static registry; the separate live crawl uses synthetic UI/fixture activity.

| Scope | Ordinal | Method | Full path pattern | Handler reference |
|---|---|---|---|---|
| `collection:lesson-plans` | 1 | POST | `/api/lesson-plans/upload` | `handler` |
| `collection:lesson-plans` | 2 | POST | `/api/lesson-plans/:id/request-editing` | `handler` |
| `collection:lesson-plans` | 3 | GET | `/api/lesson-plans/count` | `countHandler` |
| `collection:lesson-plans` | 4 | POST | `/api/lesson-plans` | `(anonymous)` |
| `collection:lesson-plans` | 5 | DELETE | `/api/lesson-plans` | `deleteHandler` |
| `collection:lesson-plans` | 6 | DELETE | `/api/lesson-plans/:id` | `deleteByIDHandler` |
| `collection:lesson-plans` | 7 | POST | `/api/lesson-plans/access/:id?` | `(anonymous)` |
| `collection:lesson-plans` | 8 | GET | `/api/lesson-plans/versions` | `findVersionsHandler` |
| `collection:lesson-plans` | 9 | POST | `/api/lesson-plans/:id/duplicate` | `(anonymous)` |
| `collection:lesson-plans` | 10 | GET | `/api/lesson-plans` | `findHandler` |
| `collection:lesson-plans` | 11 | GET | `/api/lesson-plans/:id` | `findByIDHandler` |
| `collection:lesson-plans` | 12 | GET | `/api/lesson-plans/versions/:id` | `findVersionByIDHandler` |
| `collection:lesson-plans` | 13 | POST | `/api/lesson-plans/versions/:id` | `(anonymous)` |
| `collection:lesson-plans` | 14 | PATCH | `/api/lesson-plans` | `(anonymous)` |
| `collection:lesson-plans` | 15 | PATCH | `/api/lesson-plans/:id` | `(anonymous)` |
| `collection:lesson-bundle-versions` | 1 | POST | `/api/lesson-bundle-versions/:id/recovery/start` | `handler` |
| `collection:lesson-bundle-versions` | 2 | POST | `/api/lesson-bundle-versions/:id/recovery` | `handler` |
| `collection:lesson-bundle-versions` | 3 | GET | `/api/lesson-bundle-versions/:id/recovery` | `handler` |
| `collection:lesson-bundle-versions` | 4 | DELETE | `/api/lesson-bundle-versions/:id/recovery` | `handler` |
| `collection:lesson-bundle-versions` | 5 | GET | `/api/lesson-bundle-versions/:id/recovery/meta` | `handler` |
| `collection:lesson-bundle-versions` | 6 | POST | `/api/lesson-bundle-versions/:id/recovery/meta/cleanup` | `handler` |
| `collection:lesson-bundle-versions` | 7 | GET | `/api/lesson-bundle-versions/:id/recovery/unsaved-count` | `handler` |
| `collection:lesson-bundle-versions` | 8 | GET | `/api/lesson-bundle-versions/:id/combine-preview` | `handler` |
| `collection:lesson-bundle-versions` | 9 | GET | `/api/lesson-bundle-versions/:id/export` | `handler` |
| `collection:lesson-bundle-versions` | 10 | GET | `/api/lesson-bundle-versions/:id/export/doc` | `handler` |
| `collection:lesson-bundle-versions` | 11 | POST | `/api/lesson-bundle-versions/:id/export` | `handler` |
| `collection:lesson-bundle-versions` | 12 | GET | `/api/lesson-bundle-versions/:id/export/status` | `handler` |
| `collection:lesson-bundle-versions` | 13 | GET | `/api/lesson-bundle-versions/:id/preview` | `handler` |
| `collection:lesson-bundle-versions` | 14 | POST | `/api/lesson-bundle-versions/:id/preview` | `handler` |
| `collection:lesson-bundle-versions` | 15 | POST | `/api/lesson-bundle-versions/:id/preview-pdf` | `handler` |
| `collection:lesson-bundle-versions` | 16 | POST | `/api/lesson-bundle-versions/:id/save-as-new` | `handler` |
| `collection:lesson-bundle-versions` | 17 | POST | `/api/lesson-bundle-versions/:id/make-official` | `handler` |
| `collection:lesson-bundle-versions` | 18 | POST | `/api/lesson-bundle-versions/:id/email` | `handler` |
| `collection:lesson-bundle-versions` | 19 | GET | `/api/lesson-bundle-versions/:id/ares-export` | `handler` |
| `collection:lesson-bundle-versions` | 20 | GET | `/api/lesson-bundle-versions/count` | `countHandler` |
| `collection:lesson-bundle-versions` | 21 | POST | `/api/lesson-bundle-versions` | `(anonymous)` |
| `collection:lesson-bundle-versions` | 22 | DELETE | `/api/lesson-bundle-versions` | `deleteHandler` |
| `collection:lesson-bundle-versions` | 23 | DELETE | `/api/lesson-bundle-versions/:id` | `deleteByIDHandler` |
| `collection:lesson-bundle-versions` | 24 | POST | `/api/lesson-bundle-versions/access/:id?` | `(anonymous)` |
| `collection:lesson-bundle-versions` | 25 | GET | `/api/lesson-bundle-versions/versions` | `findVersionsHandler` |
| `collection:lesson-bundle-versions` | 26 | GET | `/api/lesson-bundle-versions` | `findHandler` |
| `collection:lesson-bundle-versions` | 27 | GET | `/api/lesson-bundle-versions/:id` | `findByIDHandler` |
| `collection:lesson-bundle-versions` | 28 | GET | `/api/lesson-bundle-versions/versions/:id` | `findVersionByIDHandler` |
| `collection:lesson-bundle-versions` | 29 | POST | `/api/lesson-bundle-versions/versions/:id` | `(anonymous)` |
| `collection:lesson-bundle-versions` | 30 | PATCH | `/api/lesson-bundle-versions` | `(anonymous)` |
| `collection:lesson-bundle-versions` | 31 | PATCH | `/api/lesson-bundle-versions/:id` | `(anonymous)` |
| `collection:subjects` | 1 | GET | `/api/subjects/count` | `countHandler` |
| `collection:subjects` | 2 | POST | `/api/subjects` | `(anonymous)` |
| `collection:subjects` | 3 | DELETE | `/api/subjects` | `deleteHandler` |
| `collection:subjects` | 4 | DELETE | `/api/subjects/:id` | `deleteByIDHandler` |
| `collection:subjects` | 5 | POST | `/api/subjects/access/:id?` | `(anonymous)` |
| `collection:subjects` | 6 | GET | `/api/subjects/versions` | `findVersionsHandler` |
| `collection:subjects` | 7 | POST | `/api/subjects/:id/duplicate` | `(anonymous)` |
| `collection:subjects` | 8 | GET | `/api/subjects` | `findHandler` |
| `collection:subjects` | 9 | GET | `/api/subjects/:id` | `findByIDHandler` |
| `collection:subjects` | 10 | GET | `/api/subjects/versions/:id` | `findVersionByIDHandler` |
| `collection:subjects` | 11 | POST | `/api/subjects/versions/:id` | `(anonymous)` |
| `collection:subjects` | 12 | PATCH | `/api/subjects` | `(anonymous)` |
| `collection:subjects` | 13 | PATCH | `/api/subjects/:id` | `(anonymous)` |
| `collection:subject-grades` | 1 | GET | `/api/subject-grades/count` | `countHandler` |
| `collection:subject-grades` | 2 | POST | `/api/subject-grades` | `(anonymous)` |
| `collection:subject-grades` | 3 | DELETE | `/api/subject-grades` | `deleteHandler` |
| `collection:subject-grades` | 4 | DELETE | `/api/subject-grades/:id` | `deleteByIDHandler` |
| `collection:subject-grades` | 5 | POST | `/api/subject-grades/access/:id?` | `(anonymous)` |
| `collection:subject-grades` | 6 | GET | `/api/subject-grades/versions` | `findVersionsHandler` |
| `collection:subject-grades` | 7 | POST | `/api/subject-grades/:id/duplicate` | `(anonymous)` |
| `collection:subject-grades` | 8 | GET | `/api/subject-grades` | `findHandler` |
| `collection:subject-grades` | 9 | GET | `/api/subject-grades/:id` | `findByIDHandler` |
| `collection:subject-grades` | 10 | GET | `/api/subject-grades/versions/:id` | `findVersionByIDHandler` |
| `collection:subject-grades` | 11 | POST | `/api/subject-grades/versions/:id` | `(anonymous)` |
| `collection:subject-grades` | 12 | PATCH | `/api/subject-grades` | `(anonymous)` |
| `collection:subject-grades` | 13 | PATCH | `/api/subject-grades/:id` | `(anonymous)` |
| `collection:users` | 1 | GET | `/api/users/search` | `handler` |
| `collection:users` | 2 | POST | `/api/users/:id/assign-editor` | `handler` |
| `collection:users` | 3 | POST | `/api/users/:id/unassign-editor` | `handler` |
| `collection:users` | 4 | POST | `/api/users/:id/assign-subject-admin` | `handler` |
| `collection:users` | 5 | POST | `/api/users/:id/unassign-subject-admin` | `handler` |
| `collection:users` | 6 | POST | `/api/users/forgot-password` | `handler` |
| `collection:users` | 7 | POST | `/api/users/verify/:id` | `handler` |
| `collection:users` | 8 | POST | `/api/users/:id/reveal-reset-link` | `handler` |
| `collection:users` | 9 | POST | `/api/users/:id/set-site-admin` | `handler` |
| `collection:users` | 10 | POST | `/api/users/:id/set-sign-in-disabled` | `handler` |
| `collection:users` | 11 | POST | `/api/users/forgot-password` | `(anonymous)` |
| `collection:users` | 12 | GET | `/api/users/init` | `initHandler` |
| `collection:users` | 13 | POST | `/api/users/login` | `(anonymous)` |
| `collection:users` | 14 | POST | `/api/users/logout` | `(anonymous)` |
| `collection:users` | 15 | GET | `/api/users/me` | `meHandler` |
| `collection:users` | 16 | POST | `/api/users/refresh-token` | `(anonymous)` |
| `collection:users` | 17 | POST | `/api/users/first-register` | `(anonymous)` |
| `collection:users` | 18 | POST | `/api/users/reset-password` | `(anonymous)` |
| `collection:users` | 19 | POST | `/api/users/unlock` | `(anonymous)` |
| `collection:users` | 20 | POST | `/api/users/verify/:id` | `(anonymous)` |
| `collection:users` | 21 | GET | `/api/users/count` | `countHandler` |
| `collection:users` | 22 | POST | `/api/users` | `(anonymous)` |
| `collection:users` | 23 | DELETE | `/api/users` | `deleteHandler` |
| `collection:users` | 24 | DELETE | `/api/users/:id` | `deleteByIDHandler` |
| `collection:users` | 25 | POST | `/api/users/access/:id?` | `(anonymous)` |
| `collection:users` | 26 | GET | `/api/users/versions` | `findVersionsHandler` |
| `collection:users` | 27 | GET | `/api/users` | `findHandler` |
| `collection:users` | 28 | GET | `/api/users/:id` | `findByIDHandler` |
| `collection:users` | 29 | GET | `/api/users/versions/:id` | `findVersionByIDHandler` |
| `collection:users` | 30 | POST | `/api/users/versions/:id` | `(anonymous)` |
| `collection:users` | 31 | PATCH | `/api/users` | `(anonymous)` |
| `collection:users` | 32 | PATCH | `/api/users/:id` | `(anonymous)` |
| `collection:favorites` | 1 | GET | `/api/favorites/count` | `countHandler` |
| `collection:favorites` | 2 | POST | `/api/favorites` | `(anonymous)` |
| `collection:favorites` | 3 | DELETE | `/api/favorites` | `deleteHandler` |
| `collection:favorites` | 4 | DELETE | `/api/favorites/:id` | `deleteByIDHandler` |
| `collection:favorites` | 5 | POST | `/api/favorites/access/:id?` | `(anonymous)` |
| `collection:favorites` | 6 | GET | `/api/favorites/versions` | `findVersionsHandler` |
| `collection:favorites` | 7 | POST | `/api/favorites/:id/duplicate` | `(anonymous)` |
| `collection:favorites` | 8 | GET | `/api/favorites` | `findHandler` |
| `collection:favorites` | 9 | GET | `/api/favorites/:id` | `findByIDHandler` |
| `collection:favorites` | 10 | GET | `/api/favorites/versions/:id` | `findVersionByIDHandler` |
| `collection:favorites` | 11 | POST | `/api/favorites/versions/:id` | `(anonymous)` |
| `collection:favorites` | 12 | PATCH | `/api/favorites` | `(anonymous)` |
| `collection:favorites` | 13 | PATCH | `/api/favorites/:id` | `(anonymous)` |
| `collection:messages` | 1 | POST | `/api/messages/mark-read` | `handler` |
| `collection:messages` | 2 | GET | `/api/messages/count` | `countHandler` |
| `collection:messages` | 3 | POST | `/api/messages` | `(anonymous)` |
| `collection:messages` | 4 | DELETE | `/api/messages` | `deleteHandler` |
| `collection:messages` | 5 | DELETE | `/api/messages/:id` | `deleteByIDHandler` |
| `collection:messages` | 6 | POST | `/api/messages/access/:id?` | `(anonymous)` |
| `collection:messages` | 7 | GET | `/api/messages/versions` | `findVersionsHandler` |
| `collection:messages` | 8 | POST | `/api/messages/:id/duplicate` | `(anonymous)` |
| `collection:messages` | 9 | GET | `/api/messages` | `findHandler` |
| `collection:messages` | 10 | GET | `/api/messages/:id` | `findByIDHandler` |
| `collection:messages` | 11 | GET | `/api/messages/versions/:id` | `findVersionByIDHandler` |
| `collection:messages` | 12 | POST | `/api/messages/versions/:id` | `(anonymous)` |
| `collection:messages` | 13 | PATCH | `/api/messages` | `(anonymous)` |
| `collection:messages` | 14 | PATCH | `/api/messages/:id` | `(anonymous)` |
| `collection:edit-recovery` | 1 | GET | `/api/edit-recovery/count` | `countHandler` |
| `collection:edit-recovery` | 2 | POST | `/api/edit-recovery` | `(anonymous)` |
| `collection:edit-recovery` | 3 | DELETE | `/api/edit-recovery` | `deleteHandler` |
| `collection:edit-recovery` | 4 | DELETE | `/api/edit-recovery/:id` | `deleteByIDHandler` |
| `collection:edit-recovery` | 5 | POST | `/api/edit-recovery/access/:id?` | `(anonymous)` |
| `collection:edit-recovery` | 6 | GET | `/api/edit-recovery/versions` | `findVersionsHandler` |
| `collection:edit-recovery` | 7 | POST | `/api/edit-recovery/:id/duplicate` | `(anonymous)` |
| `collection:edit-recovery` | 8 | GET | `/api/edit-recovery` | `findHandler` |
| `collection:edit-recovery` | 9 | GET | `/api/edit-recovery/:id` | `findByIDHandler` |
| `collection:edit-recovery` | 10 | GET | `/api/edit-recovery/versions/:id` | `findVersionByIDHandler` |
| `collection:edit-recovery` | 11 | POST | `/api/edit-recovery/versions/:id` | `(anonymous)` |
| `collection:edit-recovery` | 12 | PATCH | `/api/edit-recovery` | `(anonymous)` |
| `collection:edit-recovery` | 13 | PATCH | `/api/edit-recovery/:id` | `(anonymous)` |
| `collection:discussion-topics` | 1 | GET | `/api/discussion-topics/nav-state` | `handler` |
| `collection:discussion-topics` | 2 | POST | `/api/discussion-topics/:id/delete` | `handler` |
| `collection:discussion-topics` | 3 | POST | `/api/discussion-topics/:id/mark-read` | `handler` |
| `collection:discussion-topics` | 4 | POST | `/api/discussion-topics/:id/pin` | `handler` |
| `collection:discussion-topics` | 5 | POST | `/api/discussion-topics/:id/redact` | `handler` |
| `collection:discussion-topics` | 6 | GET | `/api/discussion-topics/count` | `countHandler` |
| `collection:discussion-topics` | 7 | POST | `/api/discussion-topics` | `(anonymous)` |
| `collection:discussion-topics` | 8 | DELETE | `/api/discussion-topics` | `deleteHandler` |
| `collection:discussion-topics` | 9 | DELETE | `/api/discussion-topics/:id` | `deleteByIDHandler` |
| `collection:discussion-topics` | 10 | POST | `/api/discussion-topics/access/:id?` | `(anonymous)` |
| `collection:discussion-topics` | 11 | GET | `/api/discussion-topics/versions` | `findVersionsHandler` |
| `collection:discussion-topics` | 12 | POST | `/api/discussion-topics/:id/duplicate` | `(anonymous)` |
| `collection:discussion-topics` | 13 | GET | `/api/discussion-topics` | `findHandler` |
| `collection:discussion-topics` | 14 | GET | `/api/discussion-topics/:id` | `findByIDHandler` |
| `collection:discussion-topics` | 15 | GET | `/api/discussion-topics/versions/:id` | `findVersionByIDHandler` |
| `collection:discussion-topics` | 16 | POST | `/api/discussion-topics/versions/:id` | `(anonymous)` |
| `collection:discussion-topics` | 17 | PATCH | `/api/discussion-topics` | `(anonymous)` |
| `collection:discussion-topics` | 18 | PATCH | `/api/discussion-topics/:id` | `(anonymous)` |
| `collection:discussion-replies` | 1 | POST | `/api/discussion-replies/:id/redact` | `handler` |
| `collection:discussion-replies` | 2 | GET | `/api/discussion-replies/count` | `countHandler` |
| `collection:discussion-replies` | 3 | POST | `/api/discussion-replies` | `(anonymous)` |
| `collection:discussion-replies` | 4 | DELETE | `/api/discussion-replies` | `deleteHandler` |
| `collection:discussion-replies` | 5 | DELETE | `/api/discussion-replies/:id` | `deleteByIDHandler` |
| `collection:discussion-replies` | 6 | POST | `/api/discussion-replies/access/:id?` | `(anonymous)` |
| `collection:discussion-replies` | 7 | GET | `/api/discussion-replies/versions` | `findVersionsHandler` |
| `collection:discussion-replies` | 8 | POST | `/api/discussion-replies/:id/duplicate` | `(anonymous)` |
| `collection:discussion-replies` | 9 | GET | `/api/discussion-replies` | `findHandler` |
| `collection:discussion-replies` | 10 | GET | `/api/discussion-replies/:id` | `findByIDHandler` |
| `collection:discussion-replies` | 11 | GET | `/api/discussion-replies/versions/:id` | `findVersionByIDHandler` |
| `collection:discussion-replies` | 12 | POST | `/api/discussion-replies/versions/:id` | `(anonymous)` |
| `collection:discussion-replies` | 13 | PATCH | `/api/discussion-replies` | `(anonymous)` |
| `collection:discussion-replies` | 14 | PATCH | `/api/discussion-replies/:id` | `(anonymous)` |
| `collection:discussion-participation` | 1 | GET | `/api/discussion-participation/count` | `countHandler` |
| `collection:discussion-participation` | 2 | POST | `/api/discussion-participation` | `(anonymous)` |
| `collection:discussion-participation` | 3 | DELETE | `/api/discussion-participation` | `deleteHandler` |
| `collection:discussion-participation` | 4 | DELETE | `/api/discussion-participation/:id` | `deleteByIDHandler` |
| `collection:discussion-participation` | 5 | POST | `/api/discussion-participation/access/:id?` | `(anonymous)` |
| `collection:discussion-participation` | 6 | GET | `/api/discussion-participation/versions` | `findVersionsHandler` |
| `collection:discussion-participation` | 7 | POST | `/api/discussion-participation/:id/duplicate` | `(anonymous)` |
| `collection:discussion-participation` | 8 | GET | `/api/discussion-participation` | `findHandler` |
| `collection:discussion-participation` | 9 | GET | `/api/discussion-participation/:id` | `findByIDHandler` |
| `collection:discussion-participation` | 10 | GET | `/api/discussion-participation/versions/:id` | `findVersionByIDHandler` |
| `collection:discussion-participation` | 11 | POST | `/api/discussion-participation/versions/:id` | `(anonymous)` |
| `collection:discussion-participation` | 12 | PATCH | `/api/discussion-participation` | `(anonymous)` |
| `collection:discussion-participation` | 13 | PATCH | `/api/discussion-participation/:id` | `(anonymous)` |
| `collection:payload-kv` | 1 | GET | `/api/payload-kv/count` | `countHandler` |
| `collection:payload-kv` | 2 | POST | `/api/payload-kv` | `(anonymous)` |
| `collection:payload-kv` | 3 | DELETE | `/api/payload-kv` | `deleteHandler` |
| `collection:payload-kv` | 4 | DELETE | `/api/payload-kv/:id` | `deleteByIDHandler` |
| `collection:payload-kv` | 5 | POST | `/api/payload-kv/access/:id?` | `(anonymous)` |
| `collection:payload-kv` | 6 | GET | `/api/payload-kv/versions` | `findVersionsHandler` |
| `collection:payload-kv` | 7 | POST | `/api/payload-kv/:id/duplicate` | `(anonymous)` |
| `collection:payload-kv` | 8 | GET | `/api/payload-kv` | `findHandler` |
| `collection:payload-kv` | 9 | GET | `/api/payload-kv/:id` | `findByIDHandler` |
| `collection:payload-kv` | 10 | GET | `/api/payload-kv/versions/:id` | `findVersionByIDHandler` |
| `collection:payload-kv` | 11 | POST | `/api/payload-kv/versions/:id` | `(anonymous)` |
| `collection:payload-kv` | 12 | PATCH | `/api/payload-kv` | `(anonymous)` |
| `collection:payload-kv` | 13 | PATCH | `/api/payload-kv/:id` | `(anonymous)` |
| `collection:payload-jobs` | 1 | GET | `/api/payload-jobs/run` | `handler` |
| `collection:payload-jobs` | 2 | GET | `/api/payload-jobs/handle-schedules` | `handler` |
| `collection:payload-jobs` | 3 | GET | `/api/payload-jobs/count` | `countHandler` |
| `collection:payload-jobs` | 4 | POST | `/api/payload-jobs` | `(anonymous)` |
| `collection:payload-jobs` | 5 | DELETE | `/api/payload-jobs` | `deleteHandler` |
| `collection:payload-jobs` | 6 | DELETE | `/api/payload-jobs/:id` | `deleteByIDHandler` |
| `collection:payload-jobs` | 7 | POST | `/api/payload-jobs/access/:id?` | `(anonymous)` |
| `collection:payload-jobs` | 8 | GET | `/api/payload-jobs/versions` | `findVersionsHandler` |
| `collection:payload-jobs` | 9 | POST | `/api/payload-jobs/:id/duplicate` | `(anonymous)` |
| `collection:payload-jobs` | 10 | GET | `/api/payload-jobs` | `findHandler` |
| `collection:payload-jobs` | 11 | GET | `/api/payload-jobs/:id` | `findByIDHandler` |
| `collection:payload-jobs` | 12 | GET | `/api/payload-jobs/versions/:id` | `findVersionByIDHandler` |
| `collection:payload-jobs` | 13 | POST | `/api/payload-jobs/versions/:id` | `(anonymous)` |
| `collection:payload-jobs` | 14 | PATCH | `/api/payload-jobs` | `(anonymous)` |
| `collection:payload-jobs` | 15 | PATCH | `/api/payload-jobs/:id` | `(anonymous)` |
| `collection:payload-locked-documents` | 1 | GET | `/api/payload-locked-documents/count` | `countHandler` |
| `collection:payload-locked-documents` | 2 | POST | `/api/payload-locked-documents` | `(anonymous)` |
| `collection:payload-locked-documents` | 3 | DELETE | `/api/payload-locked-documents` | `deleteHandler` |
| `collection:payload-locked-documents` | 4 | DELETE | `/api/payload-locked-documents/:id` | `deleteByIDHandler` |
| `collection:payload-locked-documents` | 5 | POST | `/api/payload-locked-documents/access/:id?` | `(anonymous)` |
| `collection:payload-locked-documents` | 6 | GET | `/api/payload-locked-documents/versions` | `findVersionsHandler` |
| `collection:payload-locked-documents` | 7 | POST | `/api/payload-locked-documents/:id/duplicate` | `(anonymous)` |
| `collection:payload-locked-documents` | 8 | GET | `/api/payload-locked-documents` | `findHandler` |
| `collection:payload-locked-documents` | 9 | GET | `/api/payload-locked-documents/:id` | `findByIDHandler` |
| `collection:payload-locked-documents` | 10 | GET | `/api/payload-locked-documents/versions/:id` | `findVersionByIDHandler` |
| `collection:payload-locked-documents` | 11 | POST | `/api/payload-locked-documents/versions/:id` | `(anonymous)` |
| `collection:payload-locked-documents` | 12 | PATCH | `/api/payload-locked-documents` | `(anonymous)` |
| `collection:payload-locked-documents` | 13 | PATCH | `/api/payload-locked-documents/:id` | `(anonymous)` |
| `collection:payload-preferences` | 1 | GET | `/api/payload-preferences/:key` | `findByIDHandler` |
| `collection:payload-preferences` | 2 | DELETE | `/api/payload-preferences/:key` | `deleteHandler` |
| `collection:payload-preferences` | 3 | POST | `/api/payload-preferences/:key` | `updateHandler` |
| `collection:payload-preferences` | 4 | GET | `/api/payload-preferences/count` | `countHandler` |
| `collection:payload-preferences` | 5 | POST | `/api/payload-preferences` | `(anonymous)` |
| `collection:payload-preferences` | 6 | DELETE | `/api/payload-preferences` | `deleteHandler` |
| `collection:payload-preferences` | 7 | DELETE | `/api/payload-preferences/:id` | `deleteByIDHandler` |
| `collection:payload-preferences` | 8 | POST | `/api/payload-preferences/access/:id?` | `(anonymous)` |
| `collection:payload-preferences` | 9 | GET | `/api/payload-preferences/versions` | `findVersionsHandler` |
| `collection:payload-preferences` | 10 | POST | `/api/payload-preferences/:id/duplicate` | `(anonymous)` |
| `collection:payload-preferences` | 11 | GET | `/api/payload-preferences` | `findHandler` |
| `collection:payload-preferences` | 12 | GET | `/api/payload-preferences/:id` | `findByIDHandler` |
| `collection:payload-preferences` | 13 | GET | `/api/payload-preferences/versions/:id` | `findVersionByIDHandler` |
| `collection:payload-preferences` | 14 | POST | `/api/payload-preferences/versions/:id` | `(anonymous)` |
| `collection:payload-preferences` | 15 | PATCH | `/api/payload-preferences` | `(anonymous)` |
| `collection:payload-preferences` | 16 | PATCH | `/api/payload-preferences/:id` | `(anonymous)` |
| `global:system-settings` | 1 | POST | `/api/globals/system-settings/save` | `handler` |
| `global:system-settings` | 2 | POST | `/api/globals/system-settings/access` | `(anonymous)` |
| `global:system-settings` | 3 | GET | `/api/globals/system-settings` | `findOneHandler` |
| `global:system-settings` | 4 | GET | `/api/globals/system-settings/versions/:id` | `findVersionByIDHandler` |
| `global:system-settings` | 5 | GET | `/api/globals/system-settings/versions` | `findVersionsHandler` |
| `global:system-settings` | 6 | POST | `/api/globals/system-settings/versions/:id` | `(anonymous)` |
| `global:system-settings` | 7 | POST | `/api/globals/system-settings` | `(anonymous)` |
| `global:payload-jobs-stats` | 1 | POST | `/api/globals/payload-jobs-stats/access` | `(anonymous)` |
| `global:payload-jobs-stats` | 2 | GET | `/api/globals/payload-jobs-stats` | `findOneHandler` |
| `global:payload-jobs-stats` | 3 | GET | `/api/globals/payload-jobs-stats/versions/:id` | `findVersionByIDHandler` |
| `global:payload-jobs-stats` | 4 | GET | `/api/globals/payload-jobs-stats/versions` | `findVersionsHandler` |
| `global:payload-jobs-stats` | 5 | POST | `/api/globals/payload-jobs-stats/versions/:id` | `(anonymous)` |
| `global:payload-jobs-stats` | 6 | POST | `/api/globals/payload-jobs-stats` | `(anonymous)` |
| `root` | 1 | GET | `/api/resource-library` | `handler` |
| `root` | 2 | GET | `/api/resource-library/file/:token` | `handler` |
| `root` | 3 | GET | `/api/server-time` | `handler` |
| `root` | 4 | GET | `/api/access` | `accessHandler` |

## Globals and jobs

- `system-settings` guards: read = `siteAdminOnly`, update = `update`.
- `payload-jobs-stats` guards: read = `defaultAccess`, update = `defaultAccess`.

| Task | Explicit retry configuration |
|---|---|
| `generateVersionArtifact` | 0 |
| `emailVersionArtifact` | 0 |
| `expireEditRecovery` | framework default; verify installed source |
| `messagePing` | 0 |
| `passwordResetEmail` | 3 |

Jobs access guard references: cancel = `cancel`, queue = `queue`, run = `run`.

Task metadata is not a public trigger grant. Source gates are mapped in `rbac-implemented.md`;
check authorization, actual native triggers and transaction boundaries in C22/C5.7. The only registered
native job-control descriptor here is GET `/api/payload-jobs/run`; configuration predicates named
queue/cancel do not by themselves establish separate REST routes.
