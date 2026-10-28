# Core reuse review (fixed v1.10 source)

Read-only review at baseline `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`. Packet checkpoints follow in assignment order. Test files are representative context only; test review is separate.

## access-01

### Finding

- **One deletion policy currently has two implementations.** `app/src/access/versioning.ts:76-85` builds the `Where | boolean` form in `deletableVersionsWhere`; `versioning.ts:100-114` independently evaluates the per-document form in `canDeleteVersionDoc`. The same file and `canDeleteVersionDoc.spec.ts` explicitly require both to mean Site Admin → any, Subject Admin → any in their subject-grade, editing access → only their authored versions in that subject-grade. The query form also has special cases for no grants and missing user id; the document form normalizes possibly missing/populated `subjectGrade` and `author` through `toId`. Smallest safe shared ownership: introduce a small policy-scope value helper in `versioning.ts` (e.g. `{ all, subjectAdminIds, editorIds, authorId }`, with `authorId` absent when `u?.id == null`); have `deletableVersionsWhere` build its existing boolean/Where from it and `canDeleteVersionDoc` evaluate the same scope against normalized document ids. Preserve exact output `true`/`false`/`{or: ...}`, editor grant's required caller id, and Site Admin behavior even when the document has no subject-grade id. The current duplicate policy can drift between the Manage button and the collection's server gate; one policy-scope calculation would make a role/scope change land in one place. This does not change the separate Official-version prohibition (`enforceOfficialNotDeletable`), either caller's access path, errors, null handling, or transactions.

### Rejected / not findings

- `lessonPlanRead` and `lessonBundleVersionRead` both return `Boolean(user)`, but they are single-line trivial guards; extracting them adds a name without meaningful maintenance savings.
- `bundle.ts:subjectGradeIdFor` and `versioning.ts:subjectGradeIdFor` both choose `data.subjectGrade ?? doc.subjectGrade`, but are tiny field-access adapters with distinct type context. Not worth moving a two-line cast/helper across modules.
- `versionUpdateGrantForFormRenderOnly` and `enforceVersionImmutable` are intentionally paired but answer different questions: Payload form editability versus persistence authorization. `lockedDocuments.ts` is the documented, narrow caller allowed to reuse the form grant. No consolidation.
- `lockedDocuments.ts:refId` handles Payload's generated lock relation shape `{ relationTo, value }`; access `toId` handles the domain's numeric relationship id or populated document. Their representation/null semantics differ.
- `canEditProse`, `canEditStructure`, and `systemOnly` are already shared field gates; generated-surfaces lockdown is one explicit named policy per generated surface rather than general access logic.

### Coverage

- **Packet implementations fully read:** `app/src/access/bundle.ts`, `generatedSurfaces.ts`, `index.ts`, `lockedDocuments.ts`, `versionImmutability.ts`, and `versioning.ts`.
- **Relevant caller/dependency context:** full `app/src/lib/personalVersions.ts` read from prior lib packet work; focused ranges in `components/AdminDashboard/index.tsx`, `components/LessonControls/index.tsx`, `endpoints/recovery.ts`, and `collections/LessonBundleVersions.ts` inspected; searched all source references to packet helpers. These caller files were partial, not full.
- **Representative test context read:** full `app/tests/unit/canDeleteVersionDoc.spec.ts`; searched collection/access references and found no unit test directly comparing the produced Where to per-document decisions. Other access wiring/integration tests were identified, not read comprehensively. Tests are context only.

## collections-01

### Findings

- None source-confirmed at a worthwhile extraction level. The collection source contains several superficially similar flows, but they intentionally differ in write and lifecycle semantics; a common hook would risk hiding those boundaries.

### Rejected / not findings

- `Subject.ts:47-60` (`refreshSubjectGradeTitles`), `SubjectGrade.ts:55-69` (`guardSubjectGradeDelete`), and `hooks/userRoles.ts:577-592` (`autoDemotePriorSubjectAdmins`) each collect all matching rows using a `limit: 200`, sorted, paginated `find` loop before writes. A generic paginate-all helper could centralize page progression, but the queries have different access overrides, transaction/lock guarantees, and result types; the current three small loops make those invariants visible. The important collect-before-write ordering is deliberately repeated because writes mutate the match set in the latter two flows. No proposed extraction.
- Subject and SubjectGrade delete guards both report actionable `APIError(409)` for FK-related content, but SubjectGrade also cascades role rows while Subject blocks until all children are removed. Shared guard abstractions would obscure distinct delete consequences.
- The duplicate-grade `beforeValidate` and display-name `beforeChange` hooks each narrow the partial `subject`/`grade` payload, but they serve separate phases and call different APIs; no meaningful shared domain rule emerges beyond a tiny two-branch adapter.
- User deletion composes separate favorite, message, recovery, and discussion-participation hooks. Their lock/order/nulling semantics are collection-specific; composition is already explicit on `Users.beforeDelete`.
- System-only field gates in `Users` differ by axis (`_verified`, `signInDisabled`, `roles`, `assignments`, provenance fields); comments and access functions make these distinctions load-bearing. No consolidation.

### Coverage

- **Packet implementations fully read:** `app/src/collections/DiscussionParticipation.ts`, `DiscussionReplies.ts`, `DiscussionTopics.ts`, `EditRecovery.ts`, `Favorites.ts`, `LessonBundleVersions.ts`, `LessonPlans.ts`, `Messages.ts`, `Subject.ts`, `SubjectGrade.ts`, and `Users.ts`.
- **Relevant dependency context:** `app/src/hooks/userRoles.ts` pagination/demotion section read; searched collection, hook, endpoint pagination and cascade references. Packet collection helper modules (Favorites, EditRecovery, Messages, DiscussionParticipation) were full reads.
- **Representative test context:** searched relevant unit/integration references; full taxonomy-delete integration spec not read. Focused test semantics were inspected via matching lines, including `taxonomyDelete.int.spec.ts`, `messages.int.spec.ts`, `discussions.int.spec.ts`, `editRecoveryAccess.int.spec.ts`, and `favorites.int.spec.ts`. Tests are context only, not full test coverage.

## fields-01

### Findings

- None source-confirmed at a worthwhile extraction level. Existing factories and shared constants already own the repeated field configuration and controlled vocabularies in this packet.

### Rejected / not findings

- `identity.ts` repeats hidden/read-only/system-only field configuration across `worldwideIdField`, `releaseFingerprintField`, `installationIdField`, and `aresReleaseField`; each `beforeChange` has different reset, copy, context, and null semantics, and only one field optionally exposes read access/indexing. A generic context-driven factory would add indirection around behavior that must remain field-specific; the shared access function `systemOnly` is already reused.
- `officialChange.ts:stamp` intentionally parametrizes three audit fields but preserves distinct output types and a key comparison based on normalized relationship IDs. No additional shared policy was found in the assigned fields.
- `lessonContent.ts:resourceRecordFields` is already a shared factory for video/reading records; `RESOURCE_PHASE_KEYS` is imported from `ingest/resourceLinks.ts` for options and row cardinality, and `PHASE_VALUES` feeds `PHASE_OPTIONS` plus `isPhase` in `phases.ts`. No duplicate source of truth to extract.
- `prose`, `proseAdmin`, `structureText`, `adminOnly`, `storedNotEdited`, and `collapseOnEntry` form intentional field constructors with distinct access/presentation semantics. The adjacent repeated `adminOnly` gate on the panel and member fields is documented as layout convenience plus invariant carried by the field; removing it would permit future re-layout to lose the field gate.

### Coverage

- **Packet implementations fully read:** `app/src/fields/bundleFields.ts`, `identity.ts`, `lessonContent.ts`, `officialChange.ts`, and `phases.ts`.
- **Relevant dependencies/callers:** searched source references to all exported factories/constants; focused call sites include `collections/LessonBundleVersions.ts`, `collections/LessonPlans.ts`, `collections/Users.ts`, and `globals/SystemSettings.ts` (not full reads in this packet). `ingest/resourceLinks.ts` and `hooks/fieldSplit.ts` were consulted by focused search/ranges, not fully re-read here.
- **Representative test context:** searched `resourceRowDrift.spec.ts`, `collapsedPanelEntryRule.spec.ts`, and `proseWhitelistDrift.spec.ts` for coverage intent; not full-test reads. Test suite review is separate.

## hooks-01

### Finding

- **The saved-version reference projection is copied in three server paths.** `hooks/discussions.ts:52-57` (`resolveReference`), `hooks/messageReference.ts:63-84` (`validateContextLink`), and `app/(frontend)/messages/page.tsx:51-55` all pass the same `select: { lessonPlan: true, title: true, semver: true, meta: { substrand_name: true } }` to `findReadableVersion` or `findByID`. The shared consumer `lib/lessonReference.ts:12-17` (`versionReferenceLabel`) reads title, semver, and `meta.substrand_name`; all three callers also use `lessonPlan` to derive/check plan ownership. If that shared label/input shape changes, these three projections need coordinated edits and can silently drift into undefined labels or missing ownership data. Smallest safe change: export one immutable `VERSION_REFERENCE_SELECT` projection from the shared reference/read helper module and use it at all three lookups. Keep each lookup path and its visibility/error policy intact: forum and ordinary messages use `findReadableVersion` (404/403 → null, operational errors propagate); trusted Local API message creation still uses `findByID` with `overrideAccess: true`; reply inheritance still tolerates an inaccessible/deleted old version by preserving the prior label; the frontend still detects a version-plan mismatch. This is a query-shape extraction only, not a shared resolver.

### Rejected / not findings

- `fieldSplit.ts` has repeated labels/prose keys mirrored in client code, but its header documents the client-bundle boundary and `proseWhitelistDrift.spec.ts` pins the copy. Do not derive the editor restore data from the server field schema.
- `discussions.ts:38-64` and `messageReference.ts:13-96` both derive reference labels but their business operations differ: discussion links require a visible version and store its actual plan; a reply inherits an immutable snapshot and may degrade a now-missing link to a label-only historical reference; message create also accepts trusted Local API writes. Share only the exact selection shape, not the resolver/error behavior.
- `authRateLimit.ts` uses per-surface policy tuples but login's client-first two-bucket ordering and hashed target differ from signup/forgot-password target-then-global charging. Keep the intentionally distinct charge order and buckets.
- `lessonPlan.ts:validationError` is a local Payload error-shape helper with multiple path choices; publication/public slug functions already come from `lib/publicSlug.ts`. No further duplication.
- `bundleVersion.ts` and `lessonPlan.ts` each enforce opposite sides of the Official pointer invariant. They deliberately use different lock timing: the delete hook must lock before read; pointer update's own row write lock is sufficient. Do not merge their guards.
- `applyEditorFieldSplit`'s duplicated top-level and group-level handling is explicitly parameterized/rebuilt to preserve field split, empty sentinel, null, omission, and row-order semantics; no safe simplification surfaced in this review.

### Coverage

- **Packet implementations fully read:** `app/src/hooks/authRateLimit.ts`, `bundleVersion.ts`, `discussions.ts`, `fieldSplit.ts`, `lessonPlan.ts`, `loginPasswordWork.ts`, `messageReference.ts`, and `mutationAuthority.ts`.
- **Relevant caller/dependency context:** full `app/src/lib/readBundle.ts` and `lib/lessonReference.ts`; focused ranges in `app/(frontend)/messages/page.tsx` and `collections/Messages.ts`; source searches for hook exports and existing helper callers. Messages/Discussion collection files were not fully reread in this packet.
- **Representative test context:** searched `discussions.spec.ts`, `messageContextLink.spec.ts`, `fieldSplitContainers.spec.ts`, `mutationAuthority.spec.ts`, `officialPointerPartialUpdate.spec.ts`, and publication/signup/integration references. Matching cases were inspected via focused search; these test files were not fully read. Tests are context only.

## hooks-02

### Finding

- **Usable-administrator eligibility is represented twice.** `hooks/userRoles.ts:93-95` (`isUsableSiteAdmin`) defines a usable administrator in memory as site-admin role + not disabled + verified. `:138-152` separately encodes the same rule in Payload's count `Where`, adding the self-exclusion. These two forms are the core of the last-admin policy; adding a future usability axis or changing legacy-null handling in only one form can make before-change decisions disagree with the count. Smallest safe change: name and centralize the query predicate builder (with an explicit `excludeUserId`) beside the pure predicate, and retain the two representations with a comment that the SQL form must match the predicate. If a shared representation is pursued, preserve `signInDisabled = false OR field absent` exactly (not `not_equals: true`, and do not silently broaden to null unless the predicate/contract is deliberately changed), `_verified = true`, `roles contains siteAdmin`, and the self-exclusion. Keep `takeAdminCountLock()` before the count, `overrideAccess: true`, and caller transaction; no timing or lock-order change.

### Rejected / not findings

- `takeAdminCountLock` wraps `takeAdvisoryLock(req, 'adminCount')`, and the exported `ADMIN_COUNT_LOCK` aliases the registered lock. This is intentional ownership/order API for custom endpoints; it is not a second lock implementation.
- Assignment row signature, before/after diffing, and provenance stamping all use related row identities but answer separate policy questions (role changes, authorization scope, and audit carry-forward). Do not consolidate them into a generic assignment mutator.
- The SubjectGrade/user-role cascades and `autoDemotePriorSubjectAdmins` repeat collect-all pagination, but mutation-under-lock and access context differ. The previous packet records why a broad pagination helper is not a safe simplification.

### Coverage

- **Packet implementation fully read:** `app/src/hooks/userRoles.ts`.
- **Relevant dependency/caller context:** `lib/txDb.ts` lock API and `collections/Users.ts` hook ordering were inspected previously; focused `Subjects`/`SubjectGrade` cascade context from collections-01. No caller policy was merged with the hooks.
- **Representative test context:** read the relevant cases in `tests/int/userSecurity.int.spec.ts` for last-admin demotion, disable, delete, disabled cover, unverified cover, unverify and positive control. Other user-role tests were located but not read fully.

## globals-01

### Findings

- None. The global re-exports the central `SYSTEM_FLAGS` list; `stampFlagChanges` is a purpose-built audit projection with materially different behavior from assignment provenance stamping.

### Rejected / not findings

- `SystemSettings.ts:72-118` (`stampFlagChanges`) and `hooks/userRoles.ts:478-524` (`stampAssignmentProvenance`) both rebuild system-owned provenance. The former diffs boolean feature flags, removes stale provenance on userless system changes, and records each changed flag; the latter matches role/scope rows, carries existing grant provenance through unrelated edits, and stamps new/changed grants. A generic stamper would obscure changed-row deletion versus carry-forward semantics.
- Individual `features` checkbox config differs in defaults, labels, and env-ceiling meaning. The known list/allowlist is already shared through `lib/systemFlagNames.ts`; no duplicate flag set was found in this global.
- `installationIdField` is reused from `fields/identity.ts`; no duplicate field implementation here.

### Coverage

- **Packet implementation fully read:** `app/src/globals/SystemSettings.ts`.
- **Relevant caller/dependency context:** `fields/identity.ts` (full read in fields packet), `lib/systemFlagNames.ts` (searched and its declaration inventory entry inspected), and `hooks/userRoles.ts` provenance function. `endpoints/systemSettingsSave.ts` and `lib/systemFlags.ts` were identified from the global's documented callers, not fully read in this packet.
- **Representative test context:** not independently read for this packet; searched setting/provenance references only. Test suite review is separate.

## payload.config.ts-01

### Finding

- **Job REST access repeats the existing Site-Admin access helper four times.** `payload.config.ts:193-196` repeats `({ req }) => isSiteAdmin(req.user)` for task `run`, `queue`, and `cancel`; `:212` repeats it for `payload-jobs` collection `read`. `access/index.ts:83` already exports `siteAdminOnly` for this exact collection access policy, implemented by the same `isSiteAdmin` check. The repeated inline callbacks create four places to keep the restricted job surface consistent. Smallest safe change: reuse `siteAdminOnly` for the three task operations and job collection read, subject to the installed job access type accepting the same structural callback; otherwise define one local typed callback and assign it in all four places. Keep `create/update/delete: () => false`, the existing generated-surface closure, and Local API `overrideAccess` behavior unchanged.

### Rejected / not findings

- Payload's generated `payload-jobs-stats` surface is already handled by `applyGeneratedSurfacePolicy` once after `buildConfig`; the generated policy is separate from the direct job/task access config because it does not exist until sanitization.
- The three endpoint permissions and job collection read use the same role predicate but serve separate Payload surfaces; only the callback policy should be shared, not the config structures or write-denial rules.
- `onInit`'s two boot refusals are distinct checks with different failure conditions and ordering, delegated to `publicLibraryBootRefusal`, `isUndefinedTableError`, and `firstUserBootRefusal` where shared ownership exists.

### Coverage

- **Packet implementation fully read:** `app/src/payload.config.ts`.
- **Relevant helper/dependency context:** `app/src/access/index.ts` `siteAdminOnly` and `isSiteAdmin`; `access/generatedSurfaces.ts` referenced and used policy was read in prior access packet. Referenced endpoint/task modules were not fully read.
- **Representative test context:** inspected relevant `generatedSurfaces.spec.ts` sections for the built config policy; task access behavior is not covered by the focused test lines inspected. No Payload jobs access unit behavior was executed.

## instrumentation.ts-01

### Findings

- None. The two runtime-specific entrypoints have separate responsibilities; each owns its own Node-runtime guard so neither imports the tracker into an Edge bundle.

### Rejected / not findings

- Both exports check `NEXT_RUNTIME === 'nodejs'`, but they are independently invoked Next hooks (boot registration vs per-request error capture). A shared wrapper would add indirection without removing a meaningful policy definition, and dynamic imports remain distinct.
- `register` and `onRequestError` both import `lib/errorTracking`, but one initializes the SDK and the other captures an error; no shared action is present.

### Coverage

- **Packet implementation fully read:** `app/src/instrumentation.ts`.
- **Relevant dependency/caller context:** `app/src/lib/errorTracking.ts` wiring comments read; searched all source/test references.
- **Representative test context:** searched `tests/unit/errorTracking.spec.ts` for instrumentation contract; did not read the whole spec.

## proxy.ts-01

### Findings

- None. The policy is request-specific because the nonce is embedded in both request CSP (for Next rendering) and response CSP; no equivalent helper can own that entire behavior.

### Rejected / not findings

- Security headers also appear in `next.config.ts`, but those are static response headers and the proxy's CSP must carry a request-minted nonce. Moving/merging CSP would alter Next's nonce propagation or the static API/preview exclusions; the existing split is deliberate.
- `dev` is consulted in the script and connect directives, but extracting a configuration wrapper around two conditional fragments is not meaningful reuse.
- The proxy's matcher is framework wiring, not a duplicated domain predicate elsewhere in the assigned source.

### Coverage

- **Packet implementation fully read:** `app/src/proxy.ts`.
- **Relevant dependency/caller context:** inspected matching security-header definitions in `app/next.config.ts` via focused search; full file not read. Next renderer behavior is documented in the packet source comments and was not independently re-verified in this review.
- **Representative test context:** searched source/tests for CSP and proxy references; no focused proxy-specific unit spec was found in the searched unit paths. Browser verification context is documented in comments, not reread here.
