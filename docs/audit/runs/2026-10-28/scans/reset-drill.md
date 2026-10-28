# Disposable target reset proof — C01

Source product tree: fixed audit baseline. New owner-only configuration selects only the dedicated audit Compose project, checkout, PostgreSQL container and primary database. No live or preserved stack is eligible.

`tools/reset-test.sh` verifies the project label, audit branch and expected source tree, acquires an atomic target lock, and uses an owner token for release. A pre-existing foreign lock returns exit 75 and remains intact. The explicit snapshot and reset operations use a private custom-format dump; reset stops only the two audit app containers, drops/restores only the audit primary database, then waits for healthy apps.

Observed sequence: create a synthetic verified fixture; snapshot; reset; confirm the fixture row exists and real HTTP login returns 200. The foreign-lock negative control passed. Raw dumps, credentials and logs stay private. This proves the local audit reset fixture and target isolation, not every production recovery scenario.

The reset target lock is also required around exclusive load/drill tools. Ordinary fixture suites remain serialized by orchestration; they do not acquire this helper's lock automatically.
