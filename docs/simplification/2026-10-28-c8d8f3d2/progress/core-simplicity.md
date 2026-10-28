# SIMPLICITY review — core packets

Baseline: immutable v1.10 snapshot `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91` at `/home/james/Documents/Codex/2026-10-26/ares-v110-review`. Read-only. No tests run and no repository changes.

## access-01 — complete (6 source files, 652 lines)

No material simplicity candidate. Access helpers are intentionally split by capability and subject-grade scope; the query form `deletableVersionsWhere` and document form `canDeleteVersionDoc` support server access vs UI decisions. The three-level role model remains asymmetric by design: `subjectAdmin` includes structural/admin authority, `editor` is per-subject-grade prose capability, and role presentation is not the authorization model.

Purposeful complexity to retain:
- `versionImmutability.ts`'s update render grant paired with `enforceVersionImmutable`: Payload requires update permission to render the form writable, while the hook prevents all authenticated in-place writes. These functions must remain paired; neither is redundant.
- `lockedDocuments.ts`'s separate create/read/update/delete policies mirror Payload native lock UI operations; read stays available for conflict warnings, takeover is not owner-only, and only selected collections lock.
- `generatedSurfaces.ts` mutates Payload's built/sanitized config and fails closed if generated surfaces change; explicit slug policies avoid pattern-based accidental exposure.
- `usersCollectionCreate` must distinguish anonymous registration after first bootstrap from authenticated role-based user management; field-level privacy and role access are independently enforced.

Context read (not exhaustive test review): searched consumers across collections, fields, hooks, pages, components, endpoints, and lib; this established both query/document policy uses and the lock-target access callback. Located wiring/behavioral tests from source comments but did not read tests exhaustively or run them. No edits. Worktree clean.

Files fully read: `app/src/access/bundle.ts`, `generatedSurfaces.ts`, `index.ts`, `lockedDocuments.ts`, `versionImmutability.ts`, `versioning.ts`.

## collections-01 — complete (11 source files, 2,023 lines)

No material simplicity candidate. The collections are mostly policy wiring; their apparent repetition preserves collection-specific read/write rules, required-field relationships, and independent hook ordering.

Purposeful complexity to retain:
- Discussion topic/reply create paths keep content immutable after creation while system-only activity, pinning, redaction, ordering, and participation updates use their specific hooks/endpoints. The topic lock requirement and deletion lock ordering support row consistency/deadlock avoidance.
- `EditRecovery` keeps all access closed, uses one closed predicate, and cascades recovery rows only before required-FK parents disappear; the sparse JSON overlay is the documented schema exception.
- Favorites have role-dependent follower/pinned semantics outside the collection, no update path, and required-FK cascades; Messages retain sender/recipient-only privacy and separate ping budgets from message creation success.
- Subject and SubjectGrade retain friendly validation alongside DB uniqueness constraints. Their title refresh and delete fan-outs are paginated and collect-before-write because the matching set changes during updates.
- LessonBundleVersions retain form-render update access paired with immutability hooks, the individual structural/system-field gates, and explicit operation routes. The apparent hidden/readonly/UI nesting is tied to Payload form-state behavior and does not duplicate stored content.
- Users keep per-field access axes separate, especially for open signup, private email/role data, verification, disabled login, and system-stamped assignment provenance. Hook order around locks and first-user bootstrap is meaningful.

Context read (not exhaustive test review): collection imports and callers were cross-checked against `access`, assigned hooks/endpoints, and parent cascade exports; located relevant wiring/unit/int specs via names/comments and `rg`, but did not exhaustively read tests or run them. No changes. Worktree clean.

Files fully read: `DiscussionParticipation.ts`, `DiscussionReplies.ts`, `DiscussionTopics.ts`, `EditRecovery.ts`, `Favorites.ts`, `LessonBundleVersions.ts`, `LessonPlans.ts`, `Messages.ts`, `Subject.ts`, `SubjectGrade.ts`, `Users.ts`.

## fields-01 — complete (5 source files, 729 lines)

No material simplicity candidate. The factories (`prose`, `proseAdmin`, `structureText`, `storedNotEdited`, `adminOnly`) describe distinct field policies and UI affordances; field layout and field-split authority intentionally overlap because they are different enforcement/presentation layers.

Purposeful complexity to retain:
- `lessonContent.ts` keeps native nested content fields and the full generator schema. Field arrays mirror the ARES contract/vendor readers; `lessonContentFields` is an exported test inventory reused by multiple drift specs, not an adapter.
- The prose whitelist remains the write authority; field access alone cannot safely filter optional nested array fields. `adminOnly` provides role-aware form visibility, while repeated access/whitelist rules and hidden-but-stored fields preserve data and provide separate guarantees.
- `storedNotEdited` hides controls without dropping generator input. System-only resources and generated row numbers remain distinct from admin-only structure and teacher-editable prose.
- Linkable vs non-linkable prose fields differ by editor behavior; one shared factory avoids a second policy spelling.
- Worldwide identity uses hook-generated UUIDs because trusted writes bypass access; release metadata and installation ID have different context rules. The release fingerprint is a frozen format.
- `officialChangeFields` share one stamping hook while preserving three distinct stored values; `PHASE_VALUES` is shared by UI and validation/generator checks.

Context read (not exhaustive test review): searched collection wiring, hook references, schema-drift specs, and all field factory use sites. The collection's two-field-array composition and tests' composite inventory are intentional. Tests were located but not exhaustively read or run. No edits; worktree clean.

Files fully read: `bundleFields.ts`, `identity.ts`, `lessonContent.ts` (all 495 lines in chunks), `officialChange.ts`, `phases.ts`.

## hooks-01 — complete (8 source files, 1,887 lines)

No material simplicity candidate. The hooks centralize cross-cutting invariants but their explicit branching tracks distinct persistence, trust, and transaction cases rather than incidental implementation detail.

Purposeful complexity to retain:
- `authRateLimit.ts` keeps separate limits/buckets and restores the temporary admin rate budget in `finally`; keying and error messaging are distinct behavior.
- `bundleVersion.ts` separates field split and deletion/race protections; generate-once behavior and immutable snapshot writes are versioning invariants.
- `discussions.ts` coordinates immutable authored content with mutable system metadata, duplicate detection, rate limits, reply sequencing, and lock ordering; these are separate authorities and consistency needs.
- `fieldSplit.ts` normalizes the incoming Payload shape, validates submitted rows, then rebuilds from the prose whitelist. Repeated traversal is the enforcement boundary, including accepted serializer sentinel forms and resource-link preservation.
- `lessonPlan.ts` has independent partial-update rules for pointer and public slug, immutable subject-grade, cascades/follower retargeting, and guarded transaction error handling. Its `in` checks preserve absent-vs-null semantics; ordering and rollback-sensitive branches are not removable cleanup.
- `loginPasswordWork.ts`'s dummy hash path preserves comparable password work for absent accounts; `messageReference.ts` distinguishes trusted Local API from user-scoped reads and handles inherited links; `mutationAuthority.ts` deliberately serializes admin writes and locks the target before downstream reads/access.

Context read (not exhaustive test review): searched collection/hook/endpoint callers and matching unit/integration specs, including collection wiring, pointer partial updates, plan immutability, field split, follower-retarget and discussion behavior. Tests were context only and not exhaustively read or run. No edits; worktree remains clean.

Files fully read: `app/src/hooks/authRateLimit.ts`, `bundleVersion.ts`, `discussions.ts`, `fieldSplit.ts`, `lessonPlan.ts`, `loginPasswordWork.ts`, `messageReference.ts`, `mutationAuthority.ts`.

## hooks-02 — complete (1 source file, 618 lines)

No material simplicity candidate. Role hooks carry deliberately separate responsibilities for admin-count safety, first-user bootstrap, password authorization, assignment-scope deltas, grant provenance, and the per-subject-grade handover invariant. Combining them would obscure which hook runs at which point in Payload's transaction and lifecycle.

Purposeful complexity to retain:
- `ADMIN_COUNT_LOCK` is a single shared key across demote/delete/disable and grants, acquired before row locks. `takeAdminCountLock` is exported for custom endpoints to honor that lock order; the guard's second acquisition is intentionally reentrant.
- `isUsableSiteAdmin` checks role, enabled sign-in, and verified status. The count query expresses the same predicate in database terms, including nullable legacy sign-in flags; these are not redundant checks.
- `guardLastSiteAdmin` protects self-disable separately and compares before/after usability on partial updates. The delete hook uses a projected lookup because only those fields are needed.
- `grantSiteAdminToFirstUser` serializes the initial count and distinguishes first-register from ordinary create. Its extra request marker check follows the lock because Payload's outer existence check is not serialized.
- `enforceAssignmentScope` keeps addition and removal sets distinct because role handover permissions are asymmetric. The role-bearing signature, system-write context, target precondition against prior editing access, and actor-scope loop each support different invariants.
- `stampAssignmentProvenance` matches rows by subject-grade plus role, carries immutable provenance through unrelated resubmits, and stamps new/changed grants. `autoDemotePriorSubjectAdmins` locks all target grades, paginates holders before writes, and uses context to prevent recursion.

Context read (not exhaustive test review): checked `Users.ts` hook order and endpoint uses of the admin-count lock; searched unit/integration/http references for bootstrap, lock order, assignment scope, demotion, and handover. Located tests but did not exhaustively read or run them. No edits; worktree clean.

File fully read: `app/src/hooks/userRoles.ts`.

## globals-01 — complete (1 source file, 277 lines)

No material simplicity candidate. `stampFlagChanges` deliberately rebuilds owned provenance on every write, even when the flags do not change, because trusted writes can bypass field access and may carry forged values. Its anonymous/system path drops history only for flags changed without an attributable actor; retaining the old row would assert false provenance.

Purposeful complexity to retain:
- The single `SYSTEM_FLAGS` source feeds field names and provenance diffing; the dependency-free names module also avoids an import cycle across server and client consumers.
- The three flag defaults and public-library ceiling differ by operator decisions and deployment semantics; they should not be normalized to one default or one gating pattern.
- Field access, global access, admin hiding, and the dedicated Save endpoint protect separate surfaces. The hidden ordinary global form and false update access are not duplicate controls.
- Per-flag provenance and installation identity are system-written; the feature group remains native fields. `maxDepth: 0` on `changedBy` avoids unused relationship population.

Context read (not exhaustive test review): traced the Save endpoint, system-flag reader, school-name and installation-ID writers, and searched relevant unit/int/http specs. Tests were context only, not exhaustively read or run. No edits; worktree clean.

File fully read: `app/src/globals/SystemSettings.ts`.

## payload.config.ts-01 — complete (1 source file, 298 lines)

Candidate:
- `app/src/payload.config.ts:252-267`, `onInit` local `userCount`: it starts as `number | null`, but every path reaching `firstUserBootRefusal` has assigned a number. The only path that intentionally means “count unavailable” returns from the catch, while every other failure throws. That leaves an unnecessary nullable state in the caller and makes the control flow look as if null may be passed when it cannot. Minimal behavior-preserving change: declare `let userCount: number` and preserve the current assignment/catch/early-return/throw branches. The helper `firstUserBootRefusal` can remain nullable because it is also a pure decision helper whose unit cases model unavailable counts; the config caller does not need to manufacture that state. Verify with TypeScript and the public-posture unit spec.

Purposeful complexity to retain:
- Runtime-only production secret validation skips only the static build phase. SMTP transport options derive from the adapter's declared type while accounting for nodemailer's runtime auth shape.
- `applyGeneratedSurfacePolicy` is chained after config construction because generated Payload surfaces only exist after sanitization. Generated job collection/global access overrides and job endpoint access are separate surfaces.
- `onInit` checks public-library prerequisites before the user-count early return; only the expected missing-table error is suppressed. Other database errors must stop boot.
- Collection order controls admin navigation; task registrations, cron limit, and explicit REST access overrides encode distinct operations/default surfaces.
- `SERVER_URL: ''` and the GraphQL route deletion pair document concrete Payload behavior rather than gratuitous configuration.

Context read (not exhaustive test review): checked public-posture helper signature/spec references and traced the generated-surface policy, job task registrations and config imports. Located tests but did not exhaustively read or run them. No edits; worktree clean.

File fully read: `app/src/payload.config.ts`.

## instrumentation.ts-01 — complete (1 source file, 38 lines)

No material simplicity candidate. The repeated Node-runtime guard belongs to two independently invoked Next instrumentation hooks; consolidating them would not reduce a live abstraction and risks changing the framework-discovered exports. Dynamic imports keep Node-only tracking code out of the edge bundle, which Next still compiles.

Purposeful complexity to retain: `register` installs login-client handling and initializes error tracking once; `onRequestError` forwards only route/method metadata and deliberately drops request headers. The runtime checks and import boundaries are required by Next's dual-runtime compilation behavior.

Context read (not exhaustive test review): traced `errorTracking.ts`, the `register`/`onRequestError` test references, and login-client env usage; no tests were run. No edits; worktree clean.

File fully read: `app/src/instrumentation.ts`.

## proxy.ts-01 — complete (1 source file, 88 lines)

No material simplicity candidate. The policy is assembled once from directive parts and then placed on both the forwarded request and response because Next uses the incoming policy to nonce rendered scripts while browsers enforce the response policy. The matcher exclusions are part of document-only scope and prefetch behavior, not redundant conditions.

Purposeful complexity to retain:
- Per-request nonce generation and a complete strict CSP are required for hydrated dynamic documents; dev-only eval/WebSocket allowances do not leak into production.
- Request-header forwarding and response-header enforcement serve different consumers. The API exclusion preserves endpoint-owned CSP and avoids applying document policy to non-documents.
- The known pre-rendered error-shell caveat is explicitly accepted; forcing dynamic rendering would add cost for a low-value edge case.
- Proxy runs on Node under Next 16; there is intentionally no runtime segment declaration.

Context read (not exhaustive test review): checked `next.config.ts` CSP context and located the HTTP CSP and public-library references; tests were not exhaustively read or run. No edits; worktree clean.

File fully read: `app/src/proxy.ts`.
