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
Remaining restore dispatch/validation paths have not yet been reviewed in this continuation.
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
  depend on successful export-cache invalidation before restarting writers. F-C70-001 records a
  locally reproduced failure of that dependency; accepted findings remain zero.

## Execution

`bash docs/audit/tools/repro-restore-cache.sh` exited 0 and reproduced masked deletion failure with a
writable positive control. No daemon, database, network target or deployment was involved.
`bash -n docs/audit/tools/repro-restore-cache.sh` passed.

`bash scripts/test-restore-db.sh` passed: **95 assertions, zero failures**, exit 0. It uses Docker,
database and age stubs, plus real kernel lock contention checks; it is not a full-stack restore.
`bash scripts/test-online-update.sh` passed, exit 0, exercising local stubs for pull/startup/health
failures, backup failure, partial activation, conflicting bundles and pending/archive guards.
These suites do not cover failed deletion inside the cache helper.

## Resume

Review restore dispatch/validation and deployment/CI/Docker source; run the existing deterministic
ops suites after checking their isolation. Validate F-C70-001 with full restore/undo and review.
Keep cross-operation backup/update/restore serialization as an unverified lead until its required
interleavings and intended policy are established. Deployment edge/header parity is pending.
