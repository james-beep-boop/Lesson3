# Worldwide identity, part 2 — before schools hold data nobody can reach (implementation plan)

**Status: PROPOSED, 2026-10-29. Awaiting operator approval. Nothing is built.**

Follows `docs/DECISIONS.md` 2026-10-19 ("Worldwide identity: foundations…") and
`docs/DESIGN-modes-connectivity-network-2026-10-19.md` §5 and §9 step 1. Operator, 2026-10-29: this
must land **before wide deployment**, because every machine that goes out first needs a migration
later, and some losses cannot be repaired after the fact (see "Why now").

## What exists (checked against `main` at `b7ddf39`)

- `uid` (random UUID, NOT NULL, UNIQUE, system-only, written by a field `beforeChange` hook) on
  **users, lesson plans and versions** — `fields/identity.ts`, migration `20261019_211325_worldwide_ids`.
- `releaseFingerprint` (`ares-content-v1:sha256:…`) on versions created from an ARES upload.
- `installationId` on the `system-settings` singleton; `scripts/reset-installation-id.ts` replaces it.
- Subjects and subject-grades need no id: their natural key (name + integer grade) is the identity.

## The gaps

1. **Messages, discussion topics and discussion replies have no worldwide id.** They are exactly what
   a nationwide forum and cross-school messages would sync.
2. **Version ancestry is stored only as local serial numbers** (`sourceVersion`, `mergedFrom`,
   `lineage`). These mean nothing on another machine.
3. **Nothing records which installation created a record.** Today every row is implicitly "here";
   after the first sync that is no longer true, and a row's origin cannot be worked out afterwards.
4. **A copied database keeps every uid.** The reset script gives the copy a new Installation ID, but
   its users, lesson plans and versions keep the same uids as the original machine, so two schools
   would claim the same people and versions.

## Why now (the part that cannot be repaired later)

`sourceVersion` and `mergedFrom` are foreign keys with `ON DELETE SET NULL`. When a teacher deletes a
version, every child's link to it is cleared, and its uid is gone with the row. `lineage` keeps the
deleted version's serial number, but nothing can turn that number back into a uid. So each deleted
version on an offline machine permanently cuts the worldwide ancestry of everything built on it.
Recording the parent's uid **at the moment the child is created** is the only fix, and every day
without it adds losses that no later migration can recover.

The other gaps are cheaper now for the ordinary reason: one migration on one demo server, instead of
on every school machine, some reachable only by USB.

## The change

One PR, additive and invisible to every user. No screen, export, document or permission changes.

### A. `uid` on messages, discussion topics and replies
- Reuse `worldwideIdField()` unchanged on `Messages`, `DiscussionTopics`, `DiscussionReplies`. Read
  access: whoever can read the row (no separate rule).
- Not on `DiscussionParticipation`, `Favorites` or `EditRecovery`: those are one person's local state
  (read markers, favorites, private drafts) and never leave the machine.

### B. Ancestry by uid, stamped at create time
- New system-only fields on versions: `sourceVersionUid`, `mergedFromUid` (text) and `lineageUids`
  (text, `hasMany`, same `MAX_LINEAGE` bound and trimming as `lineage`).
- `stampVersionLineage` already reads each parent inside the create; it also selects the parent's
  `uid` and its `lineageUids` and stamps the union. Same hook, same trusted path, so ingest, save-as-new
  and Combine all get it without per-caller code.
- These are plain text, **not foreign keys**: deleting the parent leaves them intact, which is the
  point. The local relationships stay as they are and keep driving today's features; nothing reads the
  new fields yet.
- All three join `DROP_KEYS`, so a copied version's ancestry is stamped, never inherited.
- **Ordering:** `lineageUids` is kept in creation order of the parents as recorded locally (the
  existing `lineage` sort). It is a set of ancestors, not a timeline, and no one may compare clocks
  to order it (design §3, "Clocks").

### C. Origin installation
- New system-only text field `originInstallation` on users, versions, messages, discussion topics and
  replies, set on create from this machine's Installation ID (`lib/identity/installationId.ts`), and
  never changed afterwards.
- Not on lesson plans: a plan's identity is `(subject-grade, substrand_id)`, and every school holds
  the same ARES plans.
- A record synced in later will carry its own school's value; that writer is the future sync code,
  not part of this PR.

### D. Copied databases re-mint every uid
- `scripts/reset-installation-id.ts`, with `APPLY=1`, in **one transaction**, also replaces every
  `uid` (users, lesson plans, versions, messages, topics, replies), rewrites the ancestry uid fields
  to the new values (a map old → new, so local ancestry survives the copy), and sets every
  `originInstallation` to the new Installation ID. Release fingerprints are untouched: they describe
  content, and both machines really do hold the same ARES release.
- The dry run reports the counts it would change.
- OPS "Prepare a machine for another school" says in one line that people and saved versions on the
  copy become this school's own.
- The commissioning design's "Seal" step (copy a machine with nothing in it,
  `DESIGN-school-commissioning-and-updates-2026-10-26.md` §2) will make this path rare. Until it is
  built, the copy route exists, so the reset must be complete.

### Migration
Same pattern as `20261019_211325_worldwide_ids`: add nullable, fill `WHERE … IS NULL`, then constrain.
- uids on the three new collections: `gen_random_uuid()`, then NOT NULL + UNIQUE index.
- `originInstallation`: filled with this machine's Installation ID, then NOT NULL.
- Ancestry uids: filled from the **surviving** parents only (join on the local id). A parent already
  deleted has no uid to recover; those entries stay empty and the migration logs how many. This is the
  loss "Why now" describes, and it stops growing the day this ships.
- Idempotent; `down` drops the new columns.

## Tests (in the same PR)

- Unit: `unionLineage` for uids matches the numeric version (bound, dedupe, trimming).
- Integration: a save-as-new and a Combine stamp `sourceVersionUid`/`mergedFromUid`/`lineageUids`;
  **delete the parent, and the child's uid ancestry is still there** (assert first that it was set,
  per the 2026-10-19 lesson about tests that pass for the wrong reason).
- Integration: no API caller, form or `overrideAccess` copy can choose or change any new field (the
  existing `tests/http/worldwideIds.http.spec.ts` pattern, extended to the three collections and the
  new fields).
- Integration: reset re-mints every uid, keeps local ancestry consistent under the new uids, keeps
  fingerprints, and rolls back completely if any step fails.
- Migration: up on a database with a deleted parent fills what survives and reports the rest; rerun
  changes nothing; down then up issues fresh values.
- No new endpoint, so no new `tests/http` route coverage is required beyond the field-write checks.

## Not in this PR

- Anything that reads the new fields, any sync, the hub, accounts across servers.
- Deletion records ("tombstones") for sync: deletions only matter once something has been sent, so
  they belong with the sync design.
- Switching Combine's ancestor lookup from local ids to uids.

## Open questions for the operator

1. Approve A–D as one PR? (Recommended: yes. They share one migration and one set of tests.)
2. Any school machines deployed with real data besides the Rock? The migration handles them either
   way; this only decides whether the deploy note needs a "run on these machines" list.
