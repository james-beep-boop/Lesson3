# School machines: commissioning, reinstall and updates — design (proposal)

**Status: PROPOSAL for operator approval, 2026-10-26. Planning only — nothing here is approved for
implementation, and no code is written.** It records an operator discussion of 2026-10-25/26 (with
Mark's input on how ARES installs and visits schools) and turns it into a plan. Each build part below
still needs approval before work starts. SPEC changes it needs are listed in §12 and land with the code
that implements them, not before.

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
- **The other ARES programs on the server also hold teacher-uploaded content.** How it survives a wipe
  today is an open question for Mark (§13).

**What follows from this:** USB is the primary route for everything. Internet is supported for the
cases where it helps, and is never assumed. Every school has to protect its own work between visits
with nobody's help, and must upgrade cleanly from however old its software is when a technician
finally arrives.

## 2. What goes wrong if the image is simply copied (why this design exists)

A Lesson3 that was installed and used on the master, then copied, gives every school:

1. **the same backup keys**, so one school's recovery key opens every school's backups;
2. if backups go to Google Drive, **one shared backup folder** — backup filenames carry no school, and
   count-based pruning (`backup-db.sh`, newest 7 daily) lets schools delete each other's backups, while
   each school's page reports "Succeeded";
3. **the same `PAYLOAD_SECRET`, Postgres password and administrator accounts**, known to whoever built
   the image, and a wrong `ADMIN_URL` for every school;
4. **the same machine identity** — SSH host keys, `/etc/machine-id`, hostname, any Tailscale node;
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
  STICK.json.sig         ARES signature over STICK.json
  program/<version>/     release bundle + docker-saved amd64 images (app, migrate, Gotenberg, Postgres)
  lessons/<release>/     lessons.zip + LESSONS.json (manifest) + LESSONS.json.sig
  fonts/                 optional; see §9
  recovery/              recover.sh and the printed sheet (Phase B)
```

- **Built by one script from a release, on any machine with internet.** This is the Phase B kit
  builder (B1) widened to carry lessons. The recovery kit, the update stick and the install stick are
  the same artifact; build it once (`PLAN-phase-b-recovery` already says so).
- **Images are not GitHub release assets** (several GB, over the 2 GB asset cap). Over the internet,
  program images still come from the registry, pulled by the digest pins inside the signed bundle, so
  the registry needs no trust of its own.
- **The lesson manifest (`LESSONS.json`)** carries what the lesson files themselves cannot:
  - the **ARES release** — an id and a **release date** set by ARES (never the import time; school
    clocks may be wrong, and two schools must show the same date for the same release);
  - the **contract `schemaVersion`** of its files and the **minimum Lesson3 version** that can import
    them;
  - the **kinds of content** it contains (today `lesson-plan`; later e.g. `quiz`), so an older program
    can import what it knows and set the rest aside;
  - per-file sha256 and the total size.

  The ARES lesson contract itself is unchanged.

## 5. Verification: two levels of strictness

- **Program updates: strict.** The update runs with full control of the server. A program that does not
  verify is refused, with the message to use an ARES stick instead.
- **Lessons: check, warn, never block.** A lesson file cannot run anything: ingest parses JSON only and
  validates it, and versions are kept, so a bad set can be undone. A set that fails or lacks a signature
  shows *"This lesson set could not be verified as coming from ARES. Import anyway?"*; the technician
  may continue, and the commissioning or update receipt records **unverified**. The existing
  Manage → upload keeps accepting unsigned zips, as today (Site Administrator only).
- **Built so it does not fail by accident:**
  - **No dates in signatures.** `ssh-keygen -Y sign` (already on every Ubuntu) or `minisign`; nothing
    expires, so a wrong school clock cannot break verification.
  - **No online check.** The `.sig` travels next to the file.
  - **Two ARES public keys in the image** (current and spare), so replacing a lost key does not strand
    machines already in schools.
  - **Damage is not distrust.** A sha256 mismatch says "download damaged — try again", not "untrusted".
- **Signing is part of publishing.** The script that writes the stick or uploads to kenyalessons.org
  signs as its last step. Who holds the private signing key is an open question (§13).

## 6. Seal (on the master, before Clonezilla)

`seal-image.sh`:

1. **Refuses** if `/srv/lesson3/.env` exists or any Lesson3 Docker volume exists, naming what it found.
2. Checks the image carries what commissioning needs: the release bundle (no `.env`), the amd64 images
   loaded and matching the bundle's digest pins, `age`/`rclone`, and a current lesson set (zip,
   manifest, signature).
3. Removes per-machine identity: SSH host keys, `/etc/machine-id` (emptied, regenerated on boot), any
   Tailscale state, logs and shell history.
4. Writes `UNCOMMISSIONED`, and prints "Sealed: safe to copy".

## 7. Commission (at each school)

One command, `sudo lesson3 commission`, in plain steps. It asks first:

> **Is this a new school, or a returning school whose server is being reinstalled?**

### 7a. New school

1. **Machine identity:** new SSH host keys and machine-id; hostname from a short school code.
2. **Questions:** the school's name; the server's LAN address (as `install.sh` asks today); **internet:**
   *none / phone tether when needed / school connection*; backup destination (USB drive, or this
   server's disk if none — §8).
3. **Install** with the existing `install.sh`, with a new **offline mode**: it verifies the pre-loaded
   images against the pins and downloads nothing. (Today it always runs `docker compose pull`.) New
   secrets, `ADMIN_URL` from the LAN address. A fresh database gets its own Installation ID.
4. **First Site Administrator,** created at the school through the existing one-time form. The command
   waits until it exists.
5. **Lessons:** import the newest set it can find — the technician's stick, else kenyalessons.org (only
   if internet was chosen, with the size shown first), else the set on the image. Verification per §5.
   They arrive as **1.0.0 Official**. This needs a supported production import command (§12).
6. **Fonts** from the stick, if present (§9).
7. **Backups** (§8): destination, backup password, automatic schedule, first backup run and checked.
8. **Receipt:** installation ID, hostname, school name, program version, lesson release (verified or
   not), backup destination and key fingerprints. Written to the stick and to `out/ops/`, and printed
   as a sheet that includes the backup password.

### 7b. Returning school (reinstall)

**Before the wipe — `sudo lesson3 prepare-reinstall`:**

1. Takes a final backup **onto the technician's stick**.
2. **Proves it:** decrypts it, checks every table's row count, records school name, Installation ID
   and backup time.
3. Prints **"SAFE TO WIPE — <school>, backup of <time>"** only if all of that passed; otherwise **"DO
   NOT WIPE"** with the reason.

⚑ This is the hardest stop in the design. Wiping without a proven backup destroys every teacher's work
at that school, and the backup on the server's own disk is destroyed by the same wipe. **The stick stays
with the technician until step 4 below has passed.**

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

- **Program:** a restore must accept a backup from **any** older Lesson3. Restores already migrate
  forward step by step, so this holds as long as **no migration is ever deleted or squashed**. Proposed
  as a standing rule (SPEC change, §12), with a test that restores the oldest data in the field into the newest
  program.
- **Lessons:** skipped releases are fine. The newest release is linked to whatever release the school
  last had (release ancestry, #410), and teachers are offered Combine against that.

## 8. Backups for school machines

- **Automatic from commissioning, with no attention needed.** Between visits nothing else protects the
  school. The schedule is installed by commissioning, not added by hand (`docs/OPS.md` step 5 today).
- **Destinations:**
  - **USB drive** when the school has one: best, and taken away from the server after each run.
  - **This server's own disk** when there is no USB drive. Today `backup-db.sh` refuses a destination on
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
  2. **Program first,** if newer, because new lessons may need it. Strict verification; the existing
     `update.sh` takes its pre-update snapshot and handles the rollback.
  3. **Lesson compatibility:** the set's `schemaVersion` and minimum program version against this
     program. Too old: *"This lesson set needs program 1.12 or later; you have 1.07"*, and nothing is
     imported. Unknown content kinds: import what is understood, list what is waiting.
  4. **Backup** (a pre-update snapshot), then **import** the lessons (§10b).
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
  release Nov 2026"* — on the lesson page and in the version details, from the manifest's release date.
  A version imported without a manifest (a plain zip through Manage → upload) shows *"ARES release: not
  stated"*. Stored as system-only fields on the version.
- **Official moves automatically, except where the school chose otherwise.** If the plan's current
  Official is an ARES release, the new release becomes Official. If the school's administrator made a
  **teacher's** version Official, Official stays put, and the new release waits for the administrator.
- **Made very clear at the time** (operator requirement):
  - **before applying,** the tool lists every lesson whose Official will move, and every lesson where it
    will not and why, and asks the technician to confirm;
  - **on the lesson page,** *"Official updated to the ARES Nov 2026 release on 3 Dec. Previous Official:
    1.0.0 (still in the version history)."*;
  - **to each subject-grade administrator,** an internal message listing what changed in their
    subject-grade and what is waiting for them.
- **Teachers who edited the older release** see, when they open the lesson: *"ARES has published a newer
  version of this lesson. Your version 1.0.2 is based on the older one. Combine them?"* It opens the
  existing Combine screen with the right ancestor. Nothing changes without the teacher; the result is a
  new Not Official version. "Not now" hides it for the session only — no new stored state.
- **Unsaved drafts** get the notice that already shipped (save the draft as a version, then Combine).
  Phase 4 is dropped (DECISIONS 2026-10-25).
- ⚑ **Open: should Manage → upload apply the same automatic-Official rule?** A technician may upload a
  newer zip from a laptop rather than use the server tool. Recommendation: yes, with the same
  confirmation list, so the two routes behave the same (§13).

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
  release label.
- **§6 Versioning:** ARES release id and date as system-only version fields; the automatic Official
  move and its exception.
- **§11 Operations:** seal, commission (new/returning), prepare-reinstall, the update tool; the
  this-disk destination; backup password and locked key; installation marker on destinations; the
  standing rule that migrations are never deleted or squashed; the two verification levels.
- **§8:** none expected (no new authority; the update tool is server-side, the web upload stays Site
  Administrator only).

## 13. Open questions

1. **Other ARES programs' teacher uploads (for Mark).** Where do they live, do technicians save them
   before wiping today, and should one "save everything before wiping" step cover them and Lesson3 on
   the same stick? Lesson3's `prepare-reinstall` is designed to sit inside a wider checklist, but nothing
   is planned for the other programs' data until Mark says how it is handled.
2. **Who holds the ARES signing keys** (current and spare), and where.
3. **Manage → upload and the automatic-Official rule** (§10b). Recommended: same rule both routes.
4. **School code format** for the hostname (e.g. the ministry's school code, if one exists).

## 14. Build order (each its own PR, with its tests and docs)

1. **Lesson-set manifest + production import command + ARES release fields + automatic Official** —
   the core that every route uses. Testable now in the isolated stack.
2. **School name** (field, switchboard, the six places).
3. **Backups for schools:** this-disk destination, backup password with locked key, installation
   marker, automatic schedule.
4. **The ARES stick builder + signing + verification** (shared with Phase B's B1).
5. **`install.sh` offline mode, seal, commission (new school).**
6. **prepare-reinstall + commission (returning school)** (shared with Phase B's B3).
7. **The update tool** and the read-only Manage → System report.
8. **Fonts from USB** (after the mount spike).

Parts 1–3 can be built and tested in containers now. Parts 4–7 need **one amd64 test machine** to run the
full seal → Clonezilla → commission → prepare-reinstall → wipe → restore cycle. That is the same machine
Phase B is waiting for; the two acceptance runs should share it.

## 15. Out of scope

- **Usage monitoring** over the schools' slow internet (Mark's main reason for adding it). It needs its
  own design and a privacy notice (the connectivity design puts consent at hub enrolment).
- Hub sync, sharing between schools, the all-schools forum.
- ARM school images; school logos; phase 4 (dropped).
