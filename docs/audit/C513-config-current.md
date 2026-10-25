# C5.13 configuration and wiring — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). Reviewed files were
`app/src/payload.config.ts`, `next.config.ts`, `eslint.config.mjs`, `vitest.setup.ts`,
`playwright.config.ts`, `scripts/seed-users.ts`, `scripts/recover-site-admin.ts`, and
`scripts/check-approuter.mjs`.

The configuration review checked collection/global/task registration, GraphQL reachability, Payload
job access, CSRF/CORS posture from `SERVER_URL`, security headers, generated-surface wiring, first-user
bootstrap and role-lock behavior, the server action body limit, environment-template parity, and the
App Router guard. Payload jobs remain closed to untrusted callers, GraphQL is disabled, first-user
registration is one-shot, and public posture is controlled by the documented `SERVER_URL` switch.
No configuration or wiring finding was confirmed.

The pinned dependency-container run passed **73/73** focused unit assertions, and
`npm run check:approuter` passed. The unit breakdown was 5 backup-status path, 5 first-user
bootstrap, 18 public-library, 6 system-flags, 4 server-action-body-limit, 8 environment-template,
4 first-user-role-lock, 3 system-settings-flags, 8 public-posture, and 12 generated-surface checks.
Runner hash: `93d98ae555b661bc02b6343d05f158c545bd8d3bffadc944ab6f13ff31a41ea8`; raw log hash:
`b20f042065a55b6a05c323b9aefc4ab804d08788fa317b5b81284f9f70f56d78`.

Deployment-specific proxy behavior and shared-host parity remain outside this local configuration
check and are recorded as environment gaps in C70/C83. Generated schema output was not treated as
source evidence.

**Exit:** named configuration and wiring files were reviewed, the App Router guard and 73 focused
assertions passed, and no C5.13 finding is accepted.
