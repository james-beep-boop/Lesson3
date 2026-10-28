# REUSE working review (sanitized)
Baseline: c8d8f3d22c432061c8bff27e8357dd9f2d4feb91. Read-only; no tests run.

## lib-01

### Candidate (source-confirmed): one discussion/message body limit
`app/src/lib/discussionText.ts:9-11` defines `MAX_BODY_LENGTH = 5000`; `app/src/lib/messageText.ts:1-5` defines `MAX_MESSAGE_LENGTH = 5000` and says it is the single limit for typed/system-written internal messages. Discussion text's own comment explicitly says post/reply body limit is “the same as messages.body.” Discussion collections and composers consume `MAX_BODY_LENGTH`; Messages collection and release summary use `MAX_MESSAGE_LENGTH`; frontend message composer/reply UI still has literal `5000` (`app/src/app/(frontend)/messages/Composer.tsx`, `ReplyBox.tsx`). The same rule/value therefore has multiple owners, and a limit update can leave forum/message validation or a UI maxlength stale.
Smallest behavior-preserving fix: make discussion body limit an alias of the dependency-free `MAX_MESSAGE_LENGTH` (or move the shared value to a neutral pure module), and import the same value in the two message composer surfaces instead of literals. Keep title's 150-character rule distinct. Preserve caller-specific validation/error wording and UI behavior. No null, permission, transaction, or error-boundary change.

### Rejections / no candidate
- Existing shared rules are already centralized: discussion gate/access helpers, unread SQL condition, paging arithmetic, safe link parsing, common post fields, assignment route generation, email link base, shared HTML escaping, one jsdom window, shared access-scope presentation, etc.
- `deleteConsequences`' inflection is not a simple `plural` replacement: the nouns and verbs change differently for each role.
- `isGradeLevel` and tiny `isObject`-style predicates are not worth extracting solely to remove two lines.
- `discussionText.MAX_TITLE_LENGTH` is not another owner of message length; keep title and body limits separate.

### Coverage
Fully read all 30 packet implementations: `accessScopes.ts`, `advancedTools.ts`, `apiBase.ts`, `aresReleasePresentation.ts`, `assignmentCounts.ts`, `assignmentRoles.ts`, `awaitingApproval.ts`, `canonicalJson.ts`, `clockSkew.ts`, `compareGroups.ts`, `conversionLimit.ts`, `discussionComposer.ts`, `discussionPages.ts`, `discussionPaging.ts`, `discussionText.ts`, `discussions.ts`, `displayTitle.ts`, `domWindow.ts`, `editingViewport.ts`, `editorGroups.ts`, `emailAddress.ts`, `emailLinkBase.ts`, `enqueue.ts`, `env.ts`, `errorTracking.ts`, `escapeHtml.ts`, `firstUserBootstrap.ts`, `formatDate.ts`, `frameworkProse.ts`, `gradeLevels.ts`.
Relevant caller search covered `app/src` including message/discussion collections, composers, email endpoint/jobs, API-base callers, and display/presentation callsites. Representative tests identified by search include `discussionText.spec.ts`, `discussions.spec.ts`, `discussionComposer.spec.ts`, `discussionPaging.spec.ts`, `discussionPages.spec.ts`, `editorGroupsAccess.int.spec.ts`, and `emailAddress.spec.ts`; tests were not fully read (later reviewer owns tests). Cross-packet source `messageText.ts` was fully read. No packet source file was partial.

## lib-02

### Finding

- **Confirmed reuse: one shared body-length constant for internal messages and discussion posts/replies.** `app/src/lib/messageText.ts:5` exports `MAX_MESSAGE_LENGTH = 5000`; `app/src/lib/discussionText.ts:9-11` separately exports `MAX_TITLE_LENGTH = 150` and `MAX_BODY_LENGTH = 5000`, with its comment explicitly saying the forum post/reply limit is “the same as `messages.body`.” Server validation already consumes the respective constants (`app/src/collections/Messages.ts:57-58,183`; `DiscussionTopics.ts:71`; `DiscussionReplies.ts:67`), but the message composer and reply box repeat `5000` at `app/src/app/(frontend)/messages/Composer.tsx:126` and `ReplyBox.tsx:64`. This leaves three independently maintained spellings of a limit the source says is one rule; changing the server message limit can leave both its browser maxlength and forum limit behind (or vice versa). Smallest safe change: retain the public `MAX_BODY_LENGTH` alias in `discussionText.ts` but define it from `MAX_MESSAGE_LENGTH`, and have both message components import `MAX_MESSAGE_LENGTH` instead of literal `5000`. Keep the distinct 150-character title limit and the existing message/discussion validation/error text. Current values all equal 5000, so this is behavior-preserving. No change to permissions, null handling, errors, or transaction boundaries.

### Rejected / not findings

- `planSelection.ts:25` `planCount` and `plural.ts:11` `plural` implement the same simple regular noun suffix pattern, but this is one narrow copy; keeping the delete-panel phrase behind its semantic helper is cheap and avoids turning a small formatter into an abstraction change without material maintenance gain.
- `requestedVersion.ts:31-39` and `relId.ts:32-39` both parse digit strings, but they have different contracts: URL input distinguishes absent from malformed/unavailable and resolves against an already caller-scoped version list; relationship conversion accepts numbers/populated `{id}` objects and enforces positive PostgreSQL-serial bounds. Unifying them risks collapsing those cases; no extraction proposed.
- `resolveVersionReferences` and `discussionPages` both batch caller-scoped version reads, but the latter reads a topic/reply page and its source projection differs; `findReadableVersions` is plan-scoped and is the authorization proof for version-content rendering. The query shapes are not safe drop-in duplicates.
- Did not propose folding public-plan’s feature/visibility/pointer checks into a generic read helper: its ordered gates, override-access reads, private-plan not-found behavior, and version-to-plan integrity condition are a distinct boundary.
- School-name normalization, public-slug rules, rate-limit counter atomicity, readBundle’s 403/404-only null conversion, and the limited Payload `42P01` bootstrap exception are already named and shared or deliberately distinct. The `serverActionBodyLimit.ts` comment explicitly says upload/recovery ceilings are intentionally independent.

### Coverage

- **Packet source files fully read:** `app/src/lib/initials.ts`, `lessonAnchors.ts`, `lessonDetails.ts`, `lessonReference.ts`, `loginProtection.ts`, `messageText.ts`, `offlineAdminRecovery.ts`, `personalFavorites.ts`, `personalVersions.ts`, `planSelection.ts`, `plural.ts`, `proseLinkTokens.ts`, `publicLibrary.ts`, `publicPlan.ts`, `publicPosture.ts`, `publicSlug.ts`, `rateLimit.ts`, `readBundle.ts`, `relId.ts`, `renderTimings.ts`, `requestedVersion.ts`, `resolveLessonReferences.ts`, `sanitizeHtml.ts`, `schoolMetadata.ts`, `schoolName.ts`, `serverActionBodyLimit.ts`, `session.ts`, `setSchoolName.ts`, `stripIds.ts`, and `substrand.ts`.
- **Dependencies/callers fully read where material:** `app/src/lib/env.ts`, `app/src/lib/systemFlags.ts`, `app/src/lib/discussionText.ts`, `app/src/lib/messageText.ts`, `app/src/lib/planSelection.ts`, `app/src/lib/plural.ts`, `app/src/lib/readBundle.ts`, `app/src/lib/relId.ts`, `app/src/lib/resolveLessonReferences.ts`, `app/src/lib/requestedVersion.ts`, `app/src/lib/publicLibrary.ts`, `app/src/lib/publicPosture.ts`, `app/src/lib/publicSlug.ts`, `app/src/lib/substrand.ts`, and `app/src/hooks/lessonPlan.ts` (slug helper callers). Inspected focused caller ranges in `app/src/app/(frontend)/messages/Composer.tsx` and `ReplyBox.tsx`; these two caller files were **partial**, not full. Searched other source callsites with `rg`.
- **Representative test context read, not a complete test review:** full `app/tests/unit/publicSlug.spec.ts`, `lessonReference.spec.tsx`, `relId.spec.ts`, `requestedVersion.spec.ts`, and `schoolName.spec.tsx`; searched tests for readable-version, length-limit, and helper references. `app/tests/unit/readBundleVisibility.spec.ts` was identified as the readBundle contract test but not read; it is not needed for the candidate above. Per assignment, these are context only; the later test review owns full test coverage.

## lib-03

### Finding

- **Confirmed reuse: use the existing `poolDb` adapter accessor for read-only Payload-level SQL.** `app/src/lib/txDb.ts:91-92` centralizes the drizzle pool handle, and `app/src/lib/assignmentCounts.ts:58` already uses it for a read-only aggregate. `app/src/lib/versionCounts.ts:12-15` repeats a local `payload.db as unknown as { drizzle: ... }` cast before its read-only grouped version-count query; `app/src/jobs/generateVersionArtifact.ts:131-134` repeats the same cast for the pending-job existence read. Both take `Payload` without a request/transaction and use the pool, not a transaction-bound handle. Smallest safe change: import `poolDb` and replace those local adapter declarations with `poolDb(payload).execute(...)`; preserve each SQL statement, `rowsOf` conversion, and result mapping. This removes two extra unsafe adapter-shape assertions and keeps the existing pool-versus-transaction distinction. No access mode, permission, null, exception, or transaction behavior changes; `poolDb` accesses the same `payload.db.drizzle` field currently accessed by each copy.

### Rejected / not findings

- `versionCountsByPlan` and `assignmentCountsBySubjectGrade` have similarly shaped grouped queries, but count different entities and return different row maps; extracting a generic SQL-count builder would obscure the column, filter, role, and null semantics with little maintenance gain. Reuse only the adapter accessor.
- `rateLimit.ts` has its own drizzle access from `req.payload`; it records rate-limit writes and may run in hook/request transaction contexts, while `poolDb` is documented for read-only operations. Do not fold it into this read-only accessor without separately proving its transaction contract.
- `findPendingExportJob` is not an aggregate, but it is a read-only Payload-level pool query with no request object and the same exact adapter cast as `versionCountsByPlan`; it is included in the accessor reuse above. Do not abstract its SQL shape with the count queries.
- `rowsOf` already centralizes driver result normalization. `rateLimit.ts` assumes `{ rows }`, but changing that to `rowsOf` would alter handling of a bare-array driver result; excluded from this behavior-preserving reuse pass.
- `systemFlags` intentionally memoizes only within one Payload request/render; `readSystemSettings` uses fail-closed logging and optional request-bound reads. No cross-request cache or general settings-query extraction proposed. `systemFacts` correctly reuses the owning modules’ environment/cache/probe accessors. `versionContent` and `versionsOrder` are already named helpers; did not collapse their distinct comparison versus presentation ordering.

### Coverage

- **Packet source files fully read:** `app/src/lib/systemFacts.ts`, `systemFlagNames.ts`, `systemFlags.ts`, `txDb.ts`, `userSearchContract.ts`, `versionContent.ts`, `versionCounts.ts`, `versionsOrder.ts`, `welcomeDismissal.ts`, `widgetUser.ts`, and `wireError.ts`.
- **Relevant dependencies/callers fully read where material:** `app/src/lib/assignmentCounts.ts` (existing `poolDb` use), `app/src/lib/relId.ts`, `app/src/lib/publicLibrary.ts`, and source implementations of `gotenbergUrl`, `artifactCacheDir`, `artifactCacheMaxBytes`, `isArtifactCacheEntry`, and `errorTrackingEnabled` at their defining modules. Inspected `app/src/app/(frontend)/page.tsx` around the `versionCountsByPlan` call, `app/src/components/AdminDashboard/index.tsx` around `assignmentCountsBySubjectGrade`, and `app/src/jobs/generateVersionArtifact.ts` around `findPendingExportJob`; those caller files were **partial**, not full. Searched all source callers of `poolDb`, adapter casts, and packet symbols.
- **Representative test context read, not a complete test review:** full `app/tests/unit/versionCounts.spec.ts`, `exportJobDedupe.spec.ts`, `systemFlags.spec.ts`, `systemFacts.spec.ts`, `systemSettingsFlags.spec.ts`, `versionsOrder.spec.ts`, and `lockOrder.spec.ts`. `app/tests/int/lockRows.int.spec.ts` was identified but not read. Test assertions for `versionCountsByPlan` and `findPendingExportJob` use `{ rows }`, matching current `rowsOf` behavior; tests are context only, with later test review owning full coverage.

## lib-combine-01

### Findings

- **No additional behavior-preserving reuse candidate found.** This packet consistently uses shared boundaries already present: `newestAncestor` in `ancestry.ts` is also used by `aresReleasePresentation.ts`; `unionLineage` is reused by migration backfill and the create hook; combine prose selection consumes edit-recovery's `projectCapture` and `fieldSplit` whitelists; content equivalence uses `comparableContent`; row correspondence has one local generic identity comparator; and conflict identity is centralized through `conflictKey`.

### Rejected / not findings

- `engine.ts:126-153` `withoutProse` deliberately traverses the same nested prose-bearing structure as `projection.ts:180+` `projectCapture`, but performs the inverse operation: one strips whitelisted prose while preserving all other content, the other emits a sparse, row-id-keyed map. Their null/undefined, row identity, sparse output, and metadata-preservation semantics differ. The existing `combineEngine.spec.ts` includes a cross-check that the result of `withoutProse` contains no content recognized by `projectCapture` while retaining protected fields; a generalized traversal would add shape/visitor machinery and make the whitelist boundary harder to audit for limited maintenance gain. Kept as a deliberate paired implementation, not proposed for extraction.
- `newestAncestor` uses semver, then creation time, then numeric id to choose among ancestors; `versionsOrder.ts` orders Official first and then newest timestamp for presentation. Different decisions, so no sorter reuse.
- `backfillLineages` is an iterative traversal that retains pre-existing closure ids even when ancestors were deleted; `stampVersionLineage` unions known live parent closures. Shared `unionLineage` handles de-duplication/sorting/bounding, but the traversal cannot be collapsed without changing deleted/invalid-parent behavior.
- `rowsCorrespond`'s `sameRows` comparisons intentionally enforce equal length, uniqueness, order, and caller-supplied identity. No generic equality helper elsewhere expresses that domain contract.
- `merge3`'s hunk conflict logic and shared per-preview work budget are domain-specific and already factored internally; no external copy was found. Did not extract constants or local one-use predicates.

### Coverage

- **Packet source files fully read:** `app/src/lib/combine/ancestry.ts`, `backfill.ts`, `correspondence.ts`, `diff3.ts`, `draft.ts`, `engine.ts`, `lineage.ts`, and `outcome.ts`.
- **Relevant source dependencies/callers:** read the relevant projection contract and `projectCapture` portion in `app/src/lib/editRecovery/projection.ts`; `canonicalJson.ts`, `stripIds.ts`, `versionContent.ts`, `versionsOrder.ts`, and `semver.ts` had been fully read in preceding packet work. Searched all source references to `newestAncestor`, `unionLineage`, `conflictKey`, `projectCapture`, `withoutProse`, and lineage operations. `app/src/lib/aresReleasePresentation.ts` had been fully read in lib-01.
- **Representative test context, not complete test review:** searched test cases/names across `app/tests/unit/combineEngine.spec.ts`, `combineDraft.spec.ts`, `releaseAncestry.spec.ts`, and `draftCombineSuggestion.spec.ts`; read the `withoutProse`/`projectCapture` parity assertion in `combineEngine.spec.ts`. The remainder of those tests was not read; the test reviewer owns complete coverage.

## lib-editRecovery-01

### Findings

- **No additional safe reuse candidate found.** The packet centralizes the high-value shared rules already: `txDb`/`rowsOf`/`toPositiveInt` for SQL access and driver normalization; `projectCapture`/`applyCapture` and shared `fieldSplit` whitelists for the prose boundary; `captureDiff` and `willApply` for restore-preview/write agreement; `captureProvenance` for both GET and Manage restorable state; `parseCombineContext` for capture and recovery metadata; and TTL logic in an import-free module shared by browser UI and expiry job.

### Rejected / not findings

- `projection.ts` has related document traversals in `projectCapture`, `captureAnchors`, and `applyCapture`. They look structurally similar but serve different contracts: sparse whitelisted value capture (including `null`), human document-order headings for existing capture keys, and source-shaped overlay with dropped-key accounting and source-owned identities. A common generic visitor would introduce a second abstraction to express those differing null/malformed/array and output semantics. Existing projection tests cover round-trip, disallowed fields, null clearing, row-id safety, totality, and that every projected key has an anchor. No extraction proposed.
- `captureProvenance` and kernel `tokenOf` both normalize timestamps that may be strings or `Date`s, but failure behavior differs: `tokenOf` throws a contextual error on unparseable database tokens, while provenance directly calls `toISOString()` and is used as a stale/schema predicate. Factoring timestamp parsing would need to preserve these distinct errors; the code is small and not meaningfully costly.
- Recovery byte limits, Combine metadata limits, and Server Action/upload ceilings describe different serialized objects and are separately scoped. Do not unify the constants or byte-measurement paths.
- `retire` intentionally shares one SQL transition while carrying different precondition terms by discriminated command. `start`, `capture`, and `retire` SQL are not copies: their insert/reactivation, active-only CAS, and retirement/tombstone semantics differ. No query helper extraction.
- `listUnsavedWork` repeats an access check already enforced by endpoints because it must avoid listing rows that cannot be resumed; this is an explicit promise/UI filter, not redundant authorization. It also reuses `captureProvenance` rather than re-encoding staleness.
- `findDraftCombineSuggestion` and `findCommonAncestor` both use lineage, but one prioritizes eligible later releases/descendants under editor access, while the other finds a common ancestry candidate under caller-scoped readable query and conservative lineage truncation. Their filters and permission semantics differ.

### Coverage

- **Packet source files fully read:** `app/src/lib/editRecovery/draftCombineSuggestion.ts`, `kernel.ts`, `projection.ts`, `provenance.ts`, `ttl.ts`, and `unsavedWork.ts`.
- **Relevant source dependencies/callers:** `app/src/lib/txDb.ts`, `app/src/lib/combine/draft.ts`, `app/src/lib/combine/ancestry.ts`, `app/src/lib/combine/lineage.ts`, `app/src/lib/combine/engine.ts`, `app/src/lib/versionContent.ts`, `app/src/lib/relId.ts`, `app/src/lib/semver.ts`, and the relevant `hooks/fieldSplit.ts` constants had been read; searched endpoint, job, component, and source callsites. Caller implementations were not all fully read; the packet’s `kernel` implementation, TTL consumers, recovery endpoint helper callsites, Manage list caller, and save path references were inspected by focused ranges.
- **Representative test context, not complete test review:** searched case names in `app/tests/unit/editRecoveryProjection.spec.ts`, `captureDiffAgreement.spec.ts`, `editRecoveryTtlProvenance.spec.ts`, `combineDraft.spec.ts`, and integration coverage in `editRecoveryCapture.int.spec.ts`, `editRecoveryExpiry.int.spec.ts`, and `editRecoveryUnsavedWork.int.spec.ts`. Read the cross-feature `withoutProse` projection parity test in `combineEngine.spec.ts` in lib-combine-01. Test bodies were not read comprehensively; later test review owns complete coverage.

## lib-identity-01

### Findings

- **No additional behavior-preserving reuse candidate found.** `installationId.ts` is a narrow fail-soft reader/reset wrapper for an administrator-only identity; `releaseFingerprint.ts` defines a frozen cross-installation wire format with explicit golden vectors and a deliberate copy of content normalization rules.

### Rejected / not findings

- `releaseFingerprint.ts` duplicates aspects of `versionContent.ts` (`stripIds`, empty-value normalization, sorted serialization), but its header explicitly freezes `ares-content-v1`: a product-level change to version comparison cannot change fingerprints already persisted across schools. Refactoring to `comparableContent` or a shared mutable normalizer would revoke that versioning guarantee. The same content-to-fingerprint logic is also intentionally used for both ingest bundles and stored-version backfill; it is already one helper.
- `readInstallationId` and `readSystemSettings` both read the `system-settings` global, but they have different projections and disclosure/caller scope: installation identity is read only for the Site-Admin dashboard, while flags/name are requested on broader rendering paths; the installation reader also deliberately swallows read failures without logging. Extending the general settings response could widen availability of an internal identity or change error behavior to save one small single-field query. No extraction.
- The field hook owns generating/resetting the installation id; `resetInstallationId` supplies only the named `req.context` token and does not duplicate generation/validation logic. No overlap worth extracting.

### Coverage

- **Packet source files fully read:** `app/src/lib/identity/installationId.ts` and `releaseFingerprint.ts`.
- **Relevant callers/dependencies read:** `app/src/fields/identity.ts` (reset and fingerprint fields/context), relevant `AdminDashboard/index.tsx` call range (Site-Admin-only installation id), relevant ingest fingerprint call ranges, and `app/src/ingest/releaseAncestry.ts` (fingerprint-related ancestry behavior). The caller files were partial, not full. Searched all source references to packet exports.
- **Representative test context read, not complete test review:** full `app/tests/unit/releaseFingerprint.spec.ts` and `releaseFingerprintContext.spec.ts`; identified worldwide-id integration coverage in `app/tests/int/worldwideIds.int.spec.ts` and did not read it. Later test review owns complete coverage.
