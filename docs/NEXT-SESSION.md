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

**Base:** `origin/main` at `23a997c` (application code `f25b6fa`), including Combine corrections
(PR #401), the dark-mode Back-button fix (PR #402), and Combine simplification/restore retry (PR #403). Insert link Plan A is implemented on
`feat/insert-link-ares` for a ready PR. No merge or deployment is authorized for this change.

**Deployed state (operator-confirmed in main's `23a997c` handoff):** Combine phases 1–3b,
review corrections (#401), simplification/restore retry (#403), the dark-mode Back fix (#402), and
the Next.js 16.4.2 / Payload 3.91.0 security upgrade (#399) were deployed to the Rock on 2026-10-18.
The `combine_lineage` and `combine_draft_context` migrations ran in that deployment window.
Insert link Plan A has not been merged or deployed.

**Insert link Plan A:** approved wording, HTTP/HTTPS, four framework columns, optional label,
ARES/tracker normalization, Combine hiding, opt-in Rock PDF picker. Configured PDF files are public
independently of Explore; listing remains authenticated. No new migration, dependency or generator
change. Plan A+ document-time rewriting is deferred. `ares.edu` is not a default alias pending an
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

Validation for Plan A: types, lint, format and production build; unit **1,561**, integration
**313**, browser **111/111 without retries**; configured-folder wire **391 passed + 4
SMTP-dependent skips**. The unconfigured-folder PDF wire checks also passed (file 404, listing still
private). The configured-folder happy-path test skips when that optional folder is unset in CI;
it ran against an actual fixture locally. Import-map generation produced no changes; tracked test
configuration was restored. No workflow changes.

Use an isolated stack with both a distinct project name and port: Codex uses `lesson3-codex-probe`,
`127.0.0.1:3103`. Claude uses a separate clone and stack. Never tear down another agent's stack.
Always fetch before comparing branches or commits.

## Remaining work

1. Review Insert link Plan A on `feat/insert-link-ares`; merge or deploy only on the operator's
   instruction. See `docs/DESIGN-insert-link-ares-2026-10-18.md` for the approved scope.
2. **After #404 merges: server-identified unavailable parent**, as its own PR. Save-as-new returns
   its own 404 JSON via `endpoints/respond.ts`, with a fixed field such as
   `{ unavailable: 'source' | 'secondParent' }`; do not put this contract in Payload `APIError.data`.
   Deleted and unreadable versions produce the same response. Recheck under the existing plan lock;
   when both parents are unavailable, report the editing source first because its draft cascades
   away. Cover each parent, both unavailable, unreadable parents and unrelated failures with wire
   authorization tests against the built app. Remove `CombineVersions/saveFailure.ts`'s client
   probes; preserve current wording and draft/source-deletion rules.
3. **Phase 4 — bring a stale draft up to date using the Combine engine. Start by designing and
   implementing one typed Combine state machine**, including phase 4's offer-to-update, applying,
   conflict and failure states. Do not make this a standalone refactor of the currently working
   screen. Replace the five independent Combine state variables as part of that design. Prove each
   transition with unit tests and retain browser coverage for retry, restore, version/URL switching
   and discard. Safe Combine metadata capture/restoration already exists; preserve the second parent.
4. Plan A+ — optional document-time translation of stored `ares.local` addresses for an online
   installation. Not required for school use and not implemented in Plan A.
5. Stable row identity: remove strict correspondence refusals, fix ordinal compare cascades and
   allow drafts to hold structural edits.

**Other deferred work from /simplify (2026-10-18), each its own change:** a `ConflictSides`
component for duplicated version-side markup; one module-level scope/whitelist table for
`captureFieldPath` and `applyCapture` in `lib/editRecovery/projection.ts`. The unavailable-parent
response and Combine state machine are scheduled above, not additional standalone cleanup tasks.

**Separate follow-ups:** ordinary saves can return a 500 if their source is deleted mid-save; this
predates 3a and needs its own change. Routine reads also load lineage; consider narrower projections
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

> Pick up Lesson3 (`james-beep-boop/Lesson3`). Fetch first. Read AGENTS.md → CLAUDE.md → SPEC §5
> and §6 → this file → the newest five or six DECISIONS entries. Combine and its simplification
> are merged through PR #403. Insert link Plan A is on `feat/insert-link-ares`; check the PR state
> before new work. Do not merge or deploy unless asked. Preserve the source-deletion draft cascade.
