# C30 Current save and immutability boundary

## Chunk contract

- Owner: sole auditor (Codex); baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Mandatory: enumerate all version write paths, source-derived authorization, field split, immutable
  snapshots, Official pointer, semver/provenance, transaction/race/deletion and recovery invariants.
- Artifacts: c30-save-matrix.ts and this report, later C31 concurrency evidence; private raw results.
- Exclusions: none. Exit: every write path and named invariant has source and relevant runtime
  evidence; selected success cases alone do not close C30/C31.

`c30-save-matrix.ts` passed **118 checks**, exit 0, against the production current-baseline target
under its lock. All ten actor scenarios attempted saves in both scopes. Eight allowed saves created
candidates; each was deleted after verification. Denied/no-session cases wrote nothing.

Validated behavior:

- Authority follows the stored version's scope despite a forged submitted subject-grade.
- Allowed prose persisted; duration changed only for the matching administrator or Site Administrator.
- Subject administrators and editing-access teachers preserved META identity; the Site Administrator
  control could change its subject label as the canonical repair policy permits.
- Forged resource maps were replaced with stored maps for all allowed roles; row number 999 became 1.
- Author, source version, subject-grade, UID and semver came from trusted server logic, not forged input.
- Each plan received patch versions 1.0.1 through 1.0.4, with unchanged original snapshot and Official
  pointer. No saved candidate became Official implicitly.
- Missing/invalid source timestamps returned 400; a forged future timestamp returned 409; teacher
  lesson deletion returned 403.

Source reviewed for this boundary: versionEdit authorization, form/timestamp parsing, field-split
invocation, DROP_KEYS and server-stamped create/commit response; fieldSplit role fork/resource
preservation/whitelist; bundleVersion consistency/generatability/retention; access grant/immutability
pair. This is partial module coverage, not a full-range review of each file.

Separate nine-attempt native follow-up and the corrected C22 matrix verified that valid direct PATCH
cannot write a snapshot, including per-row bulk rejection. These do not cover the save concurrency,
semver-conflict retries, recovery retirement, source deletion, Make Official races, Combine parents,
transaction rollback or all structure/answer-key combinations. Those remain C30/C31/C81 work.
