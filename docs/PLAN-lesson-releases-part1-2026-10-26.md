# Part 1 — ARES lesson releases: import, release dates, automatic Official (implementation plan)

**Status: PROPOSAL, 2026-10-26 (revision 2). The operator's decisions are recorded below. Revision 2
answers an external review (GPT) of revision 1; one new decision is needed (§"Decisions"). No code is
written.** This is build part 1 of
`docs/DESIGN-school-commissioning-and-updates-2026-10-26.md` (§10b, §4's lesson manifest, §14 item 1).
It is the core that every route uses — commissioning, the update tool and Manage → upload — and needs no
test machine: everything below runs in the isolated test stack. Mark's open question (how `ares.local`
is resolved) does not touch it.

Proposed as **two PRs**: 1a (import behaviour, plus the minimum confirmation screen so uploads keep
working) and 1b (what people see). 1a is useful on its own; 1b depends on it.

**Revision 2 (after review):** release identity is the release id, not "any matching content" (§3);
duplicate, conflict and older-release checks run again under the write locks (§3); a reused release id
refuses the whole set, consistent with the design (§3); confirmation is bound to the previewed
decisions (§5); the minimum confirmation screen moves into 1a (§5); the command line's exit codes are
defined (§6); Official changes are recorded when they happen, so the notice's date is true (§4a); the
manifest maps each file to its kind (§1).

---

## What exists to build on (checked against `main` at `98f1a74`)

- **One import core** (`app/src/ingest/index.ts`): `prepareItems` (read-only pre-flight) and
  `writePrepared` (one transaction, subject-grade locks, then the plan-row lock). The web upload
  (`ingestUploadItems`) and the dev CLI (`ingestItems`) share it.
- **Re-ingest** already creates the next major as **Not Official** and links it to the previous ARES
  release through `sourceVersion` (`latestRelease`, #410).
- **Every ARES version carries `releaseFingerprint`** (`ares-content-v1:sha256:…`, set only by ingest
  through `req.context`; backfilled 2026-10-19 for every whole-major, author-less version). Teacher
  saves never inherit it. So "is this version an ARES release?" is simply "does it have a fingerprint?".
- **The "unchanged" check** compares a file with the plan's **latest** version only (`latestVersionForPlan`),
  which misses a release a teacher has saved on top of (design §10b).
- **The web upload's confirm-and-resubmit round** (409 `needsConfirmation` for missing subjects/grades,
  then a resubmit with approvals) — the pattern the Official confirmation follows.
- **Combine** opens from `?combineWith=<id>` on a version page (`LessonControls`), which the teacher
  prompt reuses.

## PR 1a — import behaviour

### 1. The lesson-set manifest (`LESSONS.json`)

Optional. Read from the root of an uploaded zip, or from the top of the directory given to the
command-line import. **One manifest describes one lesson set**: one zip, or one directory.

```json
{
  "format": 1,
  "release": { "id": "2026-11", "date": "2026-11-14" },
  "schemaVersion": "1.0.0",
  "minProgram": "1.08",
  "files": {
    "biology/g10/cell-structure.json": { "sha256": "…", "kind": "lesson-plan" },
    "biology/g10/cell-structure-quiz.json": { "sha256": "…", "kind": "quiz" }
  }
}
```

- `release.id` — a short string ARES chooses, unique per release. `release.date` — a calendar date set
  by ARES (shown in full, day month year: "14 Nov 2026").
- **The whole set is refused, importing nothing,** with *"This lesson set needs a newer Lesson3. Update
  the program first."* (and the versions involved) when any of these is true:
  - `format` is newer than this program understands;
  - `schemaVersion` is not a contract version this program accepts;
  - `minProgram` is newer than this program.
- **`kind` per file.** `lesson-plan` files import. A kind this program does not know is not parsed; the
  report lists those files as "waiting for a program update". A file with no `kind` is a `lesson-plan`.
- **`sha256` per file.** A mismatch **warns, never blocks** (design §5): the report marks the file
  "looks damaged", and it still goes through normal validation, which rejects it if it is unreadable.
  Files in the zip but not listed, and files listed but missing, are reported as warnings.
- **No manifest** (a plain zip, today's normal case) works as today, with release "not stated" (§3 says
  how repeats are recognised without one).
- A malformed manifest refuses that set ("LESSONS.json could not be read: …"); guessing would be worse.

### 2. Two new system-only version fields

`aresReleaseId` (text, indexed) and `aresReleaseDate` (text, `YYYY-MM-DD`), on lesson-bundle-versions.
Set on create only, only through `req.context` by ingest, exactly like `releaseFingerprint`
(`fields/identity.ts`); every other write keeps the stored value, and teacher saves get null.
**Migration:** two nullable columns and one index; no backfill (existing releases show "not stated").
Excluded from content equality and from the editable form, like the fingerprint.

### 3. What counts as a new release (checked in pre-flight, and again under the write locks)

**A release is identified by its release id when there is a manifest, and by its content only when
there is not.** Matching content alone against the whole history would be wrong: if November's text
is A, December changes it to B and January deliberately restores A, January is a new release and must
import and move Official. For a file that matches an existing plan:

| Incoming file | The plan already has | Result |
|---|---|---|
| Release id **R** | a version with release id R and the **same** content | **Already here.** Nothing created, moved or sent. |
| Release id **R** | a version with release id R and **different** content | **The whole set is refused** (below). |
| Release id **R**, dated **earlier** than the plan's newest dated ARES release | — | **Older release, not imported.** Reported, nothing created (proposed; see "Decisions"). |
| Release id **R**, new to this plan | — | **New release:** created, §4 decides Official — even if its content equals an older release (the January case). |
| No manifest | its latest **ARES release** has the same content (fingerprint) | **Already here** (unchanged). |
| No manifest | anything else | **New release**, as today. |

- **Teachers' versions never suppress a release.** Today's rule skips a file that matches the plan's
  latest saved version, whoever saved it. That changes: the comparison is with the latest **ARES
  release** only. If a teacher's version happens to equal the new release, the release is still created,
  so its provenance and date are recorded.
- **Without a manifest, an old zip cannot be told from a deliberate restore.** So the confirmation list
  (§5) flags any incoming file whose content equals an *older* release of that plan: *"Same content as
  version 1.0.0 (an earlier release). Importing it will make this content Official again."* The person
  confirming decides.
- **A reused release id with different content refuses the whole set** (that zip or directory), as the
  design says: *"This lesson set says it is ARES release 2026-11, but its contents differ from the
  2026-11 release already here (e.g. 'Cell structure', version 2.0.0). Nothing from this set was
  imported."* Ordinary problems (a malformed file, a missing subject) stay per-file, as today.
- **Every one of these checks runs twice.** Pre-flight (read-only) builds the preview. `writePrepared`
  repeats them after taking the subject-grade locks and the plan-row locks, before writing anything,
  because two uploads can both pass pre-flight before either commits. A whole-set refusal discovered
  only under the locks rolls back the whole request and reports why; the person uploads again.

### 4. Automatic Official (inside the write transaction)

After creating the new release version for an existing plan, still holding the subject-grade lock and
the plan-row lock that `writePrepared` already takes:

- re-read the plan's **current** Official;
- if it is an ARES release (has a fingerprint), move Official to the new version, using the same
  system write and pre-warm call that a new plan's 1.0.0 uses today;
- otherwise (a teacher's version is Official, or there is none), leave it and report the plan as
  "waiting for the subject-grade administrator".

Because the decision is made here, under the locks, an administrator who changed Official after the
confirmation list was shown is respected (design §10b). §5 says what happens when the decisions differ
from the preview. Every outcome goes in the report: `officialMoved`, `officialKept` (with the reason),
`alreadyHere`, `olderNotImported`, `waitingForProgram`, `rejected`, `setRefused`.

### 4a. Record every Official change when it happens

Three system-only fields on the lesson plan, stamped by a `beforeChange` hook on lesson-plans whenever
`officialVersion` changes, whatever the route (Make Official, import, first ingest):

- `officialChangedAt` — when the pointer moved;
- `officialChangedFrom` — the previous Official version (nullable; cleared if that version is deleted);
- `officialChangedBy` — the user who moved it, or null for a system write such as an import.

**Migration:** three nullable columns; no backfill (existing plans have no recorded change, so they show
no notice). The 1b notice reads these, never a version's creation date: a release imported in November
that waited behind a teacher's version and was made Official in January is dated January, and "the
previous Official" is the version that really was Official, not merely the previous ARES release.

### 5. The confirmation round (web upload), bound to what was shown

Same shape as the taxonomy round, combined with it into one question when both apply:

- **First submit:** pre-flight computes every plan's decision (will move / will wait, and why, plus the
  "same content as an older release" flag). If **any** Official would move, the answer is **409**,
  `needsConfirmation`, the `official` preview and a **`previewToken`**: a hash of every decision in the
  preview (plan, its current Official, the incoming release, the decision). Nothing is written.
- **Resubmit** with the same files, the taxonomy approvals as today, and `confirmOfficial=<previewToken>`.
- **Under the write locks** the import recomputes the decisions and their hash. **If it differs** from
  the confirmed token (a plan that was waiting could now move, or the reverse), it writes nothing and
  answers 409 again with the new preview: *"Something changed since you looked. Please check the list
  again."*
- **No Official ever moves without a matching confirmation.** An upload whose preview moved nothing
  imports in one round, but if the recomputed decisions under the locks would now move one, it stops
  and asks, exactly as above.
- **The minimum confirmation screen ships in 1a**, in the existing upload dialog
  (`components/UploadBundles`): the list of lessons that will move and will wait, the older-content
  flags, and a **Confirm** button that resubmits with the token. Without it the upload screen could not
  complete an update between the two PRs. 1b only improves its wording and layout.

### 5a. Messages to subject-grade administrators (web upload only)

After the transaction commits, each subject-grade administrator whose subject-grade had an Official
moved or a release left waiting gets **one internal message per upload**, **sent from the Site
Administrator who confirmed it**: what moved (lesson, old and new version, release date) and what is
waiting for them, with links. A subject-grade with no administrator gets none (the upload report
already lists it). Sent after commit, so a rolled-back import sends nothing; a message failure is
logged and reported, and never undoes the import. Uses the existing messages collection; it creates
no new authority (the Site Administrator may already message anyone). The command-line import sends
no messages: no person is signed in.

### 6. A supported command-line import (for commissioning and the update tool)

`app/scripts/import-lessons.ts`, run through the `migrate` service like `recover-site-admin.ts`:

```
docker compose run --rm -v /media/stick/lessons:/import:ro migrate \
  npx payload run scripts/import-lessons.ts -- /import
```

- Uses the **web upload's** path (partial import, the same pre-flight, the same rules above), not the
  dev CLI's all-or-nothing one. `scripts/ingest.ts` stays as the developer tool, unchanged.
- **Missing subjects and grades:** prints the same list the web dialog shows and asks yes/no for each
  (similar names default to no, as in the dialog). `--yes` accepts every exact, non-similar item and
  declines the similar ones, for unattended use.
- **Official:** prints the same preview and asks once; `--yes` confirms. The token binding of §5
  applies: if the decisions change between the preview and the write, it prints the new list and asks
  again (with `--yes`, it stops instead, exit 4).
- Prints the report in plain words. **Exit codes**, so commissioning and the update tool can tell the
  outcomes apart:

  | Code | Meaning |
  |---|---|
  | 0 | Done: every file was imported, already here, an older release, or waiting for a program update. A run that changed nothing is a success. |
  | 2 | Done, with some files rejected (listed in the report). Everything else was imported. |
  | 3 | A whole set was refused (needs a newer program, malformed manifest, reused release id). Nothing from it was imported. |
  | 4 | Not confirmed (declined, or the decisions changed under `--yes`). Nothing written. |
  | 1 | Error (database, files unreadable). Nothing written. |

### 7. Tests (1a)

- **Unit:** manifest parsing (valid; malformed; missing; per-file kinds; unknown kind; newer `format`,
  `schemaVersion` or `minProgram` refuse the set); the release-identity table in §3, row by row; the
  Official decision table; the preview token (same decisions → same token; any changed decision →
  different token).
- **Integration (real Postgres):**
  - a teacher saves 2.0.1 on top of release 2.0.0, then 2.0.0 is re-imported → nothing created
    (today's bug, proven failing first);
  - the January case: A, then B, then a new release id restoring A → a new version, Official moves;
  - a teacher's version equal to an incoming release → the release is still created;
  - an older-dated release after a newer one → not imported, nothing moved;
  - no manifest: same as the latest ARES release → unchanged; equal to an *older* release → imported,
    flagged in the preview;
  - a reused release id with different content → the whole set refused, nothing written;
  - new release with ARES Official → moves and pre-warm is queued; with teacher Official → waits;
  - Official changed between preview and write → 409 with a new preview, nothing written;
  - `officialChangedAt/From/By` stamped on import, on Make Official and on first ingest; a waiting
    release made Official later is dated by the later change;
  - one-transaction rollback leaves no version, no Official move and no change record.
- **Concurrency (real Postgres, two simultaneous imports):** the same release twice → exactly one creates
  versions, the other reports "already here"; the same release id with different contents → one
  imports, the other's set is refused; neither leaves a partial write.
- **Messages:** after a confirmed upload, each affected subject-grade administrator gets exactly one
  message from the confirming Site Administrator; none on rollback, on a refused set, or from the
  command line.
- **Wire (`tests/http`, per CLAUDE.md):** the upload endpoint's 401 (no session), 403 (Teacher,
  Subject-grade administrator), the 409 Official preview with its token, the confirmed happy path, a
  stale token (409 with a new preview), a forged or missing token when a move is due (409, nothing
  written), and a combined taxonomy + Official round.
- **Browser:** the minimum confirmation screen — upload, see the list, confirm, see the result.
- **Command line:** each exit code; with `--yes`, run twice (the second run imports nothing and exits 0).

### 8. SPEC changes in the same PR

§7 (manifest; production command-line import; release identity by release id, and by content only
against the latest ARES release when there is no manifest, amending the "latest saved version" rule;
older releases not imported; reused release ids refuse the set; automatic Official, its exception and
its token-bound confirmation) and §6 (the two release fields; the Official change record; Official
moved by import under the locks).

## PR 1b — what people see

1. **Release label.** Wherever a version number appears with detail — the lesson page header, the
   versions list and the version details — an ARES version shows *"2.0.0 · ARES release 14 Nov 2026"*, or
   *"ARES release: not stated"*. Teacher versions show nothing extra. The catalogue row is unchanged
   (space on phones).
2. **"Official updated" notice on the lesson page,** when the plan's last Official change was made by an
   import (`officialChangedBy` null, §4a): *"Official updated to the ARES release of 14 Nov 2026 on
   3 Dec 2026. The previous Official (1.0.0) is still in the version history."* The date is
   `officialChangedAt` and the previous Official is `officialChangedFrom`, never derived from creation
   dates or `sourceVersion`.
3. **Teacher prompt.** When a teacher with editing access opens a lesson whose Official is a newer ARES
   release than the one their own latest version is based on: *"ARES has published a newer version of
   this lesson. Your version 1.0.2 is based on the older one. Combine them?"* — opening Combine through
   the existing `?combineWith=`. "Not now" hides it until the page is reloaded. Nothing is stored.
4. **Upload screen:** 1a's minimum confirmation screen gets its final wording and layout, in the same
   dialog as the taxonomy question.
5. **Guide and `USER_GUIDE.md`** updated in the same PR (the parity tests enforce it).

**Tests (1b):** unit tests for the label and notice wording; browser tests for the label, the notice
and the teacher prompt opening Combine; the upload dialog's combined round.

## Decisions (operator, 2026-10-26)

1. **Administrator messages:** sent from the Site Administrator who confirmed the upload; none from
   the command-line import (§5a, in PR 1a).
2. **Release label:** the full date, day month year — *"ARES release 14 Nov 2026"*.
3. **Manifest:** optional, as proposed. ARES's export does not write `LESSONS.json` yet; until it does,
   ARES zips work as today with the release "not stated". The field names above are what ARES's export
   would adopt.

**Needed (new in revision 2):**

4. **An older stick after a newer release.** Proposed: a release dated earlier than the plan's newest
   dated ARES release is **not imported**, and the report says *"Older than the release already here
   (14 Nov 2026 is older than 2 Dec 2026)."* Nothing moves. ARES's deliberate corrections always come as
   a new, later-dated release, so nothing legitimate is lost. The alternative — import it as a new
   version and let the confirmation list show the move — risks a technician with an old stick quietly
   undoing a newer release.

## Order and size

1a first (the migration, import rules, the token-bound upload round with its minimum screen, the
Official change record, administrator messages, the command-line import, tests, SPEC), then 1b. Each is
one PR with the full gate. Revision 2 adds work to 1a: roughly three to four days for 1a and one to two
for 1b.
