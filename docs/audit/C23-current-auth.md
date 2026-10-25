# C23 Current authentication attack results

## Chunk contract

- Owner: sole auditor (Codex); baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Mandatory: registration/bootstrap, verification, login, rate limits, lockout/enumeration,
  reset/recovery, sessions/logout/expiry and concurrent authority changes; account/mutation controls.
- Artifacts: c23-auth-budgets.ts, c23-enumeration.ts, findings/C23-auth-current.md, private measurements
  and logs. No product fixes. Exclusions: none.
- Exit: every catalog auth journey and abuse boundary has current evidence and reviewed interpretation.
  The revalidated subset here does not close all of C23.

The current target used unmodified default limits and production app images. The complete runs
held the target lock and restored its marked synthetic dump between targeted/global/enum cases,
then restored it again and proved all eight verified roles could sign in and the unverified user
was refused. Requests were bounded by count, concurrency, timeout and health checks. Mail stayed
in the capture service.

Revalidated known/deferred findings:

- F-C23-001: 1,005 distinct-address attempts at concurrency four took 2.172 seconds; teacher and
  Site-Admin correct-password logins were both refused by the global hour budget afterwards.
- F-C23-002: twenty targeted attempts exhausted the named account's available budget; an unrelated
  administrator could still sign in. Existing session access continued in both cases.
- F-C23-003: nine paired timing observations and the sixth-attempt locked-account message reproduced
  account enumeration. Generic wrong-password statuses/messages alone matched; an unverified-address
  message leak was not demonstrated.

Both proof/recovery wrappers exited 0, indicating successful defect reproduction and restored
fixture readiness. Accepted impact is Medium/Low/Low respectively, with sole-auditor source/control
rechecks and no independent model review. Details, limits and remediation are in the findings file.

The current `app/tests/http/authFavorites.http.spec.ts` wire suite passed **23 tests** in 3.05
seconds (exit 0). It covered role-gated account unlock and unknown-email behavior, anonymous and
cross-user message read/creation boundaries, and favorite creation, malformed IDs, duplicate
rejection and role refusal. Its random fixture users and lock state were torn down cleanly; raw
output is private at `logs/c23-auth-favorites-http.log`.

The current `app/tests/http/userSearch.http.spec.ts` suite passed **10 tests** in 3.08 seconds
(exit 0). It verified unauthenticated and non-admin refusal, display-name/email search,
server-side pagination and type/status filters, unknown-filter refusal, grant-label disclosure,
and absence of authentication secrets in returned rows. Fixture teardown completed; raw output is
private at `logs/c23-user-search-http.log`.

The current `app/tests/int/rateLimit.int.spec.ts` suite passed **5/5** tests in the same marked
target. It exercised the shared PostgreSQL rate-limit store for per-user and non-user keys, exact
bucket exhaustion, `429` and `Retry-After` responses, unauthenticated refusal and independent-key
isolation. Raw output is private at
`logs/c5-ingest-public-ratelimit-integrations.log` (the combined bounded integration command); the
fixture teardown and target lock completed normally. This is direct store/helper evidence, not a
complete signup, session, edge-proxy or no-SMTP authentication attack run.

The current `app/tests/int/authRateLimit.int.spec.ts` suite passed **4/4** tests in the same target,
covering per-identifier login and forgot-password exhaustion, correct-credential `429` behavior,
independent identifiers and equal treatment of unknown addresses. Raw output is private at
`logs/c5-data-auth-jobs-integrations.log`; this does not close the broader session, cookie, edge or
no-SMTP attack matrix.

The two named no-SMTP endpoint complements also passed under a replacement production app with
`SMTP_HOST` empty: the valid email-a-doc request returned `503`, and an existing administrator-issued
reset token survived public forgot-password. The exact orchestration hash and raw log are recorded
in `C5-endpoints-full-current.md`; this closes those two complements only, not the remaining
no-SMTP recovery/session and deployment-parity catalog.

Installed Payload 3.92.0 login/hash implementations were independently opened from the pinned deps
image, and sanitized resolved user auth defaults were checked. A first config-inspection attempt
using tsx's CJS eval failed on the config's top-level await; the explicit ESM loader command succeeded.
That setup error is not an application defect.

Remaining: comprehensive signup/first-user races and mass assignment, token verification/reset
expiry/reuse, no-SMTP recovery, revoked/disabled sessions, cookie/proxy/CSRF deployment parity and
the remaining catalog cases. Existing baseline suites provide complementary coverage but are not
declared substitutes for the full attack matrix.
