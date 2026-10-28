# Core ALTITUDE review checkpoint

Read-only review of `/home/james/Documents/Codex/2026-10-26/ares-v110-review` (immutable v1.10 / `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`). No repository/git/live actions, tests, agents, implementation, other review reports or merges. Only this sanitized checkpoint is written. Prior own shared-lib review established a provisional prose-vocabulary import-direction candidate; this pass will validate it against full hook/native field definitions.

## access-01 — complete (652 lines)

Findings: none.
- Preserve `versionImmutability.ts`'s colocated form-render grant and beforeChange rejection; moving the hook into unrelated enforcement code would obscure the two-part invariant. Native lock takeover is the one documented reuse of the form-session grant, never a grant to update version content.
- Preserve access/index ownership of role predicates, directory/field access, and the separately named address-projection carve-out. Disclosure projection remains with `buildRolesAccess` in lib, not generic access itself.
- Preserve generated-surface policy at resolved buildConfig rather than onInit: generated locks and scheduler statistics do not exist before config sanitization, and request code may derive config before onInit.
- Preserve query-form and document-form deletion policy together in access/versioning. Official protection stays a separate enforced invariant; neither author ownership nor unknown Official is sufficient for delete.
- Do not combine similarly named subject-grade source resolvers merely for line count: bundle field access and Official field access have different document/data precedence; no behavior change justified.

Full source files: `app/src/access/bundle.ts`, `generatedSurfaces.ts`, `index.ts`, `lockedDocuments.ts`, `versionImmutability.ts`, `versioning.ts`.
Partial/context: `tests/unit/canDeleteVersionDoc.spec.ts:1-70`, `tests/unit/versionImmutabilityWiring.spec.ts:1-65`; production reference search for generated policy, lock target access, deletion predicates and admin-panel predicate. Prior full AGENTS/CLAUDE and relevant SPEC §§5/6/8 reading remains applicable. No exhaustive test-coverage claim.

Remaining: collections-01, fields-01, hooks-01, hooks-02, globals-01, payload.config.ts-01, instrumentation.ts-01, proxy.ts-01, plus final prose-vocabulary consumer/test ownership analysis.

## collections-01 — complete (2,023 lines)

Findings: no substantial ownership change recommended.
- Collection declarations mostly wire shared access, hooks and endpoint seams. Native fields remain content-of-record; recovery JSON is the sanctioned sparse-overlay exception, not grounds for a generalized JSON model.
- Small schema-local hooks (favorite ownership/reference check; message sender/quota/notification; subject/grade display maintenance) have coherent collection ownership. Splitting them into hooks solely to make collection files shorter does not consolidate policy.
- Cascades live beside child collections and are registered on parents; required-FK deletion and transaction request propagation remain explicit. Do not build a generic cascade factory across Favorites/recovery/messages/participation: selection exclusions, two-sided ownership, user/topic locks and retirement-vs-deletion semantics differ.
- Subject-grade deletion must continue to refuse content deletion, remove assignment rows through the trusted maintenance context, and collect all matching holders before updates change the query set. A common paginated-iteration wrapper would obscure this collect-then-write invariant for little gain.
- Preserve immutable-version hook ordering, source/server relationships, native identity fields, same-transaction prewarm and Official protection, and Users' global/admin-count-before-row/cascade ordering.
- Do not deduplicate container/child visibility gates or tighten otherwise permissive UI grants blindly: comments identify real Payload form-state/field-nulling behavior and intentional hook refusals instead of silent stripping.

Full files: `app/src/collections/DiscussionParticipation.ts`, `DiscussionReplies.ts`, `DiscussionTopics.ts`, `EditRecovery.ts`, `Favorites.ts`, `LessonBundleVersions.ts`, `LessonPlans.ts`, `Messages.ts`, `Subject.ts`, `SubjectGrade.ts`, `Users.ts`. The truncated Users verification/admin range was explicitly reread.
Partial/context: `tests/int/taxonomyDelete.int.spec.ts:1-90`, `tests/unit/mutationAuthority.spec.ts:1-65`; prior shared-lib review fully read discussion shared rules, recovery kernel, identity fields, role display projection and detached enqueue primitive. No fixture or live tests run.

Remaining: fields-01, hooks-01, hooks-02, globals-01, payload.config.ts-01, instrumentation.ts-01, proxy.ts-01; final prose-vocabulary analysis after full definitions/enforcement.

## fields-01 — complete (729 lines)

Prose-vocabulary candidate remains supported by full native-field reading. `fields/lessonContent.ts` constructs native fields through `prose()`/`proseAdmin()`/`structureText()`; the drift tests deliberately compare intended prose fields with the hook's write whitelist. Reuse should move only the pure shared vocabulary below the server hook, not derive browser metadata by importing native Payload field configs. Existing `lib/frameworkProse.ts` already shares framework keys/labels between native fields and the hook and should remain the source for that narrow existing vocabulary.

Proposed minimal location: new `app/src/lib/proseFields.ts`, client-safe and without Payload/RBAC/ingest imports, importing only the existing pure `FRAMEWORK_PROSE_LABELS` if needed. Put the seven container field arrays plus `PROSE_LABELS` there unchanged. Keep `META_IDENTITY_KEYS` with fieldSplit enforcement: only server/test consumers need that repair policy. Do not expand or rename `frameworkProse.ts` into a whole-document contract merely to avoid one appropriately named small module. Final import/test list will follow the full fieldSplit read.

Other findings: none. Keep native-field structure and form-only visibility behavior in fields; preserve two-level META/UNIT conditions, stored-not-edited fields, system resources/numbers and schema/path stability. Leave audit stamping as field beforeChange hooks (including overrideAccess), and UUID/fingerprint context stamping in identity fields. Do not unify resource URL validators by moving field-config concerns into ingest or move phase values into vendor code; `fields/phases.ts` is already the pure shared controlled-vocabulary owner.

Full files: `app/src/fields/bundleFields.ts`, `identity.ts`, `lessonContent.ts`, `officialChange.ts`, `phases.ts`. Identity file was fully read at the same immutable commit in the immediately preceding shared-lib task and retained in context; all other files read in this packet. `lessonContent.ts` covered 1-250 and 251-EOF.
Partial/dependencies: cross-source/test search for prose arrays/labels/META identity/framework labels; prior full `lib/frameworkProse.ts`, recovery projection and Combine engine; prior partial whitelist drift/native-field tests. No execution or schema generation.

Remaining: hooks-01, hooks-02, globals-01, payload.config.ts-01, instrumentation.ts-01, proxy.ts-01; finalize vocabulary consumer/test map.

## hooks-01 — complete (1,887 lines)

Finding C02 (small, valid ownership correction): `hooks/mutationAuthority.ts:3,45` imports `refreshCaller` from the HTTP edge utility `endpoints/respond.ts:45-69`. Its existing implementation owns current-account/session authorization after waits, not HTTP response/body handling; it is now shared by native beforeOperation enforcement and endpoint writes. Move this implementation unchanged into a minimal server-only `access/refreshCaller.ts` (imports Payload APIError/type and generated User type only); import it directly in mutationAuthority, versionEdit and userAssignments. Keep the HTTP-specific assertSiteAdmin/reassertSiteAdmin wrappers in respond; reassertSiteAdmin imports the shared function. Do not add a forwarding re-export once direct consumers are migrated. Existing owner remains access for predicates; the new file gives the already-shared imperative authorization operation an appropriate owner without making access/index import server-only request operations.

Runtime callers: mutationAuthority native user/plan PATCH and user/plan/version DELETE; versionEdit save after plan lock and again after writes, plus make-official before commit; userAssignments after administrator/advisory and target-row locks. Indirect reassertSiteAdmin users stay in respond: userAdminActions (two paths), moderate, systemSettingsSave. Direct unit import: refreshCaller.spec.ts; combineUnavailable.spec.ts mocks respond.refreshCaller and must instead mock the new owner. Preserve APIError 401/403, null/missing/disabled/unverified rejection, session `_sid` validation with trusted-no-session carve-out, original req.user object identity and authentication metadata, and only replacing roles/assignments/signInDisabled/_verified. Preserve findByID depth:0, disableErrors:true, overrideAccess:true and SAME req/transaction. No lock acquisition or call timing moves. This is maintainability, not a claimed supported-path malfunction.

Prose candidate validated against the full fieldSplit implementation: arrays/labels are shared domain vocabulary; normalizers, row/container shape rejection, immutable identity/resource restoration, authority lookup and overlay algorithms stay in the server hook. Preserve null/undefined versus zero versus malformed array distinctions, missing-group behavior, explicit-null rejection for teacher group containers, order/cardinality enforcement and all admin/system carve-outs. Do not move enforcement into the new pure vocabulary module.

Rejected moves: keep auth quotas/messages in authRateLimit and credential timing work in installed-auth hook seam, not generic rateLimit. Keep adminCount acquisition in native beforeOperation and hook/endpoint orchestration; a new authorization helper must not take locks internally. Message reply inheritance and forum version-reference lookup share labels/visibility primitives already but have different null/system/reply failure rules; no generic reference resolver. Keep publication slug collision lookup, pointer validation/cascade/prewarm/favorite-follow effects in lifecycle hooks; only pure slug/publication vocabulary belongs in lib. No cascade abstraction across row-locked discussion deletion, plan children and favorites.

Full files: app/src/hooks/authRateLimit.ts, bundleVersion.ts, discussions.ts, fieldSplit.ts, lessonPlan.ts, loginPasswordWork.ts, messageReference.ts, mutationAuthority.ts. fieldSplit first 200 lines explicitly reread in this task after retained prior reading; remaining lines read through EOF. lessonPlan covered 1-230 and 231-EOF. Additional full dependency: app/src/endpoints/respond.ts and tests/unit/refreshCaller.spec.ts. Partial dependencies: access/index.ts:1-75; versionEdit.ts:225-275,330-365,460-490; userAssignments.ts:220-265; production/test reference search for refreshCaller/reassertSiteAdmin. No exhaustive endpoint/test review claimed.

Remaining: hooks-02, globals-01, payload.config.ts-01, instrumentation.ts-01, proxy.ts-01; finish vocabulary map.

## hooks-02 — complete (618 lines)

Findings: none. userRoles owns lifecycle enforcement across native and custom writes: last usable Site Admin is role+enabled+verified, with global advisory lock before user-row locks; bootstrap uses its own registered key; source assignment diffs, target prior-editor eligibility, handover-only removal asymmetry, provenance and prior-holder demotion belong in hooks rather than routes/UI. Do not move the admin-count lock inside a generic predicate or replace database count with a role-only helper. Do not combine assignment and flag provenance hooks: unchanged assignment provenance, changed flag retirement without actor, and trusted-write ownership differ. Do not genericize collect-all-holder-before-mutating loops with taxonomy deletion: query and update protocols differ, and this hook deliberately preserves forward-only legacy roles and system context flags.

Full source: app/src/hooks/userRoles.ts:1-618 (1-240,241-450,451-EOF). Context: tests/unit/enforceAssignmentScope.spec.ts:1-90; all Users native hook wiring read under collections-01; prior full lib/txDb.ts and firstUserBootstrap.ts. Scope/cascade tests named in source were not claimed read exhaustively.

Remaining: globals-01, payload.config.ts-01, instrumentation.ts-01, proxy.ts-01; vocabulary map.

## globals-01 — complete (277 lines)

Findings: none. SystemSettings correctly owns native schema plus always-rebuilt, per-flag provenance. Existing lib/systemFlagNames.ts is the pure shared vocabulary owner; lib/systemFlags.ts owns strict boolean fail-closed reads and request/render memoization; endpoint owns ceremony, allowed body and locked transaction; global hook runs on the trusted writer too. Preserve private global update denial, hidden native UI, explicit Save endpoint, stored defaults distinct from failure defaults, no-actor changed-row removal, unchanged-row carry-forward and installationId's existing dedicated owner. No generic provenance engine or global-schema-derived client vocabulary. The compatibility re-export of flag names in this global has a real existing test consumer; removing a forwarding export alone is not a substantial ownership improvement.

Full source: app/src/globals/SystemSettings.ts and dependency app/src/lib/systemFlagNames.ts (also fully read in prior lib pass). Partial context this pass: lib/systemFlags.ts:1-100, endpoints/systemSettingsSave.ts:175-235; reference search across System Settings unit/int tests. Prior lib pass fully read systemFlags/advancedTools. One contextual search for root scripts/set-school-name.ts found no such path (actual project CLI is under app/scripts); no claim to have read that CLI here. No tests executed.

Remaining: payload.config.ts-01, instrumentation.ts-01, proxy.ts-01; final vocabulary import/test map.

## payload.config.ts-01 — complete (298 lines)

Findings: none. This is the appropriate composition layer for collections/globals/endpoints/jobs, SMTP adapter options, runtime/build environment and adapter schema registration. Existing publicLibrary/publicPosture/env/generatedSurfaces modules already own reusable decision logic; do not duplicate boot decisions or move resolved-generated-surface checks to onInit. Keep early library refusal before the missing-users-table return, only undefined-table catch carve-out, build-only secret exception, trusted Local API jobs versus external jobs endpoint/CRUD policy and dev/test rate counter schema parity. The small rate-counter pgTable definition is adapter registration infrastructure, not misplaced domain content; moving it out only to shorten this file would add indirection with no second consumer.

Full source: app/src/payload.config.ts. Dependencies fully read in prior own lib/access passes: lib/publicLibrary.ts, publicPosture.ts, env.ts, access/generatedSurfaces.ts. Source reference search for rate_limit_counters/beforeSchemaInit; migration references found but no new full migration reads claimed. No startup/build/tests.

Remaining: instrumentation.ts-01, proxy.ts-01; vocabulary map.

## instrumentation.ts-01 — complete (38 lines)

Findings: none. Next's named runtime lifecycle seam correctly invokes preexisting login-client infrastructure and errorTracking; it forwards explicit route context and drops request headers. Keep Node dynamic import boundary and opt-in tracking decision inside errorTracking. Do not move diagnostics_channel tracking into auth/domain hooks: it must observe socket-origin requests before their HTTP headers reach Payload, and the existing install is idempotent for its CLI/preload and instrumentation consumers. No wrapper removal or generic initializer registry justified.

Full source: app/src/instrumentation.ts. Additional full dependencies: app/scripts/login-client.mjs (67 lines), app/src/lib/errorTracking.ts (42), app/tests/unit/errorTracking.spec.ts. Test/reference search found loginClient.spec.ts, not fully read here. No instrumentation execution.

Remaining: proxy.ts-01; vocabulary map.

## proxy.ts-01 — complete (88 lines)

Findings: none. Document nonce/policy generation belongs at request/response rendering boundary; baseline static headers stay next.config and preview's distinct CSP stays the preview response. Keep exact matcher exclusions, nonce identical in forwarded request and outgoing response, production/development allowances and route-level public-library gate. Do not move Postgres-backed capability resolution to proxy merely because runtime now permits Node. No generic CSP-builder module for a single cohesive caller, and no unify with preview's deliberately different policy.

Full source: app/src/proxy.ts. Additional full dependency app/next.config.ts (114 lines, cat-equivalent sed1-115 reached EOF). Partial test: tests/http/endpoints.http.spec.ts:284-360 (document CSP suite, remainder not read). Initial glob searches for proxy/instrumentation/CSP-specific unit files found no such filenames; the follow-up content search located relevant existing tests above. No HTTP/browser calls/tests.

Remaining: finalize prose-vocabulary candidate's exact import/test/behavior map. All nine requested packets now fully read: 35 assigned source files, 6,610 lines. Some shared dependencies were already fully read at the same immutable commit and retained as explicitly identified above. No packet source left unread.

## Final candidate C01 — pure prose vocabulary below server enforcement

Evidence and layers: hooks/fieldSplit.ts:114-178 currently owns seven prose-key arrays and PROSE_LABELS alongside enforcement that imports Payload Forbidden, access policy and ingest resource handling (imports at 23-31). Pure lib/combine/engine.ts:30-39, lib/editRecovery/projection.ts:48-56 and component helper components/EditRecovery/restoreGroups.ts:13 import values from that server hook. The projection is a runtime dependency of client LessonControls, CombineVersions and EditRecovery. That is an avoidable dependency direction, even if a particular bundler removes unused enforcement code; this review does NOT claim those server dependencies are executed in a deployed client bundle.

Minimal proposed owner: new app/src/lib/proseFields.ts containing ONLY the seven arrays and flat label map, with their relevant canonical documentation moved with them. No Payload, generated runtime types, access, ingest, field config or component dependency. Its sole possible import is existing pure lib/frameworkProse.ts's FRAMEWORK_PROSE_LABELS; retain that established narrow owner of framework labels/help wording, rather than rename or widen it for file-count savings. No re-exporting the vocabulary through fieldSplit after internal imports are migrated.

Exact runtime import edits:
1. hooks/fieldSplit.ts imports LESSON_PROSE, SLO_PROSE, FRAMEWORK_PROSE, SUMMARY_PROMPT_PROSE, FINAL_EXPLANATION_PROSE, SECTION_PROSE, SUMMARY_LESSON_PROSE from ../lib/proseFields; it no longer needs FRAMEWORK_PROSE_LABELS directly. Enforcement functions and META_IDENTITY_KEYS stay here.
2. lib/combine/engine.ts imports all seven arrays plus PROSE_LABELS from ../proseFields.
3. lib/editRecovery/projection.ts imports all seven arrays from ../proseFields.
4. components/EditRecovery/restoreGroups.ts imports PROSE_LABELS from ../../lib/proseFields.

Exact direct test import edits: tests/unit/proseWhitelistDrift.spec.ts:20-29 all arrays+labels; proseLinks.spec.ts:19 SLO/FRAMEWORK/SUMMARY_PROMPT; insertLink.spec.ts:16 FRAMEWORK_PROSE+PROSE_LABELS. Keep metaIdentitySplit.spec.ts import of META_IDENTITY_KEYS/applyEditorFieldSplit and other enforcement test imports at hooks/fieldSplit. Keep native schema construction independent; drift spec still computes intended prose using canEditProse field markers and compares key sets/authored labels against the new pure owner.

Required preservation: identical array order/contents and existing string[] types, FRAMEWORK_PROSE Object.keys derivation, authored English labels and field-map fallback; no widening to Summary Table title, answer exemplars, UNIT or identity/admin fields. Same server whitelist/save/preview checks, Combine structure comparison, captured scope whitelist, row-id projection/overlay and CAPTURE_SCHEMA_VERSION. No native field paths/generated types/schema migration. Update directly relevant canonical-owner comments in fields/lessonContent.ts:31-33,468; collections/EditRecovery.ts:164; projection/drift and enforcement-test comments only where they name moved constants. Leave references to applyEditorFieldSplit/META_IDENTITY_KEYS as hook references. No broad documentation rewrite.

Related existing generator/proseLinks.ts:150-167 has similarly named arrays, but it owns the rendering/linkification walk, including admin prose outside the editing whitelist and intentionally omitted titles. Do NOT pull this generator policy into the editing contract as part of the move. proseLinks.spec.ts:61-85 is an independent mapping-agreement check and should stay so; moving the test import does not make both sides share an implementation. No vendor or output changes.

Existing focused behavior tests to retain/run if implemented: proseWhitelistDrift, insertLink, proseLinks, fieldSplitContainers, metaIdentitySplit, emptyArraySerialization, resourceLinks, editRecoveryProjection, captureDiffAgreement, restorePromptGroups, combineEngine, combineFields, combineOutcome. These are a relevant existing-test inventory, not an exhaustive coverage claim and were not executed here. Direct full test read this pass: proseWhitelistDrift.spec.ts. Partial/context reads this pass: proseLinks.spec.ts:1-105, insertLink.spec.ts:1-85, combineUnavailable.spec.ts:1-85; restoreGroups.ts:1-95 (whole source already fully read in prior own lib review), generator/proseLinks.ts:130-EOF. Indirect client import reference search reached LessonControls/index.tsx, CombineVersions/index.tsx and applyOverlay.ts, EditRecovery/useEditRecovery.ts and RestorePrompt.tsx; those component files were not fully read in this core task. Prior own lib review fully read Combine engine and recovery projection at the same immutable commit.

## Final status

Completed all nine requested core packets, 35 assigned source files / 6,610 lines. Two optional maintainability candidates, C01 prose vocabulary and C02 caller-refresh ownership; no newly established runtime defect. C01 extends the previous own shared-lib candidate after complete hook/native field reading. Exact full/partial dependency/test coverage is listed per packet and above. No source packet remains unread; no implementation, repository/git/live action, test execution, external service action, other-agent report reading, agents or merges. Only this sanitized working checkpoint was written. Exhaustive test review remains with its assigned later review; independent challenge and any implementation remain coordinator work.
