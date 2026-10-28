# Installer/updater simplicity check

Coordinator fully read `deploy/online/install.sh` (128 lines) and `deploy/online/update.sh`
(230 lines), fixed v1.10 c8d8f3d2. No execution or source changes.

Keep first-install and resumable-update flows separate: the former refuses an existing environment;
the latter preserves it, requires exact pending bundle identity, retains original backup evidence and
marks the conservative migration boundary before activation. A generic deployment state framework
would hide meaningful differences. The shell version comparison belongs in bootstrap shell rather
than importing the application's TypeScript runtime. Compatibility reads for earlier installed backup
layouts are still needed here, even though the app's status reader no longer supports old layouts.

Source-confirmed consistency lead: install's 60 attempts/five-second sleeps do not bound wall-clock
readiness because curl has no request timeout. Update already uses a 300-second deadline and bounds
each request and sleep. Flagged to the efficiency reviewer; its report was corrected. No claim that
the installer currently finishes every failure path within five minutes, and no fix claimed.

Other conditional/error branches preserve different operator recovery states, environment validation,
backup decisions or refuse-overwrite behavior. No worthwhile branch reduction identified. Runtime
simplicity coverage is complete for these two deployment scripts. CI/Compose/Dockerfile inputs receive
configuration consistency review in ops-altitude.md; they are not forced through four code views.
