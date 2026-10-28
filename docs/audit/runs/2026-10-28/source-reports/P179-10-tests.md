# P179-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made. Source was taken from the supplied text, not the working tree, and the baseline commit was not verified.

- `app/tests/unit/envTemplateParity.spec.ts:401-683`: read.
- `app/tests/unit/errorTracking.spec.ts:1-87`: read.
- `app/tests/unit/expireEditRecoveryTask.spec.ts:1-42`: read.
- `app/tests/unit/exportArtifacts.spec.ts:1-122`: read.
- Not assessed: `envTemplateParity.spec.ts:1-400` (not supplied). Referenced but unseen: `helperBindings`, `processEnvBase`, `denotesProcess`, `literalText`, `parseEnvFile`, `sourceFiles`, `HELPER_NAMES`, `RUNTIME_PROVIDED`, `COMPOSE_ONLY`, `DEV_CRITICAL`, `NEVER_IN_TEMPLATE`, `src/lib/env.ts`, `src/lib/errorTracking.ts`, `src/instrumentation.ts`, `src/jobs/expireEditRecovery.ts`, `payload.config.ts`, and the generator modules.
- The policy excerpts were used as context only, not reviewed as source.

## Purpose and invariants

- **envTemplateParity:** statically collects `process.env` reads from `src/` and `next.config.ts`, then requires that the root and app templates match them. Dynamic reads are allowed only once, in `lib/env.ts`.
- **errorTracking:** with no `SENTRY_DSN`, the feature is inert. With a DSN, exceptions are forwarded with context. Request headers must not be forwarded.
- **expireEditRecoveryTask:** the task must carry a schedule and be registered.
- **exportArtifacts:** the zip holds exactly the documents that exist. The key travels with the final explanation. Renders from an older generator version are not served.

No confirmed product defect exists in the supplied ranges.

## Candidates

**C1. Lead, security, medium.** `errorTracking.spec.ts:62-86`
- Precondition: `request.path` includes the query string, and an emailed reset or verify link carries its token in the query. The policy names the `/reset-password` and `/verify-email` pages but does not state where the token sits.
- Expected: no token reaches the forwarded hint.
- Actual: unknown. The test only checks the `cookie` header, and `instrumentation.ts` is not in range.
- Repro: `onRequestError(new Error('x'), {path:'/reset-password?token=TOKEN_X', method:'GET', headers:{}}, ctx)`, then `expect(JSON.stringify(hint)).not.toContain('TOKEN_X')`.

**C2. Confirmed local, test-guard gap, low to medium.** `expireEditRecoveryTask.spec.ts:24-27`
- The comment says the queue must match the config's `autoRun` queue. No assertion reads `jobs.autoRun`; the test hard-codes `'default'`.
- Consequence: if `autoRun` drains another queue, this test still passes and the job never runs, which is the failure the comment describes.
- Repro: assert that some `resolved.jobs.autoRun` entry drains `schedule[0].queue`.
- Product defect not confirmed, because the `autoRun` config is unseen.

**C3. Confirmed scope gap; impact is a lead; medium-low.** `envTemplateParity.spec.ts:401`, with F at `:612-616`
- `sourceFiles` covers `src/` and `next.config.ts` only. Test E imports `scripts/lib/localDbGuard.ts`, so `scripts/` exists, and its env reads are never collected.
- Consequence: assertion A cannot require variables that only scripts read. The F docstring's "every env read in the source" overstates coverage.
- Repro: add `scripts/probe.ts` reading `process.env.PROBE_REQUIRED` with no template entry. A should fail, but by reading the code it passes.
- Whether any script reads env beyond `DATABASE_URI` is unknown.

**C4. Lead, low.** `envTemplateParity.spec.ts:550-552` and `:619-630`
- `export default function NAME` and `export default class NAME` are recorded as `NAME`, not `'default'`, because the name check runs before the default check.
- Consequence: G accepts a default-exported helper whose name is in `HELPER_NAMES`. If `helperBindings` tracks only named imports (unseen), a default-import read escapes F.
- Expected: `'default'` is recorded for default exports.

**Ruled out:** namespace-import helper calls such as `env.positiveIntEnv('X')` are not silent. At `:471-475` the identifier is not a callee, so it is reported as "used as a value, not called directly."

**Not a candidate:** `exportArtifacts.spec.ts` is consistent with the four-document and render-version policy. Its render-version check uses a lower bound only, which is a test-strength note, not a defect.

## Unresolved questions

1. Does `onRequestError` forward `request.path` with its query string? (C1)
2. What does `jobs.autoRun` drain, and is it `'default'`? (C2)
3. Do any `scripts/` files read env, and which variables? (C3)
4. Does `helperBindings` track default imports? (C4)
5. Does `errorTrackingEnabled` treat an empty `SENTRY_DSN=` as disabled? The test only deletes the variable.
6. Do `processEnvBase` and `denotesProcess` cover `globalThis.process` and bracketed `process['env']` forms?

Security and integrity claims in this report remain unreviewed until independent review.
