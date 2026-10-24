# Audit target tools

These are audit harness artifacts, not product scripts. Run only against an approved disposable target
whose private configuration and ownership were established in C01. No live installation is a fixture.
The current cycle's exact paths, credentials, configuration hashes and logs stay outside Git.

## Exclusive target ownership

```sh
bash docs/audit/tools/with-target-lock.sh "$AUDIT_TARGET_DIR" COMMAND ARGUMENTS
```

The target must contain `state/identity.json`. Atomic directory creation refuses an existing lock
(exit 73), and the lock records a random ownership token, process and start time privately. A successful
synchronous command releases only its own lock. Failure/interruption retains it: reconcile processes
and outcome before manually removing that known run's lock. Do not treat age alone as stale ownership.

## Reset / synthetic restore

```sh
bash docs/audit/tools/reset-test.sh "$AUDIT_TARGET_DIR"
bash docs/audit/tools/reset-test.sh "$AUDIT_TARGET_DIR" "$AUDIT_TARGET_DIR/private/synthetic.dump"
```

`reset-test.sh` acquires the lock, or validates an inherited lock token from an enclosing audit run.
It requires the target's `state/identity.json` (audit-prefixed project, pinned `sourceSHA`, purpose
`synthetic-disposable-audit`), `private/compose.yaml`, `private/runtime.env`, and
`state/config.sha256`. It rechecks the config hash, internal network, absence of host ports,
run-owned binds/volumes, container project label, local database URI, internal mail route and an
exact PostgreSQL database comment matching the project. It refuses a generic/default project.

Only the marked `lesson3` database is recreated, after stopping this target's two app processes.
Optional `pg_restore` input must resolve inside this target's private directory. Production migrations
then run and app health must return. The tool never issues `compose down -v`, volume pruning or
operations against another project. This is a synthetic database drill, not whole-machine recovery
acceptance or proof of the product's staged operational restore script.

## Synthetic fixture helpers

`app/tests/audit/c01-seed.ts` creates nine synthetic accounts spanning two subject-grades, two Official
plans, peer users, mixed assignments and one unverified account. It requires production mode, a matching
audit database marker, an empty users collection and private output/password environment variables.
It writes credentials to the private fixture file and never prints them.

`c01-readiness.ts` checks all role logins and optionally follows a queued reset email into the internal
catcher. It retains the reset link only in that private fixture file. `c01-browser.ts` drives the real
sign-in form for every role. `c01-fingerprint.ts` hashes complete Payload version/plan documents,
including nested native content, for before/after synthetic restore comparison.
Precreate private output files with the host owner's permissions before bind-mounting them into a
root-running dependency container; otherwise a newly created mode-600 file may be unreadable to the
host. C01 retained and reconciled its lock when this harness issue occurred, then verified the outputs.

The ordinary HTTP/browser baseline expects an empty fixture database between files. Reset to empty
before repeating it; do not leave the persistent C01 accounts in place and interpret bootstrap-test
failures as a product regression. Each target has its own proof and logs even when compute is shared.

## Browser inventory and bounded authorization checks

`client.ts` refuses any origin except the explicit internal audit hostname, validates the synthetic
fixture and provides a same-origin API client with finite timeouts and no mutation retries. Role keys
are internal identifiers; human-facing test titles use capability labels.

`playwright.audit.config.ts` has one worker, no retries, Chromium/WebKit projects and a dedicated
private `/audit-output` mount. `LESSON3_AUDIT_CRAWL_PHASE=surface` (the default) selects
`c20-surface.audit.spec.ts`; `panels` selects `c20-panels.audit.spec.ts` and requires the previous
run's private states mounted read-only at `/audit-states`, with
`LESSON3_AUDIT_STORAGE_DIR=/audit-states`. Keep each run/follow-up output directory distinct.
The supplement requests all current Manage panel IDs without submitting their actions. It rechecks
cached identity through `/api/users/me`; expired states need fresh sign-in rather than an assumed pass.

`c20-prepare.ts` creates one synthetic forum topic using a persisted submission key and reconciles
that key before retrying an uncertain create. Surface navigation uses a separate page per route so
late client redirects cannot cancel the next visit. Anonymous admin visits settle on the login
origin/path while retaining legitimate redirect query parameters.

`playwright.rbac.audit.config.ts` selects `rbac-core.audit.spec.ts`, one API project and stops at the
first failed case. It reuses the private Chromium states, proves caller identity, attempts bounded
native writes against both fixture scopes and checks private-field reads against populated accounts.
Before/after hashes include complete native version/plan API snapshots, Official pointers and settings.
This bounded set does not replace database-level C31 hashes, other write paths or C22's full matrix.
Validation may deny a native request before an immutability hook; record that distinction rather than
claiming the request exercised a particular hook. Empty default arrays are not protected values.

All live commands hold the target lock. Preserve failed logs/spec snapshots; reconcile runner/owner
and outcome before releasing a failed lock. Private traces and cookies never belong in the checkout.

`playwright.framework.audit.config.ts` selects `rbac-framework.audit.spec.ts`: ten-actor native
job/KV/migration checks, eight-user preference controls, an observational lock experiment and the
negative Teacher statistics-write assertion. It uses the C20 state-tree mount above, verifies each
identity (one normal login only if a verified fixture session expired), and writes fresh states at
`/audit-output/states`. Mutations record planned fixture keys/IDs before acting; known temporary
preferences/locks are removed, original statistics values restored, and native content/settings
hashes compared. The negative statistics assertion remains red on the pinned baseline.

`playwright.lock.audit.config.ts` selects `rbac-lock-ui.audit.spec.ts` in Chromium. Mount the framework
run's private output directory read-only at `/audit-states` (this spec reads `/audit-states/states`).
It compares a legitimate peer-owner lock with a baseline Teacher's forged holder on one real version,
records the native dialog privately, closes the browser and deletes only its two recorded rows.
The negative forged-warning assertion remains red on the pinned baseline. The displayed holder's
email was absent in both observed dialogs. A red security regression is evidence, not a reason to
broaden its expected result until green.
