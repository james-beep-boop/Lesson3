# Current system-settings wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/systemSettings.http.spec.ts` suite passed **26 tests** in 10.45 seconds
(exit 0) against the marked target. It covered the system-settings read/write role matrix,
freshness and stale-token behavior, CSRF and malformed-input boundaries, job/configuration checks,
and the real advisory-lock cases. The lock cases proved a Save waits for the settings row, refuses
a concurrent change, and writes nothing when the administrator is demoted, disabled, or deleted
while waiting. The same suite also confirmed native account lockout refuses the correct password
after repeated wrong attempts. Fixture teardown restored the target; raw output is private at
`logs/c5-system-settings-http.log`.

This is current wire evidence for the system-settings/admin-lock slice only. The broader C5.5
social, recovery, settings and deployment catalog remains open, as do no-SMTP and parity checks.
