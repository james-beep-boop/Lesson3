# Cross-group synthesis

Detailed packet evidence is retained on the [evidence branch](https://github.com/james-beep-boop/Lesson3/tree/review/simplification-v1.10-evidence).
The initial dead-code check was insufficient; see first-pass/README.md for the configured follow-up.

Bounded coordinator pass after packet reviews, fixed v1.10 c8d8f3d2. This combines the source-backed
packet findings and helper map; it does not pretend every source file was reread by the coordinator.
All four runtime-code perspectives, test reuse/simplicity and documentation/config consistency are
recorded in the linked progress reports. Migration/generated/binary treatment remains explicit.

## Import, release confirmation and locked writes

Web upload and supported CLI already share entry classification, manifest membership and release
helpers. Preserve those owners, the order-independent confirmation token and the one confirmation
rule before writing and under locks. Release-preview metadata is batched; ancestry construction was
still one read per existing plan. PR #474 batches the latter after locks and refusals, retaining
per-substrand release predecessors, teacher lineage and transaction scope. Its first-matching-decision
correction matters for legacy identities. Do not unify preflight with the required post-lock recheck.

A further proposal to reuse preview's history projection too is deferred: #474 removes the scaling
problem; another extraction saves one call while coupling different fields and failure boundaries.

## Editing, recovery, combination and saved versions

Native content fields and server enforcement remain authoritative. Pure prose keys/labels belong
below the enforcement hook: PR #478 moves them unchanged into a client-safe leaf and leaves structural
and resource policy in the hook. PR #479 reuses only the immutable request-side canonical comparison;
fresh permission filtering still occurs after every wait. Capture epochs/revisions, active-session
fences and explicit retirement transitions are meaningful state, not redundant state to delete.

Keep Advanced tools policy centralized. The optional editor version-choice read in Standard mode is
a source-confirmed follow-up candidate, but continuation via combineWith and draft recovery must remain
independent of the hidden picker. No change to that behavior is included in the current five PRs.

## Public/authenticated reading, artifacts, caches and email

Immutable artifact generation/cache ownership is coherent. Preserve public-versus-authenticated access
before serving artifacts; do not cache permission decisions or replace the vendor renderer. PR #476
reuses the existing pool accessor while preserving each consumer's result shape and error behavior.
Rate-limit charges must commit independently of a later operation rollback. Keep the pending-job
hydration read: dropping it changes a concurrent-deletion error path. PR #475 corrects both Guides so
teachers see that message emails depend on configuration and limits; unread messages remain visible.

## Installation, updates, backups, records and restore

Host bootstrap shell must work without the app's Node dependencies. Shared backup shell helpers own
destination parsing and evidence; TypeScript presents recorded status rather than probing devices.
Keep each destination's result independent, and keep not-connected distinct from a real error. Setup
checkpoints, password re-entry, first-backup proof and staged restore validation are necessary work.
The updater must read older installed backup layouts even though the app's status reader no longer
needs them. A generic install/update/restore state framework would obscure different recovery rules.

One source-confirmed follow-up remains: install and CI curl loops limit attempts, not request duration.
The updater's explicit deadline and per-request timeout show the established bounded-wait pattern.
No fix or wall-clock failure measurement is claimed in this evaluation batch.

## Source, release images, bundle checksums and technician instructions

Annotated tags, both native architectures, immutable image digests and draft-with-assets publication
are deliberate steps. Preserve the separate font/image tiers and byte-pristine generator boundary.
PR #475 aligns the technician text with the actual backup-backed deploy path, account/upload/check
sequence and tag command. NOTICE still has a stale second generator pin/file list; its correction is
recorded as a small follow-up, preserving upstream attribution and the authoritative provenance file.
The lone direct caret dependency can be pinned to its existing lockfile version without an upgrade.

## Shared frontend/admin, phone behavior and the two Guides

Keep native/admin form enforcement separate from frontend presentation and explicit client request
state. Similar moderation, role-transfer and save dialogs have different uncertainty/retry semantics;
a generic action engine would make them harder to reason about. Current local-day/instant/calendar
formatters represent different time meanings, not duplicate date code. Guide corrections are small
and use plain teacher-facing wording. No broad component/CSS rewrite is justified by these reviews.

Test-only fixture/helpers can be shared selectively, as recorded in findings.md. Preserve role cases,
independent fixture setup, malicious/malformed input variants and controlled concurrency schedules.
The mechanical 97 duplicate clusters are navigation leads, not 97 defects.

## Outcome and limits

Claude reviewed the original five cleanup PRs; the new dead-code cleanup needs review. All remain drafts, awaiting James. No merge, tag, release, deployment or
live configuration change occurred. This is a maintainability evaluation of v1.10, not a security
audit or a performance benchmark of a deployed school. It does not cover future main changes.
Selected fixes were revalidated against main e304387b, preserving its newer sign-in tagline. Remaining
small candidates and deliberate duplication are visible in findings/progress rather than silently
counted as fixed. Passing tests alone do not establish semantic equivalence; each chosen fix also
records its preserved invariants and source comparison.
