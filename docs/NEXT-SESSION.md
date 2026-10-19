# Start here — current state and the next phase

You are picking up the **ARES Lesson Library (Lesson3)**: a versioned lesson-plan repository that
uploads ARES CBE lesson plans as structured data, lets teachers view them and — with **editing
access** — edit them under field-level permissions, keeps immutable versions with one **Official**
version per plan, and exports high-fidelity DOCX/PDF through ARES's own generator. Node/TypeScript +
Payload CMS (Postgres) end to end.

**Read first, in order:** `AGENTS.md` (stack, commands, the isolated local test stack) → `CLAUDE.md`
(operating rules and design law) → `SPEC.md` (canonical; for current work, §5 "Drafts" and §6
"Combine versions") → this file → the newest entries of `docs/DECISIONS.md`. **DECISIONS is long:
read the newest five or six entries and search it for the area you touch; never end to end.**

⚑ **Vocabulary.** Three user types — Teacher, Subject-grade administrator, Site administrator; a
Teacher *with editing access* is not a fourth type (SPEC §8). A **draft** is private, unnumbered work
(edit recovery); a **version** is a numbered save, never called a draft (SPEC §5, §13).

History before 2026-10-18 lives in `docs/archive/NEXT-SESSION-HISTORY-2026-06-TO-10.md` — a record,
not instructions. Older references to "see NEXT-SESSION" for a dated item mean that file.

---

# CURRENT STATE — 2026-10-18

**Base:** refreshed #409 from fetched `origin/main` at `3472843`, including merged #408/#406
and the modes/connectivity/network design. The operator reports
those changes are being deployed; completion has not been confirmed. Current approved code work is
`fix/ordinary-save-source-race`: take the plan lock for every save, refresh authorization before
re-reading the source, and return #405's unavailable-source 404 instead of a creation failure.
The wire tests cover deletion, revoked access plus deletion, rollback and an unchanged normal save.
Validation after refreshing main and fixing the client passed on `lesson3-codex-probe`, port 3103: types, lint, format, production build,
**1,607 unit**, **314 integration**, **400 wire + 4 existing SMTP skips** and **123 browser tests
without retries**. All three new wire cases passed against the built app. The four new unit cases
failed on the original endpoint and pass with the fix. Tracked test configuration was restored.
The ordinary-source-deletion browser case and a non-source 404 fallback both pass. Push and a ready PR are authorized; do not merge or deploy.

**Recent merged work:**
Insert link cleanup is merged ([#408](https://github.com/james-beep-boop/Lesson3/pull/408), `9f6b6ff`):
actual-link and leading bullet/table label validation, word spacing, and stale focus targets
(mouse, Enter and Space). The small draft-to-Combine hint
([#406](https://github.com/james-beep-boop/Lesson3/pull/406)) was reviewed by the operator's request
and merged after it: when a restorable ordinary draft's source has a newer readable descendant, the
restore prompt suggests saving and then combining, and the saved version offers "Combine with
{version}". Combined validation: types, lint, format, production build, **1,603 unit**, **314
integration**, **397 wire + 4 existing SMTP skips** and **122 browser tests without retries**.
The operator is handling deployment; this agent has not deployed these changes (no migration).

**Deployed state (operator-confirmed in main's `23a997c` handoff):** Combine phases 1–3b,
review corrections (#401), simplification/restore retry (#403), the dark-mode Back fix (#402), and
the Next.js 16.4.2 / Payload 3.91.0 security upgrade (#399) were deployed to the Rock on 2026-10-18.
The `combine_lineage` and `combine_draft_context` migrations ran in that deployment window.
Insert link Plan A is merged; its deployment has not been confirmed.

**Insert link Plan A:** approved wording, HTTP/HTTPS, four framework columns, optional label,
ARES/tracker normalization, Combine hiding, opt-in Rock PDF picker. Only explicit
`PDF_LIBRARY_PUBLIC=1` makes configured files public, independently of Explore; listing remains
authenticated. An absent publication flag keeps file opening authenticated. No new migration,
dependency or generator change. Plan A+ document-time rewriting is deferred. `ares.edu` is not a default alias pending an
answer from the ARES team.

The screen picks two versions, reviews automatic changes and conflicts, and opens the engine's
starting version (URL included). Conflict choices name version numbers and can change until Save;
Write my own starts from the editing version. Save stays blocked until choices are complete, never
offers parent deletion, creates Not Official, and leaves Official unchanged. Already-included
messages require equality with the descendant after applying the engine's overlay.

Unfinished combinations capture only the second-parent id and resolved field keys (64 KiB cap),
atomically with draft prose. Restore returns bounded, untrusted metadata; the screen's preview
reauthorizes it and computes conflicts once. Temporary failures retain the second parent and offer
Retry combination; confirmed unavailable second parents yield ordinary drafts with an explanation.
**Operator decision: do not retain drafts after the editing source is deleted.** Keep the existing
cascade; an editor still open explains a failed save and leaves text available for copying.

**Review fixes in #404:** resolved-origin checks for tracker targets, exact ARES origins/ports/path
prefixes, shared normalized URL parsing, signature-first PDF streaming and oversized-file 404.
`docker-compose.test.yml` now mounts a committed valid PDF; the wire happy path is mandatory.
The operator applied the one-line workflow change in
[`CI-PDF-FIXTURE-WORKFLOW-EDIT.md`](CI-PDF-FIXTURE-WORKFLOW-EDIT.md). CI passed with the fixture configured.

**Unavailable-parent follow-up:** save-as-new returns its own JSON 404 with
`unavailable: 'source' | 'secondParent'`, retaining the existing error message. Both parents are
rechecked under the plan lock, source first; deleted/unreadable versions are indistinguishable.
Editing access is checked immediately after refreshing the caller, before those reads; revoked
access plus a deleted source returns 403 without unavailable metadata. Rollback stays in the catch.
The client consumes that response with no parent probes. Unknown 404s retain provenance for retry;
only `secondParent` makes the live combination ordinary. Source deletion still removes its draft.
Validation after review corrections: types, lint, format, production build, **1,575 unit tests**,
**313 integration tests**, **396 wire tests + 4 existing SMTP skips**, and **113 browser tests
without retries** all passed. The wire tests assert the exact built-app JSON and source precedence
when both parents disappear during a plan-lock wait. Revoked access plus a deleted source returns
403 without unavailable metadata; cross-plan, stale and no-op errors also carry no marker. Endpoint
unit tests cover unreadable parents and ensure revoked access prevents parent re-reads.
Tracked test configuration was restored. No dependency or schema change.

Use an isolated stack with both a distinct project name and port: Codex uses `lesson3-codex-probe`,
`127.0.0.1:3103`. Claude uses a separate clone and stack. Never tear down another agent's stack.
Always fetch before comparing branches or commits.

**Small draft-to-Combine hint:** an ordinary restorable draft can name the highest numeric readable
newer same-plan descendant of its source, using recorded lineage. After restoring and saving as a
numbered version, **Combine with {newer}** opens the existing review through `?combineWith=`. It
never starts Combine automatically. No migration, endpoint, frozen input or state-machine rewrite.
The full design remains [deferred until teachers need it](DESIGN-update-draft-2026-10-19.md).

## Remaining work — current operator order (2026-10-19)

1. Finish #409 (`fix/ordinary-save-source-race`): merged latest main with both documentation records
   retained; show the approved source-deleted/copy-text message on every save, including ordinary
   saves. Add a real-source-deletion browser case, revalidate, push; do not merge.
2. New ready PR, **ARES releases combine cleanly** — §8 of
   [`DESIGN-modes-connectivity-network-2026-10-19.md`](DESIGN-modes-connectivity-network-2026-10-19.md).
   Record the previous *ingested release* (not a teacher edit) on re-ingest. Propose `sourceVersion`
   versus `previousRelease` and whether to backfill existing majors; await the operator's choice
   before any migration. With a usable ancestor, select resource links from the sole changed side;
   refuse divergent changes on both sides and retain the two-way refusal. Unit, re-ingest and
   three-way teacher-edit/next-release tests; update SPEC §6/§7.
3. One small Insert link tidy-up PR: PDF-picker request/loading lifecycle, shared field-label
   wording and the duplicated address check. Public PDF edge/cache hardening remains separate.
4. Propose phase 4 scope to the operator **before coding**. The full direct-update blueprint is
   [`DESIGN-update-draft-2026-10-19.md`](DESIGN-update-draft-2026-10-19.md); it was previously
   deferred in favor of #406, so do not assume the full blueprint is now approved.
5. After phase 4: Standard/Advanced mode, connectivity and the school network remain **direction
   only**, not approved for building. The modes/connectivity/network note preserves the decisions,
   worldwide identity proposal, operator inventory, open questions and staged order. Each needs
   its own plan and approval. Plan A+ waits for an online deployment; stable row identity and
   structural drafts stay deferred until justified. Ask the ARES team about `ares.edu`; it is not
   a default alias.

Actual ARES installation remains an operations priority: verify local `ares.local` links, machine
performance, exports and backup/restore with the operator. Do not deploy from these feature PRs.

**Other deferred work from /simplify (2026-10-18), each its own change:** a `ConflictSides`
component for duplicated version-side markup; one module-level scope/whitelist table for
`captureFieldPath` and `applyCapture` in `lib/editRecovery/projection.ts`. The unavailable-parent
response is implemented in #405; the Combine state machine stays deferred with full direct draft
updates.

**Separate follow-ups:** routine reads also load lineage; consider narrower projections
if plans reach hundreds of versions. Backfill batching is optional at much larger histories.
Lineage keeps the newest 2,000 ids and full windows conservatively use two-way comparison.

The strict row matching rule accepts all 95 current ARES plans (806 lessons). Refusals follow
administrator structural edits such as duplicated lessons or repeated/renamed phases. Recheck
future exports with the operator's `/tmp/ares-scan-tools/scan.py <folder of ARES JSON>`.

## Standing constraints

- Feature branch; no merge or deployment unless asked. Push and ready PR are authorized.
- Plan first for non-trivial work. All new screen wording was approved for phase 3b.
- Prove changes with types, lint, format, unit, integration, wire and browser checks on an isolated
  stack. Changed endpoints need wire-level authorization tests in the same PR.
- Credentials cannot push `.github/workflows/` changes; hand those to the operator.
- Next.js is 16.4.2 and Payload 3.91.0. Eight moderate dependency advisories remain; no high/critical.
- Read SPEC §5 and §6 for the canonical draft and Combine contracts. Search DECISIONS for the area
  touched; do not read it end to end.

## Handoff prompt

> Pick up Lesson3. Fetch first; read AGENTS → CLAUDE → SPEC §5/§6 → this file and recent DECISIONS.
> Main includes #408/#406 and the modes/connectivity/network design. Finish #409's ordinary-save
> deletion client correction; then the separate ARES-release Combine PR (predecessor/backfill choice
> before migration); then Insert link tidy-ups; then propose phase 4 scope before coding. Preserve
> both documentation records and current decisions. Ready PRs only; do not merge or deploy. Preserve
> source-deletion draft cascades and explicit PDF publication consent.
