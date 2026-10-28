# SIMPLICITY review — shared lib packets

Baseline: `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91` in the immutable v1.10 review worktree. Read-only review. No tests run and no repository changes.

## lib-01 — app/src/lib packet (30 files; all source fully read)

No material simplicity finding. Candidate review was constrained to redundancy/state/branching/abstraction with concrete maintenance benefit; the observed abstractions have shared call sites or preserve important semantics.

Rejected ideas to retain:
- `discussionPaging.replyPageCount` is algebraically an alias for `pageOfSeq`, but its call sites need the meaning “number of pages for all replies”; that semantic name clarifies `entryPage`, `parsePage`, and the thread view.
- The `resolveAccessScopes` / `scopeLines` / `resolveAccessSummary` split is purposeful: ID resolution is reused, line wording is centralized, and Site Admin avoids a query.
- `editorGroups.buildRolesAccess`'s maps/sets are deliberate: one roster crosses to the client once, IDs remain per-group, and site-admin role rows are preserved for display. Do not simplify back into per-group user arrays.
- `compareGroups`'s document specs, fallback groups, and merge-key assertions each encode document-specific pairing, totality, or uniqueness; they are not incidental framework overhead.
- `discussionComposer`'s `phase` and `unresolved` are both needed: after an uncertain send, retry enters `sending` while unresolved remains true, so a refusal cannot incorrectly unlock editable text.
- `enqueueDetached`'s narrow generic signature and reconstruction of `{task,input}` enforce detached queue writes even for a prebuilt wider argument. Keep the cast at the native call seam.
- `assignmentCounts` returns counts rather than people for the deletion warning; `positiveIntEnv` and `gradeLevels` centralize settings/range contracts; other shared formatting and URL helpers have multiple callers.

Very small candidate considered but rejected as too marginal: `advancedTools.ts:36` casts the typed `ADVANCED_ACTIONS` tuple to `readonly string[]` before `includes`. `AdvancedAction` is derived from the tuple, so direct `.includes(action)` should type-check and avoid widening, but the cast creates little practical maintenance cost and no material simplification. No change recommended.

Context read (not exhaustive test review): relevant callers in AppNav/AdminDashboard, LessonControls/ShareMenu, Upload/Manage components, discussion pages/components/hooks, email jobs/auth, queue call sites, and generator conversion were searched/read where needed. Relevant unit specs were located through `rg` (advancedTools, accessScopes, discussionPaging, aresReleasePresentation, displayTitle, enqueue); tests are reserved for their separate review packet.

Packet files fully read: accessScopes.ts, advancedTools.ts, apiBase.ts, aresReleasePresentation.ts, assignmentCounts.ts, assignmentRoles.ts, awaitingApproval.ts, canonicalJson.ts, clockSkew.ts, compareGroups.ts, conversionLimit.ts, discussionComposer.ts, discussionPages.ts, discussionPaging.ts, discussionText.ts, discussions.ts, displayTitle.ts, domWindow.ts, editingViewport.ts, editorGroups.ts, emailAddress.ts, emailLinkBase.ts, enqueue.ts, env.ts, errorTracking.ts, escapeHtml.ts, firstUserBootstrap.ts, formatDate.ts, frameworkProse.ts, gradeLevels.ts. Baseline status remained clean.

## lib-02 — app/src/lib packet (30 files; all source fully read)

No material simplicity finding. The packet has repeated-looking branches and helper layers, but they support distinct states, boundaries, shared behavior, or measured concerns. The most tempting apparent duplication is intentional: `publicPlan.resolvePublicPlanBySlug` repeats the feature check as a fail-safe for callers that omit route gating; `findReadableVersions` and `findReadableVersionChoices` share one caller-scoped query because the projections differ; `resolveVersionReferences` batches both reference and source reads; `filterRows` tokenizes once per pass while `matchesQuery` remains a small pure convenience entry point. Keep the distinction between absent and unavailable requested versions, unknown official status, public visibility vs lookup, and status-only read failures.

Rejected ideas to retain:
- `lessonAnchors` shares `slugId`, section labels, and `docNavItems` across the lesson and preview surfaces; those names prevent duplicated anchors/navigation policy from drifting. `annotateSections` intentionally scans only Lesson Sequence.
- `loginProtection`'s global symbol state survives server chunks, IPv6 normalization groups subscribers by /64, and `withLoginCapacity` releases both counters in `finally`; the state/branching is integral to admission behavior.
- `personalVersions.versionActions` retains the three-valued `official` result and fail-closed delete/compare policy when plan pointer lookup fails. `findPersonalFavorites` chooses pagination behavior by the optional scope.
- `planSelection.deleteScope` tests subject-grade before strands because a one-strand group has the same ids but broader intended label; the one-plan case intentionally stays ungrouped.
- The two-level rate-limit API (`consumeRateLimit`, user response helper, shared-key response helper) serves hooks that throw, best-effort consumers, authenticated endpoint budgets, recipient budgets, and global budgets. Buckets are intentionally separate because their limits, window sizes, cost, and availability contracts differ.
- `readBundle` centralizes caller-scoped reads and the 403/404-only conversion; typed projection overloads prevent reading fields that were not selected. `findReadableVersions` and the choices query deliberately project different fields.
- `relId` validates type, numeric range, and relationship object shape; `distinctIds` filters null and deduplicates for SQL `in` queries.
- `resolveVersionReferences` uses two batched viewer-scoped lookups to avoid per-post reads and returns no target when the reference is gone/unreadable.
- `serverActionBodyLimit` derives the config string and byte count from one MiB constant; independent endpoint ceilings stay distinct by design.
- `stripIds` recursively applies to arrays and objects because nested Payload row IDs must not cross into a new document; `substrand` keeps generic row types so catalogue and Manage grouping share curriculum ordering without dropping caller fields.

A tiny candidate considered and rejected as marginal: `app/src/lib/substrand.ts:289` `matchesQuery` is only used by its unit spec, while product callers combine `tokenise` with `matchesTokenAnd` to avoid per-row tokenization. Removing the export would save a trivial wrapper but would reduce direct testability and provide no meaningful maintenance win. No change recommended.

Context read, not exhaustive test review: searched immediate call sites across pages, endpoints, hooks, collections, generator, and components; specifically inspected the public resolver callers, Payload boot wiring, lesson/compare reference reads, lesson page details, library filter/group consumers, and limit consumers. Located related unit specs via `rg`; did not read them exhaustively or run tests. `helpers.md` was used only as an export inventory, not as another review.

Packet files fully read: initials.ts, lessonAnchors.ts, lessonDetails.ts, lessonReference.ts, loginProtection.ts, messageText.ts, offlineAdminRecovery.ts, personalFavorites.ts, personalVersions.ts, planSelection.ts, plural.ts, proseLinkTokens.ts, publicLibrary.ts, publicPlan.ts, publicPosture.ts, publicSlug.ts, rateLimit.ts, readBundle.ts, relId.ts, renderTimings.ts, requestedVersion.ts, resolveLessonReferences.ts, sanitizeHtml.ts, schoolMetadata.ts, schoolName.ts, serverActionBodyLimit.ts, session.ts, setSchoolName.ts, stripIds.ts, substrand.ts. No tests run. No repository edits; worktree remains clean.

## lib-03 — app/src/lib packet (11 files; all source fully read)

One concrete, behavior-preserving simplification candidate:

- `app/src/lib/versionCounts.ts:12-15`, `versionCountsByPlan`: this function reconstructs the Payload drizzle adapter shape with a local `as unknown as` cast, then calls `adapter.drizzle.execute`. `txDb.ts` already exports `poolDb(payload)` for exactly a trusted read-only aggregate that intentionally uses the pool, and `assignmentCountsBySubjectGrade` already uses `poolDb(payload)` immediately beside the analogous count query. Replace the local adapter declaration and access with `poolDb(payload).execute(...)`, importing `poolDb` alongside `rowsOf`. This removes a second unchecked adapter-shape definition and makes Payload-upgrade compatibility fail in one maintained seam; it preserves the pool connection, query, access assumptions, result handling, and map behavior. Context: the library page invokes this aggregate in `Promise.all` after `requireUser`; it is not transaction-bound. `versionCounts.spec.ts` was located and its mock shape noted, but tests were not exhaustively reviewed or run; the test mock should remain structurally acceptable because `poolDb` accesses the same `db.drizzle` handle.

Rejected ideas to retain:
- `systemFlags` has separate request-context and React-render memoization because their scopes differ, and request writes must see fresh flags. It reads once and shares settings/name while preserving per-request switch-off behavior and fail-closed logging.
- `txDb` has several helpers because their transaction contracts differ: required transaction row/advisory locks, optionally pool-backed DB access, stale-token checks, driver-result normalization, and positive numeric counter validation. Do not collapse or weaken lock/transaction distinctions.
- `systemFacts` keeps state-specific details, separately timed probes, raced-file stat recovery, and independent facts because each describes a distinct operation or UI state; cache sizes are aggregated in parallel.
- `systemFlagNames` is a dependency-free shared value vocabulary for global config, endpoint, and client. `userSearchContract` similarly keeps shared client/server wire types and labels leaf-level.
- `versionContent` centralizes content-vs-identity filtering for both save and combine; `versionsOrder` holds presentation order while read/query order remains separate. `welcomeDismissal` is intentionally a shared key spelling, and `widgetUser` keeps shared identity/display labels while the email visibility gate stays at its caller boundary.
- `wireErrorMessage` and `documentLockedMessage` are used across multiple surfaces with distinct error paths; no wrapper layer was found to remove.

Context read, not exhaustive test review: inspected the library page call and `assignmentCountsBySubjectGrade` implementation as the `poolDb` precedent; searched call sites for system settings/flags, version count/order, welcome key, widget user, and wire error helpers. Located `versionCounts.spec.ts`; did not read tests exhaustively or run them. `helpers.md` was used only as an export inventory.

Packet files fully read: systemFacts.ts, systemFlagNames.ts, systemFlags.ts, txDb.ts, userSearchContract.ts, versionContent.ts, versionCounts.ts, versionsOrder.ts, welcomeDismissal.ts, widgetUser.ts, wireError.ts. No repository edits; worktree remains clean.

## lib-combine-01 — app/src/lib/combine packet (8 files; all source fully read)

No material simplicity finding. This is intentionally split into ancestry lookup, correspondence, bounded text merge, combination policy, private draft metadata, lineage stamp/backfill, and outcome classification. The apparent branching is what protects different kinds of information: prose overlays can be applied by the existing edit-recovery/save path, while administrator-owned structure and system-owned resource links must come wholly from one side. The ordered checks in `planCombine` produce different actionable refusal reasons; flattening them would obscure why a combine cannot proceed.

Rejected ideas to retain:
- `findCommonAncestor` declines incomplete/full lineage windows instead of picking a possibly stale overlap; it scopes candidates to the same plan and rechecks via the caller-readable seam. `newestAncestor` is shared with release presentation.
- `backfillLineages` is bounded by persisted ancestry and traverses both direct parents and existing closures so deleted ancestors remain represented; `unionLineage` truncation is safe because a full window is treated as incomplete.
- `rowsCorrespond` intentionally distinguishes strict row identity from resource-change identity, and rejects duplicate/reordered upload keys and duplicate phases/sections rather than guessing position matches.
- `merge3`'s per-call cell cap plus per-preview shared work budget bound both pathological single fields and cumulative multi-field work. Hunk conflict rules distinguish overlapping ranges, insertions at boundaries, identical changes, and adjacent paragraphs; simplifying those predicates risks changing merge semantics.
- `planCombine` checks overall graph/text size before expensive projection/canonicalization, structure before system data, then system/admin start selection, then each prose field. `includedVersion` separately compares resulting content against the descendant; ancestry alone is insufficient.
- `parseCombineContext` rejects unknown keys, invalid ids, malformed UTF-16, oversized key lists, and oversized encoded payload before deduplicating; UI and recovery callers share the same conflict-key encoder and parser.

Context read, not exhaustive test review: inspected `combinePreview` call sequence and the `newestAncestor` use in release presentation; searched callers in the editor/recovery flow, collection hook, migrations, and ingest backfill. Located associated unit specs; tests were not exhaustively read or run. `helpers.md` was used only as an export inventory.

Packet files fully read: ancestry.ts, backfill.ts, correspondence.ts, diff3.ts, draft.ts, engine.ts, lineage.ts, outcome.ts. No repository edits; worktree remains clean.

## lib-editRecovery-01 — app/src/lib/editRecovery packet (6 files; all source fully read)

No material simplicity finding. The kernel's length is largely its persistence protocol, explicit command/result unions, and deliberately separate atomic SQL statements. The projection's walk appears in several forms, but those forms serve different jobs (capture, apply, anchors, diff, and locating an editor field path) and are pinned to the shared prose whitelist. Collapsing them risks changing row identity, empty/null, or stale/copy-only behavior.

Rejected ideas to retain:
- `start`'s resume-vs-reactivation branches, active-capture cap, generation/revision progression, baseline/schema handling, and clear-on-reactivation are separate session invariants. `capture` projects at the storage boundary and uses a single conditional UPDATE; it is never an insert. `retire` keeps a discriminated set of proof conditions, with transaction requirement only for save-as-new and expiry cutoff only for expiry.
- Expiry's `selectExpiredCaptures` / `retireSelected` split enables a real interleaving test and production's per-row non-transactional behavior. Keep `skipped` distinct from `retired` and preserve cutoff and revision checks.
- `holdsUnsavedWork` is one shared SQL predicate used by multiple list/count/existence queries. Active sessions, empty captures, and tombstones remain distinct.
- Projection helpers preserve null as a cleared value, reject invalid prose shape, normalize JSONB-unstorable characters, key only by source row IDs, and avoid restoring structure. `captureDiff` intentionally shows orphan/mismatched fields for copy-out and shares `willApply` semantics without requiring a live document.
- `captureProvenance` handles Date and string timestamps to keep the compare token precise; TTL constants are dependency-free so client and server share one retention value. `listUnsavedWork` intentionally joins several eligibility gates before promising a resume action.
- `findDraftCombineSuggestion` has separate release priority, descendant requirement, readable-plan ancestry, and semver ordering; each branch represents an eligibility rule rather than disposable branching.

Context read, not exhaustive test review: searched and inspected caller wiring in recovery/version-edit endpoints, expiry job, lesson controls, restore prompt/groups, combine overlay/outcome/engine, Manage list, and the lesson page. Located relevant tests through source comments and `rg`; did not read tests exhaustively or run them. `helpers.md` was used only as an export inventory.

Packet files fully read: draftCombineSuggestion.ts, kernel.ts (all lines 1–706 in chunks), projection.ts (all lines 1–488 in chunks), provenance.ts, ttl.ts, unsavedWork.ts. No repository edits; worktree remains clean.

## lib-identity-01 — app/src/lib/identity packet (2 files; all source fully read)

No material simplicity finding. `releaseFingerprint` deliberately owns a frozen v1 canonicalization implementation rather than reusing mutable `versionContent.comparableContent`; deduplicating those algorithms would create compatibility drift in worldwide identity. `installationId` keeps tolerant read semantics because the value is an operator-facing fact rather than an access gate, and returns before the update on dry-run.

Rejected ideas to retain:
- The release fingerprint's fixed field set, `id` stripping, empty/padded resource normalization, positional numbering, sorting, and versioned format are the compatibility contract. The duplicate canonicalization is intentional, not an opportunity to share a mutable product helper.
- `readInstallationId` catches read failures and validates the projected value as a non-empty string; `resetInstallationId` returns prior/current values and uses the explicit reset context for the global hook. These branches describe distinct operator outcomes.

Context read, not exhaustive test review: searched all callers in ingest, migration, ARES release presentation, version chips, and the Manage dashboard; located the `releaseFingerprint` unit spec via source comments. Tests were not exhaustively read or run. `helpers.md` was used only as an export inventory.

Packet files fully read: installationId.ts, releaseFingerprint.ts. No repository edits; worktree remains clean.

## Completion and unfinished work

All six assigned packets were completed sequentially. No source files or tests were modified, no live tests were run, and no git state was changed. Tests were used only as context/locations, not exhaustively reviewed. The only concrete candidate is the `versionCountsByPlan` adapter access described under lib-03. No other unfinished work remains for this assignment.
