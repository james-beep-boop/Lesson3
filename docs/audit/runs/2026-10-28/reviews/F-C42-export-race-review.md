# Sonnet review — cold export enqueue race

## Disposition: **Retain, severity Low, with two amendments**

I'm reviewing only the supplied source and evidence. I ran nothing and searched nothing.

### Causation: well supported for the mechanism

The chain follows directly from the supplied code:

1. Two or more cold prepares for the same `{versionId, kind}` pass `findPendingExportJob` (`exportVersion.ts:128`) before any insert commits.
2. The losing `jobs.queue` insert waits on the unique index, then fails with PG `23505` on `payload_jobs_generate_version_artifact_pending_unique`.
3. The installed `handleUpsertError` takes `caughtError.cause`, matches `23505`, and throws a fresh `ValidationError`. That error carries no `cause`, no `constraint` and no `code`, only `{message, path, tableName}`.
4. `isPendingExportJobConflict` (`generateVersionArtifact.ts:156-168`) looks for `code === '23505'` and `constraint === INDEX` anywhere along the `.cause` chain. The converted error has neither, so it returns false, the catch at `exportVersion.ts:137` rethrows, and Payload serializes a `ValidationError` as a 400.
5. The empty field name in `"The following field is invalid: "` is consistent with this. The adapter's detail regex `Key \(([^)]+)\)=\(([^)]+)\)` should not match an expression-index detail such as `Key ((input ->> 'versionId'::text), ...)=(...)`, so `path` stays null. This is my inference from the supplied source. The actual PG `detail` string was not supplied.

The controlled run supports this well:

- `pg_stat_activity` confirmed all six inserts were waiting before the barrier released, so the race window was held open rather than assumed.
- The outcome split was exactly one 202 per kind and four 400s, which is what the mechanism predicts.

Two further observations:

- The recovery branch at `exportVersion.ts:137-142` is effectively dead for this path under the installed adapter. The error shape it handles is the one the adapter has already unwrapped and discarded.
- The unit test at `exportJobDedupe.spec.ts:28-31` feeds `{cause: {code, constraint}}`, which is the pre-conversion driver shape. It passes while the real path fails, which matches your note that it does not establish native converted-error handling.

### Severity: Low is appropriate

**Impact is limited:**
- It affects only POST `/:id/export` on a cold path, with concurrent same-version, same-kind requests and no pending job or cached artifact. That covers double-click, two tabs, and poll races.
- The loser gets a misleading 400 for what is really a coalescable conflict. A retry should hit the `isExportReady` short-circuit or find the pending job, but that is inferred from the code, not shown in the evidence.
- It is a transient availability and UX defect, plus 4xx misclassification that could add noise to monitoring.
- No duplicate jobs, data loss, or auth bypass is claimed, and none is supported by the evidence.
- The ordinary 12-request probe passed with two shared job ids and 12 completed deliveries, so in realistic traffic the window is narrow and intermittent.

**It should not go lower than Low.** This is a defect in the fix itself, since the new coalescing path does not work as designed. Its effect is observable and reproducible, even if the lock-based reproduction widens the window artificially.

### Amendments

1. **Index-safety claim is provisional.** "Unique index prevents duplicate jobs" currently rests on the index definition and the 2-of-6 success count. Your second run (post-DB count and snapshot comparison) is still in progress. Until it lands, record this as "expected, pending confirmation" rather than established.
2. **Earlier intermittent 400s.** Attribute them to this mechanism only if their response bodies matched the same empty-path `ValidationError` shape. Otherwise keep them as separate, unexplained observations. The rate-limit 429 is already correctly kept separate.

### Scope statement for the finding

- **In scope:** the prepare endpoint's concurrent-coalescing recovery branch, and the unit test's inability to detect its failure.
- **Out of scope or not claimed:**
  - Index correctness, pending the second run.
  - The status and GET paths.
  - Different version or kind combinations.
  - Capacity or rate-limit behavior.
  - Whether the installed adapter version matches the lockfile, since only the supplied source text was reviewed.
  - The `create` call site that invokes `handleUpsertError`, which was not supplied. I inferred that call from the observed 400 body.

## Coordinator response

Retain Low. The second controlled run subsequently confirmed six blocked native inserts, two pending jobs after release, unchanged original snapshot, two202s and four400s. The unexplained first-run400s remain separately qualified because that first harness did not record bodies. The adapter source was SHA-256 matched against the fixed-source migration image built from the same builder/lockfile; the running Next app bundles its dependencies rather than retaining loose copies of those modules. No duplicate-job/data-loss/authorization defect is claimed.
