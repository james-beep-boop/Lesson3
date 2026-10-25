# Current user-admin-actions wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/userAdminActions.http.spec.ts` suite passed **36 tests** in 19.04
seconds (exit 0) against the marked target. It covered authentication, unknown-user, freshness and
stale-token boundaries; reset-link issuance with `no-store` and a refreshed user timestamp; disabled
account refusal; sign-in disable/re-enable behavior; Site Administrator grant/revoke; and the
dedicated administrator reset-link budget, including `429` and `Retry-After` behavior.

Nine advisory-lock cases changed the caller while each action waited. `reveal-reset-link`,
`set-site-admin`, and `set-sign-in-disabled` refused demoted, disabled or unverified administrators
and left the target unchanged. Fixture teardown completed and the target lock was clear; raw output
is private at `logs/c5-user-admin-actions-http.log`.

This is current wire evidence for the user-admin-actions slice. It does not close the wider C5.3
account/recovery source review, deployment-parity or no-SMTP catalog.
