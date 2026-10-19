# Completed CI edit for the Insert link PDF wire fixture

**Completed in #404 and merged on 2026-10-18. No edit or merge action is outstanding.**

The operator updated the Stack up step in `.github/workflows/ci.yml` to load the explicit test
configuration, because the assistant's credentials cannot push workflow files:

```yaml
        run: docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

The workflow now runs this command. Do not repeat the old edit or load the test override on a live
installation. This file records the completed handoff; it is not an active instruction to edit #404.

The override mounts `app/tests/fixtures/pdf-library` read-only and enables public opening explicitly
on the main test app. It also starts an internal-only `pdf-private` app with the same fixture and
production build but no publication opt-in, exercising the upgrade/default sign-in requirement.
The wire suite requires both modes, including anonymous public 200, private 401, authenticated private
200, authenticated listing, safe token handling, PDF bytes and `nosniff`. No workflow changes are
needed for the additional mode because the Stack up command already loads this override.

These are fixture-writing tests for isolated stacks, not live installation health checks. See
`docs/OPS.md` for staging tests and non-mutating verification on a live installation.
