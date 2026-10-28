# Go-live rehearsal — an offline school server, end to end

**Purpose.** Before the first offline schools go live, run the whole life of a school server once, on
real hardware, the way a technician will do it in the field — and find anything we cannot fix
remotely once machines are out. Written 2026-10-19; run it on the release you intend to ship.

**Who.** One person at the server (a technician, or you), one teacher device and one administrator
device (phones or laptops) on the same Wi-Fi. Allow half a day.

**Record as you go.** For every step: pass / fail, what you saw, and how long it took. Note anything
confusing even if it worked — the field technician will not have you to ask. Screenshots help.

**Setting it up like a school.** A machine of the kind schools will get (ideally an ARES machine),
on its own Wi-Fi network with **no internet**, except where a step says to tether a phone.

---

## 1. Install (phone tethered — the only internet this machine gets)

Follow `README.md` → "Install on a local server" and `docs/LOCAL-SERVER-DEPLOYMENT.md` exactly as
written. Do not improvise; if the instructions are wrong or unclear, that is a finding.

- [ ] Requirements met: 64-bit Linux, Docker with `docker compose` v2, 4 GB RAM (8 GB preferred), `curl`
      `openssl` `tar` `sha256sum`. Note the free disk space (`df -h`).
- [ ] Tether a phone. **Note the phone's mobile-data counter before and after** — the download size
      over a phone connection is a real cost for schools.
- [ ] Download the release bundle, check its checksum, run `install.sh` with the server's LAN address.
- [ ] Record: total data used, time taken, any error and how it was resolved.
- [ ] **Untether.** From now on the machine has no internet.

## 2. First administrator and system check

- [ ] Open the `/login` address the installer printed, **from another device on the Wi-Fi**.
- [ ] It shows **Create the first Site administrator**. Create it; sign in works.
- [ ] Create a **second** Site Administrator and sign in as them in a private window (recovery cover).
- [ ] **Manage → System**: the PDF converter is working; email shows **Not set up** (expected offline);
      an **Installation ID** line appears under the status list.
- [ ] No warning that "the server and this device show different times". If it appears, the
      server's clock is wrong — fix it now and note how (this is exactly the field problem it detects).

## 3. Lesson plans

- [ ] **Manage → Subjects and grades**: create the subjects and grades the ARES export needs.
- [ ] **Manage → Lesson plans → Upload lesson plans**: upload the full ARES ZIP (the ~95-plan export). Record the time
      and the result summary: imported, rejected (with reasons), skipped.
- [ ] Open three plans of different subjects. Each opens at version 1.0.0, Official.
- [ ] Download a lesson's **Word** document. It opens correctly in Word or LibreOffice.
- [ ] Download its **PDF**. ⚑ The offline server uses a free lookalike for Arial (the Microsoft fonts
      are not shipped, for licence reasons), so some table rows may be slightly taller than on the
      online site. **Judge whether the PDFs are acceptable for teachers** and keep one sample.
- [ ] Click one ARES resource link in a document **while on the school Wi-Fi**: does `ares.local`
      open the ARES content? (Only meaningful if an ARES content server is on the same network.)

## 4. A teacher joins (no email)

- [ ] On the teacher's device: **Sign up**. Before submitting, the form says the site does not send
      email and that the Site Administrator approves accounts.
- [ ] After submitting, it says the account must be approved before signing in.
- [ ] Signing in now says the account is **waiting for approval** (not "check your email").
- [ ] As the administrator: **Manage** shows "1 new account is waiting for your approval".
      **Review them in Accounts** → the account is listed → **Approve**.
- [ ] The teacher can now sign in.
- [ ] Give the teacher editing access for one subject-grade (**Manage → Users → Roles & Access**).
- [ ] **Forgot password?** as the teacher says to contact the Site Administrator; as the administrator,
      create a reset link for the teacher (**Accounts → Reveal reset link**) and use it on the teacher's
      device.

## 5. Teaching work

- [ ] As the teacher: open a plan, **Edit**, change a Learner experience paragraph, **Save as new
      version**. The new version is Not Official; the Official version is unchanged.
- [ ] Edit again, close the browser tab without saving, reopen: the draft is offered back.
- [ ] **Insert link** in a framework column: paste an ARES address (`http://ares.local/...`), with a
      label. Export the document: the link is clickable.
- [ ] As the administrator: make the teacher's version **Official**.
- [ ] As the Site administrator: open **Manage → System → Features**, switch on **Advanced tools**,
      choose **Save**, and confirm with your password.
- [ ] Two versions from the same starting version (two saves), then **More → Combine versions**:
      review the choices and save.

## 6. Backups — before anyone relies on the machine

Follow `docs/OPS.md` → "Backups" for a **rotated USB drive**. ⚑ The private decryption key must never
be stored on the server.

- [ ] Set up the USB destination and the school recovery key as described.
- [ ] Run `scripts/backup-db.sh`. **Manage → System** shows the backup destination and a recent backup.
- [ ] Take the drive to the machine holding the private key and run the **restore drill**. It must
      print `RESTORE DRILL PASSED`. A backup is not recoverable until this passes.

## 7. A power cut

- [ ] Before the test: Docker must start at boot (`systemctl is-enabled docker` says `enabled`; if not,
      `sudo systemctl enable docker`). The Lesson3 containers restart with Docker, not on their own.
- [ ] Switch the server off at the wall mid-day, wait a minute, switch it on.
- [ ] Lesson3 comes back by itself (no commands needed). Note how long until `/login` responds.
- [ ] Check **Manage** for the clock warning. If the clock reset, note what it reset to and how it was
      fixed — the field instructions need this.
- [ ] The teacher's work from step 5 is all still there.

## 8. An update (phone tethered again)

Follow `docs/LOCAL-SERVER-DEPLOYMENT.md` → "Update to a later release". Use the next release, or
re-run with a newer build if one is available.

- [ ] Tether, download and checksum the new bundle, run `update.sh` against the installation. Note the
      data used.
- [ ] It takes an encrypted backup first and refuses to proceed without working backups.
- [ ] After it finishes: sign in, open a lesson, export Word and PDF, and check the teacher's versions
      are intact. **Untether.**

## 9. If this machine's database will be copied to other schools

Only if schools will be set up from a prepared copy rather than each installed fresh:

- [ ] On the copy, run `scripts/reset-installation-id.ts` (dry run, then `APPLY=1`) as `docs/OPS.md`
      describes. **Manage → System** shows a different Installation ID from the original.

---

## After the rehearsal

Send the record back. For each failure or confusion: what happened, and whether a field technician
could have recovered without help. Everything found here is cheaper to fix now than at a school.
