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

**Base:** `origin/main` at `698271b`: phases 1 (Drafts), 2 (Combine engine/preview), 3a
(data/save, PR #398), and the separate Next.js/Payload security upgrade (PR #399) are merged.
No merge or deployment is part of the current task. Deployment status should be checked with the
operator; merging code does not establish that the Rock has it.

**Current work:** phase 3b, including draft resumption previously called 3c, on
`feat/combine-screen`, a ready PR for review. Draft metadata is a
separate commit from the screen. It adds one nullable `edit_recovery.combine_context` JSON column;
migrate before starting the updated app. Existing draft prose and timestamps are preserved.

The screen picks two versions, reviews automatic changes and conflicts, and opens the engine's
starting version (URL included). Conflict choices name version numbers and can change until Save;
Write my own starts from the editing version. Save stays blocked until choices are complete, never
offers parent deletion, creates Not Official, and leaves Official unchanged. Already-included
messages require equality with the descendant after applying the engine's overlay.

Unfinished combinations capture only the second-parent id and resolved field keys (64 KiB cap),
atomically with draft prose. Restore reauthorizes that id and plan, reruns preview, preserves text,
and asks for unresolved choices. Missing second parents yield ordinary drafts with an explanation.
**Operator decision: do not retain drafts after the editing source is deleted.** Keep the existing
cascade; an editor still open explains a failed save and leaves text available for copying.

Validation: types, lint, format and production build; unit **1,521**, integration **312**, browser
**101/101 without retries**; wire **388 passed + 4 SMTP-dependent skips**. Use an isolated stack with both a distinct project
name and port: Codex uses `lesson3-codex-probe`, `127.0.0.1:3103`. Claude uses a separate clone and
stack. Never tear down another agent's stack. Always fetch before comparing branches or commits.

## Remaining work

1. Review phase 3b; run the operator's requested `/code-review`, then `/simplify` where available.
   Do not merge or deploy without the operator's instruction.
2. Rebase a stale draft onto a newer version using the engine. Safe Combine metadata capture and
   restoration are already included with the screen because automatic drafts must not lose their
   second parent.
3. Stable row identity: remove strict correspondence refusals, fix ordinal compare cascades and
   allow drafts to hold structural edits.

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
> and §6 → this file → the newest five or six DECISIONS entries. Phase 3b is on
> `feat/combine-screen` for review, with metadata and screen in separate commits. Check the PR's
> current state before starting another change. Work on a feature branch and do not merge or deploy
> unless asked. Preserve the decision that deleting the editing source deletes its draft.
