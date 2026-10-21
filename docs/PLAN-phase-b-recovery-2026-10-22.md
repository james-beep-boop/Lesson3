# Phase B — recoverability: implementation plan (proposal)

**Status: PAUSED, 2026-10-22 (revised the same day).** It implements the Phase B section of
`docs/DESIGN-backup-recovery-2026-10-21.md` and is owned by the operator (James). Phase A is complete:
A1 in v1.01 (#426), A2–A6 in v1.02 (#430).

## ⚑ Revision: paused until there are machines to test on

The operator reports that **no machines meeting the minimum will be available for weeks**. The
2026-11-30 target therefore cannot be met; a new one is set when two test machines are in hand.

**Nothing in B1–B5 is built in the meantime, deliberately.** A kit builder and `recover.sh` written now
would be shaped by guesses: which Docker packages, how big the images are, how a technician reads the
sheet. They would carry the pins of whichever release was current when written, and they could not be
run end to end. Code that exists but has never run is the "untested backup" this design was written to
refuse, and it would invite exactly the claim Phase B exists to earn. The work below is sized and
ordered, so starting it later costs little.

**What is worth doing now needs no code:**

1. **When the Rock is back: deploy v1.02**, and set `BACKUP_RECOVERY_CONTACT` and `BACKUP_KEY_HELD_BY`
   in its `.env`.
2. **Then run a restore drill on a workstation**, as `docs/OPS.md` describes. Bring the newest Drive
   backup to the machine with the key and restore it into a throwaway database. This shows the key in
   the password manager still opens current backups (check `age-keygen -y` against the Rock's
   `BACKUP_AGE_RECIPIENT`) and the backups are good. It is the cheapest real evidence available until
   Phase B, and it last ran on 2026-08-22.
3. **Answer the decisions below as they come up**, so the plan is ready when the machines arrive.

**Not started, and not needed now:** the fresh-`PAYLOAD_SECRET` test (B2's) is cheap but changes
nothing until `recover.sh` exists, so it stays with B2. Printing the release's ⚑ operator notes in
`update.sh` (B5) only matters for bundle installs, and none exists yet.

**When machines arrive:** confirm the decisions, set a new target, and start at B1. The schedule below is
relative: about four weeks of work, then the runs.

## The goal, unchanged

**Acceptance test.** With the original server unavailable, a technician (not a developer) recovers using
only the retained materials, signs in, opens a known lesson, and exports DOCX and PDF. It must pass:

- once for an online install, and once offline with no internet and no ARES help;
- on **amd64 and arm64**, each with its own kit.

The minimum machine is 8 GB RAM, a 512 GB drive and Ubuntu 24.04 LTS. Each run records the work lost and
the time taken. Until a run passes, the page keeps saying "Full recovery: Not yet tested", and nothing
says protected or recoverable.

## What Phase A already gives Phase B

- **A staged, journaled, reversible restore** (`restore-db.sh --force-prod`). `recover.sh` ends by
  calling it, rather than writing a second restore path.
- **Per-stream backup records and a "Full recovery" line** on Manage → System → Backups, which Phase B
  changes only from a real receipt.
- **Release bundles with image digest pins.** They are multi-arch, published for amd64 and arm64.

## Facts checked for this plan (2026-10-22)

- **A fresh `PAYLOAD_SECRET` only signs everyone out.** Lesson3's code never reads the secret. In the
  installed Payload 3.91 it is used for:
  - signing sign-in tokens (JWT);
  - API keys, which Lesson3 does not enable;
  - upload receipts, which it does not use;
  - a telemetry hash.

  Password hashes are salted PBKDF2, and reset and verification tokens are random values stored in the
  database. So `recover.sh` can generate a fresh secret and never keep a copy of the live one. B2
  confirms this with a test rather than relying on this reading.
- **A kit cannot be a GitHub release asset.** Four images for one architecture are several GB, and
  release assets are capped at 2 GB per file. The kit is built from a release by a script, onto a
  stick, on any machine with internet.
- **There are no spare test machines.** `COMPUTING-ENVIRONMENT.md` lists the Rock (the demo server), the
  Spark and two Macs. None can be wiped for an acceptance run. Two machines are needed (decision 1).
- **The USB installer plan is the same artifact** (memory note, 2026-10-12). The recovery kit and the
  update stick should be built by one script, not two.

## The work, as five PRs and the test runs

Each PR ships with its tests and its docs, as in Phase A.

### B1. The kit builder

`scripts/make-recovery-kit.sh <release-tag> <amd64|arm64> <output-dir>` writes everything a recovery
needs for one release and one architecture:

| Kit content | Source | Check |
|---|---|---|
| Release bundle (`compose.yaml`, scripts, docs) | the GitHub release | the published `.sha256` |
| `docker save` of app, migrate, Gotenberg, Postgres for the architecture | `ghcr.io` / Docker Hub, pulled by the bundle's digest pins | RepoDigests must equal the pins |
| Docker Engine packages for Ubuntu 24.04 (`containerd.io`, `docker-ce`, `docker-ce-cli`, `docker-compose-plugin`) | download.docker.com, pinned versions | sha256 recorded in the kit |
| Static `age` and `rclone` for the architecture | their GitHub releases, pinned versions | published checksums |
| `recover.sh`, the printed sheet | this repository | — |
| `MANIFEST` (versions, architecture, Ubuntu version, every file's sha256) | written last | `verify-kit.sh` re-reads it |

- **`verify-kit.sh`** checks a stick on any machine before it is stored, and again before it is used.
- **Tests:** a structure test in CI (stubbed downloads; manifest complete; checksums enforced; wrong
  architecture refused). Plus one real build per architecture, recorded in DECISIONS.

### B2. The school's settings manifest, and fresh secrets

- `backup-db.sh` also writes `recovery-manifest.age` to the backup destination with each run. It holds
  only the school-specific values, encrypted to the same recipients:
  - server address and hostname;
  - SMTP settings;
  - backup destination;
  - recipients;
  - the agreement and contact settings.

  It never includes `PAYLOAD_SECRET` or `POSTGRES_PASSWORD`; those are generated fresh. Whoever can open
  the backups can rebuild the configuration, with no live secrets kept anywhere.
- **Test:** restore a backup into a stack with a NEW `PAYLOAD_SECRET`. Sign-in works with the old
  passwords, old sessions are rejected, and a password reset still works. This turns the finding above
  into evidence.

### B3. `recover.sh`

One command on a freshly installed Ubuntu 24.04 machine:
`sudo ./recover.sh --key <identity> (--drive <path> | --rclone-config <file>)`.

1. **Preflight.** It checks:
   - the kit verifies, and its architecture and Ubuntu version match the machine;
   - RAM, disk space, and that the key opens the manifest.

   It shows the newest backups and asks which to use.
2. **Install offline.** Install the Docker packages from the kit, `docker load` the images, and check the
   digests against the pins. Install the bundle at `/srv/lesson3`.
3. **Configure.** Decrypt the manifest, generate fresh secrets, write `.env` and set the hostname.
4. **Restore.** Run the A1 staged flow with the chosen backup. On a brand-new machine, "live" is an empty
   database, so the swap replaces nothing.
5. **Confirm.** Run the in-server check. Print the sign-in steps and the router note: the replacement
   must take over the old server's address or name, or bookmarks break.
6. **Receipt.** Ask the technician to confirm each acceptance step (signed in, opened a lesson,
   exported DOCX and PDF). Then write the receipt (B4).

Plain progress messages throughout. A journal, like A1's, lets an interrupted run continue rather than
start over. **Tests:** stubbed branch cover in CI, and the real run is B6.

### B4. The recovery receipt, and the "Full recovery" line

- `recover.sh` writes `recovery-receipt-<UTC>.json` to the backup destination. It records:
  - date, who, kit and release versions, architecture;
  - which backup was used and its `coversUntil`;
  - **work lost**: the failure time the technician enters, minus `coversUntil`;
  - **time taken**: from start to the last confirmed step;
  - pass or fail for each acceptance step.
- `backup-db.sh` copies the newest receipt into `out/ops/backup/recovery.json`. The page's "Full recovery"
  line then reads, for example: "Tested 2026-11-20 on a replacement machine: work lost 14 hours; back in
  3 hours (agreed: 2 days)". A failed or stale test says so. It still never says protected.
- The school agreement sets how often the test repeats, for example once a term. An overdue repeat is
  reported as "attention".

### B5. The printed sheet, key custody, and the docs

- **A one-page recovery sheet** for a technician, and a key-custody sheet: the private key printed, and
  where it is kept. They are generated with each kit.
- OPS, the Guide, `USER_GUIDE.md` and SPEC §11 change in the same PRs as the behaviour they describe.
- **Small, from the v1.01 notes:** `update.sh` prints the release's ⚑ operator notes.

### B6. The acceptance runs

- **The runs:** offline on amd64, offline on arm64, and once online (either architecture). Each is run by a
  technician working from the sheet alone, with the original server switched off.
- **Each run records:** a receipt, the work lost and the time taken, and anything the technician got
  stuck on. Every snag is fixed and the run repeated.
- **Done means** all three receipts pass. Then the page may say what the receipts say, and DECISIONS
  records the evidence.

## Schedule, counted from when the machines arrive

| Week | Work |
|---|---|
| 1 | B1 kit builder and B2 manifest + fresh-secret test |
| 2 | B3 `recover.sh` |
| 3 | B4 receipt and page line; B5 sheets and docs |
| 4 | B6 first runs (offline amd64, offline arm64); fix what they find |
| 5 | B6 online run and repeats; record the evidence |

## Decisions needed before B1 starts

1. **Test machines:** one amd64 and one arm64 machine, each at least 8 GB RAM and a 512 GB drive, that may
   be wiped. Who provides them, and where are they?
2. **The technician:** who runs the acceptance tests? It must be someone who did not build the kit.
3. **Ubuntu install media:** in the kit (about 3 GB per architecture), or kept as a separate stick?
4. **How school devices find the server today:** by LAN IP or by name? This decides whether
   `recover.sh` sets a hostname or the sheet covers a router reservation.
5. **The read-only Drive credential** for online installs is held by the Site Administrator (decided
   2026-10-21). Should B5 include a step-by-step for creating it?
6. **Still open from the design:** the interim stopgap (proposed: none now; do it per school at install)
   and teacher laptops as stopgap hosts (proposed: not for now).
7. **Mark's install script:** the USB installer was waiting on it. Should B1 proceed without it and
   reconcile later?
