# Current first-user bootstrap wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/firstUserBootstrap.http.spec.ts` suite passed **4 tests** in 2.58
seconds (exit 0) after the target was reset to an empty database. It confirmed that the empty
installation shows the first-administrator setup form, redirects ordinary signup and the admin
create page away from the bootstrap path, and does not spend the signup budget on malformed
first-register attempts. Two concurrent first-register requests produced exactly one verified Site
Administrator (`200` and `403`), and the one-shot endpoint then refused a second registration while
the ordinary sign-in page returned.

The target was restored from its private synthetic dump after the run; reset and restore both
reported healthy application startup, fixture cleanup completed, and the target lock is clear. Raw
reset, test and restore output is private at `logs/c5-first-bootstrap-empty-reset.log`,
`logs/c5-first-bootstrap-http.log` and `logs/c5-first-bootstrap-restore.log`.

This is current empty-install bootstrap evidence. It does not close broader signup, session, source
review or deployment-parity coverage.
