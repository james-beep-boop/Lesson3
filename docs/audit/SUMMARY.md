# Lesson3 v1.07 audit progress

**Incomplete audit — working report.** Current source baseline is
`bd5f07863a150cd51245b9c942502efa19d4014d` on main, with the same product source as release v1.07
(`69dd7d2ec1f3d8b9e78bff8c7f0892cdf41a2234`). Three previously known authentication findings
are accepted after current source/control rechecks: one Medium and two Low. They were explicitly
deferred in DECISIONS 2026-10-25; none is counted as newly discovered.
The operator selected a sole Codex auditor, audit only, no exclusions, Spark testing, and GitHub
publication. Independent cross-family review is waived and is not claimed.

## Accepted findings and priority

| Priority | Finding | Severity | Evidence and practical limit |
|---|---|---|---|
| P1 | [F-C23-001: shared sign-in budget exhaustion](findings/C23-auth-current.md) | Medium | 1,005 distinct-address attempts in 2.172 s at concurrency four blocked valid teacher and administrator sign-ins. Existing sessions and the separate reset bucket still worked. |
| P2 | [F-C23-002: targeted account budget exhaustion](findings/C23-auth-current.md) | Low | Twenty victim-address attempts blocked their valid login while another administrator could sign in. Requires the victim address; existing sessions work. |
| P2 | [F-C23-003: login account enumeration](findings/C23-auth-current.md) | Low | Nine paired timing observations and the sixth-attempt locked-account message revealed registration. Account-presence inference, not recovered credentials. |

These are locally reproduced on production builds of the isolated worker stack. Shared deployment
revision, edge mitigations and delivery parity remain unverified; no independent model confirmation
is claimed. Recommended work: a safe authentication-load-control redesign for F-C23-001/002, then
public failure/hash-work normalization for F-C23-003 under those controls. Preserve bounded hash
work, legitimate recovery and trusted proxy identity. An edge limiter alone does not prove protection
unless its configured budgets prevent exhaustion. No fixes were implemented.

## Candidate outside accepted totals

[F-C70-001: restore cache-deletion errors are masked](findings/C70-ops.md), provisional Medium,
reproduced against the exact helper with a permissions fault and writable positive control.

This candidate requires a filesystem failure and retained readable cache entries during restore or
undo. It is not a demonstrated default-deployment failure. The current code continues after the
deletion error; cache keys reuse numeric version IDs across database replacements. Full-stack impact
validation is pending. No product fix was made.

## Evidence and scope

- [Current manifest](manifest-current.md): all **888 tracked files**, with provisional chunk routing.
  Inventory is not coverage. Complete component review remains pending.
- [Historical change inventory](scans/change-sweep-2026-10-25.md): **62 changed paths**, including
  28 application-source paths, since the earlier audit's `d3714a5` baseline.
- [Reconciliation](continuation-2026-10-25.md): earlier reports, candidates and fixes are kept distinct
  from current-source evidence. The three authentication findings were revalidated; four
  other candidates have fixes present in current source, with current regression/parity checks pending.
- [Operations review](C70-ops.md): **95 mock/kernel-lock checks**, updater transactions and
  **104 real-stack restore interruption/recovery checks** passed. Successful restoration does not
  cover the candidate's failed-deletion path. All runtime data was synthetic and disposable.
- [Current baseline](scans/current-baseline.md): lint, types, format, **1,867 unit tests** and
  **339 integration tests** passed; production/migration builds passed. Complementary HTTP runs
  cover **479 passing cases**, with two no-SMTP cases still skipped; the original full run failed
  on PDF harness configuration. Five moderate dependency entries need reachability triage.
- [Static scan inventory](scans/static-current.md): npm outdated/ls, suppression, shell and workflow
  action inventories recorded. All 14 workflow action references are SHA-pinned. Knip, jscpd,
  gitleaks, shellcheck, hadolint and stylelint are unavailable in this worker, so C10–C15 remain partial.
- [Disposable target proof](C01-current-target.md): reset, reseed, synthetic restore, eight verified
  role logins, unverified-user refusal and internal reset-mail capture passed.
- [Native authorization/privacy](C22-current-native.md): 70 observations and a corrected **194-check**
  matrix passed; retained snapshots and Official-plan fingerprints stayed equal. Sparse validation
  failure was distinguished from reaching the immutable-write guard.
- [Save boundary](C30-current-save.md): **118 checks** passed across both scopes, field split,
  resources/provenance, patch versions and stale/shape guards; eight candidates cleaned up.
- [Controlled save races](C31-current-races.md): two editing teachers and one teacher in two
  sessions both reached an observed PostgreSQL lock barrier; four successful saves retained prose,
  authors and monotonic versions; historical-row comparisons and cleanup passed. Full C31 pending.
- [Ingest/parser review](C40-current-ingest.md) and [input corpus](C41-current-corpus.md):20 complete
  source files read, contract CLI16/16,54 synthetic files across26 groups,35 web requests and29
  static-extractor cases passed; the real CLI ingest entry point imported and cleaned one marked
  bundle. Honest declared body ceilings returned 413 on upload, preview and
  save-as-new; chunked oversized preview/save/upload bodies returned the application’s 413/400 caps;
  monitored205MiB expansion refused; lesson/taxonomy state restored.
  Approved taxonomy and actual PostgreSQL fault rollback passed; the Chromium preview, DOCX export
  and Mailpit attachment sink probe passed with script-like prose rendered as inert text. Omitted or
  public proxy body posture, editor/PDF/WebKit coverage and further concurrency remain open. Observations are not
  new findings.
- [Resolved surface inventory](scans/surface-current.md): 16 collections, two globals, four root
  endpoints and five tasks. All **43 catalog chunks** remain tracked in [progress.md](progress.md).

Remaining current-baseline browser/configuration checks, comprehensive scans, full role/action attacks, ingest/export
drills, browser/accessibility/performance checks, deployment parity, final risk reconciliation and
the final remote-main change sweep are outstanding. Historical results are not substituted for these.
No clean-audit conclusion or complete risk count is warranted.

## Next execution

Continue the first-wave ingest, version/concurrency and remaining permission attacks. Validate the
restore candidate on a separate target alongside eligible work, then finish remaining baseline
checks and catalog chunks, recording exact
source ranges, commands, outcomes and gaps. Save a checkpoint after each bounded group so subscription
limits do not lose progress. Replace this working summary with the complete prioritized handoff
when coverage and evidence satisfy the audit contract.
