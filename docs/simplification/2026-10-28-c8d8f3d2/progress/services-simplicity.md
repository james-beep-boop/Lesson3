# SIMPLICITY review — service packets

Baseline: immutable v1.10 snapshot `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91` at `/home/james/Documents/Codex/2026-10-26/ares-v110-review`. Read-only. No tests run and no repository changes.

## endpoints-01 — complete (19 source files, 2,382 lines)

Candidate:
- `app/src/endpoints/recovery.ts:112-117`, local `json` helper: it is identical in behavior to the existing `json` helper in `endpoints/respond.ts:101-109` (same `JSON.stringify`, status default, and JSON content-type). This duplicates the shared response wrapper and leaves one endpoint family outside the common definition. Minimal behavior-preserving change: import `json` from `./respond` and remove the local function. All recovery response bodies/statuses and the deliberately distinct endpoint-specific error messages remain as-is. Verify with existing recovery endpoint tests and TypeScript.

Rejected ideas / purposeful complexity:
- Do not unify endpoint gate/response branches merely because they share shapes: version export's warm/cold/absent/job states, combine's invalid-request vs uncombinable-plan results, recovery's 401/403/404 ownership boundaries, and email's per-user vs shared quota ordering have different contracts.
- Do not flatten moderation's `stampsActor` conditional lock or transaction wrapper. The user-row lock, post-row lock, reauthorization after wait, commit, then logging order are action- and transaction-sensitive.
- Keep unsaved preview separate from saved preview and PDF preview: shared resolution/rendering gates coexist with intentional cached-vs-uncached and HTML-vs-conversion behavior. Body parsing is split into generator-free code for unit access, while recovery parsing carries multipart and kernel-specific wire semantics.
- `previewShared.ts` has adjacent overlapping doc comments around `assertPreviewable`; this is comment redundancy only and does not meet the maintenance bar for a code simplification finding.

Context read (not exhaustive test review): traced endpoint registrations/callers with `rg`, checked existing `respond.json` contract, and located relevant discussion, preview, export, recovery and email unit/int/http tests. Tests are context only; none were exhaustively read or run. No edits; worktree clean.

Files fully read: `app/src/endpoints/aresExport.ts`, `combinePreview.ts`, `discussionActions.ts`, `discussionNavState.ts`, `discussionThreadDelete.ts`, `emailVersion.ts`, `exportAuth.ts`, `exportVersion.ts`, `forgotPassword.ts`, `login.ts`, `markMessagesRead.ts`, `moderate.ts`, `parseFormat.ts`, `previewParse.ts`, `previewShared.ts`, `previewVersion.ts`, `recovery.ts`, `recoveryParse.ts`, `requestEditing.ts`.

## endpoints-02 — complete (10 source files, 2,173 lines)

No material simplicity candidate. The shared endpoint utilities already centralize the lower-risk patterns (JSON response/body parsing, admin gates, freshness parsing); the remaining repetition tracks different authorization or transaction rules.

Purposeful complexity to retain:
- `resourceLibrary.ts` repeats safety checks between listing and serving because the file can change between requests; the same descriptor is used for signature validation and bounded streaming.
- `refreshCaller`, `reassertSiteAdmin`, and endpoint-specific gates preserve request identity while refreshing current authority after waits. Keep field-level roles, user admin actions, assignment routes, and hook enforcement distinct: handover and revoke rules are asymmetric.
- `systemSettingsSave.ts` parses an explicit allowlist, reauthenticates through Payload, revokes its temporary session, then locks/rechecks/commits. Each step closes a separate writer, freshness, or privilege window.
- `uploadBundles.ts` keeps preflight, approval, transaction, and completed/needs-confirmation response shapes distinct. `verifyEmail.ts` delegates token semantics to Payload while retaining the custom rate gate.
- `versionEdit.ts` retains separate retry types for semver collision and fixed recovery-token conflict, transaction rollback around create/retire/delete, source freshness, access refresh after waits, and one-way official-pointer transitions. The `parsed = null` release of the multipart `FormData` is an explicit memory optimization whose benefit is documented as unmeasured; do not remove or promote it without evidence.
- `userSearch.ts` uses SQL only to compute a paginated ID/count index and then performs access-controlled Payload reads; the page envelope and one-pass count mapping are already consolidated.

Rejected ideas: do not remove `parsed = null` based only on simplicity—the retained FormData can reference a large string, so it is a purposeful memory release though unprofiled. Do not merge response formats or role-setting handlers with assignment handlers: permission, lock, and consent semantics differ. No extra shared wrapper is warranted where the common helper already exists.

Context read (not exhaustive test review): traced global/collection endpoint wiring and searched unit/int/http coverage for resource library, settings save, upload, user search/admin/assignment, verification and version editing. Tests are context only; not exhaustively read or run. No edits; worktree clean.

Files fully read: `app/src/endpoints/resourceLibrary.ts`, `respond.ts`, `serverTime.ts`, `systemSettingsSave.ts`, `uploadBundles.ts`, `userAdminActions.ts`, `userAssignments.ts`, `userSearch.ts`, `verifyEmail.ts`, `versionEdit.ts`.

## ingest-01 — complete (13 source files, 1,895 lines)

No material simplicity candidate. The processing layers preserve distinct representations and failure scopes: untrusted `.js` extraction, `.json` shape checks, raw contract validation, native Payload resource rows, generator completeness, ZIP byte budgeting, and taxonomy/release preflight cannot be collapsed without obscuring a meaningful boundary.

Purposeful complexity to retain:
- `extract.ts` and `contract.ts` implement fixed, dependency-free validators with actionable field paths. The separate JS AST evaluator and JSON parser converge only after parse; their repeated required-key / `__proto__` checks preserve parity at separate ingress boundaries.
- The schema's explicit native resource shape and `resourceLinks.ts` conversions preserve phase keys, empty-vs-null semantics, and bounded database row width. Validator and export handling share `isEmptyResourceGroup`; the CommonJS generator copy of safe-URL policy remains a fidelity/render-time boundary, not a TypeScript helper to relocate.
- `uploadFiles.ts` must inspect actual ZIP directory records before JSZip materializes them, then stream entries through per-file and batch budgets. Per-archive eager reading and settled promise replay let archives release while preserving per-file parse errors and checksums.
- `importLessons.ts` and `uploadFiles.ts` share lesson-set semantics but have different filesystem-vs-upload I/O and are intentionally separate front ends. `releaseFingerprintContext.ts` clears the live replaced request context in `finally`.
- `taxonomy.ts` keeps exact-name blocking, fuzzy suggestion, and grade validation as separate outcomes. Ingest preflight caches repeated taxonomy reads, accumulates per-file failures while allowing genuine DB errors to abort, and writes only after confirmation inside a separately locked transaction.
- `validateGeneratable` is reused by ingest, preview, and create hooks; hard-required LessonSequence checks and non-blocking optional deliverable warnings are deliberately separate.

Rejected ideas: do not merge raw schema validation and Payload-native validation just because field names overlap; they cover different representations. Do not simplify ZIP parsing to JSZip's declared count or parsed entry count; the directory scan precedes materialization and the declarations/normalized keys are not sufficient. Do not collapse the release fingerprint request-context wrapper into a one-off create; its `finally` cleanup covers both reingest and initial-import paths.

Context read (not exhaustive test review): read relevant `ingest/index.ts` preflight and locked-write sections (roughly lines 500-620 and 760-1026), upload endpoint uses, CLI entry refs, and located unit/int/http specs for extraction, schema, resources, ZIP preparation, taxonomy, ancestry, fingerprinting, release messages, and reingest. Tests were not exhaustively read or run. No edits; worktree clean.

Files fully read: `app/src/ingest/ares-contract.schema.json`, `contract.ts`, `errors.ts`, `extract.ts`, `importLessons.ts`, `releaseAncestry.ts`, `releaseFingerprintContext.ts`, `releaseMessages.ts`, `resourceLinks.ts`, `taxonomy.ts`, `toBundle.ts`, `uploadFiles.ts`, `validateGeneratable.ts`.

## generator-01 — complete (14 source files, 1,689 lines)

No material simplicity candidate. The generator-facing code is an adapter/cache/transport boundary around the byte-pristine vendor. Repeated per-format or per-deliverable branches preserve actual output contracts and cache states.

Purposeful complexity to retain:
- `adapter.ts` separates Payload cleanup from ARES shape restoration, with resource links as an explicit nullable exception and exact array guards for generator `.map` call sites. `versionDeliverables` must mirror the same content decision for UI and export.
- `index.ts` owns one builder per deliverable, registers an exhaustive key map, and leaves vendored implementation untouched. `proseLinks.ts` transforms only approved prose targets, preserves ordinary values by reference, and carries a parallel expected-link walk for fidelity comparison.
- Artifact-cache read/write distinctions are meaningful: missing is a normal miss, cache faults log once and fall back, writes use unique temp files/atomic rename, and eviction counts `.bin` only. Cache codecs validate decoded shapes before using them.
- `exportArtifacts.ts` has manifest/zip/readiness/per-document paths with different I/O costs and outcomes; manifest-last and complete-presence checks are intentional. PDF conversion stays in the sole DOCX→PDF seam.
- `htmlSectionsCache` and `htmlDiffCache` both single-flight independent derived computations, but cache different value shapes and have separate key/version contracts. Avoid adding a generic abstraction for two small, understandable instances absent a broader third use.
- `GENERATOR_RENDER_VERSION` and the separate compare-diff format version represent separate invalidation axes; attribution config is fixed and runtime path wiring accommodates the bundled production shape.

Rejected ideas: do not collapse `hasContent(clean(group))` to a raw presence check; Payload array/group IDs and empty/null fields must not create false deliverable availability. Do not infer compare-group presence from empty HTML; absence and empty content differ. Do not consolidate the two cache single-flight maps into a new helper based on line similarity alone. Do not touch or reimplement the vendor.

Context read (not exhaustive test review): traced export jobs/endpoints, compare and lesson rendering callers, PDF preview and ARES export paths; searched unit tests for cache, deliverable, compare, and generator contracts, and fidelity scripts. No tests were exhaustively read or run. No edits; worktree clean.

Files fully read: `app/src/generator/adapter.ts`, `artifactCache.ts`, `cacheCodecs.ts`, `config/attribution.yaml`, `deliverables.ts`, `docxToPdf.ts`, `exportArtifacts.ts`, `generateForVersion.ts`, `htmlDiffCache.ts`, `htmlSectionsCache.ts`, `index.ts`, `previewBundle.ts`, `proseLinks.ts`, `renderVersion.ts`.

## jobs-01 — complete (6 source files, 611 lines)

No material simplicity candidate. These jobs have different triggers and side effects: durable version artifact generation, user mail after generation, edit-recovery expiry, best-effort prewarming, password reset mail, and message ping verification. Their shared queue helpers do not erase those distinct retry, freshness, and user-facing semantics.

Purposeful complexity to retain:
- `generateVersionArtifact` performs snapshot-scoped generation with explicit cache invalidation and error handling; the email job adds recipient and message behavior and appropriately cannot be reduced to a call-only wrapper.
- `prewarmVersionArtifacts` checks both readiness and pending work for each supported format before enqueueing, with independent probes run concurrently and best-effort failure isolation. The tiny fixed `KINDS.indexOf` lookup is not worth a refactor.
- `messagePing` verifies the supplied message/recipient relationship before reporting success; the extra lookup is semantic validation, not redundant state.
- Reset-email token freshness, recovery expiration, and queue retry/idempotency helpers encode different timing and duplicate-work concerns.

Context read (not exhaustive test review): traced task registration in `payload.config.ts`, prewarm hook/ingest callers, and searched tests for enqueue, expiration, and email behavior. Test files were located but not exhaustively read or run. No edits; worktree clean.

Files fully read: `app/src/jobs/emailVersionArtifact.ts`, `expireEditRecovery.ts`, `generateVersionArtifact.ts`, `messagePing.ts`, `passwordResetEmail.ts`, `prewarmVersionArtifacts.ts`.

## errors-01 — complete (1 source file, 120 lines)

No material simplicity candidate. `AccountDisabled.ts` keeps the machine-readable code, APIError subclass, narrowly scoped after-error wire repair, and shared response-code reader beside one wire contract. Its repeated structural guards protect distinct response properties, and `readErrorCode` intentionally turns parse failures into `undefined` so the UI can fall back without throwing on an error path.

Purposeful complexity to retain:
- Preserve the three `preserveAccountDisabledWire` checks (`status`, `isPublic`, and owned `data.code`): each restricts which errors the hook can widen and protects a separate wire invariant.
- Keep `ErrorWire` and `readErrorCode` centralized beside the exported code; duplicated client parsing would reintroduce drift.
- The error subclass, after-error hook, and shared response reader solve serialization, production chunk identity, and client decoding respectively; no wrapper can safely subsume the three roles.

Context read (not exhaustive test review): read `userRoles.ts` around `refuseDisabledLogin`, `Users.ts` hook registration, traced login/reset-password form consumers, and searched contract/wiring/integration tests. Relevant tests were located but not exhaustively read or run. No edits; worktree clean.

Files fully read: `app/src/errors/AccountDisabled.ts`.
