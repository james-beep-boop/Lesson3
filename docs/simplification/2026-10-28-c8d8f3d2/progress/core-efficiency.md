# Core efficiency review (read-only)

Source: immutable v1.10 worktree `/home/james/Documents/Codex/2026-10-26/ares-v110-review`, commit `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`. Manifest read from active workspace `docs/simplification/2026-10-28-c8d8f3d2/packets.json`; no other review reports read. No source edits, Git changes, tests, or live operations.

## access-01 — complete

Read all 6 manifest files (652 lines): `access/bundle.ts`, `generatedSurfaces.ts`, `index.ts`, `lockedDocuments.ts`, `versionImmutability.ts`, `versioning.ts`.

Efficiency result: no actionable finding. Access helpers are pure checks over the already-authenticated `req.user`; assignment-filter work is O(A) per check with A the caller's assignments, and no DB access is hidden in role predicates. `canEditLockTarget` returns a boolean grant directly or performs one `payload.count` with id + access `Where`; lock takeover then has one lock `findByID` plus that count only when target update access is a `Where`. This is a bounded two-read authorization path, not a per-row scan. Generated-surface policies are applied once to the sanitized config at initialization; no request-path repeated work.

Rejected ideas: do not memoize role checks across request mutations/authorization boundaries without evidence; do not replace `count` with a less exact lookup or remove the target's update-access recheck. Context search (not manifest files): enumerated `canEditLockTarget`, `isEditorFor`, and `canDeleteVersionDoc` callers to confirm no hidden DB work in the pure helpers; inspected `tests/unit/generatedSurfaces.spec.ts` and `tests/unit/canDeleteVersionDoc.spec.ts` as context only. No tests run. Dependencies followed: Payload lock collection access, target collection `access.update`, and version deletion policy callers.

Resume point: begin `collections-01` from the manifest.

## collections-01 — complete

Read all 11 manifest files (2,023 lines): `DiscussionParticipation.ts`, `DiscussionReplies.ts`, `DiscussionTopics.ts`, `EditRecovery.ts`, `Favorites.ts`, `LessonBundleVersions.ts`, `LessonPlans.ts`, `Messages.ts`, `Subject.ts`, `SubjectGrade.ts`, `Users.ts`.

Efficiency result: no high-confidence minimal change. The collections mainly wire already-batched hooks and field configuration. Targeted work counts: authenticated favorite creation does one readability lookup before insert; message creation spends one sender UPSERT, then the after-change ping gate issues one exact unread count, and only if it is zero spends a recipient-budget UPSERT and queues a content-free job. This is constant query count per message, not per unread row. The unread count filters by indexed recipient relationship but may examine all unread rows for a prolific recipient; only the boolean `> 0` is consumed. Lower-priority index/existence-query lead if timings show this dominates, but no evidence or query-plan inspection supports changing it now. `readAt` has no dedicated index; adding one is likewise workload-dependent.

Rename/delete fan-outs are intentionally cardinality-dependent: subject rename pages all child grades (one query/page) then updates one grade at a time; SubjectGrade deletion counts plans and versions (two early-exit reads), pages holders, then updates each holder; user participation deletion selects affected topics once, locks the set in one ordered statement, then deletes participation rows in the request transaction. These paths must collect before mutating their match set, and per-record hooks/transactions are load-bearing. Lesson-plan/version/user cascades delegate to the child collection hooks; edit-recovery explicitly excludes large `content` from the delete projection. No workload evidence indicates these rare admin operations merit a different transaction or bulk strategy.

Rejected ideas: do not replace message count with parallel work, skip favorite read authorization, remove paging or collect-and-write ordering on taxonomy/account fan-outs, or change cascade paths to bulk SQL without proving hook and transaction semantics. Context reads: source comments and collection/hook wiring; no test files read and no tests run. Dependencies followed: `hooks/discussions`, `hooks/lessonPlan`, `hooks/userRoles`, favorite/recovery/message cascades, Payload request transactions, and the per-user message rate limiter.

Resume point: begin `fields-01` from the manifest.

## fields-01 — complete

Read all 5 manifest files (729 lines): `fields/bundleFields.ts`, `identity.ts`, `lessonContent.ts`, `officialChange.ts`, `phases.ts`.

Efficiency result: no runtime change indicated. These modules build static Payload field configs at module load. Factories such as `prose`, `resourceRecordFields`, and `adminOnly` allocate schema objects during startup, not per request. `structureCondition` repeats a pure role/subject-grade predicate at nested and field level in the admin UI; source documents why the duplicate is referentially identical and protects standalone field reuse. Per-field URL validation is local, with no DB reads. No repeated query or request-path allocation issue found.

Rejected ideas: do not collapse nested role conditions or remove field factories to reduce one-time config construction; do not move validation/access decisions out of their field/hook boundaries for startup savings. Context dependencies checked from source: `access/bundle.ts`, `hooks/fieldSplit.ts` references and collection composition in `LessonBundleVersions`/`LessonPlans` read in the prior packet. No test files read and no tests run.

Resume point: begin `hooks-01` from the manifest.

## hooks-01 — complete

Read all 8 manifest files (1,887 lines): `hooks/authRateLimit.ts`, `bundleVersion.ts`, `discussions.ts`, `fieldSplit.ts`, `lessonPlan.ts`, `loginPasswordWork.ts`, `messageReference.ts`, `mutationAuthority.ts`.

Efficiency result: no actionable change without workload data. Hooks with variable work have explicit bounds or operate only on affected rows. `validatePublication` probes up to 25 candidate slugs in one `find` (not one query per suffix), and skips the probe entirely for already-published plans whose frozen slug is unchanged. `validateOfficialVersionPointer` fetches only `lessonPlan`/`subjectGrade` for the referenced version and skips all reads when neither comparison input is being changed. `refreshMutationAuthority` adds one shared advisory lock, optional target row lock/read, and one post-wait caller reread before native update/delete; this is authorization freshness work and must remain. `orderReply` takes the author reference lock and advances thread sequence/activity in one SQL update; replacing the former multi-round-trip read/update sequence is already the efficient shape.

Cardinality-dependent lower-priority leads: `retargetFollowerFavorites` batches three reads (previous-official favorites, owners, new-official favorites), then issues one sequential update/delete per old favorite (F writes). This is on the rare pointer-move path; the loop intentionally isolates benign `NotFound` skips while propagating transaction-poisoning errors, so do not parallelize or bulk it without preserving those semantics. Subject rename (in `collections-01`) similarly updates one row per grade. No timings or large F/grade counts were available. `equalizeLoginPasswordWork` performs one identity lookup and one/two deliberate PBKDF2 dummy derivations, preserving timing behavior; no CPU change proposed. Login limiter spends two sequential UPSERTs by design (client first, then target), preventing address variation from bypassing the client budget.

Possible duplicate reference read, lower priority and unmeasured: topic creation's `stampAuthenticatedCreate` resolves a caller-readable version for label/plan, then `joinTopicParticipants` reads the same version again for its author. This is one extra projected `findByID` only for a referenced topic, but the second read is a trusted-path lookup within the transaction and determines the invitation author; carrying that value through server context changes data flow and requires proof of identical behavior under concurrent delete/access changes. No change recommended without a focused design and evidence.

Rejected ideas: no weakening mutation authority refresh, update/delete row locks, Official pointer serialization/rechecks, reply ordering locks, authentication timing work, or per-row failure handling. No tests run. Context reads: `endpoints/respond.ts` (`refreshCaller`) and `tests/unit/retargetFavoritesTxn.spec.ts`; relevant read references in `versionEdit`, `combinePreview`, `recovery`, `discussions` and collection callers were searched. Dependencies followed: `txDb`, Payload request transaction, rate-limit UPSERT, Payload Local API validation/create/update/delete, favorite transaction contract, and source-version read projection.

Resume point: begin `hooks-02` from the manifest.

## hooks-02 — complete

Read the full manifest source `hooks/userRoles.ts` (618 lines).

Efficiency result: no actionable change. The admin-count guard takes the shared transaction-scoped advisory lock and performs one count only when the target was a usable Site Admin and will cease being one; grant paths take the key without a count. The user-delete guard uses one projected `findByID`, avoiding hydration of assignments/sessions, and conditionally one count. `autoDemotePriorSubjectAdmins` locks all relevant subject-grade ids in one ordered statement, then queries holder pages per granted grade and updates changed holders one at a time. Its work is O(G × page reads + affected-user writes); each grant normally concerns one grade, but a bulk user update can carry several. This is rare authorization administration and the serial per-holder writes are inside the grant transaction; no evidence supports batching or changing partial error behavior.

Lower-priority lead: every user create currently takes the `firstRegister` advisory key and counts users, including ordinary creates after initialization (`grantSiteAdminToFirstUser`, `userRoles.ts`; the Users collection wires this for all creates). That is 1 lock + 1 count per create and serializes user creation on the key until transaction end. There is a native one-shot path marker, but trusted Local API first-user/bootstrap behavior also uses this hook, so skipping based only on the URL could alter initialization semantics. Ordinary account creation is infrequent and no contention/timing evidence is available; no change recommended.

Rejected ideas: never remove/admin-count-lock/recheck or change its order; do not parallelize or bulk the demotion cascade without preserving same-transaction invariant and `skipAutoDemote` behavior; do not narrow bootstrap handling without accounting for trusted first-user creation. Context reads: `lib/firstUserBootstrap.ts` and `tests/unit/firstUserRoleLock.spec.ts`; test source read only, no tests run. Dependencies followed: `txDb` advisory/row locks, Users collection hook ordering, account creation gate, `assertAnotherUsableSiteAdminRemains`, and demotion cascade.

Resume point: begin `globals-01` from the manifest.

## globals-01 — complete

Read the manifest source `globals/SystemSettings.ts` (277 lines).

Efficiency result: no runtime issue. `stampFlagChanges` does fixed-size flag comparisons (three known flags) and copies the small provenance array on each global write; reads/writes are singleton operations. `changedBy.maxDepth: 0` explicitly avoids relationship population on every read. The sole Save endpoint and `beforeChange` hook are wired once; no per-request loop or repeated query appears here.

Rejected ideas: no cache or batching opportunity in this singleton config; do not loosen the Save endpoint/access/hooks separation to remove a small fixed-size provenance pass. Dependencies followed from source: `systemFlagNames`, `systemFlags`, `fields/identity`, `systemSettingsSave` endpoint, and Site Admin panel reader. No tests read or run.

Resume point: begin `payload.config.ts-01` from the manifest.

## payload.config.ts-01 — complete

Read the manifest source `app/src/payload.config.ts` (298 lines).

Efficiency result: no actionable finding. Config construction and generated-surface policy application occur once when the `buildConfig` promise resolves. `onInit` performs one user-count query per process initialization, with undefined-table handling for the initial migration; it is not a request path. `beforeSchemaInit` registers one static Drizzle table definition. No repeated per-request work is introduced by this file.

Rejected ideas: no config-level memoization or narrowing of the startup guard; the one count is the boot-time public-posture decision. No tests read or run. Dependencies followed: `applyGeneratedSurfacePolicy`, `positiveIntEnv`, scheduled task list, public posture helpers, and the DB schema registration.

Resume point: begin `instrumentation.ts-01` from the manifest.

## instrumentation.ts-01 — complete

Read the manifest source `app/src/instrumentation.ts` (38 lines).

Efficiency result: no finding. `register` executes once per Node server runtime; `onRequestError` dynamically imports the tracker only on an unhandled-error callback and sends a fixed small route-context object. The module loader caches the import; no per-request work occurs on successful requests.

Rejected ideas: no eager tracker import (would pull the Node SDK into Edge compilation) or caching work beyond ESM module caching. No tests read or run. Dependencies followed: `lib/errorTracking` and login-client tracking import.

Resume point: begin `proxy.ts-01` from the manifest.

## proxy.ts-01 — complete

Read the manifest source `app/src/proxy.ts` (88 lines).

Efficiency result: no finding. Each matched document request does fixed work: generate 16 nonce bytes, encode one nonce, assemble a fixed directive list, copy request headers once, and set the CSP on request and response. Matcher excludes API/static/image/favicon and prefetch requests. This per-document work is inherent to nonce-based CSP and does not scale with app data.

Rejected ideas: do not reuse/cache a nonce or move policy construction to static headers; either would remove per-response nonce correctness. No tests read or run. Dependencies followed: Next renderer's request CSP nonce extraction (documented in source) and route matcher.

Resume point: all nine assigned packets complete. Report has per-packet source coverage, context dependencies, findings/rejected ideas, and resume points. No repository edits, Git changes, or tests were performed.

### Exact line anchors for measured source work and lower-priority leads

- `collections/Messages.ts:81-93` is the one exact unread-count query per message create; `:95-105` only spends recipient budget/enqueues when no other unread exists. The existence-only opportunity is conditional on recipient-volume evidence; no change proposed.
- `collections/Subject.ts:43-71` pages in batches of 200 then writes one SubjectGrade per row after collection; the count is proportional to actual affected grades. `collections/SubjectGrade.ts:23-71` does two early-exit content counts, then paged holder collection and per-holder writes.
- `hooks/lessonPlan.ts:447-478` batches the previous-official favorites, owner roster, and already-on-new favorites; `:480-494` performs one ordered per-favorite mutation. `:495-505` explains why bulk/concurrent writes would change transaction-error behavior.
- `hooks/userRoles.ts:290-308` acquires one bootstrap key and performs one users count for each create. `:572-614` does one paginated holder scan per granted subject-grade, then a sequential update per changed holder.
