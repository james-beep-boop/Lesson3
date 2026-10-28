# ARES Lesson Plans: v1.10 simplification evaluation

**Status: in progress.** This is a maintainability evaluation, not a security audit.

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
files, 326 tests, 76 migrations, 56 current documentation files and 55 explicit exclusions. Some
source entries are configuration and receive consistency checks. Generated migration DDL receives
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

Pilot ancestry batching is open as PR #474. Guidance corrections are open as PR #475.
Shared adapter access is also prepared as a separate PR; all remain on hold for Claude. Shared lib packets have completed reuse/simplicity/efficiency review; altitude is finishing.
Core collections, fields, hooks and access modules are being read. Documentation consistency
review completed its assigned file list. All other packets remain pending. See `findings.md` and `progress/`.

## Changes after the reviewed tag

Execution started from main `e304387b`. That includes #471's newer sign-in tagline, outside the fixed
v1.10 evaluation. Fixes preserve it. Later main changes must be compared before each fix is made.

## Cross-group synthesis

Pending: import/CLI/web policy; editing and saved versions; public/authenticated artifacts; operations
settings and records; release bundle/install/manual wiring; shared frontend/admin presentation.

Completion is not claimed while coverage or required synthesis remains pending.

## Status meanings

A source file is `read` only when all four required perspectives have completed it. `partial`
includes files fully read by some reviewers while other perspectives remain pending. Tests need
reuse/simplicity; current documentation/configuration needs consistency. Exclusions have reasons,
not an invented claim of manual review. More detailed per-perspective coverage is in progress notes.
