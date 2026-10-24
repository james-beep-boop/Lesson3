# C20/C21 — Implemented authorization map

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. This is a source map, kept separate from
`rbac-expected.md` and the mechanical statuses in `crawl.md`. It does not certify complete guard
correctness, every write-path invariant, or race safety. C5.1/C22–C24/C30–C31 still own those checks.
Paths below are relative to `app/src/`; framework paths refer to installed **Payload 3.91.0**.

## Collections, fields and hooks

| Surface | Implemented gate / qualification | Source |
|---|---|---|
| Authenticated lesson/version reads | `Boolean(user)`; helpers explicitly use `overrideAccess:false` and caller identity | `access/versioning.ts`, `lib/readBundle.ts` |
| Direct plan/version create | Always denied; trusted ingest/save create through separate paths | `access/versioning.ts` |
| Native plan update/delete | Update Site Admin or matching Subject Admin; delete Site Admin; immutable categorization and Official consistency hooks remain separate | `access/versioning.ts`, `collections/LessonPlans.ts`, `hooks/lessonPlan.ts` |
| Native version update | Scoped form-render grant is paired with `enforceVersionImmutable`, which rejects authenticated in-place updates, including Site Admin | `access/versionImmutability.ts`, `collections/LessonBundleVersions.ts` |
| Version delete | Site Admin; matching Subject Admin; current editing capability plus own authorship. `enforceOfficialNotDeletable` separately protects current Official | `access/versioning.ts`, `hooks/bundleVersion.ts` |
| Authority after waits | Native user/plan updates and user/plan/version deletes lock then refresh caller; trusted overrides retain endpoint-specific obligations | `hooks/mutationAuthority.ts`, collection wiring |
| Prose/structure/system fields | `canEditProse`, `canEditStructure`, `systemOnly`; real save/preview additionally apply the field split. Identity, resources, numbering and no-op fields have distinct rules | `access/bundle.ts`, `fields/bundleFields.ts`, `fields/lessonContent.ts`, `hooks/fieldSplit.ts` |
| User roster / account updates | Read any authenticated; create ordinary anonymous signup after bootstrap or Site Admin; update self/Site Admin/Subject Admin, then field/scope guards constrain writes; delete Site Admin | `access/index.ts`, `collections/Users.ts` |
| Email / verification / role fields | Email and verification self/Site Admin; email update Site Admin; global roles Site Admin; assignments administrative projection and scoped writes; provenance system-written | `access/index.ts`, `collections/Users.ts`, `hooks/userRoles.ts` |
| User lifecycle | First-user, last-admin, password, disabled-login, assignment scope, demotion/provenance, reference locks and cascades are separate hooks, not implied by collection access | `collections/Users.ts`, `hooks/userRoles.ts`, `hooks/authRateLimit.ts` |
| Taxonomy | Authenticated read; Site-Admin CRUD plus domain constraints | `collections/Subject.ts`, `collections/SubjectGrade.ts` |
| Favorites | Read/delete own, Site-Admin support exception; create authenticated with session owner stamped; update denied | `collections/Favorites.ts` |
| Messages | Sender/recipient read only, no Site-Admin exception; authenticated create stamps sender; native update/delete denied | `collections/Messages.ts` |
| Edit recovery | Raw read/create/update/delete all denied, including Site Admin | `collections/EditRecovery.ts` |
| Topics/replies | Authenticated and forum enabled to post; reads require forum enabled except Site Admin; ordinary update/delete denied, system moderation paths separate | `lib/discussions.ts`, forum collections/hooks |
| Participation | Own rows while forum enabled, no Site-Admin exception; raw create/update/delete denied | `lib/discussions.ts`, `collections/DiscussionParticipation.ts` |
| System settings | Site-Admin read; native update denied; custom save owns password/freshness/transaction | `globals/SystemSettings.ts`, `endpoints/systemSettingsSave.ts` |
| Native jobs | Site-Admin read; raw collection writes denied; run/queue/cancel predicates Site Admin. In-process queue/autoRun bypass through trusted system paths | `payload.config.ts` jobs configuration |

## Every application custom endpoint

These 42 method/path descriptors supplement the 221 framework descriptors in `surface.md`.
Grouped rows list every descriptor explicitly; no default/native route is silently treated as an
application handler. All version paths below start `/api/lesson-bundle-versions`; user paths start
`/api/users`. Table predicates describe the source, not an independently proved outcome.

| Method / suffix or full root | Implemented guard / trust boundary | Handler source |
|---|---|---|
| POST `/api/lesson-plans/upload` | Authenticated + Site Admin, then upload validation/transaction | `endpoints/uploadBundles.ts` |
| POST `/api/lesson-plans/:id/request-editing` | Authenticated + caller-readable plan, private recipient resolution and rate cap | `endpoints/requestEditing.ts` |
| POST `/:id/recovery/start`; POST/GET/DELETE `/:id/recovery` | `loadEditable`: authenticated, readable source, editing authority in its subject-grade; session user owns capture; kernel fences generation/revision | `endpoints/recovery.ts` |
| GET `/:id/recovery/meta`; POST `/:id/recovery/meta/cleanup` | `loadForAdmin`: Site Admin and readable source; content-free metadata/cleanup, revision precondition | `endpoints/recovery.ts` |
| GET `/:id/recovery/unsaved-count` | Authenticated/readable source + `canDeleteVersionDoc`; bounded counts | `endpoints/recovery.ts` |
| GET `/:id/combine-preview` | Authenticated, both parents caller-readable, editing authority, same-plan/structural checks | `endpoints/combinePreview.ts` |
| GET `/:id/export`; GET `/:id/export/doc`; POST `/:id/export`; GET `/:id/export/status` | Authenticated + shared `authorizeVersionExportRequest` caller-readable source; generation/queue/rates/cache semantics differ per method | `endpoints/exportVersion.ts`, `endpoints/exportAuth.ts` |
| GET `/:id/preview` | Authenticated/readable saved version; no editing grant needed for saved content | `endpoints/previewVersion.ts` |
| POST `/:id/preview`; POST `/:id/preview-pdf` | Authenticated/readable source + current editing authority and field split | `endpoints/previewVersion.ts` |
| POST `/:id/save-as-new`; POST `/:id/make-official` | Shared `authorize` requires readable source + matching editing/admin authority respectively; fresh caller and field/deletion gates rechecked after waits | `endpoints/versionEdit.ts` |
| POST `/:id/email` | Authenticated + shared readable-version export gate, recipient/body/rate checks and queued delivery | `endpoints/emailVersion.ts`, `endpoints/exportAuth.ts` |
| GET `/:id/ares-export` | Authenticated/readable version; content-contract export | `endpoints/aresExport.ts` |
| GET user `/search` | `assertSiteAdmin`; bounded account search projection | `endpoints/userSearch.ts` |
| POST user `/:id/assign-editor`; POST user `/:id/unassign-editor` | Authenticated, caller refresh + scoped assignment field/hook, required freshness under lock; write uses `overrideAccess:false` | `endpoints/userAssignments.ts`, `hooks/userRoles.ts` |
| POST user `/:id/assign-subject-admin` | Matching administrator/Site Admin, existing editing capability required by authoritative scope hook; atomic demotion cascade | `endpoints/userAssignments.ts`, `hooks/userRoles.ts` |
| POST user `/:id/unassign-subject-admin` | Site Admin; required freshness and last-admin/scope invariants remain | `endpoints/userAssignments.ts` |
| POST user `/forgot-password` | Public credential flow, uniform response; no-SMTP branch does not rotate administrator token; queued SMTP path/native limiter | `endpoints/forgotPassword.ts` |
| POST user `/verify/:id` | Public token-possession flow; shared site-global limiter wraps native verification operation | `endpoints/verifyEmail.ts` |
| POST user `/:id/reveal-reset-link`; POST user `/:id/set-site-admin`; POST user `/:id/set-sign-in-disabled` | `requireSiteAdminCaller`; target/freshness/re-auth/last-admin/rate rules are operation-specific | `endpoints/userAdminActions.ts` |
| POST `/api/messages/mark-read` | Authenticated; bounded IDs AND recipient=session user before trusted update | `endpoints/markMessagesRead.ts` |
| GET `/api/discussion-topics/nav-state` | Authenticated, forum state and caller-scoped unread projection | `endpoints/discussionNavState.ts` |
| POST `/api/discussion-topics/:id/mark-read` | Authenticated + forum enabled; caller's read marker only | `endpoints/discussionActions.ts` |
| POST `/api/discussion-topics/:id/pin` | Site Admin + forum enabled; `moderate` locks target and refreshes authority | `endpoints/discussionActions.ts`, `endpoints/moderate.ts` |
| POST `/api/discussion-topics/:id/redact`; POST `/api/discussion-replies/:id/redact`; POST `/api/discussion-topics/:id/delete` | Site Admin; narrow moderation transaction with fresh authority; remains available while forum disabled | `endpoints/discussionActions.ts`, `endpoints/discussionThreadDelete.ts`, `endpoints/moderate.ts` |
| POST `/api/globals/system-settings/save` | Site Admin + password reauthentication, settings lock, fresh caller, expected timestamp | `endpoints/systemSettingsSave.ts` |
| GET `/api/resource-library` | Authenticated; one configured safe filesystem root | `endpoints/resourceLibrary.ts` |
| GET `/api/resource-library/file/:token` | Configured root and valid confined token; authenticated unless separate explicit `PDF_LIBRARY_PUBLIC=1` opt-in | `endpoints/resourceLibrary.ts` |
| GET `/api/server-time` | `assertSiteAdmin`; uncached clock facts | `endpoints/serverTime.ts` |

## Framework surfaces and limits

- `payload-migrations`: installed `dist/database/migrations/migrationsCollection.js` sets
  `endpoints:false`, `graphQL:false`, `lockDocuments:false`. It has no registered REST descriptors;
  the collection-level default guard name alone is misleading. C20's explicit list probe returns
  501 for every role. Keep this disabled response distinct from missing GraphQL's 404.
- `payload-locked-documents`: installed `dist/locked-documents/config.js` explicitly gives all four
  operations `defaultAccess` (authenticated), with related document/global/user fields. This is an
  implementation fact; C21 Q01/C22 must assess intended ownership, disclosure and interference.
- `payload-preferences`: installed `dist/preferences/config.js` scopes read/update/delete to
  `(user.value,user.relationTo)` matching the session and stamps user on create. Custom `/:key`
  handlers precede native descriptors. Test both operation families with real foreign rows.
- `payload-jobs-stats`: installed `dist/queues/config/global.js` adds a hidden JSON `stats` global
  with no custom access block; sanitized default read/update are authenticated. Its intended
  client authority and exact writable fields remain Q02; do not silently import the job-row policy.
- Auth descriptors include native login/logout/me/refresh/first-register/reset/unlock plus shadowed
  forgot/verify descriptors. `Users` configuration and hooks, installed dispatcher ordering and
  credential/session semantics must all be tested; an ordinary collection CRUD guard does not cover
  every auth operation. C23 owns disabled/stale sessions, token lifecycle and CSRF postures.
- GraphQL is disabled in config and its Next route files are absent. GET route and POST introspection probes
  returned 404 for every C20 actor in both browsers.

No guard-name scan counts as complete line review. Field-filter or concurrency failures must be
reproduced and reviewed under the handbook before becoming accepted findings.


## C22 runtime follow-up

`C22-framework.md` records 19 passing cases and the red Teacher statistics-write case, plus the red
real-document lock UI follow-up. Native job/KV/migration gates and preference ownership satisfy the
bounded assertions. F-C22-001/F-C22-002 record the separate statistics/lock candidates, source chain,
controls and limits. Their negative assertions remain red; this source map does not redefine those
outcomes as intended merely because the framework defaults are permissive.
