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

## Outstanding

This is still not the complete C31 attack run. Remaining: every C30 path and role, permitted versus
unauthorized deletion ledger, persisted row fingerprint artifacts, stale-lock aging/cleanup,
recovery/restore attribution, Combine and Official-pointer races, and reset afterward. The source/
parent deletion, authority-change-while-waiting, and native lock authorization cases now have the
bounded evidence described above; the complete ledger and final fingerprint artifact are still open.
Earlier C22/C30 tests are supporting evidence; no full-chunk or independent-review claim is made.
