# Whole-codebase simplification review

**Status: proposed, for Claude and James to review.** This PR designs the process. It does not
launch a review, add a command, change application code, or approve later cleanup work.

## What this should achieve

Do for the whole repository what `/simplify` does for one diff: find places where ARES Lesson
Plans can be easier to understand and maintain without changing what teachers and technicians can
do, and **turn the confirmed ones into small fixes**. This includes older code that a last-PR review
would never revisit. Finding nothing worth changing in a packet is a successful result too.

**Scope: reuse, simplicity (including altitude), efficiency and project conventions.** This is a
code-quality review. Security
testing, vulnerability hunting and the broader correctness audit are outside it. Existing
[audit work](audit/audit_plan.md) stays separate, with its own progress and operating rules. The
older [sequential review plan](CODE-REVIEW-PLAN.md) is background only.

## Roles and models

| Role | Who | Does | Does not |
|---|---|---|---|
| **Organizer** | GPT **Sol 6.1**, one long-lived session | Builds the first pass and packets, writes reviewer briefs, verifies every candidate against source, keeps the coverage list, writes the fix PRs, and records cost per packet. | Fan out more reviewers than the plan allows, or merge anything. |
| **Reviewer** | GPT **Luna**, one fresh session per perspective per packet | Reads the assigned files closely for one perspective and returns findings. | Edit any file, read another reviewer's report first, or decide what gets fixed. |
| **Challenger** | Claude, when available | Reviews each fix PR before it leaves draft. | Re-review findings that were rejected. |
| **Approver** | James | Approves policy questions and merges fix PRs. | — |

The split puts the expensive model where judgment matters: choosing packets, rejecting false
positives, and choosing the smallest safe fix. The cheaper model does the volume reading. The
pilot (§3) tests the split. If Luna's findings mostly fail verification, or it misses what Sol
finds when spot-checking, move review to Sol for the affected file types and record why. These
are James's chosen models; the process itself is model-neutral. Do not buy credits or assume a
subscription allowance on the strength of this plan.

## Four review perspectives

These are the four James chose. `/simplify`'s altitude lens (is the logic at the right layer?)
sits inside simplicity. Every reviewer also checks its own proposals against **Boundaries**.

| Reviewer | Questions to answer | Evidence to look for |
|---|---|---|
| Reuse | Does another implementation or shared helper already do this? Have copies drifted? | Cite each implementation and its callers. State which semantics match and which differ. |
| Simplicity, including altitude | Can the same behavior be expressed with less state, branching or indirection? Is code actually unused? Is a pattern stringly-typed, over-parameterised, or a near-copy with one variation? **Is the logic at the right layer?** For example: a special case patched in a caller that belongs in the shared helper; a policy decided in a component that belongs in `lib/` or an access function; a check repeated at three layers; a wrapper that only forwards. | Trace data and callers. Show the unnecessary step, state or abstraction and the behavior it currently preserves. For a layer move, name both layers, every affected caller, and show the move does not cross a browser/server, access or transaction boundary. |
| Efficiency | Is work repeated, unbounded, serial when it could be batched, or done for readers who do not need it? | For a concrete request or job path: count queries, scans, serial awaits or transferred fields. State input size. Distinguish measured from estimated. |
| Project conventions | Does the code follow the repository's rules and established patterns? Do names, field definitions, shared components, settings and documentation agree? | Cite the exact rule in AGENTS, CLAUDE, SPEC or current decisions and the code that departs from it. Distinguish a written rule from personal preference. |

Altitude matters most at whole-repository scale, because layer drift is what builds up after many
diff-sized PRs that each looked fine alone. The simplicity reviewer gives it explicit attention.

Similar-looking code is not enough to justify a shared helper. Before proposing a merge, check
permissions, transactions, error behavior, ordering, null handling and browser/server boundaries.

## Boundaries

- Review product code without editing it. Only the organizer edits, and only in fix PRs (§5).
- Follow `AGENTS.md`, `CLAUDE.md`, current `SPEC.md`, relevant decisions and approved designs. Read
  installed framework source when framework behavior matters.
- Preserve native Payload fields, access checks, immutable versions, transaction and lock behavior,
  parse-never-execute ingestion, and the pristine vendored generator. Do not "simplify" safeguards
  because their purpose is absent from the current file. Search `docs/DECISIONS.md` before calling
  something unnecessary.
- Preserve public routes, stored values, school/offline behavior and compatibility. Do not rename
  internal editing-access identifiers or describe a teacher with editing access as an "Editor".
- Review wording for Kenyan high school teachers. A shorter instruction must still match the actual
  screen or script. The public product name is **ARES Lesson Plans**.
- Do not edit historical records, applied migrations or generated output as cosmetic cleanup.
- No broad dependency upgrade, formatting sweep, new architecture or new feature. Do not extract
  every repeated fragment. Prefer the smallest change with a clear maintenance gain.
- No fixture writes, load tests, deployment or configuration changes on the Rock or another live
  installation. Runtime measurement uses the documented disposable environment.
- If an unrelated bug turns up, record a one-line follow-up and move on. Do not mix behavior
  changes into a simplification. Keep private details out of public reports.

## 1. Mechanical first pass

Per-packet reading is weakest at seeing copies **across** packets: a reviewer of packet A finds a
copy in packet K only if it happens to search for one. Tools do this cheaply and exhaustively, so
the organizer runs them once at the review commit, in a disposable checkout, and saves the output
in the report folder.

**Follow the repository's runtime rules.** `app/` requires Node 24 (`.nvmrc`, `devEngines`), so run
every Node tool through `scripts/in-deps.sh`, never a bare `npx` on the host (AGENTS.md). Pin an
exact tool version, at least two weeks old on the review date, and record it with the command
lines in the README so a later run is comparable. Do not add the tools to `package.json`. The
wrapper mounts only `app/`, so give it the root shell scripts as a read-only mount, for example:

```bash
scripts/in-deps.sh -v "$PWD/scripts:/scripts:ro" -- npx --yes jscpd@<pinned> src scripts /scripts \
  --ignore '<exclusions>' --reporters json,console --output .review-tmp/jscpd
```

Exclude generated and vendored files from every tool, using the same list as `eslint.config.mjs`
and `.prettierignore`: `src/payload-types.ts`, `src/payload-generated-schema.ts`,
`src/generator/vendor/**`, `src/app/(payload)/admin/importMap.js`, plus `node_modules`, `.next`
and applied `src/migrations/**` (custom migration logic is read by hand instead). Output written
under `app/.review-tmp/` lands in the disposable checkout; copy it into the report folder.

| Tool | Gives reviewers |
|---|---|
| `knip` | Unused files, exports and dependencies. Better than a model at proving code is dead; each hit still needs a caller check (dynamic imports, Payload config references, scripts). |
| `jscpd` over `app/src`, `app/scripts`, `scripts/` | Copy-paste clusters across the whole repository. |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json` | One-off unused-symbol report. Do not change `tsconfig`. |
| A helper inventory | One line per exported function in `app/src/lib/`, `access/`, `hooks/` and `fields/`: name, path, purpose. The organizer writes it from source. |
| Known hot paths | Seed efficiency with measured slow paths, starting with the Manage "versions" lookup (340–470 ms, 2026-10-24). |

Tool output is navigation, not findings. Every packet brief includes the relevant clusters, hits
and the full helper inventory.

## 2. Coverage and packets

The organizer starts a review branch from current `main` and records the full source SHA. Reports
refer to that SHA. Read existing audit findings and accepted tradeoffs, so they are linked rather
than rediscovered.

**Coverage by file type.** Not every perspective fits every file:

| Files | Perspectives |
|---|---|
| Handwritten source: `app/src` (excluding generated types and import maps), `app/scripts`, `scripts/`, SCSS | All four. |
| Tests | Reuse, simplicity and conventions (shared fixtures, copy-pasted setup, dead helpers, test-name rules). |
| Custom logic inside migrations | Reuse and simplicity; never edit an applied migration as cleanup. |
| Current docs, config, CI, Compose, `.env.example` | Conventions only: does it agree with the code and the rules? A default in `.env.example` can override an apparently correct default in code. |
| Generated, vendored, historical, binary | Not reviewed. List them as excluded, with the reason. |

Enumerate tracked files with `git ls-files` at the SHA and give each one a packet or an exclusion
reason. Coverage is one list: path, packet (or exclusion reason), status `pending | read | partial`.
No per-perspective states.

**Packet size.** About 1,000–2,000 lines of handwritten source per packet, grouped by
responsibility rather than directory, with the tests for that behavior attached. At the time of
writing, `app/src` handwritten TS/TSX is about 45k lines, tests about 58k, shell about 5.7k and
SCSS about 3.5k. That is roughly 30–45 source packets: about 120–180 reviewer runs for source
alone. State the remeasured estimate in the README before the pilot, so the pilot has something
to be compared against.

Suggested groups, to be remeasured:

| Group | Main responsibilities |
|---|---|
| Identity and permissions | Accounts, sessions, rate limiting, access functions, role assignments, auth endpoints. |
| Lesson data and release imports | Collections, fields, hooks, manifest and ZIP readers, CLI import, versioning. |
| Editing, drafts and combination | Editor components, recovery storage, comparison, merge logic, saving. |
| Reading and discovery | Library, search, favorites, public routes, lesson pages, sharing. |
| Documents and background work | Generator adapter and cache, DOCX/PDF boundary, queues, email jobs. |
| Messages, discussions and administration | Communication, moderation, Manage panels. |
| Shared presentation and guidance | Common components, CSS, Guide and manual parity. |
| Installation and recovery | Backup, setup, restore, updater, installer scripts and their shell tests. |
| Build, release and development | Docker builds, CI, release bundle publisher, environment templates. |

## 3. Pilot

Run **two packets** first: one application flow and one installation/backup flow. They exercise
different languages. Each packet runs to the end of §5, including its fix PR **if it has any
"fix now" findings**, so the pilot measures real output and not only reports. A clean packet with
no fix PR is a valid pilot result; do not manufacture work to have something to measure.

After each pilot packet, record: source lines, reviewer runs, elapsed time, available usage
information, candidates, how many survived verification, and lines changed in the fix PR. Then
decide: keep going, change packet size, change which model reviews which file type, or stop.
**Stop scaling if packets cost more than the fixes they produce are worth.** The decision and the
numbers go in the README.

One packet is active at a time. Respect the executor's concurrency limit: if only three slots
exist, queue the fourth reviewer. No nested teams.

## 4. Reviewer brief

Each reviewer gets: the source SHA; exact files; a short description of the behavior with links
to SPEC and decisions; entry points and associated tests; the relevant first-pass output; the
helper inventory; the Boundaries section; and this prompt with exactly one perspective:

> Review the supplied files at the recorded source SHA for **[perspective]**. Read the actual code,
> relevant tests, immediate callers and the existing helpers in the inventory. Respect the supplied
> project rules. Do not edit any file. Do not manufacture findings: an empty list is a good answer.
> For each candidate give: paths, line ranges and symbols; the present behavior; the concrete
> maintenance cost or repeated work; the smallest change; and the behaviors that must survive.
> Mark each as `confirmed in source`, `measured` or `lead`. Note any deliberate duplication that
> should stay. Return findings, files actually read, and anything you could not finish.

Reviewers form findings before seeing each other's reports. Reviewers may read beyond their files
to follow a caller; they say so and do not claim that file is covered. On a quota or context stop,
return what is done and exactly what remains. Do not fall back to a grep-only review.

## 5. Verify, then fix

The organizer checks every candidate against the source, all cited callers and relevant decisions,
then gives it one disposition: **fix now**, **later**, **rejected** or **needs James**. Four
reviewers are four perspectives, not four confirmations of the same claim.

Record each finding in one block:

```text
S-<group>-<n> · <perspective> · <disposition> · <paths:lines, symbols>
What it costs now:
Smallest change:
Must not change:
Verification:
```

Record rejected candidates and deliberate duplication in one line each, with the reason. This
stops the next session proposing the same harmful extraction.

**Each packet ends with at most one draft fix PR** containing its "fix now" findings, grouped by
shared behavior. A packet with no "fix now" findings ends with no PR. No repository-wide cleanup PR. The PR body lists each finding's invariant,
affected callers and checks. The usual rules apply:

- Changed endpoints or auth-affecting hooks need the project's wire-level permission tests.
- Generator changes need the existing fidelity checks. Generated database changes use project tools.
- UI changes need a real browser check at desktop and phone widths. Wording changes update SPEC and
  both Guides in the same PR.
- Backup, install and update changes need the relevant shell and restore-stack checks.
- Run type, lint and format checks and required CI. Passing tests do not prove a cleanup preserved
  untested behavior, so the "Must not change" line is checked by reading, not only by CI.
- A merged helper that replaces two copies must show, in the PR body, how their null, permission,
  error and transaction handling compared. This is the main way a simplification changes behavior.

Claude challenges each fix PR before it leaves draft: changed semantics, a missed caller, work
moved to the wrong layer, or added complexity. If no challenger is available, the PR says so.
"Needs James" findings go in the README for James. Opening a fix PR does not authorize merging,
tagging or deploying.

## 6. One cross-group pass at the end

After all packets, the organizer runs one bounded pass over the packet summaries, the helper
inventory and the first-pass clusters. It looks for copies and repeated policy decisions that
crossed groups, and for configuration defaults that disagree with code or instructions. Reopen
source for specific questions; do not load the whole repository at once. Useful flows to trace:

- Browser upload and CLI import → shared manifest rules → release preview → locked write.
- Edit/draft/combine → field permissions → immutable version → Official pointer.
- Install/update → environment defaults → backup destinations → status display → restore.

This pass produces findings and at most a few fix PRs. It is bounded: one pass, not a second
review of every group. It is required before the review counts as finished (see below).

## 7. Persist progress

Report location: `docs/simplification/<date>-<source-short-sha>/`, created when the review starts:

- `README.md`: source SHA, cost estimate, pilot numbers, progress, decisions for James, resume point.
- `first-pass/`: tool output and the helper inventory.
- `coverage.md`: the one coverage list from §2.
- `progress/<packet>-<perspective>.md`: a short record per reviewer run, a few lines long: files
  completed, files partly read (with where it stopped), files not started, and dependencies read
  outside the packet. This is what makes interrupted work resumable.
- `findings.md`: one block per finding and one line per rejection, with links to fix PRs.

Full reviewer transcripts and reports are working material and do not need to be committed; the
organizer copies the surviving findings into `findings.md` and the read record into `progress/`.
Keep secrets, raw mail, private environment details and sensitive repro material out of Git.

Keep the source SHA fixed while reviewing. Never rebase or rewrite a published branch. **Each fix
PR starts on a fresh branch from current `main`.** Before editing, revalidate its findings against
that `main`: the cited lines, callers and shared interfaces may have moved. Drop or update a
finding that no longer holds, and record the comparison SHA in the PR body. If `main` moved
substantially, list the newer unreviewed changes in the README. Never describe coverage of an old
SHA as coverage of current `main`.

## What "finished" means

The review is **finished** only when every in-scope file is `read` or explicitly excluded, every
candidate has a disposition, the cross-group pass has run, and every "fix now" finding has a PR.
The README then gives actual coverage, the fix PRs, deferred and "needs James" items, and checks
not performed.

Anything short of that is a **partial evaluation**, including a deliberate stop after the pilot.
A partial evaluation is a legitimate outcome, but it is reported as partial: the README states why
it stopped and keeps the remaining coverage visible (files still `pending` or `partial`, packets
not run, the cross-group pass not done), so a later session can resume or James can decide it is
not worth continuing.

Completion does not require accepting every proposal. It means James has a set of small,
reviewed cleanup PRs and a record of what was looked at, what was left alone, and why.
