# Test-code simplicity review checkpoint

Baseline: v1.10 `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`; read-only review. This report is my own work only.

## tests-unit-01 — complete

**Finding:** No behavior-preserving simplification with a concrete maintenance benefit identified in this packet. The apparent repetition I inspected expresses meaningful boundaries: role/scope matrices; distinct cache best-effort vs cleanup behavior; backup records by destination, legacy layout, malformed evidence, restore journal, and read bounds; component/class/cascade regressions; and capture preview/apply asymmetry. Removing or merging these tests would reduce clarity or erase distinct cases.

**Fully read (all source):**
- `app/tests/unit/accessScopes.spec.ts`
- `app/tests/unit/accordionPanelCount.spec.tsx`
- `app/tests/unit/accountDisabledContract.spec.ts`
- `app/tests/unit/accountDisabledWiring.spec.ts`
- `app/tests/unit/adminResetLinkAllowance.spec.ts`
- `app/tests/unit/advancedTools.spec.ts`
- `app/tests/unit/appVersion.spec.ts`
- `app/tests/unit/aresAddress.spec.ts`
- `app/tests/unit/aresReleasePresentation.spec.ts`
- `app/tests/unit/artifactCacheBestEffort.spec.ts`
- `app/tests/unit/artifactCacheCleanup.spec.ts`
- `app/tests/unit/authFavoritesWiring.spec.ts`
- `app/tests/unit/authFormMessages.spec.ts`
- `app/tests/unit/backupStatus.spec.ts`
- `app/tests/unit/backupStatusPanel.spec.tsx`
- `app/tests/unit/backupStatusPathParity.spec.ts`
- `app/tests/unit/browserFindings.spec.tsx`
- `app/tests/unit/buttonSystem.spec.ts`
- `app/tests/unit/canDeleteVersionDoc.spec.ts`
- `app/tests/unit/candidateListActions.spec.tsx`
- `app/tests/unit/canonicalJson.spec.ts`
- `app/tests/unit/captureDiffAgreement.spec.ts`
- `app/tests/unit/classNameStyles.spec.ts`
- `app/tests/unit/clockCheck.spec.tsx`

**Context reads:** None required beyond the source/tests in scope. No runtime implementation or live tests were read/run for this packet.

**Rejected reductions:** `backupStatusPathParity.spec.ts`'s text extraction and explicit failures are deliberate cross-file contract checks that avoid widening a module API. `buttonSystem.spec.ts`'s PostCSS traversal/source-order/reachability helpers serve different assertions and document real cascade failure modes. `captureDiffAgreement.spec.ts` intentionally asserts both preview/apply agreement and documented asymmetries; apparent duplicate setup spans distinct null/empty/orphan/schema-drift cases. Kept the backup tests that look similar where outcome/destination or record-generation rules differ.

**Remaining:** `tests-unit-02`, `tests-unit-03`, `tests-unit-04`, `tests-helpers-01`, `tests-fixtures-01`, `tests-style-snapshot-01`. Resume at `tests-unit-02` from packet manifest.

## tests-unit-02 — complete

**Finding:** No test-only simplification with concrete maintenance benefit identified. Test fixtures and cases that repeat shapes preserve important distinct outcomes: UI entry rules versus field-tree drift, combine conflicts/ancestry/resource cases, asymmetric compare outputs and ordinal limitations, composer uncertain-result retries, forum moderator/reader distinctions and page-boundary/read marking, and endpoint transactional permission rechecks.

**Fully read (all source):**
- `app/tests/unit/clockSkew.spec.ts`
- `app/tests/unit/collapseOnEntry.spec.tsx`
- `app/tests/unit/collapsedPanelEntryRule.spec.ts`
- `app/tests/unit/combineDraft.spec.ts`
- `app/tests/unit/combineEngine.spec.ts`
- `app/tests/unit/combineFields.spec.ts`
- `app/tests/unit/combineLineage.spec.ts`
- `app/tests/unit/combineOutcome.spec.ts`
- `app/tests/unit/combineRetry.spec.tsx`
- `app/tests/unit/combineUnavailable.spec.ts`
- `app/tests/unit/combineVersionChoices.spec.tsx`
- `app/tests/unit/compareDiffGroups.spec.ts`
- `app/tests/unit/compareFilterDefault.spec.tsx`
- `app/tests/unit/compareGroups.spec.ts`
- `app/tests/unit/corpusCheck.spec.ts`
- `app/tests/unit/currentSection.spec.ts`
- `app/tests/unit/deliverables.spec.ts`
- `app/tests/unit/discussionComposer.spec.ts`
- `app/tests/unit/discussionModerationControls.spec.tsx`
- `app/tests/unit/discussionModerationPages.spec.tsx`
- `app/tests/unit/discussionPages.spec.ts`
- `app/tests/unit/discussionPaging.spec.ts`
- `app/tests/unit/discussionReferenceSelection.spec.tsx`
- `app/tests/unit/discussionText.spec.ts`
- `app/tests/unit/discussionThreadDelete.spec.ts`

**Context reads:** Imports and APIs were read as context where necessary to understand what test assertions distinguish, but no separate implementation files were fully read. No tests executed.

**Rejected reductions:** Keep the repeated source-denial cases in `combineUnavailable.spec.ts`: combine vs ordinary save and initial vs locked re-read preserve different transaction/access boundaries. Keep both collapsed panel runtime and collection-field-tree discovery tests: one exercises the rule, the other prevents future panels/arrays escaping it. Compare splitter fixture and real-generator drift guard cover different surfaces. `discussionComposer` status/key cases preserve uncertain vs refusal semantics; moderation controls and pages separately pin component interactions and page role/gate behavior. No reduction warranted based on visual repetition alone.

**Remaining:** `tests-unit-03`, `tests-unit-04`, `tests-helpers-01`, `tests-fixtures-01`, `tests-style-snapshot-01`. Resume at `tests-unit-03`.

## tests-unit-03 — complete

**Finding:** No test-only simplification with a concrete maintenance benefit identified. The lengthy capture projection fixture and assertions intentionally check sparse/null-preserving projection, role-owned fields, unknown rows, round-trips, key parsing, text normalization, and anchor order. `envTemplateParity.spec.ts` has an elaborate AST walk, but it exists to close documented blind spots in successive grep/regex approaches and its explicit unsupported-use reporting is the core guarantee, not incidental abstraction. Other apparent repeats cover separate protocol outcomes, empty-array sentinel versus malformed values, or contextual UI behavior.

**Fully read (all source):**
- `app/tests/unit/discussions.spec.ts`
- `app/tests/unit/displayNameForm.spec.tsx`
- `app/tests/unit/displayTitle.spec.ts`
- `app/tests/unit/draftCombineSuggestion.spec.ts`
- `app/tests/unit/editJumpNav.spec.tsx`
- `app/tests/unit/editRecoveryIndicator.spec.tsx`
- `app/tests/unit/editRecoveryMigrationOrder.spec.ts`
- `app/tests/unit/editRecoveryProjection.spec.ts`
- `app/tests/unit/editRecoveryProtocol.spec.ts`
- `app/tests/unit/editRecoveryTtlProvenance.spec.ts`
- `app/tests/unit/editingViewport.spec.ts`
- `app/tests/unit/editorPlainLanguage.spec.ts`
- `app/tests/unit/editorValidation.spec.ts`
- `app/tests/unit/emailAddress.spec.ts`
- `app/tests/unit/emailFormat.spec.tsx`
- `app/tests/unit/emptyArraySerialization.spec.ts`
- `app/tests/unit/enforceAssignmentScope.spec.ts`
- `app/tests/unit/enqueueDetached.spec.ts`
- `app/tests/unit/entryPhase.spec.ts`
- `app/tests/unit/envTemplateParity.spec.ts`
- `app/tests/unit/errorTracking.spec.ts`
- `app/tests/unit/expireEditRecoveryTask.spec.ts`
- `app/tests/unit/exportArtifacts.spec.ts`

**Context reads:** Imports and tested API shapes were checked for test intent; no standalone implementation file was fully read. No tests executed.

**Rejected reductions:** Do not collapse `editRecoveryProjection` identity/round-trip checks: the former catches skipped-key bookkeeping and the latter content loss. Its per-scope positive and negative checks cover distinct record containers and field ownership. Keep the explicit source-parsing cases in env parity; optimizing or replacing AST with text filtering undermines the checker’s fail-closed property. Keep separate admin/teacher role cases and 0/null/malformed array submissions in assignment/serialization tests. No convenient shared helper would improve these tests enough to justify hiding the scenario.

**Remaining:** `tests-unit-04`, `tests-helpers-01`, `tests-fixtures-01`, `tests-style-snapshot-01`. Resume at `tests-unit-04`.

## tests-unit-04 — complete

**Finding:** No test-only simplification with concrete maintenance benefit identified. The repeated generator probes deliberately exercise different fields/output surfaces against the byte-pristine generator; empty-array fixtures protect both normalization and the unchanged rejection boundary; visual-source tests record distinct compiled selector, breakpoint, specificity, and DOM-shape invariants. Collapsing these would obscure which behavior failed or reduce field/role/output coverage.

**Fully read (all source):**
- `app/tests/unit/exportClient.spec.ts`
- `app/tests/unit/exportJobDedupe.spec.ts`
- `app/tests/unit/exportKind.spec.ts`
- `app/tests/unit/extract.spec.ts`
- `app/tests/unit/favoriteToggle.spec.tsx`
- `app/tests/unit/fieldSplitContainers.spec.ts`
- `app/tests/unit/filterRows.spec.ts`
- `app/tests/unit/firstUserBootstrap.spec.ts`
- `app/tests/unit/firstUserRoleLock.spec.ts`
- `app/tests/unit/firstUserVerificationEmail.spec.ts`
- `app/tests/unit/forgotPasswordFailure.spec.tsx`
- `app/tests/unit/generatedSurfaces.spec.ts`
- `app/tests/unit/generatorGrade.spec.ts`
- `app/tests/unit/generatorUpgrade.spec.ts`
- `app/tests/unit/guideAccess.spec.tsx`
- `app/tests/unit/guideCompareVisual.spec.tsx`
- `app/tests/unit/guidePanelState.spec.ts`
- `app/tests/unit/guideParity.spec.ts`
- `app/tests/unit/htmlDiffCacheWiring.spec.ts`
- `app/tests/unit/htmlDiffContract.spec.ts`

**Context reads:** Tests’ imported implementations/fixtures were checked as needed to understand boundaries; no implementation was fully read. No tests executed.

**Rejected reductions:** Retain `firstUserRoleLock`’s shared `initializedReq` helper; it already removes duplicate transaction setup while varying only relevant route. Retain `exportClient`'s generated/prepared popup twin tests because they had regressed independently; the blob cleanup case is specific to generated PDFs. Retain real-generator `it.each` coverage over framework fields and output documents, since the field-specific row placement and table/link behavior are not interchangeable. Guide parity’s repeated claims are the actual cross-surface contract, and page/role cases test separately rendered permissions. No reduction warranted.

**Remaining:** `tests-helpers-01`, `tests-fixtures-01`, `tests-style-snapshot-01`. Resume at `tests-helpers-01`.

## tests-helpers-01 — complete

**Finding: duplicated drizzle-result normalization.** [`editRecovery.ts`](/home/james/Documents/Codex/2026-10-26/ares-v110-review/app/tests/helpers/editRecovery.ts:34) defines local `rows(result)` and uses it in `recoveryRow` / `countRecoveryRows`. It implements the same bare-array-or-`{ rows }` normalization already exported as `rowsOf` from [`db.ts`](/home/james/Documents/Codex/2026-10-26/ares-v110-review/app/tests/helpers/db.ts:56), which is imported and used by the neighboring fixtures helper. This is needless duplicate shape handling in shared test infrastructure; if drizzle changes its result shape, the two copies can drift. Smallest behavior-preserving change: import `rowsOf` from `./db.js`, replace the two `rows(...)` calls with `rowsOf<Record<string, unknown>>(...)` (or the narrower row type at each use), and remove the local helper. Preserve current `undefined`/missing-row behavior (`recoveryRow` yields undefined; count returns numeric zero) and the direct SQL setup path independent of production `txDb`.

**Fully read (all source):**
- `app/tests/helpers/cssSelectors.ts`
- `app/tests/helpers/db.ts`
- `app/tests/helpers/dialogs.ts`
- `app/tests/helpers/discussions.ts`
- `app/tests/helpers/e2e.ts`
- `app/tests/helpers/editRecovery.ts`
- `app/tests/helpers/editRecoveryUi.ts`
- `app/tests/helpers/fakeReq.ts`
- `app/tests/helpers/fieldTree.ts`
- `app/tests/helpers/fixtures.ts`
- `app/tests/helpers/generatorHtml.ts`
- `app/tests/helpers/httpWire.ts`
- `app/tests/helpers/login.ts`
- `app/tests/helpers/manageUi.ts`
- `app/tests/helpers/nullResourceLinks.ts`
- `app/tests/helpers/payloadErrors.ts`
- `app/tests/helpers/renderSql.ts`
- `app/tests/helpers/rowLocks.ts`

**Context reads:** None outside the assigned helpers; docblocks and direct callers described the reason for the abstractions. No tests executed.

**Deliberate complexity/duplication retained:** `retireDirectly` purposely sets retirement SQL directly so recovery tests do not establish preconditions by calling the transition under test. Keep browser-only vs Payload/Local-API helper boundaries (`editRecoveryUi`/`e2e` vs `editRecovery`/fixtures). Keep fixture ownership, marker-scoped cleanup, dependency order, role-state creation, cleanup failure aggregation, and row-lock release/timeout logic; these protect shared disposable DB state and independent lock semantics. `httpWire` deliberately leaves earlier local copies as migration landing space per its own stated scope; URL/login auth shapes differ between consumers. `db.drizzleOf` and SQL helpers are targeted wrappers, not unnecessary layers.

**Remaining:** `tests-fixtures-01`, `tests-style-snapshot-01`. Resume at `tests-fixtures-01`.

## tests-fixtures-01 — complete

**Finding:** No simplification candidate. The binary PDF and its two metadata/documentation files intentionally form a tiny, byte-exact HTTP wire fixture. Replacing the PDF with generated/parsed text or treating it as a text file would weaken the complete-response contract and risk line-ending corruption.

**Fully read:**
- `app/tests/fixtures/pdf-library/.gitattributes`
- `app/tests/fixtures/pdf-library/README.md`
- `app/tests/fixtures/pdf-library/public-wire.pdf` (all 606 bytes inspected with hex dump; `file`/`pdfinfo` metadata also checked)

**Context reads:** None; no tests executed.

**Remaining:** `tests-style-snapshot-01`. Resume at that packet.

## tests-style-snapshot-01 — complete

**Finding:** No worthwhile simplification candidate. This packet is explicitly a manual measurement kit (not CI tests); its distinct scripts capture full page trees, interaction/menu states across surfaces, and modal subsets. The standalone diff tool must handle both row-list and key/value surfaces plus duplicate element paths, missing elements, ignored properties, and free-text notes. Flattening those modes would add indirection or lose practical comparison behavior.

**Fully read (all source):**
- `app/tests/style-snapshot/README.md`
- `app/tests/style-snapshot/dialogs.spec.ts`
- `app/tests/style-snapshot/diff.mjs`
- `app/tests/style-snapshot/kit.ts`
- `app/tests/style-snapshot/menu-states.spec.ts`
- `app/tests/style-snapshot/pages.spec.ts`

**Context reads:** None. No tests or scripts executed.

**Rejected reductions:** Keep the synthetic dialogs alongside real dialogs: they enumerate all modal parts and over-tall scrolling independently of whatever current routes happen to show. Keep the menu-state and page-tree capture separate, as they measure different computed properties and interactive states. The diff tool's path multimap preserves repeated class paths and reports cardinality changes rather than silently pairing/dropping rows. No simplification proposed.

**Remaining:** None. All seven assigned packets completed. No unfinished reads or execution work.
