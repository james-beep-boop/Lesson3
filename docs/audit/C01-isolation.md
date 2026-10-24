# C01 — Disposable target and reset proof

## Chunk contract

- **Owner:** coordinator (Codex), setup only; source baseline is the current cycle's pinned SHA.
- **Mandatory checks:** resolved service/volume/network/bind/image identity; finite resources;
  synthetic secrets/accounts and two subject-grade scopes; internal mail capture; exclusive lock;
  measured reset/reseed, restore and role-login proof; account and fixture version record.
- **Artifacts:** this report; portable reset/lock and fixture helpers under the permitted audit paths;
  sanitized results in `scans/`; exact target/configuration, secrets and raw logs kept privately.
- **Exclusions:** no existing development/probe stack is reused; no live installation, real mailbox,
  real backup or production user is a test fixture. D01–D03 require their own later acceptance.
- **Exit:** all isolation/reset/mail/login checks are evidenced before any runtime attack begins.

## Progress — 2026-10-24

Target preparation started on the heavy-worker. Resolved Compose configuration has been checked:

- Every named volume and built image has an audit-specific namespace.
- No service publishes a host port; the test network is internal.
- Bind sources exist and belong to this run's private configuration or isolated source checkout.
- Services have explicit CPU and memory limits; the dedicated build worker is also capped.
- Mail is directed only to an internal capture service; synthetic credentials were generated privately.

## Results

**C01 target proof passed.** Production/migration/PDF and browser-runner images built from the pinned
source. Migrations succeeded and the new database served the real first-administrator page.

- The live target lock refused a competing command with exit 73. Harness checks also proved success
  releases ownership, a failed command retains it, and reconciled ownership can be acquired again.
- Nine synthetic accounts span two subject-grade scopes, peer teachers/editors, two subject
  administrators, mixed assignments and one unverified account. Both scopes have an Official plan.
- API sign-in passed for all eight verified accounts, with expected roles/assignments; the unverified
  account was refused. Chromium drove the same nine real sign-in forms with matching outcomes.
- A queued password-reset message arrived at the internal catcher with the intended internal link
  origin and a nonempty token. The link remains private; no external recipient or relay was used.
- The reset/reseed drill returned to an empty users collection, then recreated the fixture and
  repeated its login/role checks. Measured database reset plus migration/health time: **10.99 s**.
- A synthetic custom-format database dump was restored into this target. Measured restore plus
  migration/health time: **10.56 s**. Complete nested Payload snapshots and Official plan pointers had
  identical before/after fingerprints (nine users, two plans, two versions), and restored credentials
  and role assignments passed the wire checks again.

The first final fingerprint comparison failed because root-running containers created mode-600 output
files the host could not read. The lock stayed held. The owner process and command containers were
confirmed stopped before reconciliation; ownership was corrected and comparison/restored-role checks
passed under a new lock. Future setup precreates host-owned output files. This was a harness issue;
the original failure and reconciliation evidence are preserved privately.

The target remains seeded and running within its caps; the idle dedicated builder was stopped. No
fixture operations were performed on the shared deployment host or existing probe stacks. This proves
synthetic target readiness, not the product's staged operational restore script, a fresh-school install,
whole-machine recovery, full RBAC coverage or cross-family acceptance of a defect claim.
