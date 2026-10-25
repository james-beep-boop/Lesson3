# C01 Disposable target proof

## Chunk contract

- **Owner:** sole auditor (Codex); product baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- **Mandatory checks:** independently namespaced full stack and synthetic data; inspected resolved
  resources/ports/binds; atomic target lock; marked reset boundary; reseed and synthetic restore;
  required roles across two scopes; verified/unverified login behavior; captured reset email.
- **Artifacts:** this report, tools/reset-test.sh, tools/with-target-lock.sh,
  app/tests/audit/c01-seed.ts and c01-readiness.ts; private configuration, fixture credentials,
  synthetic dump, helper provenance and raw logs outside Git.
- **Exclusions:** none; application attack coverage follows this setup proof.
- **Exit:** reset, reseed, restore, role login, captured mail and serialization are demonstrated
  against the current-baseline disposable target.

## Outcome

**Setup proof passed**, exit 0. The target has dedicated database/cache volumes, network and image
names. Host binds stay under its private directory; app/mail ports bind only to loopback. Database,
SMTP and PDF services have no published ports. Resolved configuration and per-service resource caps
were inspected before launch; the test-only public/private PDF fixtures were added for suite parity.
The public-library feature remains off in this configuration; that feature's on/off matrix remains
separate audit work.

The reset helper checks a private target identity, immutable source baseline and absence of product
changes, configuration hash, namespaced network/volumes, loopback publication, private binds, database
URI, captured SMTP target, actual database container label and database comment marker before
stopping writers. Restore accepts only a synthetic dump under this target's private directory.
It stops both app instances, replaces only the marked database, runs production migrations,
invalidates this target's export caches with failure propagation, and checks app health after restart.
This audit-helper invalidation does not change the product restore helper reported in F-C70-001.

| Operation | Measured database operation | Application proof |
|---|---|---|
| Reset and initial seed | 6.46 seconds | Eight verified accounts signed in; unverified account refused; queued reset link captured internally |
| Reset and reseed | 6.49 seconds | Same verified/unverified outcomes |
| Restore original synthetic dump | 8.17 seconds | Original fixture account IDs, roles and assignments authenticated successfully |

Durations cover reset/restore through app-health readiness, not seed or mail polling time.
Fixtures include Site Administrator, ordinary teacher and peer, teachers with editing access in
each of two subject-grade scopes and a same-scope peer, subject-grade administrators in both scopes,
a mixed assignment, an unverified user, and two Official lesson plans. Passwords, reset links and
the dump remain private. Mail goes only to the internal catcher.

The lock helper uses atomic `mkdir`, an ownership token and process/start metadata. A nested contender
was refused with exit 73 while the first holder retained ownership; successful completion removed
only the holder's own lock. Failure/interruption retains the lock for process/outcome reconciliation.
No other live run used this target during reset or restore.

## Tool and evidence versions

The seed/readiness helpers were reused from historical package `3b5dc1a`, with current-target URL
configuration and reset-link origin checks adapted. Product source and existing tests were unchanged.
New TypeScript helpers passed ESLint and Prettier checks; shell helpers passed `bash -n`.

| Helper | SHA-256 |
|---|---|
| reset-test.sh | f1297c343b787ef72b0a335e275bdc2fc1cbee59e10ed668e59da7d53acf8a27 |
| with-target-lock.sh | 22006c0d7d893023533bde9fce2bc344ce9983434eb6d2e94a609664483d1241 |
| c01-seed.ts | aae8bc17b5392963b0ff77be8004dc3e3b3b75f47a91c75dffb46adc6d58ae90 |
| c01-readiness.ts | a6253be162d5a6ac083bcb2a9587815ced77fa0364cab8791cc2ca194f90b559 |

This proves audit-target reset/restore readiness, not whole-machine recovery acceptance or the full
product restore interruption matrix. That separate current-image suite passed 104 checks. First-wave C20–C24,
C30–C31 and C40–C41 checks can now use this target under its lock.
