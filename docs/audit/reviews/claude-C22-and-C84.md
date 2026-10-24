# Claude review — F-C22-001, F-C22-002, I-C84-001, I-C84-002

Targeted opposite-family critique requested by `docs/audit/CLAUDE-REVIEW.md`. This is **not** the blind
C82 missing-issue pass, accepts nothing and fixes nothing. The original findings and proposals are
left as written; the author's recheck and response are still to come.

| Item | Value |
|---|---|
| Review package commit (`git rev-parse HEAD` when fetched) | `a33b6b807ca5a040c0dc69c5e1490c07bb2d6bda` (`audit/2026-10-24-review`) |
| Product source baseline | `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`, an ancestor of the package commit. `git diff --stat` shows the package adds only `app/tests/audit/*`, `docs/audit/*`, `docs/DECISIONS.md` and `docs/NEXT-SESSION.md`. No product source changed |
| Executed-helper hashes | `rbac-framework.audit.spec.ts` `79e2ab3e…6c97` and `rbac-lock-ui.audit.spec.ts` `fba071e8…c30edc122`. Both match `C22-framework.md` |
| Installed framework source read | `payload`, `@payloadcms/ui` and `@payloadcms/next` **3.91.0**, plus `croner` **10.0.1**. Each was fetched as the lockfile's `resolved` tarball, and its sha512 matches the `package-lock.json` `integrity`. Each was extracted read-only into a scratch directory outside the checkout |
| Reviewer / date | Claude (Claude Code, Anthropic). Session policy keeps model identifiers out of repository artifacts, so the operator holds the exact identifier privately. 2026-10-24 |

## Evidence boundary

- **Independently verified, source:** every installed-source and application-source claim below, with
  file and line references.
- **Independently verified, offline execution:** a database-free and target-free probe. It imports the
  installed Payload 3.91.0 `handleSchedules` module and croner 10.0.1, then drives them with a fake
  `req.payload.db`. It ran on Node 22.22.0, not the pinned 24.22.1. The probe is pure date and
  control-flow logic, so the risk from the version difference is low, but this is a qualification. To
  satisfy imports, `@payloadcms/translations` 3.91.0, `http-status` 2.1.0 and `bson-objectid` 2.0.4
  were fetched. Their versions match the lockfile, but their integrity was **not** separately
  checked; they are only error-class and translation imports. The script and its output are in the
  appendix.
- **Not reproduced by me:** every HTTP status, persistence readback, browser modal and cleanup
  fingerprint in the author's reports. I had no C01-approved disposable target and did not create
  one. I touched no shared or live stack. Those results are cited below as **reported**.

## Verdict summary

| ID | Verdict | One line |
|---|---|---|
| F-C22-001 | **Amend**: confirm the defect, raise the severity | The source fully confirms the write. Installed code also settles the deferred consequence: one invalid value halts **all** `default`-queue autorun on every tick until someone rewrites it. Provisional **High**, pending one disposable-target check |
| F-C22-002 | **Amend**: confirm the defect, widen the impact analysis | The forged holder is confirmed. The modal is native behaviour working on forged data. The analysis missed one thing: REST collection writes **enforce** locks by default, and The App issues several such writes with no takeover path (lead L-CL-001). The Low rating stands only until that lead is checked. The proposed remedy, as worded, would break takeover or peer warnings if implemented literally |
| I-C84-001 | **Amend**: endorse the core, reorder and tighten | The evidence is stronger than stated: the stats global appeared because of an *application config change* (2026-08-06), not an upgrade. Make the effective-surface contract the core deliverable and the transform a secondary, fail-closed seam. Add per-collection `lockDocuments` decisions to its scope |
| I-C84-002 | **Confirm keep**, with two small amendments | The premise is verified in 3.91.0 UI source. Existing int tests assert `.rejects.toThrow()` and so cannot tell the hook from validation (the author's qualification is correct). Optionally move or duplicate the rejection to `beforeOperation`. Document the lock-scope exception to the "never reuse the render grant" rule if F-C22-002's remedy uses it |

---

## F-C22-001 — Teacher write to `payload-jobs-stats`

### 1. Verdict

**Amend.** I confirm the defect from source and from the installed scheduler. The severity should
rise because a consequence the report left open can be determined from installed code. Policy reading
and remedy direction are confirmed, with the corrections below.

### 2. Source references and evidence

Independently verified in source:

- `app/src/payload.config.ts:174-217`: `jobs.access` (run/queue/cancel → `isSiteAdmin`) and
  `jobsCollectionOverrides` (read Site Admin; create/update/delete `false`). Nothing addresses the
  stats global, and `globals: [SystemSettings]` (`:163`) is the only declared global.
- `payload/dist/config/sanitize.js:281-284`: when any task has `schedule`, sanitize sets
  `config.jobs.scheduling = true` and pushes `sanitizeGlobal(getJobStatsGlobal(config))`.
  `payload/dist/queues/config/global.js` returns `{ slug: 'payload-jobs-stats', admin: { hidden: true },
  fields: [{ name: 'stats', type: 'json' }] }`, with no `access`.
- `payload/dist/globals/config/sanitize.js:27-37` defaults missing `read`/`update` to `defaultAccess`.
  `payload/dist/auth/defaultAccess.js` is `Boolean(user)`. `globals/operations/update.js:87-90`
  executes `globalConfig.access.update` unless `overrideAccess`. So **read and update are open to any
  authenticated user**. `admin.hidden` affects navigation only.
- No supported override exists. `jobsCollectionOverrides` (`queues/config/types/index.d.ts:161`) is
  the only override hook, and nothing comparable exists for the stats global. `config/build.js` runs
  plugins **before** `sanitizeConfig`, so a plugin cannot see the generated global. Declaring the
  same slug yourself would collide with the pushed one.
- **Trusted writes do not use access.** `handleSchedules/index.js:26` reads with `req.payload.db.findGlobal`.
  `defaultAfterSchedule.js` writes with `req.payload.db.updateGlobal` / `createGlobal`. Both are
  adapter calls that never consult `access`. So a REST `update: () => false` leaves scheduling
  intact. This answers the packet's "confirm that trusted scheduling writes would survive": they do,
  by construction.
- When the global appeared: it was introduced by `src/migrations/20260806_185943_add_edit_recovery.ts`,
  the first `schedule`. The jobs lockdown (DECISIONS 2026-06-23) predates it by six weeks, so the
  omission is not an oversight in that decision. A later, unrelated config change created the surface.
- Actor pool: `access/index.ts:158-162` (`usersCollectionCreate`) lets an **unauthenticated** caller
  create an account once a first user exists. That account is subject to verification and deployment
  posture. So "baseline Teacher" may include self-registered accounts, not only provisioned staff.

Independently executed offline (appendix). These are installed functions, not reimplementations:

| Input `…tasks.expireEditRecovery.lastScheduledRun` | Result |
|---|---|
| valid recent ISO date | next 03:15, normal |
| `2099-01-01T00:00:00Z` | `waitUntil 2099-01-01T03:15Z` (matches the author's probe) |
| `"not-a-date"` | throws `Invalid ISO8601 passed to timezone parser.` (matches the author) |
| `12345`, `{ "a": 1 }` | throws `CronDate: Invalid type …` (new; any non-string non-null value also throws) |

Driving the real `handleSchedules` with a fake DB:

- **Invalid value:** throws after `findGlobal` and **before** `count`, `jobs.queue` or `updateGlobal`.
  Nothing rewrites the bad value.
- **2099 with a pending scheduled job:** skipped, then `defaultAfterSchedule` rewrites
  `lastScheduledRun = now`. It self-heals within one tick, which is the author's counterevidence,
  confirmed.
- **2099 with no pending scheduled job:** `jobs.queue({ waitUntil: 2099-01-01T03:15Z })` is called.

Reported by the author (not reproduced): Teacher `POST /api/globals/payload-jobs-stats` → 200, marker
persisted on Site-Admin readback, then restored. Framework batch 19 passed / 1 failed.

### 3. Policy, severity, counterevidence and limits

**Policy.** I agree. SPEC §8 grants a baseline Teacher view/export and personal workflows.
DECISIONS 2026-06-23 sets the project rule: "Payload's job system is open-by-default — any app
exposing it must set `jobs.access` AND lock the `payload-jobs` collection". The stats global is the
same system's state reached through a different route, so no product decision is needed to close it.
I would go further than the report on one point: **no** REST caller, Site Admin included, has a
legitimate reason to hand-write this JSON. A Site-Admin typo has exactly the effect described below.
The right policy therefore matches `jobsCollectionOverrides`: `update: () => false`. Read stays a
separate, minor question (it exposes scheduler timing only); I would make it `isSiteAdmin` for
consistency with job-row reads.

**Consequence the report deferred, now traced in installed code.** `payload/dist/index.js:244-268`,
the autoRun cron callback, runs `await this.jobs.handleSchedules(...)` and *then*
`await this.jobs.run(...)` in the same async function, with no try/catch between them. A throw from
`handleSchedules` is caught only by croner's `catch` option, which logs
`Error in job queue cron job handler`, so `run` is **never reached on that tick**. The probe shows
exactly that: `run reached = 0, croner catch fired = 1`, with no unhandled rejection. Because the
invalid value is never rewritten, this repeats on every tick (`JOBS_AUTORUN_CRON`, default every 3 s).
This app has one autoRun entry (`queue: 'default'`), and every task queues there:

- `generateVersionArtifact` (uncached exports)
- `emailVersionArtifact`
- `passwordResetEmail`
- `messagePing`
- `expireEditRecovery`

`exportVersion.ts:131` and `emailVersion.ts:106` pass no `queue`, and the jobs collection
`queue.defaultValue` is `'default'` (`queues/config/collection.js:209`).

So, from source, one authenticated request carrying an invalid `lastScheduledRun` should stop all
background job processing **persistently**:

- A process restart does not help, because the value lives in the database.
- Nothing in the UI shows it (the global is hidden).
- Recovery needs someone to rewrite the global over REST or in the database. Ironically, today any
  authenticated user can do that rewrite.

The far-future path is narrower but also persistent. It needs the write to land while no scheduled
`expireEditRecovery` job is pending: roughly one tick after the daily job completes (completed jobs
are deleted), after a terminal failure, or on a fresh database. A sustained POST loop around 03:15
plausibly wins that race. The resulting `waitUntil 2099` job then counts as pending forever
(`countRunnableOrActiveJobsForQueue` ignores `waitUntil`), so 30-day expiry silently stops. Under
the existing lockdown, only database access can delete that job row (`delete: () => false`).

**Severity.** I propose provisional **High** (availability and integrity):

- the request is cheap, single and authenticated
- the actor pool may include self-registered accounts
- every queue-backed feature is affected, including password-reset email
- the effect persists and is silent

Counterevidence that keeps it below Critical:

- authentication is required
- queued work is retained, not lost, and would run after recovery
- cached exports still return `ready` without the queue (`exportVersion.ts:120`)
- no content of record is touched
- the deployment is currently a demo server

The far-future-only variant on its own would be Medium (a retention-policy failure behind a race).
**Limit:** the High rests on source tracing and offline execution, not an observed outage. It should
stay provisional until the check in §4 runs.

### 4. Corrections, smallest useful test, remedy critique

Corrections to the report:

- "The full cron/runner error handling and availability consequence remain follow-up work" can now
  name the mechanism: `index.js:244-268` ordering plus no rewrite on throw.
- Add the non-string inputs.
- Say that the omission came from adding `schedule` (2026-08-06), not from the 2026-06-23 lockdown.

Smallest disposable-target check that would settle the severity. Do it on a C01 target only, with
the scheduler and the runner both live:

1. Snapshot stats.
2. As Teacher, POST stats with `…expireEditRecovery.lastScheduledRun: "not-a-date"`.
3. As a permitted user, request an uncached export.
4. Over a fixed observation window (say 30 s, about 10 ticks), assert:
   - the export job stays unprocessed
   - the log repeats the handler error
   - stats are unchanged
5. Restore stats, then assert the export completes within a few ticks.
6. Record the ledger/cleanup evidence as the package does.

This one test turns the High into either observed or refuted.

Remedy critique:

- **The seam is viable, and it is a single point.** Every runtime consumer imports the
  `@payload-config` default export:
  - `app/(payload)/api/[...slug]/route.ts`
  - the admin `page.tsx` / `layout.tsx`
  - `scripts/*`
  - the Payload bin, which loads the same file

  `payload.globals.config` holds `config.globals` **by reference** (`index.js:322`, `:490`). So
  `export default buildConfig({...}).then(lockGeneratedSurfaces)` changes the object every consumer
  uses. Type generation and migrations do not read `access`, so the "codegen parity" risk is small. A
  boot check is still cheap.
- **Fail closed.** If `config.jobs.scheduling` is true and no `payload-jobs-stats` global exists, the
  transform should **throw**. A silent no-op after an upgrade that renames the slug is exactly what
  I-C84-001 is meant to catch.
- **Prefer `update: () => false` over `isSiteAdmin`** (above). That also makes the wire test simple:
  every role gets 403.
- **The fix should not depend on validation.** Validating `stats` shape on REST writes would be a
  second line of defence. With REST closed, the only writers are the framework's own, so it is not
  needed. Do not build it.
- **Rejected alternative:** denying `/api/globals/payload-jobs-stats` in the Next route handler. There
  is a precedent (GraphQL route files were deleted), but it sits outside Payload's access model and
  does not appear in `getAccessResults`. It would be acceptable only as defence in depth.
- **Required tests**, per CLAUDE.md's "every auth-affecting change ships wire-level tests":
  1. `tests/http`: a 403 for every role on POST, and the chosen read policy. Keep the 401 for
     anonymous.
  2. A DB-free unit test asserting the resolved global's `access.update` is false for synthetic
     Teacher, Subject Admin and Site Admin.
  3. An int positive control: `payload.jobs.handleSchedules()` still creates or updates the stats row
     and queues `expireEditRecovery`.

  Item 3 is the "trusted writes survive" proof. Source shows it should pass trivially, but it pins
  the invariant against a future Payload that routes these writes through the Local API with access.
- **Audit-helper caveat, not a defect in the claim.** The spec's restore races the 3 s scheduler.
  `defaultAfterSchedule` spreads whatever it read at the start of its tick, so a tick that read the
  marked stats could re-persist the marker *after* the restore. The author's separate database read
  found no marker, which is the right control; keep that independent read mandatory. The restore also
  rolls `lastScheduledRun` back to the snapshot, which the next tick overwrites and is harmless.

---

## F-C22-002 — Forged holder in a native lock

### 1. Verdict

**Amend.** I confirm the ownership defect. Against the forged data, the modal is native behaviour
working as designed. The real defect is that any authenticated caller can author and alter lock data
for any target. The impact analysis is incomplete (L-CL-001), and the remedy as worded has two traps.

### 2. Source references and evidence

Independently verified in source:

- `payload/dist/locked-documents/config.js:41-53`: create/read/update/delete are all `defaultAccess`,
  and the `user` relationship (`:34-40`) takes caller data with no stamp or check. No app code sets
  `lockDocuments` on any collection or global (`grep` in `src/`), so **every** collection, `users`
  included, and `system-settings` are lockable.
- **How the framework writes locks** (this matters for the remedy):
  - **Create:** the server, inside form-state building, via `payload.db.create`
    (`ui/dist/utilities/handleFormStateLocking.js:108-122`), which bypasses access. No framework
    client code POSTs to `/api/payload-locked-documents`. The only client calls in
    `ui/dist/providers/DocumentInfo/index.js:133-215` are GET, DELETE (unlock) and PATCH (takeover).
    No app code POSTs locks either.
  - **Refresh:** `payload.db.updateOne`, own lock only (`handleFormStateLocking.js:66-73`).
  - **Takeover:** the user taking over sends a client REST `PATCH` on **another holder's row**, setting
    `user` to themselves (`DocumentInfo/index.js:173-215`).
  - **Unlock:** a client REST `DELETE`.
  - **Every read of lock state uses the caller's access:**
    - `handleFormStateLocking.js:50-58` (`overrideAccess: false`)
    - `next/dist/views/Document/getIsLocked.js:60`
    - `collections/operations/find.js:169`
    - the client GETs
- **Lock enforcement on REST writes.** `collections/endpoints/updateByID.js:16`, `update.js:16`,
  `deleteByID.js:13` and `delete.js:13` pass `overrideLock: overrideLock ?? false`.
  `utilities/checkDocumentLockStatus.js` then throws `Locked` (HTTP 423) when the newest unexpired
  lock row for the target has `user ≠ req.user` (`lockDuration` defaults to 300 s, measured from the
  row's `updatedAt`). Globals differ: `globals/endpoints` passes nothing, and the default
  `overrideLock = true` means global REST updates ignore locks. The Local API also defaults to no
  check, so the app's custom endpoints (`overrideAccess` paths) are unaffected.
- Holder email: `users.email` is field-gated by `emailReadAccess` (Site-Admin-or-self), and
  population over REST runs with the caller's access. That agrees with the reported finding of no
  email disclosure. Display names are readable to any authenticated user anyway
  (`usersCollectionRead`).

Reported by the author (not reproduced): Teacher POST with a Site-Admin holder → 201. An unrelated
Teacher's PATCH and DELETE → 200. Chromium shows the modal for both the legitimate peer control and
the forged holder. No holder email appeared. Cleanup and hashes are equal.

### 3. Policy, severity, counterevidence and limits

**Policy.** I agree that a baseline Teacher should neither author presence state for documents they
cannot edit nor attribute it to someone else (SPEC §2/§8). The packet asks whether the warning is a
defect or intended behaviour. The UI behaves exactly as designed for the data it reads. The defect is
**authority over the data**, and the finding should say so in those words, so that nobody "fixes"
the UI.

**Severity.** The Low rating stands for the effect that was observed: a false native modal that
offers **Take over**. But it rests on the assumption that locks matter only inside the native form.
They also gate **REST collection writes** (above). The App issues native REST PATCH/DELETE without
`overrideLock`, and with no takeover affordance, at:

- `components/LessonControls/index.tsx:921` (delete version)
- `AdminDashboard/CandidateList.tsx:103` (delete candidate)
- `AdminDashboard/DeletePlansPanel.tsx:103` (delete plan)
- `FavoriteToggle.tsx:58` (unfavourite)
- `UserMenu/DisplayNameForm.tsx:73` (`PATCH /api/users/:id`)
- `Manage/UsersPanel.tsx:99,193` (Site-Admin user PATCH/DELETE)

From source, a caller who creates a lock on such a target can make those calls return 423. They can
then keep it alive by re-PATCHing the row inside every 300 s window: update is open, and Payload
stamps `updatedAt` on every update. One example scenario needs **no forged holder at all**: a Teacher
locks their *own* `users` row in their own name, and the Site Admin's Manage → Users delete or
role-change on that account then fails while the lock is refreshed. That is resistance to moderation.

Counterevidence:

- any authenticated user can DELETE the lock row, or send `?overrideLock=true`, but no App UI does
  either
- it needs sustained activity
- no content-of-record change is possible

This is **not reproduced**; see lead L-CL-001. If it reproduces, I would re-rate F-C22-002 as
**Medium** (targeted, sustainable denial of administrative actions), or split it as its own finding.

### 4. Corrections, smallest useful test, remedy critique

Corrections:

- State that REST collection writes enforce locks (`overrideLock ?? false`) and global REST writes do
  not.
- Note that the synthetic-global experiment therefore says nothing about write blocking.
- Note that bulk `update`/`delete` check locks per document.

Smallest additional test, for L-CL-001, on a disposable target:

1. A Teacher creates a lock on `users/<teacher>` with `user` = the Teacher.
2. A Site Admin sends `PATCH /api/users/<teacher>` with a harmless field.
3. Expect 423 on the unfixed baseline.
4. Repeat after a 4-minute refresh PATCH of the lock row to show persistence.
5. Delete the lock and re-PATCH to show recovery.

Separately, a version-delete variant using `LessonControls`' exact request.

Remedy critique. The proposal is "bind ownership to the caller and scope mutation to callers
authorized to edit the target". Taken literally, it has two traps and one gap:

1. **Do not restrict `read` to own rows.** Every framework lock reader runs with the caller's access.
   An owner-only read would silently suppress *legitimate* peer warnings and the list-view lock
   status: the control case would go green for the wrong reason. Keep read broad, which reveals
   presence (user ID/name and target ID) to any authenticated user. Alternatively, scope it to
   targets the caller can read, but that is a polymorphic where-query; make it an explicit policy
   choice.
2. **Do not make `update` owner-only.** Native takeover *is* a PATCH on another holder's row. The
   correct predicate for update is all three of:
   - `data.user` equals `req.user` (takeover to yourself only; no foreign attribution)
   - the caller has form-edit authority on the target
   - only the `user` field changes

   Refresh never needs REST, because the framework uses `db.updateOne`.
3. **`create: () => false` is the simplest, verified-safe change.** It cannot break the native UI,
   which never POSTs, and it removes the observed forging primitive outright.
4. **Gap: ownership binding alone does not fix L-CL-001.** In the own-row scenario the caller is the
   holder. Target scoping does not fix it either, because a Teacher may update their own `users` row
   (`usersCollectionUpdate`). The options are:
   - set `lockDocuments: false` on collections never edited in the native form. On inspection that
     is likely `users`, `favorites`, messaging, discussions and `edit-recovery`; it needs
     confirmation per collection.
   - and/or have The App's REST mutations send `overrideLock=true` where advisory locking is not the
     intended semantics.

   That is a per-collection product decision, which I-C84-001's table is the right place to record.
5. **"Form-edit authority on the target" for `lesson-bundle-versions` is exactly
   `versionUpdateGrantForFormRenderOnly`.** Its header says reusing it in another access decision is
   a bug. A lock is form-session state, which is precisely what that grant describes, so the reuse
   is semantically right. But it must be a documented exception in `access/versionImmutability.ts`,
   ideally obtained through Payload's computed document permissions rather than by importing the
   predicate. See I-C84-002.
6. **Remaining writer: `buildFormState`.** It is gated only by `canAccessAdmin`
   (`ui/dist/utilities/buildFormState.js:17`) before `handleFormStateLocking` creates a lock for the
   caller on the requested `id`. Baseline Teachers are excluded from admin (`adminPanelAccess`), but
   Teachers with editing access are not. I did **not** trace whether form-state building verifies
   document read access first (lead L-CL-002). Closing REST create does not cover this path.

Keep the author's red-before/green-after browser regression with the peer control. Add:

- a takeover-still-works case (peer B takes over A's lock → 200, holder = B)
- an unlock-on-leave case
- the L-CL-001 REST case

---

## I-C84-001 — Explicit boundary for framework-generated surfaces

### 1. Verdict

**Amend.** I endorse the core: an explicit, short table of generated surfaces and an executable
contract, with no policy engine. I would reorder the deliverable and tighten the lifecycle
assumptions.

### 2. Source and evidence

- The class of defect is real and was observed. Both F-C22 candidates are generated surfaces, as are
  the KV, migrations and preferences surfaces the package already checked.
- The proposal says a review can miss "a framework addition **after an upgrade**". The verified
  history is stronger: `payload-jobs-stats` was created by adding `schedule` to an app task
  (2026-08-06 migration). That was an innocent application change, with no upgrade involved. The
  sanitize branch is `sanitize.js:281` (`hasScheduleProperty`).
- The seam analysis is correct and can be firmed up:
  - plugins run pre-sanitize (`config/build.js`)
  - no stats-global override exists
  - the `@payload-config` default export is the single consumer point
  - `payload.globals.config` is by reference

  "Do not mutate in `onInit`" is right: by then the HTTP layer may have computed client config.

### 3. Benefit, cost, counterevidence and limits

- **Benefit.** A CI signal for exactly the omission observed, at a cost of tens of lines. It also
  gives F-C22-002's per-collection `lockDocuments` choice a home.
- **Cost.** Upgrade friction. That is intended, but the table must say what each decision protects,
  so the friction is cheap to clear. It does **not** replace per-collection feature access, and it
  must not try to.
- **Counterevidence.** With only around six generated surfaces, inline decisions in `payload.config.ts`
  (as `jobsCollectionOverrides` already is) are readable. The value is in the *contract* that detects
  new surfaces, not in moving decisions into a new module.
- **Limits.** As the author says, this is an opening draft; the C84 whole-system conclusions are
  pending.

### 4. Corrections, smallest useful test, remedy critique

1. **Make the contract test the first deliverable, not the second.** A DB-free unit spec should:
   - resolve the sanitized config, or the config builder with a stub adapter if `buildConfig` needs
     no live database (to be verified; existing unit specs import collections, not the config)
   - enumerate `collections`/`globals` slugs and assert set equality with an explicit table
     `{ slug → decision }`
   - for each framework entry, evaluate its access functions against synthetic `null`, Teacher,
     Teacher-with-editing-access, Subject Admin and Site Admin users

   A new slug or a changed default fails CI. This catches the 2026-08-06 class even before anyone
   writes a remedy. The F-C22-001 fix then lands as the first table row to flip.
2. **Make the transform fail closed** (throw on an expected-but-missing slug) and idempotent. Keep it
   to explicit per-slug assignments; no pattern matching. That matches the author's "no policy
   engine" stance, which I endorse.
3. **Add `lockDocuments` per collection** to the table (lockable or not, with the reason), plus
   `jobs.access`, `jobsCollectionOverrides`, KV, migrations and preferences. Then the table is the
   complete framework list, not a partial one.
4. **Wire tests, required by CLAUDE.md for auth-affecting changes.** One `tests/http` case per flipped
   decision, with 401/403 and the positive control. The unit contract does not replace them.
5. **PR sequence.** I agree, with one change: (a) a contract test pinning *current* behaviour, red
   only where policy is already decided (the stats update); (b) the stats fix; (c) the lock change
   once F-C22-002 and L-CL-001 are settled. Keep each PR small. "Real scheduler enqueue/run" belongs
   in (b) as the int control described under F-C22-001.

---

## I-C84-002 — Keep the paired form-render grant and immutable-write rejection

### 1. Verdict

**Confirm keep**, with two small amendments.

### 2. Source and evidence

- The premise is verified in installed 3.91.0:
  - `ui/dist/views/Edit/index.js:588,611`: `readOnly: … || !hasSavePermission`
  - `next/dist/views/Document/getDocumentPermissions.js:106`: `hasSavePermission` derives from
    document `update` permission

  So `update: false` does make the native form read-only, as `access/versionImmutability.ts:12-15`
  says.
- The wiring is at `collections/LessonBundleVersions.ts` `access.update` and `hooks.beforeChange[0]`,
  and is pinned by `tests/unit/versionImmutabilityWiring.spec.ts`.
- **The test gap is real and specific.** `tests/int/access.int.spec.ts:57-80` (and `:347`) assert
  `.rejects.toThrow()` on a partial `data: { title }`. Any `beforeValidate` failure (for example
  `enforceBundleVersionGeneratable`) satisfies that assertion, so these tests do not prove the
  immutability hook is what rejected. That confirms the author's qualification.

### 3. Assessment

The pair is the cheapest correct answer to a framework constraint. An application-owned editor would
duplicate serialization, row identity, recovery and field visibility for no shown benefit. I agree
with the cost analysis.

One alternative the draft does not consider: **reject in `beforeOperation`** (`operation === 'update'
&& req.user`). Today that position holds `refreshMutationAuthority`. The benefits:

- the rejection becomes independent of payload validity
- `beforeValidate` work is skipped for a write that will be refused
- the status is a constant 403, even for an ID outside the caller's scope

Costs:

- it changes the wire status for some no-access callers (404 → 403), which existing `tests/http`
  expectations may pin
- bulk `update` passes through it once, not per document

That makes it optional, not required. If adopted, keep the `beforeChange` hook as the
per-document backstop.

### 4. Corrections and smallest useful test

- **Smallest test.** An authorized Teacher with editing access sends an `int` `update` or an
  `http` PATCH whose `data` is a **fully valid** copy of the version with one prose leaf changed.
  Assert the specific immutability message/403, and that the database row is unchanged. That closes
  the gap the author named without growing into an editor rewrite.
- **Cross-reference F-C22-002.** If lock scoping uses form-edit authority, document in the pair's
  header that lock authority is the one sanctioned reuse of the render grant. Otherwise a future
  reader will "fix" it as the bug the header warns about.

---

## New leads (recorded separately; not findings)

- **L-CL-001: lock-enforced REST writes as a denial primitive.** Native REST collection PATCH/DELETE
  default to `overrideLock: false`, so the App surfaces listed under F-C22-002 §3 return 423 while a
  foreign lock row exists. Lock rows can be created and refreshed by any authenticated user, including
  on the caller's own `users` row with no forgery. Source-traced only; the test is in F-C22-002 §4.
  Owner to assign; it touches C22 (authority) and C30/C31 (write paths).
- **L-CL-002: form-state lock creation by admin-capable users.** `buildFormState` checks only
  `canAccessAdmin` before `handleFormStateLocking` creates a caller-owned lock on the requested
  `collectionSlug`/`id`. Not traced: whether document read access is checked first. Relevant to
  Teachers with editing access locking out-of-scope documents, and to whether closing REST create is
  sufficient.
- **L-CL-003 (minor, policy): lock presence disclosure.** Any authenticated user can list every lock
  row: who is editing which document ID, including admins editing `users` rows. Low value. Recorded
  so that F-C22-002's read decision is explicit rather than accidental.

## Appendix — offline scheduler probe

Run from a scratch directory holding the integrity-matched packages under `node_modules/`. No
database, no target, no network calls by the code under test.
`node sched-probe.mjs <dir-with-node_modules>`:

```js
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const hs = await import(pathToFileURL(`${root}/node_modules/payload/dist/queues/operations/handleSchedules/index.js`))
const { Cron } = await import(pathToFileURL(`${root}/node_modules/croner/dist/croner.js`))
const task = { slug: 'expireEditRecovery', schedule: [{ cron: '0 15 3 * * *', queue: 'default' }] }
const stats = (v) => ({ stats: { scheduledRuns: { queues: { default: { tasks: { expireEditRecovery: { lastScheduledRun: v } } } } } } })
const out = (label, f) => { try { const r = f(); console.log(label, r && r.waitUntil ? r.waitUntil.toISOString() : r) } catch (e) { console.log(label, 'THROWS', e.message) } }
for (const v of ['2026-10-24T03:20:00.000Z', '2099-01-01T00:00:00.000Z', 'not-a-date', 12345, { a: 1 }])
  out(`checkQueueable(${JSON.stringify(v)}):`, () => hs.checkQueueableTimeConstraints({ queue: 'default', scheduleConfig: task.schedule[0], stats: stats(v), taskConfig: task }))
const calls = []
const mkReq = (forged, pending) => ({ payload: {
  config: { jobs: { tasks: [task] } },
  db: {
    findGlobal: async () => { calls.push('findGlobal'); return { ...forged } },
    count: async () => { calls.push('count'); return { totalDocs: pending } },
    updateGlobal: async ({ data }) => { calls.push('updateGlobal:' + data.stats.scheduledRuns.queues.default.tasks.expireEditRecovery.lastScheduledRun.slice(0, 4)) },
  },
  jobs: { queue: async (a) => { calls.push('jobs.queue waitUntil=' + a.waitUntil?.toISOString()); return {} } },
} })
for (const [label, v, pending] of [['invalid, pending job', 'not-a-date', 1], ['2099, pending job', '2099-01-01T00:00:00.000Z', 1], ['2099, empty queue', '2099-01-01T00:00:00.000Z', 0]]) {
  calls.length = 0
  try { const r = await hs.handleSchedules({ queue: 'default', req: mkReq(stats(v), pending) }); console.log(label, '->', JSON.stringify({ q: r.queued.length, s: r.skipped.length, e: r.errored.length }), calls) }
  catch (e) { console.log(label, '-> handleSchedules THROWS:', e.message, calls) }
}
// Mirrors the autoRun callback shape in payload/dist/index.js:244-268 (handleSchedules, then run; croner catch).
let ran = 0, caught = 0
const c = new Cron('* * * * * *', { paused: true, protect: true, catch: () => { caught++ } }, async () => {
  await hs.handleSchedules({ queue: 'default', req: mkReq(stats('not-a-date'), 0) })
  ran++ // stands in for `await this.jobs.run(...)`
})
process.on('unhandledRejection', (e) => console.log('UNHANDLED', e.message))
await c.trigger(); await new Promise((r) => setTimeout(r, 50))
console.log('autoRun shape with invalid stats: run reached =', ran, ', croner catch fired =', caught)
c.stop()
```

Output (Node 22.22.0, 2026-10-24):

```text
checkQueueable("2026-10-24T03:20:00.000Z"): 2026-10-25T03:15:00.000Z
checkQueueable("2099-01-01T00:00:00.000Z"): 2099-01-01T03:15:00.000Z
checkQueueable("not-a-date"): THROWS Invalid ISO8601 passed to timezone parser.
checkQueueable(12345): THROWS CronDate: Invalid type (number) passed to CronDate constructor
checkQueueable({"a":1}): THROWS CronDate: Invalid type (object) passed to CronDate constructor
invalid, pending job -> handleSchedules THROWS: Invalid ISO8601 passed to timezone parser. [ 'findGlobal' ]
2099, pending job -> {"q":0,"s":1,"e":0} [ 'findGlobal', 'count', 'updateGlobal:2026' ]
2099, empty queue -> {"q":1,"s":0,"e":0} [ 'findGlobal', 'count', 'jobs.queue waitUntil=2099-01-01T03:15:00.000Z', 'updateGlobal:2026' ]
autoRun shape with invalid stats: run reached = 0 , croner catch fired = 1
```

The last line uses the real croner `catch` and `protect` options. Its callback body mirrors, rather
than imports, the Payload autoRun closure, because that closure is private to `BasePayload`. The
ordering it mirrors is quoted from `index.js:244-268`.
