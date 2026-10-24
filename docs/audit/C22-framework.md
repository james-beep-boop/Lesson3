# C22 — Framework state and ownership probes

## Chunk contract

- **Owner:** coordinator (Codex); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
- **Required checks for this part:** all ten actor scenarios on native job/KV/migration operations;
  all eight verified users on preference ownership and positive controls; native lock ownership and
  practical browser effect; Teacher mutation of job statistics and explicit cleanup.
- **Artifacts:** framework/lock UI audit specs and configurations; private ledger, states, traces,
  screenshots and installed-source scheduling proofs; `findings/C22-rbac.md` candidates.
- **Exclusions:** existing foreign job-row writes, all lockable targets, non-Chromium lock UI,
  deployed proxy/CSRF postures and full live scheduler-disruption consequences remain separate checks.
- **Exit:** preserve actual outcomes, candidate/accepted distinction, known temporary-resource cleanup
  and native content/pointer/settings integrity; route remaining cases explicitly.

## Outcomes — 2026-10-24

The framework batch executed **20 cases: 19 passed / one failed**, exit 1, one worker and no retries.
Its private ledger contains **266 recorded API calls**, including identity checks, fixtures/cleanup
and fingerprints. These are not 266 distinct authorization assertions. The failure is the reproduced
Teacher write to system statistics, F-C22-001; its expected-denial assertion stays red.

| Scope | Result |
|---|---|
| Native job read/run gates | All ten actors checked; only Site Admin lists job rows and invokes run. Run uses an empty audit queue, scheduling disabled, limit one; the Site-Admin control returns no jobs remaining |
| Native job collection POST / bulk PATCH / bulk DELETE | All ten actors refused with 403, including Site Admin. Write probes use a nonexistent row ID; existing-row behavior/side effects remain an explicit gap |
| KV GET / POST / bulk PATCH / bulk DELETE | All ten actors refused with 403 |
| Migrations GET / POST / PATCH / DELETE | All ten actors return disabled-surface 501, not an inferred grant from a default access-function name |
| Preferences | Eight verified owners passed custom-key and native-create/update controls, caller-owner stamping, foreign read/update/bulk-delete protection, same-key separation and no Site-Admin read exception. All 24 temporary preference rows cleaned up |
| Lock records | Observational case records forged holder and unrelated-Teacher update/delete; it is not a passing policy verdict. Synthetic global lock removed |
| System statistics | Teacher POST 200, marker persisted on independent readback; original values restored. This negative conformance assertion fails as intended against the unfixed baseline |

The separate **Chromium lock follow-up** has a legitimate peer-owner positive control and a forged
holder negative case on a real fixture version. Both show the native lock dialog, so the final
negative assertion fails, exit 1 (F-C22-002). Both created lock rows were removed. No holder email
appeared in the modal, and no native lesson/plan content or Official pointer changed.

All runtime work used C01's production-mode disposable ARM64 stack, Node 24.22.1, Payload 3.91.0,
Playwright 1.64.1, four CPUs / 8 GiB and internal SMTP. The framework preflight verified all cached
identities and saved private states for the browser control. No additional login was needed in this run.

## Source consequence and cleanup evidence

The installed scheduling function consumes `stats.scheduledRuns.queues.default.tasks.
expireEditRecovery.lastScheduledRun`. A network-disabled/no-database probe using the actual daily
03:15 task configuration changed its calculated next run from 2026 to 2099 when supplied a forged
future value. Another offline invalid-date input threw an ISO8601 parsing error. These are actual
installed-function outcomes; no future/invalid schedule was injected into the live target, and no
live queue/expiry outage is claimed. F-C22-001 records the pending full scheduling consequence.

Each failed live run retained its target lock. Before release, reconciliation verified dead owner
process and absent runner, matching content fingerprints, all eight preference cleanup flags and
stats restoration. Independent reads of the marked audit database found zero temporary preference
rows, zero synthetic-global lock rows and no statistics marker; the two real-document lock IDs were
also independently absent. Statistics update timestamps legitimately advanced during write/restore.
All logs, failed assertions, ledgers, source helpers, screenshots and traces remain private and intact.

## Remaining work and review

Two authorization candidates require Claude critique and Codex author response before acceptance;
accepted totals remain zero. Preserve fresh-session C82 independence before finding validation in
its scope. The full C22 endpoint/operation registry, mass assignment, authority changes and ownership
matrix remain in progress; C23/C24/C30/C31 still own their deeper flow and race checks. C84's opening
proposals are separate, unreviewed architecture work, not a completed whole-system assessment.


Executed helper SHA-256 values (formatted source retained privately and synced to this checkout):

- Framework spec: `79e2ab3e923d7cc4b3adaf8ddf0669a937c825ceebbe848272a9233a86019c97`.
- Lock UI spec: `fba071e8fea8c5cb69386135fa3f1ca16b78ed090e24b993c32a530d30edc122`.

TypeScript, ESLint and helper formatting checks passed before the runtime runs. Red runtime results
above are preserved candidate evidence, not failed static checks or a successful whole-audit verdict.
