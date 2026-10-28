# Consolidated findings

Source SHA is fixed in README; implementation is revalidated against current main per fix.

## S-P01-001 — batch ancestry metadata for existing-plan imports

- Perspective: efficiency. Source-confirmed by Luna and coordinator; `ingest/index.ts`, `writePrepared`,
  original line 874. An import of N existing plans makes N sequential ancestry-history queries under
  the write locks, in addition to the already batched release-preview reads.
- Smallest change: one post-lock metadata query grouped by lesson plan. Keep `latestRelease` and
  all transaction, access, lock, skip, confirmation and rollback semantics.
- Status: PR [#474](https://github.com/james-beep-boop/Lesson3/pull/474), open for Claude review.
  Two new regression cases failed before implementation (2 queries instead of 1); all 27 re-ingest
  cases pass afterward, including per-plan predecessors, teacher patches and transaction context.
  A preliminary Claude challenge identified an any-versus-first decision mismatch; it was corrected
  before the PR. No merge is authorized while James’s hold is active.

## Other pilot candidates

- Two identical subject-grade queries in ingest preflight and taxonomy creation: later. Extraction
  offers limited net simplification and must retain different null/transaction behavior.
- Two-line object predicate in backup reader and ingest: later. A neutral shared module may be useful
  if broader reuse review establishes more consumers; do not import ingest into the generic lib.
- Stale semver mirror comment and duplicate IngestReq docblock: optional, deferred until a meaningful
  related change. No runtime defect claimed.
- Shell/TypeScript destination classification: keep separate implementations across runtimes, with
  existing parity tests. Empty shell input is guarded by its caller; no generic extraction proposed.
- Keep preflight and locked rechecks, three timestamp validations, separate backup outcomes, fixed-size
  parallel evidence reads and named lock wiring seam. These are deliberate contracts, not redundancy.

## S-LIB-001 — shared database adapter ownership

- Reuse/altitude: `versionCounts`, `generateVersionArtifact.findPendingExportJob`, and rate limiting
  each repeat the Payload pool-handle lookup already owned by `txDb.poolDb`. Use that accessor,
  retaining SQL/result handling and independent budget commits. Main comparison: e304387b.
- Prepared commit b0c81f53. All 1,976 unit and nine relevant integration tests pass, plus types,
  lint and formatting. Open PR review is required before any merge.

## S-LIB-002 — client-safe prose contract below enforcement hook

- Altitude, source-confirmed: pure field keys and labels in `hooks/fieldSplit` are imported by
  browser recovery projection/labels and pure Combine. Move unchanged vocabulary to a pure leaf
  module; keep identity-repair policy and access/structural enforcement in the hook.
- Status: candidate; core altitude review is verifying all field/hook consumers before implementation.

## Guidance consistency — PR #475

Terra verified current text against source: conditional message emails; hidden/read-only ARES keywords;
clean-install check sequencing; current Rock deploy/encrypted backup instructions; enabling Advanced
tools for the Combine rehearsal; annotated release tags; dated terminology/interchange pointers.
Seven files corrected surgically, 105 Guide tests/lint/format pass. Held for Claude’s PR review.

## Other library leads

- Shared message length constant instead of literal 5000 in message composers and discussion body limit:
  source-confirmed candidate, preserves today’s shared policy; independent implementation pending.
- Repeated Combine field-path resolution: source-confirmed work proportional to conflicts × document rows.
  No measured slow corpus; defer indexing until a bounded comparison proves a worthwhile benefit.
- Manage duplicate global reads, full-table version aggregate and draft-suggestion history volume:
  unmeasured leads; retain separate access/failure behavior and do not add speculative caches.
