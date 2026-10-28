# Test simplicity review — packet tests-unit-05

Baseline: immutable v1.10 `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91` in `/home/james/Documents/Codex/2026-10-26/ares-v110-review`. Review scope is test-code simplicity only; no tests run, no edits made, no other reviewer reports read.

## Packet result

No concrete behavior-preserving simplification candidate found. The test helpers and repeated assertions I examined have clear local purpose; collapsing them would obscure distinct boundary conditions or concurrency/state assertions, with no demonstrated maintenance gain.

Rejected reductions:
- `ingestSubjectGradeLock.spec.ts`: keep the hand-built tx/session vs global-pool payload and ordered/deduplicated SQL checks. They express lock ownership, ordering, and refusal without a real DB; making a generalized mock factory would hide the wiring under review.
- `lessonControlsSave.spec.tsx`, `lessonControlsMountGuard.spec.tsx`, and `lessonControlsVersionIdentity.spec.tsx`: retain deferred promises, pointer probes, viewport setup, and independently named outcomes. The different cases cover stale/interleaved state, API call ordering, and destructive confirmation labels; apparent setup repetition is the explicit harness context, not an abstraction opportunity.
- `lessonControlsSsr.spec.tsx`: retain string-render assertions, including class/label/access distinctions; DOM mount helpers cannot replace the SSR/hydration-specific contract.
- `lessonReleases.spec.ts`: retain table cases and per-decision token mutations; each input captures a distinct release-identity dimension.
- `libraryFilters.spec.tsx`: retain history/popstate and pending URL-write coverage; this exercises state synchronization beyond filter rendering.
- `insertLink.spec.ts`: retain independent URL validation, cursor/separator, label validation and field-wiring cases; combining them would make failures less diagnostic.

## Read coverage

Fully read all 22 source files in this packet:
`app/tests/unit/htmlSectionsCache.spec.ts`, `idleLogoutScreenClear.spec.tsx`, `importLessons.spec.ts`, `ingestContract.spec.ts`, `ingestSubjectGradeLock.spec.ts`, `ingestTaxonomy.spec.ts`, `initialEditorCollapse.spec.ts`, `initials.spec.ts`, `insertLink.spec.ts`, `jsonBodyCeiling.spec.ts`, `keepForLater.spec.tsx`, `lessonAnchors.spec.ts`, `lessonControlsDrafts.spec.tsx`, `lessonControlsMountGuard.spec.tsx`, `lessonControlsSave.spec.tsx`, `lessonControlsSsr.spec.tsx`, `lessonControlsVersionIdentity.spec.tsx`, `lessonDetails.spec.ts`, `lessonImportVersion.spec.ts`, `lessonReference.spec.tsx`, `lessonReleases.spec.ts`, `libraryFilters.spec.tsx`.

Some initial files were initially visible only in combined/truncated output and were re-read individually/as a smaller group to establish full coverage. No implementation/context files were read for this packet. No partial files remain.

## Resume point

Next packet is `tests-unit-06`. Read its manifest file list, then fully read each listed test; checkpoint this report after that packet.

# Test simplicity review — packet tests-unit-06

## Packet result

No concrete behavior-preserving simplification candidate found. Existing helpers and repeated setup express specific contracts and keep cases independently diagnosable; a shared abstraction would mostly move/hide the case distinction.

Rejected reductions:
- `lockOrder.spec.ts`: retain the TypeScript-AST scan and per-handler buckets. The scope logic exists to prevent a lock call in one handler falsely covering another and pins an ordering property the integration path cannot observe.
- `modalChrome.spec.tsx`: retain the selector/rule parsing and the two-ended class wiring assertion. It guards a CSS cascade contract that prior regex/call-site checks missed; it is not merely parser scaffolding.
- `navigationFreshness.spec.tsx`: retain separate unreadable-status, thrown request, stalled fetch/body, canceled navigation, Navigation API traversal, and capture-phase popstate cases. These distinguish materially different event orderings and stale-control states.
- `panelState.spec.ts`: retain the numerous initial-open and URL cases. They encode role-specific defaults, retired bookmark aliases, access filtering, and one-shot `at` semantics that cannot be collapsed safely as a simple parameter table.
- `payloadUiPatchBehaviour.spec.tsx`: retain tests against patched/original/prototype variants and render-to-commit forcing. The harness is intentionally detailed to expose stale selections and compares settled output, not just render counts.
- `payloadUiPatchScript.spec.ts`: retain fixture refusal paths and installed-bundle verification; each guards a different postinstall drift condition.
- `officialPointerPartialUpdate.spec.ts`: retain the explicit null/system-clear and authenticated-clear cases; they encode different actor and lookup semantics.
- `loginProtection.spec.ts` and `loginClient.spec.ts`: retain independent network/proxy parsing, per-client vs aggregate capacity, error-release and multi-module state checks.
- The one-case `it.each` in `messageContextLink.spec.ts` was considered but is not a worthwhile cleanup: it keeps the case consistently labeled, and removing it saves negligible maintenance while changing no meaningful abstraction boundary.

## Read coverage

Fully read all 28 packet files:
`app/tests/unit/linkedTextareaLibrary.spec.tsx`, `localDbGuard.spec.ts`, `lockOrder.spec.ts`, `loginClient.spec.ts`, `loginPasswordWork.spec.ts`, `loginProtection.spec.ts`, `markReadBody.spec.ts`, `messageContextLink.spec.ts`, `metaIdentitySplit.spec.ts`, `modalChrome.spec.tsx`, `moreMenu.spec.tsx`, `mutationAuthority.spec.ts`, `navigationFreshness.spec.tsx`, `officialPointerPartialUpdate.spec.ts`, `officialPreviewList.spec.tsx`, `officialUpdateNotice.spec.tsx`, `offlineAdminRecovery.spec.ts`, `pageBackLink.spec.tsx`, `panelState.spec.ts`, `parsePreviewCandidate.spec.ts`, `payloadUiPatchBehaviour.spec.tsx`, `payloadUiPatchScript.spec.ts`, `personalFavorites.spec.ts`, `personalVersions.spec.ts`, `phaseSelectField.spec.tsx`, `planDetailsPanel.spec.ts`, `planSelection.spec.ts`, `planSubjectGradeImmutable.spec.ts`.

No implementation/context files were read for this packet. No tests were run. No partial files remain.

## Resume point

Next packet is `tests-unit-07`. Read its manifest file list and fully read each listed test; checkpoint this report after that packet.

# Test simplicity review — packet tests-unit-07

## Packet result

No concrete behavior-preserving simplification candidate found. The apparent duplication separates distinct input, actor, or rendering states. Removing one-case fixtures or sharing them would not yield meaningful maintenance savings.

Rejected reductions:
- `rolesAccessPanel.spec.tsx`: retain the shared roster/ID fixture, `expandGroups`, and both handover/full-admin views. The helper represents the panel's roster contract, and the paired view proves the picker exclusion is specific to handover. The long case coverage protects name/email identity, accessible labels, plural incumbents, and conditional consequences.
- `restoreDiff.spec.ts`, `restorePromptGroups.spec.ts`, and `restorePromptRender.spec.tsx`: keep the engine, grouping, and rendered-contract layers separate. They cover HTML escaping, invisible paragraph/spacing changes, clear-vs-empty distinctions, orphan rows, and copy-safe read-only prose; merging those tests would obscure independent invariants.
- `resourceLinks.spec.ts` and `resourceRowDrift.spec.ts`: retain conversion, Payload empty-group, round-trip, and schema-key contracts; repeated record setup is explicit test data for materially different absent/partial/populated forms.
- `resetLinkNotLogged.spec.ts`: retain AST scans rather than replacing them with runtime checks; the negative “this endpoint logs nowhere” and token interpolation constraints are source-level properties.
- `publicSlug.spec.ts`: retain ordering, accent, and numeric-slug cases; each captures distinct persistent URL behavior.
- Considered the `groupsOf.length === 3` assertion in `restorePromptGroups.spec.ts`: it pins a required third API argument, not an accidental rendering detail, and prevents restoring optional semantics. Keep it.
- Considered repeated row-label cases in `rowLabel.spec.ts` / `rowLabelLive.spec.tsx`; one covers pure formatting and the other live form-state preference after reordering, so they are not duplicates.

## Read coverage

Fully read all 27 packet files:
`app/tests/unit/proseLinks.spec.ts`, `proseWhitelistDrift.spec.ts`, `publicLibrary.spec.ts`, `publicPosture.spec.ts`, `publicSlug.spec.ts`, `readBundleVisibility.spec.ts`, `readFeaturesSettings.spec.ts`, `recoveryCombineBoundary.spec.ts`, `recoveryParse.spec.ts`, `refreshCaller.spec.ts`, `relId.spec.ts`, `releaseAncestry.spec.ts`, `releaseFingerprint.spec.ts`, `releaseFingerprintContext.spec.ts`, `releaseMessages.spec.ts`, `requestedVersion.spec.ts`, `resetLinkNotLogged.spec.ts`, `resourceLibrary.spec.ts`, `resourceLinks.spec.ts`, `resourceRowDrift.spec.ts`, `restoreDiff.spec.ts`, `restorePromptGroups.spec.ts`, `restorePromptRender.spec.tsx`, `retargetFavoritesTxn.spec.ts`, `rolesAccessPanel.spec.tsx`, `rowLabel.spec.ts`, `rowLabelLive.spec.tsx`.

No implementation/context files were read for this packet. Some combined output was truncated; `restorePromptGroups.spec.ts`, `restorePromptRender.spec.tsx`, `rolesAccessPanel.spec.tsx`, `restoreDiff.spec.ts`, and both row-label specs were individually reread to confirm full coverage. No partial files remain. No tests run.

## Resume point

Next packet is `tests-unit-08`. Read its manifest file list and fully read each listed test; checkpoint this report after that packet.

# Test simplicity review — packet tests-unit-08

## Packet result

No concrete behavior-preserving simplification candidate found. The larger fixtures/helpers have useful responsibilities and are reused across distinct failure shapes; reducing the test surface would erase distinctions or weaken coverage.

Rejected reductions:
- `subjectAdminDemoteLock.spec.ts`: retain the lock-event harness and per-page scan data. It asserts tx-bound lock ordering, skip behavior, and pagination; this is the test seam for a race structural property.
- `systemFacts.spec.ts`, `systemFlags.spec.ts`, `systemSettingsFlags.spec.ts`, and `systemFeaturesState.spec.ts`: retain distinction between unavailable/error, absent/off, and persisted/pending state. Their closed vocabulary and separate tests guard drift/provenance and UI freshness.
- `testSignupLimitConfig.spec.ts`: retain file/config scans plus real limiter primitive cases. It protects test-vs-shared-database config boundaries as well as production defaults.
- `uploadFiles.spec.ts`: retain ZIP binary builders (`manyEntries`, ZIP64 conversion, prepend/forgery) and parse-before-count assertions. They intentionally construct hostile but parser-meaningful archives; a simpler mock would bypass the behavior being tested.
- `uploadBundles.spec.tsx`: retain separate picker open/cancel vs change/drag paths, result reset, taxonomy approval, official preview token, and partial failure/report states. These are intentionally different client transitions.
- `sectionKeyForFocus.spec.ts`: retain DOM-shaped Payload fixtures and helper builder; selector and nested-row cases distinguish generated lesson IDs from nested array IDs.
- `systemFacts.spec.ts` already centralizes default environment/fetch setup through a factory; no additional per-test factoring would improve clarity.

## Read coverage

Fully read all 24 packet files:
`app/tests/unit/sanitizeHtml.spec.ts`, `schoolName.spec.tsx`, `sectionKeyForFocus.spec.ts`, `semverConflict.spec.ts`, `serverActionBodyLimit.spec.ts`, `shareMenuAdvanced.spec.tsx`, `signupForm.spec.tsx`, `signupTrustClassifier.spec.ts`, `stripCollapsed.spec.ts`, `structuralControlsCss.spec.ts`, `subjectAdminDemoteLock.spec.ts`, `subjectGradeDelete.spec.ts`, `subjectSelectOptions.spec.ts`, `substrand.spec.ts`, `systemFacts.spec.ts`, `systemFeaturesPanel.spec.tsx`, `systemFeaturesState.spec.ts`, `systemFlags.spec.ts`, `systemSettingsFlags.spec.ts`, `systemSettingsSave.spec.ts`, `testSignupLimitConfig.spec.ts`, `unsavedWarning.spec.ts`, `uploadBundles.spec.tsx`, `uploadFiles.spec.ts`.

No implementation/context files were read for this packet. No tests were run. No partial files remain.

## Resume point

Next packet is `tests-unit-09`. Read its manifest file list and fully read each listed test; checkpoint this report after that packet.

# Test simplicity review — packet tests-unit-09

## Candidate

- `[app/tests/unit/useEditRecovery.spec.tsx:392]` (`intoBackoff`) and `[app/tests/unit/useEditRecovery.spec.tsx:465]` (`intoBackoffThen`): these local helpers contain the same handler setup (first recovery capture returns 429/Retry-After 60, subsequent capture succeeds), then create a harness, wait for entry resolution, advance one debounce, and assert one capture. The only difference is local name and surrounding describe. This duplicates the central setup for the retry tests and can drift so two tests no longer start from the same backoff state. Smallest change: lift one `intoBackoff` helper to module scope and call it from both describe blocks. Preserve each caller's own retry/unmount/leave-mode assertions and keep the server refusal semantics unchanged. No execution performed; verification should be the existing backoff tests when implementation work is authorized.

## Packet result and rejected reductions

No other concrete behavior-preserving simplification candidate found. In particular, do not shorten the 1,500-line `useEditRecovery.spec.tsx` by combining its race cases: it pins separate debounce, transaction-token, entry-gate, abort/deadline, stale-session, 429, and safety-probe invariants. `useOpenPanels.spec.tsx` similarly needs both a macrotask flush for the stale URL negative and a microtask-only assertion for same-task canonicalization. `vendorProvenance.spec.ts` duplicates the vendored source's table parsing facts on purpose to enforce byte and generator fidelity. The version wiring specs separate immutable access, lifecycle hook and system-only provenance axes.

## Read coverage

Fully read all 11 packet files:
`app/tests/unit/useEditRecovery.spec.tsx` (all 1,503 lines, read in ranges 1–500, 501–1,000, and 1,001–1,550), `useOpenPanels.spec.tsx`, `userSearchWiring.spec.ts`, `userTypeLabel.spec.ts`, `usersPanelPaging.spec.tsx`, `vendorProvenance.spec.ts`, `verifiedFieldWiring.spec.ts`, `versionCounts.spec.ts`, `versionImmutabilityWiring.spec.ts`, `versionTimestampsTz.spec.tsx`, `versionsOrder.spec.ts`.

No implementation/context files were read for this packet. No tests were run. No partial files remain.

## Completion

All five assigned packets `tests-unit-05` through `tests-unit-09` are complete. Worktree and git state were not changed. This completes this assignment; no unfinished packet remains.
