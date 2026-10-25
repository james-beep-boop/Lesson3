# Current data, authentication, scheduling and enqueue integration evidence

The marked isolated target ran these current-source integration suites under the target lock with
the pinned Node 24 dependency wrapper:

| Suite | Result | Scope |
|---|---:|---|
| `app/tests/int/worldwideIds.int.spec.ts` | **6/6** | plan/version/person UID and fingerprint creation, installation identity and migration idempotence |
| `app/tests/int/adminResetLinkCarveOut.int.spec.ts` | **3/3** | administrator recovery budget separation and public forgot-password throttling |
| `app/tests/int/authRateLimit.int.spec.ts` | **4/4** | login and forgot-password per-identifier budgets and unknown-address parity |
| `app/tests/int/jobStatsScheduling.int.spec.ts` | **1/1** | scheduled expiry recording and one-job deduplication |
| `app/tests/int/bestEffortEnqueue.int.spec.ts` | **5/5** | message/prewarm primary-write survival, detached enqueue context, orphan no-op and real generator failure |

The combined run passed **19/19** tests in **10.52 seconds** (exit 0). The simulated queue and
generator failures in the best-effort suite were expected test controls; the suite confirmed the
primary writes and error propagation rules. Raw output is retained privately at
`logs/c5-data-auth-jobs-integrations.log`.

The target lock released, fixture teardown completed and the application remained healthy. These
are focused current integration checks. They do not close the wider browser, deployment edge,
queue durability, session, migration-upgrade or full role/action catalogs. No product files or
behavior changed.
