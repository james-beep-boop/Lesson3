# UI batch 1 — efficiency review (fixed v1.10)

Source: `/home/james/Documents/Codex/2026-10-26/ares-v110-review`, commit `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`. Read-only; no tests run or repository changes made.

## components-01 — complete

**Fully read (2,359 lines, all 14 assigned files):**
- `app/src/components/AdminDashboard/CandidateList.tsx` (203)
- `app/src/components/AdminDashboard/DeletePlansPanel.tsx` (435)
- `app/src/components/AdminDashboard/index.tsx` (875)
- `app/src/components/AdminHeaderMenu/index.tsx` (48)
- `app/src/components/AdminUnauthorizedRedirect/index.tsx` (20)
- `app/src/components/AppNav/NavigationFreshness.tsx` (127)
- `app/src/components/AppNav/index.tsx` (136)
- `app/src/components/AppVersion.tsx` (10)
- `app/src/components/Brand/Icon.tsx` (28)
- `app/src/components/CollapseOnEntry/index.tsx` (65)
- `app/src/components/CombineVersions/applyOverlay.ts` (15)
- `app/src/components/CombineVersions/comparisonError.ts` (21)
- `app/src/components/CombineVersions/index.tsx` (345)
- `app/src/components/CompareToOfficialLink.tsx` (31)

**Dependency/context reads:** Read the relevant portions of `lib/systemFlags.ts`, `lib/discussions.ts`, `lib/relId.ts`, `lib/substrand.ts`, and `lib/planSelection.ts` to trace the per-render settings memo, unread check, ID deduplication, group/filter passes, and selection counts. Read `app/tests/unit/candidateListActions.spec.tsx` fully (152 lines) and `app/tests/unit/navigationFreshness.spec.tsx` through its key cases (first 180/220 lines; partial). Read the Manage E2E spec header and targeted passages covering candidate filtering, saved-version delete refresh, and delete panel behavior (partial excerpts; not whole 1,995-line file). Verified `AppNav` callers in frontend layout and Payload config; did not read unrelated tests or review reports.

**Concrete lead, lower priority (source-confirmed avoidable CPU/allocation, impact not runtime-measured):** In `AdminDashboard` lines 250–256, `sgIds` is always built by mapping relationships from `versionDocs`, `planDocs`, `unsavedWork`, and `personalVersions`, spreading those arrays together, filtering nulls, and constructing a `Set` via `distinctIds`. For Site Admin, `taxonomyGradeDocs` already supplies the full subject-grade table and the `sgRes` branch is skipped at lines 264–269; therefore this computed ID list is never consumed for that role. The pass is O(V + P + U + M) per Site Admin Manage render, with four intermediate mapped arrays plus the combined/filter/Set result; V is all deletable version docs, P all plans, U own unsaved captures, M own versions. The page already records real source counts for candidates/plans in `t.report`, but I did not run or inspect runtime timings for this branch. Minimal change if worth taking: use `const sgIds = siteAdmin ? [] : distinctIds([...])`, preserving the current query guard and keeping non-Site-Admin ID projection unchanged. Expected invariant: Site Admin continues to build `sgById` from the complete taxonomy query; non-Site-Admin still looks up only referenced subject grades. Validate with existing Manage role/render coverage and a source-level check that the candidate panel labels/delete taxonomy remain unchanged. This is a small bounded pass saved, not a demonstrated page-latency fix; no evidence supports prioritizing it over user-visible work.

**No other useful-now findings.** Candidate search tokenizes once and filters already-loaded rows inside `useMemo`; DeletePlansPanel memoizes grouped data and visible rows, runs hidden-selection counting only during active search, and skips expensive scope derivation until the confirmation is open. Those are one in-memory pass per changed query/state as intended. `PlanLine` computes curriculum scope only for flat search results. The deletion loop is sequential by design: one request/transaction at a time with fail-fast reporting and exact partial-success recovery; no parallelization recommendation. `NavigationFreshness` issues one small nav-state request per ordinary changed URL, always refreshes traversed history, cancels superseded checks, and treats timeout/failure as stale; removing/reusing those checks would change freshness semantics. `AppNav`'s `systemSettingsForRender` shares the flags/name settings read through React `cache`; `hasUnread` rechecks the same cached settings promise before its raw query, so this is not a repeated database read. Keep the explicit helper guard. Do not cache navigation state across navigations or across requests.

**Rejected ideas:** no blanket memoization for server projections; no cross-request settings/navigation cache; no collapsing taxonomy and plan reads because the former powers the editable complete taxonomy while the latter powers plan operations; no batching/concurrency for by-ID deletes; no candidate-list action changes (the server-created per-row decisions remain authoritative). No performance claim based solely on file size or nominally repeated JSX.

**Packet status:** complete. No unfinished source reads for components-01. Resume with `components-02` (`Discussions/*`, `referencePickerQueries.ts`, `submitPost.ts`, `useComposer.ts`, `DocButtons.tsx`, `DocStrip.tsx`, `EditRecovery/*`).

## components-02 — complete

**Fully read (2,337 lines, all 21 assigned files):**
- `app/src/components/Discussions/ComposerParts.tsx` (49)
- `app/src/components/Discussions/MarkThreadRead.tsx` (34)
- `app/src/components/Discussions/ModerationControls.tsx` (238)
- `app/src/components/Discussions/Pager.tsx` (26)
- `app/src/components/Discussions/PostText.tsx` (33)
- `app/src/components/Discussions/ReferencePicker.tsx` (240)
- `app/src/components/Discussions/ReplyComposer.tsx` (81)
- `app/src/components/Discussions/TopicComposer.tsx` (83)
- `app/src/components/Discussions/referencePickerQueries.ts` (37)
- `app/src/components/Discussions/submitPost.ts` (124)
- `app/src/components/Discussions/useComposer.ts` (66)
- `app/src/components/DocButtons.tsx` (114)
- `app/src/components/DocStrip.tsx` (71)
- `app/src/components/EditRecovery/Indicator.tsx` (124)
- `app/src/components/EditRecovery/RestorePrompt.tsx` (224)
- `app/src/components/EditRecovery/deadline.ts` (51)
- `app/src/components/EditRecovery/flushRegistry.tsx` (158)
- `app/src/components/EditRecovery/protocol.ts` (226)
- `app/src/components/EditRecovery/restoreDiff.ts` (150)
- `app/src/components/EditRecovery/restoreGroups.ts` (125)
- `app/src/components/EditRecovery/unsavedWarning.ts` (83)

**Dependency/context reads:** Read the relevant portions of `IdleLogout` to establish the flush registry's consumers and call cadence; query builders and focused portions of `tests/http/discussions.http.spec.ts` and `tests/e2e/discussions.e2e.spec.ts` to confirm picker request shape/flow. `referencePickerQueries.ts` makes lesson search at most 10 selected-title rows with pagination disabled; selecting a plan loads its readable versions once. Also searched component/test references for the recovery hooks, deadlines, composer, and reference picker. These were targeted context reads, not a full read of the larger E2E/HTTP specs. No live tests run.

**No useful-now efficiency finding.** The assigned paths already constrain work carefully: lesson-reference search waits 250 ms and starts only at two characters, stamps results with the answering query, caps the REST search at 10 projected titles and disables the count; the selected lesson's versions are fetched once and projected to display fields. Composer submission sends one request and only performs the bounded one-row lookup on uncertain outcomes; it retries the exact same request/key to preserve idempotency. Edit-recovery timeout wraps request plus body parse; the restore prompt memoizes grouping/diff work over stable offer inputs; the capture fingerprint is computed lazily after a 413. No repeated large computation or unbounded result load was established in this packet.

**Rejected lower-priority lead:** A stale lesson-search fetch is not aborted when its query effect cleans up (`ReferencePicker.tsx:72–87`); `live` suppresses its result/error, but `getDocs` still awaits and parses a response. A cleanup-owned `AbortController` could reduce transport/body work when the request is still in flight, with catch already gated by `live`. However, each response is capped at 10 small title-only docs (`referencePickerQueries.ts:9–18`), the 250 ms debounce already limits starts, the server may continue processing after client abort, and no overlapping-request trace or timing was measured. This is only a low-priority lead, not a finding to implement now; if pursued, preserve query-keyed stale suppression and avoid surfacing abort as search failure. Similarly, `flushRegistry.allSafe` spreads the registry before `.every` (`flushRegistry.tsx:134–142`), but IdleLogout calls it only on its expiry checks; registrations are usually one editor and no material allocation cost is demonstrated. Replacing the snapshot with direct iteration is unnecessary churn.

**Rejected ideas:** Do not parallelize the topic/reply recovery lookup with the initial create: the lookup is only needed after an uncertain outcome and carries a longer ambiguous window; do not change retry key/request fidelity or classify responses differently. Do not remove MarkThreadRead's POST after render (it is the required write timing), abort or cache a still-selected lesson's version lookup speculatively, weaken the two-sided restore diff, or remove the recovery deadline/single-flight registry. Do not cache export readiness across button clicks; artifacts may be cold and the shared export client owns the freshness contract.

**Packet status:** complete. No unfinished source reads for components-02. Resume with `components-03` (`EditRecovery/useEditRecovery.ts`, `FavoriteToggle`, `FormField`, `Guide/*`, `IdleLogout`, `LessonControls/EditJumpNav`, `MoreMenu`, `currentSection`, `entryPhase`).

## components-03 — complete

**Fully read (2,179 lines, all 11 assigned files):**
- `app/src/components/EditRecovery/useEditRecovery.ts` (890)
- `app/src/components/FavoriteToggle.tsx` (120)
- `app/src/components/FormField.tsx` (30)
- `app/src/components/Guide/Accordion.tsx` (112)
- `app/src/components/Guide/availability.ts` (68)
- `app/src/components/Guide/panelState.ts` (90)
- `app/src/components/IdleLogout/index.tsx` (171)
- `app/src/components/LessonControls/EditJumpNav.tsx` (391)
- `app/src/components/LessonControls/MoreMenu.tsx` (82)
- `app/src/components/LessonControls/currentSection.ts` (119)
- `app/src/components/LessonControls/entryPhase.ts` (106)

**Dependency/context reads:** Read the full `Guide` helpers and `IdleLogout` call path; read portions of the relevant unit specs for `EditJumpNav` (all 141 lines), `currentSection` (first 100/124), and `useEditRecovery` only by targeted search (the 1,503-line spec was not fully read). The `EditJumpNav` test mocks `useAllFormFields` and tests row parsing/deep-link behavior, but does not measure render frequency or scan cost. No installed `@payloadcms/ui` source was available in this worktree to inspect selector APIs, so any narrower subscription suggestion below is conditional on verifying against the pinned package source. No tests run.

**Useful-now finding (repeated CPU pass; runtime impact still needs measurement):** `EditJumpNav` subscribes through `useAllFormFields()` at line 52, then on every component render enumerates every key in the form state, regex-matches each path, builds a `Set`, sorts the discovered lesson indexes, and maps them back to number/title at lines 67–78. This is O(K + N log N) work per render, where K is all form-state field paths and N is top-level lesson rows. The file itself identifies a ~2,000-key form state at lines 207–211, and `useEditRecovery` documents large lesson documents around 600 KB and multiple render points during restore at its entry-state comments. The section-tracking effect is correctly stabilized by `sectionIdsKey` and does not rerun on ordinary text changes; however, that does not prevent this render-time scan before the key is rebuilt. Since the hook intentionally observes all form fields, edits elsewhere in the form can cause the component to render and redo the full enumeration; exact render count and measured time were not available here.

Minimal safe direction: replace the broad all-fields subscription with a narrow subscription to the top-level lesson-array/index/title state (including array add/remove), or otherwise arrange for the lesson-chip projection to recompute only when those values change. Verify the actual selector/array-field semantics from pinned Payload source before choosing the implementation. Preserve every top-level row even when its field body is lazy/unmounted, its display number fallback, current ordering, and `?lesson=` deep-link lookup. Validate with a real long-plan profiler trace plus a focused test showing that unrelated prose edits do not redo the lesson list while changes to lesson title/number or row count still update chips and deep links. This is a source-evidenced repeated pass, but not a measured user-visible bottleneck yet; measure before promoting beyond the next focused UI optimization.

**Rejected ideas / no other useful-now findings:** Do not cache section positions or scroll thresholds: the form grows via lazy rendering, and the current per-frame scheduler coalesces scroll/resize work before a read-only ~15-rect pass. Do not remove the entry-phase listener or collapse-on-entry guards; they cover delayed mounts and first user input. Do not reuse remembered capture safety, remove epoch checks, or overlap capture/start/lookup requests: tokens and revisions are sequential protocol state, and a stale response can replace a live session. `captureOnce` serializes the live document once per actual capture, avoids sending unchanged content in `captureAndReport`, and fingerprints only after the server returns 413; no broad cache is justified. `prepareForSave` deliberately has a separate save sequence, and I did not recommend skipping its capture because the caller's complete form/combine-context coupling has not yet been reviewed. Guide panel membership is a small closed set (37 ids); its bounded array includes are not material. IdleLogout's 30-second check and repeated pre-expiry `runAll` are required for late registrations and last-moment edits; registry single-flight prevents duplicate revision writes. FavoriteToggle's local state plus prop resync repairs cross-instance server refreshes; no optimization lead.

**Packet status:** complete. No unfinished source reads for components-03. Resume with `components-04` (`LessonControls/index.tsx`, `initialCollapse.ts`, `server.tsx`, `validation.ts`, `LessonDetails.tsx`, `LessonReference.tsx`, `LinkedTextarea/*`, `Manage/Accordion.tsx`).

## components-04 — complete

**Fully read (2,321 lines, all 11 assigned files):**
- `app/src/components/LessonControls/index.tsx` (1,488)
- `app/src/components/LessonControls/initialCollapse.ts` (36)
- `app/src/components/LessonControls/server.tsx` (64)
- `app/src/components/LessonControls/validation.ts` (92)
- `app/src/components/LessonDetails.tsx` (42)
- `app/src/components/LessonReference.tsx` (36)
- `app/src/components/LinkedTextarea/activeTarget.ts` (42)
- `app/src/components/LinkedTextarea/aresAddress.ts` (68)
- `app/src/components/LinkedTextarea/index.tsx` (246)
- `app/src/components/LinkedTextarea/insertLink.ts` (49)
- `app/src/components/Manage/Accordion.tsx` (158)

**Dependency/context reads:** Read `lib/advancedTools.ts`, relevant `readBundle.ts` query helpers, and `lib/editRecovery/draftCombineSuggestion.ts` to understand the server wrapper's version-list and optional suggestion reads. Read `tests/unit/combineVersionChoices.spec.tsx` fully and targeted portions of `tests/e2e/advancedTools.e2e.spec.ts` and `tests/e2e/combine.e2e.spec.ts` covering Standard-mode hiding, an unfinished Combine continuing in Standard, and the `?combineWith=` handoff. Searched for edit controls, linked-textarea and initial-collapse test references; did not read unrelated full test suites. No live tests run.

**Useful-now finding (one avoidable read in Standard mode):** `LessonControlsServer` resolves `flags` in its first `Promise.all` (`server.tsx:27–44`) but then unconditionally queries `findReadableVersionChoices` for every user with editing access and a readable source (`server.tsx:45–50`). That helper issues one caller-scoped `lesson-bundle-versions` find for the whole plan, `pagination: false`, selecting `semver` and mapping every returned id/semver (`lib/readBundle.ts:100–120`, read as context). In the client, the list is consumed only by the “start a Combine” picker: the open signal is from the More menu, and the menu is gated by `showsAction(resolveMode(flags), 'combineVersions')`; `CombineVersions` uses `versions` only for its picker and guards `startSignal` on at least two versions (`LessonControls/index.tsx:254–256, 1284–1291` and `CombineVersions/index.tsx:134–165). Standard mode intentionally hides ways to start, while direct `?combineWith=` continuation loads its comparison by ids without consulting `versions` (`CombineVersions/index.tsx:106–117); E2E coverage confirms an unfinished Combine continues after switching to Standard.

Minimal safe change: after the existing flags result is available, call the version-choice query only when the central `resolveMode(flags)` is `advanced` and the existing user/source/permission gates pass; otherwise pass `[]`. This removes exactly one all-versions query and its result map for each Standard-mode editor page render, the default mode (`SystemSettings.tsx` notes the flag defaults false; read as context), while retaining the same read access and list when the picker is visible. Preserve independent draft-suggestion behavior and do not gate continuation. Validate the server-wrapper unit spec in both modes, then the existing Standard unfinished-Combine and direct handoff E2E paths (no `?combineWith` continuation may regress). This is a source-confirmed skipped query, although no page latency was measured.

**Lower-priority repeated serialization lead (not a recommendation without profiling):** In a normal editable session with a recovery token and clear entry state, Save takes `snapshot = JSON.stringify(currentContent())` at `LessonControls/index.tsx:808`, then `recovery.prepareForSave()` runs; with the form already locked at `:780–786`, `prepareForSave` drains any prior write and performs the fresh capture at `useEditRecovery.ts:625–649`, whose `captureOnce` separately calls `JSON.stringify({ generation, expectedRevision, combineContext, document })` at `:349–357`. For the largest plans, the hook comments describe ~600 KB documents (`useEditRecovery.ts:119, 455`), so a typical successful save serializes the same document twice, once for each required write. Avoiding one serialization could reduce CPU and a temporary large string, but both requests and the fresh lock-time token/revision recheck are intentional. If profiling on the target machine shows this material, a narrowly shared immutable serialized document snapshot could be passed to the pre-save capture and used to build its JSON envelope without reserializing the document; it must keep the form locked, pair exactly the same `document` and `combineContext`, and still issue the capture/recheck. This needs careful wire-equivalence tests (including indeterminate/capture conflict paths), so I do not recommend implementing from source inspection alone. Do not skip the pre-save capture based on `isSafe`: that would remove the fresh server-side token/revision check against another session, contrary to the saved-work fence.

**Rejected ideas / no other useful-now findings:** The page's full form reads (`getData()`/`JSON.stringify`) are click-time for preview/save/PDF; `versionDeliverables` is computed only when the PDF menu opens. `initialCollapseActions(fields)` is a one-time post-init pass, latched per document; it is not run on every edit even though the effect observes `fields`. `remainingChoices` memoizes conflict work across form-only changes, `combineDoc` is built once per relevant comparison/form state and then reused per conflict, saved prose is memoized by saved document, and restore anchors are sampled once by recovery. Do not remove single-flight/revision/epoch guards or concurrent-check cancellation in edit recovery. `LessonControlsServer` also executes the optional draft-combine suggestion query after the version-choice query when a draft exists; although independent at the source level, I did not recommend parallelizing them because the choice query is essential while suggestion failures are intentionally swallowed and no render timing shows this sequential wait is material. Do not merge the two projections without evidence: it would widen every version row with lineage/author/merge metadata and couple the optional failure path to the essential one. The selector construction, ARES URL normalization, and accordion state sets are small/click-time or bounded operations; no repeated hot-path issue found there.

**Packet status:** complete. All four components packets are fully read; no unfinished source reads remain. Final resume point: none. No repository/git/live actions were performed; only `/tmp/ares-simplification-working/ui1-efficiency.md` was written.
