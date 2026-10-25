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

Installed Payload 3.92.0 login/hash implementations were independently opened from the pinned deps
image, and sanitized resolved user auth defaults were checked. A first config-inspection attempt
using tsx's CJS eval failed on the config's top-level await; the explicit ESM loader command succeeded.
That setup error is not an application defect.

Remaining: comprehensive signup/first-user races and mass assignment, token verification/reset
expiry/reuse, no-SMTP recovery, revoked/disabled sessions, cookie/proxy/CSRF deployment parity and
the remaining catalog cases. Existing baseline suites provide complementary coverage but are not
declared substitutes for the full attack matrix.
