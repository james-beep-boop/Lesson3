# C70 Operations review

## Chunk contract

- **Owner:** sole auditor (Codex), operator-confirmed.
- **Revision:** `bd5f07863a150cd51245b9c942502efa19d4014d`.
- **Mandatory checks:** installer/updater transactions and interruption recovery; release identity;
  backup/restore/undo correctness and fault handling; Docker/CI hardening; deployment headers and
  log/secrets handling; synthetic runtime drills and separate sole-auditor rechecks.
- **Artifacts:** this report, findings/C70-ops.md, runnable audit probes, sanitized test outcomes;
  raw operational artifacts outside Git.
- **Exclusions:** no shared-target mutations without ownership and scope reconciliation. This does
  not exclude isolated runtime drills from the final audit.
- **Exit:** every required check has bounded evidence or an explicit gap, all candidates receive
  documented recheck, and accepted risks flow to the final summary. The operator waived cross-family review.

## Covered source and boundaries

Inspected installer and complete updater, backup generation/upload/pruning, shared environment
reader, and restore helpers through forward swap and undo (restore source through line 410).
The restore dispatch/validation paths were exercised again in the isolated full-stack run below.
Inspected the release Compose template and the relevant fast/real-stack restore cache assertions.
Read artifact cache identity/read semantics and authenticated version-export cache usage for the
invalidation boundary; this is not full generator or endpoint coverage.

- The updater stages a bundle and original files before activation, compares pending bundle identity,
  serializes updater instances with a directory lock, records migration boundary before replacing
  active files, and advances VERSION after its health probe. These are source observations; crash
  recovery and true new-image readiness remain runtime checks.
- The backup stream captures pipeline statuses for both dump and encryption before upload, serializes
  backup records, validates positive retention values and checks local destination mount identity.
  Actual restoreability, external-media behavior and remote retention correctness remain unverified.
- Restore stages database replacement and retains the prior database. Forward and undo paths both
  depend on successful export-cache invalidation before restarting writers. F-C70-001 records the
  masked deletion failure and its full-stack consequence; the accepted risk remains conditional on
  a retained readable cache entry and a deletion fault.

## Execution

`bash docs/audit/tools/repro-restore-cache.sh` exited 0 and reproduced masked deletion failure with a
writable positive control. No daemon, database, network target or deployment was involved.
`bash -n docs/audit/tools/repro-restore-cache.sh` passed.

`bash scripts/test-restore-db.sh` passed: **95 assertions, zero failures**, exit 0. It uses Docker,
database and age stubs, plus real kernel lock contention checks; it is not a full-stack restore.
`bash scripts/test-online-update.sh` passed, exit 0, exercising local stubs for pull/startup/health
failures, backup failure, partial activation, conflicting bundles and pending/archive guards.
These suites do not cover failed deletion inside the cache helper.

The existing real-stack restore suite subsequently passed **104 checks, zero failures**, exit 0,
using the current production/migration images. A private copy changed only repository-root
resolution, Compose project and tools-image names for isolation; assertions and product scripts
were unchanged. It exercised staging, migration boundaries, interruptions, retained connections,
forward/undo recovery, startup failure, confirmation/discard and successful cache invalidation.

The final private fault run used the same isolated stack and current images, with one read-only bind
mounted at `probe-stale.bin` in the named artifact-cache volume. Its exact harness SHA-256 is
`26008736ac17c6bdef48b7d6d2d4ce4f929d062c75828278f0e8051aba469d42`; raw output is retained at
`/home/james/.local/share/lesson3-audit/2026-10-25-bd5f078/logs/c70-cache-fault-stack-bind-final2.log`.
The run passed **107 checks, zero failures**, exit 0. The restore helper continued after the cache
delete returned `Resource busy`, left the stale entry mounted, restarted the app, and the real
`verify-stage2-export.ts` producer wrote fresh artifacts into the same named volume. The repair
path removed the injected mount/placeholder, `--confirm` and `--discard-previous` completed, and the
drill left no journal. The disposable project was torn down; the primary Mailpit target remained
healthy and unlocked.

## Resume

Review deployment/CI/Docker source and cross-operation backup/update/restore serialization. The
F-C70-001 recheck is complete for the masked helper failure and live restart consequence; serving a
wrong old document requires a retained valid artifact with a colliding restored version ID and was
not claimed by this run. Deployment edge/header parity is pending.
