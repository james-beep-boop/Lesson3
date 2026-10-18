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

**Base:** `origin/main` at `316531e`, including Combine 3b (PR #400, merge `4ae0889`) and
subsequent documentation. Phases 1–3b and the Next.js/Payload security upgrade are merged.
No merge or deployment is part of the current task. Deployment status should be checked with the
operator; merging code does not establish that the Rock has it.

**Phase 3b is merged** (PR #400, `4ae0889`, 2026-10-18), including draft resumption previously
called 3c. Review found six failures to fix before deployment. Corrections are on
`fix/combine-recovery-failures` for a ready PR, not merged or deployed. They add retry actions,
remove comparison work from prose capture and overlay application, rate-limit restore validation
with a prose fallback, preserve the second parent on unconfirmed 404s, and store SQL NULL.
The picker now reads only id/semver for callers who can combine, and an ordinary-draft restore
explains cancellation. No new migration: 3b still adds `edit_recovery.combine_context` and must be
migrated before starting the updated app.

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

Validation: types, lint, format and production build; unit **1,541**, integration **313**, browser
**104/104 without retries**; wire **389 passed + 4 SMTP-dependent skips**. Main CI at `316531e`
passed all three checks. Use an isolated stack with both a distinct project
name and port: Codex uses `lesson3-codex-probe`, `127.0.0.1:3103`. Claude uses a separate clone and
stack. Never tear down another agent's stack. Always fetch before comparing branches or commits.

## Remaining work

1. Review the correction PR on `fix/combine-recovery-failures`; merge or deploy only on the
   operator’s instruction. Do not deploy 3b before these corrections are reviewed. Run the planned
   `/simplify` where available after correctness review.
2. **Insert link for ARES** — `docs/DESIGN-insert-link-ares-2026-10-18.md` (approved). Plan A (editor:
   accept `http`, four framework columns only, optional label, store pasted ARES addresses as
   `http://ares.local…`, Rock PDF folder opt-in, public PDF serving) then Plan A+ (rewrite
   `ares.local` when generating, for the future online version).
3. Rebase a stale draft onto a newer version using the engine. Safe Combine metadata capture and
   restoration are already included with the screen because automatic drafts must not lose their
   second parent.
4. Stable row identity: remove strict correspondence refusals, fix ordinal compare cascades and
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
> and §6 → this file → the newest five or six DECISIONS entries. Phase 3b is merged; review fixes
> are on `fix/combine-recovery-failures` in a ready PR. Check its current state before new work. Work on a feature branch and do not merge or deploy
> unless asked. Preserve the decision that deleting the editing source deletes its draft.
