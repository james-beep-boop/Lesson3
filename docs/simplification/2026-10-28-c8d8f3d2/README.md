# ARES Lesson Plans: v1.10 simplification evaluation

**Status: source review complete; cleanup PRs held for Claude.** This is a maintainability evaluation, not a security audit.

## Scope and authorization

- Fixed source: annotated tag **v1.10**, full commit `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`.
- James approved execution on 2026-10-28 and initially authorized merging after review and CI. James then explicitly required
  leaving PRs open for Claude to review before any merge. **No cleanup PR may be merged until
  James tells the coordinator to proceed.** No release tag, deployment or live configuration change is included.
- Perspectives: reuse, simplicity, efficiency and **altitude** (logic at the right layer).
  Project conventions constrain all four.
- Sol leads and verifies; Luna performs bounded source investigations; Terra handles documentation
  and presentation where useful. Sol independently spot-checks the pilot. Claude challenges fixes.
- Each fix starts from current main and revalidates its finding. Baseline files are never edited.

## Coverage and size

`coverage.json` accounts for all **940** files tracked at the source SHA: 427 source/config/script
files, 325 tests, 76 migrations, 56 current documentation files and 56 explicit exclusions. A PDF
fixture initially counted with tests was corrected to a binary exclusion; only its metadata was checked.
Some source inventory entries are configuration (consistency checks) or shell test harnesses (reuse,
simplicity and conventions); their `reviewScope` records that distinction. Generated migration DDL receives
boundary/registry checks; custom migration logic is read separately, not all 145,110 DDL lines.
`packets.json` contains the exact file lists; no directory-wide completion is inferred from a search.
There are 70 initial packets, including small groups and two pilot packets. Test packets are larger
because their review concerns are reuse and simplicity. The pilot is used to choose practical
batch sizes; every completed reviewer run retains its file-level coverage.

## Mechanical evidence

See [first-pass/README.md](first-pass/README.md). Scan hits remain leads until checked against callers.
Baseline existing CI: #470's final run `40590552573` passed checks, native_arm, restore_stack and gate
at `ab76c25a`; the tag differs by merge/release documentation, not application implementation.
Local prior result: 1,976 unit tests pass. These are prior evidence, not freshly rerun baseline tests.
Fix-specific verification will be recorded with each PR and its exact comparison SHA.

## Pilot

- P01: release import orchestration, manifest/release decisions and shared semver/app-version helpers;
  1,362 implementation lines plus related unit/integration tests. Four focused reviews completed.
- P02: backup status and shared shell destination helpers; 1,069 implementation lines plus related
  tests and writer callers. Four focused reviews completed.
- Luna's reuse/simplicity reviews and Sol's independent altitude spot-check agreed that the shared
  release and destination policies already have sensible ownership. No structural rewrite is justified.
- One high-value candidate: batch existing-plan ancestry reads under the same write locks, replacing
  N metadata round trips with one. Multi-plan regression evidence and an independent challenge are
  required before merge. Other pilot candidates are minor comments or small extractions; deferred.
- No useful efficiency change was found for the bounded backup-status reads/scans. No fix PR is
  required for P02. No model usage counter is exposed here; do not invent token cost or subscription
  savings. Reviewer run count and wall-clock source timestamps are retained in progress reports.

## Current work and resume point

All runtime source packets have their required reviews recorded. Tests have reuse/simplicity and
convention checks; current documentation and configuration have consistency checks. The exact v1.10
tracked-file set was rechecked: **808 reviewed, 76 migration boundary-checked, 56 excluded; no pending
or partial entries**. This is scoped coverage, not a claim that generated DDL, vendor code or binaries
were manually reviewed. See the migration and exclusion evidence for those limits.

Cleanup PRs are open and **held for Claude’s review**:

- [#474](https://github.com/james-beep-boop/Lesson3/pull/474): batch ancestry reads under import locks.
- [#475](https://github.com/james-beep-boop/Lesson3/pull/475): align teacher and technician guidance.
- [#476](https://github.com/james-beep-boop/Lesson3/pull/476): reuse the shared database adapter accessor.
- [#478](https://github.com/james-beep-boop/Lesson3/pull/478): put pure prose vocabulary below enforcement hooks.
- [#479](https://github.com/james-beep-boop/Lesson3/pull/479): reuse prepared content comparison during Save as new.

[verification.md](verification.md) records exact heads and local/CI evidence; the save-comparison
PR’s main checks are still running at this checkpoint.

This draft PR is the execution journal. No cleanup PR has been merged. See `findings.md`, `coverage.json`
and `progress/` for evidence and the remaining work.

## Changes after the reviewed tag

Execution started from main `e304387b`. That includes #471's newer sign-in tagline, outside the fixed
v1.10 evaluation. Fixes preserve it. Later main changes must be compared before each fix is made.

## Cross-group synthesis

The bounded cross-group pass is recorded in [cross-group.md](cross-group.md): imports, editing,
reading/artifacts, operations, publication and frontend/Guide behavior. Remaining candidates and
intentional duplication are in `findings.md`; they are not claimed fixed.

Source review is finished. Claude's review and James's instruction are required before any merge;
selected fixes and CI evidence remain attached to their own draft PRs. No releases or deployments.

## Status meanings

A source file is `read` only when all four required perspectives have completed it. `partial`
includes files fully read by some reviewers while other perspectives remain pending. Tests need
reuse/simplicity; current documentation/configuration needs consistency. Exclusions have reasons,
not an invented claim of manual review. Migration `boundary-checked` means registration/schema
checks plus the explicitly listed manual backfill reads; it does not mean all DDL was read. More detailed per-perspective coverage is in progress notes.
