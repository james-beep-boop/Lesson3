# Shared-lib ALTITUDE review checkpoint

Immutable source: `/home/james/Documents/Codex/2026-10-26/ares-v110-review`, HEAD `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`.
Read-only review; no tests, repository edits, git mutations, live access, security audit, other review reports or delegated agents.

## lib-01 — complete

Findings: no substantial ownership move recommended. Shared display/presentation policy remains distinct from the access source of truth; forum client text/arithmetic/state machine are separated from server gates and writes. The server discussion rules deliberately own shared collection fields, access and conditional atomic participation/read-marker SQL, rather than letting three collections/endpoints diverge.

Rejected moves:
- Do not move `buildRolesAccess` (`editorGroups.ts:103`) into AdminDashboard or generic access helpers: it must retain its role gate, trusted roster query and narrow projection together; the explicit SPEC §8 address carve-out and legacy multiple-administrator reporting must remain.
- Do not move forum gates (`discussions.ts:39-59`) into three collections solely because access functions usually live under `access/`; this would separate domain decisions already shared by topics/replies/participation and endpoints. Keep forum-off differences (moderation read allowed, posting/participation forbidden), caller access and transaction behavior.
- Do not move rendered-document classification (`compareGroups.ts:244`) into pristine vendor code. It consumes sanitized renderer output and preserves totality/unique group keys after the sections cache, not generator formatting ownership.
- Do not collapse first-register suppression into a custom bootstrap endpoint: `firstUserBootstrap.ts:35` uses native trusted beforeOperation behavior and existing one-shot transaction.
- Do not remove `enqueueDetached` (`enqueue.ts:45`) as a forwarding wrapper: reconstructing `{task,input}` prevents accidental transaction enlistment. Error recovery remains each caller's policy.
- Considered the mixed server counts/pure deletion sentence in `assignmentCounts.ts:51,113`. No recommendation without demonstrated browser-bundle problem: changing ownership merely for a small sentence would conflict with its documented testing seam. The pure shared contracts in `assignmentRoles`, `advancedTools`, `discussionText`, `discussionPaging` already avoid importing server operations into clients.
- `aresReleasePresentation.newerReleaseSuggestion` will be cross-checked against recovery/combine ancestry in later assigned packets; no extraction based on naming alone.

Full source files (all lines read; any truncated tool ranges reread explicitly):
`app/src/lib/accessScopes.ts`, `advancedTools.ts`, `apiBase.ts`, `aresReleasePresentation.ts`, `assignmentCounts.ts`, `assignmentRoles.ts`, `awaitingApproval.ts`, `canonicalJson.ts`, `clockSkew.ts`, `compareGroups.ts`, `conversionLimit.ts`, `discussionComposer.ts`, `discussionPages.ts`, `discussionPaging.ts`, `discussionText.ts`, `discussions.ts`, `displayTitle.ts`, `domWindow.ts`, `editingViewport.ts`, `editorGroups.ts`, `emailAddress.ts`, `emailLinkBase.ts`, `enqueue.ts`, `env.ts`, `errorTracking.ts`, `escapeHtml.ts`, `firstUserBootstrap.ts`, `formatDate.ts`, `frameworkProse.ts`, `gradeLevels.ts` (same lib directory for shortened names).

Partial/dependency coverage:
- Consumer reference search across `app/src` for access-summary/roles/counts/forum/release suggestion/preview concurrency/bootstrap/compare/state-machine exports.
- `tests/unit/discussions.spec.ts:1-120`, `tests/unit/aresReleasePresentation.spec.ts:1-100` representative context.
- Prior full AGENTS/CLAUDE/computing-environment and relevant SPEC/DECISIONS reading from the pilot still applies. SPEC §§6-8 release/roles and §10 discussions references consulted; canonical forum detail is the referenced design §16, not a claim of a full reread of the design.

Remaining: lib-02, lib-03, lib-combine-01, lib-editRecovery-01, lib-identity-01, plus later cross-packet dependency checks. Exhaustive test review is intentionally left to its assigned phase.

## lib-02 — complete

Candidate pending lib-03 owner verification: `rateLimit.ts:194-210,230-236` defines its own Drizzle execute-result contract and reaches directly into `req.payload.db.drizzle`, despite the shared adapter boundary in `txDb`. The appropriate proposed layer is the existing pool-handle/result-normalization owner (`poolDb`/`rowsOf`), not transaction-aware `txDb`. A move must preserve deliberately independent budget consumption, one atomic fixed-window UPSERT, existing errors and retry calculations, per-key namespacing, and all HTTP-vs-hook response policy. This is a maintainability candidate, not a claim of a currently failing supported driver.

Rejected moves:
- Keep `readBundle` as the caller-access proof; moving `overrideAccess:false` plus null-on-403/404 decisions into pages/endpoints would repeat the policy and could hide operational failures.
- Keep `resolveVersionReferences`' batched, viewer-scoped resolution shared by Messages/Discussions; do not resolve missing saved versions through Official.
- Keep public content `resolvePublicPlanBySlug` as a narrow pointer-only resolver, rather than relaxing general collection read access. Feature-off/private/no-pointer remain misses and general authenticated version semantics remain independent.
- Do not merge public-library product enablement with public-posture boot/cookie policy. The SPEC expressly permits an authenticated public host without a public library.
- Keep `versionActions` alongside the shared saved-version projection, rather than moving permission decisions to either Manage list; preserve unknown vs absent Official and author-aware server decisions.
- Do not merge school-name validation with its persisted read/write wrappers. Client-safe parser, shared cached settings read and operator transaction are distinct boundaries with real consumers.
- Login admission and conversion concurrency have distinct identity/global budgets and error policies; resemblance does not warrant a generalized semaphore abstraction.

Full source files: all 30 files in lib-02 (2,343 lines), specifically `initials.ts`, `lessonAnchors.ts`, `lessonDetails.ts`, `lessonReference.ts`, `loginProtection.ts`, `messageText.ts`, `offlineAdminRecovery.ts`, `personalFavorites.ts`, `personalVersions.ts`, `planSelection.ts`, `plural.ts`, `proseLinkTokens.ts`, `publicLibrary.ts`, `publicPlan.ts`, `publicPosture.ts`, `publicSlug.ts`, `rateLimit.ts`, `readBundle.ts`, `relId.ts`, `renderTimings.ts`, `requestedVersion.ts`, `resolveLessonReferences.ts`, `sanitizeHtml.ts`, `schoolMetadata.ts`, `schoolName.ts`, `serverActionBodyLimit.ts`, `session.ts`, `setSchoolName.ts`, `stripIds.ts`, `substrand.ts`, all under `app/src/lib/`.

Partial/dependency coverage: reference search across production source and app CLIs for the packet's data/auth/recovery/public helpers; full `tests/int/rateLimit.int.spec.ts` and `tests/unit/personalVersions.spec.ts`; `tests/unit/publicLibrary.spec.ts:1-approximately45` (tool truncation); `txDb.ts` from its transaction-resolution documentation through EOF (its first declarations remain to be read in lib-03). No exhaustive test-coverage claim.

Remaining: lib-03, lib-combine-01, lib-editRecovery-01, lib-identity-01; finalize rateLimit ownership candidate after full txDb and relevant callers; cross-check release suggestions in recovery/combine packets.

## lib-03 — complete

Finding A01 (moderate maintainability, combined lib-02/lib-03): finish routing pool adapter access through the established shared owner.
- Existing feature-layer reach: `rateLimit.ts:194-195,218,235` repeats a private adapter/result shape; `versionCounts.ts:12-15` repeats the adapter cast. Neither feature owns Payload's adapter layout. Existing shared owner: `txDb.ts` explicitly owns adapter access and driver shapes via `poolDb` (line 91) and `rowsOf` (line 253); `assignmentCounts.ts:58` and Discussions unread aggregates already use it.
- Proposed layer: keep the fixed-window UPSERT and version-count SQL in their domain modules; obtain the deliberately pooled handle through `poolDb`, and use the shared result-shape normalizer where necessary. Avoid `txDb(req)`: a limiter hit intentionally commits independently even if its caller later rolls back. If broadening `poolDb`'s current read-only documentation for the rate-limit writer is undesirable, adopt it for `versionCounts` first and treat rate-limit reuse as a separate decision.
- Why useful: the shared module's stated upgrade seam is currently bypassed by two feature modules, while one nearby aggregate already follows it. The local cast defeats type checking, leaving an adapter layout change with multiple runtime failure sites. This is an ownership inconsistency, not a demonstrated current Node/Postgres failure.
- Callers/invariants: catalogue calls `versionCountsByPlan` only after auth; preserve that boundary and returned numeric-ID map, SQL projection and errors. Auth/discussion/message hooks and endpoint wrappers consume rate limits; retain standalone pool connection, count-on-attempt, fixed windows, key namespaces, 401/429/Retry-After behavior, fail-on-DB-error and caller-specific skip/throw policies. Existing real-DB rateLimit integration and versionCounts unit tests are representative verification starting points; add a rollback-independence check if changing limiter connection plumbing.

Other decisions/rejections:
- `txDb` owns the adapter, closed table union and lock-order/freshness primitives coherently; leave feature decisions and user-facing stale text with callers.
- Keep per-request/per-render settings memoization in `systemFlags`, not a process/global cache. Projections share one stored settings read while retaining fail-closed booleans and nullable validated school name.
- Keep system operational facts separate from operator-written settings. The facts reuse the generator/cache owners' configured address, limits and entry predicate; moving probes or presentation copy into those owners adds coupling without removing repeated decisions.
- Do not sweep stable unrelated wire-error consumers solely because `wireErrorMessage` exists; its documented incremental adoption is sound.

Full source files: all 11 lib-03 files (1,116 lines): `systemFacts.ts`, `systemFlagNames.ts`, `systemFlags.ts`, `txDb.ts`, `userSearchContract.ts`, `versionContent.ts`, `versionCounts.ts`, `versionsOrder.ts`, `welcomeDismissal.ts`, `widgetUser.ts`, `wireError.ts`, all under `app/src/lib/`. txDb first declarations now fully read; remaining body was fully visible in the preceding dependency read.

Partial/dependencies: reference searches for pooled adapter/normalizer/lock/settings/count consumers; `tests/unit/systemFlags.spec.ts:1-85`, full `tests/unit/versionCounts.spec.ts`, `tests/unit/lockOrder.spec.ts:1-75`. No code execution.

Remaining: lib-combine-01, lib-editRecovery-01, lib-identity-01; recovery/combine cross-packet release-suggestion comparison and final source/read-only-state verification.

## lib-combine-01 — complete

No standalone Combine refactor recommended. The engine is a pure planner, paragraph merge owns its bounded work accounting, correspondence owns matching policy, and the caller-access ancestor lookup is separate from pure lineage arithmetic/backfill. Existing invariants: no save inside Combine; one protected-field starting parent; conservative two-way fallback on missing/capped/unmatched ancestry; unique unchanged row correspondence; aggregate work budgets; both-parent lineage retained independently of relationships. The hook `stampVersionLineage` living alongside the shared lineage definition is not itself a sufficient reason to split a 44-line module.

Candidate A02, pending recovery consumer verification: shared prose vocabulary (`hooks/fieldSplit.ts:108-178`, including container whitelists and `PROSE_LABELS`) is now imported by pure Combine (`combine/engine.ts:30-39`) and recovery projection. The hook module value-imports Payload `Forbidden`, RBAC helpers and ingest utility code; the shared vocabulary's proposed owner is an import-free lib contract, consumed by the hook and both algorithms. Existing `frameworkProse.ts` and other client-safe contract modules establish this direction. Keep arrays/labels byte-for-byte unchanged and keep hook enforcement, META identity policy and protected-field semantics in the hook. This is an import-direction/ownership candidate, not a claim the current production bundle executes unused hook code. Final assessment follows the recovery packet.

Rejected moves: no new generic merge framework; do not merge rendered HTML comparison with prose Combine; do not reuse permissive row/shape utilities to weaken correspondence; do not replace bounded lineage with unbounded graph traversal; do not move hook enforcement into the pure engine or certify submitted Combine content at save time (SPEC deliberately treats it as ordinary save-as-new).

Full packet files: `app/src/lib/combine/ancestry.ts`, `backfill.ts`, `correspondence.ts`, `diff3.ts`, `draft.ts`, `engine.ts`, `lineage.ts`, `outcome.ts` (716 lines).
Partial/dependencies: `hooks/fieldSplit.ts:1-200`; Combine endpoint fully read; `components/CombineVersions/applyOverlay.ts` fully read; representative `tests/unit/combineFields.spec.ts` full, `combineEngine.spec.ts:1-105`, `proseWhitelistDrift.spec.ts:1-115`. Consumer reference search for lineage stamping, Combine planning/ancestry/context/outcome and fieldSplit imports. Existing SPEC §6 Combine requirements previously read in full relevant section.

Remaining: lib-editRecovery-01, lib-identity-01; finalize A02 and release-suggestion comparison; final read-only verification and concise report.

## lib-editRecovery-01 — complete

Finding A02 confirmed (moderate maintainability): put shared prose vocabulary below the hook boundary.
- Existing owner/layer: `hooks/fieldSplit.ts:114-178` holds the container whitelists and authored prose labels; that module also value-imports Payload `Forbidden`, access helpers and ingest shape helpers (`:23-31`) and implements save authorization/enforcement. Shared consumers: pure Combine `lib/combine/engine.ts:30-39`; browser-safe `lib/editRecovery/projection.ts:48-56`; browser restore grouping `components/EditRecovery/restoreGroups.ts:13`. The latter two are imported by live LessonControls/CombineVersions/EditRecovery components, not merely tests.
- Proposed owner/layer: an import-free shared prose contract under lib (for example `lib/proseFields.ts`), like the already-established `frameworkProse`, `systemFlagNames` and `schoolName` leaf modules. Move only unchanged field lists and labels; hook, capture projection, Combine and restore grouping import it. Hook re-exports may preserve existing server/test imports during the surgical move. Do not derive lists from native Payload field definitions: that would pull the server model/access layer back into clients.
- Why useful: the same domain field vocabulary now drives four consumers across server/client/pure-code layers, but those consumers depend on a server hook to obtain it. It is an import-direction problem and a future-change hazard, not a file-size complaint or proven shipped bundle bug. The hook remains the enforcement owner; shared vocabulary need not import enforcement.
- Invariants: exact prose membership, Summary Table title excluded, native field drift checks, all authored labels, null/undefined/empty-string handling, storage normalization, structural preservation, administrator/system/META policy, no new capture field or permission, schema version unchanged for a semantics-preserving move. Preserve existing purity/negative/symmetry tests plus whitelist-to-native-field and label drift tests; wire behavior must remain unchanged.

A01 refinement after semantic check: `rowsOf` is NOT a blind drop-in for `rateLimit.take`. A malformed result with no `rows` currently throws; `rowsOf` defaults missing results to [], and the limiter's default count is zero, which would turn that error into admission. Scope the safe candidate to centralizing the pool handle first; retain result-shape error semantics, or separately validate the accepted result domain before shared normalization. Driver array support would be an explicit behavior change, not part of a cosmetic cleanup.

Rejected moves:
- Keep storage caps, mandatory capture projection and retirement transitions in `kernel.ts`; endpoint-only enforcement would make them bypassable by jobs/other callers. No split merely for 706 lines.
- Keep `retire` shared by save/discard/admin/expiry, with its command union and transaction requirement selected internally. A generic CRUD repository would obscure the CAS/generation/cutoff predicates.
- Keep pure projection/key decoding/anchors/overlay/diff together: their agreement prevents missing clear-field changes and invented orphan attribution. A generic document walker would obscure the intentionally asymmetric copy-out vs write behavior.
- Keep recovery/source suggestion and lesson-page Official suggestion separate. `findDraftCombineSuggestion` prefers a readable newer shared-history release, otherwise only descendants; `newerReleaseSuggestion` concerns the caller's latest save versus the current ARES Official. They answer different questions and use different proofs. Reuse of numeric semver ordering and ingest's release predicate is already present.
- Keep `captureProvenance` and TTL in import-free modules shared with presentation; do not import persistence kernel for those values. Kernel key/token parsing and capture provenance do not need a generic date abstraction solely because both handle Dates.

Full packet source: `app/src/lib/editRecovery/draftCombineSuggestion.ts`, `kernel.ts` (all 706 lines), `projection.ts` (all 488 lines), `provenance.ts`, `ttl.ts`, `unsavedWork.ts` (1,405 total lines).
Partial/dependencies: `endpoints/recovery.ts:1-170`; full `components/EditRecovery/restoreGroups.ts`; full `tests/unit/draftCombineSuggestion.spec.ts`; `tests/unit/editRecoveryProjection.spec.ts:1-75`; reference search for recovery kernel/projection/provenance/TTL/suggestion and direct fieldSplit imports across server/browser consumers. Earlier pilot SPEC §5 recovery requirements supply contract context; exhaustive tests remain out of scope.

Remaining: lib-identity-01, final checkpoint correction/verification, concise final report. No repositories mutated.

## lib-identity-01 — complete

Findings: none.
- Keep the frozen `ares-content-v1` normalization/serialization self-contained (`releaseFingerprint.ts:29-97`), even where `versionContent`, `canonicalJson` or `stripIds` look reusable. Stable cross-school identity is a versioned format; live comparison/copy rules intentionally may evolve. A refactor through those owners would silently couple incompatible lifecycles.
- Keep UUID generation/immutability/reset enforcement in native field hooks (`fields/identity.ts`), while `installationId.ts` remains the trusted operator/read façade. Do not move reset authority into generic settings Save; restore versus cloned-school identity has an explicit operator workflow.
- Keep `readInstallationId`'s nullable/never-throw Manage fact behavior distinct from backup destination identity gates. Sharing that permissive display read with operational writes would conflate evidence with authority.

Full packet source: `app/src/lib/identity/installationId.ts`, `app/src/lib/identity/releaseFingerprint.ts` (147 lines).
Full dependencies: `app/src/fields/identity.ts`, `app/scripts/reset-installation-id.ts`.
Partial/context: `tests/unit/releaseFingerprint.spec.ts:1-110`; production reference search for identity reads/reset/hash; SPEC worldwide-identity rules (`SPEC.md:122-137`). Previously read ingest context/fingerprint callers during P01.

## Final state

All six assigned packets are fully read: 87 source files, 8,122 packet lines. Exactly two maintainability ownership candidates (A01 explicit pool adapter seam, A02 shared prose vocabulary beneath server hook). No other moves recommended; no correctness/security defect asserted for supported production behavior.

No remaining assigned source reads. Dependencies above are explicitly partial unless marked full; exhaustive test review, live execution, implementation, independent challenge and CI belong to later phases. Final `git status --short` at the immutable checkout is empty; HEAD remains `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`. No repository or fix-worktree mutations, pushes, PRs, merges, live access or tests performed for this review. Only this checkpoint file was written.

Final decision-context follow-up: read DECISIONS.md:8212-8270 (recovery design and use of the already-existing deep whitelists); partially read 5355-5408 (capture diff/apply ownership corrections) and 4890-4925 (structural controls rejected by Forbidden, not silently discarded). These support preserving deep whitelist membership and shared apply semantics; none requires the shared vocabulary to stay physically inside the server hook.
