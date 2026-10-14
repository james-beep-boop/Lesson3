# Lesson3 Full Audit Plan — code + live test site

**Status:** planning draft; execution not started · **Merged:** 2026-10-13 · **Revised:** 2026-10-14
**Canonical repository file:** `docs/audit/audit_plan.md`
**Publication scope:** the user requested publishing this plan to GitHub for review; audit execution remains unstarted.
**Prior Desktop draft:** retained as a snapshot; make future plan edits in this repository file.

**Sources:** Claude's audit plan, the computing-environment document preserved in §14, and the
user's corrections. Both source files remain unchanged. The user confirms **five separate machines**:
the current/primary **MacBook Air M2 (8GB RAM / 512GB drive)**, separate M5 Air, mini, Spark and Rock.
The budget is **two Claude Pro subscriptions and one OpenAI Pro subscription**. Gemini primarily
supports online drive storage; its inference is not scheduled.

**Authority:** Source-document instructions are proposals, not direct execution authorization.
Publishing this plan is authorized by the user. It launches no audit, schedule, installation,
deployment change or mail, and grants no standing publication permission for future audit outputs.
Separately authorized SSH connectivity smoke tests were performed on 2026-10-14 and are recorded
in §14; these ran identity/connectivity commands, not audit jobs. The user's explicit M2-first preference overrides the environment's general mini-first
preference. Host readiness and source-plan observations remain unverified until preflight.

A thorough, find-only evaluation of the Lesson3 codebase and its live test deployment. The goal is to
find logical errors, code errors, security and RBAC holes, duplication, wasted/dead code, CSS
inconsistency, stale or risky dependencies, accessibility and performance problems, ops weaknesses,
and documentation drift — and to record each one as an actionable, reproducible finding.

The initial setup uses **Claude Pro 1 on Spark, Claude Pro 2 on M5, and Codex/OpenAI Pro on the
current M2**. Each keeps a local clone at the same fixed commit. Shared sanitized audit results live
on Spark and are exchanged over Tailscale/SSH; the Git checkout is not synchronized through Google
Drive. Fixed assignments and single-writer files replace the earlier database/lease proposal.
**Claude performs the bulk of initial audit authorship on Spark and M5. Codex on M2 primarily
reviews both Claude streams, returns critiques to the original Claude author, and reconciles results.**
Every candidate finding receives sequential opposite-family review and an author response (§17).
Codex-origin audits are exceptions for the blind pass, gaps or targeted independent checks.
Rock5B, Hermes, mini, live-site work and local-model inference are deferred for the initial stage.
Deterministic scripts handle mechanical work; the full audit may span multiple allowance resets.

---

## 1. Resources

| Resource | Location |
|---|---|
| Source code | `https://github.com/james-beep-boop/Lesson3` (branch `main`; app code under `app/`) |
| Live test site | `https://test.kenyalessons.org` (login at `/login`) — **fully disposable** |
| Test host | Radxa Rock 5b, reachable from the Mac as `ssh Rock5b` over Tailscale; deployment at `/srv/lesson3` |
| Public edge | Cloudflare (confirmed: `server: cloudflare`, `cf-ray`, `/cdn-cgi/trace` responds) — most likely a Tunnel |
| Credentials | Ignored, untracked `app/.env.audit` on live-test workers — **never committed** (see §4) |
| Primary controller | Current M2 Air, 8GB / 512GB; hostname to verify |
| Claude Pro 1 executor / shared-results host | Spark, 128GB; `jhm-spark.tail49b05.ts.net`; tool compatibility to verify |
| Claude Pro 2 executor | M5 Air; `jamess-m5-macbook-air.tail49b05.ts.net`; RAM/storage to verify |
| Codex/OpenAI Pro executor / coordinator | Current M2 Air, 8GB / 512GB |
| Deferred resources | Mac mini, Rock5B and Hermes; retain their inventory for later live-audit stages |
| Reasoning accounts | Claude Pro 1 (`cc1`), Claude Pro 2 (`cc2`), OpenAI Pro (`cx`) |
| Optional storage | Gemini-associated drive; sanitized report backup only if later selected |

See §14–17 for allocation, simple execution, remaining choices and sequential review.
Initial work is code/static scans/isolated local tests. Live/deployment-specific checks remain pending;
finishing this first stage is not completion of the full audit.

### Test accounts (existing)

| Role | Login | Notes |
|---|---|---|
| Site Admin | `siteadmin@lesson3.local` | global `roles: ['siteAdmin']` |
| Subject Admin | `subjectadmin@lesson3.local` | `subjectAdmin` assignment on some subject-grade ("SG-A") |
| Teacher with editing access | `editor@lesson3.local` | `editor` assignment on some subject-grade |
| Teacher | `teacher@lesson3.local` | no assignments (view/export only) |

Passwords are in `app/.env.audit` as `AUDIT_SITEADMIN_PASSWORD`, etc. Chunk C00 records which
subject-grade each account is actually assigned to.

### Test accounts (requested from operator — see §7)

| Login | Role / assignment | Why |
|---|---|---|
| `teacher2@lesson3.local` | Teacher, no assignments | Teacher-vs-teacher IDOR (favorites, messages, recovery rows) |
| `editor2@lesson3.local` | Teacher with editing access on **SG-B** (different subject-grade from `editor@`) | Cross-subject-grade write attempts |
| `subjectadmin2@lesson3.local` | Subject Admin on **SG-B** | Cross-subject-grade admin attempts; grant/transfer abuse |
| `multirole@lesson3.local` | Teacher with editing access on SG-A **and** Subject Admin on SG-B | Mixed-role edge cases in access functions |
| `siteadmin2@lesson3.local` | Second Site Admin | Admin-vs-admin actions, self-demotion, last-admin protection |
| `unverified@lesson3.local` | Created via public signup, email **not** verified | Verification-bypass tests |

Further throwaway accounts are created by agents themselves through the Site Admin panel, always
named with the agent's prefix (see §6).

---

## 2. Relationship to existing repo documents

This audit builds on, and must not duplicate, prior work. Chunk C00 reads these (headers and
findings sections only, to save tokens) and builds `docs/audit/known.md`, a list of already-known or
deliberately-decided issues:

- `docs/CODE-REVIEW-PLAN.md` — the earlier Pro-budgeted, unit-by-unit code review plan (written
  2026-07-22, never started). **This audit absorbs and supersedes it.** Its best parts are folded in:
  per-file persistence, verify-before-recording with a separate leads list, no subagents, the
  coverage manifest, cycle-base SHA tracking, the risk-first unit sequence (re-sized in Phase 5 because
  the codebase has roughly tripled in places since it was written), the `live-risk / known-planned /
  future` classification, the reconciliation matrices, and the vertical-flow capstone. C00 records
  supersession in `docs/audit/known.md`; leave the older file unchanged.
- `docs/DEPENDENCY-REVIEW-2026-08-25.md`, `docs/DEPENDENCY-REVIEW-2026-09-19.md` — report only
  *deltas* since the latest review.
- `docs/DECISIONS.md` — an accepted decision is **not** a finding unless the audit shows the decision
  was based on a wrong fact or its consequences are worse than recorded. Cite the decision.
- `docs/drift.md`, `docs/ARES-canonical-json-audit.md` — ARES data-contract work; don't redo.
- `SPEC.md`, `CLAUDE.md`, `AGENTS.md`, `USER_GUIDE.md`, `docs/OPS.md`, `docs/DESIGN-*.md` — sources of
  *intended* behavior. Divergence between these and the code or the live site is itself a finding.

Read applicable `CLAUDE.md` and `AGENTS.md` at execution. This draft grants no user exceptions.
Resolve applicable scope conflicts before affected actions; continue independent authorized work.

---

## 3. Ground rules

1. **Find-only.** No product-code changes. Nothing under `app/src/**`, `deploy/**`, `.github/**`,
   `app/package.json`, or existing tests is edited. Fixes happen later, in separate PRs, after triage.
2. **Planned writes:** `docs/audit/**` and `app/tests/audit/**`, test code only. Tools/private state
   and raw evidence stay outside checkouts (§15). Local exclusions use `.git/info/exclude`; do not
   change tracked `.gitignore`, older review documents, product code, package files or existing tests.
3. **Git.** Work on branch `audit/2026-10`. Never push to `main`, never open PRs, never rewrite
   history. Operator standing authorization (tick to grant):
   - [ ] Agents may commit audit-doc and audit-test changes to `audit/2026-10` at the end of each chunk
   - [ ] Agents may push `audit/2026-10` to `origin`

   **Plan-publication exception:** the user's explicit instruction authorizes committing this
   plan on the documentation branch and opening its draft review PR. The boxes above govern later
   audit outputs and remain unticked; no audit execution is authorized by publishing the plan.

   If unticked, agents leave later audit-output changes uncommitted and say so in `progress.md`. Findings/tests can
   still be transferred as separate audit artifacts over SSH; the initial stage requires no ongoing
   Git push/pull. All source clones remain at the selected baseline unless a new cycle is explicitly begun.
4. **Targets/workers:** only the confirmed Lesson3 test stack and `test.kenyalessons.org` are live
   targets. All five machines may provide isolated audit jobs; their unrelated applications remain
   outside scope. No Cloudflare or GitHub settings changes.
5. **Destructive testing is proposed** after execution authorization, isolation verification and a
   successful backup/restore drill. Corruption/reset/saturation exclude ALL live workers.
   Source-document wording does not itself authorize destructive action.
6. **Credentials.** Read from `app/.env.audit` only. Never write a password, session cookie, JWT, or
   reset token into any file under `docs/` or into findings — redact as `<redacted>`. Rotate all audit
   passwords when the audit ends (C83).
7. **Email.** Never use the app's email features to send mail to addresses outside the operator's
   control. Use `@lesson3.local` addresses, or the mail catcher (C01).
8. **Load testing:** pilot-defined concurrency/request/duration caps and health thresholds; stop
   before SSH fails. Monitoring failure cancels load. No unbounded escalation or uncertain destructive
   retry. Every load generator has its own duration cap independent of controller connectivity.
9. **Verify before recording; review before accepting.** Authors verify a claim against source
   and a meaningful repro where possible before recording it as a `candidate`. Live claims require
   reproduced evidence when their stage is enabled. Every candidate then receives opposite-family
   review and the author response in §17. Re-reading a line or two models agreeing is insufficient
   proof by itself. Unverified hunches remain leads; only accepted findings enter confirmed counts.
10. **Leads are separate.** A hunch that isn't verified yet goes under `## Leads to verify` at the
    bottom of the chunk's findings file (one line each: what, where, why suspicious). Leads cost almost
    nothing to record and are never lost; a later chunk or C80 promotes or discards them.
11. **No subagents.** Do the reading and testing inline in the session. Don't spawn parallel subagents
    or fan-out review commands inside one account — that's the fastest way to burn a Pro budget.
    (Running separate *executors* on separate accounts, per §6, is different and encouraged.)
12. **Tests travel with code.** When reading a source file, read its tests in the same chunk; there is
    no separate "read all the tests" pass (C72 handles coverage gaps and test quality).
13. **Mandatory sequential review.** Claude-origin findings go to Codex; Codex-origin findings go
    to Claude. Preserve original report, critique and author response in separate files. No automatic
    acceptance/rejection by majority vote or model deference. Explicit unresolved status is allowed.
14. **Understand components, not just files.** For each major component, document its purpose,
    entry points/dependencies, intended invariants, trust boundaries and observed state. Link source
    coverage/tests and evidence; distinguish expected behavior from verified implementation (§20).
15. **Bounded autonomous progress.** Continue assigned authorized investigations without repeatedly
    asking whether to proceed. Persist evidence/checkpoints, pursue concrete high-value leads within
    scope, and record blockers. Quota or prerequisite pauses preserve state; independent eligible
    work can continue. Stop when the applicable coverage/review/report criteria are met (§20).
16. **No indefinite re-reading.** Repeat tests/measurements only for a concrete reproduction,
    meaningful new evidence, changed conditions or unresolved reliability concern. Baseline results
    are reusable at the same source/runtime/fixture revisions; record legitimate rerun reasons.

---

## 4. Credentials file (untracked; never committed)

Create `app/.env.audit` only on machines assigned live-test access (already git-ignored by the repo's `.env.*` rule —
verify with `git check-ignore app/.env.audit`):

```
AUDIT_BASE_URL=https://test.kenyalessons.org
AUDIT_SITEADMIN_EMAIL=siteadmin@lesson3.local
AUDIT_SITEADMIN_PASSWORD=...
AUDIT_SUBJECTADMIN_EMAIL=subjectadmin@lesson3.local
AUDIT_SUBJECTADMIN_PASSWORD=...
AUDIT_EDITOR_EMAIL=editor@lesson3.local
AUDIT_EDITOR_PASSWORD=...
AUDIT_TEACHER_EMAIL=teacher@lesson3.local
AUDIT_TEACHER_PASSWORD=...
# added after operator creates them (§1):
AUDIT_TEACHER2_EMAIL=teacher2@lesson3.local
AUDIT_TEACHER2_PASSWORD=...
AUDIT_EDITOR2_EMAIL=editor2@lesson3.local
AUDIT_EDITOR2_PASSWORD=...
AUDIT_SUBJECTADMIN2_EMAIL=subjectadmin2@lesson3.local
AUDIT_SUBJECTADMIN2_PASSWORD=...
AUDIT_MULTIROLE_EMAIL=multirole@lesson3.local
AUDIT_MULTIROLE_PASSWORD=...
AUDIT_SITEADMIN2_EMAIL=siteadmin2@lesson3.local
AUDIT_SITEADMIN2_PASSWORD=...
AUDIT_UNVERIFIED_EMAIL=unverified@lesson3.local
AUDIT_UNVERIFIED_PASSWORD=...
AUDIT_SSH_HOST=rock5b.tail49b05.ts.net
AUDIT_AGENT=cc1            # this executor's prefix, see §6
# AUDIT_MAILPIT_URL=http://rock5b.<tailnet>.ts.net:8025   # if the mail catcher is set up (C01)
```

---

## 5. Directory layout

```
docs/audit/
  audit_plan.md          ← this file
  progress.md            ← controller-generated status and handoff mirror
  known.md               ← pre-existing/decided issues (C00), used to de-duplicate
  manifest.md            ← every tracked file → its Phase 5 unit or an exclusion class (C00)
  components.md          ← coordinator-consolidated component understanding map (§20)
  scans/test-results.md  ← existing-suite results, environment, evidence and unrun/gap reasons
  FINDINGS.md            ← final index (C83)
  SUMMARY.md             ← executive summary + fix roadmap (C83)
  findings/C<nn>-<slug>.md   ← author-owned candidate report, including revisions and withdrawals
  reviews/<ID>-<reviewer>.md ← opposite-family critique; one writer per file
  responses/<ID>-<author>.md ← author recheck, evidence and outcome; one writer per file
  scans/                 ← condensed scan summaries (committed)
  scans/raw/             ← sanitized scans only; private raw evidence outside checkout
  tools/                 ← audit scripts (run-scans.sh, reset-test.sh, summarizers, configs)
  corpus/                ← generated malicious/edge-case upload files (C41) — git-ignored if large
app/tests/audit/
  playwright.audit.config.ts
  helpers/               ← role login, API client, matrix runner
  *.audit.spec.ts
```

---

## 6. Simple coordination for the initial stage

1. **Three executors:** `cc1` = Claude on Spark; `cc2` = Claude on M5; `cx` = Codex on M2.
   Spark hosts sanitized shared results; M2 coordinates assignments/progress. Rock, Hermes, mini
   and local inference remain deferred.
2. **Local source clones:** select one base SHA and check it out separately on each computer.
   Keep source read-only for the audit. Dependencies, builds, private environments, caches and test
   databases stay local. No shared checkout or Google Drive synchronization of .git/source/runtime.
   Directly transfer new audit tests when another worker needs them; hash/version those artifacts
   separately from the unchanged source baseline.
3. **Claude-first ownership:** Codex prepares small ordered lists, with one owner per chunk/subchunk.
   Assign the bulk of original source/static/local auditing to Claude on Spark (backend, integrity,
   scans and heavier compatible tests) and Claude on M5 (frontend, browser and docs).
   Codex's default work is critique of both streams, author-response follow-up, progress and synthesis.
   Reserve Codex original work for C82's fresh blind pass, uncovered areas or targeted independent checks.
   Do not assign a third equally large original-audit stream to Codex. Exact IDs/splits are fixed in C00;
   use cross-coverage notes for overlaps rather than duplicated reading. Within an owned assignment,
   choose the next concrete high-value investigation (§20); route cross-owner leads to the coordinator
   rather than silently taking another worker's task or expanding scope.
4. **Single-writer shared files:** each worker writes its own status, checkpoint, original report,
   critique or response. Only the M2 coordinator updates overall assignments, progress and confirmed
   index. Read each other's completed files; do not edit another worker's report. Give reviewer and
   author separate files, including when both files are on the same host.
5. **Publication over Tailscale/SSH:** use a dedicated results directory on Spark, provisioned later.
   Publish via a temporary upload then same-host atomic rename; mark a stage ready only after its
   files are complete. Readers ignore partial uploads. Work locally during disconnection and publish
   when reconnected. No Git push/pull is necessary to share reports.
6. **Small handoffs:** a packet includes run/chunk/finding IDs, source SHA, referenced code/tests,
   sanitized repro/evidence, exact commands, relevant runtime/tool/fixture conditions, scope and
   interpretation. Persist significant evidence immediately before further investigation (§20).
   Review cites independently inspected evidence, not just agreement. Comments/questions have
   separately owned files; the component map and consolidated report remain coordinator-owned.
7. **Per-account session limits:** at most one session per subscription account; source auditing can
   run in parallel across the three accounts after the pilot. The stages for any individual finding
   remain sequential. A paused account leaves its next review stage pending; it cannot be bypassed.
8. **Bound review backlog:** initially at most two original chunks per Claude worker may await Codex
   review. Review ready Claude packets before assigning Codex another original audit. Each critique
   returns to its original Claude account, which rechecks and publishes a response. A targeted Codex
   follow-up is needed only for amended/disputed retentions (§17). If the reviewer backlog fills,
   Claude pauses new original chunks and handles responses, direct tests or other non-model work.
   Codex-origin exceptions still go to a designated Claude reviewer and return to Codex.
   Adjust caps from measurements; two Claude accounts are capacity, not independent model families.
9. **No initial coordination database, competing claims, distributed leases, network mounts or
   automatic failover.** Fixed lists and owned files suffice for code-only work. Verify a prior job
   has stopped before restarting an interrupted task. The later live stage needs a separate
   serialized schedule and reset/load exclusion policy before it is enabled.
10. **Independent blind pass remains C82:** fresh opposite-family session and source/tests/spec view
    without earlier reports/leads/known-issue summaries. It seeks missed issues. §17 reviews the
    validity of already-reported issues. Any new C82 candidates also undergo §17.

### Why this allocation

There are two separate Claude subscription allowances and one OpenAI allowance. Putting most initial
authorship on the two Claude executors lets both contribute, while reserving Codex capacity for the
independent critique that the user finds especially valuable. Keeping the author responsible for
rechecks preserves context and avoids repeating the original audit from scratch. Separate assigned
chunks and opposite-family review improve scrutiny without requiring a third full original pass.

This is a scheduling choice, not a claim that the providers have equal quotas or that two Claude
plans provide exactly twice the useful throughput of OpenAI Pro. Pilot the actual audit/review costs.
If Codex becomes the bottleneck, shorten Claude packets and pause new authorship at the backlog cap;
do not skip review or add paid API inference.

### Direct communication

SSH over the existing Tailscale network is sufficient for status probes and sanitized report/test
handoffs. M2 and M5 initiate connections to Spark's shared-results directory; Codex writes critiques
there, and the author reads them and publishes responses. Spark does not need to push into either
laptop, and a full mesh of reciprocal SSH access is unnecessary. M2 → M5 is useful for optional
status/runner checks. No new messaging platform, API service, network mount or private-key sharing
is required. A direct SSH connection alone does not schedule sessions or complete provider login;
the small runner, packet readiness and §17 review stages still provide that control.

Labels retain Hand (script), Light (routine judgment), Strong (security/logic), Cross (different family).
No subagent fan-out. Audit data prefixes remain as originally specified if the later live stage starts.

---

## 7. Setup checklist, separated by stage

### Initial code/static/isolated-test stage

- [ ] Verify Spark/M5/M2 identity, source paths, architecture, RAM/free disk, installed tools,
      noninteractive SSH and powered/sleep behavior. No initial Rock/mini/Hermes setup.
- [ ] Verify Claude account 1 on Spark, account 2 on M5, and OpenAI Pro on M2; paid fallback disabled.
- [ ] Preserve existing work, select one base SHA, prepare three local clones and per-executor lists.
- [ ] Verify project-pinned runtimes (original plan: Node `>=24.21.0 <25`). Inventory tools first.
      Keep heavy builds/browser/database work off the 8GB M2; use compatible Spark/M5 workers.
- [ ] Provision the private Spark results root and owned report/status/review/response directories.
      Verify partial-upload exclusion, publish/read handoffs and secret redaction.
- [ ] Pilot source audit → opposite-family critique → author recheck and disputed-outcome handling.
- [ ] Select personal allowance reserve, small session/backlog caps and stop/resume behavior.
- [ ] Preserve original Git authorization choices; no pushes/commits are needed for report exchange.

### Deferred live stage, before its affected chunks

- [ ] Confirm test-stack identity/isolation and deployed SHA; enable Rock access explicitly.
- [ ] Create the six extra test accounts in §1, identify SG-A/SG-B and provision private app credentials.
- [ ] Confirm noninteractive Rock access, mail capture, approved reseed procedure and exclusive scheduling.
- [ ] Snapshot DB/uploads/artifacts and prove restore before destructive tests.
- [ ] Select request/concurrency/duration ceilings, monitoring and independent load-generator stop.
- [ ] Obtain fidelity golden samples; record missing live/fidelity evidence as pending, not clean.

Initial progress must distinguish completed static subparts from deferred live subparts.
No skipped live gate silently disappears from the full-audit definition of done.

---

## 8. Subscription and context strategy

1. Two Claude Pro accounts and one OpenAI Pro account are confirmed. Use isolated official-client
   profiles/OS users; never switch accounts in a shared mutable credential directory.
2. Subscription billing only. Disable paid extra usage/top-ups/API fallback. Reject API/provider
   billing credentials/configuration including ANTHROPIC_API_KEY, OPENAI_API_KEY, CODEX_API_KEY.
   Verify account/billing mode; absent environment variables alone do not prove subscription login.
   No auto-upgrades, credit purchases, reset-credit use or fallback billing.
3. Observe supported usage/reset signals. Claude has session/weekly limits; current OpenAI guidance
   says Pro has no five-hour limit while weekly limits may apply. Use account-specific next-eligible
   times. Unknown metadata requires conservative bounded dispatch, not an invented reset schedule.
4. Choose a personal-use reserve from pilot measurements. Model/context/reasoning/caching/tools affect
   allowance; no fixed token-to-percentage conversion. Extra computers do not create more allowance.
5. Mechanical scripts run directly without model calls where possible. Private raw evidence remains
   outside checkout. Sanitized summaries record counts/locations/versions/commands/exit statuses.
   Every scan hit needs disposition or explicit unresolved status; truncation must not hide coverage.
6. Record complete assigned file/range coverage using bounded reads and rg. Search hits alone cannot
   justify a whole-file clean verdict. Verify supplied size estimates at C00.
7. Avoid rote generated/vendor reads but check provenance/regeneration drift/advisories/runtime and
   trust boundaries, migration constraints, lockfile resolution/supply-chain and public-asset exposure.
   Review custom migrations and state exclusion limits honestly.
8. One chunk/subchunk per fresh context; persist per file/range/test group. Checkpoint immediately on
   usage warnings; hard stops may prevent finishing a file. Record exact resume points.
9. Available lighter models for routine work; strongest suitable included models for difficult
   authorship or peer challenges. Most initial authorship uses Claude; reserve Codex primarily for
   critiques, targeted follow-ups and reconciliation, and Claude allowance for author responses.
   Keep C82's independent session budget. Hermes/local inference/Gemini inference remain deferred.
10. S/M/L are workload estimates, not guaranteed usage windows. Split large work and use measured caps.
    Direct re-runs need no model allowance; agent interpretation does. Separate environmental failures
    from verified product defects.
11. On limit, checkpoint/pause that account until eligible; independently eligible accounts and
    mechanical work can proceed. No tight polling, authentication loops or account-limit evasion.

### Controller-generated session prompt

    Read selected rules in sections 3/6/8/9/15, the assignment, relevant known issues and chunk section.
    Prefix <prefix>; base SHA <sha>; checkout <path>; authorized scope <scope>; chunk/subchunk <ID>.
    Find-only; no subagents. Persist source-verified CANDIDATES and Coverage per file/range/test group.
    Keep leads separate; document owned component purpose/invariants/trust boundaries and observed
    state. Persist exact commands, conditions and evidence interpretation immediately. Return source/
    test versions, pending-review IDs, artifacts and exact resume point. Publish only owned files.
    Continue eligible assigned work within limits; checkpoint/pause at quota or prerequisite blocks.
    Stop at task completion/caps. Review sessions follow §17; bounded investigation follows §20.

C82 omits known issues/earlier reports and uses §6 blind inputs.

### Official references checked during planning (2026-10-13)

- [Codex scripted execution / saved auth](https://learn.chatgpt.com/docs/non-interactive-mode)
- [OpenAI limits / separate API billing](https://learn.chatgpt.com/docs/pricing)
- [Local scheduling host/app requirements](https://learn.chatgpt.com/docs/automations?surface=app)
- [Claude scripted execution](https://code.claude.com/docs/en/headless)
- [Claude Pro auth, shared limits and API precedence](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)

Recheck at preflight. Avoid Claude's API-only bare mode for subscription runs; use independent official
login rather than copying provider auth files.

---

## 9. Findings format

### Severity

| Level | Meaning |
|---|---|
| **Critical** | Exploitable now with serious impact: privilege escalation to admin, version history altered, data loss, remote code execution, auth bypass, secrets exposed |
| **High** | Serious bug or security weakness requiring some precondition; core feature broken for a role; integrity risk |
| **Medium** | Real bug with workaround or limited blast radius; notable performance/accessibility failure; dependency with relevant known CVE |
| **Low** | Minor bug, inconsistency, small inefficiency, hardening gap |
| **Info** | Cleanup, duplication, dead code, style inconsistency, doc drift, suggestions |

### Categories

`security` · `rbac` · `auth` · `integrity` (versioning/immutability) · `logic` · `error-handling` ·
`concurrency` · `performance` · `dependency` · `dead-code` · `duplication` · `css` · `a11y` · `ux` ·
`ops` · `docs-drift` · `tests`

Every reported claim starts as `candidate` even after its author's own verification. §17 determines
acceptance. Keep evidence maturity separate from peer-review status and from later fix disposition.

### Template (one block per finding)

```markdown
### F-C22-007 — Teacher with editing access on SG-B can PATCH a lesson plan in SG-A via REST
- **Severity:** Critical   **Category:** rbac   **Class:** live-risk
- **Audit status:** candidate | under-review | author-recheck | accepted | withdrawn | unresolved | duplicate
- **Revision / provenance:** source SHA, deployment SHA if tested, artifact version/hash, author account/model/date
- **Peer review:** reviewer account/model/date; critique and author-response references (§17)
- **Evidence scope:** source-confirmed | locally reproduced | deployment reproduced | pending reproduction
- **Scenario:** one line — concrete input/state → wrong outcome
- **Where:** `PATCH /api/lesson-plans/:id` · `app/src/access/bundle.ts:L42-L61`
- **Evidence:** sanitized source/request/test result; exact command, exit status, source SHA and relevant runtime/tool/fixture conditions
- **Interpretation / limits:** how the evidence establishes the claimed outcome; remaining uncertainty and what it does not establish
- **Repro:** numbered steps or the audit spec that reproduces it (`app/tests/audit/rbac.audit.spec.ts › …`)
- **Expected vs actual:** what SPEC/code intent says vs what happened
- **Suggested fix:** one or two sentences; no code changes made
- **Related:** other finding IDs, DECISIONS.md entries, known.md items
- **Disposition:** _(left blank during the audit; filled at triage)_ fix-PR #… | deferred | won't-fix — reason
```

IDs are `F-<chunk>-<nnn>`, numbered within the chunk file (Phase 5 units use e.g. `F-C5.3-002`).

### Classification (the field that earns its keep)

| Class | Meaning |
|---|---|
| **live-risk** | Real and currently exploitable or broken on the deployed code |
| **known-planned** | Already on the roadmap or in `known.md` (e.g. working drafts, the `emailVersionArtifact` no-op) — record once with a pointer, never re-flag |
| **future** | Only matters at a scale or exposure the project isn't at yet (e.g. thousands of concurrent users) |

### Findings file structure

```markdown
# C<nn> — <title>
Agent/model: <prefix/model> · Base SHA: <sha> · Report revision: <n> · Started/finished: <dates>
Review status: <candidate/under-review/author-recheck/complete-with-outcomes>
Candidate/accepted/withdrawn/unresolved counts: <counts>; review/response references: <paths>

## Findings
(blocks per the template, in the order found)

## Component understanding
- Purpose, entry points/dependencies, intended invariants and trust boundaries; observed state,
  source/test coverage and evidence references; unknowns recorded explicitly (§20).

## Coverage
- app/src/access/bundle.ts: 2 findings
- app/src/access/index.ts: clean
(one line per file or test group, appended as each finishes)

## Leads to verify
- <what> · <where> · <why suspicious>
```

### Triage rule (after the audit, not during)

Every **accepted** `live-risk` Critical or High finding becomes its own fix PR with a regression test that fails
against the unfixed code. This extends `CLAUDE.md`'s standing rule that every custom endpoint ships
with wire-level 401/403/404 tests and that security invariants are pinned by tests, not review alone. Everything else gets a disposition and is
batched by C83's roadmap.

---

## 10. Phases and chunks

The original full-audit catalog is retained. **Initial execution is code/static scans and isolated
local tests on Spark/M5/M2.** Defer C01 and all deployed-site/reset/load portions. Split C00 into local
baseline and pending deployment parity/account inventory; C20 into local harness/source surface and
pending live login/crawl. Code portions of C21/C30/C40/Phase 5/C70 and supported local checks can
proceed; live C22–C24/C31/C41 and deployed parts of C42/C60–C63 remain pending. Do not label deployed
behavior confirmed using source alone.

Run §17 review after each completed original report, not only at final synthesis. Produce an explicitly
partial stage-1 index/summary if useful. C83 full completion waits for required later-stage evidence.
Within eligible initial work, retain risk-first priority.

| Phase | Chunks | Focus |
|---|---|---|
| 0 | C00–C01 | Setup, parity, baseline, reseed |
| 1 | C10–C15 | Automated static scans + triage |
| 2 | C20–C24 | Live RBAC and auth attacks (highest value) |
| 3 | C30–C31 | Versioning and immutability |
| 4 | C40–C42 | Ingest, upload abuse, export |
| 5 | C5.1–C5.14 | Unit-by-unit code review (CODE-REVIEW-PLAN units, re-sized) |
| 6 | C60–C63 | CSS consistency, accessibility, performance, functional bug hunt |
| 7 | C70–C72 | Ops/deploy, docs drift, test-suite quality |
| 8 | C80–C83 | Reconciliation matrices, vertical flows, cross-model review, synthesis |

---

### Phase 0 — Setup and baseline

#### C00 — Environment, parity, baseline · Light · M
**Steps**
1. Preserve existing work; prepare isolated checkouts at one main SHA and planned audit branch.
   Create §5 layout and private outside-checkout state. Use .git/info/exclude for local sanitized
   caches; prepare fixed task lists and coordinator-owned progress from §12 (§6).
   Provision the shared Spark results directory; no queue database is required.
2. `cd app && npm ci`. Verify `git check-ignore app/.env.audit`. Record the **cycle base SHA**
   (selected main SHA) and dirty-tree status in progress. Record supersession in
   `docs/audit/known.md` instead of modifying the older review plan.
3. **Parity:** determine the commit the test site runs (check the System panel in the admin as Site
   Admin; and/or `ssh Rock5b` + `docker inspect` image labels/tags + the release tag in `/srv/lesson3`).
   Compare with `main` HEAD. Mismatch → finding + note in `progress.md`.
4. **Baseline existing checks**, logging pass/fail and counts to `scans/baseline.md`: `npm run lint`,
   `npm run typecheck`, `npm run format:check`, `npm run test:unit`, `npm run test:int` (bring up
   Postgres per `docker-compose.local.yml`/`docs/LOCAL-SERVER-DEPLOYMENT.md`), `npm run audit:prod`,
   `npm run audit:all`, `npm run build` (record time and peak memory; note the 8000 MB heap flag vs
   the MacBook Air's RAM), plus the project's own fidelity gates: `scripts/contract-check.ts`,
   `scripts/ingest-extract-check.ts`, `scripts/adapter-fidelity.ts`, `scripts/verify-rbac.ts` (run via
   `npx tsx`; read each script's header for arguments). One line per gate: `ran → pass/fail` or
   `couldn't run → why`. DB/Rock/browser-dependent evidence is labelled separately. Distinguish verified product failures from missing dependencies, incorrect setup or host limitations
   before recording a finding.
5. **Size inventory:** `cloc` over the repo excluding §8 exclusions → `scans/inventory.md` (LOC by
   directory, largest 25 files).
5b. **Coverage manifest** → `manifest.md`: run `git ls-files` and map **every** tracked file to exactly
   one Phase 5 unit (C5.x), another chunk that reads it (e.g. `deploy/**` → C70), or an exclusion class
   from §8. Use the LOC counts to fix the split points for C5.6, C5.9 and C5.11 now (target ≤1,500 LOC
   per part), and add one `progress.md` row per part. The audit's "whole codebase" claim is only
   defensible once every file is accounted for. Also run the vendor fidelity check (§8.3).
6. **Account matrix:** log in as Site Admin (Playwright or API) and record every audit account's roles
   and assignments → `scans/accounts.md` (emails only, no passwords). Identify SG-A and SG-B.
7. **known.md:** skim headers/findings of the §2 documents; list known issues and decided trade-offs
   in one line each with source references.
8. **Component map scaffold:** identify the major modules/flows and their owning chunks. Create
   coordinator-owned components.md linked to manifest coverage, with purpose/invariant/trust-boundary
   notes filled from each author's report as work completes (§20). Unknowns remain explicit.
9. **Existing-suite inventory:** list the project's suites/gates, commands and required environments
   in scans/test-results.md. Carry baseline outcomes forward; mark deferred/unrunnable checks and
   uncovered behavior with reasons. Baseline once per relevant revision/environment, not every session.

**Exit:** local baseline/known/manifest recorded. Mark C00-local done and C00-live pending until
parity and account inventory are verified; do not block independent initial work on deferred setup.

#### C01 — Reseed drill and mail capture · Light · S · [exclusive]
1. From `docs/OPS.md`, `app/scripts/seed-users.ts`, `seed-local-dev.ts` and the operator's notes, write
   `docs/audit/tools/reset-test.sh` that returns the test site to a known baseline (DB restore or
   reseed) over SSH, then verifies the four base accounts can log in.
2. Run it once end-to-end; record duration. Write the lock/unlock helpers from §6 into `tools/`.
3. If Mailpit was chosen: confirm a password-reset request lands in Mailpit and that the Mailpit API
   can return the link. Write `app/tests/audit/helpers/mail.ts`.
4. Record container names, ports, log commands (`docker compose logs --since`), and `psql` access
   method in `scans/host.md`. **DB access is read-only by default** — writes only via the app, except
   inside reseed.

**Exit:** reset works and is timed; log and DB read access documented.

---

### Phase 1 — Automated static scans

#### C10 — Run all scans · Hand · S
Write and run `docs/audit/tools/run-scans.sh`. Private raw outputs go outside the checkout
(§15); only sanitized scan artifacts and condensed summaries go into `scans/`. Tools live outside
the repo (§13). Every scan hit is retained for triage even when the model reads only a short summary.

| Scan | Command sketch | Summary keeps |
|---|---|---|
| Outdated deps | `npm outdated --json`; `npm view <pkg> time` for majors | package, current, wanted, latest, age of latest |
| Advisories | `npm audit --json` (all and `--omit=dev`) | advisory, severity, path, fix available |
| Override audit | for each `overrides` entry: `npm ls <pkg> --all` | which overrides still change resolution |
| Unused code/deps | `knip --reporter json` | unused files, exports, deps, devDeps |
| Duplication | `jscpd app/src --min-tokens 50 --reporters json` (exclusions §8) | top 30 clone clusters by size |
| Strict lint (report-only) | `eslint -c docs/audit/tools/eslint.audit.mjs app/src` with typescript-eslint strict-type-checked + sonarjs | counts by rule, top files |
| TS strictness probe | `tsc --noEmit --noUnusedLocals --noUnusedParameters` | counts, top files |
| Suppressions | `rg -n "@ts-ignore\|@ts-expect-error\|eslint-disable\|as any\|: any\b\|TODO\|FIXME\|HACK"` | counts by kind and file |
| Complexity | sonarjs cognitive complexity + largest functions | top 30 functions |
| CSS lint | `stylelint` (standard + scss configs) on `styles.css`, `custom.scss`, `app-tokens.scss` | counts by rule |
| CSS inventory | script: hard-coded colors/px vs tokens, `!important`, z-index values, duplicate selectors, media queries | tables |
| Secrets | `gitleaks detect --source . --log-opts="--all"` (full history — repo is public) | hits (redacted) |
| Shell | `shellcheck` on `deploy/**/*.sh`, `scripts/**/*.sh`, `app/scripts/**/*.sh` | issues by file |
| Dockerfile | `hadolint app/Dockerfile` | issues |
| Actions | list `uses:` in `.github/workflows/*.yml`; flag tag-pinned (not SHA-pinned) actions | table |
| Coverage | `npm run test:unit -- --coverage` and `test:int -- --coverage` | per-directory %, zero-coverage files |

**Exit:** every scan has a summary file; failures to run are noted, not fixed.

#### C11 — Triage: dependencies · Strong · S
Using `scans/` summaries and the latest `DEPENDENCY-REVIEW`: for each outdated or advised package,
decide whether it matters (reachable at runtime? prod or dev? known exploit path in this app?). Check
Payload and Next.js changelogs between pinned and latest for security fixes. Check that each
`overrides` entry is still needed. Check base images (`node:24.21.0-alpine`, `node:24.21.0-bookworm`),
Gotenberg `8.37.0`, Postgres `16.15`, and GitHub Actions versions. Check `docx` against ARES's
generator version. Never recommend a release less than 14 days old. Note the one caret range in
devDependencies (`@testing-library/dom`). Findings: `findings/C11-dependencies.md`.

#### C12 — Triage: dead code and duplication · Light→Strong · M
Confirm knip hits by grep (Payload/Next resolve many things by convention — config-referenced
components, route files, hooks — so knip false positives are expected; verify before reporting). For
each jscpd cluster, decide whether it is real duplication worth consolidating or justified repetition.
Findings: `findings/C12-dead-code-duplication.md`.

#### C13 — Triage: lint, types, suppressions, complexity · Strong · M
Read the strict-lint and complexity summaries; open only the flagged regions. Each suppression
(`@ts-ignore`, `eslint-disable`, `as any`) is checked for whether it hides a real bug. Complexity
hotspots are queued for Phase 5 with a note. Findings: `findings/C13-static-quality.md`.

#### C14 — Triage: CSS static · Light · S
Two styling systems exist: the frontend (`app/src/app/(frontend)/styles.css`, ~2.2k lines plain CSS)
and the Payload admin (`app/src/app/(payload)/custom.scss`, ~2.9k lines SCSS) with
`app/src/app/app-tokens.scss`. Compare token sets: is the frontend consuming the same tokens, or
re-declaring values? List hard-coded colors/spacing that duplicate tokens, duplicate selectors,
`!important` usage, z-index sprawl, inconsistent breakpoints, unused selectors (cross-check class
names with `rg` in `.tsx`). Compare against `docs/DESIGN-visual-system-2026-07-31.md` and
`docs/DESIGN-button-system-2026-07-30.md`. Findings: `findings/C14-css-static.md`.

#### C15 — Triage: secrets, shell, Docker, CI · Light · S
Triage gitleaks (any real secret in history is **Critical** — the repo is public), shellcheck,
hadolint, Actions pinning, `app/test.env` contents, `.env.example` defaults.
Findings: `findings/C15-config-secrets.md`.

---

### Phase 2 — Live RBAC and auth (highest value)

#### C20 — Audit harness and surface inventory · Light · M
1. Build `app/tests/audit/` with `playwright.audit.config.ts` (base URL from `.env.audit`; Chromium +
   WebKit projects), a role login helper with cached storage state per account, and an API client for
   Payload REST (`/api/<collection>`), GraphQL (`/api/graphql`), and custom endpoints.
2. **Surface inventory** → `scans/surface.md`: every frontend route (`app/src/app/(frontend)/**`),
   admin route, collection and its REST/GraphQL operations (`app/src/collections/*.ts`, including
   versions endpoints), every custom endpoint (`app/src/endpoints/*.ts` — method, path, auth check),
   jobs that can be triggered by users, and globals. Supplement by crawling the site as each role and
   recording every distinct URL and XHR.

**Exit:** harness logs in as every account; surface inventory complete.

#### C21 — Expected permission matrix · Strong · M
From `SPEC.md` §8, `docs/DESIGN-who-manages-what-2026-08-29.md`,
`docs/DESIGN-user-model-language-2026-07-29.md`, build `scans/rbac-expected.md`. Independently map
access code/collection/field guards as implemented behavior; code cannot define away an intended-policy
mismatch. Expected matrix: rows = action (collection × operation,
field reads/writes, custom endpoint, admin page); columns = anonymous, unverified, teacher, teacher with editing access
(own SG), teacher with editing access (other SG), subject admin (own SG), subject admin (other SG), multirole, site admin.
Where SPEC and code disagree, record both and verify the consequence before classifying the
finding. Ambiguous policy remains a recorded question; implemented behavior is not automatically expected.

#### C22 — Actual permission matrix (attack run) · Strong · L
Encode the matrix as data-driven specs (`rbac.audit.spec.ts`) so every cell is executed, then diff
actual vs expected. Split into parts by collection group if needed. Cover at minimum:
- REST **and** GraphQL for every collection operation, including `versions` endpoints and
  `?draft=true`, `depth=` population leaking related documents, `select`/`where` on hidden fields
  (e.g. `where[email][like]=` as a teacher to probe whether hidden fields act as an oracle).
- GraphQL introspection availability to anonymous users; query depth/complexity limits.
- **Mass assignment:** signup and self-update bodies carrying `roles`, `_verified`, `assignments`,
  provenance fields; subject admin granting `siteAdmin` or assignments outside their subject-grade.
- Subject-admin **transfer of administration** (irreversible per code comments): can it be done to a
  subject-grade you don't administer, to yourself, repeatedly, or by a teacher with editing access?
- Last-site-admin protection; site admin self-demotion; deleting a user who owns versions.
- Field-level reads: `email` readable only by owner and site admins — check list endpoints, GraphQL,
  populated relations (e.g. author on versions, discussion replies), and admin UI.
- Admin-panel access for teachers (should be denied) via direct URL, not just navigation.
- Every custom endpoint × every role, including unauthenticated, with tampered IDs.

Findings: `findings/C22-rbac.md`. Any confirmed escalation is **Critical** — write it immediately.

#### C23 — Authentication flows · Strong · M
- **Lockout/rate limiting:** no `maxLoginAttempts` was seen in `app/src/collections/Users.ts` during
  planning — verify whether brute-force protection exists anywhere (app, middleware, Cloudflare).
  Test with ~50 rapid wrong attempts against a throwaway account.
- **Enumeration:** compare responses and timing for existing vs non-existing emails on login,
  forgot-password, and signup.
- **Password reset:** token single use, expiry, reuse after password change, token in URL leaking via
  `Referer`, reset for unverified accounts, link host correctness (`SERVER_URL`/`ADMIN_URL`, see the
  2026-07-18 incident in `docs/OPS.md`).
- **Sessions:** cookie flags (HttpOnly, Secure, SameSite), invalidation on logout and password change
  (old cookie/JWT still valid?), the 2-hour inactivity window, concurrent sessions.
- **CSRF:** cross-origin state-changing requests from a foreign origin page; confirm the `SERVER_URL`
  allowlist works behind Cloudflare.
- **Email verification bypass:** can `unverified@` log in, create content, or reach the API?
- **First-user bootstrap:** confirm `/login` never offers "Create the first Site administrator" on a
  non-empty DB, including via direct API calls to the first-user endpoint.
- **Signup:** behavior when registration is disabled; disposable/malformed emails; header injection
  in name/email fields (see `app/src/lib/emailAddress.ts`).

Findings: `findings/C23-auth.md`.

#### C24 — Discussions, messages, favorites, recovery · Strong · M
IDOR on discussion topics/replies/participation, messages (read or mark-read others'), favorites,
edit-recovery rows; moderation endpoints (`moderate.ts`, `discussionThreadDelete.ts`) by
non-moderators; access to deleted or hidden threads; **stored XSS** payloads in every user-text field
(titles, bodies, names) rendered in frontend, admin, emails and exports; notification/message flooding
and missing rate limits; `discussionNavState` leaking other users' state. Findings:
`findings/C24-social-features.md`.

---

### Phase 3 — Versioning and immutability (core promise)

#### C30 — Write-path analysis · Strong · M
Read `app/src/access/versionImmutability.ts`, `versioning.ts`, `bundle.ts`,
`app/src/collections/LessonBundleVersions.ts`, `LessonPlans.ts`, `EditRecovery.ts`, and related
hooks. Enumerate **every** path that can create, modify, or delete a version: REST, GraphQL, Local API
calls inside endpoints and jobs (which bypass access control unless `overrideAccess: false`), admin
bulk actions, recovery/restore, request-editing locks, migrations, scripts. For each, state the guard.
Any Local API call that writes versions without an explicit guard is a finding.
Findings: `findings/C30-version-write-paths.md`.

#### C31 — Immutability attack run · Strong · M · [exclusive]
1. Snapshot checksums of all version rows via read-only `psql` (hash of each row's content columns).
2. Attempt to update/delete historical versions through every C30 path as every role.
3. **Races:** fire concurrent saves from two teachers with editing access (and the same teacher in two sessions) with
   `Promise.all`; look for duplicate version numbers, lost updates, non-monotonic version numbering,
   or orphaned rows. Test request-editing lock stealing and stale locks.
4. Recovery and restore paths: can restoring create a version attributed to the wrong user or with
   altered history?
5. Re-run checksums; any change to a historical row is **Critical**. Check DB constraints (unique
   indexes on version number per lesson) exist.

Findings: `findings/C31-immutability-attacks.md`. Reset afterward.

---

### Phase 4 — Ingest, upload, export

#### C40 — Ingest code review · Strong · M
Review `app/src/ingest/**` (including `extract.ts`, which uses **acorn** to parse ARES JavaScript data
files — confirm it only walks the AST and never evaluates code), the contract schema gate, and
`previewParse.ts`, `recoveryParse.ts`, `parseFormat.ts`. Check size/time limits, use of mammoth,
jszip, jsdom (is jsdom run with scripts disabled and no resource loading?), DOMPurify configuration,
error handling for malformed input, and all-or-nothing semantics. Findings: `findings/C40-ingest-code.md`.

#### C41 — Malicious upload corpus · Strong · M · [exclusive]
Generate `docs/audit/corpus/` with a script, then upload each as the relevant roles while watching
`docker stats` and logs over SSH:
- DOCX zip bomb; very deeply nested XML; XML external entity and billion-laughs payloads inside DOCX
  parts; zip entries with path traversal names (`../../`); huge embedded images; truncated/corrupt zip.
- Wrong extension vs content, polyglot files, empty files, 0-byte parts.
- JS data files containing executable code, prototype-pollution keys (`__proto__`, `constructor`),
  enormous literals, deeply nested arrays.
- Script/HTML injection in every text field that later renders in preview, editor, export, email.
- **Body limits through Cloudflare:** oversized bodies with correct `Content-Length`, missing
  `Content-Length`, and chunked transfer encoding — `docs/OPS.md` says a proxy-layer ceiling is
  mandatory; Cloudflare's own cap is far higher than this app should accept.

Findings: `findings/C41-upload-abuse.md`.

#### C42 — Export fidelity and robustness · Light→Strong · M · [exclusive for the load part]
1. Export each sample lesson to DOCX and PDF; compare with operator-supplied golden files: DOCX via
   XML diff of `word/document.xml` and styles; PDF via page count, extracted text diff, and rendered
   page image diff.
2. Edge content: Swahili and other diacritics, emoji, very long tables, empty sections, maximum-length
   fields.
3. `exportAuth.ts`: can a teacher export unpublished or out-of-scope versions? Are download URLs
   guessable or reusable by others? Cache-key collisions between versions?
4. `emailVersion.ts`: can a user email artifacts to arbitrary addresses (spam relay), how is it rate
   limited, and is header injection possible? (Only send to `@lesson3.local` or the mail catcher.)
5. Fire 20–50 concurrent exports; observe Gotenberg and the artifact cache.

Findings: `findings/C42-export.md`.

---

### Phase 5 — Unit-by-unit code review (from CODE-REVIEW-PLAN, re-sized)

The unit sequence and focus notes come from `docs/CODE-REVIEW-PLAN.md`, ordered risk-first. Sizes are
re-measured (2026-10-13): `lib/` has grown from ~1.2k to ~6.5k LOC, `components/` from ~2.8k to
~11.5k, and `endpoints/` from ~1.7k to ~4k with new discussion, recovery and admin endpoints — so
those units are split and a new social/recovery unit is added. C00's manifest fixes the exact split
points. Every unit reads its own tests and scripts alongside the source (§3.12).

**Coordination with the live phases.** C5.1 and C21 read the same files: if one executor does both,
do C5.1 first and reuse its notes. Likewise C5.2↔C40 and C5.4↔C42. Where a live chunk already
covered a file deeply, the unit records `covered by C<nn>` for it in Coverage instead of re-reading.

| Unit | Scope (source + its tests/scripts) | ~LOC | Exec | Focus |
|---|---|---|---|---|
| **C5.1 Authorization core** | `src/access/*`; `scripts/verify-rbac.ts`; access int tests | ~440 | Strong | The whole RBAC model: per-subject-grade scoping, field-level perms, version immutability. Highest stakes. Pair with C5.12 if budget allows. |
| **C5.2 Ingest & upload boundary** | `src/ingest/*`; `endpoints/uploadBundles.ts`, `parseFormat.ts`, `previewParse.ts`; `scripts/ingest-extract-check.ts`, `contract-check.ts`, `contract-drift.ts`, `corpus-resource-check.ts`; ingest tests | ~1,700+ | Strong | **Never `require()`/execute an uploaded `.js`** — confirm `extract.ts`'s acorn path only walks the AST. Extraction `.js`→JSON, contract gate, upload authz. Prime attack surface. |
| **C5.3 Auth, account & admin endpoints** | `endpoints/`: `forgotPassword`, `verifyEmail`, `requestEditing`, `userAssignments`, `userAdminActions`, `userSearch`, `markMessagesRead`, `respond`; their http tests | ~1,200 | Strong | Unauthenticated and account-lifecycle surface. Enumeration and timing oracles (two were fixed previously — confirm there's no third, and that `userSearch` isn't a new one), rate limits, endpoint-shadowing trust, assignment/transfer logic. |
| **C5.4 Export & data endpoints** | `endpoints/`: `exportVersion`, `exportAuth`, `emailVersion`, `versionEdit`, `previewVersion`, `previewShared`, `resourceLibrary`; their http tests | ~1,300 | Strong | The **authorize-with-caller-access-then-write-with-`overrideAccess: true`** pattern: confirm the gate always runs first. Export authz and rate limits. Each endpoint has 401/403/404 tests that actually gate (`CLAUDE.md` rule). |
| **C5.5 Social, recovery & settings endpoints** *(new)* | `endpoints/`: `discussionActions`, `discussionNavState`, `discussionThreadDelete`, `moderate`, `recovery`, `recoveryParse`, `systemSettingsSave`; their tests | ~1,200 | Strong | Newest code, least battle-tested. Same overrideAccess pattern; moderation authority; recovery restoring data across users; settings writes limited to site admins. |
| **C5.6 Collections + hooks** *(split a: collections ~1.9k / b: hooks ~2.4k, further split at C00)* | `src/collections/*`, `src/hooks/*`; their int tests | ~4,300 | Strong | Data model and lifecycle: sender-stamping, Official-pointer moves, field split, versioning hooks, auth rate limit, assignment provenance stamping. |
| **C5.7 Jobs & queue** | `src/jobs/*`, `src/lib/enqueue.ts`; job tests | ~610 | Strong | The **L3-03 transaction/orphan class**: confirm invariants hold and that the tests pinning them would fail against unfixed code. Retry semantics (`passwordResetEmail` retries vs `emailVersionArtifact` none). |
| **C5.8 Generator & fidelity** | `src/generator/*` (**excluding `vendor/`**); `scripts/adapter-fidelity.ts`, `roundtrip-regression.ts`, `fidelity-spike.ts`, `verify-stage2-export.ts`; fidelity tests | ~1,650 | Strong | **Byte-fidelity is the product.** Adapter grammar subset, artifact/HTML cache scoping and invalidation, DOCX→PDF conversion. |
| **C5.9 lib/ utilities** *(split a/b/c at C00)* | `src/lib/*`; their unit tests | ~6,550 | Light→Strong | Shared primitives — a bug here is systemic. `sanitizeHtml` allowlist, session/expiry, rate-limiter correctness, canonical-JSON stability, `emailAddress` validation, `systemFacts`. |
| **C5.10 Frontend — server & wiring** | `src/app/(frontend)` server components, `(payload)` wiring, `src/middleware.ts`, `src/instrumentation.ts`, `src/errors/*`; page/SSR tests | ~1,600+ | Strong | Server-side reads under caller access, request wiring, telemetry init, SSR data flow, what the error pages leak. |
| **C5.11 Frontend — components & client** *(split ~6 parts at C00: admin, upload, editor, session, export/preview, discussions/misc)* | `src/components/*`; client-component tests | ~11,500 | Light→Strong | Client-side auth flows, form/CSRF posture, preview/PDF client paths, unsafe HTML rendering (`dangerouslySetInnerHTML`), duplicated components (feeds C12/C14). |
| **C5.12 Fields & editor grammar** | `src/fields/*` | ~570 | Strong | The editable-field definitions and the grammar-subset invariant (plain strings, `\n` = paragraph, `- ` = bullet, no inline markup; `phase` controlled). |
| **C5.13 Config & wiring** | `app/src/payload.config.ts`, `next.config.ts`, `eslint.config.mjs`, `vitest.setup.ts`, `playwright.config.ts`, `scripts/seed-users.ts`, `scripts/recover-site-admin.ts`, `scripts/check-approuter.mjs` | ~600 | Strong | Central Payload wiring (jobs, collection/access registration, GraphQL settings, CSRF/CORS from `SERVER_URL`), headers config. A misconfig here is a systemic hole. (`Dockerfile`, CI and `deploy/**` are read in C70.) |
| **C5.14 Migrations (spot-check)** | `src/migrations/*` — **hand-edited only** | — | Light | Data migrations, custom `down()`, enum-narrowing `down()` (delete-before-cast), anything non-generated. Don't read generated schema. |

**Per-unit checklist:** logic errors and wrong conditions; unhandled promise rejections and swallowed
errors; null/undefined paths; dates and time zones; multi-step writes without a transaction; Local API
calls without `overrideAccess: false` where user context matters; N+1 queries; dead branches and unused
parameters; duplication confirmed from C12; comments that no longer match the code; tests that exist
but wouldn't fail if the behavior broke.

---

### Phase 6 — UI, CSS, accessibility, performance, functional bugs

#### C60 — Visual consistency crawl · Light · M
Playwright visits every route from `scans/surface.md` as each role at 360, 768 and 1280 px widths,
saving screenshots (raw, git-ignored) and extracting computed styles of buttons, links, headings,
inputs, cards and tables into a table. Report distinct variants per component (e.g. "buttons render
with 6 different paddings across pages"), frontend vs admin mismatches, overflow and horizontal
scroll at 360 px, and clipped text. Findings: `findings/C60-visual-consistency.md`.

#### C61 — Accessibility · Light · M
Run `@axe-core/playwright` on every route per role; keyboard-only walkthrough of key flows (login,
find lesson, edit, save, export, discuss); focus visibility; color contrast; form labels and error
messaging; heading structure; screen-reader names on icon buttons. Findings: `findings/C61-a11y.md`.

#### C62 — Performance and low bandwidth · Light · M · [exclusive for the load part]
- Lighthouse (mobile, throttled) on home, library, a lesson page, editor, discussion page.
- `next build` route size output; page weight and request counts; caching headers through Cloudflare
  (static assets cached? HTML not?); compression; fonts and images.
- Server timing for key API calls; obvious N+1s seen in logs.
- Light load test with `k6` or `autocannon`: ramp anonymous and logged-in read traffic until latency
  degrades; monitor CPU, RAM, and swap on the Rock over SSH. Record the knee and the resource that
  saturates first.
- Note the `--max-old-space-size=8000` build flag against target hardware.

Findings: `findings/C62-performance.md`.

#### C63 — Functional bug hunt · Strong · M
Use `USER_GUIDE.md` as the script and walk every journey as each role in Chromium and **WebKit**
(iPhone/Safari users): broken links (run `linkinator` against the site), console errors, 404s/500s,
form validation, double-submit, back/forward behavior, session expiry mid-edit, refresh during save,
two tabs editing, very slow network (Playwright throttling), `publicLibrary` on/off behavior.
Findings: `findings/C63-functional.md`.

---

### Phase 7 — Ops, docs, tests

#### C70 — Deployment and ops review · Strong · M
`deploy/online/install.sh`, `update.sh`, `compose.template.yaml`, `app/Dockerfile`, CI and release
workflows, backup/restore procedures in `docs/OPS.md`: idempotency, failure modes mid-install/update,
rollback path, digest pinning, container hardening (non-root — the runner uses `USER nextjs`;
read-only filesystem, capabilities, resource limits, healthchecks), secrets handling, log retention.
**Edge headers:** planning observed no `Strict-Transport-Security` header and an
`x-powered-by: Next.js, Payload` header; CSP allows `'unsafe-inline'` styles — verify and recommend.
Findings: `findings/C70-ops.md`.

#### C71 — Documentation drift · Light · M
Compare `SPEC.md`, `CLAUDE.md`, `AGENTS.md`, `USER_GUIDE.md`, `README.md`, `docs/OPS.md`, and
`docs/NEXT-SESSION.md` against the code and live behavior gathered in earlier chunks. Report stale
instructions, wrong paths/commands, features described but absent, and features present but
undocumented. Findings: `findings/C71-docs-drift.md`.

#### C72 — Test-suite quality · Light→Strong · S
From C10 coverage: zero-coverage modules, especially in `access/`, `endpoints/`, `ingest/`. Spot-check
tests that assert nothing meaningful, rely on timing (flaky), or mock the thing under test. Map e2e
specs to features and list uncovered features. Recommend which `app/tests/audit/` specs should be
promoted into the permanent suite and CI. Findings: `findings/C72-tests.md`.

---

### Phase 8 — Reconciliation, cross-model review, synthesis

#### C80 — Cross-cutting reconciliation · Strong · M
Synthesis over every earlier findings file and the tests already read — compact matrices, **not** a
re-read. Write `scans/matrices.md`:
- **Endpoint → authz-test matrix:** every custom endpoint × its http tests for 401/403/404 + happy
  path. Gaps are findings under the `CLAUDE.md` endpoint rule.
- **Role/action matrix:** C21 expected vs C22 actual, condensed, with every mismatch linked to a finding.
- **Invariant → test matrix:** each security or integrity invariant (version immutability, never
  execute uploaded JS, grammar subset, email field privacy, transfer irreversibility, etc.) × the test
  that pins it.
- **Coverage-by-environment:** what is tested in CI vs only locally vs only on the Rock vs only in a
  browser.
- **Tests that would still pass against a known-bad implementation** — the most valuable column. For
  key invariants, reason whether a removed guard breaks the test. If authorized, mutation probes use
  a throwaway source copy outside audit checkouts, never product files on the audit branch.

Also reconcile leads: verified, discarded with evidence, or explicitly unresolved. Incorporate §17
review/response outcomes; no model-agreement shortcut for contested evidence.

#### C81 — Vertical-flow pass · Strong · M
The capstone: trace whole flows across modules to find boundary failures that unit-by-unit review
misses. Use code plus the audit harness to follow each flow end to end:
- signup → verify → login → password reset/recovery;
- upload → validate → store → preview → export;
- edit → immutable version → Official-pointer move → discussion/notification;
- export/email request → job queue → artifact cache → delivery;
- session expiry mid-edit → edit recovery / working-draft restore.

Findings: `findings/C81-vertical-flows.md`.

#### C82 — Blind cross-model review · Cross · M
A different model family (e.g. Codex if Claude did the originals) independently reviews
`app/src/access/**`, the C30 write paths, and `app/src/ingest/**` **without** reading earlier findings
first, writing `findings/C82-cross-review.md`. Only then compare against C22/C30/C31/C40/C41/C5.1/C5.2
and note agreements, new findings, and disputed findings. New candidates enter the same mandatory
§17 sequential review; this blind missing-issue pass does not replace review of each reported claim.

#### C83 — Synthesis and roadmap · Strong · M
1. **Change sweep:** compare immutable audit base to a separately recorded current main SHA, not
   worker audit-branch HEAD. Reopen changed covered files in an identified follow-up sweep; preserve
   original evidence/revision. If none changed, note "no reopen needed".
2. De-duplicate and incorporate all §17 critiques/author responses. Build `FINDINGS.md` with accepted
   findings and separate withdrawn/duplicate/unresolved sections, each linking its audit trail.
   Include final evidence/review status, severity/class/category/location and later fix disposition.
   Only accepted findings enter confirmed totals or the fix roadmap.
3. Write `SUMMARY.md` as a self-contained handoff (§20): executive summary, audited/deployed revisions,
   environment and exclusions; accepted counts by severity/class/category and prioritized risks with
   rationale; test results/coverage gaps; unresolved/withdrawn outcomes; and a PR-sized fix roadmap.
   Link component understanding and include the minimum sanitized evidence/repro needed to act,
   without depending on chat history. Accepted live-risk Critical/High lead, each with a regression test.
4. List audit checks worth adopting permanently (scans for CI, audit specs to promote).
5. Remind the operator to rotate all audit account passwords, remove extra accounts if unwanted, and
   remove Mailpit or point SMTP back if it was added only for the audit.

**Re-running later.** Reset chunks to `todo` only after a substantial feature lands, and then only the
chunks and units whose files changed (use `manifest.md` to find them). The scans (C10) and audit specs
can be re-run before every release at no token cost.

---

## 11. Definition of done

- Every chunk has documented scope/status. Essential skipped/blocked/unresolved checks yield a
  qualified/partial audit; resolve required gaps before claiming full completion.
- `manifest.md` accounts for every tracked file (a unit, another chunk, or an exclusion class), and
  every non-excluded file has a Coverage line (`findings`, `clean`, or `covered by C<nn>`).
- Every major component has a documented purpose, intended invariants/trust boundaries, observed
  state and linked source/test coverage in components.md. Unknowns/omissions limit the completeness claim.
- Existing tests/gates have recorded pass/fail/not-run outcomes, exact conditions and reasons; unrun
  essential checks remain pending and gaps are explicit. Do not claim execution from inspection alone.
- Final report is self-contained, identifies revisions/environments/exclusions and risk rationale,
  and supplies actionable sanitized evidence/repro plus next actions without requiring this chat.
- Every candidate follows §9 and has completed opposite-family review plus author response (§17).
  Accepted findings have evidence supporting their final wording/severity; withdrawn and unresolved
  claims remain visible with reasons. No candidate awaiting review is counted as confirmed.
- Leads are verified, discarded with evidence, or explicitly unresolved in final limitations.
  Never discard untestable leads merely to satisfy completion.
- The C83 change sweep reopened nothing, or the reopened items were redone.
- `FINDINGS.md` and `SUMMARY.md` exist; every live-risk Critical/High has a repro spec in
  `app/tests/audit/`.
- No product code changed; no credentials anywhere under `docs/`.

---

## 12. Progress table (copy into `progress.md` in C00)

Cycle base SHA: `<sha>` · Started: `<date>`

| Chunk | Title | Exec | Size | Status | Agent | HEAD SHA | Accepted findings (C/H/M/L/I) | Notes / resume point |
|---|---|---|---|---|---|---|---|---|
| C00 | Environment, parity, baseline | Light | M | todo | | | | |
| C01 | Reseed drill + mail capture | Light | S | todo | | | | exclusive |
| C10 | Run all scans | Hand | S | todo | | | | |
| C11 | Triage: dependencies | Strong | S | todo | | | | |
| C12 | Triage: dead code + duplication | Light→Strong | M | todo | | | | |
| C13 | Triage: lint/types/complexity | Strong | M | todo | | | | |
| C14 | Triage: CSS static | Light | S | todo | | | | |
| C15 | Triage: secrets/shell/Docker/CI | Light | S | todo | | | | |
| C20 | Audit harness + surface inventory | Light | M | todo | | | | |
| C21 | Expected permission matrix | Strong | M | todo | | | | |
| C22 | Actual permission matrix | Strong | L | todo | | | | split a/b/c |
| C23 | Auth flows | Strong | M | todo | | | | |
| C24 | Discussions/messages/favorites/recovery | Strong | M | todo | | | | |
| C30 | Version write-path analysis | Strong | M | todo | | | | |
| C31 | Immutability attack run | Strong | M | todo | | | | exclusive |
| C40 | Ingest code review | Strong | M | todo | | | | |
| C41 | Malicious upload corpus | Strong | M | todo | | | | exclusive |
| C42 | Export fidelity + robustness | Light→Strong | M | todo | | | | exclusive (load) |
| C5.1 | Authorization core | Strong | S | todo | | | | pair with C5.12 |
| C5.2 | Ingest & upload boundary | Strong | M | todo | | | | coordinate with C40 |
| C5.3 | Auth, account & admin endpoints | Strong | M | todo | | | | |
| C5.4 | Export & data endpoints | Strong | M | todo | | | | coordinate with C42 |
| C5.5 | Social, recovery & settings endpoints | Strong | M | todo | | | | |
| C5.6a/b… | Collections + hooks | Strong | L | todo | | | | split points from C00 |
| C5.7 | Jobs & queue | Strong | S | todo | | | | |
| C5.8 | Generator & fidelity | Strong | M | todo | | | | excl. vendor/ |
| C5.9a/b/c | lib/ utilities | Light→Strong | L | todo | | | | split points from C00 |
| C5.10 | Frontend server & wiring | Strong | M | todo | | | | |
| C5.11a–f | Components & client | Light→Strong | L | todo | | | | split points from C00 |
| C5.12 | Fields & editor grammar | Strong | S | todo | | | | |
| C5.13 | Config & wiring | Strong | S | todo | | | | |
| C5.14 | Migrations spot-check | Light | S | todo | | | | hand-edited only |
| C60 | Visual consistency crawl | Light | M | todo | | | | |
| C61 | Accessibility | Light | M | todo | | | | |
| C62 | Performance + load | Light | M | todo | | | | exclusive (load) |
| C63 | Functional bug hunt | Strong | M | todo | | | | |
| C70 | Deployment + ops | Strong | M | todo | | | | |
| C71 | Docs drift | Light | M | todo | | | | |
| C72 | Test-suite quality | Light→Strong | S | todo | | | | |
| C80 | Cross-cutting reconciliation | Strong | M | todo | | | | promotes/discards all leads |
| C81 | Vertical-flow pass | Strong | M | todo | | | | capstone |
| C82 | Blind cross-model review | Cross | M | todo | | | | different model family |
| C83 | Synthesis + change sweep + roadmap | Strong | M | todo | | | | |

**Parallelism guide:** initial eligible static/local units run from fixed per-executor assignments.
Review/author-response stages for a finding are sequential, while unrelated audits can proceed.
Progress notes identify review state and withdrawn/unresolved counts separately from accepted totals.
Later live work will be serialized; destructive/load portions exclude every other live job.
C80–C83 remain full-run reconciliation/capstone stages; an interim stage-1 summary is explicitly partial.

---

## 13. Tool installation (outside the repo)

Keep tools out of app/package.json. Inventory first; install only needed worker tools once authorized.
These are macOS sketches; Linux needs supported equivalents. Verify versions/provenance/platform.
Do not install every heavy tool on the 8GB M2 controller.

```bash
brew install gitleaks shellcheck hadolint k6 cloc ripgrep
mkdir -p ~/audit-tools && cd ~/audit-tools && npm init -y
npm install knip jscpd stylelint stylelint-config-standard stylelint-config-standard-scss \
  eslint-plugin-sonarjs typescript-eslint lighthouse linkinator @axe-core/playwright autocannon
```

Run them with `npx --prefix ~/audit-tools <tool>` or via `docs/audit/tools/run-scans.sh`. For the
audit Playwright specs, reuse the repo's pinned `@playwright/test` and install browsers with
`npx playwright install chromium webkit`. Pin tool versions in `~/audit-tools/package.json` once
installed and record them in `scans/baseline.md` so re-runs are comparable.


---

## 14. Computing environment and current allocation

The inventory includes five available computers; **only Spark, M5 and current M2 participate initially**.
The user's latest simplification defers Rock5B and Hermes; the mini is also outside this first setup.

| Executor | Resources / name | Initial role |
|---|---|---|
| `cx` — OpenAI Pro on current M2 | 8GB / 512GB; `j-air-m2.tail49b05.ts.net`; macOS | Main reviewer of both Claude streams, coordinator and synthesis; original checks only as exceptions |
| `cc1` — Claude Pro 1 on Spark | 128GB supplied; `jhm-spark.tail49b05.ts.net`; Linux/aarch64 verified | Most backend/integrity/scans authorship, own critique responses; shared-results host |
| `cc2` — Claude Pro 2 on M5 | `j-air-m5.tail49b05.ts.net`; macOS/arm64, 24GB RAM verified; disk capacity still to verify | Most frontend/browser/docs authorship, own critique responses; review Codex-origin exceptions |
| Deferred inventory | Mini M4, Rock5B, Hermes; specs preserved below | No first-stage jobs or setup |

The normal pipeline is **Claude original audit → Codex critique → the original Claude author recheck**.
Two independent Claude allowances support most initial work; Codex's single allowance is mainly
reserved for reviewing it. The reverse direction remains mandatory for exceptional Codex-origin
findings. Account quotas differ, so measure throughput rather than impose a fixed percentage split.
§17 consumes real allowance; pace original audits to the review backlog.

**Source/results separation:** three ordinary local clones at one commit. A dedicated sanitized
results folder on Spark is the common exchange, accessed by SSH over Tailscale. Do not put the active
Git repository on Google Drive. Drive is optional report backup, with no Linux sync dependency in
the initial workflow. The M2 owns global progress; worker reports/statuses/critique/responses have
separate writers. Exact directory/access is established later, not by this plan edit.

**Machine limits:** keep builds/browser fleets/container databases off the 8GB M2. Verify Spark
architecture and tool/native-module/image/browser compatibility; M5 has 24GB RAM verified in §19. Run heavy jobs
where measured resources permit. Spark GPU is not needed for subscription-backed model inference;
local-model serving is deferred. No automatic swap/system changes.

**Paths/access:** verify each local checkout and noninteractive SSH; usernames and paths differ.
This session's Lesson3 path was inaccessible during earlier planning. Preserve existing work.
Verify power/sleep/credential expiry and actual report transfer; no broad tailnet policy changes.
Read-only SSH identity/connectivity checks are recorded below; they do not establish runner,
source clone, file permissions, provider login or unattended readiness.

**Privacy:** credentials/provider auth, browser sessions/traces, unredacted logs and malicious corpora
stay private on their worker. Share sanitized reports and referenced audit tests only. Gemini-associated
drive is optional backup after selection; no upload, connector setup or Gemini inference is initiated.

**Deferred full-audit coverage:** retain Rock deployment parity/live authorization/performance tests,
reseed/abuse/load, and offline-school-profile checks. These are pending, not silently skipped.
Source review or fast local tests do not establish deployed behavior or full-audit completion.

### SSH connectivity smoke test — 2026-10-14

The user authorized checking direct device communication. These tests used existing Tailscale/SSH,
noninteractive batch authentication, strict host-key checks, bounded connection attempts, and
`hostname`/`uname`/`id`. No audit work, installations, daemon/ACL changes, private-key copying, agent
forwarding, provider login or permanent SSH configuration changes were performed.

**Verified connection details**

| Computer | Current Tailscale name | Remote login |
|---|---|---|
| Current M2 | `j-air-m2.tail49b05.ts.net` | `jamesmcclelland` |
| Spark | `jhm-spark.tail49b05.ts.net` | `james`; existing M2 alias `Spark` |
| M5 | `j-air-m5.tail49b05.ts.net` | `james` |

The supplied M5 DNS name `jamess-m5-macbook-air.tail49b05.ts.net` is stale: it did not resolve.
The actual Tailscale peer is `j-air-m5.tail49b05.ts.net` at the same supplied IP `100.91.49.40`.
An initial Spark attempt using M2's default username was rejected by policy; the existing alias
selects the correct `james` login. The source inventory below is preserved rather than silently edited.

| Direction | Observed result | Effect on the proposed hub |
|---|---|---|
| M2 → Spark | Authenticated; remote identity `jhm-spark`, Linux/aarch64, user james | Required coordinator-to-hub route works |
| M2 → M5 | Authenticated; remote identity `j-air-m5.local`, macOS/arm64, user james | Optional worker status route works |
| M5 → Spark | Operator verified/accepted the matching host key on M5; fresh BatchMode + strict-host-key connection returned jhm-spark | Required worker-to-hub route and persistent client host trust confirmed by operator terminal output |
| Spark → M5 | Connection timed out | Not required for pull-based report handoffs |
| Spark → M2 | Connection timed out | Not required; coordinator initiates connections |
| M5 → M2 | Connection refused | Not required; do not enable an M2 SSH server just for this design |

M5's normal strict-checking attempt lacked a trusted Spark ED25519 key. The successful diagnostic
used the existing M2-verified public host-key record in a private temporary directory on M5 and removed
it afterward. No private key or agent was forwarded. **Operator follow-up completed persistent M5
host trust:** the user accepted the matching ED25519 key from an M5 session, then a fresh connection
with BatchMode=yes and StrictHostKeyChecking=yes returned jhm-spark without a prompt.
Evidence: user-provided terminal transcript, 2026-10-14. Do not disable host-key checking.
This confirms the current connection, not future key-expiry/reauthentication or file-transfer behavior.

Timeout/refusal observations do not identify their exact firewall/service/policy causes; no broader
network diagnosis or reconfiguration was performed. Reachability is time-specific, not an uptime
guarantee. Report publication/read/permission tests remain part of the pilot, since this smoke test
ran identity commands only.

### Minimum communication setup still needed

**No immediate Tailscale-admin change is indicated by the successful hub-route tests.** M2 → Spark
and M2 → M5 already work. M5 → Spark also authenticated once the client had a trusted host key.
That observed failure was missing client host trust, not a demonstrated network/policy denial.
Do not open all devices to one another to fix optional reverse-route failures.

**One-time M5 setup — completed by the operator on 2026-10-14.** The user-provided transcript
shows the matching key accepted on M5 and the noninteractive check below returning jhm-spark.
The commands remain here for reference and later verification, not as an outstanding setup item.

From a terminal on M5:

    ssh james@jhm-spark.tail49b05.ts.net

If it asks to trust the host, verify the displayed ED25519 fingerprint against the already trusted
M2 record (or another authenticated verification channel) before accepting. On M2, the trusted
record inspected on 2026-10-14 has fingerprint:

    SHA256:TLp/6HF5SBHPmaSpK84dlsOcmMi5etM33rIhAqDuNKo

This is a public host-key fingerprint, not a credential. If the key differs, investigate rotation
or a wrong destination; do not automatically accept a changed identity. The M2 comparison command is:

    ssh-keygen -F jhm-spark.tail49b05.ts.net -f ~/.ssh/known_hosts | ssh-keygen -lf -

Then check from M5 that a fresh connection succeeds without interactive prompts:

    ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 james@jhm-spark.tail49b05.ts.net hostname

Expected remote identity: `jhm-spark`. No need to copy the M2 private SSH key, forward its agent,
or change the Spark login account. A first-time known-host prompt and authentication are separate
checks; the temporary verified-key diagnostic already demonstrated authentication at that time.
Persistent host trust was configured by the operator and confirmed in the supplied transcript.
Codex did not change SSH configuration or keys. No immediate Tailscale-admin change is indicated.

**Before unattended days:** check the required routes again, including after an idle interval, and
verify power/sleep behavior, device-key expiry and any interactive authentication requirement.
Tailscale SSH “check” rules can demand browser reauthentication; ordinary OpenSSH carried over
Tailscale and Tailscale-managed SSH have different authorization mechanisms.
[Tailscale SSH documentation](https://tailscale.com/docs/features/tailscale-ssh).

**Only if that preflight fails:** inspect the admin console's device identities/expiry and relevant
Access controls. For Tailscale-managed SSH, both network access and SSH authorization must permit
the intended source/destination/login. The required target is Spark's ordinary `james` account from
M2 and M5, plus existing optional M2 → M5 status access; root access and a full mesh are unnecessary.
If a check rule would interrupt unattended operation, choose a narrowly scoped authorized access
arrangement for these specific routes rather than disabling checks tailnet-wide. Do not propose an
exact policy patch until the actual policy and authentication mechanism have been inspected.
[Tailscale SSH access requirements](https://tailscale.com/docs/features/tailscale-ssh).

**Host work after connectivity:** Claude/client login, source clones and test runtime setup come
before the audit pilot. The readiness checks in §19 confirm those prerequisites are not yet complete.
Provision a dedicated Spark results directory, ownership/permissions and pinned source clones.
SSH-only handoff checks can precede model installation, but the actual audit/review pilot requires
the installed authenticated clients, source and relevant test setup. Do not conflate these stages.

### Supplied snapshot (verbatim)

M5 is separate; general preferred-control notes do not override this audit's M2-first selection.
Its stale M5 hostname is superseded by the verified connection table above.

<!-- BEGIN ENVIRONMENT SNAPSHOT -->
# Computing Environment

Canonical shared notes about the machines available to Hermes/Codex agents.
This is the machine map for the whole workspace, so every machine can read the same source of truth.

## Usage

- Read this when deciding which machine to use for a task.
- Keep it public, markdown-only, and free of secrets.
- Update it when a machine's hostname, OS, role, or availability changes.
- Hardware specs inform local model and workload decisions.

## Machines

### Rock 5B

- **Device:** Radxa Rock 5B (ARM SBC)
- **OS:** Ubuntu Desktop 24.04
- **Hostname:** `rock5b`
- **Tailscale:** `rock5b.tail49b05.ts.net`
- **IP:** `100.88.123.29`
- **Role:** ARM-based always-on service host
- **Best use:** Persistent lightweight automation and ARM-native services

**Hardware:**
- **CPU:** ARM processor (not x86_64)
- **Memory:** 16GB RAM
- **Storage:** 512GB NVMe
- **WiFi:** Intel AX210NGW adapter (power management disabled for stability)

### Nvidia DGX Spark

- **Device:** Nvidia DGX Spark
- **OS:** DGX OS based on Ubuntu 24.04 LTS
- **Hostname:** `jhm-spark`
- **Tailscale:** `jhm-spark.tail49b05.ts.net`
- **IP:** `100.65.206.95`
- **Role:** Local-model / GPU-heavy machine
- **Best use:** Local LLMs, heavy inference, and GPU workloads

**Hardware:**
- **RAM:** 128GB
- **GPU:** GPU-heavy configuration (exact specs TBD)
- **Primary use case:** Local LLMs and heavy inference tasks

### Apple MacBook Air M5

- **Device:** Apple MacBook Air M5
- **OS:** macOS Tahoe 26.5
- **Hostname:** `jamess-m5-macbook-air`
- **Tailscale:** `jamess-m5-macbook-air.tail49b05.ts.net`
- **IP:** `100.91.49.40`
- **Role:** Interactive Hermes / Codex machine
- **Best use:** Interactive coding, agentic work, and Hermes-driven tasks

**Hardware:**
- **Chip:** Apple M5
- **Memory:** TBD
- **Storage:** TBD
- **Services:** Hermes v0.16.0 running

### Apple Mac mini M4

- **Device:** Apple Mac mini
- **OS:** macOS 26.5.1 (25F80)
- **Hostname:** `mac-mini`
- **Tailscale:** `mac-mini.tail49b05.ts.net`
- **IP:** `100.104.106.122`
- **Role:** Primary control and development workstation
- **Best use:** Main coding work and coordination of other agents via SSH or Telegram

**Hardware:**
- **Model:** Mac16,10 / MU9E3LL/A
- **Chip:** Apple M4
- **CPU:** 10 cores (4 performance, 6 efficiency)
- **GPU:** Built-in Apple GPU (Metal 4)
- **Memory:** 16GB RAM
- **Display:** DELL U2723QE (5120 × 2880; UI at 2560 × 1440 @ 60 Hz)
- **Control tools:** Codex, Claude Code
- **Dashboards:** Hermes, NanoClaw

## Shared workspace notes

- **Workspace root:** `/Users/james/Documents/GitHub`
- **GitHub namespace:** `james-beep-boop`
- **Repo for these notes:** `workstreams` repository
- **All four machines:** permanently reachable over Tailscale
- **All IP addresses (100.x.x.x):** Tailscale addresses; use `rock5b.tail49b05.ts.net`, etc. for hostname-based access
- **Preferred control machine:** Mac mini M4
- **Preferred interactive Hermes machine:** MacBook Air M5

## Application hosting note (SHEQL / Lesson3)

The lesson-plan platform (Lesson3) is a **Node.js + PostgreSQL** app that embeds the CBE DOCX generator in-process.

- Any of the always-on machines (Rock 5B, Mac mini) can host the Node app + Postgres for dev/staging; the Rock 5B suits an always-on service role.
- The DGX Spark remains the GPU/local-LLM machine if AI assistance is added later.
- **Offline target:** a single Node + Postgres deployment on a local box at a school — no DreamHost, no second runtime.

## Source of truth

This file is intended to be the shared computing-environment reference for all machines and agents.
If the setup changes, update this file first and then sync the repo.
<!-- END ENVIRONMENT SNAPSHOT -->

---

## 15. Minimal unattended runner and pilot

This specifies later implementation. No runner, schedule, account login or remote process is created
by this document update.

### Small runner, fixed lists

- Claude executors have ordered original-audit assignments and their own response checkpoints.
  Codex's normal list is incoming critiques/follow-ups and reconciliation, not another large audit
  stream. A small runner starts the next eligible original/review/response session, publishes owned
  artifacts and checkpoints. Sequential dependencies for each finding are file statuses.
- The M2 coordinator alone assigns review work and updates shared global progress. No competing task
  claims, SQLite, distributed leases, automatic failover or shared writable network checkout.
- Spark is the results exchange; clients upload temporary files then publish by same-host rename.
  Publish readiness last; readers ignore incomplete transfers. Keep local output until acknowledged.
- On quota stop, persist and wait according to that account's supported reset/eligibility signal.
  A pending critique/author response stays pending; another account cannot silently mark it accepted.
  Other independent assigned work can continue within the small review-backlog cap.
- After SSH loss, inspect the existing process/artifact/checkpoint before restarting. Retry only
  confirmed idempotent transfers/jobs with a bounded retry count. Stop on authentication failures
  needing user action. No live mutations in this stage.
- Use a local stop flag and finite session/job caps. Within authorized assigned work, continue
  without repeated “shall I proceed?” questions; apply the bounded value-driven loop in §20.
  Verify M2 and M5 power/sleep/lid/restart behavior.
  A desktop app schedule needs the computer on and app running. Choose one runner/scheduler owner.
- Model event logs/provider auth/private evidence remain outside the source/results exchange.
  Validate allowed checkout diff, code/evidence references and review statuses before integrating.
  Exit code alone does not prove complete coverage or accepted findings.
- Local status identifies authored chunks, awaiting peer reviews, author rechecks, accepted/withdrawn/
  unresolved counts, account pauses and blockers. External messages require a separately chosen channel.

### Pilot before full unattended execution

**Prerequisites are not yet complete:** finish the client/authentication/source/runtime checklist in §19.
A generic SSH/report-handoff smoke check does not require Claude; a real audit/review/response pilot does.

1. Verify Spark/M5/M2 source/tool/account readiness and disabled paid fallback. SSH smoke checks
   and operator-confirmed persistent M5 → Spark host trust exist (§14). Test report publish/read
   permissions and authentication after an idle interval; identity-command success alone is insufficient.
2. Run one modest source/scan chunk on each Claude worker, review both from Codex, and return critiques
   to their original authors. Run one Codex-origin sample reviewed by Claude and returned to Codex.
3. Measure time, allowance, context, RAM/disk and review backlog. Test a disputed candidate with
   evidence-based revision/withdrawal; exercise an unresolved outcome without forcing agreement.
4. Interrupt a job and report transfer; verify checkpoints, incomplete-file exclusion and resume
   without duplicate launches. Exercise recorded quota-wait and stop states without deliberately
   exhausting allowance. Preserve one writer per artifact.
5. Run one unattended night with small assignments, bounded per-account sessions and backlog caps.
   Inspect candidate/critique/response trails before scaling. No requirement to keep all three
   subscriptions continuously busy; peer-review capacity is part of the workload.

C00-local records scans/workers.md and scans/pilot.md, fixed lists and shared-results publication.
The first-stage summary explicitly lists deferred full-audit checks. Before enabling later live tests,
add one serialized live schedule, authorized target/isolation/restoration and bounded monitoring/load
rules. That later need does not justify extra coordination infrastructure for the initial source audit.

Completion of a task stops its runner; full-run completion stops wakeups/jobs and preserves reports.
No initial mini failover or Rock/Hermes workload. Estimate duration from the reciprocal-review pilot,
including revision/re-review and allowance pauses, not just the original audit speed.

---

## 16. Current decisions and remaining execution choices

Confirmed: source/static/isolated-local first stage; Claude Pro 1 on Spark and Claude Pro 2 on
separate M5 perform most initial auditing. OpenAI Pro here on current M2 (8GB / 512GB) primarily
reviews both streams, returns critiques and reconciles outcomes. Fixed local clones and Spark results
over SSH, one writer per file, M2 progress. Rock/Hermes/mini/local inference deferred.
Sequential opposite-family finding review plus author response is mandatory (§17).

| Item | State before execution |
|---|---|
| Hostnames and remote logins | Verified in §14; M2 j-air-m2, M5 j-air-m5, Spark jhm-spark |
| M5 RAM/storage; exact macOS versions; worker tools | M5 RAM verified: 24GB; about 694GiB free at check; exact total disk/macOS pending; tool inventory in §19 |
| M5 → Spark persistent host-key trust | Completed by operator; supplied transcript confirms matching fingerprint and prompt-free BatchMode/strict connection |
| Tailscale admin changes | None currently indicated for hub routes; inspect actual expiry/check policy only if unattended preflight requires it |
| Official subscription account/workspace logins | Spark james profile unauthenticated; M5 CLI not found in checked paths; M2 Codex reports ChatGPT login; distinct Pro account/workspace verification still needed (§19) |
| Shared Spark path/access and owned artifact layout | Specified, not provisioned |
| Initial IDs/splits and reviewer assignments | Set after client/auth/source setup; no competing claims |
| Source clones/runtime | No Lesson3 checkout found in searched common roots on any executor; app needs Node 24.21+ below 25 (§19) |
| Personal allowance reserve/session/backlog caps | Measure small reciprocal-review pilot |
| Source baseline/local checkout paths | Verify and freeze; no active repository on Drive |
| Git commits/pushes | Original boxes unticked; report exchange does not need them |
| Live/destructive/fidelity/offline deployment checks | Deferred, retained as required full-audit coverage |
| Drive backup/external notifications | Optional, not enabled |

Source inventory remains intact. This update implements the process in the plan, not the actual
runner/logins/transfer scripts/scheduler. Essential deferred/unresolved checks limit completion claims.

---

## 17. Mandatory sequential review of audit findings

The user reports that roughly a quarter or more of findings in their experience are challenged by
the other model and often withdrawn after the author rechecks. This motivates the process; it is
a personal observation, not a measured universal false-positive rate or a target rejection quota.

**Purpose:** improve finding validity, scope, severity and suggested remedies before triage.
The **default and bulk-work pipeline** is:
`Claude on Spark or M5 authors → Codex on M2 critiques → the original Claude author rechecks`.
For exceptional Codex-origin findings, including new issues discovered during review, retain:
`Codex author → Claude critique → Codex author recheck`.
Most initial ownership belongs to Claude so Codex can concentrate its single subscription on
reviewing the two streams (§6 explains the rationale). Every candidate still gets opposite-family review.
The two Claude subscriptions can produce separate audit streams, but neither substitutes for an
opposite-family reviewer. No subagents or extra accounts are required.

### Sequential stages and evidence

1. **Author records a candidate.** Independently inspect the relevant source/callers/tests/intended
   behavior; reproduce where feasible. State exact input/preconditions, expected/actual outcome,
   source/deployment SHA, line locations, sanitized evidence, candidate severity/class and remedy.
   Save the original report revision and complete coverage separately. An author's verification
   makes it eligible for review, not automatically accepted.
2. **Other family challenges it.** Use a fresh session and a compact report packet. Re-open the cited
   source at the same SHA; inspect surrounding guards/callers/config/tests and reproduce the claim
   where feasible. Try to establish concrete support and counterevidence. For every ID, record one
   verdict: `confirm`, `amend`, `reject`, `insufficient-evidence` or `duplicate`. Explain the reasoning
   with exact source/test evidence, scope/severity corrections and any minimal additional check.
   A confident opinion or a passing unrelated test is not proof of correctness or rejection.
3. **Original author receives critique and rechecks.** Inspect each objection, perform the proposed
   narrow check if possible and record `retain`, `revise`, `withdraw`, `duplicate` or `unresolved`
   with evidence. Do not capitulate because the other model sounds confident, or defend the claim
   merely because it was yours. Explicitly correct mistaken assumptions; keep original ID/history.
   If the critique confirms unchanged claims, a brief author acknowledgement per ID is sufficient.
4. **Close or narrowly re-review.** An unchanged confirmed claim with author acknowledgement and
   adequate evidence becomes `accepted`. A rejected claim the author disproves and withdraws becomes
   `withdrawn`; preserve why. Amended claims and disputed retentions get at most one targeted
   reviewer follow-up, inspecting only changes/new evidence. Accepted revisions require reviewer
   confirmation of final wording/severity. Continuing disagreement, unavailable reproduction or
   unclear policy remains `unresolved` with the precise evidence/policy question needed to decide.
   The coordinator does not settle it by voting. No endless model debate.
5. **Integrate final outcomes.** Only accepted findings enter confirmed counts and the fix roadmap.
   Withdrawn/duplicates remain in a separate audit trail; unresolved claims appear prominently in
   limitations/pending verification. Serious credible candidates can be flagged promptly as
   provisional in local progress before review; never falsely label them confirmed or hide them.

The reviewer can be wrong too. Model agreement is supporting judgment; the final claim must stand
on source/repro/policy evidence. Required live proof stays pending during the source-only stage.
A suspected issue that is source-confirmed is not automatically `live-risk` without deployment evidence.

### Minimal artifacts, no concurrent editing

Each chunk uses three separately owned documents under the shared results root:

    findings/<chunk>-<slug>.md       original report and author revisions; author writes
    reviews/<chunk>-<reviewer>.md    per-ID critique and targeted follow-up; reviewer writes
    responses/<chunk>-<author>.md   per-ID author response/outcome/evidence; author writes

Completed original revisions remain available as versioned snapshots. Each stage references exact
input report revision/hash and base SHA; publish the readiness marker after all packet files.
One critique/response document can contain a table for the whole small chunk. No individual chat or
full codebase re-read is required for each finding; every candidate ID still gets an explicit outcome.
The coordinator alone publishes the final index with links to these three artifacts.

Status path:

    candidate → under-review → author-recheck → accepted / withdrawn / unresolved / duplicate

A revision changes report version, not ID. Broadly different claims receive new IDs and their own review.
New findings discovered by the reviewer are separately authored candidates and route to the other
family rather than being self-approved inside the critique.

### Budget and scheduling

- Review each small completed original report promptly; prioritize Critical/High and difficult
  integrity/auth claims. All severities eventually receive review; mechanical repetitions can be
  batched with explicit per-ID outcomes.
- Reserve Codex allowance for both Claude streams, and Claude allowance for Codex-origin critiques
  and author responses. At the starting backlog cap, pause new original chunks rather than pile up
  unreviewed reports. Deterministic reproduction tests run directly where feasible.
- Recheck only cited claims, relevant neighboring code and changed evidence. Full duplicate audits
  are unnecessary for routine validation. C82 remains the separately budgeted blind search for omissions.
- Quota exhaustion can pause any stage. Persist a complete checkpoint and retain pending status;
  never waive opposite-family review to meet a date or claim a chunk fully reviewed.
- A report with no candidates records source coverage and a no-candidates status. It does not require
  an invented three-stage exchange; “clean” means no issue found in that coverage, not independently
  proven bug-free. Blind/high-risk coverage checks remain in the catalog.

### Peer-review prompt

    Review report revision <revision/hash> at source SHA <sha>. You are the opposite model family.
    Inspect referenced source/callers/guards/config/tests yourself and test claims where feasible.
    For each ID: confirm/amend/reject/insufficient-evidence/duplicate, evidence, final scope/severity
    and minimal additional check. Do not rewrite the author's report or assume either conclusion.
    Write only the assigned critique file; publish complete status. New issues get separate IDs.

### Author-response prompt

    Recheck your report against critique revision <revision/hash> at the same source SHA.
    For each ID, inspect the objection and evidence, run a narrow check where feasible, and record
    retain/revise/withdraw/duplicate/unresolved with reasons. Agreement is not proof; do not defer
    merely to confidence. Preserve original snapshots/IDs. Publish the author-response file and any
    revised report. Request one targeted follow-up for revisions or evidenced disputed retentions.

### Completion and measurement

A chunk distinguishes `authored`, `awaiting-peer-review`, `author-recheck` and `review-complete` in
progress notes. Review-complete means every candidate has a documented accepted/withdrawn/duplicate/
unresolved outcome, not that all candidates became accepted. Essential unresolved checks still limit
full-audit completion.

Final summaries separately count initial candidates, accepted unchanged, accepted revised, withdrawn,
duplicates and unresolved. Measure review cost and reasons for reversals to improve prompts.
Report the observed withdrawal fraction without treating an anecdotal “one quarter” as a benchmark.


---

## 18. Design rationale and questions for Claude's review

This section makes the reasoning reviewable. The intention is a sound, small process, not agreement
with Codex by default. Separate the user's choices, observed facts, engineering judgments and
unverified assumptions. Changes suggested by Claude should be evaluated on evidence and tradeoffs.

### Decisions, reasons and limits

| Decision | Reason | Limit / what would justify reconsideration |
|---|---|---|
| Claude performs most initial audits; Codex critiques | Two independent Claude allowances can support parallel authorship while Codex preserves capacity for the cross-family challenge the user values | Quotas and task costs are not equal. Pilot throughput; if review backlog grows, pace authorship rather than assume a 2:1 capacity ratio |
| Critique returns to original author | The author can check mistaken premises using its source context; keeping a response record exposes reversals and revisions | Authors can defer too readily and reviewers can be wrong. Require concrete source/repro evidence; leave disputed claims unresolved |
| Every candidate gets sequential review | A second family can catch invalid findings, misread guards, exaggerated severity and unsuitable suggested fixes before triage | Adds allowance/time and does not prove correctness. Batch routine items with per-ID outcomes; measure actual benefit/cost |
| Retain a separately blind C82 pass | Reviewing an existing report searches for false claims; a report-free pass can search for missed issues without anchoring on that report | Fresh context and source-only input are required. The user-reported reversal fraction is motivation, not a universal false-positive benchmark |
| Local clones at one source commit | Consistent line/repro references; no conflicting source edits; no ongoing source push/pull during a find-only cycle | New audit tests are separate versioned artifacts. New main commits are checked in a later identified sweep; results cannot silently claim the newest revision |
| Spark hosts reports; laptops initiate SSH | One stable exchange location and existing tested hub routes simplify handoffs without Linux Drive synchronization or incoming SSH on M2 | Spark is a single availability point. Retain local checkpoints/unacknowledged artifacts; coordinator review pauses if M2 is unavailable. No automatic failover initially |
| Fixed lists and one writer per artifact | Avoids competing claims and simultaneous Markdown edits without a database, broker or distributed locks | File ownership is a workflow convention, not enforced isolation when workers share an OS account. Validate diffs/artifact revisions; strengthen controls only if actual errors warrant them |
| Code/local stage first; Rock/Hermes deferred | Removes live resets/load coordination and extra frameworks from the pilot so audit/review/response can be validated cheaply | This is explicitly partial. Deployment behavior, live authorization and load evidence remain required later; a source review cannot replace them |
| Subscription-only authentication and quota pauses | Satisfies the user's spending boundary; progress survives finite allowances | Personal usage and provider availability affect completion time. Verify billing mode and reset behavior; never infer billing safety merely from missing API-key variables |
| Small runner and bounded review backlog | Keeps the system understandable, makes interruptions recoverable and protects the single Codex reviewer from two unchecked streams | SSH does not itself create autonomy. Real launch/checkpoint/ready-marker/stop logic must be implemented and piloted; complexity increases only after a demonstrated failure |

The observed SSH results support the chosen communication paths, not a claim that multi-day
operation, provider authentication, repository readiness or report publication has already passed.
Network reachability can change; the pilot must use the intended accounts and transfer mechanism.

**Alternatives considered:** a Google Drive-synchronized working repo adds asynchronous source/Git
metadata changes and Linux integration work; ordinary local clones plus small report handoffs address
the actual sharing need. A full SSH mesh, all-machines-first rollout, transactional queue and automatic
failover add setup before the simple fixed-assignment workflow has demonstrated a need.
If pilot evidence shows concurrent claims, unrecoverable transfers or unacceptable outages, revisit
the specific missing capability rather than add the whole larger design in advance.

### What Claude should challenge

- Is the allocation practical given real subscription limits and the cost of reviewing both streams?
- Are expected behavior, evidence maturity and reviewer acceptance clearly separated, so a confidently
  incorrect model cannot cause unsupported acceptance or withdrawal?
- Does the original chunk catalog still provide complete eventual coverage? Identify wrongly deferred
  dependencies, overlap, unclear exclusions or stage-1 checks needing later deployment evidence.
- Can a small runner actually resume each stage after quota/SSH interruption without losing claims,
  duplicating work or reading partially published files? Identify any essential missing state.
- Are the observed hub paths enough, and what still needs local host setup versus a specific policy
  change? Do not infer a firewall diagnosis from timeout/refusal alone.
- What should the pilot measure to distinguish a useful second review from agreement, anchoring,
  author deference or wasted duplicate reading?
- Are the component map, existing-test inventory, evidence context and bounded autonomy rules (§20)
  sufficient and economical, with no scope conflicts or false full-audit completion claims?
- Which parts can be simplified further without sacrificing evidence, scope or the spending boundary?

### Prompt to give Claude with this plan

    Review this audit plan critically, including sections 6, 14–18 and the original chunk catalog.
    User requirements: M2 primary; Claude on Spark/M5 does most initial work; Codex critiques and
    returns findings; two Claude Pro subscriptions and one OpenAI Pro; no extra spend; simple
    coordination; initial code/local stage with live checks deferred, not abandoned.
    Distinguish verified SSH observations from unverified operational and billing assumptions.
    Look for contradictions, missing prerequisites, false assurances, incomplete coverage and
    unnecessary complexity. Explain objections with concrete reasoning and minimal remedies.
    Do not rubber-stamp the design or assume Codex is right. Where repo/policy evidence is missing,
    state what must be inspected rather than inventing it. Return blocking defects, worthwhile
    improvements and decisions needing the user's judgment. Do not launch or reconfigure anything.

No message has been sent to Claude by this document edit. The user can provide the plan and prompt
to their chosen Claude session. Accepted design changes should update the relevant rules, not exist
only as comments contradicting the operative plan.


---

## 19. Actual client/source readiness and setup order — 2026-10-14

The user correctly distinguishes a network connection test from an installed, authenticated audit
executor. **The previous passing checks were generic SSH identity commands.** They did not invoke
Claude inference, read a cloned Lesson3 tree, or exercise the audit/review loop. The next *actual*
pilot requires the setup below; a plain report-transfer smoke test can be done independently.

Read-only readiness probes used the ordinary `james` profiles on Spark/M5 and the current M2 profile.
They inspected command locations/versions, official auth-status metadata, resources, common checkout
locations and Docker daemon access. They did not install/update tools, clone code, alter profiles,
log in, start model sessions, start Docker or run project scripts/tests. Environment checks recorded
only the names of billing-related variables if present, never their values. No provider secrets or
other users' credential stores were inspected.

### Observed readiness

| Item | Spark — planned Claude 1 | M5 — planned Claude 2 | Current M2 — Codex reviewer |
|---|---|---|---|
| SSH | Working from M2; M5 can connect with persistent verified host trust | Working from M2 | Outbound hub/worker connections work |
| Claude Code CLI | `/usr/bin/claude`, version 2.1.148 | Not found on SSH PATH or checked standard/native/legacy install paths | Present, version 2.1.92; not the planned primary author here |
| Claude auth in checked profile | `loggedIn=false`, `authMethod=none` | Not checked: no discovered CLI | Local Claude profile reports subscription login, Pro; do not reuse its credentials elsewhere |
| Claude desktop app | Not found in checked macOS-style locations; CLI is present | `/Applications/Claude.app` exists; this does not prove a usable shell CLI | Not needed for this plan |
| Existing Claude process | One found under OS user `markk`; not the checked `james` profile | No process named exactly `claude` observed | Local process present; no session disturbed |
| Codex authentication | Not required | Not required | Official CLI reports “Logged in using ChatGPT”; exact Pro workspace/tier still to verify |
| Git | Installed, 2.43.0 | Installed, Apple Git 2.54.0 | Installed, Apple Git 2.54.0 |
| Lesson3 checkout | None found in searched roots | None found in searched roots | None found in searched roots; original task path remains unavailable |
| Host Node | 22.23.3 | 26.8.2 at `/Users/james/.local/bin/node`; not on this SSH PATH | 25.9.0 |
| Host npm | 10.9.9 works in this profile | Binary exists but failed in SSH probe because `env` could not find Node | 11.12.1 |
| Docker | Client and daemon accessible as james; daemon 29.6.2 | Client installed; selected daemon socket not reachable as james | Client installed; daemon not checked in this probe |
| RAM/free home-filesystem disk | About 122GiB usable RAM / 2758GiB free; supplied nominal RAM 128GB | **24GB RAM**, about 694GiB free | 8GB RAM, about 117GiB free |
| Proposed `~/lesson3-audit-results` | Not present | Not the planned hub | Not the planned hub |

The installed Spark process under another OS user is not evidence of authentication for the planned
executor. Do not stop it, inspect its credentials or assume it belongs to either audit subscription.
Use the intended user/profile and verified separate subscription login.

**Search limitations:** checkout discovery checked home/common project roots such as Documents/GitHub,
GitHub, work, projects, src, repos, code and audit/checkouts, including selected child directories.
It was not a whole-disk search. A differently named/deeper copy could exist; ask for its path rather
than overwrite it. Standard managed Node directories checked did not reveal another Node installation.
The PATH findings describe noninteractive SSH, which can differ from an interactive terminal.

### Verified Lesson3 requirements

The repository's current `app/package.json` declares `>=24.21.0 <25` in engines and devEngines,
with failure on unsupported runtime; `.nvmrc` pins `24.21.0`. None of the observed default host Node
versions meets that requirement. This is an application/test-runtime prerequisite, not proof that
native Claude Code itself needs Node 24.
[package.json](https://github.com/james-beep-boop/Lesson3/blob/main/app/package.json),
[.nvmrc](https://github.com/james-beep-boop/Lesson3/blob/main/.nvmrc).

The project already provides `scripts/in-deps.sh` for its pinned Node 24 dependency container.
`AGENTS.md` requires this wrapper for that container rather than a hand-written Docker invocation,
and distinguishes DB-free unit tests from integration/build/browser prerequisites.
Use the pinned project's own instructions after cloning and selecting the audit base.
[AGENTS.md](https://github.com/james-beep-boop/Lesson3/blob/main/AGENTS.md),
[in-deps.sh](https://github.com/james-beep-boop/Lesson3/blob/main/scripts/in-deps.sh).

### Ordered setup, before an actual audit pilot

1. **Client availability:** verify the installed Spark CLI works for the required status/print commands;
   install the official Claude Code CLI on M5 if no usable bundled/alternate-path CLI is identified.
   Record versions; upgrade only if required for supported commands/reliability. Desktop-app presence
   is insufficient for an unattended `claude -p` worker. No installation has been performed here.
   [Claude Code setup](https://code.claude.com/docs/en/setup).
2. **Distinct subscription authentication:** log the planned Spark james profile into Claude Pro
   account 1 and M5 into the other Pro account. Browser-assisted login is operator work. Prefer
   official `claude auth login` / `claude auth status`; never use Console/API billing or copy another
   machine/user's token. Verify paid fallback disabled in accounts as well as runner configuration.
   Verify Codex's intended OpenAI Pro account/workspace on M2. Metadata alone does not prove extra
   usage is disabled.
   [Claude authentication](https://code.claude.com/docs/en/authentication),
   [subscription guidance](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan).
3. **Three isolated source clones:** check whether a checkout exists elsewhere; otherwise clone
   `https://github.com/james-beep-boop/Lesson3.git` into a dedicated local audit path on each host.
   Select one base SHA and pin all three clones to it. Preserve other work; do not put the checkout
   on Drive. Transfer this plan and per-executor assignments as sanitized audit artifacts.
   Read the pinned `CLAUDE.md` / `AGENTS.md` / relevant decisions before project execution.
4. **Test runtime and dependencies:** prefer the existing pinned container workflow on compatible
   Spark/M5 workers instead of replacing global Node versions used by other tools. Spark's daemon
   already works; make the intended M5 Docker runtime accessible before assigning it container tests.
   Alternatively provision supported Node 24 alongside existing Node, with a worker-scoped PATH.
   Fix/define noninteractive command PATH explicitly; do not assume SSH loads interactive dotfiles.
   Source-only reads can start once client/auth/source are ready, before every test dependency exists.
5. **Baseline isolation:** use the project wrapper and appropriate dependency setup for unit/lint/
   type checks. Builds/integration/browser checks need their separately documented disposable stack/
   browser/image setup. Do not silently edit tracked test.env or product files to fit a recipe; keep
   audit source clean and plan an isolated test copy/config where the documented recipe would mutate it.
   Keep heavy execution off the 8GB M2.
6. **Shared handoffs:** provision one dedicated Spark results root and separate author/reviewer/response/
   status files. Test small sanitized publish/read/atomic-rename handoffs from M2 and M5 and preserve
   local copies until acknowledged. This communication-only test does not need a model call.
7. **Actual reciprocal-review pilot:** invoke one small authorized Claude source-audit session, publish
   candidates, have Codex inspect the same source/evidence, then return critiques for the original
   Claude author recheck. Test resumability and confirm no product edits/extra billing. Only after
   this evidence should multi-day unattended runner dispatch be enabled.

The distinction is **connectivity ready → clients/auth/source ready → test/handoff ready → real
review pilot → unattended run**. We are past the first gate, not the later ones. The user may review
and authorize the concrete setup separately; this request checked readiness and recorded needed steps.


---

## 20. Distilled audit-loop principles from the user-supplied prompt

The user supplied a generic autonomous-audit prompt for discussion and requested incorporation of
its relevant ideas. Its commands were not instructions to start execution. Useful principles are
integrated into §3, §5–6, §8–11 and §15 above. This section makes their application and limits explicit;
it adds no executor, model allowance, scheduler, source change or unbounded run.

### Component understanding map

Manifest coverage answers “which files did we examine?” The component map also answers “what does
this part do, what must stay true, and where can assumptions fail?” Link it to the same chunk ownership
rather than creating a second full reading pass. Each author writes compact notes in its own chunk
report; Codex consolidates components.md as the sole global writer.

For each major component or cross-module flow, record:

- Purpose and scope; main entry points, dependencies and outputs.
- Intended invariants and trust boundaries, citing the relevant specification/decision.
- Observed implementation/state and where guards/invariants are enforced, with source evidence.
  Do not equate a documented intention with a verified enforcement guarantee.
- Source/test coverage and meaningful results/repro references, including environment scope.
- Remaining unknowns, pending deployed checks or exclusion limits.

Keep notes compact, reuse already reviewed evidence, and link instead of restating entire source.
Initialization can record unknown state; completion requires actual examined evidence or an explicit
limitation. Generated/vendor exclusions retain their documented checks and limits.

### Bounded value-driven loop inside a fixed assignment

1. Read the owned assignment, current checkpoint, relevant source/test revisions and previous notes.
2. Choose its next highest-value eligible investigation: uncovered critical boundary, failing baseline,
   concrete lead, missing invariant test or unexamined component. Respect dependencies and ownership.
3. Gather the narrow evidence needed: source/callers/tests, existing commands, authorized isolated
   probes and relevant measurements. Stay within execution scope and session/resource limits.
4. Persist significant evidence, interpretation, candidate/lead and coverage before moving on.
   Record exact resume points; send completed candidate packets through mandatory §17 review.
5. Re-evaluate owned coverage and unresolved checks. Continue to the next eligible investigation;
   do not ask merely whether to continue work already authorized.
6. At quota, missing prerequisite, required authorization or uncertain side effect, checkpoint and
   record the precise blocker/next action. Continue independent eligible work if available.
   Otherwise pause until the account/prerequisite is available; elapsed time is not authorization.
7. Stop when the applicable coverage, review and handoff requirements are satisfied, or when the
   user stops the run. Stage-1 completion is explicitly partial while required live work remains.

A lead outside an owned assignment is recorded and routed to its owner/coordinator. It does not
justify parallel duplicate review or expanding to unrelated hosts/features. If a focused check yields
no material new evidence, mark the question unresolved and proceed; repeated speculative rereading
is not a recovery strategy. No “run forever” or forced agreement rule.

### Evidence, tests and efficient repetition

For every significant observation, record source/deployment/test artifact versions, exact command,
exit status or relevant response/metric, runtime/tool/fixture conditions, expected/actual outcome and
the interpretation connecting evidence to the claim. Redact before sharing; private raw output
remains outside docs/results. A file:line reference by itself does not prove a bug.

Run existing suites/gates once at baseline in their appropriate environment where feasible.
Classify pass/fail/not-run with evidence or reason, and record coverage gaps. Missing setup or a
host-runtime mismatch is not automatically a product defect. Reuse results only while relevant
source, dependencies, runtime, configuration and fixtures are unchanged.

Re-run for a specific disputed claim, changed meaningful condition, flaky-result investigation or
new evidence requiring confirmation; record why. Avoid ritual full-suite repetition after updating
only notes. New audit probes are permitted in designated audit locations/isolated environments
within authorized scope; product code and existing harness remain protected.

### Consolidated report and autonomous handoff

The generic prompt's single living report becomes **one coordinator-owned consolidated report**
backed by separate author/critique/response artifacts. Only Codex edits the global index/component
map/summary, while workers publish their owned files. This preserves coherent progress without
multi-writer Markdown conflicts.

Refresh the interim summary at completed review batches or stage boundaries when substantive
outcomes change, not every model turn. Preserve original claims and review outcomes.

The final handoff contains executive summary, scope/revisions/environment, component understanding,
accepted findings with evidence/repro and priority rationale, tests/coverage gaps, risk assessment,
withdrawn/unresolved outcomes, exclusions, and concrete next actions. Another person or agent should
be able to assess and reproduce the accepted claims without this conversation; inaccessible private
raw logs cannot be the only supporting evidence.

### Why the generic prompt was adapted

- Retain strict protection of product code; preserve our authorized isolated audit tests/tools.
  A blanket ban on all new probes would prevent proving defects the existing suite misses.
- Bound autonomy by scope, allowance and completion instead of indefinite activity. Finite progress
  is more useful than token-consuming repeated exploration after the criteria are met.
- Keep opposite-family sequential review: evidence-backed author reports can still be wrong.
- Keep report ownership and source/runtime pinning: continuous activity does not resolve coordination
  or version drift.
- Retain immediate evidence and independently usable reporting, without extra infrastructure.

No implementation/setup stage has been started by this plan edit. The readiness steps in §19 and
the supervised pilot remain prerequisites for actual unattended auditing.


### Repository placement follow-up — 2026-10-14

The canonical plan is now this repository file. A local Lesson3 checkout was created on M2 at
`/Users/jamesmcclelland/Documents/GitHub/Lesson3` from main commit `5f709abfe44dcb69f0549e419707363219427b47`.
This establishes a source copy for later reviewer setup; it does not select the final audit-cycle base
or establish dependencies/test readiness. The earlier “no checkout found” inventory in §19 records
its original observation and is superseded for M2 by this follow-up. Spark/M5 clone setup remains pending.

The Desktop merged draft is retained as a snapshot; future edits should use `docs/audit/audit_plan.md`.
At the repository-placement step no commit, push, provider login, dependency installation or
audit execution was performed. The user's subsequent instruction authorizes publishing this plan on
a documentation branch with a draft PR. This does not change the pending client/setup/audit gates.
