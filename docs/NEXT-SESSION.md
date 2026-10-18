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

**Base:** `origin/main` at `7667315` (`3749bfe` plus documentation). No migration since **v0.97**
(`2c25ed8`); no release tagged since. Full suite on `3749bfe`: unit 1,506, integration 310, wire 363
(+4 SMTP skips), browser 92/92; CI green. **Deployed:** the operator ran `scripts/deploy.sh` on the
Rock after PR #397 (`7105abf`); `3749bfe` ("Exit edit mode") is not known to be deployed. Deploying is
the operator's call: `cd /srv/lesson3 && scripts/deploy.sh` (takes an encrypted backup first).

**Shipped since v0.97** (details in SPEC and DECISIONS 2026-10-17/18):
- **Drafts** (SPEC §5 "Drafts"): editor buttons *Save as new version · Save as draft · Discard
  changes*; *Continue editing* when a draft exists; *Your Drafts* on Manage; a draft warning on the
  version-delete confirmations; the restore prompt offers *Restore my draft · Exit edit mode · Discard
  the draft* (Exit edit mode keeps the draft and leaves the editor).
- **Authorization hardening** (two external audits): every lock-then-write path re-reads its caller
  after the wait and refuses a caller who is gone, disabled, unverified, demoted or signed out
  (`refreshCaller`, `hooks/mutationAuthority.ts`); Save and Make Official re-check before committing.
  Drafts are never overwritten or cascaded away unseen (the `unchecked` lookup phase; tokenless saves
  never delete their source).
- **Combine versions, phase 2** (SPEC §6): `lib/combine/` (`planCombine`, `merge3`, ancestry) and the
  read-only `GET /api/lesson-bundle-versions/:id/combine-preview?with=:id`, with a total work budget
  and a strict row-correspondence rule.
- **Tests and CI:** the browser suite is green again (the Welcome dialog is pre-dismissed by `loginAs`);
  CI runs the restore-drill tests (`scripts/test-restore-db.sh`).

**Combine versions — the five phases:**
1. ✅ Drafts (above).
2. ✅ Engine and read-only preview (above).
3. ⏭ **Combine phase 3, approved as three separately reviewed changes.**
   **3a:** data/save support on `feat/combine-data-save` (not merged or deployed): `mergedFrom`,
   delete-proof numeric lineage (newest 2,000 ids), migration/backfill, deterministic ancestor selection,
   and multipart `mergeParent` on `save-as-new`. Combine saves refuse source deletion. SPEC §6 has
   the contract. Validation: types/lint/format/build passed; unit 1,516, integration 311, wire 386
   (+4 SMTP skips), browser 92 without retries; migration backfill/rollback/rerun, contract and
   restore checks passed on the isolated stack. New provenance fields are hidden; no UI yet.
   **3b:** the Combine screen, including safe automatic capture of Combine metadata.
   **3c:** complete draft resumption; ship 3b only with safe metadata preservation, or release
   3b/3c together. Metadata is only the other parent id and resolved field keys (64 KiB cap); restored
   text survives an unavailable parent as an ordinary draft. Recompute preview and require review
   when earlier choices cannot be verified.
   Screen scope: A "Combine versions" action in the editor; the plan applied as a
   restore-style overlay; each conflict resolved with version-labelled text choices / Write my own;
   a refusal message that says plainly why (e.g. two rows that cannot be told apart); saved through the existing
   `save-as-new` with the second parent recorded (`mergedFrom`); and a delete-proof `lineage` field
   (plain ids, migration backfilling from `sourceVersion`) so the common ancestor can be found past
   deleted versions. The editor switches to the engine-selected parent, URL included. An
   "already includes" message requires a conflict-free result identical to the descendant, not
   just an ancestry relationship.
4. Rebase a stale draft onto a newer version with the same engine.
5. Stable row identity: removes the strict matching rule, fixes the compare page's ordinal cascade,
   and lets drafts hold structural edits.

**3a review correction (PR #398):** lineage evicts oldest ids rather than preventing future saves.
When either history window is full, preview uses two-way comparison because completeness is unknown.
An empty multipart `mergeParent` is an ordinary save. Parent reads under the lock are projected.

**Separate follow-ups, outside 3a:** ordinary saves can still return a 500 if their source is deleted
mid-save; this race already exists on main (Combine saves hold the plan lock). Routine version reads
also load lineage; consider excluding it from routine projections if plans reach hundreds of versions.
Backfill batching is optional at much larger histories. Claude's proposed Next.js security upgrade
belongs in its own checkout/PR and was recommended before deploying 3a. No upgrade or deployment is
part of this change.

**On the strict matching rule** (DECISIONS 2026-10-18): all 95 current ARES plans (806 lessons) pass
it, so it costs nothing for uploaded content; refusals follow administrator structural edits
(duplicating a lesson, repeating or renaming phases). Re-check future exports with the operator-kept
scan script `/tmp/ares-scan-tools/scan.py <folder of ARES JSON>` (not in the repo).

**Standing constraints:**
- Our GitHub push credentials lack the `workflow` scope: any change under `.github/workflows/` is
  refused on push. Hand such edits to the operator (GitHub web editor).
- Work on a feature branch; merge to `main` or deploy only when the operator asks.
- Prove every change with type-check, lint, format, unit, and the integration/wire/browser suites on
  the isolated stack (`AGENTS.md`); every new or changed endpoint ships with wire-level 401/403/404
  tests in the same change (`CLAUDE.md`).
- Nine moderate dependency advisories remain (no high/critical; no exploit path established).
- Unverified, unchanged: a hydration warning on `/admin` and a Cloudflare script CSP warning, both
  reported from the Rock.

---

# Handoff prompt (for a new agent session)

> You're picking up **Lesson3** (`james-beep-boop/Lesson3`, branch `main`): a versioned lesson-plan
> library — Node/TypeScript + Payload CMS on Postgres — that ingests ARES lesson plans, lets teachers
> edit them under field-level permissions, keeps immutable versions, and exports DOCX/PDF through
> ARES's own generator.
>
> **Read, in order:** `AGENTS.md` → `CLAUDE.md` → `SPEC.md` §5 "Drafts" and §6 "Combine versions" →
> `docs/NEXT-SESSION.md` (short; current state and the phase plan) → the newest five or six entries of
> `docs/DECISIONS.md`. Search DECISIONS for the area you touch; don't read it end to end.
>
> **Where things stand:** phases 1 (Drafts) and 2 (Combine engine + read-only preview) are on `main`.
> **Next is phase 3, the Combine screen** — scope in `docs/NEXT-SESSION.md`.
>
> **Rules:** plan before building anything non-trivial and show the plan first; work on a feature
> branch and don't merge or deploy unless asked; prove each change (type-check, lint, format, unit,
> and the integration/wire/browser suites on the isolated stack in `AGENTS.md`); every endpoint change
> ships with wire-level authorization tests; our credentials cannot push `.github/workflows/` changes.
>
> **First task:** propose a phase 3 plan — screens and wording, the data change and its migration,
> endpoint changes with their wire tests, and browser tests — and wait for approval.
