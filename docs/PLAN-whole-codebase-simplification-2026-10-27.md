# Whole-codebase simplification review

**Status: proposed, for Claude and James to review.** This PR designs the process. It does not
launch a review, add a command, change application code, or approve subsequent cleanup work.

## What this should achieve

Find places where ARES Lesson Plans can be easier to understand and maintain without changing
what teachers and technicians can do. Review the complete tracked repository at a recorded commit,
including older code that a last-PR review would miss.

Use four focused reviewers, inspired by `/simplify`, working through bounded groups of files.
Each reviewer reads source and follows callers; tests are supporting evidence and later verification,
not the main discovery method. The coordinator checks the findings and proposes small cleanup PRs.
Finding nothing worth changing is a successful result too.

This is separate from the security and correctness work in [the audit handbook](audit/audit_plan.md)
and [catalog](audit/catalog.md). Those plans retain their own rules, scope and progress. Their
no-fan-out budget rule applies to that audit; this proposal explicitly uses bounded parallel review
for maintainability. Approval of this proposal would authorize its review process, not start the
other audit or authorize paid API usage. The older [sequential review plan](CODE-REVIEW-PLAN.md)
is useful background, not the operating procedure for this review.

## Four review perspectives

| Reviewer | Questions to answer | Evidence to look for |
|---|---|---|
| Reuse | Does another implementation or shared helper already do this? Have copies drifted? | Cite each implementation and its callers. Explain which semantics match and which differ. |
| Simplicity | Can the same behavior be expressed with less state, branching or indirection? Is code actually unused? | Trace data and callers. Show the unnecessary step, state or abstraction and the behavior it currently preserves. |
| Efficiency | Is work repeated, unbounded, or done for readers who do not need it? | Count queries, scans, serial calls, repeated calculations or transferred fields for a concrete path. State the input size and distinguish measured counts from estimates. |
| Responsibility and consistency | Does a rule live in the right layer? Are callers deciding the same policy differently? Does the code fit the project's established pattern? | Trace the UI, endpoint, hook and helper involved. Identify the existing owner of the rule and cite current SPEC or decisions. |

The last perspective is sometimes called “altitude”: whether code handles the right level of detail
for its job. It is not permission to invent layers or reorganize the repository.

All four read relevant tests, settings and documentation. For example, a default in `.env.example`
can override an apparently correct default in application code. Similar-looking code is not enough
to justify a shared helper: the reviewer must check permissions, transactions, error behavior,
ordering, null handling and browser/server boundaries.

## Boundaries

- Review product code without editing it. Reports are the only tracked changes during discovery.
- Follow `AGENTS.md`, `CLAUDE.md`, current `SPEC.md`, relevant decisions and approved designs at the
  reviewed commit. Read installed framework source when framework behavior matters.
- Preserve native Payload fields, access checks, immutable versions, transaction and lock behavior,
  parse-never-execute ingestion, and the pristine vendored generator. Do not “simplify” safeguards
  because their purpose is absent from the current file.
- Preserve public routes, stored values, school/offline behavior and compatibility. Do not rename
  internal editing-access identifiers or describe a teacher with editing access as an “Editor”.
- Review wording for Kenyan high school teachers. A shorter instruction must still match the
  actual screen or script. The public product name is **ARES Lesson Plans**.
- Do not edit historical records, applied migrations or generated output as cosmetic cleanup.
  Inspect custom migration logic and fresh-install dependencies; any actual migration defect needs
  its own carefully verified fix.
- No broad dependency upgrade, formatting sweep, new architecture, new feature, or automatic
  extraction of every repeated fragment. Prefer the smallest change with a clear maintenance gain.
- No fixture writes, load tests, deployment or configuration changes on the Rock or another live
  installation. Any runtime verification uses the documented disposable environment.
- If a reviewer discovers a likely correctness, data-integrity or security defect, preserve its
  evidence and route it to a separate bug/security review. Do not hide it in a refactor or claim
  that this review establishes security. Do not publish exploitable details or secrets in reports.

## 1. Establish the review commit and coverage map

The coordinator starts a dedicated review branch from current `main` and records its full source
SHA. Reports refer to that SHA even after report commits are added. Read the relevant existing
audit findings and accepted tradeoffs so they can be linked rather than rediscovered as new work.

Enumerate **every tracked file** with `git ls-files` at that SHA. Group by responsibility, not just
directory; associate tests with the behavior they exercise. Each file gets one primary group and
one explicit treatment:

| Treatment | Required review |
|---|---|
| Source, tests, scripts, configuration and current documentation | Read the file, its role and relevant callers; evaluate all four perspectives. |
| Generated files | Review source inputs, generation wiring and whether output is current. Do not claim a line-by-line read. Custom code inside migrations is source, not an automatic exclusion. |
| Vendored files and third-party assets | Review provenance, fidelity checks, callers and integration boundary. Do not propose editing the pristine generator or EFF word list. |
| Historical records | Use as context when relevant; check links used by current instructions. Do not rewrite history to make terminology uniform. |
| Binary or reference fixtures | Review ownership, consumers and checks that make them meaningful; no invented textual inspection. |

No blanket “other files” exclusion. New paths must receive an owner before completion is claimed.
Use explicit file lists, including dotfiles, so directory globs cannot silently miss settings or CI.

Suggested starting groups, to be remeasured at execution:

| Group | Main responsibilities and related files |
|---|---|
| Identity and permissions | Accounts, sessions, rate limiting, access functions, role assignments, auth endpoints and tests. |
| Lesson data and release imports | Collections/fields/hooks, manifest and ZIP readers, CLI import, release decisions, versioning and migrations. |
| Editing, drafts and combination | Editor components, recovery storage, comparison, merge logic, saving and their API paths. |
| Reading and discovery | Library/search/favorites, public routes, lesson pages, sharing and visibility decisions. |
| Documents and background work | Generator adapter/cache, DOCX/PDF boundary, queues, email jobs and job endpoints. |
| Messages, discussions and administration | Communication, moderation, Manage panels and account/system displays. |
| Shared presentation and guidance | Common components, CSS, accessibility, desktop/phone behavior, branding, Guide and manual parity. |
| Installation and recovery | Backup/setup/restore scripts, destination records, updater, installer, Compose, recovery documentation and shell tests. |
| Build, release and development | Docker builds, CI, tag/bundle publisher, environment templates, dependencies, code generation, test harnesses and development tools. |

These are starting assignments, not proof that a directory has been covered. Shared files get one
primary owner and links from dependent groups. The coordinator separately records interactions
that require the final cross-group review.

## 2. Pilot, then review one bounded group at a time

Start with **two small groups of files**: one application flow and one installation/backup flow.
They exercise different languages and review needs. Target roughly 1,000–2,000 lines of handwritten
implementation per packet, plus relevant tests and immediate dependencies. Split a packet if a
reviewer cannot read it closely; do not truncate its input and mark it done.

Before each packet, the coordinator supplies:

1. The source SHA and exact assigned files/ranges, plus their owning coverage group.
2. A short description of the behavior and its relevant SPEC/decision links.
3. Entry points, likely shared helpers and associated tests, as navigation aids, not conclusions.
4. The four reviewer prompts below. Reviewers form their own initial findings before reading one
   another's reports; this reduces copying of the first reviewer's assumptions.

Run four logical assignments per packet. Respect the executor's actual concurrency limit: if only
three worker slots exist, run three and queue the fourth. A single sequential worker can also use
four fresh sessions. Do not multiply four reviewers by every group at once or spawn nested teams.
One packet is active at a time during the pilot; expand only if measured cost and review quality
justify it. Do not prescribe a paid model, buy credits, or assume a subscription's allowance.

After each pilot packet, record source size, elapsed time, available usage information, candidate
count and how many findings survived verification. Adjust packet size and depth accordingly.
Stop scaling if review reports cost more effort than the useful changes they identify.

Each reviewer may read beyond the assigned files to follow a caller or find an existing helper.
Record that dependency read; do not silently claim the other owner's full review complete. Checkpoint
after a file or logical section, with exact remaining work. On a quota/context stop, persist and
resume; do not silently downgrade to a grep-only review.

## 3. Give each reviewer a concrete assignment

Use this common prompt, followed by exactly one perspective from the table:

> Review the supplied files at the recorded source SHA for **[perspective]**. Read the actual code,
> relevant tests, immediate callers and existing helpers. Respect the supplied project rules.
> Do not edit product code. Do not manufacture a finding quota. For each candidate, cite exact paths,
> line ranges and symbols; explain the present behavior, the concrete maintenance cost or repeated
> work, the smallest proposed improvement, and the behaviors that must survive. Search for existing
> implementations before proposing a new helper. Distinguish confirmed source evidence from a lead
> or an unmeasured performance claim. Record useful deliberate duplication that should remain.
> Return findings, files actually read, dependencies consulted, and exact unfinished work.

Each worker writes only its own report. The coordinator alone edits the shared coverage map and
summary. If the runtime shares a checkout, workers remain read-only and return reports for the
coordinator to save. Tests or experiments that mutate files belong in a separate disposable copy.

## 4. Verify and consolidate the findings

The coordinator reads each candidate against the original source, checks all cited callers and
consults relevant decisions. Review by four agents is four perspectives, not four independent
confirmations of the same claim.

Keep each surviving finding compact:

```text
ID: S-<group>-<number>
Source SHA; paths/line ranges/symbols:
Perspective; related findings or prior audit IDs:
Current behavior and concrete cost:
Evidence: source-confirmed | measured | lead; include commands/results if used
Smallest proposed change; why an existing helper does or does not fit:
Behavior and safeguards to preserve; specific verification needed:
Priority: worthwhile now | later | optional
Status: candidate | confirmed | rejected | duplicate | needs a decision
Reviewer objection and resolution:
```

Do not label a style preference a defect. Rank by concrete benefit, reach across callers and risk,
not line-count reduction. Record rejected candidates and deliberate duplication briefly, with the
reason; this prevents the next session proposing the same harmful extraction.

Before a finding becomes an implementation task, a fresh reviewer challenges it: has the proposal
changed semantics, missed a caller, moved work into the wrong layer, or added complexity? Prefer
Claude reviewing Codex-origin proposals and Codex reviewing Claude-origin proposals when both are
available. If no independent reviewer is available, mark that step pending. Disagreement stays
visible; the coordinator does not average votes into a conclusion. Policy changes go to James.

## 5. Review interactions across groups

Once the groups are read, run a bounded synthesis pass using their summaries and a map of shared
helpers. Reopen source for concrete questions instead of putting the entire repository into one
context. Track each of these flows explicitly:

- Browser upload and CLI import → shared manifest rules → release preview → confirmation → locked write.
- Edit/draft/combine → field permissions → immutable version → Official pointer → what readers see.
- Authenticated/public reading → visibility → preview/export/cache/email artifacts.
- Install/update → environment defaults and overrides → backup destinations → status display → restore.
- Source/tag → image version → checksummed release bundle → installer/manual instructions.
- Shared frontend/admin components → desktop/phone behavior → Guide and manual claims.

Look specifically for helper copies across groups, repeated policy decisions, unnecessary queries,
and configuration defaults that disagree with code or instructions. Record which symbols and flows
were traced. Per-file coverage alone does not complete this step.

## 6. Persist progress and handle changes to main

Proposed report location: `docs/simplification/<date>-<source-short-sha>/`. Create it only when the
review starts. Keep the artifacts small:

- `README.md`: source SHA, rules, progress, cross-group flow checklist, commands/evidence and resume point.
- `coverage.json`: every tracked path, primary group, treatment/reason, and four per-perspective
  states (`pending`, `partial`, `reviewed`, or `boundary-checked` for non-source treatments), with report links.
- `reports/<packet>-<perspective>.md`: evidence and actual read coverage; one writer per file.
- `findings.md`: consolidated IDs, dispositions, independent-review results and proposed fix order.

At checkpoints, compare the coverage map with `git ls-tree -r --name-only <source-sha>`: every tracked
path must occur exactly once and every required perspective must have its appropriate evidence.
Missing or partial files remain visible. “No finding” is not shorthand for “not read”.

Keep the source snapshot fixed while writing reports. Before proposing fixes, compare it with
current `main`: recheck changed files and callers affected by changed shared interfaces. New files
need assignment and review. Record the new comparison SHA and what was revalidated. If development
continues, report coverage of the fixed snapshot and a separate list of newer unreviewed changes;
never describe stale coverage as a review of current `main`.

Use one findings branch/PR with checkpoints. Keep secrets, raw mail, private environment details and
sensitive repro material out of Git. Respect account limits and leave an exact resume point rather
than launching unattended retry loops.

## 7. Turn accepted findings into small PRs

After the findings are reviewed and James authorizes implementation, group fixes by one shared
behavior or helper. Avoid a repository-wide cleanup PR. Resolve policy choices before coding.

For each fix, state its invariant, affected callers and appropriate checks before editing:

- Reuse existing baseline CI evidence at its exact SHA; do not rerun every suite per review packet.
  Passing tests do not prove a proposed cleanup preserves untested behavior.
- Changed endpoints or auth-affecting hooks need the project's wire permission-before-write tests.
- A bug fix must demonstrate its regression test failing before the fix and passing afterward.
- Generator changes need the existing fidelity checks. Generated database changes/types use project tools.
- UI changes need a real browser check at desktop and phone widths. Behavior or wording changes
  update SPEC and both Guides where applicable in the same PR.
- Backup/install/update changes need the relevant shell and restore-stack checks. Keep passwords
  out of arguments, environment variables, logs and committed evidence.
- Run appropriate type, lint and formatting checks, and required CI. Do not add tests that merely
  restate a reversible cosmetic edit. Record what ran, passed, failed or could not run.

Open fix PRs for review. Findings approval does not authorize merging, tagging, deploying, changing
production settings, or touching unrelated branches. Follow James's explicit instructions for those.

## What “finished” means

The evaluation is finished when every tracked file at the stated source SHA has its assigned
treatment and four-perspective evidence, all six cross-group flows are traced, and every candidate
has a recorded disposition. The final summary gives actual coverage, exclusions and pending newer
changes, the few highest-value proposals, deferred decisions, and checks not performed. Unresolved
independent review or missing source coverage means the evaluation is partial.

Completion does not require changing code or accepting every proposed simplification. It means James
can choose useful cleanup work from a defensible, resumable review, without mistaking it for a full
security audit.

## Questions for Claude's review of this proposal

1. Will the packet and coverage rules catch old code and cross-module copies without excessive paperwork?
2. Are the four perspectives distinct enough, and do the two pilot packets provide a useful cost check?
3. Can any step accidentally change behavior, erase a safeguard, or turn an unverified claim into a fix?
4. Are the existing audit plans and historical records kept separate without losing useful prior findings?
5. What can be removed from this process while preserving credible whole-repository coverage?
