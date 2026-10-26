# Part 1 — ARES lesson releases: import, release dates, automatic Official (implementation plan)

**Status: PROPOSAL, 2026-10-26. The operator's three decisions are recorded below; awaiting an
external review (GPT) before approval. No code is written.** This is build part 1 of
`docs/DESIGN-school-commissioning-and-updates-2026-10-26.md` (§10b, §4's lesson manifest, §14 item 1).
It is the core that every route uses — commissioning, the update tool and Manage → upload — and needs no
test machine: everything below runs in the isolated test stack. Mark's open question (how `ares.local`
is resolved) does not touch it.

Proposed as **two PRs**: 1a (import behaviour) and 1b (what people see). 1a is useful on its own; 1b
depends on it.

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

Optional. Read from the root of an uploaded zip, or beside the files for the command-line import:

```json
{
  "format": 1,
  "release": { "id": "2026-11", "date": "2026-11-14" },
  "schemaVersion": "1.0.0",
  "minProgram": "1.08",
  "kinds": ["lesson-plan"],
  "files": { "biology/g10/cell-structure.json": "sha256:…" }
}
```

- `release.id` — any short string ARES chooses, unique per release. `release.date` — a calendar date set
  by ARES (shown in full, day month year: "14 Nov 2026").
- `minProgram` — refuse the whole set, importing nothing, if this program is older: *"This lesson set
  needs Lesson3 1.08 or later; this server has 1.07."*
- `kinds` — kinds this program does not know are listed as "waiting for a program update"; the rest
  import.
- `files` — per-file sha256. A mismatch **warns, never blocks** (design §5): the report marks the file
  "looks damaged", and it still goes through the normal validation, which rejects it if it is actually
  unreadable.
- **No manifest** (a plain zip, today's normal case) works exactly as today, with release "not stated".
- A malformed manifest is a plain refusal of the upload ("LESSONS.json could not be read: …"), since
  guessing would be worse.

### 2. Two new system-only version fields

`aresReleaseId` (text, indexed) and `aresReleaseDate` (text, `YYYY-MM-DD`), on lesson-bundle-versions.
Set on create only, only through `req.context` by ingest, exactly like `releaseFingerprint`
(`fields/identity.ts`); every other write keeps the stored value, and teacher saves get null.
**Migration:** two nullable columns and one index; no backfill (existing releases show "not stated").
Excluded from content equality and from the editable form, like the fingerprint.

### 3. Repeated imports and reused release ids (pre-flight, read-only)

For a file that matches an existing plan:

- **Already imported:** if any version of that plan has the same `releaseFingerprint`, skip it:
  *"Already here — the same content as version 2.0.0 (ARES release 14 Nov 2026)."* No version, no Official
  move, no message. This replaces "matches latest saved version" for ARES content; the latest-version
  comparison stays as a second check, unchanged.
- **Reused release id:** if the plan already has a version with this `aresReleaseId` but a different
  fingerprint, reject the file: *"This file says it is ARES release 2026-11, but differs from the 2026-11
  release already here (version 2.0.0)."*

### 4. Automatic Official (inside the write transaction)

After creating the new release version for an existing plan, still holding the subject-grade lock and
the plan-row lock that `writePrepared` already takes:

- re-read the plan's **current** Official;
- if it is an ARES release (has a fingerprint), move Official to the new version, using the same
  system write and pre-warm call that a new plan's 1.0.0 uses today;
- otherwise (a teacher's version is Official, or there is none), leave it and report the plan as
  "waiting for the subject-grade administrator".

Because the decision is made here, under the locks, an administrator who changed Official after the
confirmation list was shown is respected (design §10b). Every outcome goes in the report:
`officialMoved`, `officialKept` (with the reason), `alreadyHere`, `rejected`.

### 5. The confirmation round (web upload)

Same shape as the taxonomy round, and combined with it into one question when both apply:

- First submit, with any plan whose Official **would** move: **409**, `needsConfirmation`, and an
  `official` preview — each plan with its current Official, the incoming version and release, and
  whether it will move or wait (and why). Nothing written.
- Resubmit with `confirmOfficial=1` (and taxonomy approvals, as today): import, applying §4.
- An upload that moves no Official (all new plans, or all waiting) needs no extra round.

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
- **Official:** prints the same preview and asks once; `--yes` confirms.
- Prints the report in plain words and exits non-zero only if nothing could be imported.

### 7. Tests (1a)

- **Unit:** manifest parsing (valid, malformed, missing, unknown kinds, `minProgram` too new); the
  already-here and reused-id decisions; the Official decision table (ARES Official → moves; teacher
  Official → waits; no Official → waits).
- **Integration (real Postgres):** a teacher saves 2.0.1 on top of release 2.0.0, then 2.0.0 is
  re-imported → nothing created (today's bug, proven failing first); a new release with ARES Official
  → Official moves and pre-warm is queued; with a teacher Official → stays; Official changed between
  preview and write → the write respects it; one-transaction rollback leaves no version, no Official
  move.
- **Messages:** after a confirmed upload, each affected subject-grade administrator gets exactly one
  message from the confirming Site Administrator; none on rollback; none from the command line.
- **Wire (`tests/http`, per CLAUDE.md):** the upload endpoint's 401 (no session), 403 (Teacher,
  Subject-grade administrator), the 409 Official preview, the confirmed happy path, and a combined
  taxonomy + Official round.
- **Command line:** the import script against the test stack, with `--yes`, re-run twice (second run
  imports nothing).

### 8. SPEC changes in the same PR

§7 (manifest; production command-line import; repeated imports matched by fingerprint, amending the
"latest saved version" rule; reused release ids refused; automatic Official and its exception) and §6
(the two release fields; Official moved by import under the locks).

## PR 1b — what people see

1. **Release label.** Wherever a version number appears with detail — the lesson page header, the
   versions list and the version details — an ARES version shows *"2.0.0 · ARES release 14 Nov 2026"*, or
   *"ARES release: not stated"*. Teacher versions show nothing extra. The catalogue row is unchanged
   (space on phones).
2. **"Official updated" notice on the lesson page,** when the Official version is an ARES release whose
   predecessor release exists: *"Official updated to the ARES release of 14 Nov 2026 on 3 Dec 2026. The previous
   release (1.0.0) is still in the version history."* Derived from the version itself (its release
   date, creation date and `sourceVersion`); no new stored state.
3. **Teacher prompt.** When a teacher with editing access opens a lesson whose Official is a newer ARES
   release than the one their own latest version is based on: *"ARES has published a newer version of
   this lesson. Your version 1.0.2 is based on the older one. Combine them?"* — opening Combine through
   the existing `?combineWith=`. "Not now" hides it until the page is reloaded. Nothing is stored.
4. **Upload screen:** the Official preview (step 5 above) in the same dialog as the taxonomy question,
   with plain wording for "will move" and "will wait".
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

## Order and size

1a first (the migration, import rules, upload round, administrator messages, command-line import,
tests, SPEC), then 1b. Each is
one PR with the full gate. Roughly two to three days of work for 1a and one to two for 1b.
