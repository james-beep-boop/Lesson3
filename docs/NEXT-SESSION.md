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

**Base:** `origin/main` at `f25b6fa`. **Deployed to the Rock 2026-10-18 (operator-confirmed)**:
phases 1–3b of Combine versions, the 3b review corrections (PR #401), the `/simplify` pass (PR #403),
the dark-mode Back fix (PR #402) and the Next.js 16.4.2 / Payload 3.91.0 security upgrade (PR #399).
Two migrations ran in that deploy window: `combine_lineage` (3a) and `combine_draft_context` (3b).

**Combine 3b was reviewed after merge** (`/code-review`: six fixes in #401) **and simplified** (#403:
restore now returns the stored second parent and the following Combine preview is the one gate, so a
rate limit at restore offers Retry instead of dropping the parent).

The screen picks two versions, reviews automatic changes and conflicts, and opens the engine's
starting version (URL included). Conflict choices name version numbers and can change until Save;
Write my own starts from the editing version. Save stays blocked until choices are complete, never
offers parent deletion, creates Not Official, and leaves Official unchanged. Already-included
messages require equality with the descendant after applying the engine's overlay.

Unfinished combinations capture only the second-parent id and resolved field keys (64 KiB cap),
atomically with draft prose. Restore returns that id to its owner; the following Combine preview
authorizes it and computes current conflicts, preserving text and asking for unresolved choices. Missing second parents yield ordinary drafts with an explanation.
**Operator decision: do not retain drafts after the editing source is deleted.** Keep the existing
cascade; an editor still open explains a failed save and leaves text available for copying.

Validation at `f25b6fa`: types, lint, format and production build; unit **1,538**, integration
**313**, browser **104** (plus the dark-mode Back test: 105 on that branch); wire **389 passed + 4
SMTP-dependent skips**; CI green on #401, #402 and #403. Use an isolated stack with both a distinct project
name and port: Codex uses `lesson3-codex-probe`, `127.0.0.1:3103`. Claude uses a separate clone and
stack. Never tear down another agent's stack. Always fetch before comparing branches or commits.

## Remaining work

1. **Insert link for ARES** (next; Codex) — `docs/DESIGN-insert-link-ares-2026-10-18.md` (approved). Plan A (editor:
   accept `http`, four framework columns only, optional label, store pasted ARES addresses as
   `http://ares.local…`, Rock PDF folder opt-in, public PDF serving) then Plan A+ (rewrite
   `ares.local` when generating, for the future online version).
2. Rebase a stale draft onto a newer version using the engine. Safe Combine metadata capture and
   restoration are already included with the screen because automatic drafts must not lose their
   second parent.
3. Stable row identity: remove strict correspondence refusals, fix ordinal compare cascades and
   allow drafts to hold structural edits.

**Deferred from /simplify (2026-10-18), each its own change:** one state machine for LessonControls'
five Combine `useState`s (their reset sites have drifted); save-as-new returning which parent is
missing, replacing the client probe in `CombineVersions/saveFailure.ts`; a `ConflictSides` component
for the duplicated A/B markup; one module-level scope/whitelist table for `captureFieldPath` and
`applyCapture` in `lib/editRecovery/projection.ts`.

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
> and §6 → this file → the newest five or six DECISIONS entries. Phase 3b is merged; review fixes
> are on `fix/combine-recovery-failures` in a ready PR. Check its current state before new work. Work on a feature branch and do not merge or deploy
> unless asked. Preserve the decision that deleting the editing source deletes its draft.
