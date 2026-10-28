# Test REUSE checkpoint — E2E/HTTP batch 1

Baseline: `/home/james/Documents/Codex/2026-10-26/ares-v110-review`, fixed v1.10 source. Read-only review; no tests run and no repository changes.

## E2E-01

**Reuse candidates:** None found that warrants shared ownership. Existing reusable fixture, login, recovery, dialog and manage UI helpers are already used where their contracts match. Several locally similar helpers have deliberately different setup/cleanup or data semantics; see rejections below.

**Coverage:** Fully read all 16 manifest files: `advancedTools.e2e.spec.ts`, `catalogue.e2e.spec.ts`, `combine.e2e.spec.ts`, `discussions.e2e.spec.ts`, `discussionsGuide.e2e.spec.ts`, `discussionsModeration.e2e.spec.ts`, `documentLocks.e2e.spec.ts`, `draftCombineShortcut.e2e.spec.ts`, `drafts.e2e.spec.ts`, `editRecovery.e2e.spec.ts`, `editRecoveryRestore.e2e.spec.ts`, `editorBackDarkMode.e2e.spec.ts`, `editorValidation.e2e.spec.ts`, `insertLink.e2e.spec.ts`, `lessonDetails.e2e.spec.ts`, `lessonReleases.e2e.spec.ts`. Context/dependencies read: `tests/helpers/fixtures` (via imported contracts, source not full), `e2e`, `editRecoveryUi`, `editRecovery`, `manageUi`, `dialogs`, `db`, `discussions` helpers (partial/context only); relevant UI/source names referenced by tests. The E2E suite is context only, not a complete review of helper implementations or application source.

**Rejected extractions:**
- `combine.e2e.spec.ts` and `draftCombineShortcut.e2e.spec.ts` both build versions and exercise save/combine transitions, but their version builders intentionally model distinct author/release/source states; moving this into one broad fixture API risks obscuring business inputs. Existing editor/recovery helpers are already reused.
- Recovery capture/restore flows across `editRecovery.e2e`, `editRecoveryRestore.e2e`, `drafts.e2e`, and `saveSnapshot.e2e` share helper calls but pin distinct interleavings and states (capture transport failure vs unresolved offer vs discard/restart vs save races); no additional scenario abstraction safely reduces meaningful drift.
- Discussions and moderation tests share forum switches and discussion creation; route/nav freshness, reply idempotency, password-confirmed feature switching, and moderation lifecycle are distinct observable contracts, not one common test journey.

## E2E-02

**Reuse candidates:** None beyond existing helpers. The one test-local `acceptConfirmation` at `manage.e2e.spec.ts:116-126` intentionally returns the native dialog's message while accepting; other call sites merely accept/dismiss without asserting text, so widening a shared helper would not eliminate a matching repeated contract. Existing `manageUi`, `dialogs`, `e2e`, fixture, recovery helpers are already reused.

**Coverage:** Fully read all 10 manifest files: `liveRowLabels.e2e.spec.ts`, `manage.e2e.spec.ts` (all 1,995 lines in five slices), `messages.e2e.spec.ts`, `offlineSignup.e2e.spec.ts`, `publicLibraryDisabled.e2e.spec.ts`, `saveSnapshot.e2e.spec.ts`, `schoolName.e2e.spec.ts`, `uploadBundles.e2e.spec.ts`, `versionUnavailable.e2e.spec.ts`, `welcomeDialog.e2e.spec.ts`. Context/dependencies: imported helper symbols from `manageUi`, `dialogs`, `e2e`, `fixtures`, `editRecovery`, `editRecoveryUi`, `db` inspected at call-contract level; not full implementation reads.

**Rejected extractions:**
- Manage’s `sgPick`, `strandPick`, `openDeletePanel`, `openUser`, and data-specific labels are cohesive local selectors over one panel’s information architecture; moving them globally would add indirection without reuse evidence.
- School name and release tests iterate responsive widths/routes, but their measured DOM properties and fixture switches differ; no common viewport assertion currently owns the semantics.
- `uploadBundles` builds related import payloads locally; their metadata deliberately varies to exercise duplicate, unchanged, revised, and taxonomy-confirmation cases. A generalized scenario factory would hide the fields that make each case distinct.
- Snapshot save barriers are unique to preserving captures during request interleavings; they are not interchangeable with the `insertLink` pending-response gates or discussion idempotency gates.

**Remaining work:** HTTP-01..04 and INT-01..04 have not started in this checkpoint.

## HTTP-01

**Reuse candidates:** None. Existing `httpWire.login`/`url` are reused where they preserve the intended wire context. Endpoint-specific wrappers deliberately differ in whether they parse arbitrary response text, expect JSON, attach optional auth, or retain raw form-data.

**Coverage:** Fully read all 5 manifest files: `apiErrorMessages.http.spec.ts`, `authFavorites.http.spec.ts`, `combinePreview.http.spec.ts`, `combineSave.http.spec.ts`, `discussions.http.spec.ts`. Context/dependencies: imported `httpWire`, fixtures, DB, discussions and row-lock helpers inspected through use contracts, not full helper source.

**Rejected extractions:**
- `apiErrorMessages.messageOf` is a first-error parser for Payload's known `errors` body; `discussions.call` preserves raw text and tolerates non-JSON; `combineSave.save` sends `FormData`; `authFavorites.post` makes JSON requests. A universal request helper would need switches for all these semantics without reducing the repeated domain setup.
- `discussions.http.spec.ts` has intentionally local `call` and action wrappers because status/body/text plus role gates, request body, off-switch state, and races are shared within this suite; exporting them across endpoint suites would couple tests to this domain's response parsing and role mapping.
- Repeated counting/no-write assertions in endpoint gate cases are the independent contract for each input class and status; collapsing them into a helper would reduce useful assertion-local evidence.

**Remaining work:** HTTP-02..04 and INT-01..04.

## HTTP-02

**Reuse candidates:**

1. `app/tests/http/lessonReleases.http.spec.ts:79-89`, `beforeAll` token loop repeats the HTTP login request/response extraction already owned by `app/tests/helpers/httpWire.ts:36-45` (`login`). The current local copy checks only status before reading `token`, whereas the shared helper also throws a direct, email-specific error if a successful response omits its token. Minimal change: import `login` (and use existing helper `url` if desired) and replace the loop body with `tokens[role] = await login(fx.users[role].email, fx.password)`. Keep the per-role loop and endpoint assertions unchanged. Semantics are compatible: same E2E_BASE_URL configuration and login endpoint; no cookie/session behavior is being moved. This is source-confirmed reuse of an existing helper.

2. `app/tests/http/endpoints.http.spec.ts:2349-2391` `jsonFile`, `app/tests/e2e/uploadBundles.e2e.spec.ts:10-41` `raw`, and `app/tests/http/lessonReleases.http.spec.ts:17-53` `raw` each spell the same sizeable ARES raw lesson export shape (metadata, one lesson/SLO/framework, resource links, summary prompt, and null optional groups). A schema adjustment can otherwise update the three fixtures unevenly, turning an import-path test failure into fixture drift. Minimal change: add a test-helper builder for a valid raw lesson record with explicit subject/grade/ID/title inputs and one file-wrapper left at each caller; preserve each suite's role, subject-grade defaults and archive/release wrapper. `minimalResourceLinks()` already supplies the common links. Keep malformed/sparse payloads inline because they intentionally test invalid boundaries. This is source-confirmed duplication; matching fields and types are visible in all three files.

**Coverage:** Fully read all 4 manifest files: `endpoints.http.spec.ts` (all 2,747 lines in seven slices), `firstUserBootstrap.http.spec.ts`, `jobStatsGlobal.http.spec.ts`, `lessonReleases.http.spec.ts`. Context/dependencies read: `tests/helpers/httpWire.ts` fully; fixture/helper use contracts inspected for `fixtures`, `db`, `editRecovery`, and `rowLocks`, not full source reads.

**Rejected extractions:**
- `endpoints.http.spec.ts`'s local login/url copies parallel `httpWire`, but that helper explicitly records them as intentional legacy copies pending a separate churn-focused conversion; do not mix that conversion into a packet that only adds unrelated endpoint cases. New `lessonReleases` code can reuse it directly.
- Upload `jsonFile` should not subsume its ZIP container or release manifest builders: those callers vary archive metadata and release hashing/provenance; only the repeated raw ARES document shape is common.
- `firstUserBootstrap.postJson` and role-key request wrappers elsewhere are distinct endpoint contracts and fixture preconditions. A generic wire client here would add configuration branches without eliminating domain behavior.

**Remaining work:** HTTP-03..04 and INT-01..04.

## tests-http-03

**Reuse result:** One meaningful source-confirmed opportunity: repeated direct login/request wire setup should call the shared helper where the suite is newly added/maintained. `messageReferences.http.spec.ts:33-43` and `nullResources.http.spec.ts` local setup (full-file lines 1-270; local `login`/URL/request wrapper in first section) reproduce `tests/helpers/httpWire.ts:36-45` login behavior. These copies only check HTTP success and token presence, while the shared login helper also reports email-specific failure context; adopting `login` reduces repeated auth protocol code and strengthens fixture failure diagnostics without changing test request identity. Keep each endpoint's local call/wire wrapper because response/body handling differs. This is also consistent with the `lessonReleases` candidate in HTTP-02. `nativeVersionAuthority` already uses the shared helper. The `lockedDocuments`, `pendingAuthority`, `recovery`, `saveAsNewRecovery`, and `systemSettings` files also use shared auth helpers where appropriate.

No other extraction identified. In particular, do not combine the `nullResources` multi-phase raw bundle (explicit null slots and all phases) with the simpler one-phase ARES raw-document fixture from HTTP-02. Recovery cases intentionally vary role, session ownership, revision/generation, stale metadata, preview budget, and database transaction/interleaving; `saveAsNewRecovery`'s trigger/barrier/sequence scaffolding is local to its real transaction failure and deterministic mid-flight race proof. `systemSettings`' POST ordinary-global door and dedicated Save endpoint deliberately assert different auth/error/state contracts; role loops share only straightforward data-driven labels and should not become a generalized request abstraction.

**Coverage:** Fully read every assigned file: `app/tests/http/lockedDocuments.http.spec.ts` (283), `loginProtection.http.spec.ts` (162), `messageReferences.http.spec.ts` (178), `nativeVersionAuthority.http.spec.ts` (98), `nullResources.http.spec.ts` (270), `pendingAuthority.http.spec.ts` (309), `recovery.http.spec.ts` (675), `saveAsNewRecovery.http.spec.ts` (655), `serverTime.http.spec.ts` (44), `subjectGrades.http.spec.ts` (97), and `systemSettings.http.spec.ts` (539). Also read `app/tests/helpers/httpWire.ts` (shared auth helper context), and followed the existing fixture/db/recovery helpers by source references as needed. HTTP tests are review context only; no test execution. No partial files or outstanding packet reads.
