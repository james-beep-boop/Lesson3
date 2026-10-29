# Worldwide identity, part 2 — before schools hold data nobody can reach (implementation plan)

**Status: APPROVED as one PR by the operator, 2026-10-29. Revised the same day for Codex's plan review
(PR #488, findings 1–4 and two implementation details; see "Review changes"). Not yet built.**

Follows `docs/DECISIONS.md` 2026-10-19 ("Worldwide identity: foundations…") and
`docs/DESIGN-modes-connectivity-network-2026-10-19.md` §5 and §9 step 1. Operator, 2026-10-29: this
must land **before wide deployment**, because every machine that goes out first needs a migration
later, and some losses cannot be repaired after the fact (see "Why now").

## What exists (checked against `main` at `b7ddf39`)

- `uid` (random UUID, NOT NULL, UNIQUE, system-only, written by a field `beforeChange` hook) on
  **users, lesson plans and versions** — `fields/identity.ts`, migration `20261019_211325_worldwide_ids`.
- `releaseFingerprint` (`ares-content-v1:sha256:…`) on versions created from an ARES upload. Two
  schools importing the same release get **different** uids but the **same** fingerprint.
- `installationId` on the `system-settings` singleton; `scripts/reset-installation-id.ts` replaces it.
- Numeric ancestry: `sourceVersion`, `mergedFrom` (foreign keys, `ON DELETE SET NULL`) and `lineage`
  (serial ids, sorted ascending = local creation order, newest `MAX_LINEAGE` = 2000 kept;
  `lib/combine/lineage.ts`). A full window is treated as incomplete by `lib/combine/ancestry.ts`.
- Subjects and subject-grades need no id: their natural key (name + integer grade) is the identity.

## The gaps

1. **Messages, discussion topics and discussion replies have no worldwide id.** They are exactly what
   a nationwide forum and cross-school messages would sync.
2. **Version ancestry is stored only as local serial numbers.** These mean nothing on another machine.
3. **Nothing records which installation created a record.** After the first sync a row's origin
   cannot be worked out.
4. **A copied database keeps every uid.** The reset gives the copy a new Installation ID, but its
   users, lesson plans and versions keep the original machine's uids.

## Why now (the part that cannot be repaired later)

When a teacher deletes a version, `sourceVersion`/`mergedFrom` on its children are cleared and the
row, with its uid and fingerprint, is gone. `lineage` keeps the serial number, but nothing can turn
that number back into a worldwide identity afterwards. Each deletion on an offline machine
permanently cuts the worldwide ancestry of everything built on it, unless the identity was copied
into the descendants **when they were created**. Every day without this adds losses no later
migration can recover.

## The change

One PR, additive and invisible to every user. No screen, export, document or permission changes.

### A. `uid` on messages, discussion topics and replies
- Reuse `worldwideIdField()` unchanged on `Messages`, `DiscussionTopics`, `DiscussionReplies`. Read
  access: whoever can read the row.
- Not on `DiscussionParticipation`, `Favorites` or `EditRecovery`: one person's local state that never
  leaves the machine.

### B. Ancestry by worldwide key, stamped at create time

**The ancestor key** (one pure function, `ancestorKey(version)` in `lib/identity/ancestorKey.ts`):
- a version with a `releaseFingerprint` → **the fingerprint**;
- any other version → **its `uid`**.

This is how the ARES release survives deletion (review finding 1): a child of a release records the
release's fingerprint, not one school's random uid for it. School A's descendants and School B's
surviving copy then name the same ancestor, after either school deletes its row, with no side table.
The two formats cannot be confused (`ares-content-v1:sha256:…` vs a UUID). Inheritance is transitive
because keys are copied down with the closure, below.

**New system-only fields on versions:**
- `sourceVersionKey`, `mergedFromKey` (text) — the parents' keys.
- `lineageKeys` (text, `hasMany`) — **aligned with `lineage`**: `lineageKeys[i]` is the key of the
  ancestor whose local serial is `lineage[i]`. Same length, always; validated in the stamping hook.

**Order and cap (review finding 2).** UUIDs carry no order and must never be sorted. The aligned
array borrows the numeric lineage's order and cap, which already exist and are tested:
1. From both parents, build one map `serial → key`: each parent's own `id → ancestorKey(parent)`,
   plus `parent.lineage[i] → parent.lineageKeys[i]` for every entry.
2. Compute the numeric lineage with the existing `unionLineage` (union, ascending, newest 2000).
3. `lineageKeys = lineage.map(serial => map.get(serial))`.

So parents `[1,3]` and `[1,2]` give `[1,2,3]` and its three keys in either parent order, overflow
trims the same entries from both arrays, and a deleted ancestor's key survives because it travels
in the parents' arrays, not by looking its row up. The existing incompleteness rule (a full window
means "maybe incomplete") applies unchanged. If the map ever lacks a serial (a parent written before
this PR whose backfill could not resolve it, below), the entry gets that ancestor's **local key**.

**Local key** — `local:<installationId>:<serial>`: the key of an ancestor whose worldwide identity
was already lost before this PR. It is stable within the school (every descendant of the same
deleted row gets the same key, so a merge base on this machine still works) and never claims to be
anything elsewhere.

- These are plain text, **not foreign keys**: deleting the parent leaves them intact. The local
  relationships stay and keep driving today's features; nothing reads the new fields yet.
- One hook: `stampVersionLineage` already reads each parent inside the create; it also selects
  `uid`, `releaseFingerprint`, `lineageKeys` and stamps all four fields. Ingest, save-as-new and
  Combine all get it without per-caller code.
- **Keys for sync later** (not built): a version arriving from another school receives a local
  serial on arrival, so it fits the same aligned scheme.

### C. Origin installation
- New system-only text field `originInstallation` on users, versions, messages, discussion topics and
  replies, set on create and never changed afterwards (except by the copy reset, D).
- Not on lesson plans: a plan's identity is `(subject-grade, substrand_id)`, the same everywhere.
- **Read through the request's transaction, and fail loudly** (review detail 2): a new
  `requireInstallationId(req)` reads the singleton with `req` and throws if it is missing or
  unreadable. The existing `readInstallationId(payload)` stays as the Manage display helper
  (best-effort, null on error) and is not used for stamping.

### D. Copied databases re-mint every identity (review finding 4)
`scripts/reset-installation-id.ts`, with `APPLY=1`:
- **Refuses unless it is the only client of the database**: it counts other client backends on this
  database in `pg_stat_activity` and stops if any exist, telling the technician to stop the app and
  job runner first (`docker compose stop app`, which also stops the in-process jobs; then the
  `migrate` run as today). A nightly backup connected at that moment also counts: wait and rerun. A transaction
  alone cannot stop a create that read the old Installation ID moments before.
- Then, in **one transaction**:
  - new Installation ID;
  - new `uid` for every user, lesson plan, version, message, topic and reply;
  - **every distinct key** found in `sourceVersionKey`, `mergedFromKey` and `lineageKeys` is mapped
    once and rewritten everywhere it appears:
    - a UUID key → a fresh UUID — **the same fresh UUID wherever the old one appears**, including keys
      of ancestors with no row left; where the row still exists, its new `uid` is that same value;
    - a fingerprint key → unchanged (content identity, really shared by both machines);
    - `local:<old>:<n>` → `local:<new>:<n>`;
  - every `originInstallation` → the new Installation ID.
- Release fingerprints are untouched.
- The dry run reports each count it would change and whether other clients are connected.
- OPS "Prepare a machine for another school": add the stop step, and one line that people and saved
  versions on the copy become this school's own.
- The commissioning design's "Seal" step (`DESIGN-school-commissioning-and-updates-2026-10-26.md` §2)
  will make this path rare. Until it is built, the copy route exists, so the reset must be complete.

### Content copying (review detail 1)
`originInstallation`, `sourceVersionKey`, `mergedFromKey` and `lineageKeys` join `DROP_KEYS`
(`lib/versionContent.ts`). `contentOf` keeps unknown top-level keys, so without this they would be
copied into forks and break no-op comparisons. A test proves a save from any version gets fresh
values, never inherited ones.

### Migration
Same pattern as `20261019_211325_worldwide_ids`: add nullable, fill only where empty, then constrain.
Idempotent; `down` drops the new columns.
- uids on messages, topics, replies: `gen_random_uuid()`, then NOT NULL + UNIQUE index.
- `originInstallation`: this machine's Installation ID, then NOT NULL.
- **Ancestry keys from each row's whole recorded closure (review finding 3),** not only its direct
  parents. For every version and every entry `n` of its `lineage`:
  - row `n` still exists → `ancestorKey(row n)`;
  - row `n` is gone → `local:<installationId>:<n>`, counted as lost.
  With A → B → C and B deleted, C's `lineage` still holds A and B; C gets A's real key and B's local
  key. `sourceVersionKey`/`mergedFromKey` come from the surviving relationship; where it was already
  cleared they stay empty and are counted (which entry was the parent is not recoverable).
  The derivation is per entry and deterministic, so row order does not matter.
- A rerun fills only versions whose key fields are still empty; populated ancestry is never
  rewritten. The migration logs the lost and unresolved counts.

## Tests (in the same PR)

**Unit**
- `ancestorKey`: fingerprint wins over uid; uid otherwise.
- Key union: reversed parents give identical arrays; overlapping branches (`[1,3]` + `[1,2]` →
  `[1,2,3]`); overflow trims both arrays identically and keeps them aligned; a parent's deleted
  ancestor keeps its key; a missing serial gets the local key. No ordering by timestamp or UUID string.

**Integration**
- Save-as-new and Combine stamp all four fields; **delete the parent, and the child still carries its
  key** (assert first that it was set — the 2026-10-19 lesson about tests passing for the wrong reason).
- **Two imports of the same release** (two plan rows standing in for two schools, or one import,
  delete, re-import): descendants of each, delete one release row, and both descendant chains still
  carry the same fingerprint key — the shared release is still identifiable. Transitive: a
  grandchild carries it too.
- No API caller, form or `overrideAccess` copy can choose or change any new field (extends
  `tests/http/worldwideIds.http.spec.ts` to the three collections and the new fields).
- A fork does not inherit `originInstallation` or ancestry keys (`DROP_KEYS`).
- Stamping fails the create if the Installation ID cannot be read.
- **Reset:** refuses with another client connected; delete a parent → reset → fork and Combine
  afterwards: every UUID key, including the deleted ancestor's, is remapped consistently across
  parent fields and every descendant's closure; fingerprint keys unchanged; local keys carry the new
  id; a forced failure mid-way rolls everything back.

**Migration**
- A → B → C with B deleted: C gets A's real key and B's local key; lost count = 1.
- Rerun changes nothing; already populated ancestry is preserved; down then up issues fresh values.

No new endpoint, so no new `tests/http` route coverage beyond the field-write checks.

## Not in this PR

- Anything that reads the new fields, any sync, the hub, accounts across servers.
- Deletion records ("tombstones") for sync: deletions only matter once something has been sent.
- Switching Combine's ancestor lookup from local ids to keys.

## Operator answers (2026-10-29)

1. Build A–D as **one PR**.
2. **No real data anywhere**, the Rock included. The migration still backfills (it must work on any
   database), but the deploy note needs no list of machines.

## Review changes (Codex, PR #488, 2026-10-29)

| Finding | Change |
|---|---|
| 1 [P1] release identity lost when its row is deleted | Ancestor key = fingerprint for releases (B) |
| 2 [P2] ordering and cap without numeric ids | `lineageKeys` aligned with `lineage`, reusing `unionLineage` (B) |
| 3 [P2] backfill only from direct parents | Backfill every closure entry; local key for the lost (Migration) |
| 4 [P2] reset: deleted ancestors, concurrent writers | Map every distinct key; refuse with other DB clients (D) |
| Detail: `DROP_KEYS` | Four new fields added (Content copying) |
| Detail: transaction-aware id reader | `requireInstallationId(req)`, throws (C) |
