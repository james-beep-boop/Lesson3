# School machines: commissioning, reinstall and updates — design (proposal)

**Status: PROPOSAL for operator approval, 2026-10-26 (revision 2, same day). Planning only — nothing
here is approved for implementation, and no code is written.** It records an operator discussion of
2026-10-25/26 (with Mark's input on how ARES installs and visits schools) and turns it into a plan. Each
build part below still needs approval before work starts. SPEC changes it needs are listed in §12 and
land with the code that implements them, not before.

**Where it stands (2026-10-26, end of day):** every question is answered except one for Mark (§13: how
`ares.local` is resolved), which affects only parts 5–6. **Part 1 has its own implementation plan,
`docs/PLAN-lesson-releases-part1-2026-10-26.md`, with the operator's decisions recorded and an
external review (GPT) pending before approval;** parts 2–3 need no test machine
and can follow it.

**Revision 2** folds in an external review (GPT, 2026-10-26), whose two code claims were checked against
`deploy/online/update.sh` and are correct: the updater never rolls back, and it stops when the new
settings template has keys the school's `.env` lacks. Changes: a stronger proof before "safe to wipe",
scoped to Lesson3 (§7b); accurate update recovery (§10a); power-cut resumption as a requirement (§7d);
old-upgrade testing and settings without hand edits (§7c); repeated and interrupted imports (§10b);
password custody (§8); checksums instead of signing keys, by operator decision (§5); honest wording
on USB rotation (§8). Also: the operator reports that technicians already back up the other ARES programs' teacher uploads to USB before a
full reinstall (§1, §13).

Read with: `docs/DESIGN-backup-recovery-2026-10-21.md` (Phase A, shipped) and
`docs/PLAN-phase-b-recovery-2026-10-22.md` (Phase B, paused for test machines), which this design
shares its stick, its restore path and its acceptance test with; `docs/DESIGN-modes-connectivity-network-
2026-10-19.md` (connectivity levels, the hub); `docs/LOCAL-SERVER-DEPLOYMENT.md` (today's installer);
`docs/OPS.md` ("Preparing a machine for another school").

---

## 1. How ARES actually installs and visits schools

- **Mark pre-installs the ARES server on one master machine, copies its disk with Clonezilla, and
  installs that copy on each school's hardware.** Hardware is **Intel/AMD (amd64) only**; the Rock is the
  only ARM machine and is not a school machine.
- **Installs and reinstalls arrive by USB, carried by a technician.** A reinstall wipes the disk and
  installs a fresh image of the whole ARES server.
- **Visits are irregular.** Nearby active schools may be visited often; others may go two years, or be
  forgotten altogether. Bulk updates happen when a visit happens, mostly at the start of the school year.
- **Internet is a bonus, never a dependency.** At least 25% of schools are outside cell range or on its
  fringe. Kenyan teachers and technicians pay for every byte, from their own pockets (ARES already pays
  the Teacher Council a stipend partly to cover the data their meetings use). A technician with a
  working, slightly older version will usually skip a download. Mark expects to add cheap, very slow
  internet to some schools, mainly to monitor usage.
- **The other ARES programs on the server also hold teacher-uploaded content.** Before a full
  reinstall, the technicians already back it up to USB (operator, 2026-10-26). How exactly is still to
  be confirmed with Mark (§13); Lesson3's step joins that existing routine rather than replacing it.

**What follows from this:** USB is the primary route for everything. Internet is supported for the
cases where it helps, and is never assumed. Every school's backups must run between visits without
anyone starting them, and every school must upgrade cleanly from however old its software is when a
technician finally arrives.

## 2. What goes wrong if the image is simply copied (why this design exists)

A Lesson3 that was installed and used on the master, then copied, gives every school:

1. **the same backup keys**, so one school's recovery key opens every school's backups;
2. if backups go to Google Drive, **one shared backup folder** — backup filenames carry no school, and
   count-based pruning (`backup-db.sh`, newest 7 daily) lets schools delete each other's backups, while
   each school's page reports "Succeeded";
3. **the same `PAYLOAD_SECRET`, Postgres password and administrator accounts**, known to whoever built
   the image, and a wrong `ADMIN_URL` for every school;
4. **the same machine identity** — SSH host keys, `/etc/machine-id`, any Tailscale node (the hostname is
   the exception: it must stay the same everywhere, §13);
5. **the same Installation ID** (`docs/OPS.md` already warns about this one).

The fix is not a longer cleanup list after copying. It is to copy a machine that has **nothing to
clean**, and to make each copy unique on site.

## 3. Words used in this design

- **Seal** — the last step on the master before Clonezilla. It **refuses** if Lesson3 has been
  installed there (an `.env` or a Lesson3 database exists), then strips per-machine identity and leaves
  an `UNCOMMISSIONED` marker. It guarantees the master is safe to copy.
- **Commission** — the first step at a school. It makes the copy unique and sets Lesson3 up.
- **The ARES stick** — one USB layout that carries everything: program, lessons, optional fonts and
  the recovery tools. **kenyalessons.org publishes the same layout**, so the USB and internet routes are
  one code path with two sources.
- **The hub** — the central online Lesson3 (internal name, as in the connectivity design). Shown to
  people as **Kenya Lessons**.

## 4. The ARES stick and kenyalessons.org

One layout, on a stick or at `https://www.kenyalessons.org/`:

```
ares-stick/
  STICK.json             what is on this stick, written last (versions, sizes, sha256 of every file)
  program/<version>/     release bundle + docker-saved amd64 images (app, migrate, Gotenberg, Postgres)
  lessons/<release>/     lessons.zip + LESSONS.json (manifest)
  fonts/                 optional; see §9
  recovery/              recover.sh and the printed sheet (Phase B)
```

- **Built by one script from a release, on any machine with internet.** This is the Phase B kit
  builder (B1) widened to carry lessons. The recovery kit, the update stick and the install stick are
  the same artifact; build it once (`PLAN-phase-b-recovery` already says so).
- **Images are not GitHub release assets** (several GB, over the 2 GB asset cap). Over the internet,
  program images still come from the registry, pulled by the digest pins inside the checksummed bundle,
  so a damaged or substituted image is refused whichever registry serves it.
- **The lesson manifest (`LESSONS.json`)** carries what the lesson files themselves cannot:
  - the **ARES release** — an id and a **release date** set by ARES (never the import time; school
    clocks may be wrong, and two schools must show the same date for the same release);
  - the **contract `schemaVersion`** of its files and the **minimum Lesson3 version** that can import
    them;
  - the **kinds of content** it contains (today `lesson-plan`; later e.g. `quiz`), so an older program
    can import what it knows and set the rest aside;
  - per-file sha256 and the total size.

  The ARES lesson contract itself is unchanged.

## 5. Checking downloads and sticks: checksums, no signing keys

**Operator decision, 2026-10-26:** checksums only. Signing keys were proposed in revision 1 and dropped:
they add a key someone must guard, and the operator judges the risk too small to justify that, given
how much simpler checksums are for the schools that are online.

- **What is checked.** `STICK.json` (and the same file on kenyalessons.org) lists the sha256 of every
  file. The tool recomputes each file's sha256 and compares. A program bundle carries the digest pins of
  its container images, so the images are checked against the bundle wherever they come from.
- **Two levels of strictness** still apply, now to the checksum:
  - **Program updates: strict.** A program file whose checksum does not match is refused: *"This update
    is damaged. Copy it again, or use an ARES stick."*
  - **Lessons: warn, never block.** A lesson file cannot run anything (ingest parses JSON only and
    validates it), and versions are kept, so a bad set can be undone. A mismatch shows *"This lesson set
    looks damaged. Import anyway?"*; the receipt records it. The existing Manage → upload keeps
    accepting plain zips with no checksum, as today (Site Administrator only).
- **No dates and no online check,** so a wrong school clock or a missing connection never breaks a check.
- ⚑ **Accepted risk, stated plainly.** A checksum proves a file was not *damaged*; it does not prove the
  file came from ARES, because whoever controls kenyalessons.org controls the checksums too. If the site
  were taken over (bulk automated attacks on websites are common) or the domain lapsed and someone else
  bought it, a school that updates its **program** over the internet could install something that is not
  ARES's. USB updates from an ARES technician are unaffected. The operator accepts this risk.
- **Safeguards that cost nobody any effort:**
  - **Downloads use `https://` only,** never plain `http://`, so nothing can be swapped on the way.
  - **Keep kenyalessons.org on auto-renew, registered for several years** (an operator task, not code).
    A lapsed domain is the likeliest way for a stranger to end up serving files to schools.
  - **A program update always shows what it is** (version and a one-line summary) and asks before
    installing; nothing installs on its own.
- **Signing can be added later without redesign:** it would be one extra file next to `STICK.json` and a
  check in the tool. Nothing else changes.

## 6. Seal (on the master, before Clonezilla)

`seal-image.sh`:

1. **Refuses** if `/srv/lesson3/.env` exists or any Lesson3 Docker volume exists, naming what it found.
2. Checks the image carries what commissioning needs: the release bundle (no `.env`), the amd64 images
   loaded and matching the bundle's digest pins, `age`/`rclone`, and a current lesson set (zip,
   manifest, checksums).
3. Removes per-machine identity: SSH host keys, `/etc/machine-id` (emptied, regenerated on boot), any
   Tailscale state, logs and shell history.
4. Writes `UNCOMMISSIONED`, and prints "Sealed: safe to copy".

## 7. Commission (at each school)

One command, `sudo lesson3 commission`, in plain steps. It asks first:

> **Is this a new school, or a returning school whose server is being reinstalled?**

### 7a. New school

1. **Machine identity:** new SSH host keys and machine-id. ⚑ **The machine keeps the name it has
   on the image**, the one that answers to `ares.local`: ARES lessons link there, so renaming the machine
   would break every resource link (§13).
2. **Questions:** the school's name; the server's LAN address (as `install.sh` asks today); **internet:**
   *none / phone tether when needed / school connection*; backup destination (USB drive, or this
   server's disk if none — §8).
3. **Install** with the existing `install.sh`, with a new **offline mode**: it verifies the pre-loaded
   images against the pins and downloads nothing. (Today it always runs `docker compose pull`.) New
   secrets, `ADMIN_URL` from the LAN address. A fresh database gets its own Installation ID.
4. **First Site Administrator,** created at the school through the existing one-time form. The command
   waits until it exists.
5. **Lessons:** import the newest set it can find — the technician's stick, else kenyalessons.org (only
   if internet was chosen, with the size shown first), else the set on the image. Checked per §5.
   They arrive as **1.0.0 Official**. This needs a supported production import command (§12).
6. **Fonts** from the stick, if present (§9).
7. **Backups** (§8): destination, backup password, automatic schedule, first backup run and checked.
8. **Receipt:** installation ID, school name, program version, lesson release (and whether any
   file looked damaged), backup destination and key fingerprints. Written to the stick and to `out/ops/`.
   ⚑ **The backup password appears only on the printed recovery sheet,** handed to whoever the school
   names as keeper. It is never written to any file: not the receipt, not the stick, not the server.

### 7b. Returning school (reinstall)

**Before the wipe — `sudo lesson3 prepare-reinstall`:**

1. **Writes the recovery set onto the technician's stick:**
   - a final backup;
   - the school's settings (Phase B's recovery manifest: name, address, backup destination, recipients,
     agreement and contact settings; never `PAYLOAD_SECRET` or `POSTGRES_PASSWORD`, which are made new);
   - the school's password-locked recovery key.
2. **Proves it by using it, not by inspecting it.** It reads the backup back **from the stick**, restores
   it into a **throwaway database** on this server (the staging half of the A1 restore, with no swap),
   checks every table's row count, then reads a known lesson plan from that database and generates its
   DOCX and PDF. The throwaway database is then removed. It checks for disk space first.
3. Prints **"LESSON3 SAFE TO WIPE — <school>, backup of <time>"** only if every step passed; otherwise
   **"LESSON3: DO NOT WIPE"** with the reason.

⚑ This is the hardest stop in the design. Wiping without a proven backup destroys every teacher's
Lesson3 work at that school, and the backup on the server's own disk is destroyed by the same wipe.
**The stick stays with the technician until "Confirm" below has passed.**

⚑ **The message speaks for Lesson3 only.** The wipe also destroys the other ARES programs' teacher
uploads, which the technicians back up by their existing routine. Lesson3 cannot see those, so it never
declares the *machine* safe to wipe. The message ends: *"Back up the other ARES programs' teacher content
as usual before wiping."* No written pre-wipe checklist exists or is planned (§13), so this reminder is the only prompt.

**Wipe and install the new image** (Mark's process).

**After — `sudo lesson3 commission`, "returning school":**

1. Machine identity, as 7a.
2. **Restore from the stick** through the existing staged restore (`restore-db.sh`, A1). The school keeps
   its accounts, teachers' versions, discussions, settings, name and **Installation ID**. New secrets are
   generated (a new `PAYLOAD_SECRET` only signs everyone out — PLAN-phase-b, "Facts checked"). The newer
   program migrates the restored data forward on first start.
3. **Lessons** from the new image or the stick, as ARES releases on top of the school's work (§10).
4. **Confirm:** a person signs in, opens a lesson, exports DOCX and PDF. Then the receipt.

Unlocking the backup uses **ARES's key** (technicians are ARES staff) or the school's backup password as
the fallback (§8). This is the same command as Phase B recovery; build it once.

### 7c. Old schools must upgrade cleanly

A forgotten school may be several program versions and lesson releases behind.

- **Program:** a restore must accept a backup from **any** older Lesson3. Restores migrate forward step
  by step, so **no migration may ever be deleted or squashed** (a standing rule, SPEC change §12). That is
  necessary, not sufficient: database versions, migration dependencies and settings changes can each
  break an old upgrade on their own. So:
  - **Test representative old releases, not just the oldest.** Keep a backup made on every release that
    reached a school; each new release must restore each of them, on the school stack, before it ships.
  - **Database version jumps** (e.g. Postgres 16 → 17) are covered by the same test: backups are
    `pg_dump` files, which restore forward into a newer Postgres, never data directories.
- **Settings without hand edits.** Today `update.sh` stops when the new settings template has keys the
  school's `.env` lacks, and asks for them to be added by hand. At a school there is nobody to do that.
  For school installs:
  - **every new setting ships with a safe default**, and the update tool adds missing keys with those
    defaults, records what it added, and carries on;
  - a setting that truly has no safe default is **asked by the tool** in plain words, as commissioning
    asks its questions;
  - a test fails the build if `.env.example` gains a key that has neither a default nor a question.
- **Lessons:** skipped releases are fine. The newest release is linked to whatever release the school
  last had (release ancestry, #410), and teachers are offered Combine against that.

### 7d. Power cuts

School power fails often, so **every long step is resumable** — commission (new and returning),
prepare-reinstall and update:

- Each keeps a **journal** (as the A1 restore does) and records each step when it completes. Re-running
  the same command after a power cut **continues from the journal**; it never starts over.
- **Anything unique is created once and kept:** machine identity, secrets, Installation ID and the
  school's recovery key are written to disk (atomically) before they are used, and a re-run reuses them.
  A re-run never creates a second installation, new secrets for an existing database, or a new key that
  would orphan backups already made.
- **The backup password:** nothing is locked with it until the technician has typed it back to confirm
  they wrote it down. A cut before that point simply asks again; a cut after it finds the locked key
  already saved.
- **Acceptance tests cut the power** (kill the machine, not the process) at chosen points in each of
  the three commands, and prove the re-run finishes correctly.

## 8. Backups for school machines

- **The schedule is automatic from commissioning** (installed by commissioning, not added by hand as in
  `docs/OPS.md` step 5 today). The *protection* is not automatic, and the wording must not say it is:
  - backups to **this server's disk** need nobody, but are the weaker protection;
  - backups to a **USB drive** need someone at the school to plug it in and take it away again. When
    nobody does, Manage → System says the USB backup is overdue (Phase A's statements), and the disk
    backup still runs.
- **Destinations:**
  - **USB drive** when the school has one: best, and taken away from the server after each run. Both
    destinations can be on at once; the disk backup is always on.
  - **This server's own disk**: always on, and the only destination when there is no USB drive (operator:
    "fine if no USB available"). Today `backup-db.sh` refuses a destination on
    the same device as `/`; this adds an explicit "this disk" setting. It protects against a bad update,
    an accidental deletion or a corrupted database, **not** against disk failure, theft, fire, or a
    reinstall wipe. Manage → System says so in those words: *"Backups are on this server's own disk.
    They will not survive if the disk fails or the server is reinstalled. Add a USB drive for that."*
    Stored outside Docker's volumes, so removing containers or volumes cannot take the backups with them.
- **A backup password instead of a key file.**
  1. At commissioning the technician sets a backup password, typed twice. The tool suggests four random
     words (e.g. *river-lantern-mango-seven*); a technician may type their own, with a minimum length.
  2. Behind the scenes a key pair is still created. The private half is **locked with the password** and
     the locked copy is stored beside every backup (server, backup drive, technician's stick).
  3. The server holds only the half that can lock backups, never the half that unlocks them.
  4. **Recovery needs only a backup and the password.**
  5. **The password exists only on paper:** the printed recovery sheet, kept by the person the school
     names. No receipt, log, stick or server file ever contains it (§7a step 8).
- **ARES's key is the safety net.** Every backup is also locked to ARES's key, as today, so a forgotten
  school password is not fatal. ARES's public key is the same at every school, by design.
- **One installation per destination.** The destination gets a marker naming the installation;
  `backup-db.sh` refuses to write to or prune a destination marked for another installation. This makes
  §2's "schools delete each other's backups" impossible rather than unlikely.
- **Why a password matters at all:** the database holds names, email addresses and password hashes, so
  "school123" is not acceptable even though the lessons are not confidential.

## 9. Fonts from USB

The local-school stack runs stock LibreOffice Gotenberg, without the Microsoft fonts (DOCX is unaffected;
locally made PDFs can have slightly different table row heights). If the stick carries a `fonts/` folder,
commissioning or the update tool copies the font files to `/srv/lesson3/fonts/` and a Compose override
mounts that folder read-only into the Gotenberg container. No image is rebuilt and no image contains the
fonts. The tool then confirms Arial is registered inside the container.

- ⚑ **To prove before building:** that LibreOffice in the stock Gotenberg image picks up fonts from a
  mounted folder without a rebuild.
- The licensing question for the fonts (DECISIONS: "do not distribute … without confirmed rights") is
  **set aside by the operator for now**, not resolved. This design only provides the mechanism.

## 10. Updates: the update tool, and how lessons arrive

### 10a. `sudo lesson3 update`

Run from the server's keyboard or SSH. A plain menu: **Check**, **Update from USB**, **Update from the
internet**, **Back up now**, **Status**.

- **Check** changes nothing. It reports: backup health; whether a stick is present; whether internet is
  reachable (only if the school chose internet); what program and lesson releases are available on each,
  and their download sizes; and whether this program can accept the lessons available.
- **Update** does the work, always in this order:
  1. **Backup capability.** If a backup cannot be taken right now, stop. Nothing changes without one.
  2. **Program first,** if newer, because new lessons may need it. Strict checksum check (§5). Images are
     loaded from the stick (`docker load`, checked against the pins) or pulled over the internet;
     today `update.sh` always pulls, so it needs the same offline mode as `install.sh`. The existing
     `update.sh` takes its pre-update snapshot (refusing to continue without one) and keeps the previous
     deployment files and the backup's record. **It does not roll back** (see "If an update fails" below).
  3. **Lesson compatibility:** the set's `schemaVersion` and minimum program version against this
     program. Too old: *"This lesson set needs program 1.12 or later; you have 1.07"*, and nothing is
     imported. Unknown content kinds: import what is understood, list what is waiting.
  4. **Backup** (a pre-update snapshot), then **import** the lessons (§10b).
- **If an update fails.** `update.sh` deliberately never rolls back on its own: once it reaches the point
  where a migration may have run, the old program must not be started against the new database. It stops,
  keeps the pre-update backup and the previous files, and says so. Re-running the same update resumes it.
  For a school, where nobody can read that output, the tool adds one plain choice:
  - **"Try the update again"** — resumes from the journal (the usual fix after a power cut, §7d);
  - **"Go back to the previous version"** — `sudo lesson3 update --go-back`: stops the app, restores the
    **paired pre-update backup** through the A1 staged restore, reinstates the previous deployment files
    and starts the **previous images**. Work saved after the update started is lost by going back, and the
    tool says so before asking.

  ⚑ Going back offline needs the previous images still on the machine, so **the update never deletes the
  previous release's images** until a later update has succeeded; the stick also keeps them. This is new
  work: today the operator would do all of this by hand.
- **Data is precious.** The internet route downloads a manifest of a few KB first, then **states the size
  and asks** before every download. Program images download only layers not already present, so the real
  size can be smaller than stated. Nothing ever downloads on its own. A school on slow internet can check
  for updates cheaply; it does not have to download them.
- **It runs on the server, never from the web app.** A program update needs control of Docker, and the
  stick is plugged into the server; letting the website trigger it would let anyone who takes a Site
  Administrator's account install software on the machine. Manage → System shows the last report
  read-only (installed program and lesson release, what is waiting, when the tool last ran), consistent
  with the rule that Manage → System never starts operations.
- **Expectation (Mark):** most updates will be bulk updates at a visit, from the technician's stick. The
  internet route exists for the cases where it helps and is not relied on.

### 10b. How a new ARES lesson release lands

- **Versions are never overwritten.** A new release is saved as a **new version** of the same lesson plan
  (next major, today's re-ingest rule), linked to the previous release by release ancestry (#410). The
  old release stays in the version history; that history is the backup of the old content. ⚑ Overwriting
  1.0.0 in place was considered and rejected: Combine compares the original, the teacher's change and
  ARES's change, and without the original every ARES correction would look like something the teacher
  undid, so merging would put old mistakes back.
- **Version numbers stay, and each ARES version also shows its ARES release** — e.g. *"2.0.0 · ARES
  release 14 Nov 2026"* — on the lesson page and in the version details, from the manifest's release date.
  A version imported without a manifest (a plain zip through Manage → upload) shows *"ARES release: not
  stated"*. Stored as system-only fields on the version.
- **Official moves automatically, except where the school chose otherwise.** If the plan's current
  Official is an ARES release, the new release becomes Official. If the school's administrator made a
  **teacher's** version Official, Official stays put, and the new release waits for the administrator.
- **Made very clear at the time** (operator requirement):
  - **before applying,** the tool lists every lesson whose Official will move, and every lesson where it
    will not and why, and asks the technician to confirm;
  - **on the lesson page,** *"Official updated to the ARES release of 14 Nov 2026 on 3 Dec 2026. Previous Official:
    1.0.0 (still in the version history)."*;
  - **to each subject-grade administrator,** an internal message listing what changed in their
    subject-grade and what is waiting for them, **sent from the Site Administrator who confirmed the
    upload** (operator, 2026-10-26). A command-line import has no signed-in person, so it sends none;
    the lesson-page notice and the import report cover it.
- **Teachers who edited the older release** see, when they open the lesson: *"ARES has published a newer
  version of this lesson. Your version 1.0.2 is based on the older one. Combine them?"* It opens the
  existing Combine screen with the right ancestor. Nothing changes without the teacher; the result is a
  new Not Official version. "Not now" hides it for the session only — no new stored state.
- **Unsaved drafts** get the notice that already shipped (save the draft as a version, then Combine).
  Phase 4 is dropped (DECISIONS 2026-10-25).
- **Repeated imports do nothing.** Importing a release a school already has creates no versions, moves
  no Official and sends no messages; it reports "already imported". ⚑ Today's "unchanged upload" check
  compares a file only with the plan's **latest** version, so once a teacher has saved 2.0.1, re-importing
  the 2.0.0 release would create a duplicate 3.0.0. The check must instead look for the same content
  among the plan's existing **ARES releases** (by release id and content fingerprint), whatever teachers
  have saved since.
- **A release id is never reused.** If an incoming set carries a release id the school already has, but
  any file's content differs, the import refuses with a plain error ("This lesson set says it is the
  release of 14 Nov 2026, but its contents differ from that release already here") and imports nothing.
- **Interrupted imports leave nothing behind.** The write is one transaction (as web upload's is today),
  so a power cut means nothing was imported and the re-run starts clean. Messages to administrators are
  sent only after the write commits, once per release per subject-grade.
- **The Official decision is made again at the moment of writing.** The confirmation list is a preview.
  When the import writes, it re-checks each plan's current Official inside the existing subject-grade
  lock, so an administrator who made a teacher's version Official in between is respected. Any plan
  whose answer changed is reported afterwards.
- **One implementation, two routes.** The server tool and Manage → upload share the same import code,
  the same automatic-Official rule and the same confirmation list. (The reviewer agrees with this
  recommendation; the operator decided yes, 2026-10-26.)

### 10c. New content kinds (presentations, quizzes)

- **Presentations generated from a lesson** are a new export of data Lesson3 already has. They arrive
  with a program update; the lesson set needs nothing new.
- **Quizzes** are new content. The manifest's content kinds let an older program recognise them and set
  them aside rather than fail. Their data model is a separate future design.

## 11. School name, and the hub's name

- **School name:** asked at commissioning, stored on the site settings, correctable by a Site
  Administrator on the Manage switchboard. Shown in small type under the page headings **Lesson Plans**,
  **Discussions** and **Manage**; at the very top of the avatar menu; as a large heading on the sign-in
  page; and in the browser tab title. **The top bar does not change** (phone width). **No logo**
  (operator decision). **Never on generated DOCX/PDF**, which reproduce ARES's layout.
- **The hub** shows **"Kenya Lessons · all schools"** in the same places. "All schools" matches the
  planned shared forum ("This school" / "All schools"). Avoided: *version* and *edition* (already mean
  something here), *National Library* (could be mistaken for the Kenya National Library Service),
  *repository* and *storage* (developer words). The product name stays **ARES Lesson Library**.

## 12. SPEC changes this needs (land with the code)

- **§7 Upload / import:** a supported production import command (today's CLI is dev-only and stops on
  missing taxonomy) that creates missing Subjects and SubjectGrades by the web upload's rules (exact
  names; near-miss names refused); the lesson-set manifest; the automatic-Official rule; the ARES
  release label; repeated imports matched against existing ARES releases (amending today's
  "latest saved version" rule); release ids never reused with different content.
- **§6 Versioning:** ARES release id and date as system-only version fields; the automatic Official
  move and its exception, re-checked under the subject-grade lock at write time.
- **§11 Operations:** seal, commission (new/returning), prepare-reinstall and its proof, the update tool
  and `--go-back`; resumable steps (power cuts); the this-disk destination; backup password and locked
  key, with the password never written to any file; installation marker on destinations; the standing
  rules that migrations are never deleted or squashed and that every new setting has a safe default or
  a question; checksum checks at two levels of strictness, with the accepted risk stated (§5).
- **§8:** none expected (no new authority; the update tool is server-side, the web upload stays Site
  Administrator only).

## 13. Open questions

1. **How teachers' devices find `ares.local`** (for Mark): does the server announce its own name on the
   network, or does the school's router map the name to a fixed address? It decides what a replacement
   server must keep (its name, or its address), and whether Lesson3's own address can simply be
   `http://ares.local:3001`, sparing the technician the LAN-address question in §7a.

**Decided 2026-10-26:**
- **Release label shows the full date,** day month year: *"2.0.0 · ARES release 14 Nov 2026"*.
- **Administrator messages come from the Site Administrator who confirmed the upload;** command-line
  imports send none.
- **The lesson-set manifest is optional.** ARES's export does not write one yet; until it does, zips
  work as today with the release "not stated".
- **No pre-wipe checklist.** Technicians back up the other ARES programs' teacher content from memory,
  and no written checklist will be made (operator). Lesson3's `prepare-reinstall` therefore prints its
  own "LESSON3 SAFE TO WIPE" result followed by a one-line reminder to back up the other ARES programs'
  teacher content as usual (§7b), and claims nothing about the rest of the machine.
- **Checksums only, no signing keys** (§5), with the internet-program-update risk accepted.
- **Manage → upload follows the same automatic-Official rule** and confirmation list as the server tool
  (§10b).
- **No hostname change, so no school-code format.** Every ARES lesson's 6,850 resource links point at
  `ares.local`, which is the machine's own name on the school network; renaming the machine would break
  every one of them. Every school machine keeps the image's name (the one that answers to
  `ares.local`; to confirm with Mark on a real ARES server). Schools are separate networks, so the same name in two schools
  never collides. A machine's identity is its Installation ID and school name,
  not its network name.

## 14. Build order (each its own PR, with its tests and docs)

1. **Lesson-set manifest + production import command + ARES release fields + automatic Official** —
   the core that every route uses, including repeated-import matching and the write-time Official
   re-check. Testable now in the isolated stack.
2. **School name** (field, switchboard, the six places).
3. **Backups for schools:** this-disk destination, backup password with locked key, installation
   marker, automatic schedule.
4. **The ARES stick builder + checksums** (shared with Phase B's B1).
5. **`install.sh` and `update.sh` offline modes; settings defaults instead of hand edits; seal;
   commission (new school)**, all resumable.
6. **prepare-reinstall (with its throwaway-database proof) + commission (returning school)** (shared
   with Phase B's B3).
7. **The update tool, `--go-back`,** and the read-only Manage → System report.
8. **Fonts from USB** (after the mount spike).

Parts 1–3 can be built and tested in containers now. Parts 4–7 need **one amd64 test machine** to run the
full seal → Clonezilla → commission → prepare-reinstall → wipe → restore cycle, with power cut at chosen
points in each command (§7d), and the old-release restore matrix (§7c). That is the same machine Phase B
is waiting for; the two acceptance runs should share it.

## 15. Out of scope

- **Usage monitoring** over the schools' slow internet (Mark's main reason for adding it). It needs its
  own design and a privacy notice (the connectivity design puts consent at hub enrolment).
- Hub sync, sharing between schools, the all-schools forum.
- ARM school images; school logos; phase 4 (dropped).
