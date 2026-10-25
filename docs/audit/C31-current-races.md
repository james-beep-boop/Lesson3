# C31 Current immutability and concurrency attacks

## Chunk contract

- Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; sole auditor; no exclusions.
- Required: read-only PostgreSQL content fingerprints before/after; historical updates/deletion
  through all enumerated C30 paths and roles; permitted deletions recorded; controlled lock barriers
  for two editing teachers and one teacher in two sessions; editing-lock stealing/staleness;
  recovery/restore attribution; database uniqueness and final retained-state checks.
- Execute only against the marked isolated target, under its exclusive lock. Preserve actual
  blocked-backend evidence and release any held transaction in `finally`. A `Promise.all` launch
  alone is insufficient concurrency evidence. No product fixes.
- Artifact: this report plus audit-only probes and private raw snapshots/results. Exit only when
  every named path has evidence or a precise outstanding check; no cross-family review is claimed.

## Controlled save races — partial pass

The audit-only `app/tests/audit/c31-save-barrier.mjs` completed with exit0 on the marked isolated
PostgreSQL target. It created one synthetic Official plan in scopeA, then ran two races:

| Scenario | Actual overlap proof | HTTP | Persisted semvers |
|---|---|---|---|
| Two teachers with editing access | Two application backends in the held plan-row lock chain, both requests unsettled |200/200|1.0.1 and1.0.2|
| One teacher in two sessions | Distinct issued JWTs; two application backends in the held plan-row lock chain, both requests unsettled |200/200|1.0.3 and1.0.4|

A dedicated PostgreSQL client began a transaction and selected the plan `FOR UPDATE` before
starting requests. It queried a recursive `pg_blocking_pids` chain rooted at its own backend and
required both application backends to be waiting on `Lock` events (`tuple` / `transactionid`).
This establishes simultaneous contention, beyond a Promise.all launch. The holder rolled back
in `finally`; both HTTP requests were awaited before teardown even on a barrier assertion error.

Each saved version retained its own submitted prose, the correct server-stamped author and source
version. The Official pointer stayed on1.0.0. Read-only SQL computed MD5 of complete JSON row
representations for versions, their child tables, plans and taxonomy; every original historical
row and the newly created source-plan/version rows remained present and byte-identical after each
race. The two candidates from the first race were checked immediately for content, but were not
included in the historical fingerprint set used after the second race. Include them in the full
subsequent sweep. The original complete row multiset matched again after deleting the one owned
synthetic plan and all four candidates.

Actual PostgreSQL indexes included unique `(lesson_plan_id, semver)`, unique UID and the primary
key. SQL fingerprints were compared in memory by the probe; the original raw hash vectors were
not serialized. The private result retains blocked-backend records, statuses, semvers and index
definitions. The final full C31 sweep must save its before/after fingerprint vectors as artifacts.
The exact executed helper copy/hash was preserved before formatting.

## Authority changes during lock waits — current HTTP suite pass

The existing `app/tests/http/pendingAuthority.http.spec.ts` was rerun against the marked target
under the target lock with the pinned dependency wrapper. It passed **19 tests** in 34.30 seconds
(exit 0), with the raw output retained privately at `logs/c31-pending-authority.log`. These cases
use real PostgreSQL barriers and then change the caller while its request is waiting. They covered:

- granting Site Administrator and deleting an account after the caller was demoted, disabled,
  unverified, or signed out (eight cases);
- source deletion after demotion for both source-owned and non-owned versions (two cases);
- administrator save with `deleteSource=true` after demotion, disablement, unverification, or
  sign-out, asserting rollback (four cases); and
- Make Official while waiting on the plan row after those same four authority changes (four cases).

The suite also confirmed the ordinary teacher self-update path remains allowed. No fixture rows were
left behind, the target lock released normally, and the application stack remained healthy. This
closes the authority-change-while-waiting item for the exercised native/version paths; it does not
close request-editing lock stealing or stale-lock behavior, recovery attribution, Combine races, or
the required full C31 fingerprint/deletion ledger.

## Native editing-lock attack boundary — current HTTP suite pass

The current `app/tests/http/lockedDocuments.http.spec.ts` suite also passed **18 tests** in 2.99
seconds (exit 0) against the marked target. It refused API lock creation for every signed-in role,
including a forged lock naming an administrator; allowed all signed-in users to read a real lock;
allowed takeover only to the caller, on a document that caller may edit; refused handing a lock to
another user, moving it to another document, and takeover by a plain Teacher; and allowed only the
holder to unlock. A real lock returned 423 for a competing version deletion and the same deletion
succeeded after the holder released it. The raw output is private at `logs/c31-locked-documents.log`.

The suite leaves the target clean and unlocked. It validates the native lock authorization and
deletion barrier, but it does not age a lock through the five-minute expiry or prove stale-lock
cleanup, so that item remains open.

## Native editing-lock expiry — audit probe pass

The audit-only `app/tests/audit/c31-stale-lock.mjs` probe used the trusted Local API to create one
synthetic non-Official version and one lock held by an editing teacher. Through the real HTTP DELETE
endpoint, a fresh lock returned **423**. The probe then set only that lock row's `updated_at` to ten
minutes ago (measured age **600.0 seconds**) and retried the same delete as the Subject Administrator;
it returned **200**, demonstrating that the five-minute stale-lock window expires for the guarded
application action. The probe exited 0; its exact pre-execution helper hash was
`02b9b24a5b83e42c50ffe483bea27e4bcd9e58d0025d4280d233dfeee31dce64`, with raw output and the
owner-only result retained privately.

Cleanup verified zero remaining `ZZ_AUDIT_C31_STALE_LOCK` versions and zero native lock rows, with
the target lock released and the application stack healthy. This closes the bounded stale-lock
expiry check; it does not establish behavior for every possible clock skew or a live refresh race.

## Recovery and draft attribution — current HTTP suite pass

The current `app/tests/http/recovery.http.spec.ts` suite passed **35 tests** in 3.98 seconds (exit
0) against the marked target. It covered all seven recovery operations' unauthenticated and wrong-
role gates; start, capture, GET and discard; stale generation/revision and malformed token/document
refusal with the prior capture preserved; owner-only isolation on a shared version; Site-Admin
metadata and revision-checked cleanup; delete-authorized unsaved-work counts; and owner-only Combine
draft metadata with cross-plan context excluded on restore. It also confirmed restore does not spend
the shared preview budget. The raw output is private at `logs/c31-recovery-http.log`.

The fixture teardown completed with no target lock retained and the stack remained healthy. Together
with the pending-authority save cases above, this is current wire evidence for recovery ownership,
CAS retirement and attribution boundaries. It does not close every C30 write path, full recovery
restore attribution under concurrent Combine/Official changes, or the final fingerprint/deletion
ledger.

## Combine ancestry and conflict boundary — current HTTP suite pass

The current `app/tests/http/combinePreview.http.spec.ts` suite passed **18 tests** in 3.84 seconds
(exit 0). It covered unauthenticated, malformed, missing, same-version, cross-plan and no-edit
gates; three-way sibling overlays and common-ancestor selection; same-field conflicts with all three
texts; administrator/resource and structural refusals; two-way behavior without an ancestor;
multi-lesson matching despite regenerated resource-link IDs; the already-included ancestor result;
and a bounded high-content computation case. The raw output is private at
`logs/c31-combine-preview.log`.

All synthetic versions and plans were removed by fixture teardown and the target lock released. This
closes the read-only Combine preview and ancestry cases for the current wire, but not a concurrent
Combine save, an Official-pointer race, or the final persisted fingerprint/deletion ledger.

## Make Official write boundary — current HTTP endpoint pass

The `app/tests/http/endpoints.http.spec.ts -t make-official` selection passed **5 tests** (119
other tests skipped by the selector) in 2.86 seconds (exit 0). It verified atomic pointer movement
with previous-Official deletion, mandatory `expectedPreviousOfficialId` consent, stale-consent 409
with the pointer and previous version unchanged, and refusal for a Teacher with editing access. The
raw output is private at `logs/c31-make-official-http.log`; fixture teardown completed and the target
lock released.

This is current write-path evidence, alongside the pending-authority barrier cases, but it does not
replace a simultaneous two-writer Official-pointer race or the complete persisted fingerprint and
deletion ledger.

The focused `app/tests/http/endpoints.http.spec.ts -t deleteSource` selection passed **3 tests**
(121 other tests skipped by the selector) in 2.89 seconds (exit 0). It covered retirement of an
authored non-Official source, the non-owner/source-scope refusal path, and the rule that
`deleteSource=true` is ignored for an Official source. Fixture teardown completed and the target
lock released; raw output is private at `logs/c31-delete-source-http.log`.

## Outstanding

This is still not the complete C31 attack run. Remaining: every C30 path and role, permitted versus
unauthorized deletion ledger, persisted row fingerprint artifacts, recovery/restore attribution,
Combine and Official-pointer races, and reset afterward. The source/parent deletion,
authority-change-while-waiting, native lock authorization, bounded stale-lock expiry, current
recovery ownership/CAS, and read-only Combine ancestry cases now have the evidence described above;
the complete ledger, concurrent Combine/Official cases and final fingerprint artifact are still open.

An audit-only two-writer Official-pointer attempt was inconclusive: two distinct authenticated
requests were launched behind a held plan-row lock, but only one backend reached the observed wait
within 20 seconds. Both attempts were cleaned up, the two login-counter increments were restored,
and the private logs retain the failed harness runs. No race conclusion or finding is drawn; a
simultaneous Official-pointer race remains open.
Earlier C22/C30 tests are supporting evidence; no full-chunk or independent-review claim is made.
