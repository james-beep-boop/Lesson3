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

# CURRENT STATE — 2026-10-19

**Current base:** fetched `origin/main` `3472843`. #409 is refreshed from that main and pushed
at `a0ff598`, including the ordinary-source 404 client message and browser test; all local gates
and CI pass. Do not merge. **#410 — ARES releases combine cleanly** is ready for review, pushed
at `1209878` on `feat/ares-release-combine`. Existing `sourceVersion` plus audited unambiguous
backfill were approved before implementation. Its complete local proof passes: types/lint/format/
build, 1,616 unit, 316 integration, 398 wire (+4 existing SMTP skips), 122 full browser cases without
retries. It has a metadata-only forward repair migration; inspect its design and backup notes in
that branch before deployment. No merge or deployment is authorized.

**Completed tidy-up:** [#411](https://github.com/james-beep-boop/Lesson3/pull/411),
`f90b930` on `fix/insert-link-picker-lifecycle`, branched from fetched main independently of
#410. Skip PDF requests on unconfigured installs; cancel per-open requests and fence late responses;
show a configured busy region without blocking addresses; centralize framework labels and parse
pasted addresses once. No new endpoint, migration, publication rule or wording. Types/lint/format/
build, **1,609 unit, 314 integration, 397 wire (+4 existing SMTP skips), 124 full browser tests
without retries** pass, as do all 14 focused Insert link browser cases. Tracked test configuration
is restored. Ready for review; do not merge or deploy.

**Current branch:** `docs/phase4-scope-proposal`, from freshly fetched main. The
[phase 4 scope proposal](DESIGN-phase4-scope-2026-10-19.md) is ready for operator review only.
It proposes ordinary-draft updates using the real common ancestor, including newer ARES releases
on sibling branches, a reducer as the first implementation step, existing conflict review and
atomic resumable apply. Storage and endpoint cost are explicit; exact schema, migration, contracts
and screen wording still need the concrete design approval. **No phase 4 implementation is approved
or started.** The existing Save → Combine flow remains available. No test stack is running; only
Codex's lesson3-codex-probe:3103 was used and removed after proof.

**Previous merged baseline:** fetched `origin/main` at `18379c6` (#407, operator reports deployment underway).
Insert link cleanup is merged ([#408](https://github.com/james-beep-boop/Lesson3/pull/408), `9f6b6ff`):
actual-link and leading bullet/table label validation, word spacing, and stale focus targets
(mouse, Enter and Space). The small draft-to-Combine hint
([#406](https://github.com/james-beep-boop/Lesson3/pull/406)) was reviewed by the operator's request
and merged after it: when a restorable ordinary draft's source has a newer readable descendant, the
restore prompt suggests saving and then combining, and the saved version offers "Combine with
{version}". Combined validation: types, lint, format, production build, **1,603 unit**, **314
integration**, **397 wire + 4 existing SMTP skips** and **122 browser tests without retries**.
Not yet deployed: deploy only on the operator's instruction (no migration).

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

## Remaining work — latest operator order

1. #409's latest-main and ordinary-source client correction is pushed, all local gates and CI green;
   await review. Do not merge.
2. #410 completes §8 of `DESIGN-modes-connectivity-network-2026-10-19.md`: release predecessor,
   audited backfill and resource-side Combine rule, with real re-ingest/three-way and all local proof.
   Await CI/review; do not merge or deploy.
3. This separate Insert link tidy-up is complete and ready for review: PDF-picker request/loading lifecycle,
   shared field-label wording and duplicated address check. Public PDF edge/cache policy remains
   separate. Full proof on lesson3-codex-probe:3103 passes; tracked test configuration is restored.
4. Review [phase 4 scope](DESIGN-phase4-scope-2026-10-19.md) **before any phase 4 code**.
   The previous full direct-update design remains deferred in favor of #406 and is input, not
   implementation approval. If scope is approved, produce the concrete data/endpoint/wording design
   for approval; do not silently implement the old 512 KiB blueprint.
5. Standard/Advanced mode, connectivity, worldwide identity and school networking remain direction
   only, not approved for building. See `DESIGN-modes-connectivity-network-2026-10-19.md` for
   the inventory, decisions, open questions and staged order. Each needs its own plan. Plan A+
   waits for an online installation; stable row identity and structural drafts remain deferred.

Actual ARES installation remains an operations priority: local links, performance, exports and
backup/restore with the operator. Ask the ARES team about `ares.edu`; it is not a default alias.
No merging or deployment from these feature branches is authorized.

**Other deferred work from /simplify (2026-10-18), each its own change:** a `ConflictSides`
component for duplicated version-side markup; one module-level scope/whitelist table for
`captureFieldPath` and `applyCapture` in `lib/editRecovery/projection.ts`. The unavailable-parent
response is implemented in #405; the Combine state machine stays deferred with full direct draft
updates.

**Separate follow-ups:** #409 addresses the ordinary-save deletion race. Routine reads also load lineage; consider narrower projections
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
> #409 is refreshed/pushed at a0ff598, CI green. #410 (release ancestry/backfill/resources) and #411
> (Insert link request/label/parser tidy-up) are ready PRs; full local proof passes for each.
> Current branch docs/phase4-scope-proposal is design only. Await scope approval before the concrete
> phase 4 data/endpoint/wording design; no phase 4 code or migration is approved. Preserve both doc
> histories and the latest operator order. No merge or deployment. Codex's test stack is removed.
