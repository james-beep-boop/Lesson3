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
- PR [#476](https://github.com/james-beep-boop/Lesson3/pull/476), commit b0c81f53. All 1,976 unit and nine relevant integration tests pass, plus types,
  lint and formatting. Open PR review is required before any merge.

## S-LIB-002 — client-safe prose contract below enforcement hook

- Altitude, source-confirmed: pure field keys and labels in `hooks/fieldSplit` are imported by
  browser recovery projection/labels and pure Combine. Move unchanged vocabulary to a pure leaf
  module; keep identity-repair policy and access/structural enforcement in the hook.
- Status: PR [#478](https://github.com/james-beep-boop/Lesson3/pull/478), commit c124f976.
  Constants and labels moved unchanged, hook enforcement remains in place, and all 1,976 unit tests,
  typecheck, lint and formatting pass. Held for Claude’s review.

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

## S-SERVICE-001 — reuse the prepared Save as new comparison

- Efficiency: `versionEdit.saveAsNewEndpoint` canonicalizes the same immutable merged request
  content before and after acquiring locks, including retries. Compute that side once; keep
  recomputing the fresh permission-filtered side after every wait.
- Status: PR [#479](https://github.com/james-beep-boop/Lesson3/pull/479), commit a04a8a55.
  All 1,976 unit tests, typecheck, changed-file lint and formatting pass. Existing endpoint and
  pending-authority wire checks must pass CI. Held for Claude’s review.

## Leads requiring coordinator judgment

- `refreshCaller` currently lives beside endpoint response helpers but serves access enforcement in
  hooks too. A pure ownership move to access may help; preserve identity, session checks and all
  post-lock refresh timings. Source-confirmed candidate, not a behavior defect.
- Client forms consume pure disabled-account wire vocabulary from a module also constructing server
  Payload errors. A narrow move into the existing wire-error helper is an optional layering change;
  no deployed bundle-size problem has been measured.
- Script `positive_int` appears in both backup-common and pruning. A shared shell owner is possible;
  caller-specific failure behavior and standalone sourcing must survive.
- Test review found a duplicate database-result normalization in its recovery helper. Check its
  array/object fallback against `rowsOf` before replacing it.

## Keep or defer

- Keep typed object predicates and database `Where` policy representations distinct. A generic
  policy DSL would add more machinery than it removes.
- Keep task-specific error/retry boundaries, independent fixture assertions and error messages.
  Similar shapes alone do not justify extraction.
- Do not drop the pending-export job’s Payload hydration merely to save a query: deletion between
  the SQL lookup and hydration currently has observable failure behavior.
- Do not change generator per-group work, Combine path indexing or search keystroke behavior without
  a representative measurement. These are performance leads, not verified slow paths.

## Test-only reuse backlog

The completed unit/helper passes found small opportunities, recorded here for follow-up rather than
creating multiple tiny PRs while five focused cleanup PRs await Claude. These are maintainability
candidates, not failing assertions or product defects:

- Reuse test-owned `drizzleOf` for the remaining adapter casts in rate-limit, message and endpoint
  suites; use test-owned `rowsOf` in recovery fixture plumbing. Keep fixture setup independent of
  production `txDb` and preserve cleanup SQL/order and result fallbacks.
- Reuse `formReq`/`statusOf` in `parsePreviewCandidate.spec.ts`, preserving malformed-body callbacks,
  absent headers and refusal status semantics.
- Extend test `fieldTree` with generic `childrenOf`/`byName` for the resource/prose drift tests.
  Keep displayed-child/prose recursion local and retain field-order/empty-child semantics.
- Share the repeated 429-backoff setup within `useEditRecovery.spec.tsx`; keep separate retry,
  unmount and session-ending assertions and deterministic timers.

Most of the 97 mechanical test-duplication clusters express different contracts. No test removal or
wide fixture rewrite is proposed. Detailed file/line references and rejected reductions are in the
numbered test progress reports.

## Operational and configuration follow-ups

- NOTICE still lists the July generator pin and three files, while the authoritative provenance
  record names the October pin and four files. Correcting the notice to refer to the current record
  avoids maintaining a second stale pin list. Preserve upstream licence wording and both grants.
- `@testing-library/dom` is the only direct caret dependency (`^10.4.2`). The lockfile currently
  resolves 10.4.2, so `npm ci` is fixed; a small follow-up can pin that same version without upgrading.
- `verify-edit-recovery-cascade.ts` has another private adapter cast that can use `poolDb`.
  Preserve the diagnostic's independent fixture setup and cleanup. No product defect claimed.
- The install readiness loop and CI startup loop limit attempts but not each curl request. A stalled
  response can exceed the nominal wait. The updater already has a deadline/request timeout. This is
  a source-confirmed reliability follow-up, not a measured performance claim or a completed fix.
- Keep the separate post-lock ancestry projection after PR #474: it already removes N per-plan
  queries. Reusing the release-preview history too would save one further call while broadening and
  coupling projections; no measurement warrants that added coupling now.
- `verify-stage2-export` renders the same immutable DOCX twice, once per output kind. It is a manual
  diagnostic of separate cold paths. Keep it unless its intended independence or measured run time
  justifies sharing the generated snapshot; do not weaken its output checks.

Additional test reuse candidates: shared `httpWire.login` in three newer wire suites, the existing
`createTopicAs` helper in the first discussion suite, and a narrow valid one-phase raw ARES fixture
builder across upload/import tests. Keep malformed/null-resource and all-five-phase fixtures separate;
keep HTTP wrappers and assertions local. These are a follow-up backlog, not changes in the five drafts.

Additional UI reuse/simplicity candidates are in the two UI progress groups: shared wire-error parsing,
assignment route construction, repeated recovery DELETE transport, UploadBundles results derivation
and a redundant private-search empty branch. Most are small; none justifies a broad UI rewrite. The
editor's Advanced-tools-only version-picker query deserves a focused follow-up with continuation
browser coverage if selected. No additional product behavior is changed by this evaluation report.
