# Current server-time and worldwide-ID wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `serverTime.http.spec.ts` suite passed **5 tests** in 2.95 seconds (exit 0). It
refused unauthenticated access and returned the Site Administrator's uncached server clock with the
expected response shape and freshness headers.

The current `worldwideIds.http.spec.ts` suite passed **5 tests** in 3.03 seconds (exit 0). It
rejected missing and duplicate UIDs, enforced the person/Site Administrator visibility matrix,
allowed a version UID to be read by users who can read that version, refused a Site Administrator
attempt to rewrite a person's UID, and generated a fresh UID without inheriting the release
fingerprint.

Both fixture teardowns completed and the target lock was clear. Raw output is private at
`logs/c5-server-time-http.log` and `logs/c5-worldwide-ids-http.log`.

The current `app/tests/int/worldwideIds.int.spec.ts` suite passed **6/6** tests in the marked target,
covering trusted and ordinary creates, fresh UIDs, fingerprint non-inheritance, immutable person
identifiers, stable/reset installation identity and idempotent migration backfill. Raw output is in
the private combined log `logs/c5-data-auth-jobs-integrations.log`; this complements the five wire
cases above but does not close migration-upgrade or deployment-parity coverage.

This is focused server-time and identifier endpoint evidence. It does not close the wider export,
data, source-review or deployment-parity catalog.
