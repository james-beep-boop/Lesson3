# Current publication and rate-limit integration evidence

The marked isolated target ran these current-source integration suites under the target lock with
the pinned Node 24 dependency wrapper:

| Suite | Result | Scope |
|---|---:|---|
| `app/tests/int/publicPublication.int.spec.ts` | **21/21** | private/listed/unlisted publication, slug lifecycle, Official-version resolver and role gates |
| `app/tests/int/rateLimit.int.spec.ts` | **5/5** | per-user and shared Postgres buckets, 429/Retry-After behavior and key isolation |

The two suites passed **26/26** tests in the combined run; the complete four-suite command also
included the ingest suites recorded in `C40-current-ingest.md` and finished **46/46** in 8.35
seconds (exit 0). Raw output is retained privately at `logs/c5-ingest-public-ratelimit-integrations.log`.

Publication tests confirmed opt-in visibility, first-publish slug derivation and normalization,
slug immutability while published, safe changes after returning private, listed/unlisted behavior,
distinct links for same-title plans, role gates, feature-switch refusal, and resolution only to the
current Official version. Rate-limit tests confirmed user buckets, shared-key buckets, independent
keys, unauthenticated refusal, 429 responses and Retry-After values against the real Postgres store.

The fixture teardown completed, the target lock released, and the application remained healthy. The
tests are current integration evidence; they do not establish reverse-proxy limits, browser parity,
or full signup/session and publication deployment coverage. No product files or behavior changed.
