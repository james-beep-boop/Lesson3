# SIMPLICITY review — integration tests, packet tests-int-01

Baseline: immutable v1.10 snapshot `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`, read-only review. Assigned test source was fully read; no tests executed and no implementation files were read for this packet.

## Packet result

No concrete behavior-preserving simplification candidate found. The repetitions I examined preserve distinct role/operation assertions, prove database effects rather than trusting Local API results, or encode non-vacuity/failure-safe teardown. In particular, the discussion specs repeat explicit lock-holder transactions because each pins a different race/invariant; collapsing them into generic assertion machinery would make their distinguishing writes less legible. `editRecoveryAccess` repeats per-operation role loops intentionally, with distinct row-persistence assertions.

## Coverage

Fully read assigned files:

- `app/tests/int/access.int.spec.ts`
- `app/tests/int/adminResetLinkCarveOut.int.spec.ts`
- `app/tests/int/api.int.spec.ts`
- `app/tests/int/assignmentProvenance.int.spec.ts`
- `app/tests/int/authFavorites.int.spec.ts`
- `app/tests/int/authRateLimit.int.spec.ts`
- `app/tests/int/bestEffortEnqueue.int.spec.ts`
- `app/tests/int/clearCollapsePrefs.int.spec.ts`
- `app/tests/int/combineDraftMigration.int.spec.ts`
- `app/tests/int/combineMigration.int.spec.ts`
- `app/tests/int/discussions.int.spec.ts`
- `app/tests/int/discussions3b.int.spec.ts`
- `app/tests/int/discussions4a.int.spec.ts`
- `app/tests/int/draftCombineSuggestion.int.spec.ts`
- `app/tests/int/editRecoveryAccess.int.spec.ts`

Context dependencies read: none. Tests were assessed in their source context only. No partial assigned files; packet complete.

## Rejected reductions / deliberate complexity

- Keep `bestEffortEnqueue.int.spec.ts`'s real failed SQL injection, call-count guard, persisted-row reread, both enqueue call-sites, and separate orphan-no-op versus real generator failure assertions. Mocking only a rejection or folding behavior classification into the no-throw check would weaken the regression.
- Keep the explicit role and operation loops/assertions in `access.int.spec.ts` and `editRecoveryAccess.int.spec.ts`; distinct create/read/list/update/delete guarantees and postcondition checks make direct-access closure observable.
- Keep the independent SQL lock-holder writes and precondition waits in discussion tests. Their setups distinguish actual reply/redaction/deletion/participation interleavings; generic helpers would obscure the competing state transition.
- Keep migration up/down/idempotence/content/timestamp checks and recovery failure-safe teardown. These are separate persistence invariants rather than duplicate assertions.

## Next

Proceed to `tests-int-02` in manifest order; checkpoint that packet before continuing.

# SIMPLICITY review — integration tests, packet tests-int-02

## Packet result

No concrete simplification candidate found. The recovery tests are intentionally explicit about fencing-token state, transactional versus pool behavior, expiry selection, and separate conflict causes; their repetition communicates distinct invariants and catches cases that a shared assertion could mask. The remaining tests likewise distinguish API-level behavior from persistence effects and keep fixtures scoped to each concern.

## Coverage

Fully read assigned files:

- `app/tests/int/editRecoveryCap.int.spec.ts`
- `app/tests/int/editRecoveryCapture.int.spec.ts`
- `app/tests/int/editRecoveryExpiry.int.spec.ts`
- `app/tests/int/editRecoveryMetadata.int.spec.ts`
- `app/tests/int/editRecoveryRetire.int.spec.ts`
- `app/tests/int/editRecoveryStart.int.spec.ts`
- `app/tests/int/editRecoveryUnsavedWork.int.spec.ts`
- `app/tests/int/editorGroupsAccess.int.spec.ts`
- `app/tests/int/favorites.int.spec.ts`
- `app/tests/int/importLessons.int.spec.ts`
- `app/tests/int/jobStatsScheduling.int.spec.ts`
- `app/tests/int/lockRows.int.spec.ts`
- `app/tests/int/messageReferenceMigration.int.spec.ts`
- `app/tests/int/messages.int.spec.ts`
- `app/tests/int/nullResources.int.spec.ts`
- `app/tests/int/officialPointerLock.int.spec.ts`

Context dependencies read: none. No partial assigned files; packet complete.

## Rejected reductions / deliberate complexity

- Keep the distinct CAP/retirement/revision/generation/time tests in edit-recovery specs. They isolate SQL predicates and transactional boundaries, often documenting prior false positives.
- Keep recovery fixture helpers local to those specs; their options and raw SQL are tailored to each specific state transition and not interchangeable evidence.
- Keep `editorGroupsAccess` role-gate/no-query checks and roster projection resolution assertions; empty output alone would not prove the read was avoided or that IDs resolve.
- Keep message/favorite role distinctions, rate-limit setup, transitive cascade coverage, and context-link cases; these represent non-identical policies and persistence paths.
- Keep import CLI subprocess checks and the lock / pointer wait tests. Their harness is part of the exercised operational behavior and timing/transaction setup is meaningful.

## Next

Proceed to `tests-int-03` in manifest order; checkpoint before continuing.

# SIMPLICITY review — integration tests, packet tests-int-03

## Packet result

No concrete simplification candidate found. The long re-ingest suite intentionally exercises distinct preview/confirmation, serialization, partial-success, migration/backfill, and Official-pointer timelines; reducing the case structure or fixture shapes would erase meaningful state transitions. The user security suite similarly distinguishes operations that share an invariant but have different hooks and cleanup obligations.

## Coverage

Fully read assigned files:

- `app/tests/int/personalVersions.int.spec.ts`
- `app/tests/int/planIdentityImmutable.int.spec.ts`
- `app/tests/int/publicPublication.int.spec.ts`
- `app/tests/int/rateLimit.int.spec.ts`
- `app/tests/int/reingest.int.spec.ts`
- `app/tests/int/schoolName.int.spec.ts`
- `app/tests/int/subjectAdminHandover.int.spec.ts`
- `app/tests/int/systemSettings.int.spec.ts`
- `app/tests/int/taxonomyDelete.int.spec.ts`
- `app/tests/int/uploadTaxonomy.int.spec.ts`
- `app/tests/int/userSecurity.int.spec.ts`
- `app/tests/int/verifyBackfill.int.spec.ts`

Context dependencies read: none. No partial assigned files; packet complete.

## Rejected reductions / deliberate complexity

- Keep re-ingest helpers and separate cases for release-vs-teacher lineage, dry-run/confirm tokens, migration preservation, partial batch outcome, per-set refusal, conflict rollback, and serialized concurrent imports. They represent different contracts rather than repetition.
- Keep `publicPublication`'s distinct feature switch, publication, slug, Official pointer, and public lookup gates. Several cases share setup but answer different boundary questions.
- Keep `userSecurity`'s admin-population parking/restoration and operation-specific lockout cases. The database is shared across specs and role state is borrowed; generic cleanup would risk mutating other specs' administrators.
- Keep migration and taxonomy assertions that compare full state or stored fingerprints; they prove untouched columns and real database state, beyond helper return values.

## Next

Proceed to `tests-int-04`; after its checkpoint, report completion of the integration-test batch to the coordinator before beginning operations review.

# SIMPLICITY review — integration tests, packet tests-int-04

## Packet result

No concrete simplification candidate found. The single worldwide identity spec combines creation, request-context isolation, installation ID reset, and migration behavior because they share the same identity lifecycle; its distinct fixtures pin separate invariants and preserve the stored-self fingerprint contract.

## Coverage

Fully read assigned file:

- `app/tests/int/worldwideIds.int.spec.ts`

Context dependencies read: none. Packet complete; no partial assigned files.

## Rejected reductions / deliberate complexity

- Keep the same-request second create assertion: it checks that request context does not leak a release fingerprint across creates.
- Keep the migration's legacy-state simulation and idempotence snapshot. They demonstrate filling only missing identities and retaining stable existing IDs.
- Keep cleanup for the created user and MARK sweep; no redundant helper opportunity found.

## Integration-test batch complete

All tests-int-01..04 assigned files were fully read. No live tests executed; no repository or git changes made. Proceeding separately to runtime operations packets.
