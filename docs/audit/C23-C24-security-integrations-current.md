# Current security, lock-helper and null-resource integration evidence

The marked isolated target ran these current-source integration suites under the target lock with
the pinned Node 24 dependency wrapper:

| Suite | Result | Scope |
|---|---:|---|
| `app/tests/int/userSecurity.int.spec.ts` | **15/15** | disabled/verified sessions, reset-token gates, uniform forgot-password behavior, last-admin and self-action invariants, advisory-lock contention |
| `app/tests/int/authFavorites.int.spec.ts` | **11/11** | native unlock authorization, read receipts and favorite ownership/shape boundaries |
| `app/tests/int/lockRows.int.spec.ts` | **3/3** | real transaction row-lock blocking, outside-transaction refusal and empty-list no-op |
| `app/tests/int/nullResources.int.spec.ts` | **3/3** | null resource-slot ingest/storage, save gate and re-ingest preservation |

The combined run passed **32/32** tests in **12.42 seconds** (exit 0). Raw output is retained
privately at `logs/c23-c24-lock-security-integrations.log`.

The security suite confirmed that disabling or clearing sessions takes effect immediately, disabled
accounts cannot consume valid reset tokens, forgot-password remains uniform, the last usable Site
Administrator cannot be removed or demoted, and demotion waits on the shared admin-count advisory
lock. The auth/favorites suite exercised native unlock/read-receipt permissions and ownership
boundaries. The lock-helper suite proved the shared transaction lock mechanism itself, and the
null-resource suite preserved intentionally empty resource slots through ingest and re-ingest.

Fixture teardown completed, the target lock released and the application remained healthy. These
are bounded integration checks; they do not close full cookie/CSRF deployment parity, all session
expiry journeys, browser behavior, or the wider C23/C24/C40 catalog. No product behavior changed.
