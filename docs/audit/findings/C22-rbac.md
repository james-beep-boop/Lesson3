# C22 — Authorization candidates

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. These are candidates, not accepted totals.
Raw credentials, cookies, traces, fixture IDs and operation journals remain outside Git.

## F-C22-001 — A baseline Teacher can overwrite system job-scheduling statistics

- **Severity:** provisional Medium. **Category:** authorization / scheduling integrity.
- **Evidence scope / confidence:** locally reproduced write and readback, high confidence;
  downstream scheduling decision reproduced in installed code, medium confidence in complete
  availability impact. No shared deployment reproduction.
- **Known status:** new candidate. The earlier native-job lockdown (DECISIONS 2026-06-23) covers
  job rows/run/queue/cancel, but does not mention this generated global.
- **Audit / review status:** candidate, author-verified/unreviewed; full security/integrity cycle
  required. Author: coordinator (Codex), 2026-10-24. Claude critique and author response pending.
  No product fix, accepted finding or fix disposition yet.
- **Revision / environment:** pinned source above; Payload 3.91.0, Node 24.22.1, production-mode
  disposable ARM64 stack, Playwright 1.64.1, synthetic verified Teacher with no assignments,
  internal SMTP, public discovery disabled. One worker, four CPUs / 8 GiB, no retries.

### Expected and actual

SPEC §8 gives a baseline Teacher viewing/export and ordinary user workflows, not system scheduling
administration. The accepted native-job lockdown explicitly reserves external job control to Site
Administrators and blocks direct job-row writes. A non-administrative Teacher should therefore not
be able to replace the scheduler's internal metadata through a second REST surface.

`POST /api/globals/payload-jobs-stats`, authenticated as that Teacher, returned **200**. A separate
Site-Admin read confirmed the harmless `auditProbe` marker persisted in `stats`. The test restored the
original statistics and verified their values; a separate database read found no remaining marker.
The global's ordinary update timestamp advances during this controlled write/restore.

The complete framework batch returned **19 passed / one failed**, exit 1. The failing assertion
expected 403 for this Teacher write; it remains red against the unfixed baseline. This is distinct
from earlier harness-status corrections. All eight preference cleanups and the synthetic lock cleanup
completed, and full native lesson/plan/Official-pointer/settings hashes remained equal.

### Source chain

1. `app/src/payload.config.ts:174` registers tasks and restricts native job controls and job-row
   CRUD (`jobs.access`, `jobsCollectionOverrides`). It provides no corresponding global restriction.
2. Installed `payload/dist/config/sanitize.js:285` appends `getJobStatsGlobal(config)` for scheduling.
   `payload/dist/queues/config/global.js:5` returns a hidden global with one JSON `stats` field and no
   access override. Sanitized read/update use authenticated `defaultAccess`. Hiding it from admin
   navigation does not close its REST operations.
3. `payload/dist/queues/operations/handleSchedules/index.js:26` reads this global through the database.
   `checkQueueableTimeConstraints` at line 82 uses
   `stats.scheduledRuns.queues[queue].tasks[taskSlug].lastScheduledRun` to calculate `waitUntil`.
4. `app/src/jobs/expireEditRecovery.ts:39` configures the real `expireEditRecovery` task daily at
   03:15. Its retention policy is SPEC §5's 30-day draft expiry.

### Scheduling consequence and limits

A separate **network-disabled, database-free** probe invoked the installed
`checkQueueableTimeConstraints` with that actual task slug/cron. Normal metadata produced
`2026-10-24T03:15:00.000Z`; a forged last-scheduled date produced
`2099-01-01T03:15:00.000Z`. It exercised the real scheduling function, not a reimplementation.
No future date was written to the running target and no expiry job was deliberately delayed.
A second offline call with an invalid last-scheduled date threw an ISO8601 parsing error in the
installed function. No invalid date was written to the running target; the full cron/runner error
handling and availability consequence remain follow-up work, not an observed service outage.

Already queued work is not rescheduled by this metadata write. The scheduler's default queue guard
can skip a new schedule when a pending job exists, and its after-schedule hook rewrites the recorded
last-scheduled time even when skipped. A lasting far-future queue therefore depends on timing the
write when that guard permits a new job; the complete empty-queue/autorun consequence remains to be
reproduced. Do not claim a single arbitrary POST immediately stops all exports or expiry. The direct
unauthorized mutation is established independently of that larger consequence.

### Reproduction and proposed remediation

On a C01-approved disposable target, run the audit runner with:

```text
node --no-deprecation --import=tsx/esm node_modules/@playwright/test/cli.js test
  --config=tests/audit/playwright.framework.audit.config.ts
  --grep "A baseline teacher cannot write system job statistics"
```

Use the dedicated private fixture, storage-state and output mounts described by the tools README.
The spec snapshots the original stats, submits a fresh marker as Teacher, verifies readback through
a separate Site-Admin context, restores the values in `finally`, and compares native content hashes.
Private run artifacts retain the exact commands, request statuses, snapshot and failed trace.

Constrain the generated global's REST update access in the final resolved configuration, preserving
trusted scheduler database writes. Choose its read policy separately; this finding does not require
changing read visibility. Validate the supported configuration seam before implementation and add
wire coverage that remains red against this baseline, plus a real scheduled-task control proving
normal expiry can still queue and run. No product decision is needed to remove baseline Teacher
scheduling-write authority; Site-Admin/statistics visibility is a separate policy question.

**Related:** C21 Q02, C5.7/C5.13, C22 framework report, I-C84-001 (draft), DECISIONS 2026-06-23.

## F-C22-002 — A baseline Teacher can forge another user's editing lock

- **Severity:** provisional Low. **Category:** authorization / workflow integrity.
- **Evidence scope / confidence:** locally reproduced collection mutation and real Chromium editing
  modal, high confidence in the bounded effect. No deployment reproduction or data-loss claim.
- **Known status:** new candidate, promoted from lead L-C22-001 after the browser control.
- **Audit / review status:** candidate, author-verified/unreviewed; full security/integrity review
  cycle required despite the Low label. Author: coordinator (Codex), 2026-10-24. Claude critique and
  author response pending. No product fix or accepted disposition.
- **Revision / environment:** same pinned source/isolated production stack as F-C22-001; Chromium,
  Playwright 1.64.1, synthetic users and native lesson-version form. One worker, no retries.

### Expected and actual

SPEC §2/§8 excludes a baseline Teacher from content administration and editing. A user with no
editing capability should not be able to fabricate another account's editor-presence state or
interfere with an authorized teacher's editing workflow through an internal collection.

The framework experiment recorded Teacher `POST /api/payload-locked-documents` returning **201**
with a client-supplied Site-Admin holder. An unrelated baseline Teacher then changed that record and
deleted it, both **200**. That first experiment used a synthetic global name and established only
record effects; the follow-up tested the real lesson-version UI.

The Chromium follow-up first created a legitimate peer-author lock and confirmed the native
**Document locked** dialog appeared to another authorized teacher. It then created a lock on the
same real version as a baseline Teacher, claiming the Site-Admin holder. The authorized teacher saw
the same editing-warning dialog. The negative assertion remained red, exit 1. Both fixture lock rows
were deleted and independently absent from the database; native content/Official-pointer hashes
were identical before/after. The modal did not display the claimed holder's email in either case.

### Source, impact and limits

`app/src/payload.config.ts` retains Payload's generated lock collection. Installed
`payload/dist/locked-documents/config.js:49` assigns authenticated `defaultAccess` to create/read/
update/delete; its `user` relationship accepts caller data without an ownership stamp or target-editing
gate. `@payloadcms/ui/dist/elements/DocumentLocked/index.js` renders the resulting presence warning.

The observed effect is a false editing interruption/holder attribution. The dialog offers **Take
over**, so an authorized teacher can recover; the application's save-as-new and immutable snapshots
remain separate protections. No arbitrary lesson write, account-role change, lasting lockout, email
disclosure or saved-content loss was demonstrated. This bounded nuisance is why the provisional
impact is Low rather than treating native locking as the version-integrity authority.

### Reproduction and proposed remediation

`app/tests/audit/rbac-lock-ui.audit.spec.ts`, selected by `playwright.lock.audit.config.ts`, contains
the legitimate-owner control, forged-owner request, real browser observation and cleanup. Use the
fresh private states saved by the framework batch at the documented private mount. The test closes
the browser, deletes only its recorded rows, verifies 404, then compares the native snapshot/pointer
hash. Private screenshots and trace retain the actual dialog; they are not repository artifacts.

If confirmed, bind client lock ownership to the caller and scope native lock mutation to callers
authorized to edit the target. Preserve legitimate peer takeover and trusted framework paths; do not
blindly disable locks or treat them as a substitute for server-side version integrity. Check generic
bulk paths and non-version targets before implementation. Add a red-before/green-after browser
regression with the legitimate peer control retained.

**Related:** C21 Q01, C5.13, I-C84-001, DECISIONS 2026-06-28 native-lock rationale (historical editing
model; immutable save-as-new is now the content boundary).
