# Plan — close REST writes to Payload's job-statistics global

**Status:** draft for review (2026-10-24). Nothing is implemented. Decisions needing the operator are
in §7.

**Trigger:** audit candidate **F-C22-001** (2026-10-24 audit, branch `audit/2026-10-24-review`).
Rated **High** and confirmed at runtime on the disposable audit target: a signed-in baseline Teacher
can overwrite Payload's internal scheduling metadata, and malformed metadata stops the `default`
job queue until someone repairs it. The queue carries uncached exports, emailed exports,
password-reset emails, message pings and the 30-day draft expiry.

---

## 1. Summary

Payload generates a hidden global, `payload-jobs-stats`, when any task has a `schedule`. This app
got one on 2026-08-06, when `expireEditRecovery` gained its daily schedule. The global has no access
rules of its own, so Payload's default applies: **any signed-in user may read and update it over
REST**. The 2026-06-23 jobs lockdown predates it and does not cover it.

The fix gives that one global explicit access:

- **update: nobody over the API.** This mirrors `jobsCollectionOverrides`.
- **read:** see §7, D1.

The scheduler itself is unaffected. It reads and writes this global through `payload.db.*`, which
never consults access rules.

## 2. Why this needs a post-build step

Payload offers no supported hook for this global. Verified in installed **3.91.0**:

- `config/sanitize.js:281-284` adds the global during sanitization.
- `queues/config/global.js` defines it with no `access`.
- `globals/config/sanitize.js:27-37` fills in `defaultAccess` (`Boolean(user)`).
- There is no override comparable to `jobsCollectionOverrides`.
- Plugins run *before* sanitization (`config/build.js`), so a plugin cannot see the global.
- Declaring a global with the same slug ourselves would collide with the generated one.

What works is adjusting the **built** config before anything uses it. `payload.config.ts` default-exports
the `buildConfig(...)` promise, and every consumer imports that export through `@payload-config`:

- the API route
- the admin pages and layout
- `scripts/*`
- the Payload CLI (migrate, generate)

`payload.globals.config` holds `config.globals` by reference (`index.js:322`, `:490`). So
`buildConfig({...}).then(applyGeneratedSurfacePolicy)` changes the one object every consumer uses.
The change must not be made in `onInit`, because by then request handling may already hold derived
config.

## 3. Change

### 3.1 New module: `app/src/access/generatedSurfaces.ts`

A small pure function, `applyGeneratedSurfacePolicy(config: SanitizedConfig): SanitizedConfig`:

- Finds the global with slug `'payload-jobs-stats'`. The slug is named here because Payload does not
  export it; a comment points at `payload/dist/queues/config/global.js`.
- **Fails closed.** If `config.jobs?.scheduling` is true and the global is missing, it throws with a
  message naming the slug and saying a Payload upgrade probably renamed it. A silent no-op after an
  upgrade is exactly the omission this fix exists to prevent.
- Sets `access.update = () => false`, and `access.read` per D1.
- Is idempotent and returns the same config object.

It lives in `src/access` because that directory is the project's source of truth for authorization
(AGENTS.md). It is written so that later rows can be added: this is the first entry of the
generated-surface table proposed in audit I-C84-001, and the native-lock decisions of 2026-10-24
will land beside it in their own PR. **It is not a policy engine.** Each surface gets an explicit,
named assignment, with no slug-pattern matching.

### 3.2 `app/src/payload.config.ts`

- `export default buildConfig({ ... }).then(applyGeneratedSurfacePolicy)`
- Extend the existing jobs-lockdown comment block to say the stats global is closed in
  `access/generatedSurfaces.ts`, and why it cannot be closed here.

### 3.3 Not changed

- No schema change, so **no migration**: the change is access functions only.
- No change to job tasks, schedules, autoRun, or the jobs collection lockdown.
- No change to the admin UI. The global is already hidden.

## 4. Tests

These follow CLAUDE.md: wire-level tests for an auth-affecting change, plus a fast DB-free guard for
the invariant.

1. **Unit, DB-free: `tests/unit/generatedSurfaces.spec.ts`.**
   - The resolved config contains `payload-jobs-stats`, and its `access.update` returns `false` for
     a synthetic anonymous user, Teacher, Teacher with editing access, Subject Administrator and Site
     Administrator. `tests/unit/expireEditRecoveryTask.spec.ts` already imports the resolved config
     DB-free, so the pattern is proven; reuse its 30 s timeout.
   - `access.read` matches D1.
   - The function throws on a fake config with scheduling on and the global absent, and is
     idempotent.
2. **HTTP: `tests/http/jobStatsGlobal.http.spec.ts`**, modelled on `systemSettings.http.spec.ts`,
   including its rule on fixture labels.
   - `POST /api/globals/payload-jobs-stats` from an anonymous caller and from each role returns a
     refusal (expected 403; record the observed status for anonymous).
   - The stored value is unchanged, read back with `overrideAccess`.
   - The **Site Administrator's refusal** is the assertion that matters, as in the settings test.
   - `GET` follows D1.
   - The probe writes only a harmless marker key. If a write ever succeeds (the red-before run),
     a `finally` restores the snapshot.
   - There is no 404 case: a global has no id.
3. **Integration positive control: `tests/int/jobStatsScheduling.int.spec.ts`.** This is the
   "trusted writes survive" proof.
   - Call `payload.jobs.handleSchedules({ queue: 'default' })` directly. The test compose sets
     autoRun to once a year, so the test drives scheduling itself.
   - Assert the stats row's `expireEditRecovery` timestamp advanced.
   - Assert a scheduled `expireEditRecovery` job exists or was correctly skipped.
   - Clean up any job it created.
   - It pins the invariant against a future Payload that routes these writes through access checks.
4. **Red before, green after.** Run (2) against `main` before the change and record it red, then
   green after. Run the full gate: unit, lint, typecheck, format, int, http and e2e.
5. **Config-consumer parity.** `npm run generate:types` and `npm run generate:importmap` produce no
   diff, `npx payload migrate:status` runs, and the production build boots. This proves the CLI and the runtime both load the wrapped
   export.

## 5. Delivery

- Branch `fix/job-stats-global-access` from `main`, as one small PR.
- The PR has two parts: the new module plus the one-line config change, and the three test files.
- Deploy is the normal path. No migration and no data change are involved.
- **After deploy,** check on the Rock that the app log no longer shows any "Error in job queue cron
  job handler" lines, and that a queued export still completes. Do not probe the live service with
  test writes.
- Record the change in `docs/DECISIONS.md`, and note the outcome against F-C22-001 in the audit
  findings once the audit's author response accepts it.

## 6. Risks

| Risk | Mitigation |
|---|---|
| A Payload upgrade renames or drops the global | The transform throws at boot, and the unit test fails in CI first. Both are intended |
| A future Payload writes the stats through the Local API with access checks | The integration control fails |
| A consumer loads config by another path and misses the transform | §4.5 parity checks. All known consumers import `@payload-config` |
| Stats were already corrupted before deploy | Out of scope for the code. D3 adds a recovery note |

## 7. Decisions for the operator

- **D1: who may read the statistics?**
  - **Recommended: Site Administrator only.** This matches job-row reads, and it is useful for
    diagnosis.
  - Alternative: leave it readable to anyone signed in. It reveals only scheduler timing.
- **D2: may a Site Administrator write it over the API?**
  - **Recommended: no.** No screen uses it, and a hand edit has the same effect as the defect. The
    scheduler is the only writer.
- **D3: add a recovery note to `docs/OPS.md`?**
  - **Recommended: yes.** It would give the symptom (background jobs stop; repeated
    scheduling errors in the log) and the remedy (a Site Administrator runs the queue with
    scheduling disabled, then the stats are reset through a trusted script). It is short and
    contains no reproduction detail.

## 8. Out of scope

- The native-lock changes (F-C22-002), already decided on 2026-10-24, ship in their own PR.
- The full generated-surface contract test (I-C84-001) grows from §3.1 later.
- Upgrading Payload to 3.92.0.
