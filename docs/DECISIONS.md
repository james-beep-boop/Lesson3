# Decisions & Lessons

Durable, team-visible record of decisions made during the build and lessons learned
from corrections. Committed to git (unlike the assistant's private cross-session memory).

- **SPEC.md** remains canonical for *architecture and domain rules*. This file is for
  build-time decisions and corrections that don't rise to the level of spec changes.
- **Newest entries on top.** Each entry: date, one-line title, then the decision/lesson
  and the reasoning. When a correction teaches a general rule, capture the rule, not just
  the incident.

---

## 2026-07-22 (latest) — PDF-preview latency: measured, and where the floor actually is

Operator flagged the edit-page "View as PDF" as ~10 s. Investigated with three external agents
(Nanoclaw, Hermes) plus GPT plus a direct Rock measurement. Recording the conclusion so the wrong fixes
don't get proposed again.

**The slow thing is LibreOffice, not any app route.** `/export/doc` is serve-only (~88 ms warm, 409
cold); Nanoclaw's "5 s /export/doc" was timing the `ensureExportReady` warm-up that runs *before* the
browser navigates there. Hermes's "it's the View-as-PDF chooser menu" is wrong too — that menu is an
instant local `versionDeliverables(currentContent())` scan with no network. Measured on the Rock:

- lessonSequence DOCX→PDF (the actual preview target, ~164 KB → ~796 KB): **~5.5 s** with soffice warm.
- a small deliverable: ~0.56 s warm, but the FIRST convert after idle pays **~1.8–2.5 s** LibreOffice
  cold-start (2487 ms → 567 ms; GPT's Gotenberg 8.34.0 log independently shows 2.411 s → 558/589 ms).
- DOCX generation ≈ 1.7 s (matches the 2026-… generation-vs-conversion split already recorded here).

So a cold lessonSequence preview ≈ 1.7 + ~2 + 5.5 ≈ **~10 s**. The two client paths differ: the
**unsaved** editor preview (`POST /preview-pdf`) is uncacheable (content isn't saved) and pays this on
every preview-after-edit — the recurring pain; the **pristine** path warms the cache then serves
`/export/doc` fast and can be made sub-second by pre-warming.

**Decisions / non-negotiables for the fix:**
- The ~5.5 s lessonSequence render is the LibreOffice **floor**. It is NOT reducible without changing
  the renderer, and we will NOT — PDF-from-the-approved-DOCX is the central fidelity invariant; an
  HTML-to-PDF shortcut is disqualified. So there is no honest "sub-second" for the *unsaved
  first-render-after-edit*; sub-second is only for the pristine (pre-warmable) path.
- **Do first: `--libreoffice-auto-start=true`** on the Gotenberg container — kills the cold-start,
  cheapest experiment, native. Note it keeps ONE stateful soffice that serializes conversions.
- **Do NOT raise `PREVIEW_PDF_MAX_CONCURRENT`.** A single LibreOffice serializes; a higher cap just
  lengthens the queue, it does not speed an individual preview. A *second* Gotenberg helps concurrent
  users' throughput, not single-preview latency. (This is the standing answer to "why not just bump the
  cap.")
- Later levers, in order: background pre-warm the pristine edit page (→ ~88 ms serve); a short-lived
  **in-memory** unsaved-preview cache keyed by a content hash (never persist unsaved teacher work);
  only then deeper conversion/hardware work behind fidelity checks.

Full plan + ranked options live in `NEXT-SESSION.md` item 1. This is a product-performance task, not a
correctness/security defect.

## 2026-07-21 — CodeRabbit round 3: runtime enqueue guard + a #139 race (#141, #142)

Small but two correctness-adjacent points, both found reviewing a CodeRabbit pass (and a dirty working
tree — see the process note):

- **The `req` guard has to hold at RUNTIME, not just compile time.** TypeScript's excess-property
  check only fires on fresh object LITERALS; a caller that builds the argument elsewhere and widens it
  is structurally assignable, so `req` would forward to `jobs.queue` and rejoin the transaction —
  re-opening the exact silent-rollback bug `enqueueDetached` exists to prevent. Fix: reconstruct
  `{ task, input }` inside the helper so only those keys can ever reach `queue`; pinned with a
  non-literal runtime test. The type-level check is necessary but was never sufficient on its own.

- **#139's orphan gate had a residual race.** The gate no-ops on a missing version, but
  `generateForVersion` then did its own `findByID`, so a delete landing between the two still threw a
  raw NotFound past the boundary. `generateForVersion` now accepts the already-loaded snapshot; the
  task passes what it gated on, making that read authoritative (#142). `emailVersionArtifact` reuses
  its loaded version the same way.

Also corrected a security-adjacent doc comment: "versions are not access-gated" was misleading —
version reads run under the caller's Payload access (`overrideAccess: false`); "Official" is only the
absence of an ADDITIONAL role gate, not the absence of access control. Don't let a comment license a
future authz mistake.

PROCESS: this work arrived as pre-existing uncommitted changes in the main working tree, of mixed
provenance (the session-start dirty status). Reviewed line-by-line, verified (tsc/lint/unit 225/int
73), then split into two PRs by concern — the CodeRabbit responses (#141) and the race hardening
(#142) — rather than committing a mystery blob. When you find a dirty tree you didn't make, read every
line before committing, and group by concern.

## 2026-07-21 — review round 2: enqueue type check, popup twins, orphaned pre-warm (#138, #139)

Two more review passes on the L3-03 / timing work, plus the spawned follow-up landing.

**`enqueueDetached` had QUIETLY lost the task↔input type check (#138).** My first cut typed it as
`Omit<Extract<Parameters<queue>[0], …>, 'req'>`. That correctly forbade `req`, but `Parameters<>` on
a GENERIC method instantiates the type parameter at its constraint — so `input` collapsed to the union
of every task's input, and `{ task: 'messagePing', input: <wrong shape> }` compiled where the native
`jobs.queue` rejects it. The correlation lives in the method's type PARAMETER, which is exactly what
`Parameters<>` erases. Fix: make the helper itself generic over the slug
(`<TSlug extends keyof TypedJobs['tasks']>`), mirroring the native signature so the pair is checked
again. Pinned in `tests/unit/enqueueDetached.spec.ts` with `@ts-expect-error` on BOTH negatives (a
passed `req`, and a mismatched input).

A verification lesson from this one: a standalone type probe compiled OUTSIDE the project reported
`input: JsonObject` and seemed to show the check still missing. That was the probe's fault — it did not
load the project's `declare module 'payload'` augmentation that wires `TypedJobs` to the generated
`TaskMessagePing`. The in-project type test is the only valid check. Don't trust a type probe compiled
without the project's tsconfig.

**The popup-twin fix got permanent coverage (#138).** #133/#135 fixed the unchecked `window.open`
retry (a blocked popup must throw, never resolve having opened nothing) but the property had no test —
and this twin divergence had already recurred once. Added tests for BOTH `openPreparedPdfInNewTab` and
`openGeneratedPdfInNewTab`: opened-tab, blocked-then-retry, both-blocked→throws, and blob-revocation on
the blocked path. Verified load-bearing — reintroducing the unchecked retry fails both "both blocked"
tests.

**Orphaned pre-warm is now a no-op, not a captured failure (#139).** The follow-up flagged in the #135
entry. Since #131, `prewarmVersionArtifacts` enqueues outside the caller's transaction, so a pre-warm
can outlive an ingest/promotion that rolled back and reference a version row that is gone — a benign,
expected outcome. `generateVersionArtifact` was reporting it as a full failure (logger.error +
captureException + rethrow), and those captures are ALSO how a genuine generator fault reaches a human,
so routine alerts for a design-accepted condition are how a real one gets waved off. Classified at the
boundary: the version `findByID` runs `disableErrors: true`, a null downgrades to logger.info + no-op,
every other error still captures + rethrows. This forced splitting the previously-concurrent
generate‖prefix-read (the gate must precede `generateForVersion`'s own findByID); cost is one indexed
read no longer overlapping the DOCX build. Test asserts the CLASSIFICATION (captureException NOT
called), not merely "did not throw"; a sibling test pins that a real failure still captures, so a
blanket swallow can't pass vacuously. Mutation-checked: `disableErrors: false` fails only the no-op
test.

Process note — this last change was authored in a SPAWNED session whose worktree had branched at
`23eaec8`, behind main. Two of its three files had moved under #135/#138, so it was reviewed and
re-integrated onto current main rather than committed as-is. When a spawned/parallel session's branch
is behind, integrate its intent, don't replay its diff.

**OPEN OPERATIONAL ISSUE — the Rock is rejecting SSH.** Mid-session `ssh david@rock5b` began failing:
first a changed host key (`accept-new` got past it), then `Permission denied (publickey)` for the key
that had deployed #136 earlier the same day. The name still resolves to the usual Tailscale IP and the
live site stayed healthy throughout (200 via cloudflared), so this is the Rock's SSH state changing —
likely a reboot regenerating host keys, possibly touched by the parallel session's Rock work — NOT a
laptop problem. Consequence: **#139 (a runtime job-handler change) is merged + CI-green but NOT
deployed**; the Rock runs the #136 build, where an orphaned pre-warm still emits the noisy capture.
This is alert-noise on a rare path, not a correctness/user issue. Needs operator attention on the Rock.

## 2026-07-21 — /simplify follow-ups, and a forced sharp major bump (#135, #136)

**A /simplify pass that caught a real bug, not just tidied.** Four cleanup angles ran over the L3-03
and timing-oracle work. Two independently flagged the same thing: `openPreparedPdfInNewTab` still had
the unchecked post-`await` `window.open` retry that #133 fixed only in its twin — and that one is the
teacher-facing per-document button and the editor's pristine "View as PDF", the MORE used path. A
blocked popup there resolved as success having opened nothing. The lesson: fixing one of two
deliberately-mirrored functions and trusting a prose "these are twins" comment is not enough; the
mirror has to be structural. Both now share `deliverToTab`.

**`enqueueDetached` — making the L3-03 invariant unrepresentable.** Three sites (Messages, prewarm,
and by #133 forgotPassword) each hand-omitted `req` from `jobs.queue` to keep the insert off the
caller's transaction. One token's difference, and the wrong one loses a write silently and remotely.
The helper takes no `req` parameter and derives its argument type from Payload's own signature with
`req` omitted, so passing one is now a COMPILE error (verified with a probe). The two required-contract
sites (export, email) still call `jobs.queue` directly, so the contracts read as visibly different
rather than differing by an optional key. Deliberately did NOT fold the try/catch in — the three catch
scopes genuinely differ, so centralising would silently change what each guards.

Also from the pass: prewarm enqueues now run concurrently (they were serial only because they shared
the caller's transaction connection — I deleted the comment saying so in #131 without removing the
serialisation); the messages widening scheme lives in one `widerHref` instead of a boolean re-derived
at two sites; a shared `tests/helpers/db.ts` for a drizzle cast that was hand-rolled and already
drifting across six sites (new code uses it; the five pre-existing specs are left as a landing place); and I corrected a FALSE claim I wrote in #131 (the artifact job does not "fail cleanly"
on a vanished version — it captures and rethrows; flagged as a follow-up, not changed unreviewed).

**Forced sharp major bump (#136), and how the two-PR split was decided.** Two HIGH advisories landed
mid-review: sharp's inherited libvips CVEs, and a `next` finding that was only `via: ["sharp"]`. The
advisory range is `<0.35.0`, so there was no 0.34.x patch — 0.35 was the ONLY forward option, a forced
major. Rather than bury a native-dependency major bump inside a quality-cleanup PR, I surfaced it to
the maintainer, who chose to land it as its own security PR first and rebase the cleanup on top. This
is the "upgrade deliberately, not on the weekly release train" rule working as intended: even a forced
bump gets its own reviewable change. Verified node (>=20.9.0 vs our 22.17.0) and the arm64 prebuilt
before bumping; after deploy, exercised the native binary on the Rock (`sharp 0.35.3 / libvips 8.18.3`
encoded a PNG) rather than trusting a clean boot — loading is not working.

**Recurring pattern worth a standing note:** this session hit FOUR newly-published transitive
advisories going red on `audit:prod` (js-yaml, fast-uri, immutable, sharp/next), none related to the
PR under review. The gate is doing its job, but reactively patching each mid-PR is friction. If it
keeps up, consider a scheduled deps-audit job so these surface on their own cadence instead of
ambushing unrelated work.

## 2026-07-21 — the forgot-password oracle was still open, through TIMING (#133)

**Byte-identical is not indistinguishable.** #124 made both branches return the same status and body,
and I treated the oracle as closed. It was not. The branches do very different database work — an
unknown address returns after one lookup; a real one updates a token, queries it back, and inserts a
job — and that is measurable from outside.

Measured on the Rock against real Postgres, n=20 per branch:

| branch | median | range |
|---|---|---|
| unknown | ~25 ms | 22.9–29.3 ms (very tight) |
| registered | ~90 ms | 60–140 ms |

The distributions barely overlapped, so a SINGLE request classified an address. The 5-per-target
daily cap is irrelevant against a signal that needs one sample. **Codex flagged this as "probable but
not timing-tested"; measuring turned it from a hypothesis into a confirmed, large leak.** The lesson
generalises: a uniformity claim about a response covers the bytes, and says nothing about the clock,
the job table, or anything else observable. State which channel was equalised.

**Fix: a fixed response-time floor** (400 ms, ~3x the slowest observed, env-tunable). The alternative
— equalising the WORK — was rejected because the asymmetry begins inside `forgotPasswordOperation`
(only a real account gets a token UPDATE), so matching it would mean mirroring Payload's internals,
the exact coupling the #126 token-lookup fix removed. Verified after deploy by re-running the same
probe: median gap **65 ms -> 0.2 ms**, ranges fully overlapping.

Honest limit: this narrows the channel, it does not provably eliminate it. Under load heavy enough
to push the known branch past the floor, signal returns. Hence the 3x headroom.

**A measurement trap worth remembering.** The first verification run appeared to show the fix making
things WORSE (known ~18 ms, unknown ~409 ms). The probe had already spent the 5/day budget on the
known accounts, so they were returning an unpadded 429 — thrown paths skip the padding. I was
measuring the throttle, not the handler. Clear the `forgotPassword%` rate-limit counters before
timing this endpoint. A result that looks dramatic and backwards is usually instrumentation.

**Also settled in #133** (all from the CodeRabbit/Codex review of #130–#131):
- Three comments in `prewarmVersionArtifacts`, `lessonPlan` and `Messages` still said job rows ride
  the caller's transaction — the opposite of what #131 had just done. Changing behaviour and leaving
  the prose is worse than either alone: it would have told a future reader atomicity was guaranteed
  after it was deliberately given up.
- `prewarmVersionArtifacts` had NO durability test; only the messages half of L3-03 was pinned, and
  prewarm is the half where a lost write costs a promotion or a 42-file ingest. Verified load-bearing
  by reinstating `req` there and watching that specific test fail.
- Adding a role fixture to that spec exhausted the shared **global signup budget** and broke six
  unrelated int suites — invisible when the file runs alone, because `fileParallelism: false` puts
  all the damage downstream. A suite that spends a shared budget must hand it back.
- The reset migration's `down()` cast job rows into a reduced enum, failing on any retained
  `passwordResetEmail` job — i.e. most likely during the very SMTP outage the task exists to survive.
- PDF preview could resolve having opened nothing: the post-`await` `window.open` retry was unchecked,
  so a popup-blocked preview reported success with no error. Silent success is the worst failure mode
  for the feature the operator called most-used.

## 2026-07-21 — L3-03 SETTLED: best-effort enqueues run OUTSIDE the caller's transaction

**The defect, confirmed at source.** `messagePing` and `prewarmVersionArtifacts` both promised in
comments that a failure to ENQUEUE could never fail the primary write. **It could, and the promise was
backwards.** Both passed `req` to `jobs.queue`, enlisting the insert in the caller's transaction, so a
failed insert ABORTED it. The surrounding catch swallowed the error, the hook returned normally, and
Payload committed — except installed drizzle's `commitTransaction` is:

```js
try   { await session.resolve() }   // COMMIT — throws, transaction is aborted
catch { await session.reject()  }   // ROLLBACK, error swallowed
```

A failed commit rolls back **without rethrowing**. Net effect: HTTP 201 with the created document in
the response body and NOTHING PERSISTED. The swallow was not protecting the message; it was hiding the
message's death. The stated "best-effort" semantics were never delivered.

**Decision: enqueue on a separate connection (omit `req`).** Three options were weighed:
- *Fail loud* (delete the catches) — honest, but abandons the intent: a ping hiccup would fail a
  message send, and a prewarm blip could fail a 42-file ingest.
- *Savepoint* — delivers the intent, but reaches into drizzle internals and is upgrade-fragile.
- **Chosen: omit `req`.** `jobs.queue` does `args.req ?? createLocalReq({}, payload)`, so omitting it
  runs the insert on a fresh connection that cannot poison the caller. Payload's own API, no internals,
  and it makes the existing catches mean what they always claimed.

**The trade, stated plainly:** the job row is no longer atomic with the primary write. If that write
rolls back for an unrelated reason after we enqueue, the job is orphaned. Accepted for side work, with
the handlers made tolerant: `messagePing` now confirms the message still exists before announcing it
(a "you have a new message" email for a message that does not exist is worse than silence), and the
artifact job already fails cleanly on a missing version — a lost prewarm just means the cold path.

**THE TESTING LESSON — the most transferable part.** The first regression test mocked `jobs.queue` to
reject, and **it passed against the broken code**. A rejected mock is a JavaScript throw; it never
touches the database, so nothing poisons the transaction. Reproducing this bug requires a REAL failed
statement on the caller's transaction connection — the test now executes `SELECT 1/0` on
`args.req`'s transaction when a `req` is passed. Only then does it discriminate: against the pre-fix
code the durability assertion fails with `expected +0 to be 1`, i.e. the row genuinely vanished.

Two near-misses on the way, both caught by testing the test rather than trusting a green run: an
earlier draft passed vacuously because the ping only fires on a recipient's FIRST unread (so the mock
never fired at all), and another read `queueSpy.mock.calls` AFTER `mockRestore()`, which clears them.
**Rule: a test for a transactional failure must fail against the unfixed code, and you only know that
by running it there.**

Also fixed alongside: `passwordResetEmail` lacked the `logger.error` + `captureException` wrapper its
sibling jobs have (flagged in the 2026-07-21 review). Rethrow is retained — retries are what let the
forgot-password endpoint honestly promise delivery.

## 2026-07-21 — browser tests are now a CI gate (L3-07)

The canonical gate ran unit + lint + audit + contract + int + http, but **no browser**. Role-specific
UI, admin customisations, retired-route redirects and the edit-view shell had no automated coverage at
all, so a browser-only regression — one that leaves Local-API and HTTP behaviour intact — could reach
production. Three separate reviews flagged that the assistant's browser verification was
manually reported and not independently reproducible; this session alone shipped two UI changes
(#121, #125) on that basis. Unblocked by #120, which removed the destructive fixed-account fixture.

`tests/e2e/manage.e2e.spec.ts` (6 tests, MARK-tagged and self-cleaning) now runs in CI. Three
constraints forced the exact shape, each verified by hitting it:

- **Not the `lesson3-deps` image** — it is `node:22-alpine`, and Playwright requires glibc.
- **Not `mcr.microsoft.com/playwright`** — it ships **Node 24** while this repo pins **22.17.0**. CI
  must reproduce the runtime we ship, not a different one. (A first attempt on that image failed, and
  the failure was initially misdiagnosed as a Node-24 incompatibility — it reproduced identically on
  Node 22, so the real cause was the missing tsx loader. Testing BOTH is what caught the wrong
  diagnosis before it was written down.)
- **Inside the compose network**, because the spec needs the app AND the database: it seeds its role
  fixture through the Local API, and postgres is deliberately unpublished.

Two non-obvious invocation requirements, both discovered empirically:
- **`npm ci --include=dev`** — `.env` carries `NODE_ENV=production`, so a plain `npm ci` silently omits
  devDependencies and Playwright itself is never installed. Same class as the documented `test:int`
  `NODE_ENV` gotcha; the failure mode is `npx` quietly fetching a temporary Playwright instead.
- **`npm run test:e2e`, never bare `npx playwright test`** — the script sets `--import=tsx/esm`, and
  without it the config's JSON import dies with "needs an import attribute of type: json".

Cost: roughly +2–3 min of CI (npm ci + a chromium download) for the first automated coverage of the
admin UI. Verified locally against the live compose stack before wiring: **6 passed in 20.5s**.

## 2026-07-21 — mixed-case emails broke reset delivery; three Payload-behaviour comments corrected

**The regression.** #124's endpoint resolved the user for enqueue with the RAW request email
(`email: { equals: email }`), but the operation above it finds the account with a NORMALISED one —
installed `forgotPassword.js` line 18: `(incomingArgs.data.email || '').toLowerCase().trim()`. So
`Teacher@School.org` returned 200, minted a LIVE reset token, and queued NOTHING. Account recovery was
silently dead for anyone who capitalises their address or leaves a trailing space. Reproduced against
the real stack before fixing: `200 / token issued / jobs queued: 0`.

**Why the tests missed it, which is the more useful lesson.** All 95 wire tests passed because every
fixture address is lowercase. The suite only ever exercised the normalisation-agnostic case. *A test
suite whose fixtures are uniformly well-formed cannot detect a normalisation bug* — the regression test
added here deliberately submits an UPPER-CASED, whitespace-padded address.

**The fix resolves the user BY THE RETURNED TOKEN, not by re-matching the email.** Copying Payload's
`.toLowerCase().trim()` would fix today's symptom while re-creating the same class of coupling: our
normalisation would silently drift from theirs on any upstream change. The token is the operation's own
output and identifies exactly one row, so it cannot drift. This does NOT reopen the enumeration oracle —
the response stays uniform — and that was re-verified after the fix.

**Three comments describing Payload behaviour incorrectly (P3) — corrected, because inaccurate
security reasoning is what produced the bug above.**
1. `ingest/index.ts` claimed the creates succeed because `req` carries no `user`, and that attaching one
   would cause a 403. **Wrong.** Local API `overrideAccess` defaults to TRUE and bypasses access
   independently of `req.user`. The absence of a user matters for a *different* reason —
   `hooks/fieldSplit.ts` treats a user-less request as a system path. Both facts are load-bearing; they
   are not the same fact. `overrideAccess: true` is now passed EXPLICITLY on both creates so the
   dependency is visible at the point of risk rather than riding a default.
2. `endpoints/forgotPassword.ts` implied completed jobs are retained. Payload's `deleteJobOnComplete`
   defaults to true; succeeded jobs are removed (retry-exhausted ones are kept).
3. `jobs/passwordResetEmail.ts` and the prior DECISIONS entry said a consumed reset "clears" the token.
   Installed `resetPassword.js` sets `resetPasswordExpiration = now` (line 63) and LEAVES
   `resetPasswordToken` in place — it expires the token rather than erasing it. The handler was already
   correct (it checks expiry, not mere presence); only the stated reasoning was wrong.

**Standing rule reinforced:** when reasoning about a dependency's behaviour, read its control flow.
Three of these four items were plausible-sounding claims about Payload that the source contradicts.

## 2026-07-21 — forgot-password oracle closed server-side; PDF preview made completion-aware

Two fixes completing threads opened by the 2026-07-20 audit.

**1. Forgot-password: the oracle is closed at the SERVER (L3-R1).** The 2026-07-20 revert stopped our
UI displaying the difference but left the leak open to a direct API caller — the server still answered
200 for an unknown address and non-2xx for a real one whose SMTP send threw. A shadowing
`POST /forgot-password` (`endpoints/forgotPassword.ts`, same mechanism as `endpoints/verifyEmail.ts`)
now runs the operation with **`disableEmail: true`** — so no send can throw in-request — and hands
delivery to a retrying `passwordResetEmail` job. Both branches return an identical 200 and body.
- Because delivery retries, "a reset link is on its way" is now TRUE, not merely uniform — which also
  resolves the false-success complaint that motivated the reverted #119. The right fix was never in
  the client.
- **The throttle survives the shadow.** Unlike verify (whose native op runs no hooks), the
  forgot-password OPERATION runs collection `beforeOperation` hooks, so `rateLimitAuthOperations`
  still fires. Proven over the wire: 5×200 then 429. This was the main risk of shadowing.
- **The job takes a user id, never the token.** Succeeded jobs are deleted, but jobs that exhaust
  retries are RETAINED — exactly the SMTP-outage case — so a token in the input would persist a live
  reset credential precisely when delivery was failing. The handler reads the current
  `resetPasswordToken` off the user row, which already holds it and clears it on use.
- The email template moved out of `Users.auth.forgotPassword.generateEmailHTML` into the job; a
  generator left there would be dead code, since the endpoint disables inline send.
- **Corrected a stale comment** in `payload.config.ts` claiming completed jobs are retained. Payload's
  `deleteJobOnComplete` defaults to TRUE and is not overridden — verified empirically (row present
  immediately after enqueue, gone after autoRun). I designed against that false claim before checking
  it; it is fixed rather than left to mislead the next reader.

**2. PDF preview is completion-aware (L3-12).** The unsaved "View as PDF" submitted a hidden form to
`_blank` — fire-and-forget, so the client could not observe completion and gated re-clicks on a FIXED
3-SECOND timer. Measured on the Rock, a 12-lesson conversion takes **5.3–6.9 s** (11.3 s queued), so
the button re-enabled mid-conversion on effectively every production preview; a user seeing an
apparently-ready button clicks again, fills the second conversion slot, and a third attempt renders the
endpoint's raw JSON 503 as an entire browser tab.
- Now `fetch`-based (`openGeneratedPdfInNewTab`), mirroring the tab choreography of the existing
  `openPreparedPdfInNewTab`: **open the tab synchronously inside the click gesture** (a `window.open`
  after an `await` is popup-blocked — this is why it cannot be `fetch().then(open)`), show
  "Preparing…", then point that tab at a blob URL, closing it and surfacing the message inline on
  failure. `pdfBusy` is now held until the request SETTLES.
- Browser-verified: the button reads "Preparing…" and is disabled for the real conversion duration,
  then releases on completion. **The old fixed 3 s was wrong in BOTH directions** — too long locally
  (dead button after the PDF was ready) and far too short on the Rock.
- **The conversion cap of 2 is CORRECT and untouched.** Gotenberg saturates a core per conversion
  against a `cpus=2.0` budget; raising it would only make every conversion slower. The defect was
  entirely client-side feedback, never capacity — "we're getting 503s, raise the limit" is the
  tempting wrong fix.
- The HTML **Preview** button keeps the form-POST: at ~1.7 s it is a far weaker case and does not
  provoke the re-click cascade. Deliberately not changed.

## 2026-07-20 — REVERTED: the forgot-password `res.ok` fix created an enumeration oracle

**A same-day correction of my own change, and a lesson about overturning recorded decisions.**

#119 added a `!res.ok` branch to `ForgotPasswordForm` so that server failures surfaced instead of a
false "a reset link is on its way". It shipped and deployed. **It was a security regression and is now
reverted.**

**Why it was wrong.** I justified overturning the deliberate 2026-07-17 posture with: *"Payload returns
200 for an unknown address, so a non-OK status means a SERVER failure, never 'no such account'."* That
is half-true, and the missing half is fatal. In installed
`payload/dist/auth/operations/forgotPassword.js`:

- unknown address → `if (!user) { commitTransaction(); return null }` — returns EARLY, **no email is
  ever attempted** ⇒ HTTP **200**
- real account → falls through to an **unguarded** `await email.sendEmail(...)` ⇒ **throws** on SMTP
  failure ⇒ **non-2xx**

Server failure therefore happens **only for addresses that exist**. During any SMTP outage the status
code discriminates registered users perfectly, on an **unauthenticated** endpoint. The per-address (5)
and global (100/day) caps bound enumeration volume but do not remove the oracle. Credit to the external
review for catching this.

**The general rule this earns:** when overturning a recorded decision, the burden is to disprove the
ORIGINAL reasoning against the actual implementation — not to construct a plausible-sounding argument
that the objection no longer applies. The 2026-07-17 decision was better founded than I credited, and
one `grep` into the installed operation would have shown it. *Read the dependency's control flow before
asserting what its status codes mean.*

**Where this leaves us.** The known cost is back: a genuine send failure is reported to the user as
success. **That cannot be fixed in the client at all** — the client can only echo what the server's
status already leaked. The real fix must make the SERVER's responses indistinguishable:

- **Preferred — queue the reset email** through the existing jobs queue with retry/outbox semantics.
  Then `sendEmail` never runs inline, both branches return 200 identically, AND "a reset link is on its
  way" becomes *true* rather than merely uniform. The project already has an email task
  (`20260702_230926_add_email_task`), so the machinery exists.
- Acceptable alternative: shadow the endpoint (the project already shadows `POST /verify/:id`) and
  catch send failures server-side, always returning 200 while logging + alerting the operator.
- A global SMTP-health signal is only safe if it is computed independently of whether the account
  exists.

Tracked as a follow-up; **not** attempted in the revert, which is deliberately minimal.

**Two test-quality fixes from the same review:**
- The anti-enumeration assertion submitted the SAME address twice, so it only proved two mocked 200s
  render alike. It now submits a **distinct unknown vs registered address with distinct statuses
  (200 vs 500)** — the exact pairing that leaked — and asserts identical output. Verified to FAIL when
  the oracle branch is reinstated (5 of 8 cases).
- The plan-create wire test accepted any 4xx; it now pins **403** exactly. The submitted plan is valid,
  so the only legitimate rejection is the access deny — a broad 4xx would let an unrelated future
  validation error silently satisfy an authorization test.

## 2026-07-20 — retire the unsafe legacy e2e fixture and the broken PDF pixel gate

Two deletions from the audit's remediation sequence (PR C). Both remove hazards rather than features.

**1. `tests/e2e/admin.e2e.spec.ts` + `tests/helpers/seedUser.ts` — DELETED (L3-06).**
`seedTestUser()` **deleted and recreated a FIXED identity** (`dev@payloadcms.com`) via the Local API,
where `overrideAccess` defaults to true — so collection access offered no protection. Pointed at a
persistent database through `DATABASE_URI` it would destroy a real account of that name. The spec also
navigated hardcoded `http://localhost:3000` URLs despite `playwright.config.ts` supporting remote mode.
- **Deleted rather than rewritten** because the three tests were untouched `create-payload-app`
  scaffolding asserting *Payload's own* dashboard/list/edit views render — near-zero regression value
  for Lesson3, and `tests/e2e/manage.e2e.spec.ts` already drives the real custom admin surface for all
  three roles using the safe MARK-tagged, self-cleaning, `E2E_BASE_URL`-derived fixture. Login and
  `/admin` load are covered there, so no coverage is lost. `tests/helpers/login.ts` is KEPT (manage
  uses it); only the fixed-account helper goes.
- **No disposable-environment guard was added**, deliberately. The MARK fixture's bounded
  `like`-delete against the live DB is an existing, documented design decision (the http suite runs
  that way on purpose); a hard disposable-only guard would contradict it. The hazard was the
  fixed-identity delete, and that is now gone.

**2. `scripts/pdf-fidelity-check.ts` — DELETED (L3-08a).** Two independent reasons:
- **The methodology was already abandoned.** It pixel-compared our LibreOffice/Gotenberg PDF against a
  Word-exported oracle. Different rendering engines legitimately differ; this can never be a clean
  pass/fail.
- **The parser was broken.** `compare -metric AE` writes `1234 (0.0188217)` to stderr — absolute count
  AND normalised fraction. The code did `stderr.replace(/[^0-9.eE+-]/g, '')`, concatenating them into
  `12340.0188217`, so it emitted impossible percentages. **Any failure it reported was an artefact,
  never a product-fidelity result** — including the "0/3" a recent external audit correctly discounted.
- A *broken* gate is worse than no gate: it invites either false alarm or false confidence. **DOCX
  remains the authoritative layout deliverable and IS gated** (`fidelity-spike` 4/4,
  `adapter-fidelity` 6/6, plus real Gotenberg conversion exercised by CI's http suite).
- **If a PDF regression gate is ever wanted it must be SAME-ENGINE** — compare our own Gotenberg output
  across builds — not Word-vs-LibreOffice.
- Active pointers removed so the repo stops instructing anyone to run a deleted gate:
  `src/generator/docxToPdf.ts` comment, and the NEXT-SESSION "In-flight follow-ups" item + the
  "Finish PDF (§9)" track. **Historical CHANGELOG/DECISIONS references are deliberately left intact
  as history.**

## 2026-07-20 — audit session: shared-computer deployment, session-expiry work loss, PDF preview

A read-only audit session (no product code changed) during an external review window. Three durable
decisions plus measured facts worth keeping.

**1. Shared computers are the deployment default — this is now a design constraint.** The operator
confirmed shared school computers are "basically universal" in Kenya. Consequences that must inform
every future auth/storage decision:
- **No client-side persistence of user content.** `localStorage`/IndexedDB drafts persist in the
  browser profile across logout and users; the next person at that machine can read them with devtools.
  Namespacing by user id prevents an accidental *restore*, not *exposure*. (This REVERSES an earlier
  same-session recommendation of a `localStorage` draft — it was wrong for this deployment.)
- **`admin.autoRefresh` stays OFF and the 2 h `tokenExpiration` stays.** The walk-away case IS the
  normal case on shared hardware, and the next person at the keyboard may be a student, not a
  colleague. The risk is mostly misattribution and accident rather than malice, but an indefinitely
  self-refreshing session on a shared box is the wrong direction. An idea to enable `autoRefresh` as a
  cheap mitigation for the work-loss defect below was raised and **rejected** for this reason.
- **Clearing the editor off screen at expiry is itself a privacy control**, not merely a side effect.

**2. Session expiry silently destroys unsaved lesson edits (L3-13) — confirmed by source trace.**
Payload's `forceLogOutTimeout` → `redirectToInactivityRoute()` → **`router.replace()`**, a programmatic
client-side navigation. Payload's dirty-form guard `usePreventLeave` registers **only** a `beforeunload`
listener and a document **click** listener, so it cannot intercept programmatic navigation. The editor
unmounts and unsaved work is gone; `replace` also drops the page from history. There is no autosave and
no draft persistence anywhere. Two distinct paths exist: foreground (Payload's timer → destructive
unmount) and backgrounded-then-refocused (our `IdleLogout` → `logOut()`, which does NOT navigate,
leaving a **zombie editor**: work on screen, session dead — a privacy leak on shared hardware).
- **`IdleLogout`'s docstring is factually wrong** (`components/IdleLogout/index.tsx:15`): it claims
  `logOut()` performs a "logout + redirect"; `logOut()` performs no navigation. Fix when touched.
- The fix direction is **capture the working copy, then clear the screen** — NOT "stop unmounting".
- Design drafted in `docs/DESIGN-working-drafts.md` (a user-owned, server-side `working-drafts`
  collection). Not implemented; warrants a SPEC amendment before it is.

**3. PDF preview — the teacher path is healthy; the editor's unsaved preview has a client-side defect.**
Measured on the Rock (8-core aarch64), 12-lesson document:
- **Teacher path** (`/export/doc?as=pdf`, artifact cache): **121 ms**, uncapped, unaffected by the
  conversion semaphore. This is what teachers use — no glitch risk found.
- **Editor unsaved preview** (`POST /preview-pdf`, synchronous Gotenberg): **5.3–6.9 s**, and **11.3 s**
  queued behind a busy slot. The client's `pdfBusy` window is a fixed **3 s**, so the button falsely
  signals readiness on **100 % of production previews**, inviting a re-click that consumes the second
  conversion slot; a third attempt renders a **raw JSON 503 in a new browser tab** (every error path on
  that endpoint does, because it is a form-POST targeting `_blank`).
- **The cap of 2 (`PREVIEW_PDF_MAX_CONCURRENT`) is CORRECT and must not be raised** — Gotenberg
  saturates a full core per conversion against a `cpus=2.0` allocation, so raising it only slows
  everything. **The defect is entirely client-side feedback, not capacity.**
- Fix direction: make completion observable — open the tab synchronously on click, then `fetch`, then
  point that tab at the blob (NOT `fetch → window.open`, which popup blockers reject); keep `pdfBusy`
  until the request settles; render errors in the existing inline alert.
- Cost split: DOCX generation + mammoth ≈ 1.7 s; LibreOffice ≈ 3.5–4 s (~70 %). A ~$20/mo VPS would be
  ~1.5–2× faster single-core (≈3–4 s) — an improvement that does **not** fix the defect.
- The HTML Preview button (~1.7 s) shares the fire-and-forget pattern but is a much weaker case.

**Node version — the documented pin was not enforced.** `AGENTS.md` stated Node is "pinned to
22.17.0 via `.nvmrc` + volta", but **no `.nvmrc` existed** and volta is not installed on the operator's
Mac; `engines.node` is `">=22.17.0"`, a floor that happily accepts anything newer. The Mac had drifted
to **Node 25.8.1** (odd-numbered → never LTS, ~6-month life), four majors ahead of production. Effect:
`npm run generate:types` fails locally with `ENOENT … node:path?tsx-namespace=…`. This does NOT affect
production or CI — both run `node:22.17.0-alpine` from the Dockerfile (Rock container verified at
22.17.0) — but it means the 2026-07-09 note that "migrations AND types generate OFFLINE on this Mac"
holds **only under Node 22**. A real `.nvmrc` is now committed so the documented pin binds.
Follow-up: consider tightening `engines` to a range (`>=22.17.0 <23`) so npm warns on drift, and plan a
deliberate Node 22 → 24 upgrade before 22 leaves support (verify current LTS status at nodejs.org).

**Method note (correction discipline).** Several claims in this session were wrong and were corrected
by review before they became decisions: an HTML-preview timing quoted from an n=2 sample that included
a cold start; a cap attributed to `JOBS_AUTORUN_LIMIT` instead of `PREVIEW_PDF_MAX_CONCURRENT`; a claim
that L3-03's false-success reaches the ordinary editor save (it does not — `versionEdit.ts` is properly
transactional); and a claim that re-login returns the user to the editor (it does not —
`login/LoginForm.tsx:38` is a hardcoded `router.replace('/')` with no redirect handling). **Rule:
measure to steady state before quoting a number, and check how THIS app overrides a library before
reasoning from library source.**

## 2026-07-20 — `main` is a PROTECTED branch; nav-label routes redirect; #111 audit record

Three items from the 2026-07-20 session.

**1. `main` is now a PROTECTED branch — the direct-to-main allowance is RETIRED.** A direct
`git push origin main` is rejected with `GH006: Protected branch update failed` ("Changes must be made
through a pull request" + required status check `gate`). This supersedes the 2026-07-14 workflow note
below and every "shipped direct-to-main" description in the older entries: **every change now needs a
branch → PR → green `gate` → merge, including docs-only commits.** Protection was enabled sometime
after `b77310e`. Practical consequence: don't plan a "commit straight to main" step for small doc
fixes — it will fail mid-task.

**2. Nav-label routes are REDIRECTS, not aliases (#114).** `/lessons` and `/manage` returned 404 on
the live host. The two top-nav LABELS are "Lessons" and "Manage", but the canonical routes are `/`
(the catalogue) and `/admin` (Payload manage) — there is a `lessons/[id]` dynamic route but no
`lessons/` index, and no `/manage` at all — so users typing the visible label as a URL 404'd.
- **Chose redirects over restoring aliases.** An alias would mean a second catalogue page to keep in
  sync with `/`; the app has ONE canonical catalogue, so a redirect keeps a single source of truth.
- **Config-level (`next.config.ts` `redirects()`), not middleware** — the same routing-layer mechanism
  already used for `/admin/login` → `/login`: it fires BEFORE route resolution, so it cannot 404, and
  the CSP middleware stays untouched.
- **`source: '/lessons'` is an EXACT match**, so `/lessons/[id]` lesson pages are unaffected. Verified:
  `/lessons/143` still routes to the lesson page and `/lessonsX` still 404s (no prefix sweep).
- **307 temporary, not 308 permanent**, deliberately: `/` and `/admin` stay canonical, and nothing is
  permanently cached in browsers in case a real `/lessons` index is ever added.
- Deployed and verified live on test.kenyalessons.org (CHANGELOG 2026-07-20).
- **Operational gotcha worth keeping:** the production build sets a **Secure, host-scoped** auth
  cookie, so `curl` over plain http silently drops it and every authed call 401s. Use
  `Authorization: JWT <token>` for authed API checks against the Rock — a 401 there is usually the
  transport, not a regression.

**3. #111 (Subject-Admin duplicated-lesson resource preservation) — post-merge audit record.** A
5-agent `/code-review` (CLAUDE.md compliance, bug scan, git history, prior-PR comments, code-comment
compliance) found **no security/RBAC/CLAUDE.md/correctness issue**. This matters because **CodeRabbit
was rate-limited on #111 and never posted a review** — that audit is the change's only substantive
review. Confirmed properties: only server-stored resource values can persist (the caller's submission
is a lookup key, never persisted); the Editor cardinality check still rejects added rows *after* the
preservation runs (covered by the pre-existing wire test at `endpoints.http.spec.ts:669`); foreign row
ids are stripped before create. **Open, non-blocking follow-up:** the duplicate-match is byte-exact
(`canonicalJson(stripIds(...))`), so a reordered-but-phase-complete or re-serialized `resourceLinks`
array would miss the match and fall through to the generatable gate. It **fails safe** and is not
reachable via the current Payload duplicate-row UI (which preserves order), so it was scored below the
reporting bar — but a reorder/serialization regression test, or stripping ids inside
`preserveLessonResourceLinks` itself, would harden it if the array shape ever changes.

## 2026-07-19 — process lesson: #107 was merged on a RED CI gate

The cutover PR [#107](https://github.com/james-beep-boop/Lesson3/pull/107)'s CI run FAILED at
`test:int` — the DB-backed step that exercises exactly the `json_build_array` defect — and the PR was
merged and deployed anyway, which is how the 500 reached the Rock. The gate did its job; the merge
ignored it. **Rule: a red `gate` check blocks merge, no exceptions** — if the failure looks unrelated
or flaky, prove that on the PR (rerun or diagnose in the run log) before merging, never after. The fix
merged as [#108](https://github.com/james-beep-boop/Lesson3/pull/108) (squash `17da012`, gate green),
which also carries the audit evidence and the `/simplify` drift spec (`resourceRowDrift.spec.ts`).

## 2026-07-19 — store required resource links as native child rows, not one flattened lesson group

**Correction to the earlier same-day review:** the definitive ARES file was valid, but the initial
native Payload model was not viable on PostgreSQL. Five phase groups placed 95 resource leaves directly
on each lesson array row. Together with the ordinary lesson fields, Payload 3.85.1 generated a
`json_build_array(...)` call with roughly 115 arguments when reading the version after creation;
PostgreSQL rejects any function call with more than 100 arguments. The transaction rolled back and the
upload endpoint returned 500. The earlier “no P1/P2 defects” conclusion was therefore wrong in the
DB-backed deployment context: migration apply and upload/http gates had explicitly not been run.

- **The interchange contract does not change.** ARES still supplies the mandatory object keyed by
  `predict`, `observe`, `explain`, `dqb`, and `model`, and Lesson3 exports that exact lossless shape.
- **The native storage shape is normalized.** `resourceLinks` is a system-only Payload child array with
  exactly five rows. Each row carries a required phase discriminator plus native `video`, `reading`,
  and fallback fields. Ingest maps object → rows; validation enforces five unique required phases; the
  generator adapter maps rows → object in canonical phase order. This preserves native fields and
  keeps both the lesson row and each resource row safely below PostgreSQL's argument ceiling.
- **The corrective migration is intentionally empty-corpus-only.** Migration
  `20260719_210359_resource_links_child_rows` creates the child table, removes the 95 flattened columns,
  and refuses both upgrade and rollback when lesson plans, versions, or lesson rows exist. That is
  appropriate for this clean corpus reset and prevents a schema transition from silently dropping
  resources.
- **A real database read is the required regression.** The Site-Admin HTTP upload test now reads the
  newly created version and asserts all five phase rows. DB-free object/adapter fidelity remains useful,
  but it cannot prove that Payload's generated SQL is executable. Future wide nested-field changes must
  run the Rock HTTP/int gate before being described as deployment-ready.

**Corrective child-row run (after the Rock 500):** unit 201/201; lint 0 errors / 87 warnings
(generated migrations and existing test/script warnings); TypeScript clean; contract 16/16; ingest
extraction 25/25; 42 files / 384 lessons conform and round-trip; DOCX fidelity 4/4; adapter fidelity
6/6; production audit 0 high/critical (the same 5 moderate transitive `esbuild` findings, no fix).

**Claude full audit (2026-07-19, after the Codex fix) — DB-backed gates RUN LOCALLY this time.** The
review stood up a parallel scratch environment on the Mac's compose stack (fresh `lesson3_audit` DB +
a new-code app container on the same network; the dev DB with the old corpus was dumped to a safety
snapshot and left untouched): the FULL migration chain applied cleanly including `185124 → 210359` in
sequence; **http 88/88** over the wire (incl. the new upload/read-back regression, exports, preview
PDFs); **int 68/68** after one fix; and a REAL corpus file
(`physics__grade_10__ss_4_1__greenhouse_effect_and_climate_change.json`) uploaded over HTTP → 200,
Official 1.0.0, all 35 stored phase buckets (70 populated records) deep-compared byte-equal to the
source JSON, DOCX (97 KB) + PDF (50 pp) exported with every source `direct_url` present in the DOCX
relationships. **One defect found and fixed:** `tests/int/reingest.int.spec.ts` ("ambiguous match")
seeded a version DIRECTLY with the external phase-keyed map, bypassing ingest's map→rows conversion —
the generatable hook now rightly rejects that; the fixture now routes through `rawToBundle` (the
production conversion). Product code was correct; the bug would have failed CI/Rock. Lesson repeated:
a fixture that bypasses an ingest boundary must apply the same conversions that boundary applies.

**Product direction noted (2026-07-19, user):** in-app editing of resource links by Editors is LIKELY
WANTED later (e.g. swapping in better links as they appear). Not built or spec'd; it will amend the
"never editable" rule (SPEC §5 + CLAUDE.md + locked decision #3 wording) when picked up. The child-row
native model was chosen partly to keep that door open — `validateResourceLinks` already enforces the
five-unique-phases/scheme-safety invariants that become the load-bearing defense once edits exist.

## 2026-07-19 — re-baseline ARES JSON 1.0.0 with mandatory lesson-level `resourceLinks`

**Implemented locally; Rock migration/deployment and corpus upload remain pending.** The former
Lesson3 corpus has been permanently deleted, and it will be replaced entirely by the newly generated
ARES JSON corpus. We therefore have no product requirement to accept the superseded JSON shape.

- **`schemaVersion: "1.0.0"` remains the production version.** Although adding a required field would
  normally justify `1.1.0`, semantic versioning only identifies a contract relative to supported prior
  contracts. Because Lesson3 is making a clean cutover before repopulation, `1.0.0` is intentionally
  re-baselined to mean the new and only supported contract. This is not backward-compatible with the old
  files, and the documentation must not imply that it is. If ARES changes this contract after the new
  baseline is live, that later change must receive a new schema version.
- **`LESSONS[].resourceLinks` is mandatory and strictly validated.** It is a lesson-level map with the
  five keys `predict`, `observe`, `explain`, `dqb`, and `model`. Each entry contains the resolved
  `video`, `reading`, and `fallback_search_url` values emitted by ARES. Resource records retain the
  complete upstream fields (`title`, `source`, `content_type`, `direct_url`, `search_url`,
  `search_terms`, `exact_search_url`, `has_transcript`, and `tier`) rather than being reduced to the
  former three-field Lesson3 seam. URLs accepted as hyperlinks are limited to `http`/`https`; the
  current ARES-local `http://ares...` links remain valid.
- **No old-format compatibility path.** Do not make `resourceLinks` optional, add a legacy adapter, or
  infer it from `framework[]`. An old 1.0.0 file without the field must fail pre-flight with an
  actionable contract error. There is no database backfill because there is no retained old lesson
  content to migrate. Before repopulation, verify that deletion left no orphan lesson-plan identities or
  version rows that would turn a fresh upload into a re-ingest.
- **Store the upstream shape losslessly as native Payload fields.** Add system-only lesson-level
  `resourceLinks` fields to the immutable version snapshot. Do not flatten the data into
  `framework[].resources`: the map is independent of framework array order, and real files can repeat a
  phase while still carrying all five resource buckets. The later corrective decision above records why
  the five buckets use child rows rather than one wide group. Retire the unused legacy
  `framework[].resources` field during the clean-slate schema migration after confirming it contains no
  retained values.
- **One document layout, with links inline.** “Standard” and “compact” were former rendering choices,
  not two JSON contracts. The product continues to have one LessonSequence layout: Section C is the
  current ARES five-column table, and video/reading links appear beneath the phase name inside the first
  cell. There is no separate Resource column and no user-facing format toggle.
- **Lesson3 never runs the Python recommender.** ARES has already resolved the resources and embedded
  them in the JSON interchange artifact. Lesson3 validates, stores, versions, and renders those values;
  it does not shell out, query the SQLite content index, or attempt to refresh recommendations.
- **Generator update is deliberate and fidelity-gated.** The current pin is upstream
  `markknit/cbe-generation-system` commit `742c8a96637377abbec37af32073210b9f87465b`. The three
  pristine Node generator files are vendored with a Lesson3-owned bridge that supplies the stored
  `lesson.resourceLinks`; never vendor or execute the Python-spawning resource loader. The new Physics
  Grade 10 sub-strand 4.1 JSON/DOCX output is the first byte/layout oracle. Because the same immutable
  content will render different bytes after this generator update, include a generator-render version
  in artifact-cache identity and bump the HTML-preview render version.
- **Cutover acceptance is corpus-wide, not sample-only.** The 42 supplied JSON files contain 384
  lessons; all currently identify as 1.0.0 and all carry `resourceLinks`. Implementation must prove:
  strict acceptance of all 42; rejection of the old shape; exact raw→Payload→adapter round-trip of every
  resource field; link-scheme safety; five-column DOCX layout and inline hyperlinks matching the current
  upstream oracle; no Python execution; and the normal local/Rock gates. Only after the migration and
  deployment pass should the replacement corpus be uploaded.

**Implementation record (2026-07-19):** the contract, native Payload model, system-only save
boundary, adapter, pure-Node resource bridge, generator re-pin, render-cache revision, Payload types,
and clean-corpus migration are implemented. The migration deliberately aborts if any `lesson_plans`,
`lesson_bundle_versions`, or lesson rows remain; it does not manufacture a backfill. Local evidence:
42/42 files and 384/384 lessons validate and round-trip; contract gate 16/16; ingest extraction 25/25;
unit tests 197; TypeScript clean; DOCX oracle 4/4; adapter/oracle 6/6. The oracle permits only the
measured `ares.edu` → `ares.local` host migration while requiring identical path, port, query, count,
order, and exact agreement with the supplied JSON. Deployment, DB-dependent gates, migration apply,
and replacement upload are intentionally still outstanding.

**Claude review + `/simplify` pass (2026-07-19, after the Codex build).** A full code audit (correctness/
contract, security/RBAC/migration, fidelity/generator) found **no P1/P2 defects**: `resourceLinks` is
system-only across four layers, URL safety is enforced at ingest AND re-checked at the render bridge, the
migration guard is complete, and cache invalidation (`GENERATOR_RENDER_VERSION`) reaches DOCX/PDF + HTML
previews. A 4-agent `/simplify` pass then applied behaviour-preserving cleanups: single-sourced
`RESOURCE_RECORD_KEYS`/`RESOURCE_PHASE_KEYS`/`isObject`, a named-path guard in `toAresResourceLinks`, a
shared `scripts/lib/payloadRowIds.ts`, and comment/cross-reference fixes.

**Follow-up fixes (2026-07-19, Codex review of the review):**
1. **Migration rollback made data-safe.** `down()` in `20260719_185124_ares_resource_links_cutover.ts` now
   carries the SAME empty-corpus guard as `up()`: it RAISEs and refuses rollback if any `lesson_plans` /
   `lesson_bundle_versions` / lessons rows remain, because the legacy six-column framework schema cannot
   represent the new lesson-level `resourceLinks` and a blind rollback would silently destroy resource
   data. No data is fabricated/partially-mapped into the legacy columns. SQL-only guard — the migration
   snapshot JSON is unchanged.
2. **Generator count guard now catches too-MANY lookups, not just too-few.** `getAllPhaseResources`
   (`aresResources.js`) previously returned `EMPTY_ALL` on an over-read, so a "called twice" vendor drift
   slipped past the post-build `index === queue.length` check. It now THROWS the moment the queue is
   over-read; the post-build check still catches too-few. Comments corrected to state that the count
   guards detect call-COUNT drift only — iteration ORDER remains the DOCX fidelity oracle's job. Unit
   regressions added (`resourceLinks.spec.ts`): one lesson + two lookups throws; under-read throws; the
   concurrent AsyncLocalStorage isolation test is retained.
3. **Subject-Admin lesson duplication preserves only server-proven resources.** A later audit found the
   remaining P2: SPEC §5 allows Subject Administrators to add lesson rows, but the save boundary deleted
   `resourceLinks` for every new row, making the supported action unsaveable. Payload's installed array
   reducer deep-copies hidden nested fields and gives duplicated rows fresh ids. The boundary now ignores
   those ids, accepts only a resource value exactly present in the source version, and restores the stored
   server copy. Modified/invented values are still removed and fail the generatable gate. This does not
   permit new Lesson Plan creation (Site-Admin upload/import only) or make resource fields user-editable.

**Earlier flattened-model review run, before the Rock smoke upload and child-row correction (local,
Node 25, DB-less):** lint 0 errors/83 warnings · `tsc` clean · unit **199** · contract-check 16/16 ·
ingest-extract-check 25/25 · fidelity-spike 4/4 · adapter-fidelity 6/6 · `git diff --check` clean.
**NOT run in that earlier review** (needed Docker/Postgres or the Rock): int/http/e2e, migration apply,
and corpus upload. Those omissions are exactly why the 100-argument database failure was not detected.

This supersedes the 2026-06-08/09 optional `framework[].resources` / Resource-column plan, the
2026-07-03 “blocked on Mark” status, and any description of the JSON export as an exact mirror of the
upstream authoring `.js` module.

## 2026-07-18 — editor "View as PDF" (accurate formatted preview)

App-level, **no migration**. The version-editor toolbar had only **Preview** (mammoth HTML, styling
dropped — a fast *structural* check). Added a **View as PDF** button next to it: the accurate, formatted
rendering — the generator's own DOCX run through Gotenberg (`docxToPdf`), the same engine the export uses.
Pre-agreed in the 2026-07-18 NEXT-SESSION "DISCUSSED, NOT BUILT" block.

- **Scope = PER-DOCUMENT via an explicit dropdown (a deliberate UX decision, not one-click-what-you-see).**
  A `View as PDF ▾` menu lists the deliverables the plan actually has (`versionDeliverables`: Lesson plan
  always; Final Explanation / Summary Table when present); a plan with only one document shows a plain
  one-click `View as PDF` button. The endpoint takes a validated `?doc=<tag>`.
  - **Decision trail:** the first cut was PRIMARY-ONLY (chosen via a planning question); review flagged
    that someone editing the Summary Table then got a Lesson Sequence PDF. The three fixes considered were
    **(a) detect the visible editor section and preview that**, **(b) a merged full-document PDF**, and
    **(c) an explicit per-document dropdown**. The user chose **(c)**. Rationale: the editor is ONE long
    form with a jump-nav, not discrete document tabs, so "the section you're viewing" has no crisp
    definition — scroll/active-section heuristics (a) are fragile and a lower-altitude mechanism; the
    dropdown is reliable and needs no such tracking. This is intentional, and it means the control is NOT
    one-click when a plan has 2–3 documents (one click to open the menu, one to pick) — an accepted trade
    for reliability. (Merged (b) stays a possible future if a single combined PDF is ever wanted.)
- **Two paths, branched on `useFormModified()`** (already used for the Save gate):
  - **pristine → reuse the existing export pipeline.** `openPreparedPdfInNewTab` (shared with the
    teacher-facing `DocButtons`) → `ensureExportReady(…/export?as=pdf)` then open
    `…/export/doc?doc=<tag>&as=pdf` inline. Reuses the artifact cache + make-official pre-warm, so an
    Official opens without re-converting.
  - **unsaved → new `POST /:id/preview-pdf?doc=<tag>`** endpoint. The PDF twin of the unsaved HTML
    preview: **identical authorization + field boundary** (shared `resolveUnsavedEffective` in
    `previewVersion.ts` so the verbs can't drift — read-gate → `isEditorFor` → `enforceVersionFieldSplit`),
    then `generateDeliverableDocx(data, tag)` → `docxToPdf` → inline PDF. Opened via the shared
    `postCurrentContentToNewTab` (hidden-form POST to `_blank`, same mechanism as `onPreview`).
    404 for a tag the plan lacks (checked via `versionDeliverables` BEFORE taking a conversion slot).
- **Throttling — TWO layers (added after review).** The synchronous unsaved path runs Gotenberg IN the
  request (unlike exports, which use the jobs queue's global cap). So: (1) RATE — a dedicated `previewPdf`
  bucket, tighter than `export`; (2) CONCURRENCY — a non-blocking in-process semaphore
  (`lib/conversionLimit.ts`, default 2, matching `jobs.limit`) that returns **503** when saturated, so a
  burst can't pin many multi-second conversions and exhaust request slots. Single-container today =
  effectively global; a cross-instance (Postgres) bound is a follow-up if the app ever scales out. The
  client also gates re-clicks with `pdfBusy` on BOTH branches (the fire-and-forget POST branch uses a
  short busy window; the server semaphore is the authoritative bound).
- **Errors:** completeness gate → 422 (shared `assertPreviewable`); absent deliverable → 404; saturated →
  503; `PdfConversionError` → 502; other post-validate throw → 500. Headers on the API `Response` directly
  — the baseline security-header rule skips `/api/*` (`next.config.ts`), so no next.config change.
- **Verified on the local stack** (Gotenberg live): per-`?doc` behaviour — `lessonSequence`/present FE/ST →
  200 `application/pdf` (real `%PDF-1.7`, export-matching filename); missing/bogus `?doc` → 400; absent
  deliverable → 404; Teacher → 404; structural change → 422. 6 concurrent → exactly 2×200 + 4×503 (the
  cap holds). The dropdown lists exactly the present documents and each item requests the right `?doc`.
  `tsc` clean; `test:unit` 190; **lint 0 errors** (30 `any` warnings, ALL in the HTTP test file, matching
  its existing `(fx.version as any)` style — the new source files are warning-clean). http/e2e run in CI.
  - **Test — proving unsaved edits reach the PDF WITHOUT a PDF-text dep:** Gotenberg output is
    **nondeterministic** (identical input → same length, DIFFERENT bytes: a per-conversion timestamp), so a
    byte-inequality check would be unsound. Instead the test asserts a large low-redundancy overlay yields a
    materially larger PDF than a tiny one (verified locally: +4651 bytes for ~1200 distinct tokens) — a
    timestamp-stable signal that the SUBMITTED content drives the output.
  - **Browser-automation caveat:** a hidden-form POST with `target=_blank` degrades to a **top-frame GET**
    when the pane blocks the popup — so `/preview-pdf` shows a GET 404 there. Confirmed it hits the *shipped*
    Preview button identically (GET `/preview` → 200 only because it has a GET handler). Not a regression —
    the POST path is proven by curl; real browsers submit the form.
- **`/simplify` (4-agent) + review shared-helper extractions (behavior-preserving):**
  `assertPreviewable` (→ `previewShared.ts`, one completeness-gate owner for HTML+PDF);
  `generateLessonSequenceDocx` / `generateFinalExplanationDocx` / `generateSummaryTableDocx` +
  `generateDeliverableDocx(data, tag)` (→ `generator/index.ts`, per-deliverable builds so the PDF path
  builds ONLY the requested document; `generateBundleDocx` composes them);
  `openPreparedPdfInNewTab` + `postCurrentContentToNewTab` (shared popup/POST helpers, dedup with
  `DocButtons`/`onPreview`); `deliverableStem(tag, prefix)` + `DELIVERABLE_LABELS` (→ `exportArtifacts.ts`
  / `deliverables.ts`, single-sourced naming + labels, `DocStrip` reuses the labels); `mimeFor('pdf')` and
  a zero-copy `Uint8Array` response body.
- **Second review round (feature-level) — applied on the PR:**
  - **Perf + freshness:** the `View as PDF` menu's present-deliverables list was `useMemo(versionDeliverables(
    reduceFieldsToValues(fields)), [fields])` — which walks the whole (very tall) form on EVERY keystroke
    (`fields` changes per character). Interim fix keyed off the stable `savedDocumentData` (no per-keystroke
    scan) but went STALE for an admin's unsaved structural add/remove (a just-added FE/ST missing from the
    menu; a just-emptied one left as a stale item that 404s). **Final:** compute the deliverables ONCE, in
    the button's click handler, from the live working copy — fresh AND off the typing hot path — then
    preview the sole document directly or open the picker. So there's now a single `View as PDF` button
    (no render-time `▾`); the menu appears only when there's more than one document.
  - **CodeRabbit:** compute the PDF filename stem BEFORE `acquireConversionSlot` (a throw in
    `deliverableStem`/`safePrefix` can no longer leak a slot); add a `never`-assertion `default` to
    `generateDeliverableDocx` (keeps compile-time exhaustiveness + runtime insurance).
  - **Test hermeticity (fixed):** the request-editing test derived `sent`/recipients from a hardcoded "2"
    (one Site Admin). Now it computes the expected set from live DB state the way the endpoint does (all
    Site Admins + the sg's Subject Admins, minus the requester), so it passes against a populated DB too —
    not just CI's isolated `lesson3_test`.
- **Still not fixed (pre-existing, unrelated to this diff):** the ≤640px Manage vs frontend content-padding
  difference. Left for separate work.

## 2026-07-18 (later) — cross-surface consistency: shared design tokens, Manage aligned to the frontend, Messages header

App-level UI consistency pass, **no migration**. Makes the Payload admin **Manage** view read as the same
app as the frontend pages, via a single source of truth for the values that must match.

- **Shared tokens — `app/src/app/app-tokens.scss`.** The frontend (`(frontend)/styles.css`) and the admin
  (`(payload)/custom.scss`) are **two separate Next.js route groups** with their own layouts/bundles, and
  the admin layout is Payload-**auto-generated** (can't be edited) — so a full stylesheet merge is out.
  One SCSS file, imported by the frontend layout AND `@use`d by `custom.scss`, is the minimal correct fix:
  edit a value once, both surfaces move. **Unit discipline:** alignment tokens are **px** (`--app-content-width`
  960px, `--app-content-pad` 20px) so they're pixel-identical; the page-title token is **rem**
  (`--app-page-title-size` 1.9rem) and stays scale-relative (admin's 15px root renders it ~6% smaller than
  the frontend's 16px, on purpose). `--app-content-pad` was px-corrected after review — `1.25rem` drifted
  20px↔18.75px across the two rem roots, defeating the token's whole purpose.
- **Accent single-sourced.** `--app-accent` (#1f5fa8) replaces the six hardcoded `#1f5fa8` literals in
  `custom.scss` (primary button, badges, jump-nav). This **supersedes the former "keep the two in sync by
  hand"** note on the admin accent — the frontend `--accent` and the admin now share one source. (The
  load-bearing primary-button contrast fix is unchanged — value-identical swap; disabled state still gray.)
- **Manage widened to match the frontend** (960px column, title at `--app-page-title-size`, left edge aligned).
  Had to override Payload's `Gutter` horizontal padding (to `--app-content-pad`) and drop a stale
  `.lp-manage { max-width: 46rem }` that was clamping the width — using the same unlayered-beats-`@layer`
  precedence already load-bearing for the button rules (not a new hack). The earlier "settings-panel" 40rem
  posture was revisited in favour of whole-app consistency.
- **Back-links:** removed the `← All lesson plans` on **/messages** (redundant with the Lessons nav AND
  mislabeled — Messages isn't under lesson plans). Kept it on the lesson page (natural "up") and the
  contextual `← Back to lesson` (editor/compare).
- **Messages header:** the `New message` button now sits **inline** with the "Messages" heading (a small
  client header row in `Composer.tsx`; the `<h1>` moved into the client component so it can share the row
  with the stateful button — presentation-driven, acceptable at one page).
- Verified: CI-green in the earlier merge pattern applies; local `tsc`/`test:unit` (190) clean, sass compiles,
  both surfaces' content columns measured pixel-identical (20px pad, 960px), admin accent resolves.

---

## 2026-07-18 (version edit-view cleanup + type hierarchy)

User-requested polish on the lesson-plan **version editor** and the page-title hierarchy. All
app-level, **no migration**. Browser-verified on the local stack (both the frontend and `/admin`).

- **"Create New" + "Duplicate" removed from the version editor.** They were Payload's stock
  document-controls kebab actions, and both contradict the model (SPEC §7): a version is born ONLY
  via a system path — ingest → `1.0.0`, re-ingest → next major, edit+Save → next patch (save-as-new),
  all `overrideAccess`. A blank/cloned version lands a provenance-less default `1.0.0` (systemOnly
  `semver`/`author`/`sourceVersion`) that collides on the unique `(lessonPlan, semver)` index — the
  exact class the #65 semver audit hardened. **Fix: deny caller-access create** (`lessonBundleVersionCreate`
  → `() => false`; `disableDuplicate: true` as belt-and-suspenders / API guard). Payload gates BOTH
  kebab actions on create permission, so denying it removes both. No legitimate path breaks — every
  real create is `overrideAccess`. This **reverses** the 2026-07-06 note that "creating a version row
  directly is an admin action": direct create is now denied outright, a strictly STRONGER guarantee
  than the field-stripping the #65 audit settled for (so the two "forged semver/sourceVersion on an
  authenticated create are stripped" int tests were superseded by a new "no caller-access create"
  block; the systemOnly field guards remain as dormant defense-in-depth).
- **Delete promoted out of the kebab into an explicit button** (LessonControls, view mode only, red
  danger-outline). Shown only for a deletable version (reuses the existing `canDelete` = non-Official
  + admin-in-scope-or-author gate that the Save "delete the source" flow already computed); the server
  re-gates (`lessonBundleVersionDelete` + `enforceOfficialNotDeletable`). With Create New/Duplicate
  gone and Delete relocated, the whole native `.doc-controls__popup` is hidden in custom.scss — no
  three-dots menu remains. Delete calls the default REST `DELETE` then returns to the lesson page.
- **Toolbar hairline spacing** — the jump nav sat flush (~1px) against the native
  `.doc-controls__divider` (the line above the fields); added padding on `.lesson-controls-wrap` so it
  clears. The nav's own top border was already well-spaced (left as-is).
- **Page-title hierarchy** — the brand wordmark ("ARES Lesson Plans", 1rem) is persistent chrome and
  stays quiet; the two page titles ("Lesson Plans" catalogue H1 and the lesson H1) are PEERS and now
  share one `--page-title-size` token (1.9rem/700). Before, the lesson H1 was the browser default
  (~2rem) while the catalogue H1 was an arbitrary 1.4rem/600. Rejected both "make all three equal"
  (brand is identity, not a page title) and "reverse the order" (brand-biggest is a marketing/masthead
  instinct, wrong for a repeat-use tool — content-first wins). Also capitalized "Lesson plans" →
  "Lesson Plans" (matches the brand).

**Review follow-ups (GPT pass on the branch):**
- **Delete eligibility drift (fixed).** The client `canDelete` permitted authorship ALONE, but the
  server's `deletableVersionsWhere` requires the author to STILL be an Editor for the version's sg — so
  a since-demoted author would see a Delete button that 403s. Fixed at the root: extracted
  `canDeleteVersionDoc` (the per-document form of `deletableVersionsWhere`, kept adjacent to it as the
  single source the "never drift" invariant demands), used by both the Delete button and the Save
  "delete the source" prompt. DB-free unit test pins the role-loss case. (This drift pre-existed in the
  save prompt; surfacing it in the new button is what caught it.)
- **`verify-stage2b-edit.ts` retired.** That manual Rock script modelled the superseded MUTABLE
  working-copy flow (direct create + in-place update) — obsolete since the immutable save-as-new model,
  and now failing at its create step under the create-deny. Its coverage lives in `access.int` +
  `endpoints.http`; deleted and the live pointer in `verify-rbac.ts` redirected (historical CHANGELOG
  entries left as point-in-time records).
- **Wire test added.** `endpoints.http.spec.ts` now pins REST create → 4xx + duplicate → 4xx over the
  wire (curl-confirmed 403/403, nothing persisted), complementing the Local-API int coverage.

---

## 2026-07-17/18 (UI batch + no-op save guard + review follow-ups)

Six user-requested changes (one declined) + a save-integrity guard + two rounds of external review
(CodeRabbit on the PR, GPT on the branch). All app-level, no migration. UI shipped direct-to-main
(browser-verified); the endpoint change went via CI-gated **PR #101** per the correctness-surface rule.

- **Password "eye"** — shared `components/PasswordInput` (a thin `<input>` wrapper; icon-only toggle
  with aria-label/title/aria-pressed, following FavoriteToggle's convention). On login, signup, reset.
- **Lesson-page download declutter (user)** — REMOVED the page's Documents line + Supporting-documents
  disclosure (they duplicated the catalogue row) and folded ALL downloads into the **Share** menu,
  which gained a per-document "Download one document" section (the full `DocStrip` — same DocButtons
  flow). **Revises** the 2026-07-08 teacher-first "primary PDF/Word one-click on both surfaces" +
  the 2026-07-16 audit constraint: the catalogue row keeps one-click; the lesson page is Share-only.
- **Admin primary-button contrast (confirmed defect)** — LESSON: an **unlayered** override beats
  Payload's `@layer payload-default` rules regardless of specificity, so overriding `--bg-color`
  alone also repainted DISABLED primaries app-blue while they kept Payload's dark disabled text
  (illegible Manage "Add"). Fix restates BOTH states under `.btn--style-primary` (enabled white-on-blue
  ≈7.5:1; disabled Payload's own `--theme-elevation-200`/`800`). The whole `custom.scss` is unlayered
  by convention — matching, not introducing a bandaid.
- **Editor "Hide details" sidebar toggle (user)** — a body class (`lp-details-hidden`) whose
  `custom.scss` rules mirror Payload's OWN empty-sidebar collapse (`--main-width:100%` etc.), since
  the bar isn't a `:has()` ancestor of `.document-fields`. Per-page, shown-on-open, no persistence →
  no hydration branch (the `?edit=1` lesson).
- **No-op save guard (user; PR #101)** — a Save with zero edits minted a byte-identical version.
  Server (authoritative): `comparableContent(merged) === comparableContent(source)` → **400**, before
  the transaction. `comparableContent` = content keys only (drop identity metadata + server-owned rels)
  → `stripIds` → **`lib/canonicalJson`** (key-order-insensitive JSON; extracted + unit-pinned during
  /simplify because the http test only round-trips the same object and can't catch a canonicalization
  regression). Client: Save disabled while `useFormModified()` is false. Note: three existing
  `?deleteSource=true` http tests posted their source UNCHANGED — the guard correctly 400s that now, so
  they gained a real prose edit (`withProseEdit` helper); the guard was the CI failure, not a code bug.
- **DECLINED — forgot-password "false success" (GPT)** — the uniform "check your inbox" is DELIBERATE
  anti-enumeration: Payload returns 200 for unknown emails (`if (!user) return null`), so there is no
  existence oracle today. The proposed "show a generic error on non-2xx" would REINTRODUCE one — a 5xx
  can only occur for a KNOWN email whose send failed, making error-vs-success distinguishable. The real
  UX kernel (a genuinely-failed send looks successful) is a server-side concern (don't surface send
  failures as 5xx), folded into the going-public email hardening, not a client patch. LESSON: a
  reviewer's "false success" can be a security feature — verify the enumeration model before "fixing".
- **Review follow-ups (07-18)** — CodeRabbit: `canonicalJson(undefined)` guarded (unreachable, but the
  util is exported/`unknown`-typed). GPT: guide drift fixed (the in-app guide + `USER_GUIDE.md` still
  described lesson-page doc rows this session's declutter removed; + stale "Lesson Plan Repository"
  branding). a11y (both pre-existing, folded in): `Modal` Tab focus-trap (cycles in-panel, recovers
  escaped focus; `aria-modal` already covered AT); `FavoriteToggle` now surfaces a failed toggle
  (`role=alert`) instead of looking unresponsive. Deferred: a component test posting real
  `reduceFieldsToValues` output for the no-op boundary (client-disable already mitigates).
- **DECLINED — "login has no custom field validation" (reviewer, 2026-07-18).** Accurate observation:
  the login/signup/reset forms use NATIVE browser validation for empty/malformed fields (`required` +
  `type="email"`) and app-level inline errors only for server results (wrong credentials, unverified,
  network). This is NOT a silent failure and is KEPT AS-IS: native validation auto-localizes to the
  browser's language (real value for the Kenyan/multilingual audience — the custom frontend has NO i18n,
  so app-level messages would be English-only for everyone), is a11y-complete (focus + SR announcement +
  submit-blocking for free), and zero-maintenance. Client-side constraints (native) vs server results
  (app inline) is a deliberate split, not an inconsistency. Revisit ONLY if the frontend gains an i18n
  layer, at which point localized app-level messages become worthwhile.

---

## 2026-07-16 (UI audit → mobile favorite label; a max-width correction worth keeping)

A role×viewport audit of the catalogue + lesson-detail pages after the declutter (Teacher / Editor /
Subject-Admin / Site-Admin × 390 / 768 / 800 / 1280 / 1440). **No defects** — the declutter left the UI
in good shape. Four refinement/experiment opportunities surfaced; **one shipped**, one was **rejected as
factually wrong**, two are **deferred**.

- **SHIPPED — favorite label on mobile only (`8511228`).** The catalogue favorite was a bare star:
  visually icon-only and, on a stacked mobile card, a floating glyph where touch ambiguity is highest.
  Now it reveals its label (`☆ Favorite` / `★ Favorited`) at **≤640px only**; desktop is unchanged.
  **Measurement-first:** desktop alignment was already perfect (favorite `left` spread **0** at
  768/1280/1440, across chip and no-chip rows — the D4 reserved column handles it), so this is
  mobile-only. Implemented as a `labelOnMobile` prop whose label span is **always in the DOM and
  CSS-hidden on desktop** (no SSR/hydration branch; zero effect on the desktop column). 44px touch
  target + full aria-label preserved. Only catalogue rows change (they favorite the **Official**
  version); the lesson-page control is untouched.

- **REJECTED — "cap content width on wide desktop" (a CORRECTION, logged per the working-process rule).**
  The proposal claimed the page had no max-width and rows stretched edge-to-edge. **Wrong:** `.app-main`
  already has `max-width: 960px; margin: 0 auto` (`styles.css`), confirmed by measuring the live column
  (960px, centred, 240px margins at 1440). The mistake: I inferred "full-bleed" from **DPR-scaled
  browser screenshots** instead of reading the CSS or measuring `getBoundingClientRect` — the exact
  "verify, don't infer from the visual" discipline I'd apply to anyone else. An external (Codex) review
  caught it. **LESSON: never diagnose a width/layout issue from a screenshot; read the rule or measure
  the computed box.** The apparent title→actions gap is the row's `flex:1` title + `space-between`, a
  deliberate, scannable right-aligned action column — not a defect.

- **Favorite treatment refined by the same review.** Rejected "labelled pill on every row": it would
  reintroduce the `Favorite ×20` density the declutter removed AND could **mask a real semantic
  difference** — the catalogue star favorites the plan's **Official** version, while the lesson-page
  control favorites the **viewed** version (which can be Not Official for an editor/admin). Keeping the
  label mobile-only preserves that distinction. (The star was already accessible — aria-label, title,
  pressed state, 44px — so this was discoverability polish, not an a11y fix.)

- **DEFERRED (candidates, not built).** (1) Mobile readability of the wide generated framework tables:
  they scroll inside `.doc-preview` (`overflow-x:auto`, body does NOT scroll horizontally — reachable,
  not clipped), but scrolling right pushes the row label off-screen. A reflow/pinned-label needs the
  **prototype + a11y + DOCX-fidelity gate** per the standing "don't restructure generated content"
  rule — a design experiment, not a quick fix. (2) Mobile sticky-header height: the action bar +
  jump-nav both pin on a phone; scoping stickiness to the nav would reclaim reading height. No
  max-width work — the 960px cap stays.

---

## 2026-07-15 (declutter redesign) — lesson-page Share menu + one-line docs; version-editor single header row

A UI declutter session, all app-level, no migration. Scope was agreed via an **interactive HTML
mockup built and approved before any code** (both pages + the catalogue variants, working Share
menu and mode swap) — a cheap way to settle wording, ordering, and grouping arguments up front.
Design decisions, each user-approved:

- **Lesson page action hierarchy (L2): a `Share ▾` disclosure menu** (new
  `lessons/[id]/ShareMenu.tsx`) absorbs Download all — Word/PDF .zips, **Email…** (the whole
  EmailDocButton modal moved in), and **Message a colleague**. DownloadButtons.tsx +
  EmailDocButton.tsx deleted. Edit / Make Official / Request editing access stay visible — Make
  Official is deliberately NOT in a menu (the page's one consequential admin action). APG
  disclosure pattern (aria-expanded + panel, outside-click/Escape close), the app standard since D6.
- **Lesson page documents (L1): one "Lesson plan [PDF][Word]" line + the same "Supporting
  documents" disclosure the catalogue rows use** (`DocStrip condensed`). This deliberately REVISES
  the 2026-07-13 D4 call that "the lesson page keeps the full strip (a detail page has the room)"
  — with the action bar beside it the page showed ~14 controls above the fold; the user chose the
  fold (2026-07-15). One pattern on both surfaces now; the disclosure sits flush left on the lesson
  page (`.lesson .doc-strip-more{padding-left:0}` — the 2.6rem indent is catalogue row alignment).
- **Lesson page meta (L3): one merged muted line** `subject · grade · Version x.y.z · Official`
  under the H1, with the versions chip + Compare inline (still editor-only — the teacher-first
  lock, 2026-07-08 §4, is unchanged; the static semver+Official text now shows to everyone as a
  trust marker). The separate `.version-bar` band is gone.
- **Version editor: ONE header row** — `[← Back to lesson] Viewing:/Editing: <title> [Official
  chip] │ [Edit]⇄[Save · Cancel] · [Preview]`. The **bold Viewing:/Editing: prefix replaces the
  view-mode notice line** as the mode signal (user ask), and Payload's native H1 (the same title)
  is hidden for this collection — the bar names the document. "Discard Edits" renamed **"Cancel"**.
  Collection description shortened to one line ("Save writes your edits as a new version —
  existing versions are never changed.").
- **Editor Download button + docx/PDF checkboxes REMOVED** (user ask, verified safe first): they
  exported the SAVED version via `/export` — byte-identical to the lesson page's downloads. Only
  **Preview** posts the live form state, so it is the one output action the editor keeps.
- **CSS signal handover:** the role-lock "read-only" label chips were gated on
  `body:not(:has(.lesson-controls__notice))`; with the notice gone the gate keys on the new
  `.lesson-controls-wrap--editing` modifier (positive signal > absence-of-element signal).
  `lessonControlsSsr.spec.tsx` now pins the modifier + prefix + Save/Cancel swap.
- **Mobile regression avoided, rule revised:** the 2026-07-13 phone rule kept BOTH toolbar bars
  `overflow-x:auto` one-liners. `overflow-x:auto` CLIPS an absolutely-positioned child, so the
  Share dropdown forced the action bar OUT of that rule — safe now it holds ≤4 compact controls;
  the jump nav keeps the scroll+fade treatment.
- **Catalogue C1 spacing only:** row padding 0.6→0.75rem, strand gap 1.25→1.6rem. The icon-button
  variant (C2-B) was mocked and DECLINED in favour of keeping labelled PDF/Word buttons
  (self-explanatory beats compact). Jump nav quieter one type step (L4). Deferred: collapsible
  per-lesson `<details>` in the rendered document (L5) — same fidelity-transform risk the
  2026-07-12 triage rejected; the jump nav covers navigation.
- Guide page + USER_GUIDE.md updated in step (Share menu wording, supporting-docs line).
- **/simplify (4-agent pass) applied two altitude fixes:** (a) the email compose form was extracted
  from ShareMenu into its own composed **`EmailModal.tsx`** (owns its recipient/sending/error state),
  so ShareMenu stays a thin coordinator and download errors can't bleed into the compose form; (b)
  the `.toolbar-sep` empty-span divider became a `border-left` on `.share-wrap` (matching the editor
  bar's `--output` group divider — no throwaway element). Plus a stale `DocStrip` docstring fix.
  **Skipped (out of diff scope):** extracting a shared `useDisclosure` hook and a `.menu-panel` CSS
  base — both real duplication (ShareMenu/UserMenu/VersionsChip hand-roll the same outside-click
  disclosure; `.share-menu`/`.user-menu__dropdown` share a panel shell) but the fix needs rewiring
  UserMenu + VersionsChip, outside this change. Worth a dedicated follow-up. Efficiency + the other
  simplification checks came back clean.

---

## 2026-07-14 (branding + row redesign) — ARES rename, editor-controls left, Guide fixes, catalogue row redesign; a client-boundary lesson

A UI/branding polish session (all app-level, no migration; `main` `83f0c4e`). Committed DIRECT TO
MAIN at the user's explicit choice — see the reasoning captured in NEXT-SESSION's newest block (public
repo → free unlimited Actions + CodeRabbit; CI `gate` fires on `push:` to main too; low-risk,
browser-verified UI only). Each push was watched to CI-green. Default remains the PR flow for anything
with correctness/security surface.

- **Rename "Kenya Lesson Plans" → "ARES Lesson Plans"** across every UI + email string (reverses the
  #100 rename). `EMAIL_FROM_NAME` env still overrides the sender line. Historical docs left unchanged.
- **Login splash** — the on-page "Sign in" subtitle became "By **ARES Education**" (link to
  areseducation.org, new tab). The browser-tab title "Sign in — …" was deliberately left.
- **Version-editor control bar moved RIGHT → LEFT.** Payload renders `beforeDocumentControls` inside
  the right-aligned `.doc-controls__controls`; the sibling `.doc-controls__content` (its native meta
  row, hidden for this collection) still held `flex-grow:1` and pushed the bar right. Fix (scoped to
  `.collection-edit--lesson-bundle-versions`): `.doc-controls__content{flex-grow:0}` so the empty
  content collapses and the bar hugs the left over `.document-fields__main`. Follow-on: the bar is
  several rows tall but Payload sizes `.doc-controls__wrapper` to a FIXED single-row
  `--doc-controls-height`, so on the left it overlapped the Title field — `height:auto` +
  `align-items:flex-start` lets it reserve its true height. Same Payload-internal-override pattern as
  the rest of `custom.scss` (documented, accepted altitude).
- **Guide accuracy pass.** Corrected the stale "the editing page shows only the fields you may change"
  — since the D3 redesign the editor shows ALL fields, with role-locked ones marked "read-only" (the
  `.field-type.read-only` chip), not hidden. Added the editor Preview button + a Teacher note that
  sessions auto-sign-out (IdleLogout at the token deadline).
- **Catalogue ROW REDESIGN (Option B).** Two usability issues the user raised, discussed before
  building (pros/cons of name-as-link vs name-as-button vs explicit "View plan"):
  1. **Name now reads as a link AT REST** (`--accent`, underline on hover) — the prior
     neutral-until-hover styling meant new users couldn't tell the name was clickable. Kept it an
     `<a>` (not a `<button>`) to preserve new-tab / middle-click / screen-reader link semantics.
  2. **Primary Lesson-plan PDF/Word moved inline onto the title line**, so the common row is one line;
     secondary documents stay folded behind the "Supporting documents" disclosure. `DocStrip`'s
     `condensed` mode was reduced to render ONLY that disclosure (primary now lives on the row).
     Rejected the name-as-button trio: long curriculum names look wrong in buttons, a page of buttons
     scans worse than a titled-link index, and it swallows the number + context affordances.
- **/simplify (4-agent pass) → LESSON worth keeping.** The one substantive finding: the
  "lessonSequence is primary, the rest are secondary" split was encoded independently in `SubstrandRow`
  and `DocStrip`. Single-sourced into a new **`generator/deliverables.ts`** (`PRIMARY_DELIVERABLE` +
  `secondaryDeliverables`). **Gotcha:** the obvious home, `exportArtifacts.ts`, is SERVER-ONLY
  (`node:module`, `jszip`, artifactCache) — importing a runtime VALUE from it into a client component
  drags those into the client bundle. The prior code only ever `import type`d from it (erased). The new
  module type-imports `DeliverableTag` (also erased) so it carries no server deps and is client-safe.
  Caught before shipping by remembering tsc does NOT enforce the RSC boundary — the Next production
  build does. Skipped findings: `custom.scss` Payload overrides (correct altitude, file convention);
  the duplicated ARES external anchor across login/guide (a single plain `<a>`, not worth a component).

---

## 2026-07-13 (Codex mobile/a11y round) — six mobile/accessibility findings fixed; two selector/units lessons

An external Codex mobile pass (tested at 390×844) returned eight findings; #1–#6 fixed this session
(#7 mobile reading-mode and #8 catalogue-scale prep are agreed FUTURE, already on the backlog). The
work spans two surfaces — the teacher-facing **frontend** (`styles.css`, 16px root) and the
Editor/Subject-Admin **Payload admin** (`custom.scss`, 15px root). All six were browser-verified live
on the local compose stack (subject-admin login), not review-only. No endpoints/hooks changed, so no
wire tests were owed; typecheck + lint + unit 176/176 green.

- **#2 (real, highest value) — login/signup/forgot/reset errors weren't announced to AT.** The
  `.form-error` `<p>` was conditionally inserted with no live-region role, so a screen reader never
  spoke it — a just-signed-up teacher hitting the unverified-login message would reset in circles.
  Added `role="alert"` (assertive) to all four error paragraphs, and `role="status"` (polite) to the
  signup/forgot success notes. Verified: submitting bad creds, the error node reports `role=alert`.
- **#1 — the version-editor toolbar overlapped the Title on a phone.** LessonControls mounts via
  `beforeDocumentControls`, INSIDE Payload's sticky `.doc-controls`; at 390px the control bar + jump
  nav wrap into a tall block, and a tall *sticky* block pins itself over the first field on scroll.
  Fix: below 640px, `.collection-edit--lesson-bundle-versions .doc-controls { position: static }` —
  the bar scrolls away with the page (the frontend lesson page keeps its own sticky jump nav for
  reading; this is the editor). Also un-truncated the document title (`.doc-header__title` is
  `nowrap` + ellipsis → `white-space: normal` on mobile). **LESSON (re-encountered): `.doc-header__title`
  lives in Payload's `DocumentHeader`, a PRECEDING SIBLING of the `.collection-edit--…` view — the
  same trap that killed the Edit-tab hide rule (2026-07-06/07). A descendant rule silently no-ops;
  it needs the `body:has(.collection-edit--…) .doc-header__title` ancestor pattern.** First attempt
  used the descendant form and browser-verified as `nowrap` (unchanged) — caught only because the
  fix was checked live, not assumed.
- **#5 — leftover small touch targets.** The D6 pass already gave 44px to catalogue/lesson controls;
  it missed auth text links, message reply/context/share links, and the admin Manage/Delete buttons.
  Extended the 44px min-height to those — including, after a follow-up consistency check, the
  **Site-Admin-only `DeletePlansPanel`** (its destructive button + search live in `.lp-admin-list__bar`,
  outside the `.lp-manage__row` rule, and its plan-select rows are `.lp-manage__pick` labels whose
  whole row should be tappable, not the 13px checkbox). That panel never rendered during the
  Subject-Admin eyeball, so its 27px button/34px search/20px rows were only caught by logging in as
  Site Admin and measuring — **role-gated surfaces need verifying under the role that sees them.**
  **LESSON: the Payload admin root font is 15px, so
  `min-height: 2.75rem` = 41.25px, 3px short of the 44px target — use explicit `44px` in `custom.scss`,
  not `rem`. The frontend (16px root) keeps `2.75rem` = 44px.** Also caught only by measuring live
  (41px), not by assuming rem math.
- **#3 — mobile action rows scroll sideways with no affordance.** The sticky toolbar's `.export-bar`
  and `.doc-nav` deliberately switch to `overflow-x: auto` on phones (a wrapped multi-row toolbar
  would eat the viewport — kept). Added the discoverability cue Codex asked for: a right-edge
  `mask-image` fade. It softens only the trailing 1.5rem gutter, so nothing becomes unreachable.
  Verified both rows overflow (593/777px into 361px) and carry the fade.
- **#4 — "Immutable snapshots" + a Save button read as a contradiction, and nothing labelled the
  working copy Not Official.** The description is technically right (Save = save-as-new, a fork) but
  unexplained. Reworded the collection description to say editing writes a NEW version, and added an
  Official / Not-Official status chip to the editor (reusing LessonControls' existing
  `sourceIsOfficial` fetch). Verified both variants render (v1 → "Official version", v43 → "Not
  Official").
- **#6 — the Editors "Remove" button lacked destructive distinction.** It was `buttonStyle="secondary"`
  (grey); CandidateList's Delete is already `"error"` (red) with a confirm. Note Codex's "confirmation
  unverified" caveat was already satisfied — both paths use `window.confirm`. Changed Remove to
  `buttonStyle="error"` to match. Verified it renders `btn--style-error`.

**Meta-lesson:** two of six fixes were wrong on the first pass (descendant selector; rem units) and
both were caught by browser-measuring the result rather than trusting the edit — the "verify, never
assume" rule paid for itself directly here.

---

## 2026-07-13 (Codex review batch) — favorites-transaction false success; upload endpoint gets its owed wire tests; UI/wording nits

An external Codex pass surfaced seven findings; all triaged, six fixed, one advisory. Frontend/docs
half in one PR (#95), backend half in the next. The two P2s and the lessons in them:

- **[P2] `retargetFollowerFavorites` reported false success on a favorite race.** The hook re-points
  follower favorites during a make-official pointer move, INSIDE that transaction, and swallowed
  per-row errors "so a favorites hiccup never fails a promotion". But a compound-unique violation
  (a follower who starred the incoming version concurrently) POISONS the Postgres transaction —
  every later statement 25P02s and a COMMIT silently rolls back. With `deletePrevious=false` the
  swallow let `make-official` return `{ok:true}` on a promotion Postgres had rolled back (verified
  by tracing `versionEdit.ts`). **Lesson: per-row best-effort is impossible inside a single PG
  transaction — the first constraint error is terminal.** Fix: catch only `NotFound` (a vanished
  row throws before any SQL, so the transaction is intact) and re-throw everything else, so a
  poisoned transaction fails honestly (a retry converges — the racing star is now visible, so its
  old row is DELETED not re-pointed). Pinned DB-free by `retargetFavoritesTxn.spec.ts` (NotFound →
  skipped; any other error → propagates). **Deferred:** restoring TRUE per-row best-effort needs a
  savepoint per row or post-commit retargeting — a separate redesign (NEXT-SESSION queue).
- **[P2] The Site-Admin upload endpoint had no wire tests**, violating the CLAUDE.md standing rule
  (every custom endpoint ships 401/403/404 + happy-path `tests/http` coverage). No bypass found —
  just missing coverage. Added an "Upload endpoint" block to `endpoints.http.spec.ts`: 401 (no
  auth), 403 (Teacher / Editor / Subject Admin — the server gate, not the hidden button), 400 (no
  files / non-.json), 422 (valid JSON but empty LESSONS → pre-flight rejects), 200 (Site Admin
  uploads a valid five-group ARES JSON → one plan). Runs on CI's live stack (http is CI-only).

**P3s (in #95):** `displayTitle` no longer treats `'` as a word boundary (DON'T → Don't);
`UserMenu` Escape returns focus to the avatar trigger (APG disclosure); the `deliverableWarnings`
FE/ST messages no longer claim "SPEC §3 expects all three documents" (§3 permits single-document
sub-strands); `EditJumpNav` timers are tracked + cancelled (no competing scroll chains). **Advisory
(no action):** the esbuild@0.18.20 advisory reaches only drizzle-kit dev tooling, no deployed path —
already a tracked deferred item.

---

## 2026-07-13 (edit-page jump nav) — the version editor gets the lesson page's floating nav; "Supporting documents"

Two user edits after the design track:

- **"More documents" → "Supporting documents"** on the condensed catalogue strip (D4). One word.
- **The version editor gets a floating in-form jump nav** — the edit-page counterpart to the lesson
  page's `.doc-nav` — with a deep link so editing opens on the lesson the reader was viewing.
  Component: `components/LessonControls/EditJumpNav.tsx`, rendered inside `LessonControls`.

Build notes:
- **It floats for free.** Payload's `.doc-controls` (which wraps the injected `LessonControls`) is
  already `position: sticky; top: 0` (verified against installed @payloadcms/next), so a nav
  rendered there pins with the toolbar — no new sticky wrapper, matching the view page's behaviour
  exactly as the user asked.
- **Targets are Payload's own stable DOM ids** (verified payload@3.85.1): lesson rows are
  `#lessons-row-<index>`, the groups `#field-finalExplanation` / `#field-summaryTable`, top is
  `#field-title`. The lesson LIST (count, number, title) comes from FORM STATE
  (`useAllFormFields`), reactive and role-safe — META/UNIT are admin-only and absent for editors,
  so "Overview" is a plain "Top". `editJumpNav.spec.tsx` pins the form-state parsing (incl. not
  mistaking the nested `summaryTable.lessons.*` array for lesson rows).
- **The scroll fought lazy rendering.** The editor form is ~90 000px and Payload lazy-renders field
  content as it nears the viewport, so its height grows for seconds after load AND a target can
  reach the top early then DRIFT down as the rows above it finish laying out. Manual
  position math and a single `scrollIntoView` both landed short/drifted. The reliable fix
  (`scrollToField`): `scrollIntoView({block:'start'})` + a `scroll-margin-top` (7rem, clears the
  floating toolbar), RE-PINNED on a 150ms interval until the document height has settled (rendering
  done) AND the target is at the top — a 12s hard cap covers a target legitimately too near the
  document end. Instant, not smooth (a 90 000px smooth animation is disorienting and fights the
  re-pin). Collapsed rows are expanded before the jump. This is DOM/timing behaviour, verified
  in-browser, not unit-tested.
- **Deep link:** the lesson page's Edit button forwards the reader's current lesson (its jump nav
  sets `#lesson-<n>`) as `?lesson=<n>`; EditJumpNav scrolls there once the row exists. Verified
  end to end (view page jump-to-lesson-3 → Edit → editor opens on lesson 3).

---

## 2026-07-13 (design-track review + /simplify follow-ups) — #91, #92, #94

Three cleanup PRs on the merged design track (D1–D6), grouped here with the track they refine.

- **#91 — CodeRabbit triage from the D-track PRs.** Composer showed a stale "Message sent" note on
  reopen (the collapse persists component state) → cleared on the New-message click; `type="search"`
  rendered a second native ✕ next to D4's explicit clear button → native one suppressed
  (`::-webkit-search-cancel-button`); the preview page's lesson links gained `aria-label` to match
  the lesson page. (The isSequence cross-surface divergence CodeRabbit flagged was already fixed on
  the #85 branch pre-merge, commit `080efdb`.)
- **#92 — the design-track `/simplify` pass (4 agents; two hit the session limit, so reuse +
  altitude were done inline).** The substantive win: **one cross-surface jump-nav model.** The
  lesson page (JSX) and the preview page (HTML string) had each duplicated the nav rules — the
  `'Lesson Sequence'` magic label, the "Overview" rename, the "Lessons" label, the chip tooltip
  format — enforced only by eyeball. `annotateSections` + `docNavItems` moved into
  `lib/lessonAnchors.ts`; both surfaces now render the same item list, and only the Lesson Sequence
  section is scanned for anchors. Also: `DocStrip`'s single-value `primary` filter/map collapsed to
  `tags.includes` + a direct item; the three unread badges deduped onto one shared CSS rule (was
  "keep in sync by hand"); `displayTitle` used two regex predicates instead of a stripped-string
  allocation; six pasted D6 contrast comments became one. **Skipped with reasons (the altitude
  angle's real value):** the `:has()` read-only-chip coupling (matches the stylesheet's established
  chrome-strip pattern; a component-level alternative means threading form state through Payload
  field components), the `#1f5fa8` accent duplicated across the two style roots (separate
  stylesheets load them — a shared token layer is churn for two constants; sync-by-hand documented
  at both sites), and `displayTitle`'s call-site placement (chrome-only by SPEC §4). **Efficiency
  angle measured, not guessed:** the per-request anchor transform is 0.066ms on a 327KB document
  (riding a path whose cache miss costs seconds), and the real-render drift spec adds ~60ms to the
  unit gate — both endorsed as designed. Behaviour unchanged throughout.
- **#94 — CodeRabbit on #92.** Narrowed the D6 contrast comment (it claimed elevation-600
  "throughout this file", but elevation-700/800 are used elsewhere — scoped to the audited
  muted-text rules); escaped `item.href`/`item.text` in the preview nav branches for consistency (a
  no-op on real values — slugged fragment hrefs, numeric lesson text — but this CSP-locked endpoint's
  contract is no-injection, so it shouldn't rest on the nav model never changing).

---

## 2026-07-12 (design track locked + D1) — critique triage, three user decisions, and the in-page lesson nav

A structured design critique of the live app (`docs/DESIGN-CRITIQUE-2026-07-12.md`, reviewed as
Teacher and Editor) drives a six-PR design track, planned with the user this session. Build order:
**D1** in-page lesson navigation → **D2** editing-surface light reskin → **D3** version-editor
toolbar + role-lock pattern → **D4** dashboard export-strip consolidation → **D5** consistency
batch → **D6** app-wide WCAG 2.1 AA pass (last, so it measures the final colors). All app-level;
no migrations anywhere in the track.

**Three user decisions (2026-07-12):**
- **Editing surface = LIGHT RESKIN**, not full pixel-match and not scoped-as-unstyled: Payload
  theme CSS variables in `custom.scss` (accent, Save button) + the app's branded header on
  `/admin` views. Rationale: ~90% of the visual unity without fighting Payload internals across
  the pinned-version upgrade cadence.
- **Dashboard export strip: DEMOTE Final Explanation / Summary Table behind a "More" disclosure;
  Lesson-plan PDF/Word stay one-click.** This deliberately REVISES the teacher-first T2 strip
  (2026-07-08): the critique found six buttons per row heavy to scan; the middle option keeps
  T2's zero-clicks-to-export intent for the primary document.
- **Lesson detail long-document fix = STICKY NAV ONLY.** The critique's "semantic
  `<section>`/`<h2>` instead of table rows" suggestion collides with SPEC §5 (the content view is
  mammoth-converted generator DOCX — never a parallel renderer); a post-processing transform was
  considered and REJECTED for now (transform layer + cache-version bump + fidelity-drift risk for
  a screen-reader gain nobody has asked for yet). Revisit only with a concrete accessibility
  driver.

**Critique items resolved as NO ACTION** (prior decisions already answer them): the login page's
Sign up link (open registration was the explicit 2026-07-09 decision); scope switching in the
account menu (the catalogue's filter chips cover multi-scope browsing); the preview tab's missing
way-back (it is deliberately a separate tab).

**D1 build notes (this session):**
- Lesson boundaries in the rendered document are NOT headings — the generator's `fullHeader` emits
  a table row, which mammoth renders as `<p><strong>LESSON <n> (<duration>): <title></strong></p>`
  (probed against the real chain). `app/src/lib/lessonAnchors.ts` injects `id="lesson-<n>"` there and
  reports the anchors; the sticky toolbar on the lesson page (action bar + jump nav) and the
  standalone preview page (CSS-only sticky nav — that page is script-free by CSP) both build from
  it, and the Guide's existing role TOC went sticky with the same treatment.
- **The transform is post-cache by design**: it runs on the already-sanitized HTML each request
  (microseconds of regex on ~5 KB), so cached entries are untouched and
  `HTML_RENDER_CACHE_VERSION` does not move — no cold start on deploy.
- **The mammoth output shape is pinned** by `app/tests/unit/lessonAnchors.spec.ts`, which runs the
  REAL generator → mammoth chain on a two-lesson bundle: a `docx`/mammoth/generator bump that
  changes the header markup fails CI instead of silently dropping the nav (same fail-fast posture
  as `htmlDiffContract.spec.ts`).
- Mobile: the sticky toolbar's two bars stay one row each (`overflow-x: auto`, no wrap) so the
  toolbar never eats a phone viewport; jump links keep the 44px touch bar.

**D2 build notes (same session): two critique findings were STALE, and the reskin is three rules.**
- Verified against current main on the local stack before building: the critique's Manage-page
  "Delete is bare text with no confirm" and "rows don't match the dashboard pattern" describe the
  STALE Rock deployment — on main, Delete is already a confirm-gated Payload error-style button,
  and the desktop dashboard uses the same divider-list row idiom Manage does (cards are
  mobile-only). Neither was changed. **Lesson: the critique reviewed the live Rock, which lags
  main; re-verify each finding against main before coding.**
- What WAS real: no brand wordmark on the admin header, near-black default primary buttons, and
  the Manage panel hugging the left edge. Fix (additive only, no restyled Payload components):
  `AdminHeaderMenu` now renders the same `.brand` wordmark as the frontend header
  (space-between + `--theme-elevation-50` tint = the frontend's `--bg-soft` posture);
  `.btn--style-primary` gets the app accent (`--bg-color: #1f5fa8` / hover `#17497f` — keep in
  sync with `--accent` in the frontend styles.css by hand); `.lp-admin-dash` gains
  `margin-inline: auto` (the 40rem settings-panel width is deliberate; centering makes it read
  that way). The blue Save also delivers half of D3's "Save gets distinct weight" — it is now the
  only filled control in the editor toolbar.

**D3 build notes (same session): the toolbar's edit lifecycle SWAPS with the mode; role-locks get
a chip only when the distinction is real.**
- LessonControls regrouped into two functional groups with a divider: the edit lifecycle
  (view mode `[Edit]` ⇄ edit mode `[Save · Discard Edits]` — a swap, not disabling, so no dead
  lifecycle button ever renders, extending the §13 posture to mode-gating) and the output group
  (`Preview · Download · kind checkboxes`). The SSR pin (`lessonControlsSsr.spec.tsx`) now asserts
  the swap (`?edit=1` server-renders Save/Discard, no Edit).
- **Role-locked fields:** a `read-only` label chip renders ONLY while the form is unlocked, via
  `body:not(:has(.lesson-controls__notice))` — in view mode EVERY field is read-only and the
  notice already explains it, so chips would be noise; in edit mode a still-locked field is locked
  by ROLE, exactly the case worth labelling. Relationship fields spell Payload's modifier
  `relationship--read-only` (installed source), so both spellings are covered; read-only VALUES
  darken to elevation-800 everywhere (the gray-on-gray was the critique's likely AA failure —
  the value is information even when uneditable).

**D6 build notes (2026-07-13): the WCAG 2.1 AA pass — run INLINE (computed ratios), three real
findings; the critique's pervasive-gray fear did NOT materialize.**
- **Audit method**: WCAG relative-luminance math over every text/background token pair in both
  stylesheets, plus keyboard/focus/touch checks (no `outline: none` anywhere; the sticky navs,
  disclosure, and menu are natively keyboard-operable; 44px targets shipped in prior passes).
  The frontend's pervasive `--muted` #666 PASSES everywhere (5.74:1 on white, 5.35:1 on
  `--bg-soft`) — the critique's app-wide worry checked out clean, so no token sweep was needed.
- **Finding 1 — admin `--theme-elevation-500` text = 3.95:1 (FAIL).** All six `color:` uses in
  custom.scss (scope lines, descriptions, meta, timestamp labels) bumped to `elevation-600`
  (5.83:1). Elevation values verified from installed `@payloadcms/ui` colors.scss.
- **Finding 2 — rendered-document table gridlines** (`--line` #e2e2e2 / preview #ccc, ~1.6:1).
  Gridlines in the 5-column framework tables carry document structure (WCAG 1.4.11 wants 3:1 for
  meaningful graphics) — new `--line-strong` #8c8c8c (3.35:1) for `.doc-preview` and the preview
  page; hairline dividers deliberately stay `--line`.
- **Finding 3 — the user menu claimed `role="menu"`/`aria-haspopup` without arrow-key nav.**
  Switched to the APG disclosure pattern (aria-expanded button + toggled region, plain tab
  order) — honest semantics for a two-item dropdown instead of half-implemented menu ARIA.

**D5 build notes (2026-07-13): the consistency batch.**
- **Messages**: compose collapses behind a `New message` button (reading the inbox is the page's
  job); it auto-opens when the `?plan=` handoff signals compose intent. The recipient picker gets
  a scope hint (the roster is every account, names only — SPEC §8). The unread treatment (accent
  left border + tint + `New` pill) is DECLARED the app-standard "needs attention" pattern in a
  styles.css comment — no other surface has such a state today, so no dead utility CSS shipped.
- **Casing**: `lib/displayTitle.ts` renders shouty stored titles as Title Case in page CHROME only
  (messages lesson links, the `?plan=` about-line, the preview page h1/`<title>`); a mixed-case
  title passes through untouched, and generator-rendered CONTENT keeps the faithful stored casing
  (SPEC §4 — the stored value is generator input and is never rewritten).
- **Menu/badges**: Log Out goes ink (ending the session is not a content link — Messages above it
  stays accent); the three unread badges (avatar, nav, menu item) unify on one geometry.
- **Login**: brand gets a real hierarchy step (1.5rem/700 + accent underline bar standing in for a
  logo) over a smaller muted "Sign in"; the form anchors at `clamp(3rem, 16vh, 9rem)` instead of
  floating in the top third.
- **Guide**: the version-chip/Compare mechanics moved from the Teachers intro (which itself says
  Teachers see only Official) to a new Editors bullet. The guide's existing convention — `<em>`
  for UI element names, `<strong>` for bullet lead-ins — was checked and already consistent; no
  sweep needed.

**D4 build notes (same session): the T2 strip demotes FE/ST behind a native disclosure; blue is
reserved for state + CTAs; one declined item.**
- `DocStrip` gains `condensed` (catalogue rows only): Lesson plan PDF/Word stay one-click (the
  teacher-first intent survives); Final explanation / Summary table fold into a `<details>`
  disclosure — no script, so the strip stays a server component. The lesson page keeps the full
  strip (a detail page has the room, and it is the primary download surface).
- Doc buttons go NEUTRAL (line border/ink; accent only on hover; `.btn.btn-doc` — plain
  `.btn-doc` loses to the later `.btn` rule at equal specificity) — the blue outline visually
  competed with the active filter pill; blue now means "selected state or primary CTA".
- Editor rows always render a fixed-width `.substrand-versions` slot so the star column stops
  shifting with version history (the critique's alignment find); teacher rows never had chips, so
  they're untouched. Search gets an explicit clear button (`type=search`'s native ✕ is
  WebKit/Blink-only); the no-results states already existed.
- **DECLINED: a "My favorites" empty state.** The section renders only when non-empty by design —
  §13 minimal-UI argues against a permanent placeholder block for every teacher who never stars,
  and the Guide documents the feature. Revisit only on real user confusion.

---

## 2026-07-11 (async export feedback) — transport/status failures surface immediately; the client wait budget matches Gotenberg

The shared export client previously handled explicit job failures and rate limits, but a rejected
`fetch` (offline/network/proxy failure) bypassed `onState('error')`, and a non-OK status response
without the expected job-error body could keep polling until the generic timeout. The default poll
budget was also about 90 seconds even though Gotenberg is allowed 120 seconds, so a legitimate cold
PDF conversion could make the browser give up before the server did.

- All prepare, status, and final-download requests now pass through one `fetchExport` wrapper. A
  transport rejection sets the visible error state and throws the same actionable message consumed
  by ZIP callers and the per-document PDF/Word controls.
- Status polling parses the response once, preserves the endpoint's explicit job-error message, and
  otherwise fails immediately on non-2xx responses instead of treating them as `preparing`.
- The default budget is 100 polls at the endpoint's 1.5-second cadence (~150 seconds), matching the
  HTTP suite's cold-export allowance and leaving startup headroom above Gotenberg's 120-second cap.
- `tests/unit/exportClient.spec.ts` pins cold prepare-to-ready, status HTTP failure, and a transport
  failure during the final ZIP GET. Manual review found no Critical/Warning issue. CodeRabbit was not
  available for the corroborating pass because its CLI was signed out. Local gates: lint 0 errors
  (70 pre-existing warnings), typecheck clean, unit 159/159.

---

## 2026-07-10 (email-verification Codex round) — email changes are Site-Admin-only; the verify endpoint gets a shadow throttle + token index; the backfill gets an executable test

Three accepted findings on the (then-uncommitted) email-verification diff, fixed before the PR:

- **[P2] Email self-update bypassed verification.** Payload verifies ONLY at create — an update
  neither clears `_verified` nor mints a token, so a verified account could PATCH itself onto any
  unregistered address without proving ownership. **Decision: `email.update` = Site-Admin-only**
  (the simpler of Codex's two options; a re-verify-on-change flow is real machinery — token mint +
  send + a self-lockout-on-typo failure mode — build it only if users actually need self-service
  address changes). SPEC §8 amended; wiring-pinned.
- **[P2] The native verify endpoint is unthrottled and the token column was unindexed.** The
  verify op runs NO collection hooks (installed source), so the #42 `beforeOperation` seam can't
  cover it. **Fix: a custom Users endpoint SHADOWS `POST /verify/:id`** — sanitize.js pushes
  built-in auth endpoints AFTER custom ones and handleEndpoints takes the first match — consuming
  a new site-global `verifyEmailGlobal` bucket (300/day default; no per-target key exists for a
  token-only public route and no reliable IP until the Phase-5 edge proxy) before delegating to
  Payload's own exported `verifyEmailOperation` (token semantics never fork). **The http 429 test
  doubles as the shadowing proof** — a 429 can only come from our handler, so a Payload bump that
  renames the built-in path fails CI instead of silently serving the unthrottled native endpoint.
  The token column is indexed via a `_verificationToken` field override (`index: true` — base
  access/hidden/hooks survive the merge) so the migration was REGENERATED offline to carry
  columns + index + backfill in one file (same stable name).
- **[P3] The load-bearing backfill had no executable test.** `tests/int/verifyBackfill.int.spec.ts`
  simulates the pre-migration state (raw-SQL `_verified = NULL` — exactly what a plain ADD COLUMN
  leaves) and runs the migration's REAL exported `up()` against the live push-built schema:
  NULL → true (and that account then logs in via `payload.login`), `false` survives un-flipped
  (the WHERE NULL guard), and completing at all proves the idempotency guards.

---

## 2026-07-09 (email verification) — signup needs the emailed link; the `_verified` backfill is load-bearing; migrations + types now generate OFFLINE

The recorded #80 follow-up hardening, built the same day (queue pick with the user). Payload-native
throughout: `auth.verify` on users, the verification email linking the FRONTEND `/verify-email`
page (same reasoning as the #80 reset-link fix — Payload's default is an /admin route teachers
can't use), the native `POST /api/users/verify/:token` op, no custom endpoints. Signup now ends in
a check-your-email note (a login attempt would 403 `UnverifiedEmail`); the login form surfaces
that 403 distinctly, or a fresh signup reads "invalid password" and resets in circles.

- **The `_verified` base field ships with `defaultAccess` (any authenticated user) on ALL THREE
  axes** (installed auth/baseFields/verification.js) — under open registration the create axis is
  load-bearing, the same lesson as #80's roles/assignments: without an override, a signup body
  carrying `_verified: true` self-verifies. Overridden to `siteAdminField` create/update +
  `emailReadAccess` read; the verify op writes via `db.updateOne` and registerFirstUser via
  overrideAccess, so neither is affected. Pinned at wire level (http strip test) AND as DB-free
  wiring (`verifiedFieldWiring.spec.ts`, which also pins the frontend link in the email).
- **THE BACKFILL TRAP (the reason the migration is more than a column-add):** with verify enabled,
  the JWT strategy rejects any user whose `_verified` is FALSY — not just `false` (jwt.js:72;
  login.js only rejects `=== false`), and resetPassword coerces NULL→false. A plain ADD COLUMN
  (NULL for existing rows) would therefore lock out EVERY existing account on its next request
  while a naive login test still passed. `20260710_041621_add_email_verification` backfills
  `_verified = true` WHERE NULL (the NULL guard keeps a re-run from verifying post-migration
  unverified signups), idempotent guards per project rule.
- **Migration + types generation ran OFFLINE on this Mac — no Rock, no Docker, no DB.** The CLI
  hang is ONLY the connect step (compose `postgres` hostname): `getPayload({ disableDBConnect,
  disableOnInit })` then `payload.db.createMigration(...)` — buildCreateMigration (installed
  @payloadcms/drizzle) diffs the config-built schema against the latest committed .json snapshot,
  nothing touches a database. Same shape for `generateTypes` (pure configToJSONSchema): generate
  to a scratch path via `PAYLOAD_TS_OUTPUT_PATH`, diff → the payload-types.ts hand-edit verified
  **byte-identical** locally, closing what used to be the Rock byte-compare step. Run the script
  with `npx tsx` + `.env` sourced — `payload run` fails here (its vendored tsx breaks under this
  Mac's Node 25, and module resolution needs the script inside the app tree). Snapshot sanity
  check: the new .json diffs from the previous one by EXACTLY the two users columns; the
  zero-UUID `prevId` matches the existing snapshots' convention.
- **Every Local-API user create needed touching:** fixture/seeded users are born
  `_verified: true` (JWT strategy) with `disableVerificationEmail: true` (a relay bounce on a
  fixture address would fail the create itself); the signup http tests moved to the example.com
  blackhole idiom because REST signups now send REAL mail on a live stack.
- **No resend-verification endpoint in v1 (deliberate):** Payload has none natively; the 3/day
  signup cap bounds abuse and is also the verification-mail budget (one send per create). A stuck
  unverified account is a Site-Admin remedy (PATCH `_verified`). Build a throttled custom endpoint
  (with its owed wire tests) only if this bites real users.
- **First-user note:** /admin's create-first-user auto-verifies (registerFirstUser, in source); a
  FRONTEND first signup on a fresh DB needs the emailed link — console-logged when SMTP_HOST is
  unset, and #53's boot refusal still guards the public-exposure case.
- **/simplify pass (4-angle): applied.** ① The altitude review's real catch: the per-site
  `_verified`/`disableVerificationEmail` spray had ALREADY missed `scripts/verify-rbac.ts` (three
  `.test.local` creates that would attempt real sends on the SMTP-configured Rock — a bounce fails
  the create). Fixed there, and the class is closed by `createUserVerified` in tests/helpers
  (fixtures' mkUser, seedUser, and every ad-hoc spec create route through it; a spec testing
  unverified behavior overrides via `data`). ② LoginForm discriminates UnverifiedEmail by
  `res.status === 403` — the login op's ONLY 403 (creds/lockout 401, throttle 429; verified in
  installed errors/) — instead of regexing Payload's i18n copy, which a locale change or upgrade
  would silently break; the http test keeps asserting the message as an upstream-copy canary.
  ③ The email-link base (`ADMIN_URL || SERVER_URL || ''`) had grown a THIRD prose-linked copy —
  past the two-call-site ruling — so it's now `lib/emailLinkBase.ts`, used by the reset +
  verification emails and the message ping. **Skipped:** extracting a shared page shell for
  verify-email/reset-password (two sites, differing copy — the two-call-site ruling holds);
  efficiency review returned clean (the signup change is a net win — it deleted the auto-login
  POST).

---

## 2026-07-09 (browse/panel review findings) — panel stars re-fetch on open; search includes pinned favorites; NaN grade is no filter

An external review of the #77–#80 arc surfaced three accepted findings plus a PR-#79 line comment
(DECISIONS grepped first — no prior rulings). All fixed in one CI-gated PR, each pinned:

- **[P2] VersionsChip re-fetches on EVERY panel open** (was first-open-only): favorites toggle
  INSIDE the panel and `FavoriteToggle` never writes back to the chip's map, so a close/reopen
  re-mounted the stars from the first-open snapshot — wrong filled state, wrong next toggle. Soft
  refresh (the shown list stays visible during the re-fetch). Component-pinned (reopen fetches
  both reads again).
- **[P2] Search includes pinned non-Official favorite rows**: `filteredPinned` participated in the
  empty-check but never reached `SearchResults` — a query matching ONLY a pinned favorite rendered
  "No lesson plans match". Component-pinned.
- **[P3] A NaN grade (hand-edited `?grade=abc`) now means NO grade filter** in `filterRows` —
  matching NaN against rows silently emptied the catalogue while no chip showed active. Unit-pinned.
- **[Minor, PR #79 comment] `popstate` clears the pending URL debounce** — a debounced
  `replaceState` firing after back/forward overwrote the restored URL with pre-navigation
  criteria, desyncing the address bar from the view.

---

## 2026-07-09 (open registration + password reset) — Payload-native everywhere; the create axis on privileged fields became load-bearing

**User decision: OPEN registration** (vs invite-only) for the login page's new Sign up link, plus
Forgot password. Maximum standard-Payload per the user's instruction — no custom auth endpoints:

- **Sign up = default REST `POST /api/users` + the standard login op.** Opening
  `access.create` (was Site-Admin-only) exposed a latent gap: `roles`/`assignments` had NO
  create-axis field access (safe only because the collection gate implied a trusted caller). Both
  now carry `create: siteAdminField`/`assignmentsUpdateField`, so a hostile signup body's
  privilege smuggling STRIPS — wire-pinned. First-user bootstrap unaffected
  (`grantSiteAdminToFirstUser` runs after the strip; #53's boot refusal still guards exposure).
  An authenticated NON-admin still cannot create users (403, pinned) — only anonymous signup and
  Site Admin people-management.
- **Signup throttling rides the existing auth seam** (`rateLimitAuthOperations`, the #42
  `beforeOperation` hook): an unauthenticated create = a signup → per-email (3/day) + site-global
  (100/day) buckets, env-overridable. With email VERIFICATION deferred (Payload `auth.verify`
  adds a `_verified` column = Rock-generated migration — noted as follow-up hardening), these
  caps are the abuse bound.
- **Forgot/reset = Payload's native ops**, already rate-capped (#42). One change:
  `generateEmailHTML` now links the FRONTEND `/reset-password?token=` page — the old
  `/admin/reset/${token}` bounced non-admins off the gated panel after resetting.
- Frontend: `/signup`, `/forgot-password` (same response whether or not the account exists — no
  oracle), `/reset-password` (Payload signs the user in on success); login page links to both.
  SPEC §8 amended; guide copy added.
- **/simplify pass (this + the catalogue-perf diff): applied** — signup folded into
  `rateLimitAuthOperations`' operation→buckets dispatch as a third row (was an early-return fork
  duplicating the lowercase/'invalid' key rule — a security-relevant invariant that must not
  drift), hook docblock updated to cover signup + the Local-API budget note; the users create
  policy moved to `access/index.ts` (`usersCollectionCreate`) beside its read/update siblings —
  a policy hiding in the collection file is what the next audit misses. **Skipped by decision:**
  a shared fetch helper across the four auth forms (their error semantics genuinely differ; the
  shared part is one fetch call — the fileResponse two-call-site ruling applies) and a one-owner
  serializer for LibraryBrowser's three small adjacent URL-param sites (optional per review).
  Efficiency angle reviewed clean (deliberate no-useMemo: criteria is the only state, a memo
  would never hit; the RSC payload doubling is the accepted cost of client-side filtering).
## 2026-07-09 (catalogue perf) — browsing goes CLIENT-side: a filter click was a ~1s server round-trip

**User-reported on the live Rock: the T2 filter buttons take a full second.** Root cause: the chips
were server LINKS — every click re-ran the entire catalogue render server-side (four Payload
queries, including the T2/PR-② widened selects: the deliverable-group joins and the corpus-wide
version stubs) plus an RSC navigation round-trip. Search paid the same tax per debounce.

**Fix: the catalogue is ONE loaded dataset, so browsing it is now fully client-side.** The server
page keeps the four queries (one render) and hands serialized rows to a new `LibraryBrowser`
client component that owns search + subject/grade state and filters in memory (`filterRows` in
lib/substrand — pure, unit-pinned, AND-composed). A chip click or keystroke is now a local
re-render (~ms).

- **URL contract unchanged** (`?q/&subject/&grade` — shareable, SSR renders a shared URL
  pre-filtered) but written via `history.replaceState` (debounced 250ms; NO RSC re-fetch) and read
  back on `popstate` for back/forward.
- **`SearchBox` is deleted, and its unit spec with it** — the whole bug class that spec pinned
  (debounce-cancel-on-unmount, own-echo vs external `?q=` change) existed only because typing
  NAVIGATED the global router; with filtering synchronous and the URL write side-effect-only,
  those hazards are structurally gone. FavoritesSection/Catalogue/SearchResults/SubstrandRow moved
  into LibraryBrowser unchanged (markup/classNames identical).
- Favorites still re-render via `router.refresh` → fresh props flow into the client component;
  filter state survives (component identity is stable).

---

## 2026-07-09 (redesign PR ② build notes) — VersionsPanel via standard REST; two argued deviations from the 2026-07-06 lock

PR ② of the version-browser redesign (design locked 2026-07-06; PR ① = #68), built AFTER the
teacher-first track — which changed two of its premises. Deviations, argued:

1. **The catalogue row star STAYS a toggle on the Official (design said: indicator-only when any
   version is favorited).** The indicator design solved "which version would the row star toggle?"
   — but T4 answered that definitively (teachers' stars = follow-the-Official toggles, shipped
   behavior), and splitting one control's behavior by role is worse than the ambiguity it avoided.
   The gap the indicator also served (pinned favorites invisible on the home page) is closed the
   other way the design specified: **"My favorites" is now a list of VERSIONS** — a pinned
   non-Official favorite renders as its own row, suffixed `· vX (pinned)`, linking straight to
   `?version=`. Editors' per-version toggles live in the panel as designed.
2. **Chip + panel are Editor+-only** — not a new deviation, the 2026-07-08 teacher-first lock §4
   amendment. Teachers see no versions UI anywhere; server-side `isEditorFor` per row decides.
3. **Panel data = STANDARD Payload REST, no custom endpoint** (§13 Payload-first): versions via
   `GET /api/lesson-bundle-versions?where[lessonPlan][equals]=…&select…&depth=1` (author resolves
   through the names-only roster projection), favorites via own-rows-only default REST. No new
   authz surface → no new wire tests owed; the panel is gated by the same collection access the
   suites already pin.
4. **Ordering:** the app-wide Official-first/newest→oldest order ships as `lib/versionsOrder.ts`
   (unit-pinned) applied at the PRESENTATION edge; `findReadableVersions` stays ascending (its
   compare-picker callers rely on oldest-first).
5. The catalogue adds ONE projected fetch (whole-corpus version→plan ids) for the per-plan count
   behind the chip — same corpus-size posture + revisit thresholds as the existing fetches.
6. **PR ③ (same day):** the lesson-page pill bar is REPLACED by the same chip+panel —
   `Version 1.0.2 · Official  [N versions ▾]  [Compare]` — with the panel's "viewing" marker;
   Compare keeps its own button (unchanged target). The version line now shows for editors even on
   single-version plans (orientation); chip+Compare appear only with 2+. Pill CSS retired (desktop
   + the mobile 44px rule, which the Compare button inherits instead); guide copy updated. The
   compare page's own pickers are untouched (oldest-first `findReadableVersions`, deliberate).
   **This completes the 2026-07-06 version-browser redesign (①=#68, ②=#77, ③=#78).**

---

## 2026-07-08 (T4 build notes) — teacher stars follow the Official via a RE-POINT hook; no schema change

T4 of the teacher-first track (lock §7 left the mechanism to build time). **Chosen mechanism: an
`afterChange` re-point hook on lesson-plans** (`retargetFollowerFavorites`, beside T1's prewarm
hook) — when the Official pointer MOVES, favorites on the old Official belonging to users WITHOUT
edit rights on that subject-grade are re-pointed to the new one; editors' rows stay (their
favorites remain the deliberate per-version pins of 2026-07-06).

- **Why re-point, not schema:** the alternatives — a nullable `lessonPlan` ref for tracking
  favorites, or a `pinned` flag — need a migration, and the flag variant STILL loses teacher stars
  on promote-and-delete-previous (the row keeps referencing the deleted version). Re-pointing keeps
  the `{user, version}` row shape, needs no migration, and lands inside the pointer-move
  transaction — i.e. BEFORE make-official's optional delete of the previous Official, so follower
  stars survive promote-and-delete (int-pinned).
- **Dedupe:** a follower already starred on the new Official just loses the redundant old row (the
  compound unique index would reject the re-point).
- **No `req.user` gate** (unlike prewarm): this is data consistency, owed on system pointer moves
  too. Per-row best-effort with logging — a favorites hiccup must never fail a promotion; a skipped
  row at worst falls to the delete-previous cascade (pre-T4 behavior).
- **Accepted softness:** "follower vs pinner" is evaluated at MOVE time from the owner's role — a
  user demoted from Editor later keeps old pins; a promoted teacher's stars stop following. Fine.
- SPEC §10 favorites bullet amended (role-split semantics); guide copy updated; int tests pin
  follow / pin-stays / dedupe / survives-delete-previous. Two prior-blocks-leak-state lessons
  applied: the new describe starts from a clean favorites table.

---

## 2026-07-08 (T3 build notes) — request-editing: privileged step is recipient RESOLUTION only; messages are created as the caller

T3 of the teacher-first track (lock §6). Build-time decisions:

- **The endpoint's ONE privileged act is knowing who the admins are** (roster is names-only, SPEC
  §8): `resolveRecipients` looks up Site Admins + the sg's Subject Admin with overrideAccess (the
  grant-holder query mirrors the demote scan's `assignments.subjectGrade` + in-memory role filter —
  two dot-path conditions can't be pinned to one array element), deduped, requester excluded. The
  results are never RETURNED to the caller — only messaged.
- **The messages are created `overrideAccess: false` as the caller** — sender stamping, the
  per-sender daily message cap, context-link validation, and the zero-unread ping run exactly as
  for a hand-written message; the standing "authorize-then-overrideAccess-write" caution doesn't
  even arise for the message writes. All-or-nothing: creates run in one transaction so a mid-loop
  failure can't half-notify the admin set.
- **Throttle = `editRequest` bucket, key `${userId}:${sgId}`, 1/day** (env-overridable) via
  `enforceSharedRateLimit` — per subject-grade, so asking about Biology G10 doesn't block
  Chemistry G11. Checked before any work (probing spends budget — email precedent). Already-editors
  get 409, not a message.
- **Body carries no requester name** — the message's sender relation already attributes it; the
  body is the ask + scope (`Subject · Grade N`) + a Manage → Editors pointer, with the plan as the
  context link.
- Wire tests per the standing agreement: 401 / 404 / 409-editor / 200 happy (recipient set ==
  {Subject Admin, Site Admin}, body + plan link asserted via Local API) / 429 repeat.

---

## 2026-07-08 (T2 build notes) — teacher catalogue: strip/filters/cards; the projection widenings and their costs

T2 of the teacher-first track (design lock below). Build-time decisions worth recording:

- **The strip's deliverable list derives from the generator's own decision.** `versionDeliverables`
  (adapter.ts) applies the same clean→hasContent rule `bundleToAresData` uses for
  `FINAL_EXPLANATION`/`SUMMARY_TABLE`, and `deliverables.spec.ts` pins the mirror by asserting tag
  presence == the adapter's emission per fixture — a drift means a button that 404s.
- **Two deliberate projection widenings, both bounded:** the catalogue query and
  `findReadableVersions` now select `finalExplanation` + `summaryTable` (nested groups → extra
  joins) solely to decide strip buttons. Catalogue = whole corpus (hundreds; same documented
  ~1–2k revisit threshold as pagination); readable-versions = one plan's naturally-bounded set.
  The alternative (a stored derived flag) needs a migration — not worth it at this scale.
- **Filters are URL-driven server links** (`?subject=&grade=`), not client state — shareable,
  combinable with `?q=`, options derived from data (nothing hardcodes grades 10–12). SearchBox now
  merges instead of replacing params; side effect: URLSearchParams encodes space as `+` (was
  `%20`) — identical server-side decode, unit pin updated with a comment.
- **PDF-in-new-tab is popup-blocker-safe:** the tab opens SYNCHRONOUSLY in the click handler
  showing "Preparing document…", then navigates when `ensureExportReady` (extracted from
  `downloadExport`, single owner of the prepare+poll handshake) resolves; on failure it closes and
  the error lands inline.
- **Zip demoted, not removed:** "Download all" (DOCX/PDF .zip) moved into the action bar; the
  per-document strip is the primary surface on BOTH catalogue rows and the lesson page.
- **Versions UI now editor-gated** (lesson-page pill bar + Compare render only for `isEditorFor`),
  per lock §4. The read gate is untouched — a teacher with a direct `?version=` link still opens it.
- **NOT verified in a live browser this session** — Docker daemon isn't running on this Mac, and
  CI renders no frontend pages. Gates: typecheck/lint/unit local + CI build/int/http. **The user's
  in-browser eyeball after the next Rock deploy is the outstanding verification** (strip on rows +
  lesson page, PDF new-tab, Word download, filter chips, mobile cards, teacher sees no pills).

---

## 2026-07-08 (Codex post-T1 audit) — status jobId binds to {version, kind}; job-boundary kind guard

An external Codex pass over merged T1 (#72) found no Critical/High; two accepted findings, both
fixed in one CI-gated PR. DECISIONS was grepped first (standing rule): the 2026-06-28
"readiness is VERSION-scoped" entry governs the *ready short-circuit*, not the not-ready jobId
binding, so neither finding had been previously declined.

- **[P2] The export status poll's not-ready jobId binding was version-only — a DOCX job's id could
  report `preparing`/`expired` for a PDF poll on the same version.** Pre-existing (the version-only
  `jobMatchesVersion` check predates T1 — kinds were separate jobs before T1 too), but T1's per-kind
  pre-warm makes mixed-kind job rows routine. Now binds with `jobMatchesSpec` ({versionId, kind}).
  The ready short-circuit stays spec-scoped and jobId-agnostic per the 2026-06-28 contract. Pinned
  by a wire test (DOCX jobId + `as=pdf` on a cold version → 404).
- **[P3] The artifact task boundary accepted `kind` as arbitrary text** (`inputSchema` `text`; the
  handlers treated non-`pdf` as DOCX-like), so a Site-Admin/system enqueue with a bad value would
  write artifacts under an arbitrary cache namespace. Not teacher-reachable (external job CRUD is
  locked down) — hardened anyway: `assertExportKind` (in `exportArtifacts.ts`, the `ExportKind`
  owner) now runs at the top of BOTH task handlers (`generateVersionArtifact`,
  `emailVersionArtifact`) before any cache write; a bad row fails its job. Unit-pinned
  (`exportKind.spec.ts`). Endpoints keep `parseExportKind` — this is its trusted-path counterpart.
- **Noted, not actioned:** Next 16 deprecates the `middleware` filename in favour of `proxy` (build
  warning) — upstream rename, fold into the next deliberate Next bump.

---

## 2026-07-08 (teacher-first track) — DESIGN LOCK: the teacher experience is the next build arc; it REORDERS ahead of VersionsPanel PR ②/③

**Context (user decision):** ~95% of users are Teachers with no editing/admin interest. The system must
be extremely friendly for them: hide every editing/management affordance, surface Official documents
with one-click PDF (opens in browser) / Word (downloads) per deliverable, modelled on the clean ARES
demo page (`demo.aresedu.dev/modules/Curriculum_Teacher_Aids/PDF/`: search bar → subject filter →
per-document lines with two small buttons). All decided in structured discussion 2026-07-08; the user
signed off on every item below.

**Decisions (locked):**
1. **Make Official gating — VERIFIED ALREADY CORRECT, no change.** The user asked that Make Official
   be Site-Admin (any doc) / Subject-Admin (their subject-grades) only, never mere `canEdit`. Checked
   three layers: button renders under `canMakeOfficial = isSubjectAdminFor` (page.tsx L70,
   EditActions L77), and the endpoint independently enforces `authorize(req,'admin')` →
   `isSubjectAdminFor` (versionEdit.ts L202). Editors get 403 on a hand-crafted POST. Matches intent.
2. **Per-deliverable export, served from the EXISTING artifact cache** (not a new storage layer — the
   "store official PDFs/DOCX on the server" ask is already satisfied by the on-disk content-addressed
   cache; artifacts stay derivable + disposable). New `GET /:id/export/doc?doc=<tag>&as=docx|pdf`
   serves ONE deliverable: PDF `Content-Disposition: inline` (opens in a browser tab — this alone
   fixes "PDF doesn't open in browser"; the zip wrapper was the cause, not regeneration), DOCX
   `attachment`. The zip stays as a secondary "Download all". Buttons appear BOTH on catalogue rows
   (a per-document strip: "Lesson plan [PDF] [Word]" etc.) AND on the lesson page (replacing the
   zip-only bar; zip demoted to secondary link).
3. **Pre-warm on Official designation.** Enqueue `generateVersionArtifact` (docx+pdf) whenever a
   version becomes Official — so a teacher never hits the cold 202/poll path. Cold DOCX ≈1–2s, cold
   PDF = Gotenberg seconds; warm = disk read. Enqueue is try/caught (a prewarm failure never fails
   the promotion — messagePing precedent). Eviction of an Official artifact (LRU 512 MB) just means
   one rare regeneration; pinning deferred until it matters.
   - **REFINED at build time (same session, /simplify altitude pass):** the original wording named
     two call sites (make-official + first-ingest), but a third pointer-moving path exists — the
     Site-Admin **Official-pointer repair form** (the lesson-plans document view) — and per-call-site
     wiring taxes every future mover. Shipped shape: a lesson-plans `afterChange` hook
     (`prewarmOfficialArtifacts`) fires on every **authenticated** pointer change (`req.user` gate =
     the same system-path carve-out as `validateOfficialVersionPointer`, so fixtures/migrations
     don't mass-enqueue), and **ingest keeps one explicit call** as the sole system path that wants
     warming. Same intent, full coverage, one mechanism per caller class.
4. **Versions UI is Editor+ only** (amends the locked 2026-07-06 VersionsPanel design, which put the
   `[N versions ▾]` chip on rows for everyone): Teachers see Official only — no chip, no pill bar, no
   "show additional versions" checkbox (explicitly rejected). The chip/panel renders only for
   `isEditorFor` on that row's subject-grade.
5. **Catalogue redesign:** responsive one-DOM layout — rows-with-document-strip on desktop, cards on
   mobile; grade filter buttons (10/11/12, derived from data, not hardcoded) + subject filter; the
   existing search stays. 44px touch targets per the standing mobile pass.
6. **"Request editing privileges" button** (teacher-only, on the lesson page): a dedicated endpoint
   composes a standard message — "«Name» requests editing access for «Subject · Grade N»" with a plan
   context link — to the subject-grade's Subject Admin + all Site Admins, resolved server-side
   (teachers can't know who admins are; roster is names-only). Dedupe: one request per user per
   subject-grade per day. The grant itself stays manual (Manage → Editors widget). Reuses the §10
   messaging plumbing (inbox, ping, caps).
7. **Teacher stars track Official.** Favorites are per-version (PR ① #68) — right for editors, wrong
   for teachers, who'd silently pin an outdated snapshot when the Official moves. Decision: a plain
   teacher's star follows the plan's CURRENT Official; mechanism decided at build (PR T4).
8. **REORDER (supersedes "build VersionsPanel PR ② next"):** the panel's premises changed (editor-only
   + must sit in a catalogue layout that doesn't exist yet) — building it into today's markup then
   redoing the catalogue is exactly the churn the working agreements prohibit. **New order: T1 backend
   (per-doc endpoint + pre-warm) → T2 catalogue redesign (layout/strip/filters/role-gating) → T3
   request-editing → T4 teacher stars → THEN the amended VersionsPanel ②/③.** Also serves 95% of
   users first.

---

## 2026-07-07 (eyeball: dup-Edit + version window) — two user-flagged items triaged; both deferred to a later session

The user eyeballed the live Rock and reported two things "absent," asking whether they were never coded
or never deployed. Triaged against code + history (no code changed this pass — recorded for the next
session; the user chose to defer both).

- **Duplicate top-right "Edit" button on the version editor — ROOT CAUSE CONFIRMED: the selector is
  scoped as a DESCENDANT of a wrapper that is not its ancestor.** Coded ✓, deployed ✓, compiled into the
  served CSS ✓ — it simply can't match. The hide-rule in `app/src/app/(payload)/custom.scss` (~L470) is
  nested under `.collection-edit--lesson-bundle-versions` as `.doc-tab[aria-label='Edit'] {display:none}`,
  i.e. `.collection-edit--lesson-bundle-versions .doc-tab[aria-label='Edit']`. **Live-Rock verified
  2026-07-07** (HEAD `2d8ce7b`, image fresh): `docker compose exec app grep …` found BOTH `aria-label=Edit]`
  and `lesson-bundle-versions` in `.next/static/…css`, so the rule is deployed and served — yet the button
  persists. **Installed Payload source pins why:** in `@payloadcms/next/dist/views/Document/index.js`
  (~L355) the `DocumentHeader` (which renders the `.doc-tab` tabs) is a *preceding sibling* of the edit
  `View`; the `.collection-edit--{slug}` class lives inside that `View`. So the `.doc-tab` is NOT a
  descendant of `.collection-edit--lesson-bundle-versions` and the descendant combinator can never match.
  The sibling rule in the same block, `.doc-controls .form-submit`, works only because the controls bar
  *is* inside the `View`. **Live DOM inspect (2026-07-07) closes it definitively:** the element is
  `<div aria-label="Edit" title="Edit" class="btn doc-tab doc-tab--active … btn--disabled" disabled>` —
  it satisfies `.doc-tab[aria-label='Edit']` (and `[title='Edit']`) exactly; only the ancestor chain
  lacks `.collection-edit--lesson-bundle-versions`. The `body:has()` fix is guaranteed to match because
  the co-located `body:has(.collection-edit--lesson-bundle-versions) .template-default` chrome-hide rule
  already fires on this view (no Payload sidebar renders), proving the wrapper class is present.
  - **The `title`→`aria-label` swap in #67 was a NO-OP, and the "title never matched" premise was
    FALSE.** `@payloadcms/ui` `Button/index.js` sets BOTH `'aria-label': ariaLabel` (L91) and
    `title: ariaLabel` (L100) on the same element, and the Edit tab's label is `({t}) => t('general:edit')`
    = "Edit" (tabs config). So `[title='Edit']` and `[aria-label='Edit']` were always equivalent; the
    attribute was never the problem — the scoping was, in both attempts.
  - **FIX APPLIED + SHIPPED (2026-07-07, this session): PR #71 (`e87d522`), CI-green, deployed to the
    Rock via `scripts/deploy.sh`, and USER-CONFIRMED in-browser (the button is gone).** One line — moved
    it out of the `.collection-edit--` nesting to the `body:has()` ancestor pattern already proven on
    `.template-default` in this same file:
    `body:has(.collection-edit--lesson-bundle-versions) .doc-tab[aria-label='Edit'] { display: none; }`.
    The `.doc-controls .form-submit` (native Save) rule stayed nested — it genuinely is a descendant of
    the View.
  - **LESSON (reinforced, now with a mechanism): a CSS hide-rule against framework-internal (Payload)
    markup is not "done" until an in-browser check proves it hides the RENDERED element.** The specific
    trap here: reading a component's source (`TabLink.js`) tells you what one component emits, but NOT
    where it sits in the overall view tree — so a *scoping* (combinator) bug is invisible to source-only
    review and only shows up in the assembled DOM. Two consecutive misses on this exact rule. Treat
    "hide an internal element via selector" as requiring browser verification of BOTH the element AND its
    ancestor chain, same tier as an authz change requiring a wire test.
- **Version-picker WINDOW — NOT built; only designed.** The user expected clicking a multi-version
  lesson to open a window listing its versions. That is PR ②/③ of the version-browser redesign whose
  design was locked 2026-07-06 (① per-version favorites → ② `VersionsPanel` + `[N versions ▾]` chip →
  ③ swap the lesson-page pill bar for chip+panel). **Only PR ① (#68) merged — it is the backend schema
  change (favorites → per-version), no UI window.** There is no `VersionsPanel` component in the tree.
  What exists today is the pre-redesign inline **pill bar** on the lesson detail page
  (`lessons/[id]/page.tsx` ~L113, rendered only when a plan has 2+ versions), which is why the two
  versions of "Chemicals of life" are reachable as pills but not via a popup. Next-session work = build
  PR ② then ③ per the locked design.
- **Net answer to "not coded or not deployed?":** dup-Edit = coded + deployed but ineffective (selector
  wrong); version window = never coded (design + backend only). Neither is a lost/partial deploy.

---

## 2026-07-07 (review-finding batch) — stale-guard tightened to EXACT equality (REVERSES 2026-07-06 Codex #2); compose `?version=` validated; context-fetch overlap

A three-item review pass (P2 + two P3s) landed via two stacked, CI-gated PRs, both merged to `main`
(**#69** `525ac42`, **#70** `3fdb1b6`; app-level only, **no migration** — Rock deploy is the usual
`scripts/deploy.sh`, which pulls, takes a pre-migration snapshot, then `docker compose up -d --build`).

- **#69 [P2] — the save-as-new stale-source guard is now EXACT equality (`baseMs !== srcMs` → 409),
  reversing the 2026-07-06 Codex #2 decision below.** That entry declined exact-equality on two
  grounds: (a) not a security boundary — the endpoint only ever creates a *candidate*, so a forged
  future `updatedAt` only skips a warning protecting the forger's own save; (b) exact-equality would
  add "false-409 serialization risk for zero gain." **We reversed it because the reasoning behind (b)
  is disproven and (a) undervalues the contract.** The old guard rejected only `baseMs < srcMs`, so a
  forged/buggy *future* timestamp (`2999-…`) sailed through and let a stale client branch from stale
  form state — defeating the stated reload-before-branching contract even if "only" for a candidate.
  On the serialization worry: Payload stores `updatedAt` at millisecond precision (`timestamp(3)`),
  and the value round-trips through the editor form as the same string, so equality holds on the real
  path — **empirically confirmed**: the happy-path http test posts the fixture's actual `updatedAt`
  and still returns 200 under `!==` (CI green). A forged FUTURE timestamp → 409 is now pinned by a new
  wire-level case beside the existing past-timestamp one.
  - **LESSON (recorded to private memory too): before implementing a review finding, grep
    `docs/DECISIONS.md` for that exact area — a prior deliberate decision may already have weighed it.**
    This finding had been explicitly declined the day before; the reversal is fine *because it is
    argued and evidenced*, but it should have been surfaced as a reversal from the start, not
    discovered while writing it up.
- **#69 [P3] — the messages compose `?version=` is validated before prefill.** The page passed any
  numeric `?version=` straight to the Composer. The send path was already safe (`validateContextLink`
  in `Messages.ts` rejects a mismatched plan/version pair), so this was only a broken *prefilled UI*
  from a stale/manipulated URL. The page now keeps the version link only when it's a readable version
  belonging to the linked plan — mirroring the server hook via the already-shared `findReadableVersion`
  + `relId` (the visibility rule stays single-sourced in `readBundle.ts`; only a two-line divergent-
  behaviour comparison is "duplicated", which `/simplify`'s altitude pass confirmed is the right depth,
  not an extractable helper).
- **#69 [P3, DEFERRED] — the messagePing zero-unread gate can double-fire under concurrent first-unread
  creates.** Left as the documented, cap-bounded limitation (two simultaneous sends to an empty inbox
  can both observe zero other-unread and both enqueue a ping; bounded by the per-recipient daily ping
  cap). A correct fix needs a `SELECT … FOR UPDATE` recipient lock — disproportionate machinery for a
  worst case of one extra content-free email. Stays on the deferred backlog.
- **#70 (perf follow-up, surfaced by `/simplify`) — compose-context resolution overlaps the inbox
  batch.** The page resolved the compose context (`findReadablePlan` → `findReadableVersion`) in its
  own serial wave ahead of the independent `roster/received/sent` `Promise.all`. The plan→version
  fetches stay sequential (the ownership check needs the plan id), but the whole resolution is
  independent of the inbox batch, so it now runs concurrently with it (three serial waves → one).
  Behaviour unchanged. The other `/simplify` angles (reuse, simplification) found the diff clean.
- **Ops note on this Mac:** pushing worked by passing a human-pasted fine-grained PAT inline in the
  push URL (`https://x-access-token:${TOK}@github.com/…`, not persisted to git config) and opening/
  merging PRs via the REST API (no `gh` CLI here). CI (`.github/workflows/ci.yml`) triggers only on
  `pull_request`/`push` to `main`, so a stacked PR (#70, based on #69's branch) got **no runs** until
  its base was retargeted to `main` AND it was closed+reopened to fire a `reopened` event — a
  base-change alone does not fire the default `pull_request` trigger.

## 2026-07-06 (redesign PR ① built: per-version favorites) — fail-safe migration; Codex triage; NODE_ENV int-test gotcha

**PR #68 (`feat/favorites-per-version`) implements build-step ① of the version-browser redesign**
(design entry below). Decisions and lessons from the build:

- **The version-delete cascade covers plan deletion too — one hook, not two.** All three ways a
  version dies (save-as-new `deleteSource`, make-official `deletePrevious`, and
  `cascadeDeleteLessonPlanVersions`' bulk where-delete) go through `payload.delete`, which runs the
  collection's `beforeDelete` per matched row (the same fact `enforceOfficialNotDeletable` already
  relies on). So `cascadeDeleteVersionFavorites` on `lesson-bundle-versions` replaces the plan-level
  favorites cascade entirely; both the direct and the transitive path are int-pinned.
- **Migrations that map data must fail loudly, not delete quietly (Codex 2026-07-06 #1, adopted).**
  The first draft deleted favorites whose plan had no Official version to map to. Replaced with a
  `RAISE EXCEPTION` carrying the row count: the transaction rolls back, favorites survive, the
  operator repairs and re-runs. Proven on a seeded scratch DB (abort → rows intact → repair →
  success). Live preflight on the Rock: 0 unmappable rows. The `down` keeps its pragmatic delete —
  blocking a rollback under duress is worse — and its keep-newest dedupe is a semantic necessity of
  the old unique `(user, plan)` index, not data loss to fix.
- **Migration generation no longer needs the Rock.** `migrate:create` ran locally: scratch DB in the
  compose Postgres + the `lesson3-migrate` builder image bind-mounted over live source (`-v /app/node_modules`
  anon volume), `expect` answering drizzle's rename-vs-create TTY prompt. Same deps image pattern as
  the Rock procedure; `generate:types` verified the hand-edit byte-identically the same way.
- **`test:int` inside the builder image needs `NODE_ENV=development`** — the image bakes
  `production`, which disables Payload's dev `push`, so the schema never builds and every spec fails
  with "relation does not exist" (42P01). Cost a debugging round. A `test:int:local` wrapper script
  is a flagged follow-up (Codex #3).
- **Stale-guard posture (Codex #2, declined) — ⚠ SUPERSEDED 2026-07-07 (see top entry #69).** At the
  time: `save-as-new`'s equal-or-newer `updatedAt` check is a consent/UX guard, not a security
  boundary — the endpoint only ever creates a new candidate, so a forged future timestamp merely skips
  a warning protecting the forger's own save (a reload achieves the same legitimately); exact-equality
  would add false-409 serialization risk for zero gain. **Later reversed:** the serialization risk is
  disproven (ms-precision round-trip → exact equality on the real path, CI-confirmed by the happy-path
  test), and rejecting a forged *future* base is worth the contract clarity. The guard is now
  `baseMs !== srcMs`.
- **Committed `payload-types.ts` had drifted**: the META repair-field `admin.description`s from
  #59/#61 were never regenerated into it. The regen in #68 trues it up; nothing behavioural.
- **Codex triage summary:** #1 adopted (above); #2 declined with posture recorded (above); #3
  local int-test harness + #4 HTML-cache-version drift test flagged as follow-up task chips;
  #5 `.env.example` sync + payload-jobs prune stays on the deferred backlog (already tracked).
- **Post-build /simplify pass** (three agents converged on one mechanism): the catalogue's star
  state moved from a side-effect-populated parallel `starByPlan` map (with a "can't happen" guard)
  to an intrinsic `versionId` field on `LessonRow` + one sparse `favByVersion` map; the favorites
  fetch dropped a corpus-sized `where version in officialIds` (own-rows access already scopes it —
  O(user's favorites), and non-Official favorites just miss the rows' Official-id lookups) and now
  runs in `Promise.all` with the plans fetch.

## 2026-07-06 (version browser design — DESIGN LOCKED, PR ① BUILT as #68) — per-version favorites + reusable VersionsPanel

Designed with the user over a long brainstorm; **no code written — the next session builds it.** The
problem: "we expect many versions" and today there is no scalable way to see them all. The catalogue
(one row per sub-strand across ~5–8 subjects × 3 grades × 5–15 sub-strands = ~150–300 rows) is already
long, and the lesson page's version **pill bar** wraps into an unreadable block past ~15 versions.

**Options weighed (UI-first):**
- *Always-open versions table on the lesson page* — rejected: the lesson page already renders the full
  document, so a 30-row table on top makes a heavy page heavier.
- *Inline-expand under the catalogue row* (user's first idea) — rejected: it LENGTHENS the app's longest
  page (the catalogue) and shifts everything below the expanded plan; counterproductive to the length goal.
- **CHOSEN — a floating panel (overlay) opened on demand.** Costs ZERO permanent page height on either
  surface, and gives version access straight from the catalogue without navigating away.

**The locked design:**
- **Catalogue row gains one element, only when a plan has 2+ versions:** a `[N versions ▾]` chip to the
  RIGHT of the plain-text "N lessons" count. **Do NOT overload "N lessons"** as the trigger — it's a
  content count, not a versions control; making it open a version list is the label≠behaviour confusion
  we otherwise hunt down. Clicking the chip opens the panel and stops propagation; clicking anywhere else
  on the row opens the Official version (unchanged). A 1-version plan shows no chip — the row just opens.
- **The panel:** a reusable `VersionsPanel` component, one line per version, `Version · Author · Created
  date · ★`. **Ordering (applies to EVERY version list app-wide): Official pinned at top, then most-recent
  → oldest.** Clicking a line (except the star) opens/switches to that version (`?version=X`). Escape /
  click-outside closes. NO Compare in the panel (needs two selections + a full-width view — stays a
  lesson-page button).
- **Favorites become PER-VERSION** (was per-plan — SPEC §10 "per user, per bundle"). The star **toggles
  inside the panel**, one per version. The catalogue row shows a filled-star **indicator only** (not a
  toggle) when any version of that plan is favorited. "My favorites" becomes a list of VERSIONS
  (`Animal Nutrition — 1.0.2`, links straight to that version). Accepted semantic: favoriting 1.0.2 pins
  THAT version — it does not follow a later Official change (that's the point of per-version).
- **Reuse everywhere (user priority — familiarity + sturdiness):** the lesson page's pill bar is REPLACED
  by the same `[N versions ▾]` chip → the same `VersionsPanel`. On the lesson page the panel also
  highlights the currently-viewed version (an optional "current" marker the catalogue doesn't use).
  **Compare relocates** from the (retired) pill bar to its own button beside the chip:
  `Version 1.0.2 · Official   [N versions ▾]   [Compare]`.

**Build order (each its own CI-gated PR):**
1. **Favorites → per-version.** Re-key the `favorites` collection from `(user, lessonPlan)` to
   `(user, version)`; cascade on VERSION delete (versions die via save-as-new deleteSource,
   make-official delete-previous, plan cascade); migrate existing rows → each plan's current Official
   version; update "My favorites" + the favorite endpoints/toggle. **Migration required** (schema change).
   Amend **SPEC §10** ("Favorites (per user, per bundle)") to per-version in the same PR.
2. **`VersionsPanel` component + catalogue chip.** Panel lazy-loads a plan's versions on open (author
   NAME is safe to show — the names-only roster from PR ③ exposes names without emails; date; the
   caller's per-version favorites). Keeps the catalogue page light (it loads only Official versions today).
3. **Lesson-page swap.** Replace the pill bar with the chip+panel; relocate Compare to its own button;
   add the "currently viewing" highlight. Stopping after ② leaves the pills working — nothing breaks — but
   ③ is recommended for the consistency the user asked for.

## 2026-07-06 (audit batch) — semver system-owned on create; ingest sub-strand race locked; capped fan-outs paginated

An external audit (5 findings: 2 Medium, 3 Low) landed as PRs #64–#66, all merged + deployed. Also
in the batch: #63 (/simplify over the #57–#62 arc — META_IDENTITY_KEYS single-sourcing + fails-
unsafe drift guard, per-pair compare-diff cache, findReadableVersions extraction) and #64 (a
projection-accurate return type for that helper — a `select` projection cast to the full interface
lies about unfetched fields; type the projection, and typecheck doubles as proof callers stay
within it).

- **Medium #1 — semver forgeable on direct create (#65).** The field was update-immutable but
  create-open: a privileged direct create could store "banana"/"999.0.0", corrupting ordering and
  future bump allocation (`nextSemverForPlan` parses malformed pieces loosely). Now create+update
  `systemOnly` (forged values strip to the 1.0.0 default; a dup on an existing plan is rejected by
  the unique index) PLUS a strict x.y.z `validate` that binds even overrideAccess system writes.
  Int tests pin both layers. LESSON (cost one CI round): a create-path field-access strip changes
  what OTHER tests' authenticated creates store — the #57 sourceVersion spoof spec created on the
  fixture plan with an explicit semver, which now strips to 1.0.0 and collides with the fixture's
  own 1.0.0. Give such specs their own throwaway plan.
- **Medium #2 — concurrent first ingest of one sub-strand duplicated plans (#66).** The preflight
  identity lookup ran OUTSIDE the write transaction with no lock: two simultaneous uploads of the
  same NEW substrand_id both saw "no plan" and both created Official 1.0.0 plans, poisoning later
  uploads with the ambiguity guard. Fix = the PR #50 grant-race pattern: `lockSubjectGrades`
  (SELECT … FOR UPDATE on the batch's subject_grades rows, deduped ascending, tx-bound connection)
  at the top of the write transaction + per-file re-resolve INSIDE it — a plan committed since
  preflight now attaches as next-major ('revised') instead of duplicating. Wiring spec pins the
  lock mechanics (rows/order/connection/fallback), same stance as subjectAdminDemoteLock.spec.ts.
- **Lows (#65):** `guardSubjectGradeDelete` + `refreshSubjectGradeTitles` each capped their fan-out
  at a single limit:1000 find (the delete guard fails-unsafe past the cap — the exact FK failure it
  guards against) → paginated with the autoDemote idiom (collect-then-write where writes shrink the
  match set). `JOBS_AUTORUN_LIMIT`/`GOTENBERG_TIMEOUT_MS` moved off `Number(env) || default` onto
  `positiveIntEnv` (malformed → loud boot failure).

## 2026-07-05 (version compare) — diff the RENDERED DOCUMENT via Payload's exported HtmlDiff engine

The user asked for a compare button on the lesson page ("two windows, red/green"), assuming a
standard Payload function. **Reviewed against installed 3.85.1 source first (knowledge-currency
rule): the assumption doesn't hold for our data model.** Payload's version-compare VIEW works only
on its NATIVE versions system (`versions: true` → `_versions` table) — ours are first-class
`lesson-bundle-versions` documents by design — and the view's internals (`RenderDiff`,
`buildVersionFields`) are not in `@payloadcms/next`'s export map. But the diff ENGINE under it IS
public API: `HtmlDiff` (`@payloadcms/ui/elements/HTMLDiff/diff`, via the `./elements/*` wildcard
export) — a pure, dependency-free vendored html-diff whose `getSideBySideContents()` returns
[old, new] HTML annotated `data-match-type="delete"/"create"` (+ its own `data-seq` attrs on block
tags). Handles tables; no React/CSS baggage, so it runs in a server component.

**Decision: diff the rendered document, not field-by-field form data.** `/lessons/{id}/compare`
(READ-gated exactly like the lesson page) pulls both versions' cached content HTML
(`renderVersionSectionsCached` — immutable per version, already sanitized; HtmlDiff only re-wraps
it) and renders two panes — removals red left, additions green right; pickers navigate via GET.
It compares what teachers actually read, and reuses the Phase-3 cache instead of a second renderer.
Field-by-field would mean vendoring unexported internals — rejected. The engine's output contract
is pinned by `tests/unit/htmlDiffContract.spec.ts` so a Payload bump that changes the annotation
format fails fast instead of the page silently losing its highlighting. The Compare button lives in
the version bar (left of the pills), only when a plan has >1 version.

## 2026-07-05 (META identity) — META.subject/grade/substrand_id become Site-Admin-only repair fields

The user's in-browser eyeball pass raised two related findings on the version editor, both the same
class of defect — a form affordance implying an edit the system either ignores or shouldn't allow:

1. **`sourceVersion` (PR #57 + #58).** The field rendered as an editable relationship dropdown over
   EVERY version in the corpus. The edit path was never at risk (save-as-new DROP_KEYS the submitted
   value and stamps the real source; `enforceVersionImmutable` rejects in-place updates), but a
   direct authenticated create could forge provenance. Now `systemOnly` + `readOnly`, mirroring
   `author`; int test pins the create-path strip, wiring test pins the field-access contract (the
   update half is unreachable behind the immutability hook — pinned as wiring, not behaviour).
2. **META identity (this entry, user decision 2026-07-05).** "Why would someone change the subject
   or the grade of a lesson plan? Only if it was corrupted." `META.subject`/`META.grade` only label
   the printed document — the plan's `subjectGrade` RELATIONSHIP (fixed at ingest by exact match) is
   the categorization/RBAC truth, so a Subject Admin edit could only create document-vs-library
   drift. `META.substrand_id` is worse: it's the re-ingest matching key, so a wrong edit silently
   redirects future re-uploads. All three are now **Site-Admin-only** (scope confirmed with the user,
   substrand_id included). The REST of META (titleDoc, subtitleDoc, column labels, filePrefix…)
   stays Subject-Admin per SPEC §5 — those are genuine document curation.

**Mechanism note (the lesson):** field-level `access` alone does NOT enforce this — the real write
path (`save-as-new`) writes via `overrideAccess`, which bypasses field access entirely. Enforcement
is two-layer: `siteAdminOnly` field access (renders the fields read-only in the form + guards direct
create/update) AND a Subject-Admin carve-out in `applyEditorFieldSplit` (identity restored from the
stored doc, the same silent-preserve idiom as the Editor prose whitelist). Any future "role X may
not edit field Y" rule on versions must land in BOTH places; the split is the one that holds.
SPEC §5 amended in the same commit. Pinned by `tests/unit/metaIdentitySplit.spec.ts` (split
behaviour + field-access wiring) and two wire-level save-as-new cases in
`tests/http/endpoints.http.spec.ts` (Subject Admin preserved, Site Admin passes).

## 2026-07-05 (TZ hydration) — second, TZ-dependent React #418 on the version doc view; two-pass timestamps

Fixing the LessonControls mismatch below unmasked a SECOND, distinct #418 (`args[]=text`) on the
version document view — both with and without `?edit=1` — that only reproduces when **server TZ ≠
browser TZ**: a Playwright `timezoneId` A/B against the docker stack (container TZ=UTC) showed a
UTC-context browser clean and an America/Los_Angeles one erroring every load, while native `next
start` (server TZ = browser TZ) was always clean — which is exactly how it hid during the #55 A/B.
Production-relevant: the Rock container runs UTC and real browsers don't.

Culprit: `VersionTimestamps` (the 2026-06-28 sidebar relocation of Last Modified/Created; the
users doc view has no such component, which was the discriminating hint). It's `'use client'` — so
it SSRs AND hydrates, unlike the server-component date usages elsewhere — and formatted with
`toLocaleString(undefined, …)`: server text in container TZ, client text in the reader's zone.

**`suppressHydrationWarning` was tried first and REJECTED by experiment:** React 19 KEEPS the
server text for the suppressed node (browser A/B showed a Pacific reader stuck on the UTC wall
time), i.e. it silences the error by displaying the wrong time. The shipped fix is **two-pass
rendering**: the server pass and the hydration render emit a deterministic string (explicit
`en-US` locale + explicit `timeZone: 'UTC'` + a " UTC" suffix — trees match by construction
regardless of either side's TZ/ICU), then the first post-hydration render swaps in the reader's
true local rendering via a `useSyncExternalStore` is-hydrated snapshot pair (not a mount-effect
setState — the react-hooks cascading-render lint rejects that, and the store variant is one render
cheaper). Browser-verified after: 0 pageerrors in both zones AND the Pacific reader sees 10:25 AM
local, not 5:25 PM UTC.

Pinned by `tests/unit/versionTimestampsTz.spec.tsx`: the server string is exact-match
TZ-independent, and the mounted client drops the " UTC" suffix (detectable even when the test
runner's own TZ is UTC, as in CI). Cross-TZ repro is impossible in-process — the browser
`timezoneId` A/B is the end-to-end evidence.

**Lessons:** (1) hydration bugs can stack — fixing one mismatch un-masks the next, so re-run the
pageerror probe after every fix rather than assuming one root cause; (2) `suppressHydrationWarning`
is not a fix for content the user actually needs to be correct — verify what React 19 *displays*
after suppression, not just that the error is gone; (3) TZ-dependent mismatches are invisible in
any test rig whose server and browser share a timezone — A/B with an explicit browser `timezoneId`.

---

## 2026-07-05 — React #418 on every `?edit=1` editor load: never gate INITIAL render state on `typeof window`

The admin version editor threw a deterministic hydration mismatch (`Minified React error #418`,
args[]=HTML) on every load of `…/lesson-bundle-versions/{id}?edit=1` — the deep link the lesson
page's Edit button uses. This closes the follow-up spun off by the Phase 5 CSP A/B (entry below),
which had proven it pre-existing on main.

**Cause (confirmed with the dev build's full diff, which named `<LessonControls>`):** the Edit-UX #6
unlock (2026-07-01) initialised `editing` from
`typeof window !== 'undefined' && new URLSearchParams(window.location.search)`. The server pass has
no `window`, so SSR always rendered the LOCKED bar (notice + enabled Edit); a `?edit=1` client
hydrated UNLOCKED → mismatched tree → React discards and re-renders client-side. Console error +
wasted render; page still worked, which is why it survived eyeballing.

**Fix:** derive the initial state from `next/navigation`'s `useSearchParams()` — the admin route
renders per-request, so the server sees `edit=1` too and SSR now equals hydration (first paint lands
unlocked; no flash, unlike a mount-effect fix). Payload's own `SearchParamsProvider` is deprecated in
favour of exactly this hook. Verified: prod-build A/B before/after (error → clean, both with and
without the param), locked/unlocked behaviour preserved.

**Rule:** in a SSR'd client component, anything that changes the FIRST render (state initialisers,
conditional chrome) must read request-derivable inputs (props, `useSearchParams`, cookies via
context) — never `window`. A `typeof window` guard in an initialiser is a hydration mismatch by
construction. Pinned by `tests/unit/lessonControlsSsr.spec.tsx` (node-env `renderToString`: server
markup with `?edit=1` must already be unlocked; fails on the old code).

**Debugging note:** React 19's recoverable hydration errors surface via `reportError`
(`pageerror`), NOT `console.error` — browser-console scraping shows nothing. Playwright's
`page.on('pageerror')` catches them; the dev (non-minified) build then prints the exact component
diff.

---

## 2026-07-05 (Phase 5) — Track A shipped: the host-independent pre-VPS half (PRs #49–#53)

Phase 5 planning session + build. **Standing decisions (user-confirmed):** no VPS timeline yet →
the checklist split into **Track A** (host-independent, build now so exposure day is config-only)
and **Track B** (host-gated: TLS/proxy, edge rate limiting, GlitchTip deployment, executing the
runbook); error tracker = **GlitchTip, self-hosted**; **tokenExpiration 2h ratified** under public
exposure (strict CSRF + Secure cookies + Lax + auth rate limits + IdleLogout are the compensating
controls); Subject-Admin uniqueness = **grant-path transaction lock**, the structural partial
unique index stays deferred (needs demote-before-insert inversion + beforeSchemaInit registration
+ 23505 translation — disproportionate; trigger to revisit = assignment write paths multiplying).

**A1 (#49) Gotenberg pins (Codex #8).** Base pinned by multi-arch INDEX digest (resolved against
Docker Hub: Gotenberg 8.34.0, Debian trixie — index covers CI amd64 + Rock arm64);
`ttf-mscorefonts-installer=3.8.1`. Both pins fail LOUDLY when upstream moves; re-pin procedure in
the Dockerfile header. Local build verified real Arial present.

**A2 (#50) Subject-Admin grant lock (Codex #3 / Bucket A #10).** `autoDemotePriorSubjectAdmins`
had a read-then-write race: two transactions granting different users the same grade both scanned
before either committed (READ COMMITTED → neither sees the other's uncommitted grant) → two
Subject Admins. Fix: `SELECT … FOR UPDATE` on the granted `subject_grades` rows BEFORE the scan,
ascending order (deadlock-free for multi-grade grants), tx-bound connection mirroring
userAssignments.ts. Also removed the silent `limit: 1000` demote-scan cap (paginates; race-free
post-lock). Wiring pinned by `tests/unit/subjectAdminDemoteLock.spec.ts`; sanity-flip proven.

**A3 (#51) Nonce-based CSP (Codex #2).** New `src/middleware.ts`: per-request nonce;
`default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'` + old baseline directives;
policy forwarded as a REQUEST header because Next's renderer reads the nonce from it (verified in
installed next@16 app-render.js). Matcher covers documents only — `/api/*` excluded so the preview
endpoint's own `default-src 'none'` still wins (supersedes the next.config negative-lookahead CSP
rule, removed). **Found by the browser sweep:** Payload's admin avatar defaults to GRAVATAR — an
external fetch that violated `img-src 'self'` AND leaked admin email hashes; switched to
`avatar: 'default'` (initials). Verified in a real browser on a local compose stack: all real
routes (both surfaces incl. version editor + live search) hydrate with ZERO violations.
**Accepted caveat** (documented in middleware.ts): the build-time `_not-found`/`_global-error`
shells are the only nonce-less HTML → a direct load of an unknown URL shows the pure-text 404
unhydrated. **Lesson (A/B discipline):** the version editor's React #418 on `?edit=1` looked like
a CSP regression; a native-vs-native A/B against main (same DB) proved it PRE-EXISTING → spun off
as its own follow-up, not chased here. First A/B attempt compared docker-standalone vs native and
gave a FALSE positive on the plain doc view — control the runtime mode when A/B-ing hydration.

**A4 (#52) Error tracking (SPEC §11).** `@sentry/node` (pinned) + `src/instrumentation.ts`
(register/onRequestError, shape verified against installed next@16); job-failure capture at the
three existing catch/log seams. Entirely inert without `SENTRY_DSN`; request headers are
deliberately dropped (auth cookies never leave the box) and email addresses stay out of tracker
payloads. GlitchTip is Sentry-protocol, so the SDK works unchanged. pino remains primary.
docs/OPS.md gained the "Error tracking (GlitchTip)" section; the old "deliberately no
error-tracking SaaS" note amended.

**A5 (#53) Public-posture guards + runbook.** `SERVER_URL` is now the single public-posture
switch: (a) auth-cookie `Secure` DERIVES from an https SERVER_URL (Codex #1's cookie check made
structural, `lib/publicPosture.ts`); (b) boot REFUSES when SERVER_URL is set and the users table
is EMPTY — **empirical basis, verified live on a fresh local DB:** unauthenticated REST create is
403 even at zero users, but `/admin/create-first-user` renders and `POST /api/users/first-register`
returns 200 + `roles:['siteAdmin']` → on a public host the first visitor would own the site.
Count-unavailable (first migrate, pre-schema) skips enforcement; `ALLOW_FIRST_USER_BOOTSTRAP=1` is
the one-boot escape hatch (ALLOW_UNBACKED_DEPLOY pattern). docs/OPS.md "Going public" runbook
records the execution order for exposure day. Refusal matrix + cookie wiring pinned by
`tests/unit/publicPosture.spec.ts`.

All five merged via CI-gated PRs; merged main green locally (typecheck, unit 103/103). **Left in
Phase 5 (Track B, host-gated):** choose host → TLS/reverse proxy + edge rate limiting → deploy
GlitchTip + set `SENTRY_DSN` → execute the Going-public runbook. **Incidental state:** the Mac's
local compose stack got a throwaway Site Admin (`csp-probe@lesson3.local`) + a minimal
Biology/G10 probe plan for the browser verification — harmless, delete or keep as local seed.

---

## 2026-07-05 (Codex audit) — external security pass triaged: 3 safe fixes shipped, rest mapped to Phase 5 / documented deferrals

Codex reviewed `main` (10 findings; no Critical). Triage + disposition:

**Fixed now (safe, zero-behavior-change — this PR):**
- **#7 (Low):** `ARTIFACT_CACHE_MAX_BYTES` used `Number(env) || default`, silently swallowing a
  typo back to 512 MB — unlike the fail-fast rate-limit/prune parsing. Extracted the existing
  `positiveIntEnv` to a shared `lib/env.ts` and reused it in `artifactCache` (and `rateLimit`), so
  a malformed value now throws at boot.
- **#9 (Low):** `contract.ts` header still said drift is "NON-BLOCKING"; ingest promoted it to a
  HARD gate. Comment corrected (stale doc in a sensitive ingest area).
- **#10 (Low):** `package.json` engines was `^18.20.2 || >=20.9.0` while Docker (node:22.17.0-alpine)
  and Volta pin 22.17.0 — tightened to `>=22.17.0` so `engines` stops misleading other hosts.
  Advisory only (`.npmrc` has no engine-strict), so no install impact.

**Mapped to Phase 5 (pre-public-VPS blockers — already on the checklist, reaffirmed):**
- **#1 (High):** strict CSRF is opt-in; prod keeps `serverURL` empty for browser compat, so
  Payload's Origin/Sec-Fetch allowlist is inactive. Set/verify `SERVER_URL` + Secure cookies before
  public exposure. (Correct for the current internal posture.)
- **#2 (High/Med):** baseline CSP omits `default-src`/`script-src` (Next inline hydration needs
  nonce plumbing); a future XSS is weakly contained outside the strict preview path. Nonce-based CSP
  is Phase 5.

**Documented deferrals — acceptable, reaffirmed (not building now):**
- **#3 (Med):** ≤1-Subject-Admin-per-grade is hook-enforced, not DB-enforced (this is the audit's
  own Bucket A #10, deferred 2026-06-28). Concurrent grants could both pass; the demote scan caps at
  1000. Low likelihood, non-security impact (two legitimately-granted admins until noticed). The
  structural fix (partial unique index) needs reordering demote-before-insert; the lighter
  grant-path transaction-lock (like the assign-editor endpoints already do) is the Phase-5 interim.
- **#5 (Med/Low):** unsaved-preview body cap is best-effort before parse (Content-Length pre-check;
  `formData()` buffers when the header lies). Authenticated + editor-gated + rate-limited; a hard fix
  needs a streaming multipart parser. Left as documented.
- **#6 (Med/Low):** export dedupe scans only 20 pending jobs → a burst can enqueue a redundant job.
  Queue concurrency caps the box and the artifact cache makes the dup cheap; not a hard single-flight.
  Left as documented.

**#4 (Med) — FIXED with the solid long-term fix (user's call, 2026-07-05).** `/messages` marked-read
during the GET render, guarded only by a `Sec-Fetch-Site: cross-site` deny-list, so header-less
clients (older Safari ≤16.3) still wrote — a cross-site integrity edge. Offered: keep-current, the
allow-list patch, or move read-state to a POST. The user chose the POST (prefers solid fixes over
short-term patches; not in production; few Safari users) — and since it's NOT host-dependent (unlike
the other Phase 5 items) I did it now, not Phase 5. New `POST /api/messages/mark-read`
(`endpoints/markMessagesRead.ts`): auth-required, hard-scoped to `recipient = session user AND id IN
shown AND unread`. CSRF-safe for EVERY browser by construction — the SameSite=Lax auth cookie isn't
sent on a cross-site POST, so a forged request is unauthenticated (401); no header sniffing. The
inbox fires it on mount (`MarkShownRead`, fire-and-forget, no refresh), preserving the "New tags this
visit, cleared next load" UX and the shown-ids scoping. Removed the GET-render write + the
`next/headers` Sec-Fetch guard. http-covered (401 unauth, marks own, foreign/other-user ids ignored,
empty no-op). No migration.

**Still open / deferred:**
- **#8 (Low):** Gotenberg base (`gotenberg/gotenberg:8`) + the apt font package aren't
  digest-pinned. Real supply-chain drift risk, but a correct digest pin must be resolved against the
  registry (an ops step best done on/near the Rock, where Phase 5's other host work lives). Deferred
  to Phase 5 rather than guessing a version here.

**Controls Codex verified as solid** (recorded for confidence): JSON-only Site-Admin-gated
all-or-nothing ingest; AST-based `.js` extraction (no require/eval); version-immutability hook;
export/email/preview authorize the readable version before trusted generation; job REST surfaces
locked down incl. `payload-jobs`; preview HTML sanitized at the mammoth seam.

---

## 2026-07-05 (Phase 4) — re-ingest as next MAJOR version, arriving Not Official

Phase 4 of the audit plan — the first product-behavior change, opened design-first for sign-off
(per the working agreement, since it touches the ingest path). SPEC §7 updated to match.

**Decision refinement:** the 2026-07-04 design had a re-ingested major become Official
automatically; on review the user chose **Not Official** — a re-upload lands as a candidate an admin
promotes via Make Official. Rationale: nothing should silently supersede the live Official content;
the review gate is cheap (the Manage "candidate versions" list is exactly where the admin finds it),
and it means a re-upload doesn't change what teachers see until a human confirms.

**Behaviour (`ingestItems`, shared by the CLI + Site-Admin upload):**
- Identity = `(subjectGrade, META.substrand_id)`. Pre-flight queries the subject-grade's versions
  carrying that substrand_id and collects distinct parent plans: 0 → new plan (1.0.0 Official,
  unchanged); 1 → attach as next major; >1 → ambiguous, actionable pre-flight failure.
- Next major = max semver across the plan bumped major (`nextMajorForPlan`, sibling of
  `nextSemverForPlan`); the `(lessonPlan, semver)` unique index is the backstop.
- Re-ingest write: create the version under the existing plan, Not Official — **pointer NOT moved,
  title NOT refreshed** (both track the Official content, unchanged until promotion; expanding
  Make-Official to refresh title is out of scope). No `sourceVersion` (ingest, not a fork).
- Guards: intra-batch duplicate (two files, same key) → pre-flight failure (else they'd race for the
  plan); empty `substrand_id` → always new (can't dedupe). Batch stays all-or-nothing.
- Reporting: `IngestResult.action` = `'created' | 'revised'`; the upload panel + CLI say
  "N new (Official 1.0.0); M revised (Not Official — promote via Make Official)".

Int-covered (`tests/int/reingest.int.spec.ts`): create-new, revise→2.0.0/3.0.0 with pointer
unmoved + old versions retained, intra-batch dup → error + nothing written, empty id → distinct
plans, ambiguous → error. No schema/migration — ingest logic only. Closes the audit's
"re-upload silently creates a duplicate plan" gap.

**Post-merge cleanup (`/simplify`, 4 review agents):** `findExistingPlan` now reuses `relId` and
owns the ambiguous-match throw (plain `number | null` return, no `{planId, ambiguous}` union);
pre-flight memoizes subject-grade resolution across the batch; counters use `=== 'created'`.
Skipped as non-improvements: version-create helper extraction, semver-wrapper flattening, a shared
CLI/UI count formatter. **Also: `test:int` caught a fixture bug on first CI run** — the spec's raw
bundle passed `validateGeneratable` but not the `contractDrift` hard gate (missing `schemaVersion`
+ required UNIT/LESSON/FE/ST fields); fixed + now verified locally against both pure checks before
push. Lesson: `test:int` is DB-only (CI/Rock), so ingest-path fixtures can't be smoke-tested
locally — validate raw bundles against `contractDrift`/`validateGeneratable` directly (both pure)
before pushing.

**Deferred (altitude, out of scope — the ALTITUDE reviewer's one real finding):** plan identity
`(subjectGrade, substrand_id)` is currently derived by querying a *version's* `meta.substrand_id`
(an unindexed nested-JSON path) and folding to distinct parent plans, and the `ambiguous`
runtime-handling exists only because identity isn't a structural invariant. The principled form is
a first-class **indexed `substrandId` column on `lesson-plans`** with a unique
`(subjectGrade, substrandId)` index — making duplicates impossible by construction and matching a
single indexed equality. It's a schema change (column + migration + backfill, where backfill itself
runs this same query once), out of proportion to this bounded feature and with no second consumer
today. **Trigger to promote it:** the first *other* consumer of substrand-matching (export, dedupe
tooling, a "find plan by substrand" API). Until then the current derive-from-version approach is
the correct incremental altitude.

**Next: Phase 5 — pre-VPS checklist (its own planning session).**

---

## 2026-07-05 — CodeRabbit follow-ups on Phases 1/3 + mobile touch targets

CodeRabbit review of the merged Phase 1/3 PRs, adjudicated (all accepted), plus a user testing
report. Follow-up PR (code-review fixes + a mobile a11y fix).

- **prune-db.sh (Major — correctness vs policy):** the two completed-slug deletes now exclude
  `has_error` rows (`has_error IS NOT TRUE`), so a FAILED job is never reclaimed on the short
  14d/180d window — it always waits for the 90d failed window. Honours the retention policy
  regardless of whether a terminal failure also carries a `completed_at`.
- **HTML cache single-flight:** concurrent cache MISSES for one version key now coalesce onto one
  in-flight render (in-process `Map`), instead of each running the full generate+render — the exact
  CPU burst the cache exists to prevent (cold start after a `HTML_RENDER_CACHE_VERSION` bump; a
  freshly-published version opened by several teachers at once). Unit-pinned (concurrent misses →
  `generateForVersion` once).
- **`sanitizeEmailHeaderText` widened** to strip Unicode line separators (NEL U+0085, LS U+2028,
  PS U+2029) alongside ASCII C0/DEL. nodemailer already MIME-encodes non-ASCII subjects, so this is
  belt-and-suspenders — broadening is free and matches the function's stated intent. Unit-covered.
- **Trivia:** corrupt-cache-entry test now asserts the repair write; OPS.md cron fence tagged
  `cron` (MD040).
- **Mobile touch targets (user report):** several controls were 26–40px on a 390px viewport (avatar
  30×30, favorite/edit/download buttons short). The 640px media block now targets **44px** (2.75rem,
  WCAG 2.5.5): `.btn` min-height, `.user-menu__avatar` + `.fav-toggle` 44×44, `.version-pill` as
  inline-flex with a real min-height. Dropped the dead `.resources-toggle` rule (that checkbox was
  removed in the single-document-format collapse). The header-hamburger idea from the report is a
  bigger nav redesign — DEFERRED to a UI session, not done here.

**On the "no cache speedup" testing note (NOT a bug):** the Phase-3 HTML cache saves server-side
GENERATION CPU (up to 3 DOCX builds + mammoth), not full-page wall-clock. A single user's page load
is dominated by DB queries + Next SSR/hydration + network, so caching the generation step is mostly
invisible to a stopwatch on one browser — and the measured 1831→1980ms delta is within network
jitter (n=1). The cache's value is CPU under CONCURRENCY (many teachers, one box), which the
single-flight change above sharpens. To actually observe the hit, time the GET
`/api/lesson-bundle-versions/:id/preview` endpoint twice (pure server render, no page assets) or add
a temporary hit/miss log line — offered, not built.

---

## 2026-07-04 (Phase 3) — scale prep: lesson-page HTML cache, retention prune cron, pagination posture

Phase 3 of the audit plan — the "public VPS + 100+ teachers" readiness work.

- **Lesson-page HTML cache** (`generator/htmlSectionsCache.ts`). The lesson detail page and the GET
  `/preview` endpoint were regenerating up to 3 DOCX (`Packer.toBuffer`) → mammoth → DOMPurify on
  EVERY view — seconds of CPU on the Rock's 2-CPU cap, on the most-trafficked path. Versions are
  immutable, so the sanitized `PreviewSection[]` is cached by version id in the SAME store as the
  DOCX/PDF artifact cache (dir/LRU/size-cap reused; small HTML entries age out). First view of a
  version generates + writes; every later view (any user) is a disk read. `renderVersionSectionsCached`
  is wired into the lesson page and the SAVED preview path; the UNSAVED (working-copy) POST preview
  is deliberately NOT cached. **Deploy note:** a new cache namespace (`html-sections::v1::…`) — benign
  one-time cold start, no migration. Render-logic changes (mammoth/sanitizer/generator) must bump
  `HTML_RENDER_CACHE_VERSION` in the same commit — it is baked into the key, so a bump bypasses every
  stale entry (the one thing that can invalidate an immutable version's HTML is our own render code).
  Unit-covered (hit/miss/corrupt/write-fail/read-fail).
- **Retention prune** (`scripts/prune-db.sh` + OPS cron). Implements the 2026-07-04 retention policy:
  completed export jobs 14d, email+ping jobs 180d (egress audit trail), failed jobs 90d,
  `rate_limit_counters` 7d. One transactional psql pass inside the postgres container, env-tunable
  windows with the same positive-int fail-fast guard as backup-db.sh, idempotent/no-op when caught
  up. Cron'd nightly at 03:30 (after the 02:00 backup, so a pre-prune snapshot always exists).
  `payload_jobs_log` cascades on the parent delete (verified FK). No app code — matches the ops-script
  pattern rather than adding an in-app job.
- **Pagination posture (assessed; deliberate NON-action).** The known unbounded reads — browse
  catalogue (`pagination:false`), lesson-page version list (`pagination:false`), messaging roster
  (`pagination:false`), inbox (`limit:100`) — stay as-is. At the real corpus (13 plans) and even a
  few hundred plans / 100+ users they are cheap light-projection queries; completeness (whole grouped
  catalogue, no fragmented strands) is the right UX and the audit classed this corpus-gated. The live
  search re-runs the browse fan-out per 200ms-debounced keystroke — bounded to ~5/s, acceptable at
  hundreds. **Thresholds to revisit (documented so the trigger is explicit):** paginate/virtualize the
  browse catalogue and the roster when plans or users reach ~1–2k; paginate the inbox when a user can
  plausibly hold >100 messages (the mark-read is already scoped to shown ids, so unshown unread stay
  unread — correct under the cap). The HTML cache above removed the one genuine per-view CPU cost;
  what remains is DB-query volume, which Postgres handles far past current scale.

test:unit 85/85 · lint 0 errors · typecheck clean. **Next: Phase 4 — re-ingest as next major.**

---

## 2026-07-04 (Phase 2) — invariant tripwires: extract.ts adversarial suite, prose-whitelist drift test, immutability colocation, taxonomy delete guards

Phase 2 of the audit plan — mechanical guards around the fragile-but-correct mechanisms, so a
future "simplification" fails fast instead of silently widening a boundary.

- **extract.ts adversarial suite** (`tests/unit/extract.spec.ts`): pins the parse-never-execute
  contract in CI (was review-only). Covers the ARES conventions that MUST extract (const-by-name,
  `+`-fold, plain templates); every dynamic/executable construct that MUST throw (call, identifier,
  member access, `new`, template-with-expr, spread, computed key, getter, method, non-`+` operator,
  `+` on non-primitives, regex/bigint, sparse array, `__proto__` in data AND at the export layer,
  malformed export shapes); and a **never-executes proof** — a module whose inert statements would
  set a global marker if evaluated, asserted not to. Also the JSON sibling's structural guards.
- **prose-whitelist drift test** (`tests/unit/proseWhitelistDrift.spec.ts`): the Editor/Admin
  boundary is the `*_PROSE` whitelist in `fieldSplit.ts`, hand-kept in sync with `lessonContent.ts`
  by comment. Made mechanical with ZERO production change: `prose()` is the only factory attaching
  `access.update === canEditProse`, so "intended Editor prose" is computable by walking the field
  tree; the walk must equal the whitelist per container. Exported the `*_PROSE` constants for the
  test. Drift now fails named + fast, not as a silently-dropped edit (or a newly Editor-writable
  admin field).
- **fieldSplit authority hardening:** `applyEditorFieldSplit` now resolves the actor's subject-grade
  from `originalDoc.subjectGrade` FIRST (data only as a fallback for pre-stripped callers) — same
  class as the Phase-1 preview pin: a submission must not name a grade the caller administers
  elsewhere to escape the whitelist. On the update-only path the original's grade is always present.
- **Immutability colocation** (`access/versionImmutability.ts`): the audit's "most misreadable
  mechanism". The form-render-only `access.update` grant and the `enforceVersionImmutable`
  beforeChange rejection now live in ONE module with a pair-warning header; the grant is renamed
  `versionUpdateGrantForFormRenderOnly` so its name carries the "not a write grant" warning to every
  call site. `tests/unit/versionImmutabilityWiring.spec.ts` asserts the wiring itself
  (`access.update` IS the render grant; the hook IS in `beforeChange`; the hook 403s an authenticated
  update, passes system/create) — DB-free, so a mis-wire fails instantly instead of as a later
  behavioural symptom the int suite catches.
- **Taxonomy delete guards** (`collections/Subject`, `SubjectGrade`): deleting a referenced
  SubjectGrade/Subject raised the opaque 23502 the plan/user cascades already close elsewhere.
  SubjectGrade delete now BLOCKS on referenced content (lesson plans/versions) with an actionable
  409 (cascading content would be far too destructive) and CASCADES dangling role assignments off
  their holders; Subject delete BLOCKS while it still has SubjectGrades. Int-covered
  (`tests/int/taxonomyDelete.int.spec.ts`); fixture teardown is unaffected (it deletes content →
  users → subject-grades → subjects, so the guards see an empty scope).
- **Working agreement added to CLAUDE.md:** every custom endpoint / auth-affecting hook lands with
  wire-level 401/403/404 tests in the same PR — the standing guard for the authorize-then-
  overrideAccess-write pattern that could not be enforced structurally.

test:unit 80/80 · lint 0 errors (1 pre-existing `any` warning) · typecheck clean; the two new int
specs ride CI. **Next: Phase 3 — scale prep (lesson-page HTML cache, prune-db cron, pagination).**

---

## 2026-07-04 — FULL-CODEBASE AUDIT → five-phase plan; product decisions (re-ingest, retention, exposure); Phase 1 security batch; CodeRabbit adjudication

A deep audit of the whole codebase (all collections/access/hooks/endpoints/libs/ingest/generator/
jobs/frontend/ops/CI, execution paths traced, claims verified against installed Payload source)
found **no Critical issues and no data-loss paths**; the sharp edges + the agreed plan are below.
Decisions were made via structured Q&A with the user BEFORE any code (house convention).

### Product/deployment decisions (user-confirmed)

- **Exposure trajectory: public VPS later, plus local ARES-server deployments — NOT Tailscale-only.**
  This upgrades two audit findings to pre-launch blockers: (a) unthrottled auth surface (fixed this
  entry, see Phase 1), (b) per-view DOCX generation on the lesson page (Phase 3 HTML cache). A
  **Phase 5 pre-VPS checklist** now exists: error tracking (SPEC §11 already requires it), strict
  CSRF via `SERVER_URL` + Secure-cookie verification, nonce-based CSP with `script-src`, first-user
  bootstrap before exposure, edge rate limiting, and a re-look at the 2h token under public exposure.
- **Re-ingest semantics (SPEC §7 amended):** an upload whose `(subjectGrade, META.substrand_id)`
  matches an existing lesson plan attaches as the next MAJOR version (1.x → `2.0.0`) of that SAME
  plan and becomes Official automatically (mirrors the 1.0.0 rule); old versions retained; plan
  title refreshes from the new `META.titleDoc`; multiple matches (legacy duplicates) = actionable
  pre-flight failure. Implementation is the tracked Phase-4 item — current code still creates a
  duplicate plan (recorded gap).
- **Retention policy (SPEC §11 amended):** completed export jobs 14d · email/message-ping job rows
  180d (the data-egress audit trail) · failed jobs 90d · `rate_limit_counters` rows 7d. Mechanism:
  a `scripts/prune-db.sh` psql cron beside the backup crons (no app code) — tracked Phase-3.
- **Session window:** `tokenExpiration` 15 min → **2h** (PR #40) is ratified; SPEC §11 updated to
  match (it still said 15 min — exactly the doc-drift failure mode the audit flagged).

### The five-phase plan (order user-confirmed)

① security batch (SHIPPED, this entry) → ② invariant tripwires (extract.ts adversarial unit suite;
`applyEditorFieldSplit` unit suite + a whitelist↔`prose()` drift test — feasible with no code change
since `prose()` is the only factory attaching `canEditProse`; colocate + rename the
immutability pair `lessonBundleVersionUpdate`/`enforceVersionImmutable` so the form-render-only
grant can't be misread as a write grant; taxonomy delete guards — Subject/SubjectGrade have NO
cascade/guard and 23502 opaquely when referenced) → ③ scale prep (lesson-page HTML cache keyed by
immutable version id; prune-db cron; browse/roster pagination posture for 100+ teachers — note the
new live search re-runs the full browse fan-out per debounced keystroke) → ④ re-ingest-as-next-major
→ ⑤ pre-VPS checklist. Working agreement added by the audit: **every new endpoint lands with
wire-level 401/403/404 tests**; the `overrideAccess`-after-manual-authz pattern is only as safe as
that discipline.

### Phase 1 — security batch (this PR)

- **Auth rate limiting** (SPEC §11 "generation, auth" — the one named surface that had none):
  `hooks/authRateLimit.ts`, a Users `beforeOperation` hook (verified seam: both auth ops run it
  before any work). Buckets: `login` 20/h per lowercased target identifier + `loginGlobal` 1000/h
  (Payload's `maxLoginAttempts: 5` lockout still guards single-account brute force; this throttles
  the hammering + bounds lockout-DoS), `forgotPassword` 5/day per REQUESTED address +
  `forgotPasswordGlobal` 100/day (unauthenticated outbound mail = same egress class as email-a-doc,
  same two-tier shape; keyed whether or not the account exists → no existence oracle). All
  env-tunable (`RATE_LIMIT_LOGIN_*`, `RATE_LIMIT_FORGOT_PASSWORD_*`). Int-covered
  (`tests/int/authRateLimit.int.spec.ts`), incl. the correct-credentials-still-429 and
  unknown-address-spends-budget properties.
- **Email-header hardening:** `sanitizeEmailHeaderText` (lib/emailAddress) strips control chars
  from the stored version `title` before it reaches the email Subject in `emailVersionArtifact`
  (admin-gated input, but belt over nodemailer's suspenders). Unit-covered.
- **Unsaved-preview authority pinning:** `POST /:id/preview` now pins `subjectGrade` + `lessonPlan`
  from the STORED version in the merge (as save-as-new always did). Before, the posted candidate
  could name a different subject-grade and be judged by the field-split under THAT grade's role —
  an Editor here who is Subject Admin elsewhere could preview structural/answer-key edits as
  unrestricted. Render-only, nothing persisted, no confidentiality gain (versions are
  all-authenticated-readable) — but it violated the endpoint's own "never show more than the caller
  could save" invariant.
- **`nextSemverForPlan` projection:** `select: { semver: true }` — it was loading the FULL content
  of every retained version of the plan on every save-as-new (and each conflict retry). The
  counter-row redesign stays deferred; this removes ~95% of the cost.

### CodeRabbit review of PR #40 — adjudicated (PR #41, merged)

4 accepted / 1 rejected. Accepted: Modal effect re-ran per keystroke (inline `onClose` identity →
now via ref, effect once per open); SearchBox pending debounce survived unmount — **upgraded** from
the review's "low value": `navigate()` drives the GLOBAL router, so typing then clicking a lesson
within 200ms yanked the user back to `/?q=…`; SearchBox `initialQuery` re-sync — done
provenance-aware (adopt EXTERNAL `?q=` changes + cancel the pending debounce; IGNORE the echo of
our own navigation, which would revert in-flight typing; effect-based because `react-hooks/refs`
forbids render-time ref reads); `role="status"` on the email queued-note. **Rejected:** "backdrop
should close on `onClick` not `onMouseDown`" — backwards: per UI Events, mousedown/mouseup on
different elements dispatch `click` to their nearest common ancestor (the backdrop), so `onClick`
is the variant that closes on a text-selection drag out of the panel; the current
mousedown+stopPropagation pattern is the standard defense. `tests/unit/searchBox.spec.tsx` pins all
three behaviors. **Lesson (general):** review-bot fixes can be directionally wrong even when the
observation is real — verify the mechanism against the spec/source before applying, and record the
rejection where the next reader will look.

---

## 2026-07-03 — SHIPPED: the single-document-format collapse + both in-flight streams landed

The plan recorded in the 2026-07-03 (late) entry below is now DONE (the "NOT done yet" scope note
there is historical). Merged to `main` via CI-gated PRs: **#29** UI cleanup + mobile pass, **#30**
Codex Med/Low fixes, **#31** the single-document-format collapse, **#32** a `/simplify` follow-up
(single owner for the `ExportKind` union).

The collapse (#31) removed the standard/compact axis end-to-end — deleted `lib/format.ts`,
`ResourcesToggle.tsx`, `format2-check.ts`, the `LessonSequenceFormat` type, `parseLessonSequenceFormat`,
the `format` field on both Jobs Queue task inputs, and `format` from `ArtifactSpec`/`artifactKey`; kept
`?as=docx|pdf`. `generateBundleDocx` now always builds `buildSoWCompact` (five-column, no Resource
column); the vendored six-column `buildSoW` is retired but byte-pristine. Roundtrip fidelity is
unaffected — `compareDoc(stripResources=true)` already strips the Resource column from the oracle before
diffing. `SPEC.md` §9 artifact-identity language was updated to `(version, document, kind)`.

A post-merge external review (2026-07-03) triaged: fixed the inbox mark-read scoping bug (it cleared ALL
unread but showed only 100 → now marks only the shown ids) and this doc refresh; the rest were
already-recorded deliberate choices (stateful-GET mark-read, dedupe-20 bound, roster `pagination:false`)
or tracked deferrals (esbuild advisories, PR #30 regression tests). **Not yet done:** Rock deploy of
`main` (no migration — see NEXT-SESSION) + the in-browser eyeballs.

---

## 2026-07-03 (late) — ARCHITECTURAL: collapse to ONE document format (ARES-resources-inline, no Resource column); UI-cleanup + Codex-fix session state

Two parts: (A) an architectural decision to record and act on next session, and (B) the in-flight
state of this session's work (uncommitted, to be committed/merged first thing next session).

### (A) DECISION — a single document format; drop the two-format (standard/compact) system entirely

**To date there were two export formats:** `standard` (the LessonSequence "C. Lesson Implementation
Framework" table carries a separate **Resource** column) and `compact` (no Resource column). A single
**"Include ARES Resources"** checkbox drove which one every surface produced (`lib/format.ts` is the
one mapping: checked→`standard`, unchecked→`compact`). On-screen view defaulted to `compact` because
the Resource column was deferred/blank (no resource data yet — blocked on Mark).

**New decision (supersedes the two-format model):** there is only **ONE** document format going
forward — the one **with ARES resource links** — and it has **NO separate "Resource" column**. When
ARES resource data exists at all, the links live **inline within the phase rows** of the framework
table (the phase content), NOT in a dedicated column. See the two reference images the user supplied:
the **target** layout has columns `Phase | Learner Experience | Teacher Moves | Sensemaking Strategy
| Formative Assessment Strategy` (no Resource column); the **eliminated** layout inserted an (empty)
`Resource` column between Learner Experience and Teacher Moves.

**Why:** the separate Resource column has been blank this whole time (resource data blocked on Mark),
and the two-format toggle is redundant complexity across the teacher view, admin preview, admin
export, email, and the editor control bar. One format = cleaner UX and a meaningful code deletion.

**This SUPERSEDES the 2026-06-09 "Resource column from ARES" plan** (which was: add `source` to the
resource schema, carry via `framework[].resources`, render as a **column** via `vendor/aresResources.js`).
The column approach is dropped; resources render **inline in the phase content** instead.

**Scope of the removal work (next session — NOT done yet).** Remove the standard/compact axis
end-to-end; KEEP the orthogonal `?as=docx|pdf` document-TYPE axis (that's unaffected). Touchpoints
found via `grep -rilE "compact|LessonSequenceFormat|ResourcesToggle|Include ARES" app/src`:
- **Delete:** `lib/format.ts` (the checkbox↔format mapping), `ResourcesToggle.tsx` (the checkbox),
  the `?format=standard|compact` handling in `endpoints/parseFormat.ts`.
- **Collapse the type/plumbing:** `LessonSequenceFormat` in `generator/index.ts` (down to one mode or
  gone), and the `format` params/props threaded through `endpoints/{exportVersion,previewVersion,
  previewShared,emailVersion,exportAuth}.ts`, `jobs/{generateVersionArtifact,emailVersionArtifact}.ts`,
  `generator/{generateForVersion,exportArtifacts,previewBundle}.ts`, and the UI
  (`lessons/[id]/page.tsx` `sp.format` logic + heading, `DownloadButtons.tsx`, `EmailDocButton.tsx`,
  `components/LessonControls/index.tsx` — the editor's ☑docx/☐PDF/☐ARES bar loses the ARES checkbox).
- **Generator layout:** always produce the no-Resource-column table (today's `compact` layout). The
  vendored generator is byte-pristine (fidelity 3/3) — confirm whether "no Resource column" is already
  a generator parameter (it is, via the standard/compact selection) so we can pin it without editing
  vendored code; the **inline resource-link rendering** is a separate, still-blocked-on-Mark concern.
- **Artifact cache:** the `versionScope`/cache key currently includes format — dropping a format axis
  changes cache keys (a benign cold-start), and any migration/enum that encodes format should be checked.
- **Tests/docs:** update `test:http`/`test:int` specs that pass `?format=`, and re-touch `/guide` +
  `USER_GUIDE.md` (drop "Include ARES Resources" wording).

**OPEN DETAIL (confirm when resource data actually lands — still blocked on Mark):** the precise
inline placement of the resource links within a phase row (which cell / formatting). Not blocking the
removal work above, which stands on its own; the on-screen/DOCX result is simply today's compact
layout until the data exists.

### (B) SESSION STATE — two uncommitted work streams to land next session (get to a clean tree FIRST)

This session did NOT commit anything (per the no-commit-without-request rule). Two independent streams
are in-flight; **the first next-session task is to commit + merge both and reach a clean state:**
1. **UI cleanup + mobile pass — uncommitted on `main`'s working tree** (8 files): clean lesson-page
   title + `Subject · Grade` context line (reuses `lessonDisplayName`), styled version-pill selector
   (was unstyled — "Version1.0.0· Official1.0.1"), mobile touch targets + export-bar/compose wrap, a
   `--danger` token + `.inline-error` class replacing three inline error styles, explicit `viewport`
   export, a guide typo fix, and a **Manage-page mobile fix** (hid Payload's nav/hamburger/app-header
   on the dashboard via a shared `body:has(.lp-admin-dash), body:has(.collection-edit--lesson-bundle-versions)`
   chrome-strip + a dashboard-only `grid-template-columns: 1fr` — the nav-hide collapsed Payload's
   2-col grid and crushed the content). Verified on a local compose stack (typecheck + unit 51/51;
   admin `/admin` pages reliably time out `preview_screenshot`, so verified via computed metrics).
   `.claude/launch.json` was gitignored (Codex #5).
2. **Codex Medium/Low fixes — uncommitted on branch `fix/email-authz-msg-hardening`** (git worktree at
   `../Lesson3-codexfix`, off clean `main`; typecheck + unit green): **#1** email endpoint now
   authorizes the version BEFORE spending the shared `emailRecipient`/`emailGlobal` caps (per-user cap
   stays first as the anti-probe deterrent) — unauthorized probes can no longer burn pooled quota;
   **#2** `/messages` mark-read now skips when `Sec-Fetch-Site: cross-site` (blocks CSRF-via-navigation
   clearing unread, keeps "viewing is reading" for same-origin/none/absent — no `/read` endpoint
   reintroduced); **#3** the `messagePing` enqueue is wrapped in try/catch so a queue failure can't roll
   back the message create; **#4** `USER_GUIDE.md` refreshed to mirror the current `/guide`.
   Codex **#6** (esbuild dev advisories) and **#7** (fidelity probes not in CI) stay deferred (tracked).

**Deeper verification not yet run for stream 2** (int/http, browser): needs the app image rebuilt
from that branch, which would displace the running UI-cleanup preview — deferred to CI on the PR, or a
local rebuild next session. The `#2` Sec-Fetch-Site behavior in particular is runtime-only.

---

## 2026-07-03 — §10 PR ③ messaging + notifications built; privacy/UX micro-decisions locked

PR #28 implements the messaging design from the 2026-07-02 Q&A (flat `messages`, content-free ping,
server-rendered badge, `/messages` inbox+compose, names-only roster relaxation + SPEC §8 amendment).
Three product micro-decisions the Q&A had left open, decided with the user before build:

- **Messages are private, full stop:** read = sender/recipient only — NO Site Admin read (unlike
  favorites' support exception). Ops visibility = retained `messagePing` job rows + structured logs
  (message id, sender id, recipient id — never bodies).
- **No user delete path in this iteration.** Flat single-row model means delete-for-one would
  delete for both; revisit only if inbox clutter becomes real. Update is closed to EVERYONE too —
  mark-as-read became a system write (overrideAccess) by the inbox page, which **simplified away
  the planned `POST /messages/:id/read` endpoint entirely**: bodies render inline on `/messages`
  (no threads), so viewing the inbox IS reading, and everything shown is marked read after the
  list is captured. Fewer surfaces, same UX. (AppNav's `/messages` link is a plain `<a>` — no Next
  prefetch, so scrolling a page can never mark things read.)
- **Ping only from zero:** the email ping fires only when the recipient had zero OTHER unread
  messages — a burst while they're away emails once, and after they read, the next message pings
  again. Belt over that suspender: a per-recipient daily ping budget (`messagePingRecipient`,
  20/day); exhaustion skips the ping, never the message. The ping is CONTENT-FREE per the design —
  and per the #27 egress lesson, that includes the sender's name: nothing sender-controlled
  reaches the email; attribution (sender id) lives on the job row and in logs.

Build notes worth keeping:

- **The roster relaxation is only safe because of a NEW field guard.** `assignments` had no field
  read access — the old self-only collection gate made it implicit. Opening `usersCollectionRead`
  to `Boolean(user)` without adding `assignmentsReadField` (admins + self) would have published
  every user's role grants. Rule: before relaxing a collection-level read, enumerate what the old
  gate was implicitly hiding at field level.
- **Message creation is rate-limited in a HOOK, not an endpoint** (create is Payload's default
  REST, Payload-first like favorites): new `consumeRateLimit` primitive on the shared counter
  returns the raw decision; the hook throws a 429 `APIError`. The existing `enforce*` Response
  wrappers now build on it.
- **Fixture emails moved `@test.local` → `@example.com` (RFC 2606):** fixture users now RECEIVE
  system mail (pings go to the recipient's account address), so on a live stack with SMTP the
  sends must blackhole safely instead of failing at the relay and leaving failed job rows.
- Badge = `AppNav` became an async server component that counts its own unread via `getPayload`
  (both surfaces get it with zero prop plumbing); count is best-effort (failure renders 0).
- Migration `20260703_041716_add_messaging` Rock-generated + hand-guarded (favorites' table idiom
  + email-task's enum idiom); Rock `generate:types` byte-identical to the hand-written types.

---

## 2026-07-02 (late) — Codex audit of §10 ①/② (no Critical/High) + /simplify pass: email egress hardened

External audit of `main` after PRs #25/#26, plus a 4-agent /simplify review of the PR ② diff.
Email-a-doc's theme: **arbitrary outbound email is a data-egress path — it needs attribution and
volume ceilings beyond a per-user cap.** All four audit findings fixed same-day:

- **#1 (Med) durable requester audit trail** — the job input now carries `requestedByUserId`
  (names are neither stable nor unique enough for investigation); it lives on the retained
  payload-jobs row and in BOTH outcome logs (`emailVersionArtifact sent/failed`).
- **#2 (Med) throttles above the per-user cap** — new `enforceSharedRateLimit(req, bucket, key,
  message)` reuses the same Postgres counter table for NON-user keys: `emailRecipient` (20/day per
  lowercased address, pooled across senders — case games don't mint budgets) and `emailGlobal`
  (1000/day site-wide). Checked after recipient validation (unlike the per-user cap, which spends
  on probes). Int-pinned: a shared key counts across callers; distinct keys independent.
- **#3 (Low) local tsc gate unreliable** — stale Finder-duplicated `.next/types/* 2.ts` artifacts
  broke `tsc --noEmit`. New canonical `npm run typecheck` = `rm -rf .next && next typegen && tsc
  --noEmit` (verified: `next typegen` exists in Next 16.2).
- **#4 (Low)** `.env.example` said "sliding window"; the limiter is deliberately FIXED-window
  (DECISIONS 2026-06-29) — comment corrected.

**/simplify outcomes (4 parallel agents: reuse/simplification/efficiency/altitude):** reuse clean;
the email job's `isExportReady` + `loadCachedExportZip` double-read of the same manifest collapsed
to one direct `loadCachedExportZip` attempt run CONCURRENTLY with the version `findByID`
(Promise.all — the sibling job's existing pattern); the recipient regex was looser than Payload's
own email-field regex (admitted `a..b@x.com`, `a@-x.com`) → now mirrors Payload's pattern
(unit-pinned). **Deferred deliberately:** extracting a shared `ensureArtifacts` helper into
`exportArtifacts.ts` — real duplication, but migrating the stable, deployed `generateVersionArtifact`
in passing violates the minimal-churn rule; do it when either job next changes for its own reasons.

---

## 2026-07-02 — §10 features track opened: design decided via structured Q&A (before any code)

Production hardening is complete; the §10 cross-user features track is now active. Design decisions
made by the user via structured Q&A, per the "real decisions before code" rule:

- **Build order:** ① **Favorites** → ② **Email-a-doc** → ③ **Messaging + notifications**. The two
  cheap wins ship first (both ride existing infrastructure: export pipeline, SMTP, Jobs Queue, the
  shared rate limiter); messaging is the biggest new surface and lands third. **AI summaries:
  unprioritized** (purpose/placement TBD before build). **Swahili translation: DEFERRED** — revisit
  with real user demand. If/when built, the leaning is a **parallel translation record** keyed
  `(version, locale)` (MT draft via Claude → Editor review → export through the same generator seam):
  version-pinned and human-correctable without touching the versioning core. Translate-at-export
  (no human review of MT before it reaches a classroom) and locale-tagged versions (modifies the
  semver/Official invariants this track is scoped to avoid) were both considered and not chosen.
- **Notification model: in-app unread badge + content-free email ping.** Badge is server-rendered on
  page loads (no websockets/polling infra); message creation enqueues a Jobs Queue email job saying
  only "you have a message waiting" (no message content in the email). Chosen over in-app-only
  (teachers who rarely log in never learn) and daily digest (more moving parts).
- **User directory: names-only roster for all authenticated users.** This is the DELIBERATE
  relaxation anticipated by the 2026-07-01 audit #4 privacy tightening — messaging's user picker
  needs it ("any user may message any user", SPEC §10). Display names become readable by any
  authenticated user; **emails and roles/assignments stay field-hidden** from non-admins (and the
  round-3 rule stands: server-side decisions on admin-only fields use trusted projections, never
  client-visible data). SPEC to be amended when PR ③ lands.

---

## 2026-07-02 (round 3) — row locks for read-modify-write; field-hidden data can't drive client authz

Third Codex pass, on the round-2 assignment endpoints. Two real findings, both fixed:

- **#1 TOCTOU window closed with a row lock.** The endpoints read→check→write inside a transaction,
  but two requests carrying the SAME fresh token could both pass the check before either commit
  (read committed: the second's UPDATE blocks on the row lock, then proceeds on its stale read).
  Fix: `SELECT … FOR UPDATE` on the target user BEFORE the freshness read — crucially executed on
  the TRANSACTION'S OWN connection (`payload.db.sessions[txID].db`, the same lookup
  @payloadcms/drizzle's unexported `getTransaction()` performs; running it on `payload.db.drizzle`
  would lock on a different connection and guard nothing). **Rule: a freshness check in a
  read-modify-write must sit behind a lock on the same connection that writes.**
- **#2 Site Admin targets are now untouchable by non-Site-Admins** — enforced in
  `enforceAssignmentScope` (the hook, not just the endpoint, so the generic PATCH and native admin
  form are covered too; applied only when rows actually change so no-op resubmits pass). Root cause
  worth remembering: the Manage addable-list filtered on `u.roles`, but `roles` is FIELD-HIDDEN from
  Subject Admins — the filter silently passed for them. The dashboard's users read is now a trusted
  server-side projection (overrideAccess, roles consumed server-side only; the client payload stays
  {id, name, updatedAt}). **Rule: never build client-side authz filtering on data that field access
  may strip — the server owns the rule, and server components must read via a trusted projection
  when the decision depends on admin-only fields.**
- **#3 Manage pagination**: deferred a third time — corpus-gated by definition (42 plans), tracked.
  **#4** stale "any signed-in user may read users" comment fixed (the privacy tightening obsoleted it).

Pins: int ("Subject Admin cannot change a Site Admin's assignment rows") + http (fresh-token assign
to a Site Admin → 4xx, nothing changes).

---

## 2026-07-02 — Playwright e2e RUN for the first time: Mac → Rock over a tunnel; 6/6 green

The browser suite (`tests/e2e/manage.e2e.spec.ts`) had only ever been authored + collected — the last
"done claims outrun executed proof" item from both Codex audits. **It now RUNS, from the dev Mac
against the LIVE Rock stack, 6/6 green** (role scoping, retired-route redirects, hidden nav group,
Repair row, delete-panel flow, and a new editor-shell smoke: stripped chrome + Back-to-lesson +
`?edit=1` lands a prose textarea editable for the Editor — the session's original bug, now
machine-verified).

**The run procedure (no Rock-side browser needed):**
1. `ssh -f -N -L 15432:<postgres-container-ip>:5432 david@rock5b` (container IP via `docker inspect
   lesson3-postgres-1`; the compose Postgres has no host port, but the Rock host routes to the bridge).
2. Local env = the Rock `.env` with `@postgres:5432` → `@localhost:15432` (fixture seeding boots
   Payload's Local API on the Mac against the live DB through the tunnel; works on Node 25).
3. `E2E_BASE_URL=http://rock5b.tail49b05.ts.net:3001 npx playwright test tests/e2e/manage.e2e.spec.ts`
   — `playwright.config.ts` now SKIPS its local dev-server when `E2E_BASE_URL` is set.
4. Fixtures are MARK-tagged + self-cleaning; verified zero residue on live afterwards.

**Assertion lesson:** CSS-hidden chrome (`display: none`) is still in the DOM — assert `toBeHidden()`,
not `toHaveCount(0)`.

---

## 2026-07-02 — Codex round-2: guards must be server-MANDATORY; narrow endpoints beat full-state PATCH

Second Codex pass after the redesign completed. Theme it surfaced (and we adopted as a rule):
**when the UI sends full resource state over a broad API, server-side concurrency guarantees must be
explicit — and a safety guard that the client may omit is not a guarantee.** Outcomes:

- **#1 make-official consent token now REQUIRED** (was optional-when-present, added in the first
  round): `deletePrevious=true` without `expectedPreviousOfficialId` → 400; mismatch → 409. The UI
  always sent it; now a scripted/direct API caller gets the same protection. http pins both paths.
- **#2 Editors-widget lost-update fixed (deferral reversed** — first round deferred it; Codex
  re-escalated to production-blocker and the user agreed): the widget's full-`assignments` PATCH is
  replaced by narrow endpoints `POST /users/:id/assign-editor` / `unassign-editor` with a REQUIRED
  `expectedUpdatedAt` (400 absent / 409 stale, checked in-transaction). The server rebuilds the row
  from FRESH state and applies a ONE-ROW delta — a stale page can no longer restore an old snapshot
  of someone's roles. Authorization unchanged (the update runs as the caller: collection/field access
  + `enforceAssignmentScope` + auto-demote all still apply). http covers assign→stale-409→unassign +
  the non-admin 4xx.
- **#3 lesson page could false-404 past 100 versions** — the version selector's `limit: 100` also fed
  Official/`?version=` resolution. Now `pagination: false`: a plan's version set is naturally bounded
  (dozens), completeness over truncation (same call as browse #8).
- **Kept deferred:** Manage whole-corpus fetches (scale-gated), the moderate esbuild dev advisories
  (upstream-gated). **CSS-internals brittleness** (the `:has()` chrome strip depends on Payload class
  names): accepted — versions are pinned and upgrades deliberate (knowledge-currency rule); an editor-
  shell smoke assertion joins the pending Playwright backlog.

---

## 2026-07-01 (post-②) — Codex audit of the redesign work: 8 findings, 8.0/10, no Critical/High

External Codex audit of `main` after IA-redesign PRs ①–② (+ the /simplify pass). Outcomes:

**Fixed immediately:**
- **#1 migration rollback ownership** — the author migration's `down` dropped `rate_limit_counters`,
  a table OWNED by the 20260629 migration (whose own down drops it): a one-step rollback would have
  killed the live rate limiter. `down` now undoes only what the migration semantically owns.
  **Rule: a migration's `down` must not tear down objects another migration owns, even ones its `up`
  defensively creates for chain repair.**
- **#2 make-official `deletePrevious` stale consent** — the delete-previous confirmation the admin
  gave was about the version that was Official when THEIR page rendered; if another admin moved the
  pointer meanwhile, the endpoint deleted the wrong (newer) version. The client now sends
  `expectedPreviousOfficialId` and the server 409s on mismatch inside the same transaction (pin:
  http spec "STALE expectedPreviousOfficialId"). **Rule: consent to a destructive action must name
  its object; the server verifies the object hasn't changed.**
- **#4 user-directory privacy (decided: tighten)** — `usersCollectionRead` was `Boolean(user)` "for
  attribution", but nothing teacher-facing reads other users today. Now: Site/Subject Admins read the
  roster (the Editors widget needs it); everyone else reads only themself (Where-scoped, so lists
  return the caller rather than erroring). Emails stay field-hidden on top. If §10 features need
  attribution later, relax deliberately.
- **#5** stray untracked `apiBase 2.ts` duplicate removed.

**Tracked, deliberately not built now:**
- **#3 Editors-widget full-array PATCH race** (two admins editing one user concurrently can lose an
  edit) — real but marginal at ≤1 Subject Admin per subject-grade + a refresh after every change;
  revisit with an updatedAt precondition or a narrow assign/unassign endpoint if the admin population
  grows. **#6** Manage loads whole collections (`pagination: false`) — fine at today's corpus,
  paginate/search at thousands. **#7** Manage has no browser-level coverage — fold into the pending
  Playwright run (the adminCatalogue spec is also still authored-not-run). **#8** dev-only esbuild
  moderate advisories — known, upstream-gated.

---

## 2026-07-01 (late) — IA redesign decided: one library, lesson-page hub, role-scoped Manage

The user flagged the core UX failure: three near-identical lesson lists (public browse, the admin
Lesson Plans catalogue, the Lesson Bundle Versions list) that click through to three different destinations
— the data model was leaking into the UX. Redesign decided after a structured Q&A; **simplicity and
elegance are paramount: no redundant menu items, no multiple paths to the same outcome.**

**The design — three places, one purpose each. Data-model names never appear in the UI:**
1. **Library (`/`)** — THE only list of lessons anywhere, identical for every role (no role-aware
   badges). Search + strand-first grouping as today.
2. **Lesson page (`/lessons/[id]`)** — everything about one lesson: rendered view, version pills
   (ALL roles keep seeing all versions — decided against Official-only for teachers), Download,
   **Edit** (the SOLE gateway to editing; lands unlocked), **Make Official** (Subject/Site Admin —
   confirmed unchanged: author ≠ approver, per-subject-grade delegation stays).
3. **Manage (`/admin`)** — ONE scrollable page of role-scoped functions, strictly cumulative:
   Editor: *My saved versions* (authored drafts; click resumes editing, ✕ deletes) and NOTHING else.
   Subject Admin: + delete any candidate in scope, + a compact **Editors widget** (promote/demote
   Teachers↔Editors per subject-grade; NOT the native Users table). Site Admin: + Upload (moves here
   from the old catalogue), + Repair (pointerless plans), + Delete lesson plans (search→select→delete),
   + links to native Curriculum/People lists.
   **Deleted:** the admin catalogue (duplicate library), the versions nav/list, the plan-edit form as
   a destination. The version editor gets **stripped chrome** (no admin sidebar/breadcrumbs) + "← Back
   to lesson"; relabelled "Lesson plan version" ("bundle" never user-visible).
   **Mobile: reading-first** — library/lesson/Manage must work on a phone; the editor form stays
   desktop-oriented.

**Authorship (new):** versions get an `author` relationship stamped by save-as-new from the
authenticated caller (never from submitted content). Editor delete scope TIGHTENS from
"any non-Official candidate in my subject-grade" to "only candidates I authored"; Subject Admin keeps
scope-wide; Site Admin everything. Versions predating the field (`author` = null) are
**admin-only-deletable** (decided: strict, no scope fallback). The save-as-new `deleteSource` flow
enforces the same rule server-side (skips the delete, still saves) and the client only offers the
prompt when permitted.

**Build order (5 PRs):** ① authorship + delete scoping (foundation) → ② the Manage page → ③ remove
redundant surfaces (catalogue, versions list, labels, sidebar) → ④ strip editor chrome + Back-to-lesson
→ ⑤ mobile reading pass + Guide copy. Each: CI green → Rock deploy → user eyeball.
Checkpoints for ③: verify whether Payload `admin.hidden` blocks ROUTES (if so, nav-hide + redirect the
list views instead, keeping the editor reachable); verify the Editors widget's assignment writes pass
the existing user-update guards.

---

## 2026-07-01 — PDF fidelity is about fonts, not pixels; real Arial in Gotenberg; + Editor edit-UX

Two threads this session: the editing UX for Editors, and the long-deferred PDF fidelity gate
(item ③) — which taught the more important lesson.

**Editing UX (#6, #10).**
- The admin version editor loads read-only by default (`LessonControls` locks the form on mount;
  Stage-2 immutable-version model). An Editor who clicked "Edit" on a lesson page landed on that
  locked form and reasonably concluded they had no edit rights. Fix (#6): the lesson-page Edit button
  now carries `?edit=1`, and `LessonControls` starts unlocked when that intent is present (one effect
  `setDisabled(!editing)` as the single source of truth); a locked-state notice explains the
  read-only view for anyone who arrives without the intent.
- Follow-up (#10) — a subtler trap surfaced: after unlocking, only a couple of admin-only fields were
  greyed (phase, rubric via field access), but MANY more (`structureText`/`proseAdmin`: duration,
  ARES keywords, answer-key exemplars, FE/ST structure) rendered as normal editable inputs yet had
  their edits **silently discarded on save** by the field-split whitelist (`applyEditorFieldSplit`
  overlays only prose onto the original doc). Decision: **hide all admin-only fields from Editors**,
  generalizing the existing META/UNIT `structureCondition` treatment into one `adminOnly()` wrapper
  (`fields/lessonContent.ts`; META/UNIT now use it too). Presentation only — the hook stays the write
  authority; hidden fields keep their original values, so answer keys/structure are never wiped; array
  RowLabels still read the value from row `data`. **Rule:** when field-level access can't safely gate
  a field (Payload nulls optional admin-only subfields inside open arrays), don't leave it
  falsely-editable — hide it. A form must never show an input whose edits won't persist.

**PDF fidelity (#8, #9) — the gate was measuring the wrong thing.**
- The gate (`scripts/pdf-fidelity-check.ts`) had never actually run to completion. First bug (#8):
  `requireTool` probed each tool with `-version`, but poppler's `pdftoppm` has no such flag (treats
  it as a filename → exits 1), so an installed tool was reported "not found" and aborted the gate.
  Fixed to fail only on ENOENT. **Rule:** a tool-presence check must distinguish "binary absent
  (ENOENT)" from "binary ran but disliked the probe flag."
- Running, it scored 0/3 with per-page diffs of 50–400%. The >100% values were the tell: LibreOffice
  (Gotenberg) and Word **paginate and lay tables out differently**, so page N of the candidate does
  not correspond to page N of the oracle. **A per-page pixel comparison of LibreOffice output against
  a Word oracle at 1% tolerance is mathematically unreachable cross-engine** — faithful output still
  differs across most pixels (font substitution + row-height shifts cascade into offsets). Pixel-vs-
  Word was abandoned as the fidelity method.
- Visual inspection showed the export is actually faithful; the visible gap the user flagged (table
  row heights) traced to **fonts**: the DOCX calls for **Arial** everywhere, and stock Gotenberg's
  LibreOffice has no Arial → substitutes **Liberation Sans**, whose vertical metrics differ enough to
  shift row heights. Fix (#9): build Gotenberg from a local `gotenberg/Dockerfile` = upstream +
  `ttf-mscorefonts-installer` (real Arial, fetched under Microsoft's EULA at build time — fonts NOT
  vendored, which the EULA disallows; hence a `build:` not a pinned image). Verified on the Rock: a
  three-way Liberation/Arial/Word render shows the gap closes to a **minor residual** (LibreOffice's
  vs Word's table-layout algorithm — not a font issue; nothing short of a Word-native engine closes
  it). Deployed.
- **Architecture clarification that reframed the stakes:** the **DOCX opened in real Word is the
  faithful, primary deliverable and is already perfect** (byte-faithful + Arial is a standard Office
  font). The **PDF export is the only LibreOffice-rendered artifact** — a *convenience* export. The
  **on-screen preview is mammoth DOCX→HTML with styling/colour dropped** (`generator/previewBundle.ts`),
  NOT LibreOffice. So chasing pixel-parity-with-Word for the PDF is overkill; "very good" suffices,
  and Arial gets it there. **Rule:** before optimizing "fidelity," identify WHICH rendering path is
  authoritative — don't burn effort making a secondary/derived artifact match a reference that the
  primary artifact already satisfies.
- Considered and rejected: Microsoft **`markitdown`** — it extracts documents TO Markdown for LLM
  ingestion (opposite direction; Markdown is disqualified by SPEC §0; for DOCX it wraps the same
  mammoth the preview already uses). A **same-engine regression gate** (freeze the Arial LibreOffice
  output as golden, diff future output vs it) is the only workable automated PDF gate — **parked** as
  optional, since the DOCX-in-Word path is already faithful and the PDF is secondary.

**Also (item ②):** admin-catalogue e2e coverage (#7) is authored + type-checked + `playwright test
--list` 4/4, but **not yet executed** (Playwright is dev-only; needs a running app + seedable DB via
`E2E_BASE_URL`+`DATABASE_URI`). The 3 Word `.oracle.pdf` + DOCX are staged on the Rock at
`/srv/lesson3/out/ares-demo` for whenever the regression gate or the e2e run happens.

---

## 2026-06-30 (eve) — Post-hardening track order agreed: coverage before fidelity assets

After the admin-UX de-duplication batch (Lesson Plans catalogue + Lesson Bundle Versions title cell,
`cbec573`..`76d6bbc`) and GFS backup activation, discussed what's actually left before calling the
system "safe at scale" and agreed an explicit order (full detail + rationale in
`docs/NEXT-SESSION.md` "Next-session plan"):

1. Re-confirm the full gate (`test:unit`+`test:int`+`test:http`/CI) is green on current HEAD before
   building anything else on top of it — cheap, no human dependency, and a lot has landed since the
   last cited green run.
2. e2e coverage for the new custom admin views (Lesson Plans catalogue + version-list title cell) —
   these are custom replacements for Payload's stock list views with ZERO direct test coverage, the
   top item on the production-readiness risk list, and a regression here could silently break the
   admin repair surface while tests stay green. Bounded effort, no human dependency beyond the
   running dev+Postgres stack.
3. The formal PDF fidelity gate, then 4. fidelity probes in CI — deliberately AFTER the coverage win
   because both need the same staged oracle DOCX/PDF assets (human-dependency-gated: 3 oracle PDFs
   from the user, ARES oracle data possibly from Mark), so they're grouped and done once the assets
   land rather than blocking on them first.
5. Everything else (rollback fault-injection test, log archival, dev-only audit advisories) is
   low-value cleanup, picked off opportunistically, not gating.

**Rule of thumb worth keeping:** when ranking "what's left before production," sequence by (a) what's
cheapest to re-verify and unblocks trust in everything after it, (b) highest real risk that's
bounded/self-directed, then (c) higher-setup work gated on an external human dependency (assets,
another person) — group items that share the same dependency so the asset-gathering isn't repeated.

---

## 2026-06-30 — ARES v2 data re-review: DQB phase vocabulary resolved; 2 export gaps remain

Reviewed the updated ARES v2 corpus (`markknit/cbe-generation-system` commit `3b75018`, 42
sub-strands) against our own ingest checkers (`contractDrift` + `validateGeneratable`). Went from
**42/42 files blocked → 0/42 blocked**: `framework[].phase` is now 100 % canonical (1920/1920) and
the `safety<N>otes` key corruption is gone (0 remaining). Regenerated DOCX confirmed — Biology
SS1.1 renders 60/60 phase cells correctly coloured (was 45 grey).

**DQB phase vocabulary — DECIDED (don't reopen).** The earlier open question ("is *DQB Update* a
distinct phase needing a 6th vocabulary value?") is resolved in favour of the **existing five
values**. Per ARES (the originating teachers, NGSS storyline model): the Driving Question Board is
a persistent classroom artifact and *every* visit — Creation, Update, Closure, Completion, Revision
— is the **same pedagogical activity type**, so all variants collapse to the single canonical
`"Driving Question Board (DQB) Creation"`. **No change to our `phases` enum, the generator's
`PHASE_KEY`/`PHASE_COLOUR`, or `SCHEMA.md`.** Our controlled vocabulary stays the 5-value set.

**Lesson — verify against the artifact you actually consume.** ARES's remediation summary
(saved alongside as `ARES-v2-remediation-summary.docx`) marked all four findings fixed, but two were
verified against the wrong target and still fail on the **JSON exports** we ingest:
- `schemaVersion` was added to the `.js` *source* (`generators/data/*_data.js`) but the
  **JSON-export step drops it** — all 42 `data/outputs/v2/**/*.json` still lack a top-level
  `schemaVersion`. Non-blocking for us (ingest doesn't gate on it; `contractDrift` only warns).
- The missing field is `LESSONS[].summaryTablePrompt.explained` (per-lesson summary block), still
  absent on Physics SS3.4/L8 and SS4.2/L7 — *not* `SUMMARY_TABLE.lessons[].explained` (which is
  complete and is what ARES checked). Renders a blank "How does this explain…" cell; the docx
  Packer tolerates the `undefined`, so it degrades silently rather than crashing.

Both are minor/non-blocking; the corpus is ingestable today. Full write-up in
`docs/ARES-v2-followup.md`.

**Update (commit `fd476b4`, "Address partner re-review"):** both residual items resolved at the
right target — `schemaVersion: '1.0.0'` now in all 42 **JSON exports** (first top-level key), and
`LESSONS[].summaryTablePrompt.explained` authored for Physics SS3.4/L8 and SS4.2/L7 (affected DOCX
regenerated). Full re-run: **42/42 clean — 0 blockers, 0 contract drift, 0 missing fields.** All
four original findings + both follow-up corrections closed; the v2 corpus conforms fully to
`ares-contract.schema.json`. Generator/SCHEMA.md unchanged throughout.

## 2026-06-30 (eve) — Codex review of the #9 ops layer (8.1/10): 8 fixes applied, 2 deferred

Codex reviewed the ops layer (no Critical/High). Applied 8 findings (commits `df88935` + a docs commit);
CI green incl. the new probe; the 3 script behaviour changes Rock-verified.

**Applied:**
- **Restore identifier injection (Med).** `restore-db.sh` now validates `--into` as a plain Postgres
  identifier (`^[A-Za-z_][A-Za-z0-9_]{0,62}$`) before it's interpolated into `DROP/CREATE DATABASE`.
  Operator-only, but it runs with DB-owner rights during recovery. (Verified: a `"; DROP …` name is rejected.)
- **Heartbeat false-positive (Med).** `heartbeat.sh` now treats ONLY 2xx/3xx as healthy (`/`→307 is the
  normal redirect). A 5xx (Payload/Postgres broken) no longer pings → the dead-man's-switch fires instead
  of monitoring falsely reporting green. (Verified: closed port → status 000 → no ping; 307 → ping.)
- **Unbacked deploy (Med).** `deploy.sh` REFUSES when backups aren't configured (no snapshot, no migrate),
  overridable with `ALLOW_UNBACKED_DEPLOY=1`. The prior code only warned — the comment had claimed
  "no snapshot, no migrate," so this aligns behaviour with intent. (Verified: dies before `compose up`.)
- **CI fidelity coverage (Med, partial).** Added the DB-free `contract-check` probe (ingest contract-drift
  is a hard gate) to `ci.yml`. The other three probes (`ingest-extract-check`, `format2-check`,
  `adapter-fidelity`) need the stakeholder oracle DOCX (`ARES_DEMO_PATH`, not in the repo) → staging those
  in CI is a tracked follow-up (pairs with the PDF-fidelity-gate item).
- **Silent rate-limit misconfig (Low).** `rateLimit.ts` `positiveIntEnv()` replaces `Number(env) || default`
  (which swallowed `0`/`NaN`/garbage back to the default — an operator setting `…_MAX=0` thought they'd
  locked it down but got 20). Now throws at boot on a malformed override (fail-fast, like the
  PAYLOAD_SECRET guard).
- **Undeclared dep (Low).** `drizzle-orm@0.45.2` is now a DIRECT dependency (payload.config imports
  `drizzle-orm/pg-core` for the `rate_limit_counters` `beforeSchemaInit` table; it was only transitive).
- **Test cleanup masks failure (Low).** `rateLimit.int.spec` `afterAll` guards `if (!payload) return` so a
  failed boot doesn't throw a secondary TypeError over the real error.

**Deferred (with rationale, tracked in NEXT-SESSION):**
- **Forced-rollback test for the transactional version endpoints (Med).** Codex suggests a
  `process.env.TEST_FAIL_AFTER_*` seam. Still declining to bake a test-only branch into the PRODUCTION
  endpoints — it's the one fix that puts test scaffolding in shipped code. Remains the top tracked
  follow-up; would need a cleaner mockable seam or a Rock/CI fault-injection harness.
- **O(n) semver allocation (Low).** `nextSemverForPlan` reads all of a plan's versions to compute max+1.
  Fine for the current corpus; a counter-row/sequence is a scale optimization that trades away the
  deliberate max+1 + unique-index design (premature now). Tracked as a scale follow-up.

## 2026-06-30 — Backlog #9 OPS DONE: backups, structured logging, heartbeat, CI (+ a push-vs-migrate lesson)

The last big readiness gap. All four landed; **GitHub Actions CI is green** (the canonical gate now runs
off-box) and the Rock is synced (`f4d73ee`, healthy). Operator setup steps (keys, OAuth, cron, Healthchecks
URLs) are documented in the new **`docs/OPS.md`**, not done here (they need the user's accounts).

**Decisions (the "what" + "why"):**
- **Backups — Postgres dump → `age` → `rclone` to Google Drive, NOT a managed service.** `pg_dump -Fc`
  (in the postgres container) → `age` encrypt on the host (recipient public key on the box; the private
  identity is held OFF-box, so a Rock compromise can't decrypt past backups) → `rclone` to the user's
  Google Drive (their existing 2TB One/AI plan; Drive isn't S3 so `rclone` is the tool, with a one-time
  headless OAuth). Two streams: `daily/` (30d) + `premigrate/` (90d). `scripts/{backup,restore,deploy}.sh`.
  `deploy.sh` snapshots BEFORE `compose up` so a bad migration is recoverable. Verified end-to-end on the
  Rock (dump→encrypt→upload→prune→restore, lesson_plans=13) with a throwaway key + a local stand-in remote.
- **Structured logging, NOT Sentry (user chose "simpler").** Payload's logger is already pino (JSON);
  we added env-tunable `LOG_LEVEL`, logged export-job failures with context, and bounded+rotated the
  container log stream via Docker's json-file driver (`max-size 10m`, `max-file 5`). Accepted trade-offs
  (documented): no auto-alerting/grouping and **no client-side error capture** — post-mortems are by
  grepping JSON logs, liveness is the heartbeat. Nothing leaves the box; no new dep. Verified live (pino
  JSON with levels confirmed on the Rock).
- **Monitoring — push/dead-man's-switch heartbeat.** The Rock is Tailscale-only, so an external pull-pinger
  can't reach it: instead the Rock pings OUT (`backup-db.sh` → `HEALTHCHECK_BACKUP_URL` on success;
  `scripts/heartbeat.sh` cron → `HEALTHCHECK_APP_URL` only when the app answers). If pings stop, the
  provider (Healthchecks.io free) alerts. All three branches tested on the Rock.
- **CI — GitHub Actions mirroring the Rock procedure.** `.github/workflows/ci.yml` on push/PR to main:
  `docker compose up --build` (postgres + one-shot migrate + app + gotenberg — also runs `next build` +
  applies migrations) then `test:unit`+`lint`+`audit:prod`+`test:int`+`test:http` via the deps image.
  Synthetic inline secrets + fully ephemeral stack → no repo secrets. ~3.5 min green.

**The lesson (CI earned its keep on day one): push vs migrate divergence.** The new shared rate-limiter
table (`rate_limit_counters`, created by migration `20260629_213000`) was **invisible to Payload's dev/test
`push`** because it isn't a collection. Manual Rock testing had MASKED this (the Rock's `lesson3_test`
persisted and had the table hand-created); a clean CI run exposed three layered failures:
1. **Push drops unmanaged tables** → `relation "rate_limit_counters" does not exist`. Fix: register the raw
   table in the drizzle schema via a `postgresAdapter.beforeSchemaInit` hook (columns mirror the migration),
   so push creates+keeps it while migrate still creates it in prod. **Rule: any raw (non-collection)
   table created by a migration MUST also be registered via `beforeSchemaInit`, or push will drop it.**
2. **migrate + push on the same DB conflict** → push re-adds an existing FK (`constraint … already exists`).
   So `test:int` must build its DB ONE way, not both.
3. **Concurrent push race** → parallel vitest workers each push the schema to the shared DB and collide
   (`users_sessions already exists`). Fix: `fileParallelism: false` (int specs run sequentially; first push
   creates, rest no-op). **Rule for `test:int`: let push build an EMPTY `lesson3_test` (do NOT pre-migrate
   it) and run the spec files sequentially.** The OLD Rock procedure (pre-migrate `lesson3_test`) is
   superseded — recreate it empty and let push build it, matching CI.

**Left to the user (setup, not code):** generate the `age` key on the Mac + give the public recipient;
`rclone` Drive OAuth; create two Healthchecks.io checks → set the two URLs; add `BACKUP_*`/`HEALTHCHECK_*`
to `.env`; install the backup + heartbeat crons. **Deferred (small):** durable cross-deploy log archival;
periodic `payload-jobs` row cleanup; orphaned `rate_limit_counters` rows for deleted users; the
transactional-rollback failure-path test (Codex Medium); `actions/checkout` Node-20 deprecation warning.

## 2026-06-29 (late) — Shared Postgres-backed rate limiter (readiness #9); + a `payload migrate` hang gotcha

Closed the "shared rate limiter" backlog item. Gate green on the Rock: **test:unit 39/39, test:int 18/18
(+3, the new limiter spec), test:http 22/22, audit:prod GREEN**; migration applied to `lesson3` +
`lesson3_test`; app healthy. Commit `ed2fd6b`.

- **Why.** `lib/rateLimit.ts` was an in-memory sliding window keyed per `(bucket, user)` — correct only
  on the single-box Rock. Under horizontal scaling each replica keeps its OWN map, so the effective budget
  is `max × replicas` and a restart resets it. Move the state to a SHARED store so the limit holds across
  processes.
- **Store: Postgres, not Redis.** New `rate_limit_counters` table (migration `20260629_213000`), one row
  per `(bucket, user)` key, reused each request. Redis would be a new container + client + env for one
  small feature; Postgres is already the single datastore and keeps the system single-runtime (CLAUDE.md).
- **Algorithm: fixed-window counter, not a sliding log (deliberate trade-off).** `window_start =
  floor(now / windowMs) * windowMs`; a single atomic `INSERT … ON CONFLICT DO UPDATE` bumps the count
  within the current window or resets it, `RETURNING` the new count. A fixed window can admit up to ~2×
  the budget across ONE boundary — immaterial for an abuse guard with generous per-user budgets — and it
  keeps the shared path one statement instead of array-pruning a per-hit log (the sliding-log alternative
  needs a row per request + cleanup). The count is incremented even when over budget (harmless: bounded by
  in-window volume, resets next window), so `Retry-After` is derived from the window boundary, not the count.
- **Atomicity.** `INSERT … ON CONFLICT DO UPDATE` takes a row lock, so concurrent requests for the same key
  serialise — no lost increments. Not a Payload collection (limiter bookkeeping, not domain content, must
  not show in the admin UI) → created by raw SQL in a hand-written migration, no `payload-types` change.
  `enforceUserRateLimit` is now **async** (one roundtrip via `req.payload.db.drizzle.execute(sql\`…\`)`);
  the 3 export/preview call sites await it. Int spec `tests/int/rateLimit.int.spec.ts` drives it directly
  with a minimal `{ user, payload }` req: allows up to max → 429 + `Retry-After`, per-user isolation, 401
  unauth. Cleanup of orphaned rows (deleted users) is a noted non-blocking follow-up — bounded by distinct
  users, so harmless at this scale.
- **OPS GOTCHA (cost time, logged for #9 CI).** A schema change normally rides the compose one-shot
  `migrate` container, which targets `lesson3` only. For `lesson3_test` the procedure runs `npx payload
  migrate` in the deps image — and it **HUNG** (no migration output, container "Up" indefinitely; the pg
  pool keeps the event loop alive and the CLI never exits in this invocation). Rather than fight it, the
  table is just `CREATE TABLE` SQL — applied it (and a `payload_migrations` row) to `lesson3_test`
  directly via `docker compose exec postgres psql`. Lesson: for a standalone-table migration, applying the
  raw SQL to the test DB is faster and more reliable than the migrate CLI; a real CI migrate step (#9)
  should run the actual `migrate` against a fresh DB so this path is exercised properly. (`lesson3` itself
  migrated cleanly via the compose `migrate` container — only the manual `lesson3_test` path hung.)

## 2026-06-29 (late) — Semver retry-on-conflict (Codex #4) + deliberate vitest bump; both Rock-verified

Closed the two small remaining code items from the hardening backlog. Gate green on the Rock with
vitest 4.1.9: **test:unit 39/39, test:int 15/15, test:http 22/22, audit:prod GREEN (exit 0)**; app
healthy (`/`→307, graphql→404, migrate nothing pending).

- **Semver retry-on-conflict (`eaec3ed`).** Two concurrent `POST /:id/save-as-new` on the same plan can
  both compute the same next patch (`nextSemverForPlan` = max-semver+1) before either commits; the loser
  hit the unique `lessonPlan_semver_idx` index and surfaced as a 500. Integrity was always protected (the
  index rejects the dup) — this just turns the rare race into a transparent retry. **Key constraint:** the
  conflict aborts the Postgres transaction, so you CANNOT recompute-and-retry inside it (Postgres requires
  a rollback first). So each attempt is its OWN transaction — the whole `initTransaction → create →
  (optional delete) → commit` block is wrapped in a bounded `for` loop; on conflict it `killTransaction`s,
  loops, and `nextSemverForPlan` reads the now-committed competitor row to pick a higher patch. Bounded to
  `SEMVER_CONFLICT_RETRIES = 4`.
- **`isSemverConflict` is deliberately NARROW (Codex re-review, Medium).** First cut matched any SQLSTATE
  `23505` or generic "duplicate key value" — too broad: it would mask an UNRELATED uniqueness bug behind 4
  retries and slow diagnostics. Narrowed to match ONLY `lessonPlan_semver_idx`: the pg error's
  `.constraint` field, the drizzle-wrapped `.cause.constraint`, or the index name in the message (case-
  insensitive). A bare `23505` no longer retries. Rule: **a retry predicate must name the exact condition
  it masks; everything else must surface immediately.** Unit-pinned in `tests/unit/semverConflict.spec.ts`
  (a `users_email_unique` `23505` asserts `false`). `isSemverConflict` lives in `lib/semver.ts` (type-only
  payload import → DB-free, unit-testable without the endpoint/DB import chain).
- **DEFERRED (Codex, Medium): a transactional-rollback failure-path test.** The transactional
  save-as-new/make-official are covered on the happy path but not on a forced 2nd-step failure (the prior
  bug — `4614958` — was partial success after step 2). A real rollback test needs a fault-injection seam
  (a valid Payload `delete` won't fail on its own) and only runs on the Rock. Left as a follow-up rather
  than bolt a test-only hook into the production endpoint. Tracked in NEXT-SESSION.
- **vitest 4.0.18 → 4.1.9 (`2599bb2`).** Clears the dev-only critical advisory GHSA-5xrq-8626-4rwp
  (arbitrary file read/exec when the **Vitest UI server** is listening). Never exploitable here — we only
  ever run `vitest run`, never `--ui` — but bumped deliberately. The bump restructured vitest's dep tree
  (npm removed ~157 packages). Exact pin (repo's no-caret convention). `audit:prod` stays GREEN; the 5
  remaining moderate esbuild/drizzle-kit advisories are transitive (`fixAvailable:false`), below the
  `--omit=dev --audit-level=high` gate.
- **`/simplify` (4 agents) + `/code-review` (Codex-style) both run on the delta.** Simplify found it
  essentially clean (one applied micro-polish: early-return in `isSemverConflict` before the regex);
  skipped the "extract a shared `createVersionWithSemver` helper" altitude suggestion as premature
  abstraction — there is exactly ONE caller today that allocates a computed semver + creates a version
  (ingest is conflict-free at `1.0.0`). The review's narrowing finding (above) was the substantive catch.

## 2026-06-29 (eve) — Codex re-review: make the "atomic" ops truly transactional + mandatory stale guard

Codex re-reviewed `d45360b` (7.8/10, no Critical/High). Correctly flagged that the "atomic" delete-source
/ delete-previous were **single-handler, not transactional** — a failed second step left the first
persisted while the request errored. Fixed (`4614958`), gate green (test:http 22/22, test:int 15/15):

- **Transactions (#2/#3).** `save-as-new` (create + optional delete) and `make-official` (pointer move +
  optional delete) now run inside one Payload transaction via `initTransaction`/`commitTransaction`/
  `killTransaction` (the built-in op pattern). Either step failing rolls back the whole operation.
- **Stale guard mandatory (#1).** `save-as-new` now REQUIRES a parseable base `updatedAt` → 400 if
  missing/invalid (was silently skipped), 409 if it predates the source. The real client always posts it
  (full form content); this closes the omit-to-bypass hole at the write boundary.
- **#5.** `LessonControls` leaves Official-ness `null` (unknown) on a failed plan fetch → Save won't
  offer delete-source on a transient error (was defaulting to "deletable").
- **#6.** NEXT-SESSION's old "editing forks a working copy" description marked SUPERSEDED by Stage 2.

**Deferred (noted in the commit):** #4 — concurrent `save-as-new` on the same plan can still surface the
unique `(lessonPlan, semver)` index error as a 500 (the transaction doesn't serialize semver allocation;
integrity is protected, it's a UX/retry gap). Rare on the single-box Rock → retry-on-conflict is a
follow-up. #7 — dev-only `vitest` critical + `esbuild` moderates (below the prod gate); bump `vitest`
deliberately later.

## 2026-06-29 — Atomic version replace/promote + /simplify cleanup; Stage 2 editing model COMPLETE

Two follow-ups landed, plus the /simplify pass that preceded them. The Stage 2 editing model is now
complete end-to-end. Gate: **test:http 22/22, test:int 15/15**, app healthy.

- **Atomic delete-source on save-as-new (`a085...`→`7b4290f`).** `POST /:id/save-as-new?deleteSource=true`
  creates the new candidate AND deletes the version you edited from in ONE handler — replacing the old
  create-then-separate-client-DELETE (which could orphan on interrupt). The Official is never deleted
  (server re-check + `enforceOfficialNotDeletable`). `LessonControls` determines Official-ness up front
  (one cheap plan read) and prompts "…and delete the one you're editing?" only for a deletable candidate.
- **Make Official atomic delete-previous (Stage 2b, `a1bb268`).** `POST /:id/make-official?deletePrevious=true`
  captures the current Official, moves the pointer, then deletes the now-superseded version in the same
  handler (never the promoted one; no-op if none). `EditActions` prompts "…also delete the previously-
  Official version? (Cancel keeps it.)". This completes the delete-prompt model for the official-
  replacement case.
- **/simplify cleanup (`bf9bd53`).** Removed the now-unreachable `enforceVersionImmutable` +
  `enforceVersionConcurrency` beforeChange hooks (dead under `update:() => false`); `save-as-new` reuses
  the exported `isOfficialVersion`. The model lives in one place: the access gate (immutability) +
  save-as-new (field-split + stale-check) + make-official (pointer). `enforceVersionFieldSplit` stays
  (preview uses it directly). Kept: the `editing` mirror in LessonControls (useForm().disabled
  reactivity via use-context-selector isn't guaranteed); serial docx+pdf download (safer for two browser
  downloads).

**Editing model status — COMPLETE:** Edit (open admin editor, read-only) → Edit unlocks → Save = new
candidate (never publishes) with optional atomic delete-source → admin Make Official moves the pointer
with optional atomic delete-previous. Versions immutable to authenticated users; only system/overrideAccess
+ these endpoints write. test:http covers save-as-new (editor/teacher/structural/stale/deleteSource) and
make-official (deletePrevious/editor-denied).

## 2026-06-29 — Stage 2 editing model ENFORCED server-side (Codex review #1–#6 addressed)

Stage 2a shipped the control-row UI but left the model only CSS-deep (native Save hidden, versions still
mutable via the API). A Codex review flagged that gap (#1, High) + related items. All actionable findings
closed; commits `cc321b0` (core) + `faa06bc` (test fix). Gate green: **test:http 18/18, test:int 15/15**,
and a live `PATCH /lesson-bundle-versions/8` as Editor → **403** (title unchanged).

- **#1 (High) — versions are now immutable to ALL authenticated users.** `lessonBundleVersionUpdate
  → () => false` (`access/versioning.ts`). There is no in-place edit: authoring a change goes only
  through `POST /:id/save-as-new`, which writes with `overrideAccess` after the field-split. Trusted
  system paths (ingest/migrations) keep writing via `overrideAccess` (bypasses access). Delete opened to
  Editor+ for NON-Official candidates (the Official one stays protected by `enforceOfficialNotDeletable`)
  so the delete-source cleanup works. The beforeChange hooks (`enforceVersionImmutable/FieldSplit/
  Concurrency`) are now BACKSTOPS for the authenticated path (never reached under update:false); the live
  field-split + stale-check run inside `save-as-new`.
- **#2 — public Edit no longer forks on open.** `EditActions` links straight to the admin editor for the
  selected version; the `/fork` endpoint is retired. A DB row is created only on Save.
- **#3 — stale-source guard.** `save-as-new` rejects a submitted base `updatedAt` older than the source's
  current value → 409 ("reload before saving").
- **#4 — body guards.** `save-as-new` reuses `parsePreviewCandidate` (Content-Length pre-check, byte cap,
  JSON + object-shape).
- **#5 — delete-source prompt.** After Save, `LessonControls` offers to delete the version you edited
  from, but ONLY when it is not the live Official.
- **#6 — tests.** Reworked the int spec for the new model (in-place update rejected for any role;
  overrideAccess still works; removed the old update-path field-split/concurrency specs — those semantics
  moved to save-as-new). Added `test:http` save-as-new coverage: Editor candidate created + Official
  pointer unchanged + source untouched; Teacher 4xx; Editor structural change 4xx; stale base 409.
- **#7 (Low) — API-tab CSS kept.** Payload's `hideAPIURL` is all-roles, not role-aware, so a CSS rule
  (version-pinned comment) remains the only way to keep the API tab for Site Admins only.

**Still open (Stage 2b residue):** the "delete the previously-Official version" prompt after Make Official
isn't built yet (Make Official lives on the public `EditActions`); and the dormant beforeChange hooks
could be pruned in a later /simplify pass.

## 2026-06-28 (late) — Editing UX redesign: AGREED MODEL (Stage 2) + Stage 1 admin tweaks landed

**Agreed editing/versioning model (supersedes SPEC §5's persistent-working-copy model — to BUILD in Stage 2):**
- **Edit** (any version) makes the form editable per role (Editor = prose; Admin = +structure/META). **No DB row** is created on Edit.
- **Discard Edits** / leaving → in-progress edits thrown away; nothing persists.
- **Save** (any Editor+) writes a **new candidate version** (next patch). **Never moves the Official pointer.** If the source you edited is **not** the current Official, prompt *"Delete source vX? [Delete][Keep]"*.
- **Make Official** (Site Admin, or Subject-Grade Admin for THAT subject-grade — only) is the sole pointer mover; separate click; then prompt *"Delete the previously-Official version? [Delete][Keep]"*.
- **Concurrency:** Save warns if the source changed since opened. **Visibility:** teachers see only Official; Editors/Admins see candidates in the admin list. **Delete rights:** Editor+ may delete a non-Official candidate; Official is never deletable.
- Implementation shape: edit the existing version's form in place but never write back — a custom Save calls a `save-as-new` endpoint (create candidate, no pointer move); native Save replaced; retire the fork-on-open endpoint; keep the public "Edit" as a link into the admin edit (no fork). Hardest piece: the read-only↔edit toggle in the admin doc view (to research first). Sub-decisions locked: A keep public Edit (as link), B warn on stale save, C keep Make-Official for rollback.

**Stage 1 (standalone admin edit-view tweaks) — DONE 2026-06-28 (`e84ce78`), Rock-verified.**
- "Semver" field **label → "Version"** (data/name stay `semver`).
- **Hide META + UNIT** for users who can't edit them: `admin.condition` mirroring `canEditStructure`, evaluated client-side (dependency-free `canEditStructureClient` in `fields/lessonContent.ts`). Editors don't see them; Subject/Site Admins in scope do. Server access unchanged; the field-split hook still preserves META for Editors on write.
- **API document tab → Site Admins only:** `AdminHeaderMenu` renders a conditional `<style>` hiding `.doc-tab[href$="/api"]` for non-Site-Admins (the admin header is on every admin page incl. the doc view). The API endpoint stays access-controlled regardless.
- **Last Modified / Created → right sidebar** under "Version": new `VersionTimestamps` UI field (reads form state, no DB column; registered in importMap); native `.doc-controls__meta` hidden **scoped** via `.collection-edit--lesson-bundle-versions` so other collections keep theirs (the first selector `.collection-lesson-bundle-versions` was wrong — corrected `80c5d94`). Also moved the public lesson-view Edit button into the Download row (`80c5d94`).
- Verified: edit page 200 for Editor + Subject-Admin (field config + importMap valid), API-hide style present for both; test:http 14/14, test:int 17/17. Client-rendered specifics (META hidden, Version label, sidebar timestamps) + Site-Admin-sees-API need an eyeball.

## 2026-06-28 (late) — Unified top nav across both surfaces + avatar dropdown

**Outcome.** The frontend header and the admin header now render ONE shared `AppNav`
(`src/components/AppNav`), so the two surfaces are identical: **Lessons · [Manage] · Guide · avatar**.
`Manage` (→`/admin`) shows only for `canUseAdminPanel` users (Editor/Subject/Site Admin); Teachers get
`Lessons · Guide · avatar`. The two-letter avatar is now a dropdown (`src/components/UserMenu`, client):
line 1 = role type (`userTypeLabel`: Teacher/Editor/Subject Administrator/Site Administrator), line 2 =
login email, line 3 = **Log Out** — replacing the old standalone username text + visible logout button.
Retired the now-unused `Avatar` + `LogoutButton` components (absorbed by `UserMenu`). Commit `e135de5`.

**Consistency mechanism.** Both surfaces use the SAME class names (`.app-nav`, `.app-nav__link`,
`.user-menu*`) with identical sizing (font-size, avatar dimensions, dropdown), differing only in theme
color tokens — frontend `(frontend)/styles.css` (CSS vars) vs admin `(payload)/custom.scss` (Payload
`--theme-*`). Supersedes the 2026-06-24 "consistent user menu" entry, which still had each surface
showing a different cross-link (frontend "Manage" vs admin "Lessons") + a standalone logout.

**Verified on the Rock via real logins** (creds held in private assistant memory, NOT the repo — see
NEXT-SESSION "passwords are NOT in the repo"): GET `/` as Teacher → `Lessons,Guide` + avatar (no
Manage); as Editor → `Lessons,Manage,Guide` + avatar; GET `/admin` as Editor → same nav inside
`lp-admin-header`. Build clean, test:http 14/14, test:int 17/17. (Dropdown contents + visual clipping
are client-render/visual — eyeball on `/admin`.)

## 2026-06-28 (late) — Codex re-review reconciled: native doc-locking reframes #4; upload pre-guard + audit:all added

External re-review (8 findings, 7.5/10). Most re-confirm the tracked backlog; reconciliation:

- **#1 (claimed "Medium live risk" — DOWNGRADED to Low, reframed).** The new `enforceVersionConcurrency`
  guard skips when `data.updatedAt` is absent, so a raw REST partial PATCH could bypass it. BUT the
  PRIMARY guard for concurrent ADMIN-UI editing is **Payload's native document locking**
  (`lockDocuments`, default-on; we don't disable it — verified live: the `payload-locked-documents`
  collection exists on the Rock with an active lock). Native locking stops a second editor saving over an
  open doc in the admin UI — the real edit surface. Our hook is **data-layer defense-in-depth** for the
  REST/Local-API surface. Deliberately NOT made mandatory: forcing a base on every authenticated update
  would 409 any caller (incl. the native admin form, which we have not confirmed submits `updatedAt`)
  that omits it — and the admin surface is already locked, so the residual (a trusted Editor issuing a raw
  partial PATCH without a base) is a low, accepted gap, not a silent admin clobber. Clarified in the hook
  doc-comment. (Knowledge-currency win: reading installed Payload source surfaced the native-locking
  layer both the reviewer and the original #4 work had overlooked.)
- **#6 (Low) — DONE.** `uploadBundles` buffered the whole multipart body (`req.formData()`) before the
  per-file caps. Added a Content-Length pre-parse 413 guard (`MAX_BODY_BYTES`), matching the existing
  `previewParse` idiom. Site-Admin-only, so low, but cheap defense-in-depth.
- **#7 (Low) — partially addressed.** Added an `audit:all` script (`npm audit --audit-level=moderate`)
  for full-audit visibility alongside the gating `audit:prod`. It is expected-RED (dev-only `vitest`
  critical + `esbuild`/`drizzle-kit` moderates, all `fixAvailable:false`); not a gate.
- **Already tracked, no new action:** #2 export dedupe is check-then-queue (not atomic) — true-concurrent
  bursts can still double-queue; acceptable on the single-box Rock (autoRun limit 2 + artifact cache make
  completed repeats free); an advisory-lock/unique-key upgrade is a scale follow-up. #3 per-process
  rate-limiter = the explicitly-remaining shared-limiter residual. #4 subject-admin-per-grade uniqueness
  is hook-only = Bucket A **#10 deferred** (needs a relation-table representation change). #5 browse
  `pagination:false` = the documented #8 trade-off (fine for hundreds; revisit at thousands). #8 lint
  warnings (mostly `any` in tests + generated-migration unused args) = known hygiene, not addressed.

## 2026-06-28 (late) — Readiness #4 LANDED: optimistic concurrency on working-copy edits (Rock-verified)

**Outcome.** Two editors opening the same Not-Official version no longer silently clobber each other
(last-write-wins). New `enforceVersionConcurrency` beforeChange hook (before the field-split) rejects a
stale overwrite with 409. Commit `699bd9f`. **test:int 17/17** (+2), test:http 14/14, app live.

**Mechanism — reuse the resubmitted `updatedAt` as the base token (no migration).** The model has no
`lockVersion` anymore (versions are immutable; only working copies mutate), so the old "reject stale
lockVersion" is obsolete. The edit path **resubmits the version it loaded, including `updatedAt`** —
which is already whitelisted in `VERSION_EDITOR_KEYS` (that whitelist was the tell: the submitted data
carries `updatedAt`). The hook treats `data.updatedAt` as the client's base and compares to
`originalDoc.updatedAt`: if stored has advanced past the base, someone else saved → 409. The DB stamps a
fresh `updatedAt` at write, so the submitted value is read-only here. **Verified empirically (the int
test discriminates):** had `data.updatedAt` been stripped before `beforeChange`, the stale-overwrite
assertion would have failed; it passes, so the base threads through. A normal single-editor save is
unaffected (base == stored → allowed).

**Scope / honest caveat.** Authenticated UPDATEs only; system/`overrideAccess` paths (ingest,
migrations, fork, fixtures — no `req.user`) are exempt and carry no base. If a client does a partial
PATCH WITHOUT `updatedAt`, the check is skipped (can't compare) — it protects the resubmit-based edit
path (which is what the app/admin uses) without breaking partial-update API callers. Confirming the
native Payload admin form includes `updatedAt` in its PATCH (vs needing a hidden field to inject it) is
the one piece not headlessly verifiable here — but the whitelist + the live resubmit path indicate it
does. If a future check shows otherwise, add a hidden form field carrying the loaded `updatedAt`.

## 2026-06-28 (late) — Phase-5 residual: export-status readiness is VERSION-scoped (Codex #4 resolved; bind-first reverted)

**Outcome.** `exportVersionStatusEndpoint` (`…/:id/export/status?jobId=`) now documents its real
contract instead of pretending to be job-scoped. Readiness is **version/spec-scoped**: a cache hit
returns `{ready}` regardless of the supplied `jobId`, and the `jobId` binds the NOT-ready diagnostics to
the version (a stray jobId 404s only when there is no cached artifact). Commit `c044e4a`. **test:http
13/13.**

**The instructive part — bind-first is WRONG here.** Codex #4 offered two fixes: bind the jobId before
the `isExportReady` short-circuit, OR make the API explicit that readiness is version-scoped. I tried
bind-first (`37e51ea`) — and it **regressed the normal export poll**: completed `payload-jobs` rows are
PRUNED on completion, so the instant a fast job finishes its legit jobId is no longer findable →
`findByID` throws → 404. The export DOCX+PDF e2e went red ("Export job not found") on the happy path.
The old ready-first short-circuit existed precisely to mask the pruned-job window. So the correct
resolution is the SECOND option (document version-scoped readiness), not the first. Lesson: the
"obvious" stricter fix (bind before serving) assumed durable job rows; the queue prunes them, so
readiness MUST be answerable without the job. (NB: this contradicts an older residual note that said
completed jobs are "kept" — they are not in this config; the unbounded-retention cleanup item is moot.)

## 2026-06-28 (late) — Item ③ LANDED: preview CSP override fixed by scoping the baseline rule (curl + e2e verified)

**Outcome.** The preview endpoint now serves its intended strict standalone CSP (`default-src 'none';
style-src 'unsafe-inline'; frame-ancestors 'none'`) to the client — the global baseline CSP no longer
clobbers it. Commits `d45bdb9` (fix) + `5ad774f` (tightened test). Deployed + Rock-verified.

**Root cause (confirmed, not assumed).** A `next.config.ts` `headers()` CSP on `/:path*` **overrides**
(does not intersect) a route handler's own Response CSP — only one CSP header reaches the client. So the
preview's `default-src 'none'` Response header was being replaced by the baseline
`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`.

**Fix.** Split `headers()` into two rules: (1) the **non-CSP** baseline (nosniff, X-Frame-Options,
Referrer-Policy, DNS-prefetch) on `/:path*` — applies everywhere INCLUDING preview; (2) the baseline
**CSP** on a negative-lookahead source that excludes the preview path:
`'/((?!api/lesson-bundle-versions/[^/]+/preview).*)'`. With no next.config CSP on the preview path, the
endpoint's Response CSP is uncontested. Also added `frame-ancestors 'none'` to `PREVIEW_HEADERS`
(`default-src` does not cover `frame-ancestors`) so the preview is anti-clickjacking on the CSP layer
too (it already gets `X-Frame-Options: DENY` from rule 1).

**Verified by curl on the Rock (the step the original finding proved you cannot skip).** `next.config`
path-regex behaves as intended: `/login` (200) and the SIBLING `…/:id/export` (401) both carry the
baseline `object-src` CSP; `…/:id/preview` (401) carries **no** baseline CSP but still carries
`X-Frame-Options: DENY` — i.e. the lookahead excludes ONLY `…/preview`, not the whole
`lesson-bundle-versions` prefix, and not the non-CSP headers. Then `test:http` **13/13** with the
tightened assertion (preview 200 → `default-src 'none'` + `frame-ancestors 'none'` present,
`object-src` ABSENT). **Lesson reinforced:** Next path-to-regexp source matching (incl. the
negative-lookahead `((?!…).*)` form) works here under Next 16, but header *precedence* is config-version
sensitive — curl the live response, don't reason from the config. Backlog #3 CSP item now fully closed
except the deferred nonce-based `script-src` (needs Next hydration-nonce plumbing).

## 2026-06-28 (late) — Item ② LANDED: deps advisories cleared via npm `overrides`, NOT a version bump (Rock-verified)

**Outcome.** `audit:prod` is GREEN (exit 0; 0 high / 0 critical in prod deps). The two prod HIGHs
(undici, nodemailer) and the postcss MODERATE are gone. Commit `8e80e17`, deployed + verified on the Rock.

**The research flipped the approach (knowledge-currency rule paid off).** NEXT-SESSION framed this as
"find which Payload/Next release bumps the vulnerable transitives, then bump deliberately." Checking the
registry (not memory): **no such release exists.**
- **Payload 3.85.1 is already the latest stable** (only `3.86.0-internal.*` / `4.0.0-canary.*` exist) and
  it pins undici to an **exact `7.24.4`** — so no forward Payload stable carries an undici fix, and our
  pin can't move.
- **Next's latest (`16.2.9`) still ships `postcss@8.4.31`** (< the `>=8.5.10` fix) — bumping Next fixes
  nothing here.
So the deliberate, minimal-churn fix is **scoped npm `overrides`** in `app/package.json` (no framework
version change, no schema change, no migration):
```jsonc
"overrides": { "undici": "7.28.0", "postcss": "8.5.16", "nodemailer": "9.0.1" }
```
- **undici 7.24.4 → 7.28.0** clears 7 HIGH advisories (TLS-cert-validation bypass in SOCKS5, Set-Cookie
  header injection, WS DoS, SOCKS5 pool cross-origin routing, keep-alive response-queue poisoning,
  SameSite downgrade, shared-cache whitespace disclosure). Fix range is exactly `>=7.28.0`; stayed in the
  **7.x** line (NOT undici 8.5.0 — a major against Payload). Override also deduped the tree (was two
  undici copies: top-level 7.27.2 + payload's nested 7.24.4 → one 7.28.0; confirmed in the running
  container, nested copy gone).
- **nodemailer 8.0.10 → 9.0.1** clears the HIGH (`raw` message option bypasses
  `disableFileAccess`/`disableUrlAccess`). 9.0.1 IS the upstream fix. Assessed safe for us: the ONLY
  9.0.0 breaking change is strict TLS validation on *remote-content fetches* (attachment href/path URLs,
  OAuth2 token endpoints, proxy CONNECT) — none of which our vanilla SMTP path uses
  (`createTransport({host,port,secure,auth})` + `sendMail`, `skipVerify:true`). `@payloadcms/email-nodemailer`
  declares `nodemailer@^8` but the override is fine — the adapter only calls
  `createTransport`/`sendMail`/`verify`/`createTestAccount`, all stable across 8→9.
- **postcss 8.4.31 → 8.5.16** clears the MODERATE CSS-stringify XSS (fix `>=8.5.10`); same-major,
  build-time only.

**`npm audit fix --force` is still the wrong tool** (proposes destructive downgrades `next@9.3.3`,
`payload@3.79.1`) — overrides are the correct mechanism.

**Overrides are TEMPORARY — exit conditions (remove each when upstream catches up):**
- drop the **undici** override once a Payload release pins undici `>=7.28.0`;
- drop the **nodemailer** override once `@payloadcms/email-nodemailer` widens its range to allow `9.x`;
- drop the **postcss** override once Next ships `postcss >=8.5.10`.
Until then they pin three transitives, so re-check on every Payload/Next bump.

**What remains after the override (does NOT gate `audit:prod`, which is `--audit-level=high`):**
- **5 MODERATE** in the esbuild → @esbuild-kit → drizzle-kit → @payloadcms/db-postgres chain
  (`fixAvailable:false`; build/migration tooling, the esbuild dev-server-request advisory). Blocked on
  drizzle-kit dropping the abandoned `@esbuild-kit/*`; below the high gate.
- **1 CRITICAL but DEV-ONLY: vitest** (UI-server arbitrary-file-read/exec). We run `vitest run` with **no
  UI server**, and vitest isn't in the prod image — excluded by `--omit=dev`, so `audit:prod` stays
  green. Pre-existing, not introduced here. Bump vitest opportunistically if a fixed release lands.

**Verification (Rock, the canonical gate `test:unit`+`test:int`+`test:http`, all on the new image/deps):**
`docker compose up -d --build` (migrate found nothing pending; app `Up`, Restarts=0; `/`→307,
`POST /api/graphql`→404) · `audit:prod` **exit 0 (GREEN)** in the rebuilt `lesson3-deps` · **test:http
13/13** (incl. DOCX+PDF export end-to-end via Gotenberg, exercising the undici-backed fetch) · **test:int
15/15**. nodemailer-9 runtime: SMTP_HOST IS set on the Rock, so the app constructs the v9 transport at
boot and runs stably (no email/module errors); a `createTransport({jsonTransport})`+`sendMail` smoke in
the deps image returned a messageId under 9.0.1.

**Test-DB gotcha logged (cost a red herring).** The `test:int` Rock procedure's step-3 "rewrite
`test.env` DATABASE_URI" hides the credentials as "…". The committed `test.env` literal is
`lesson3:lesson3@localhost` — the **password is a placeholder, not the real one**. Swapping only the host
(`localhost`→`postgres`) yields `28P01 password authentication failed`, which *looks* like a deps
regression but isn't. Correct recipe: derive the URI from the real `.env` `DATABASE_URI` and swap only
the **db name** to `lesson3_test` (keep its real user:pass@host), then `git checkout -- app/test.env`.
This is exactly the kind of friction backlog-#6's one-command helper should remove.

## 2026-06-28 (eve) — Codex re-review (8/10) reconciled: 5 already-tracked, 2 net-new

External re-review after items ⓪/① landed. Confirmed the create-path Official-pointer fix (⓪) and the
new HTTP suite (①). Five of its seven findings are ALREADY tracked: deps (item ②), preview CSP override
(follow-up ③ + spawned chip), export in-flight dedupe (Phase-5 residual "Codex #5"), per-process
limiter + unthrottled status (Phase-5 residuals + backlog #1/#9), browse-200 (backlog #8). Two are
NET-NEW, both Low and now in NEXT-SESSION:

- **#4 (Low) — `/export/status` returns `{ready}` before binding `jobId`.** `isExportReady(spec)`
  short-circuits at the top of `exportVersionStatusEndpoint`, so once the artifact is cached ANY `jobId`
  (even a bogus one) gets `200 {ready}` without the version-binding check below ever running. NOT a data
  leak — the caller still needs READ access to the version (`authorizeVersionExportRequest`), and the
  status carries no job detail. It's a contract nit: the endpoint advertises job-specific status but is
  really *spec/version readiness*. (The HTTP suite already documents this: the stray-jobId 404 assert
  must use a COLD version.) Fix options: bind `jobId` before the ready short-circuit, OR make the API
  explicit that `jobId` is optional and status is version/spec readiness. Low priority.
- **#7 (Low) — default `npm test` omits `test:http`.** `test` is still the scaffold default
  `test:int && test:e2e` (Playwright, browser, dev-only). Adding `test:http` to that chain does NOT make
  a runnable gate — `test:http` needs the running container (`E2E_BASE_URL=http://app:3000`) while the
  Playwright `test:e2e` needs a dev server at `:3000`; they can't both pass in one environment. So the
  fix is DOCUMENTATION not a script merge: the canonical **Rock verification gate is `test:unit` +
  `test:int` + `test:http`** (Playwright `tests/e2e/` is dev-only, not in the gate). Recorded in
  NEXT-SESSION backlog #6. A proper CI runner that stands up the app + DB then runs all three is the
  real follow-up.

## 2026-06-28 — Item ② (dependency advisories) assessed + `audit:prod` script added; upgrade NOT done

**Decision: do not improvise the framework upgrade in this session — it is a deliberate, plan-first
task (CLAUDE.md: "pin versions; upgrade deliberately, not on the weekly release train").** Added the
`audit:prod` script (`npm audit --omit=dev --audit-level=high`, Codex's suggested CI gate) so the
upgrade is measurable; it is **expected-RED today** (see below) until the upgrade lands. No deps changed.

**Current state (pins: `payload@3.85.1`, `next@16.2.6`).** `npm audit --omit=dev` → **11 (7 moderate,
4 high)**, all FRAMEWORK-TRANSITIVE:
- **undici (HIGH ×7)** — TLS validation bypass, Set-Cookie header injection, WS DoS, cache poisoning,
  etc. Bundled under `node_modules/payload/node_modules/undici`. Fix = a Payload release whose undici
  dep is bumped past the vulnerable range — not an in-range patch of our pin.
- **nodemailer (HIGH, "no fix available")** via `@payloadcms/email-nodemailer` — message-level `raw`
  option bypasses `disableFileAccess/disableUrlAccess` (arbitrary file read + SSRF). We don't use the
  `raw` option (templated mail only), so not exploitable in our usage; still flagged until upstream.
- **postcss (MODERATE)** via `next` — XSS in CSS stringify output. Fix = a Next bump.

**CRITICAL: do NOT run `npm audit fix --force`.** Its "fixes" are destructive DOWNGRADES — it proposes
`next@9.3.3` (from 16) and `payload@3.79.1` (from 3.85). The right path is a deliberate, researched
Payload/Next version bump (read the release notes / installed source per the knowledge-currency rule),
then regenerate types/migrations ON THE ROCK if the schema shifts, `next build` + `test:int` +
`test:http` green, and finally `audit:prod` green. That is the whole of item ② and is the next task.

## 2026-06-28 — Item ① landed: real endpoint/authz e2e suite (`test:http`), Rock-verified

**Outcome.** Backlog #4/#6's "real preview/export/PDF/authz coverage + a `POST /api/graphql → 404`
regression assert" is delivered as a new HTTP e2e suite that drives the RUNNING app over the wire,
complementing the in-process Local-API `tests/int` suite. `tests/http/endpoints.http.spec.ts` +
`vitest.http.config.mts` + a `test:http` script; the stale starter scaffold
`tests/e2e/frontend.e2e.spec.ts` (asserted the blank Payload template) is removed. **13/13 green on the
Rock.** Commits `059b18d` (suite) + `847fdd7` (fixes).

**Coverage.** GraphQL gone (`POST /api/graphql` + `GET /api/graphql-playground` → 404); preview auth
(401), Teacher GET read-gated → 200 script-free HTML, Teacher POST → 404 (EDIT-gated), Editor POST
prose overlay → 200 (overlay visible in the rendered HTML), Editor POST structural change → 422; export
read-gated with NO Official/published gate — a Teacher exports DOCX and PDF **end-to-end** (cold GET 409
→ POST prepare → poll status → GET zip, PK magic), stray jobId → 404; Bucket-A invariants over HTTP
(⓪ create-with-pointer rejected + nothing persisted, #2 clear-pointer rejected + pointer intact).

**How it runs (a SECOND Rock test procedure, distinct from `test:int`).** Unlike `test:int` (Local API,
redirected to the disposable `lesson3_test` via `test.env`), the HTTP suite must hit the running app,
which serves the **live `lesson3`**. So it loads NO `vitest.setup.ts` (no `test.env` override), seeds the
shared role fixture via the Local API into `lesson3` (MARK-tagged + self-cleaning, exactly like the
verify-* scripts — verified zero residue after teardown), and talks to the app at `E2E_BASE_URL`
(`http://app:3000`, the compose service) authenticating with the login token via `Authorization: JWT …`
(token auth → no CSRF dance). Run:
```
docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
  -w /app --env-file .env -e E2E_BASE_URL=http://app:3000 lesson3-deps npm run test:http
```

**Two findings the e2e surfaced (first run was 11/13):**
- **Real (Low) — preview CSP override.** `next.config.ts`'s `/:path*` baseline CSP
  (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`) **overrides** (not
  intersects) the preview endpoint's own stricter `default-src 'none'` Response CSP — only the global
  one reaches the client (`Headers.get()` returned a single value, no `default-src`). The next.config
  comment claiming "combine by intersection" was wrong; corrected it. So the preview does NOT get its
  intended strict standalone CSP. Low risk (preview HTML is DOMPurify-sanitized + script-free), but a
  defense-in-depth gap → **follow-up:** scope the `/:path*` rule to exclude the preview path (and verify
  Next header precedence by curl). Test now asserts the directives actually deployed.
- **Test-only — warm-cache status probe.** The `/export/status` handler returns `{ready}` for ANY jobId
  once the artifact is cached (the `isExportReady` short-circuit precedes the job-binding check), so the
  stray-jobId 404 assert must query a COLD (uncached) throwaway version, not the warmed `fx.version`.

## 2026-06-28 — Bucket A ⓪ landed: create-path Official-pointer gap closed (deployed + Rock-verified)

**Outcome.** The CREATE-path sibling of Bucket A's #2 (the Codex re-review finding below) is closed,
deployed, and Rock-verified. `validateOfficialVersionPointer` now also rejects `officialVersion` being
set on an **authenticated create** (`operation === 'create' && req.user && data?.officialVersion →
throw`). System/`overrideAccess` paths (no `req.user`: ingest, migrations) stay exempt — and never set
the pointer on create anyway (the valid flow is two-phase: create plan → create version under it → set
pointer via update). Hook-only, **no migration**. Commits `68fc706` (hook + specs) + `ca826f1` (spec
cleanup-order fix).

**Tests.** Rebuilt the `#2` int spec two-phase (version created UNDER the throwaway plan, then the
pointer set via update) — replacing the old cross-plan shape that only passed via `overrideAccess` —
and added a guard spec asserting an authenticated `siteAdmin` create-with-pointer is rejected while the
system path creates pointer-less. `test:int` **15/15** on the Rock (`lesson3_test`); a **sanity-flip**
(neutralize the create guard → `if (false)`) fails **exactly** the new create-guard spec and nothing
else — the gate has teeth. App rebuilt on the Rock so the running container enforces it; migrate had
nothing pending; frontend healthy, `POST /api/graphql` still 404.

**Test gotcha recorded.** Because the rebuilt `#2` version now lives UNDER its plan
(`lesson_bundle_versions.lesson_plan_id` is NOT NULL), the cleanup must delete the child version
BEFORE the plan — deleting the plan first makes Payload null the version's `lesson_plan_id` and the
delete errors (`23502`). Mirror `purgeMarked`'s order (versions before plans).

## 2026-06-28 — Codex re-review: Bucket A's #2 missed the CREATE path (RESOLVED — landed; see entry above)

**Finding (verified, real High).** Bucket A's official-pointer guard (#2) covers only UPDATE. On a
`lesson-plans` **create**, `validateOfficialVersionPointer`'s ownership check keys off
`idFrom(originalDoc?.id)`, which is undefined on create, so the "version must belong to this plan"
check is skipped. The grade check still runs, but a same-grade version of ANOTHER plan passes it — so
an authenticated create can set a new plan's `officialVersion` to a version owned by a different plan
→ two plans sharing one Official version (violates the one-Official-per-plan model). The only valid
assignment is two-phase (create plan → create version under it → update pointer), which ingest + the
fixture already do; on create the plan doesn't exist yet, so any `officialVersion` value is
structurally invalid.

**Self-inflicted test smell.** Bucket A's new `#2` int spec demonstrates the illegal shape: it creates
a version under `fx.plan`, then a SEPARATE plan whose `officialVersion` points at that version. It only
"passes" because `overrideAccess` bypasses the guard. The fix must also rebuild that spec two-phase
(version under the new plan) and add a guard spec.

**Decision: fold into next session as item ⓪ (do first; hook-only, no migration).** Reject
`officialVersion` on an authenticated create
(`operation === 'create' && req.user && data?.officialVersion → throw`); exempt system/overrideAccess
(ingest never sets it on create). The rest of the Codex re-review (#2–#7: deps, export dedupe, limiter,
stale e2e, browse-200, subject-admin) is the already-tracked backlog — nothing new.

## 2026-06-28 — Bucket A landed: server-side invariant hardening (deployed + Rock-verified)

**Outcome.** The invariant cluster from the Codex triage is enforced server-side and live on the Rock.
Commits `0caf341` (hooks/helper + 4 int specs) and `fb72cec` (unique index + migration + regression
spec). `test:int` **14/14**; app rebuilt on the Rock so the running container matches the new index.

**Implementation choices worth recording:**
- **#2 (official pointer can't be cleared).** Added to `validateOfficialVersionPointer`: reject an
  update that nulls `officialVersion` **only when `req.user` is present**. The no-`req.user`
  overrideAccess path legitimately clears it — ingest (creates plan with a null pointer, sets it in a
  follow-up update), roundtrip cleanup, and the int-fixture `purgeMarked` teardown all do — so the
  system carve-out is required, same pattern as the field-split/immutability hooks. Confirmed by an
  int spec asserting BOTH: authenticated clear rejected, overrideAccess clear allowed.
- **#3a (version/plan grade consistency).** New `enforceVersionPlanConsistency` (beforeValidate, runs
  on create + update) fetches the parent plan (overrideAccess — integrity, not authz) and requires
  `version.subjectGrade === plan.subjectGrade`. Holds for ingest + fork (both carry the plan's grade).
- **#3b (semver immutable).** Chose **field `access: { update: () => false }`** over a hook: Payload
  silently preserves the original on any authenticated update (no error needed), and overrideAccess
  (ingest 1.0.0, fork's computed patch) bypasses it on create. `readOnly` only hid it in the admin UI.
- **#4 (no duplicate semver).** `nextSemverForPlan` computes the next patch from the **max existing
  semver across the plan's versions** (the old code blind-bumped the *source*, so two forks of 1.0.0
  both made 1.0.1). The **unique `(lessonPlan, semver)` index** is the concurrency backstop (declared
  `indexes: [{ fields:['lessonPlan','semver'], unique:true }]`). Migration hardened idempotent
  (`CREATE UNIQUE INDEX IF NOT EXISTS` / `DROP INDEX IF EXISTS`), per the Stage-3 lesson.
- **Pre-migration data cleanup (gotcha for any future unique constraint).** The live corpus already
  had a dup `(10, 1.0.1)` — two non-Official verifier-cruft working copies (versions 23, 26). A unique
  index build FAILS on existing dups, so they were deleted first (via a one-off `payload run` script
  using the Local API + overrideAccess, with a never-delete-Official guard). **Always pre-check
  `GROUP BY … HAVING count(*)>1` before adding a unique index to a live table.**
- **Test-DB hygiene.** A crashed earlier run left `ZZ_INT_` rows that wedged `purgeMarked` with a
  Postgres `25P02` (aborted-transaction) cascade. Fastest fix: drop + recreate + re-migrate the
  disposable `lesson3_test`. The fixture's leftover-tolerance is a known fragility (not fixed here).
- **#10 deferred** — DB-level subject-admin-per-grade uniqueness needs a representation change; the
  hook fan-out still enforces it. Out of scope for this batch.

## 2026-06-27 (evening) — Codex audit triage + the next batch: server-side invariant hardening

**Context.** Codex ran an external review of `main` (`da0a189`) and filed 11 findings + a 7/10 rating.
Triaged each against the source. The audit's central thesis is **correct and the useful takeaway**:
*invariants are enforced at the workflow/endpoint layer (fork, make-official, upload) but NOT as
collection hooks or DB constraints — so privileged direct API/admin writes can still violate them.*
Roughly half the findings rediscover the existing backlog (good corroboration); the new signal is a
cluster of server-side invariant gaps. **No code changed this session — this entry records the triage
and the plan; the batch starts next session.**

**Bucket A — NEW, act on it (the invariant cluster; verified against code):**
- **#2 plan can lose its Official version.** `officialVersion` is not `required`
  ([LessonPlans.ts:54]) and `validateOfficialVersionPointer` returns early on null
  ([hooks/lessonPlan.ts:27]); anyone with `canSetOfficialVersion` can clear it on update and nothing
  rejects it. (Codex's `ON DELETE SET NULL` orphan path is actually mitigated by
  `enforceOfficialNotDeletable`; the real gap is the direct update-to-null.)
- **#3 version/plan consistency unchecked at create + `semver` not server-immutable.** The
  plan/grade-match check in `validateOfficialVersionPointer` fires only at make-official, not at
  version **create**, so an admin can create a version under plan A carrying subjectGrade B (reads /
  authz key off the version's own `subjectGrade`). `semver` is `readOnly` in the **admin UI only**
  ([LessonBundleVersions.ts:106]) with no field `access.update` lock → mutable via API. (Rate Medium,
  not High — both require admin create access; admins are trusted. Defense-in-depth still warrants it.)
- **#4 duplicate semver from forks.** Every fork is `bumpSemver(source.semver,'patch')`
  ([endpoints/versionEdit.ts:71]); two forks of `1.0.0` both become `1.0.1`. No unique `(lessonPlan,
  semver)`.
- **#10 "≤1 Subject Admin" is hook-enforced, not atomic.** `autoDemotePriorSubjectAdmins` is an
  after-change fan-out with no DB constraint; concurrent promotions can transiently violate it. Known
  design choice; lowest priority in the batch.

**Bucket B — accurate but ALREADY on the backlog (Codex corroborated, not new work):** #1 deps =
backlog #1 (the `audit:prod` CI-gate idea is a good add); #6 per-process limiter + unthrottled
`/export/status` = the documented Phase-5 residual; #7 stale `frontend.e2e.spec.ts` = backlog #6 (and
is the planned #4-next); #8 browse `limit:200` = backlog #8; #9 minimal CSP / no nonce `script-src` =
backlog #3 (deferred with reasoning). #5 export-job dedupe/idempotency is real and not yet tracked →
folded into the Phase-5 residuals.

**Bucket C — context corrections:** Codex's "local test runner broken by an esbuild native mismatch"
is an **environment artifact** (platform/ownership of `node_modules`), not a code defect — `test:int`
9/9 and `test:unit` 33/33 are green on the Rock (this session). Its test-coverage commentary is
read-only inference that missed the now-green Local-API layer. #11 (upload buffers before per-file
size check) is genuine but **Site-Admin-only** (self-compromise) → Low; a `Content-Length` pre-guard
like the preview parser's is the cheap fix. CodeRabbit produced nothing (seat unassigned) — ignore.

**Plan for the Bucket A batch (next session) — hooks + constraints, EXEMPT system/ingest paths:**
1. **#2** — in `validateOfficialVersionPointer`, reject clearing `officialVersion` to null **on update
   when the plan already has ≥1 version**. GOTCHA: ingest creates the plan with a null pointer, then
   the version, then sets the pointer — so the guard must be update-only AND must not fire while the
   plan still has zero versions (or exempt the `overrideAccess`/no-`req.user` system path, like the
   field-split/immutability hooks already do). Hook-only, no migration.
2. **#3** — add `validateVersionPlanConsistency` (beforeValidate on `lesson-bundle-versions`):
   `data.subjectGrade` must equal the parent plan's `subjectGrade`. AND make `semver` immutable on
   update except trusted/system contexts (field `access.update` or a hook), but allow it on
   **create** (fork sets semver via `overrideAccess`). Hook-only, no migration.
3. **#4** — compute the next patch from the plan's existing versions (`nextSemverForPlan`) instead of
   blindly patch-bumping the source, AND add a **partial unique index on `(lessonPlan, semver)`**.
   Migration required → generate on the Rock (Node 22, deploy doc). PRE-CHECK the live corpus for any
   existing `(plan, semver)` duplicate before adding the constraint (the verifier runs left an extra
   working `1.0.1` — confirm it's not a dup under the same plan, or the migration's index build fails).
4. **#10 (optional, lowest)** — a partial unique constraint for subject-admin-per-subjectGrade; larger
   (representation/locking). Defer unless cheap. Migration if done.

**Sequencing decision:** do Bucket A **before** the endpoint/authz e2e (#4-next), because the e2e
suite should assert these invariants once they exist (and the new `tests/int` fixture is the harness
for both). Then #1 deps last, as already planned. Rated the codebase 7/10 — fair; closing Bucket A +
the test gate is what moves it toward "deployable for real."

## 2026-06-27 — `test:int` had never actually run; three fixes + the Rock test-DB procedure

**Context.** Pushed the 4-commit hardening batch (GraphQL off, preview sanitize + headers, int harness)
from the home Mac mini, pulled + rebuilt + redeployed on the Rock, and ran the verification gate. The
endpoint/header checks passed immediately (GraphQL `POST`/playground both 404; nosniff / X-Frame /
Referrer-Policy / non-script CSP all present; `next build` clean in the image; `test:unit` 33/33). But
the headline gate — `test:int` (the new hermetic role fixture + `access.int.spec.ts`) — **had never
been executed anywhere with a DB**, and first contact surfaced three real bugs.

**Finding 1 — wrong vitest environment.** `vitest.config.mts` (the `tests/int` config) set
`environment: 'jsdom'`. These are server-side Payload integration tests (`getPayload({ config })`);
under jsdom, vite externalizes node builtins and the whole `payload.config` import chain dies at load
with `ERR_UNKNOWN_BUILTIN_MODULE: node:` (empty specifier), 0 tests collected. A trivial no-import
smoke spec passed under the same config, proving it was the payload import chain, not the harness.
**Fix:** `environment: 'node'` — which is exactly what the already-green `vitest.unit.config.mts` uses.
*Rule: server-side Payload int tests run under the `node` environment, never `jsdom`.*

**Finding 2 — fixture used an invalid phase.** `tests/helpers/fixtures.ts` `minimalBundleContent()`
set `framework[].phase: 'Predict'`, which is **not** in the controlled vocabulary (`fields/phases.ts`:
the value is `'Predict Phase'`). So the fixture's own version-create tripped `validateGeneratable`
(`enforceBundleVersionGeneratable`), throwing in `beforeAll` and skipping all 8 specs. **Fix:**
`'Predict Phase'`.

**Finding 3 — Editor test submitted id-less rows (the subtle one).** The "Editor overlays prose but
admin/structure preserved" spec submitted a *fresh* `minimalBundleContent()` — rows with **no `id`s**.
Payload treats id-less array rows as NEW, and on a new row a non-admin's submission has the admin-only
`framework[].phase` stripped (it carries no field-level value for an Editor). `validateGeneratable`
runs in `beforeValidate` — BEFORE `enforceVersionFieldSplit` (a `beforeChange` hook) restores `phase`
from the original — so it saw `phase: undefined` and threw. This is a **test bug, not a product bug**:
the live edit path (and `verify-stage2b-edit`, 13/13) resubmits the *loaded* rows via `{ ...l }`,
preserving each row's `id` + `phase`, so `merged` stays valid and the field-split then ignores any
hack. **Fix:** the spec now maps the working copy's real rows (`wc.lessons.map(...)`) and overlays the
prose change, mirroring the live path. *Lesson: an Editor-edit test MUST resubmit rows with their ids
(and admin subfields), because id-less rows are "new" and lose admin fields before the generatable
gate — which validates pre-field-split for Editors.* (The ordering — generatable in `beforeValidate`,
field-split in `beforeChange` — is safe in practice because every real writer submits ids; noted, not
changed.)

**Result.** `test:int` 9/9 green. Evidence gate honoured with a **sanity-flip**: neutralizing
`enforceVersionImmutable`'s Official-version check flips ONLY "rejects updating the Official version"
to red, the other 8 stay green — the suite has teeth.

**Rock test-DB procedure (the ops wrinkle — belongs with backlog #6).** The committed `test.env`
points `DATABASE_URI` at `localhost:5432/lesson3_test` (a dev-host assumption) and `vitest.setup.ts`
loads it with `override: true`, so it clobbers any passed DATABASE_URI. On the Rock, postgres is
internal-only at `postgres:5432` and there is no `localhost` DB. To run `test:int` on the Rock:
1. `CREATE DATABASE lesson3_test;` (via `docker compose exec -T postgres psql -U lesson3 -d postgres`).
2. Apply migrations to it with the deps image + an env whose DATABASE_URI db is `lesson3_test`
   (`npx payload migrate`, `--network lesson3_default`).
3. Temporarily rewrite `app/test.env`'s `DATABASE_URI` to `postgres://…@postgres:5432/lesson3_test`,
   run `npm run test:int` in the deps image on `--network lesson3_default`, then
   `git checkout -- app/test.env`.
The `lesson3_test` DB is isolated from the real `lesson3` corpus and was left in place for future runs;
delete any throwaway env file (it holds the real `PAYLOAD_SECRET`). A committed helper that makes this
one command (or a Rock-host-aware `test.env`) is the proper backlog-#6 follow-up.

## 2026-06-26 — Hardening: sanitize preview HTML + baseline frontend security headers (backlog #3)

**Context.** Backlog #3 (and Codex) flagged that Mammoth-generated preview HTML is rendered with
`dangerouslySetInnerHTML` on the teacher route (`(frontend)/lessons/[id]/page.tsx`) and as a standalone
page from the preview endpoint, with no sanitization and no frontend CSP. Low risk today (inputs are
plain strings; Mammoth escapes text) but becomes real XSS the moment resource links or richer imported
content land — so close it now.

**Decisions.**
1. **Sanitize at the single seam.** Added `src/lib/sanitizeHtml.ts` (`sanitizePreviewHtml`) using
   **DOMPurify + the already-vendored jsdom** (pinned `dompurify@3.4.11`, exact — matches the repo's
   no-caret convention). Applied inside `docxToSections` (`generator/previewBundle.ts`), the one
   function BOTH render paths flow through — not per-render-site. Allowlist = the safe subset Mammoth
   emits (p/inline-emphasis/headings/lists/links/tables; attrs href/colspan/rowspan; no style/class/id,
   no `on*`). Chose DOMPurify over a hand-rolled allowlist (the altitude anti-pattern).
   **Gotcha recorded:** do NOT set a custom `ALLOWED_URI_REGEXP` — it over-applies to non-URI
   attributes and silently strips `colspan`/`rowspan`. DOMPurify's DEFAULT URI validation already
   blocks `javascript:`/`data:` while keeping http(s)/mailto/relative/anchors (verified empirically).
2. **Baseline frontend security headers** via `next.config.ts` `headers()` on every route:
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
   strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`, and a CSP that hardens WITHOUT a
   script-src/default-src (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action
   'self'`). Deliberately no strict script-src: Next relies on inline hydration scripts, so a strict
   policy needs nonce plumbing — **deferred as a separate, larger task**. The preview endpoint keeps
   its own strict standalone CSP; multiple CSP headers combine by intersection (stricter), no conflict.

**Verify.** Unit `tests/unit/sanitizeHtml.spec.ts` (strips script/on*/javascript:/data:, keeps
tables/links/emphasis, drops style/class/id). On the Rock: `next build`; confirm the headers are present
on a frontend response and the teacher preview still renders tables/formatting.

## 2026-06-26 — Hardening: GraphQL + Playground disabled (config flag is NOT enough — delete the routes)

**Context.** Production-readiness backlog #7 (and an external Codex review) flagged the scaffold-mounted
GraphQL POST + Playground routes as unnecessary recon surface — this app's API is REST + custom
endpoints; GraphQL is unused. Access control still applies, so this is surface reduction, not a fix
for an exploitable hole.

**Finding (verify-installed-source rule paid off).** Setting `graphQL: { disable: true }` in
`payload.config.ts` is **not sufficient on its own**. The generated Next route handler
(`@payloadcms/next/dist/routes/graphql/handler.js`) `POST` export does NOT check `graphQL.disable` —
it unconditionally builds the schema (`configToSchema`) and serves. Only the *playground* GET handler
honours the flag. So the committed `app/(payload)/api/graphql/route.ts` would keep serving queries
regardless of the config flag.

**Decision.** Belt-and-suspenders: (1) set `graphQL.disable: true` (kills introspection, the playground,
and any internal schema build that DOES read the flag), AND (2) **delete** both generated route files
`app/(payload)/api/graphql/route.ts` and `…/graphql-playground/route.ts`. With the specific segments
gone, `POST /api/graphql` and `GET /api/graphql-playground` fall through to the REST catch-all
(`api/[...slug]/route.ts`), which treats "graphql" as an unknown collection slug and returns 404. No
other code references these routes (importMap clean, no src imports). The "DO NOT MODIFY — generated"
banner warns against *editing* the files (a re-scaffold could overwrite); deleting to remove an endpoint
is the supported way to drop a route in an app-router Payload project.

**Verify on the Rock.** `next build` succeeds; `POST /api/graphql` → 404, `GET /api/graphql-playground`
→ 404; admin + REST + custom endpoints unaffected (Payload 3 admin uses REST/server functions, not
GraphQL).

## 2026-06-26 — FE/ST modeling resolved: single-document sub-strands are legitimate (option a)

**Context.** The production-readiness backlog (NEXT-SESSION #5) flagged that ingest's warn-only
deliverable check conflates two cases: "this sub-strand legitimately has no FINAL_EXPLANATION /
SUMMARY_TABLE" (6/13 of the upstream corpus) vs. "the data is incomplete." It could not become a
hard gate until that ambiguity was resolved (SPEC §3 option (a) allow single-doc bundles, OR (b) a
typed `notApplicable` state).

**Decision (user-confirmed 2026-06-26).** Adopt **option (a)**: some sub-strands ship as a *single*
document (the LessonSequence only). A missing FE/ST is **valid content, not incomplete data**.
Therefore:
- The deliverable check stays **informational only** and must **never** be promoted to a hard gate.
  (The generator already guards empty FE/ST — `FE.sections || []`, `ST.lessons || []` — and simply
  skips those documents, so single-doc bundles already generate correctly end to end.)
- The always-present **LessonSequence remains hard-gated** by `validateGeneratable` (META, ≥1 lesson,
  SLO/summaryTablePrompt groups, ≥1 valid framework phase). That gate is unchanged.
- **Option (b) (a typed `notApplicable`/intentionally-omitted state) is DEFERRED** — not built. It
  would require a DB field + Rock migration for no functional gain today, since absence already
  generates the right output and is no longer treated as a defect. Revisit only if we later need to
  distinguish "intentionally omitted" from "not yet authored" in the editor UI.

**Changes.** SPEC §3 amended (single-document sub-strands called out as legitimate; "up to three
documents per bundle"). `deliverableWarnings` doc comment in `validateGeneratable.ts` reworded to
state the resolution (no behavior change — it already only warned). Backlog item #5 is now CLOSED.

## 2026-06-25 — Stage 3 DEPLOYED + Rock-verified; collection-drop migration gotchas

**Outcome.** The `lesson-bundles` retirement is live on the Rock. The drop migration
(`20260625_125532_drop_lesson_bundles`) applied cleanly (exit 0, 277 ms, batch 9); 0 `lesson_bundles*`
tables remain; `lesson_plans` (13) + `lesson_bundle_versions` (14) intact; app healthy on the new
schema (no `relation … does not exist`). All verifiers green: roundtrip-regression **3/3 byte-identical**
(seed→ingest→version→generate→diff vs the stakeholder oracle), `verify-rbac` 7/7, `verify-stage2b-edit`
13/13, `verify-stage2b-preview` 7/7, `verify-stage2-export` DOCX+PDF. Committed `1959daf` (Rock-generated
`payload-types.ts` + migration, pushed back to `main`). The Stage 3 entry below is now fully realised.

**Two gotchas to expect on ANY future Payload collection-drop migration (the auto-generated SQL is not
apply-safe as-is — review + harden the `up()` before `docker compose up -d --build`):**

1. **`DROP CONSTRAINT` must be `IF EXISTS`.** Payload emits `DROP TABLE "<coll>" CASCADE` *and* a later
   explicit `ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "<...>_<coll>_fk"`. The CASCADE
   already removes that FK (it references the dropped table), so the explicit drop then errors
   `constraint … does not exist` and the whole (transactional) migration rolls back. Fix: make the
   `up()` drops idempotent — `DROP CONSTRAINT IF EXISTS`, and for safety `DROP TABLE/TYPE/INDEX/COLUMN
   IF EXISTS` too. (The earlier "IF EXISTS is optional" call was wrong for a real DB — it's required.)
   The `lesson_bundle_versions` FK/column/index on the same join table are left untouched — verify that.

2. **Removing a value from an in-use enum fails on stale rows.** The diff also rebuilt the
   `payload_jobs(_log).task_slug` enum to drop the retired `generateArtifact` value, via
   `ALTER COLUMN … SET DATA TYPE <new_enum> USING task_slug::<new_enum>`. That cast throws
   `invalid input value for enum … "generateArtifact"` if any retained job row still holds the removed
   value — and completed jobs ARE retained (no auto-delete). Fix: prepend `DELETE FROM payload_jobs_log
   …; DELETE FROM payload_jobs … WHERE task_slug = '<removed>'` to `up()` (kept in the migration so a
   replay on any DB is safe). Generalises: dropping any task/enum value requires clearing rows that use it.

**Process note.** The migration + `payload-types.ts` must be generated ON THE ROCK (Node 22; local
payload CLIs break on newer Node), then committed + pushed back to `main` with a short-lived PAT (the
Rock is pull-only). The hand-edits above were applied on the Rock via `sudo` (the deps container
generates the file root-owned). See the runbook in the Stage 3 entry below.

**Minor follow-up.** The DB-less fidelity scripts (`roundtrip-regression`, `adapter-fidelity`,
`pdf-fidelity-check`) default their oracle path to `~/Desktop/ares-docx-fidelity-demo`; in-container on
the Rock they need BOTH `-e ARES_DEMO_PATH=/ares-demo` AND `-v /srv/lesson3/out/ares-demo:/ares-demo`
(env alone fails ENOENT — the host path isn't mounted). Worth baking into a Rock verify helper.

## 2026-06-24 — Stage 3: legacy `lesson-bundles` collection retired

**Decision.** The Official-version model (`lesson-plans` + immutable `lesson-bundle-versions`) is now
the ONLY representation. The legacy `lesson-bundles` collection and its entire bundle-path
(endpoints, generator, hooks, access, scripts) are removed. **DONE + Rock-verified 2026-06-25** — the
drop migration applied and all verifiers pass (see the 2026-06-25 entry above for the result + the
migration gotchas). The runbook below is retained for reference / future collection drops.

**What was removed (deleted files).** `collections/LessonBundles.ts`;
`endpoints/{exportBundle,exportStatus,previewBundle}.ts`; `generator/generateForBundle.ts`;
`jobs/generateArtifact.ts`; `hooks/{bundleIntegrity,generatable}.ts`; and the obsolete scripts
`generate-bundle`, `publish-bundle`, `publish-drafts`, `wipe-bundles`, `migrate-bundles-to-versions`,
`verify-migration` (one-shot Stage-1 proof — its job is permanently done; `roundtrip-regression`
remains the standing fidelity gate). Pruned the now-dead exports from shared modules:
`authorizeExportRequest`/`bundleScope`/`findReadableBundle`/`assertExportable` and the five
`lessonBundle*` collection-access fns (`access/bundle.ts` now holds only the shared field-access
helpers `canEditProse`/`canEditStructure`/`systemOnly`).

**Three things the cutover surfaced that the plan had to handle:**
1. **Shared content fields.** `LessonBundleVersions` reused `LessonBundles.fields`, so the META/UNIT/
   LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE field groups (+ `resourceLink`/`rowLabel` helpers) were
   extracted to `fields/lessonContent.ts` (the sole home now); the version collection imports
   `lessonContentFields`.
2. **Upload re-homed, not deleted.** The web ingest endpoint (`uploadBundles.ts`) and its
   `UploadBundles` panel were mounted on `lesson-bundles`; the core (`ingestItems`) already writes
   plans+versions, so both moved to `lesson-plans` (`POST /api/lesson-plans/upload`, panel above the
   Lesson Plans list). Chosen over the versions collection because import creates a *plan*.
3. **The generator was typed to the vanishing `LessonBundle` type.** Dropping the collection removes
   `LessonBundle` from `payload-types.ts`. The generator/adapter/preview chain (`adapter.ts`,
   `previewBundle.ts`, `generateForVersion.ts`, `previewShared.ts`) was retyped to
   `LessonBundleVersion` — the surviving, content-identical shape — which also DELETED the transitional
   `as unknown as LessonBundle` casts from Stage 2a. Cleaner end-state, not just a port.

**Follow-on simplifications (the second consumer is gone).** The `PreviewBundle`/`ExportBundle`
controls dropped their `basePath`/`publishedGate` clientProps (hardcoded to the version endpoints; a
version has no published gate); `previewShared.ts` and `fieldSplit.ts` doc comments updated to
single-owner. RBAC: `verify-rbac.ts` was rewritten to the People/Curriculum rules it UNIQUELY covers
(SubjectGrade displayName, ≤1-subject-admin auto-demote, password/assignment guards); its bundle
field-split + draft/publish-versioning assertions were dropped because the Official-version model's
field-split/immutability RBAC is covered by `verify-stage2b-edit`. `adapter-fidelity.ts` kept as the
byte gate (retyped; its obsolete draft/published export-gate check removed).

**Verification.** Local: type-check clean, lint warnings-only (pre-existing patterns), unit 19/19.
**Rock (2026-06-25): DONE** — drop migration applied + all verifiers green (see the 2026-06-25 entry).

**Drop migration — Rock runbook** (schema change → generate ON THE ROCK, Node 22; local payload CLIs
break on newer Node — same pattern as prior migrations). NOTE: the generated `up()` needed hand-edits
before applying — see the 2026-06-25 entry's two gotchas (`IF EXISTS` on drops + DELETE stale job rows):
```
git pull
docker build --target deps -t lesson3-deps ./app
docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app --env-file .env \
  lesson3-deps npx payload generate:types          # LessonBundle type drops out; commit payload-types.ts
docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
  -w /app --env-file .env lesson3-deps npx payload migrate:create drop_lesson_bundles
#   → REVIEW the generated up()/down() before applying. It should DROP the lesson_bundles tables
#     (+ its _v versions/locks/rels). Confirm it does NOT touch lesson_plans / lesson_bundle_versions.
#     Make it idempotent (IF EXISTS); commit it.
docker compose up -d --build                        # one-shot `migrate` applies it, then `app` starts
```

## 2026-06-24 — Stage 2b finish: admin Preview/Export controls cut over to versions

> **Partially superseded by the Stage 3 entry above (same day).** The `basePath`/`publishedGate`
> clientProps and the `as unknown as LessonBundle` cast described below were REMOVED in Stage 3 when
> `lesson-bundles` was retired (the components hardcode the version endpoints; the generator is typed
> natively to `LessonBundleVersion`). The decisions here are kept as the record of what was built then.

**Decision.** The admin edit-view **Preview** and **Export** controls now run on the
`lesson-bundle-versions` working-copy editor (where Edit→fork lands the user), not only the legacy
`lesson-bundles` edit view. This closes the Official-version cutover bar Stage 3 (retire
`lesson-bundles`).

**What changed.**
- New **version preview endpoints** (`src/endpoints/previewVersion.ts`), mounted on
  `lesson-bundle-versions`: `GET /:id/preview` (stored version) and `POST /:id/preview` (current
  UNSAVED working-copy form state). The version-model counterpart of `previewBundle.ts`, minus the
  draft/published axis (every retained version is a valid snapshot — `findReadableVersion`), rendering
  by casting the version across to the sibling bundle content shape (as `generateForVersion` does).
- The preview **page shell + CSP + completeness gate + error semantics** (`renderPreviewResponse`)
  and the **unsaved-POST body parse + size limit** (`parsePreviewCandidate`) were extracted to
  `src/endpoints/previewShared.ts` so the bundle and version preview paths can't drift on what a
  preview looks like, how an incomplete/failed render is reported, or the `data`-field validation.
  The per-endpoint remainder (the readable-doc loader and the overlay + field-split hook, which
  genuinely differ) is intentionally NOT shared — `lesson-bundles`/`previewBundle.ts` retire in
  Stage 3, so a higher-order `handler(loader, hook)` seam would only complicate that deletion.
- POST-unsaved security mirrors the bundle path: edit-authority gate (`isEditorFor`) THEN the real
  version field-split (`enforceVersionFieldSplit`) on the posted overlay — an Editor previews only
  what they could save; a structural change → `Forbidden` → 422. Preview persists nothing, so it does
  NOT enforce version immutability (saving an Official version is separately rejected).
- The two admin controls were **parameterised, not duplicated** (chosen over version-only twins):
  `PreviewBundle`/`ExportBundle` gained `basePath` (default `lesson-bundles`) and `ExportBundle` a
  `publishedGate` clientProp. Versions mount them with `basePath: 'lesson-bundle-versions'` +
  `publishedGate: false` (no published gate — every version is inherently exportable, SPEC §9). Same
  registered components → no importMap change. Names kept as-is despite now serving versions; renaming
  is churn + importMap regen — defer to Stage 3 cleanup.

**Verification.** Local: type-check + lint clean, unit 19/19. **Rock-verified 2026-06-25:**
`verify-stage2b-preview` **7/7** (saved-render non-empty, editor prose applied / admin+structure
reverted, cardinality change rejected, teacher has no edit authority).
Export-on-versions is already covered by `verify-stage2-export`. **Test gap (follow-up, non-blocking):**
`verify-stage2b-preview` bypasses HTTP, so the new `parsePreviewCandidate` formData→JSON→size→shape
path is not yet exercised — a small unit test on its 400/413 error cases would close it.

## 2026-06-24 — Stage 2b edit model: working-copy (fork on Edit, mutable until Official)

**Decision (supersedes the earlier "edit-in-place, fork on first save").** Editing works on a
mutable **working copy**, not per-save snapshots:
- An **Official** version is **immutable** (frozen).
- Clicking **Edit** on a version creates ONE new **Not-Official working version** (a content copy,
  semver patch-bumped, `sourceVersion` = the edited version) and opens it in the admin editor.
- A Not-Official version is **mutable** — subsequent saves update that same working version (no
  version explosion). When a Subject/Site Admin **marks it Official**, the plan's `officialVersion`
  pointer moves to it and it becomes frozen.

**Why the change.** Payload's admin edit view is bound to one document; a save is an `update` on that
doc. "Fork on first save" would require a hook to transparently turn an update into a *new* document
and redirect the admin UI — fragile machinery fighting the framework. The working-copy model is
Payload-native (fork is an explicit create-then-edit), avoids one-version-per-keystroke, and matches
how editors actually work (draft until ready, then publish-as-Official).

**Implementation — as built (`d18a544` admin slice; `a774273`/`36e9500` Editor slice):**
- Immutability enforced by `enforceVersionImmutable` (`beforeChange`): rejects updates to a version
  that is currently its plan's `officialVersion` (not via access `Where`, which can't express "not
  this plan's pointer" across all rows).
- **Field-split for Editors (Editor slice).** The Editor whitelist was factored OUT of
  `enforceBundleStructure` into a shared pure `applyEditorFieldSplit` (`hooks/fieldSplit.ts`),
  parameterised by which TOP-LEVEL keys an Editor may influence — the one bundle-vs-version
  difference (a bundle has `semver`/`bumpType`/`lockVersion`/`_status`; a version doesn't). Both
  collections now delegate to it; the bundle path is behavior-identical (`verify-rbac` stays 36/36).
  `enforceVersionFieldSplit` applies it on versions.
- `lessonBundleVersionUpdate` access is **editor-scoped** (Editor/Subject Admin for their grades; Site
  Admin all) — the field-split limits an Editor to prose. `lessonBundleVersionCreate` is **admin-only**:
  the fork copies the source via `overrideAccess` (a trusted faithful snapshot, not Editor-authored
  input), so Editors never create a version directly — which would let them set admin-only fields on a
  brand-new row where the whitelist has no original to protect.
- **Edit** affordance on the detail page (**Editors + admins**) → `POST /:id/fork` (Editor-or-admin
  gated) creates the working version and returns its admin URL. **Make Official** (**admins only**) →
  `POST /:id/make-official` sets `LessonPlan.officialVersion` only (no content copy);
  `canSetOfficialVersion` + `validateOfficialVersionPointer` gate/validate it.
- **Retention guard** (`enforceOfficialNotDeletable`, `beforeDelete`): the Official version cannot be
  DELETED (would orphan the plan pointer / lose the canonical snapshot). Not-Official working copies
  stay deletable so a Site Admin can prune abandoned forks; to delete the Official one, move the
  pointer first. (Update-immutability alone left Official versions delete-able — closed here.)

## 2026-06-24 — Stage 2a: teacher read/view/export cut over to the version model (deployed + verified)

**Done.** Browse, detail, content-preview and download now read `lesson-plans` + `lesson-bundle-
versions` instead of legacy `lesson-bundles`. Teachers get the Official version by default with a
`?version=` selector for all retained versions. Deployed to the Rock (`0d4a49a`) and verified.

**Key design choice — generator-agnostic artifact cache.** Rather than maintain the export chain
twice during the transition, the cache key was genericized from `bundleId`+`lockVersion` to an opaque
`scope` string (`version:<id>` for immutable snapshots — no cache-buster needed — or
`bundle:<id>:<lockVersion>` for the legacy path). `produceArtifacts` no longer fetches/generates; the
caller passes the already-generated DOCX + filePrefix, so one cache serves both paths. This let the
teacher path move to versions while the admin/bundle export machinery kept working untouched.

**Other choices:** `generateForVersion` has NO published gate (a version is immutable and already
passed `enforceBundleVersionGeneratable` at create). A second job (`generateVersionArtifact`) keys on
the immutable version id, so the bundle path's lockVersion-drift race cannot occur. Version export
endpoints (GET serve / POST prepare / status) mount on `lesson-bundle-versions`, preserving the
audit-#3 GET/POST split. Detail route id is the PLAN id (`/lessons/<planId>?version=`); old
bundle-id links break (acceptable, non-production).

**Verified on the Rock:** roundtrip gate 3/3 byte-identical vs the approved DOCX (proves
`generateForVersion`); teacher read verify 13/13 plans visible + browse rows + detail-generate
(`verify-stage2-reads.ts`); export produce→cache→zip for DOCX (41 KB) + PDF (118 KB via Gotenberg)
(`verify-stage2-export.ts`); endpoints 401 unauth / 307 redirects / 403 APIs, no 500s; app boots clean.
Also fixed `roundtrip-regression.ts`, which had silently broken when ingest moved to plans/versions.

**Deferred to the next slices (Stage 2b / 3):** edit-in-place fork-on-save + admin Preview/Export
component cutover; Make-Official UI; retiring `lesson-bundles`. During the transition admin editing
still uses the legacy bundle editor, so admin edits and teacher views can diverge (consistent with
the model: edits make new versions; Official doesn't move automatically).

## 2026-06-24 — Stage 2: new-model reads stay open to all authenticated (teachers see all subjects)

**Decision.** On the new Official-version collections, ANY authenticated user may READ every
`lesson-plan` / `lesson-bundle-version` (the existing `Boolean(user)` access on `lessonPlanRead` /
`lessonBundleVersionRead` is correct and stays). WRITES remain subject-grade-scoped (create/update/
delete + the `officialVersion` pointer) — those rules already exist and are unchanged.

**Why (and a reversal).** A subject-grade-scoped read was briefly considered ("teachers see only
their associated subject-grades"), but a plain Teacher has **no** subject-grade association (the only
assignment roles are `editor` / `subjectAdmin`), so scoping reads would make teachers see *nothing*
unless a new view-only association role were added. We chose NOT to add that: teachers keep
cross-subject read, matching legacy intent (where a Teacher could read any published bundle across
all subjects). Two properties make `Boolean(user)` the faithful translation of that intent:
- **No draft/published gate on versions.** Legacy scoping existed mainly to hide *drafts* from
  teachers (`or: [published, subjectGrade in scoped]`). A retained version is immutable and already
  passed `enforceBundleVersionGeneratable` at create, so there is no draft to hide.
- **Official is a default/trust marker, NOT an access/export gate.** Within everything they can see,
  users may view/export every retained version (Official or not).

Other Stage-2 forks locked the same day (see NEXT-SESSION): detail URL `/lessons/<planId>?version=`
(Official by default), and Edit = edit-in-place / fork-on-first-save into a new Not-Official version.

## 2026-06-24 — Stage 1: backfilled the 13 legacy bundles into the Official-version model

**Decision.** The Official-version schema + ingest write path were live but the 13 pre-existing
**published** `lesson-bundles` (ids 63–75: 10 Biology @ SG 30, 3 Math @ SG 31) had no Plan/Version,
so the new read/export paths had no data. Backfilled them with a one-shot, idempotent migration
(`scripts/migrate-bundles-to-versions.ts`) that mirrors ingest's Phase-2 write block exactly: per
bundle, create `LessonPlan {title, subjectGrade}` → create `LessonBundleVersion {…content,
lessonPlan, semver:'1.0.0'}` → point `LessonPlan.officialVersion` at it, all in ONE transaction.

**How it stays faithful.** Content is the legacy doc minus version-metadata/internal keys
(`semver, bumpType, lockVersion, _status, createdAt, updatedAt, id`) with **all nested array-row
`id`s stripped** (those belong to the source rows; Payload regenerates them on create). The same
version hooks then run (`numberBundleVersionRows`, `enforceBundleVersionGeneratable`). Drafts are
NOT migrated — only published snapshots were ever Official. The run is idempotent (skips a bundle
whose `(title, subjectGrade)` already has a Plan), so a re-run after partial failure is safe.

**Verified (oracle-free, `scripts/verify-migration.ts`).** Generated all three CBE DOCX from each
legacy bundle AND its new version and diffed: **39/39 documents content-identical** (Resource column
excluded), including the 6/13 sub-strands that legitimately have no FE/ST ("both absent — OK").
`bio_1_4` ("CHEMICALS OF LIFE", bundle 66 → plan 10) matches, consistent with the standing fidelity
proof. Applied + verified on the Rock; legacy `lesson-bundles` left **untouched** (purely additive,
fully reversible). **Next:** Stage 2 cuts the read/export paths over to Plans/versions; Stage 3
retires `lesson-bundles`.

## 2026-06-24 — Audit #3 closed: GET `/export` split into serve-only GET + enqueue-only POST

**Decision.** The export endpoint that *enqueued* heavy work on a cold GET was both non-idempotent
and a cross-site enqueue vector (a bare `<img src=…/export>` would queue a job). Split by HTTP
method:
- `GET /:id/export` — serve-only. Warm → `200` zip; cold → `409 {state:'not_prepared'}`. It **never
  enqueues**, so it is idempotent and side-effect free.
- `POST /:id/export` — the only state-changing export op. Warm → `200 {state:'ready'}`; cold →
  enqueue `generateArtifact` + `202 {statusUrl}`. The per-user rate limit moved here (the enqueue).
- `GET …/export/status` unchanged. The client (`exportClient.ts`) now POSTs to prepare, then GETs to
  download (200 ready → GET; 202 → poll → GET). Both UI callers pass the same base URL, so no change.

**Why this is the CSRF fix.** Verified against installed Payload source: the auth cookie defaults to
`SameSite=Lax` (`collections/config/defaults.js`) and `Users.ts` doesn't override it. A cross-site
POST therefore carries no cookie → `req.user` null → `401`. So the only operation that drives the
queue is an authenticated *same-site* POST — no CSRF token machinery needed.

**Verified on the Rock (`9c9a701`, 2026-06-24):** cold POST → `202` → poll `ready` → GET `200`
application/zip (42 KB, correct filename); cold GET on an unprepared spec → `409` (no enqueue);
unauth POST → `401`; Teacher POST `/api/payload-jobs` → `403`. **Note:** unauth POST
`/api/payload-jobs/run` returned `404`, not the `401/403` the backlog predicted — harmless (the run
surface isn't exposed to an unauth caller, nothing runs/leaks), but the run path/handler differs from
what was assumed; confirm if revisiting the jobs surface.

## 2026-06-24 — Official pointer replaces draft/publish as product state

The product state is now **Official / Not Official**, not Payload **published / draft**. A lesson
plan has many retained immutable version snapshots and exactly one global Official version pointer.
Uploading valid ARES data creates version `1.0.0` and immediately points the Lesson Plan's
`officialVersion` at that exact snapshot. Later edits create new Not Official snapshots by default.
Site Admins and the matching Subject Admin may move the pointer to any retained version; moving the
pointer must not restore/copy content into a new version, because that would duplicate identical
documents under different semver labels. Teachers can view and export all versions; Official is the
default/trust marker, not an access or export boundary.

Implementation note: adding the new collections without a generated Payload migration made the Rock
admin fail at runtime (`relation "lesson_plans" does not exist`, plus missing lock-document relation
columns). The fix was the normal schema-change path: run `payload generate:types` and
`payload migrate:create official-version-model` on the Rock's Node 22 tooling, commit
`payload-types.ts`, `migrations/index.ts`, and `20260624_221905_official_version_model.{ts,json}`,
then redeploy so the one-shot migrate container applies it before the app starts.

## 2026-06-24 — UX batch: one login, consistent top-right menu, resources checkbox, admin polish

A second UX pass (with the user + external review) unified the auth/shell and the export controls.
Decisions + reasoning:

- **One login form.** Two surfaces (The App + `/admin`) each had a login; teachers can't use `/admin`,
  so the frontend `/login` is the single form. `/admin/login` now redirects to `/login` — chosen as a
  **`next.config.ts` `redirects()`** rule (fires at the routing layer before the admin routes resolve,
  so it can't 404). Two earlier attempts were rejected: a Payload **views.login override** (404'd —
  the `views` slot didn't reliably catch the login route) and **Next middleware** (worked but was more
  machinery than a static redirect needs — the open-redirect guard it justified was redundant with the
  login page's own sanitizer). Product call: **everyone lands on `/` after login, just like a teacher;
  admins click the header "Admin" link** — so the `?redirect=` return-path plumbing (`safeRedirect`,
  middleware) was deleted as gold-plating. Brand text `Lesson Plan Repository 3` → `Lesson Plan
  Repository` everywhere; the admin login Logo graphic was dropped (never rendered after the redirect);
  the frontend header is hidden when logged-out so `/login` is a clean splash.
- **One consistent top-right user menu on both surfaces:** username · [Admin|Lessons] · logout ·
  initials avatar (the cross-link shows the surface you're NOT on). Admin side injected via
  `admin.components.header` (renders top-of-page, gets `user` in serverProps). **One logout everywhere**
  — Payload's own nav logout is hidden (`custom.scss .nav__log-out { display: none }`). `Avatar` +
  `LogoutButton` are shared components, styled per surface. The custom dashboard's "Browse lesson
  library" action was removed (the header "Lessons" link covers it — closing the redundancy).
- **"Include ARES Resources" checkbox replaces Standard/Compact** everywhere (teacher view, admin
  export, admin preview). Standard/Compact only ever meant *with/without the Resource column*, and
  users work in one mode — so it's a single checkbox, **unchecked by default** (= compact = no Resource
  column), driving the view AND all downloads; the 4 teacher download buttons collapsed to DOCX/PDF.
  The boolean↔format mapping lives in one place (`lib/format.ts`); a shared `ResourcesCheckbox`
  dedups the two admin controls.
- **Admin legibility — and a trap.** Payload's `--base-body-size` is a **DIVISOR** for its spacing
  unit, NOT the text size — bumping it 13→14 *shrank* the admin (a regression we caught). The real
  lever is the rem root + body size: `html, body { font-size: 15px }` scales text + spacing uniformly
  (~15%) toward the 16px frontend. The nav mark slot (`.step-nav__home`) is a fixed **18×18px** box
  that clips text (a wordmark showed as "Le"/"LP"), so the mark is a small **SVG document glyph sized
  to 18×18**, not a cryptic monogram.
- **OPERATIONAL — importMap entries reproduced by hand (again).** Each new admin component registered
  by config path (`views.login`, `views.dashboard`, `components.header`, graphics) needs an
  `admin/importMap.js` entry, and the local `generate:importmap` CLI breaks on Node > 22. The entry is
  deterministic — `default_<md5(component-path-without-#default)>` — so it's reproduced locally and
  committed, keeping origin correct without a Rock regen. (See the 2026-06-23 entry for the scheme.)
- **e2e login helper** (`tests/helpers/login.ts`) updated for the single login: go to `/login`, fill
  the frontend form, wait for `/`; admin specs navigate to `/admin` themselves (shared cookie).

## 2026-06-23 — UI/admin redesign: strand-first Lesson Plans page, custom dashboard, nav rename

A multi-round UI pass (with the user + an external reviewer) replaced the arbitrary-feeling browse and
admin surfaces. Decisions + reasoning:

- **Lesson Plans page is strand-first and server-rendered.** Sub-strands are children of strands, so
  the page groups subject-grade → strand → sub-strand in **curriculum order** (`meta.substrand_id`,
  e.g. "1.4"), sorted **dotted-numeric** (`1.4 < 1.10`) — not alphabetical, not Payload default. The
  identifier `substrand_id` was already the stable bundle key; the strand is its first dotted segment,
  named by `unit.strand` (fallback `Strand N`). Labels use `meta.substrand_name`, dropping the
  denormalized shouty `title`; strand headings strip the stored `Strand N.M:` prefix so they read
  `Strand N: Name` (not `Strand 2 · Strand 2.0: …`).
- **Stacked sections over a master-detail two-pane** (the user preferred master-detail visually, but an
  external review flagged it as "custom app shell"). Stacked sections need **no client state** — one
  access-gated `payload.find` + JS grouping in a server component — so it's the lower-custom, more
  Payload-native choice, and it stacks multiple subject-grades naturally. Lesson counts come from a
  light `select: { lessons: { id: true } }` (no bodies). Search is modest **local JS filtering** over
  sub-strand number/name, strand, subject, grade (not a Payload nested `where`, not lesson-body text);
  it filters the already-fetched ≤200 set and will need to move server-side when pagination lands.
  Pure logic in `src/lib/substrand.ts` with a **DB-free** unit suite on its own `vitest.unit.config.mts`
  (`test:unit`) so the dotted comparator etc. run locally without the Rock; `test`/`test:int` untouched.
- **Admin dashboard: replace, don't fight.** Payload's default dashboard renders collection-card boxes
  that exactly duplicate the nav. Override **only** that view via `admin.components.views.dashboard`
  (sanctioned extension point) with a quiet, role-aware, **additive-only** landing (role/scope line +
  actions the nav lacks: public-library link, Site-Admin-only ingest) — never re-listing collections.
  **Rejected the new modular widget dashboard:** its only built-in widget is the same `CollectionCards`
  plus drag/config chrome, so a clean result would need custom widget components — *more* code for a
  worse fit. Styles live in `(payload)/custom.scss` (already wired by the scaffold), scoped to
  `.lp-admin-dash`, using `--theme-elevation-*` so they follow light/dark; type scale mirrors the
  Lesson Plans page. No global admin re-theme.
- **Nav: rename, because headingless isn't native.** A truly headingless flat nav is NOT a config
  option — Payload renders one heading per group, and **`admin.group: false` HIDES the item** (verified
  in `groupNavItems`), not flattens it; a custom `Nav` override would have to re-implement the
  account/logout menu (`SettingsMenuButton` isn't cleanly exported) — too custom/fragile. So the clean
  native fix is to **rename** the vague groups to plain words and reorder: Content/Taxonomy/Collections
  → **Lesson plans / Curriculum / People**, ordered by the `collections` array (first-seen wins).
- **Redundant column:** `title` is derived from `meta.titleDoc` at ingest, so both columns duplicated;
  `admin.disableListColumn` on `titleDoc` bars it from the list (incl. saved user prefs), edit form
  unaffected.
- **OPERATIONAL — importMap without a Rock push.** Registering an admin view (the dashboard) requires
  regenerating `(payload)/admin/importMap.js`, and the local `payload generate:importmap` CLI breaks on
  Node > 22 (tsx loader). Rather than depend on the Rock (which has no git push credential), the entry
  was reproduced locally: Payload names the identifier **`default_<md5(component-path-WITHOUT-#default)>`**
  (verified against an existing entry), so the import + map line are byte-identical to the generator's
  output and can be hand-committed. **Lesson:** when only a component path is added, the importMap entry
  is deterministic and can be written by hand if codegen isn't runnable locally.

## 2026-06-23 — Async-export correctness fixes (external audit findings #4/#5/#6)

A full external audit (GPT-5.5) of Phase 5 surfaced three correctness bugs in the async-export path,
now fixed (tsc/eslint clean; not yet runtime-verified on the Rock):
- **#5 temp-file collision** (`artifactCache.putArtifact`): the temp path was `${file}.${pid}.tmp`, so
  two concurrent jobs producing the *same* key (duplicate cold exports) shared a temp file and could
  clobber each other before rename. Now `${file}.${pid}.${randomUUID()}.tmp` (per-write unique).
- **#6 manifest-only readiness** (`exportArtifacts.isExportReady`): it checked only the manifest, but
  `loadCachedExportZip` requires every listed deliverable. If a deliverable was evicted while the
  manifest survived, status said "ready" then the download re-enqueued (looked like a failure). Now
  `isExportReady` verifies the manifest **and** every artifact exists (cheap `hasArtifact` existence
  checks — added to the cache — no byte reads).
- **#4 stale-lockVersion stuck poll** (`exportStatus`): a job caches under its enqueue-time
  `lockVersion`, but status recomputed readiness from the *current* bundle. A republish mid-job left
  the client polling forever. Status now compares the job's `input.lockVersion` to the current spec and
  returns **409 "bundle changed — retry"** on drift; and if the job `completedAt` but artifacts aren't
  present (evicted post-completion), returns **409 "expired — retry"** instead of spinning. The client
  already treats a status `state:'error'` as terminal, so no client change was needed.

**Deferred from the same audit:** **#3 (GET `/export` enqueues on cache miss → not idempotent; a
cross-site top-level navigation with SameSite=Lax could consume quota/enqueue work).** The fix —
make GET serve-only and move enqueue to a `POST /export` (SameSite=Lax blocks cross-site POST, so the
CSRF vector closes) + the matching client handshake change — is a client-contract change to the
headline feature, so it is held to pair with **runtime verification on the Rock**, not blind-shipped.
The remaining audit items (#2 deps, #7 CSP/sanitization, #8 optimistic concurrency, #9 GraphQL gating,
#10 endpoint tests, #11 pagination, #12 PDF-fidelity CI) are the already-tracked production-hardening
backlog (NEXT-SESSION #2–#9) — the planned next phase, not single-turn fixes.

## 2026-06-23 — Jobs surface locked down (external-review finding; Payload defaults are permissive)

An external review (GPT-5.5 audit) flagged that the Phase 5 job surface trusted that only the export
endpoint could enqueue `generateArtifact`, but **Payload 3.85.1's job defaults are open**. Verified in
installed source:
- the **run endpoint** (`/api/payload-jobs/run`) access defaults to **`() => true`** —
  `jobsConfig.access?.run ?? (() => true)` — i.e. callable **unauthenticated**;
- the **`payload-jobs` collection ships with no `access` block**, so it falls back to
  `defaultAccess = ({ req:{ user } }) => Boolean(user)` — **any authenticated user** could
  `POST /api/payload-jobs` to enqueue `generateArtifact` with an arbitrary `input`, **bypassing the
  export endpoint's read-gate AND the per-user rate limit** (forces Gotenberg/cache work for any
  bundleId; a Teacher still can't *download* a bundle they can't read — export/status re-gate — but
  the generation work runs).

**Fix (`payload.config.ts` `jobs`):** set `jobs.access.{run,queue,cancel}` to `isSiteAdmin`, and add
`jobsCollectionOverrides` setting the collection access to `read: isSiteAdmin`, `create/update/delete:
() => false`. **Why this is safe for the system path (verified in source):** the export endpoint's
`payload.jobs.queue(...)` and the `autoRun` runner both use the Local API's default
`overrideAccess: true`, and job-state writes go through `payload.update` (Local-API default
overrideAccess true) or `payload.db.updateJobs` (direct DB) — all bypass access control. So the gates
hit **only external REST callers**. No schema change (access fns only) → no migration; deploy is the
plain `git pull` + `up -d --build` path. **Lesson:** Payload's job system is open-by-default — any app
exposing it must set `jobs.access` AND lock the `payload-jobs` collection via `jobsCollectionOverrides`.

## 2026-06-23 — Phase 5 (readiness #1): artifact cache + per-user rate limit + Jobs Queue async export

**DEPLOYED + verified live on the Rock 2026-06-23** (commit `d3525c0`): cold export → `202` +
enqueue → `autoRun` runner produced + cached the artifact → status `ready` → warm export → `200`
zip with a valid PDF. Closes the "heavy generation is synchronous + unthrottled" top risk and
finishes the deferred async half of the PDF slice. Verified the Payload **3.85.1** APIs against
installed source before building (knowledge-currency rule): `jobs.tasks` + `jobs.autoRun` exist;
**Payload 3 has NO built-in `rateLimit`** (dropped from v2's Express server — confirmed absent in
`config/types.d.ts`), so the limiter is necessarily custom.

- **Artifact cache behind a seam** (`generator/artifactCache.ts`). Generation is content-stable, so
  bytes are cached by `(bundleId, lockVersion, format, kind, doc)` — **`lockVersion` is the
  cache-buster** (it bumps on every bundle update, so an edit/republish auto-invalidates). Bounded
  on-disk LRU (atomic temp+rename writes; oldest-by-mtime eviction over `ARTIFACT_CACHE_MAX_BYTES`).
  Deliberately NOT a Payload media/storage layer (SPEC §9 defers persistence); swappable for object
  storage later. Durable across `up --build` via a **`lesson3_artifact_cache` named volume** on the
  `app` service (a cache wiped every deploy is near-useless). A warm `?as=pdf` export now skips
  Gotenberg entirely (the 120s-timeout path).
- **Per-user rate limit** (`lib/rateLimit.ts`) on export + both preview verbs → `429 + Retry-After`.
  In-memory sliding window, keyed by user id. **Per-process** (not shared across replicas; resets on
  restart) — correct for the single-box Rock; must move to a shared store if ever horizontally
  scaled. This bounds the *request rate*; the queue `limit` bounds *concurrency* — both needed.
- **Jobs Queue async export** (`jobs/generateArtifact.ts` + `jobs` config). Defining the task creates
  the **`payload-jobs` collection → a migration** (generate on the Rock per the runbook). In-process
  `autoRun` cron (`*/3 * * * * *`, 6-field seconds — croner supports it; `_initializeCrons` is gated
  `!isNextBuild()` so it never fires during `next build`) with **`limit` as the GLOBAL concurrency
  cap** on heavy conversions. Export endpoint is now **two-phase**: warm → `200` .zip synchronously;
  cold → enqueue + **`202`** + a status URL. New `GET …/export/status?jobId=` reports
  preparing/ready/error (binds the job to the bundle so a jobId can't probe unrelated jobs). The job
  output carries **no bytes** — artifacts live only in the cache; a manifest entry written LAST is
  the "ready" sentinel. Shared `generator/exportArtifacts.ts` is the single source of cache keys +
  zip assembly for both the sync endpoint and the async job (they cannot drift).
- **Frontend follows the 202 handshake** (`components/exportClient.ts`): the admin Export button and
  teacher download links are now JS-driven (fetch → poll → blob download) with Preparing…/error
  states, because a plain `<a href>`/navigation can't follow a 202. No importMap change (these are
  ordinary ESM imports inside already-registered client components, not new component-path entries).
- **Typing around `TypedJobs`:** the task is typed by its I/O *shape* (`TaskConfig<{ input; output }>`)
  not its slug, which keeps it strongly typed regardless of regen. The `payload-jobs`/`jobs.queue`
  slug casts were needed only *before* the Rock ran `generate:types`; once `payload-types.ts` landed on
  `main` (it now knows the `payload-jobs` collection + `generateArtifact` task) a follow-up `/simplify`
  pass **removed those casts** and switched the status endpoint to the real `PayloadJob` type. **Deploy
  = schema-change path:** on the Rock, `generate:types` + `migrate:create` (commit both), then
  `up -d --build`. Two follow-ups noted: completed jobs are kept (no auto-delete) for failure
  visibility → periodic cleanup later; the status endpoint is unthrottled (cheap, but a generous
  limiter could be added).
- **`/simplify` cleanup (post-merge, 2026-06-23, tsc/eslint clean):** the export download + status
  endpoints share one `authorizeExportRequest` gate (`endpoints/exportAuth.ts`) so the read-access +
  published-only check and `ArtifactSpec` can't drift between them; the now-redundant `TypedJobs` casts
  were dropped (see above); `produceArtifacts` restored **concurrent** PDF conversion (`Promise.all`,
  capped at the ≤3 deliverables — a serial-loop regression vs the original endpoint); and `safePrefix`
  + the rate-limit `Bucket` type were de-duplicated to single sources. Behavior-preserving — re-run the
  cold→ready→warm export smoke-test on the next Rock deploy to confirm at runtime.

**Deployment traps hit on the Rock (both env/infra, not code) — fix for any new artifact-cache deploy:**
1. **Named-volume root ownership.** A fresh Docker named volume mounts its path **root-owned**, but
   the Next standalone image runs as **uid 1001 `nextjs` / gid 65533 `nogroup`** (the scaffold's
   `adduser` sets no `-G`, so the primary group is `nogroup`). So the app couldn't `mkdir`/write the
   cache → the job failed with `EACCES` and the export stayed stuck at `202` forever. Fix: the
   Dockerfile now `mkdir -p /var/cache/lesson3 && chown nextjs:nogroup` **before `USER nextjs`**, so a
   fresh volume initialises writable (a new named volume inherits the image dir's ownership). The
   existing Rock volume was `chown`ed live (persists in the volume). **Lesson: any writable named
   volume on this image must be pre-created + chowned to `nextjs:nogroup` in the Dockerfile.**
2. **Missing `ARTIFACT_CACHE_DIR`.** Without the env var the cache fell back to its in-image default
   `/app/.artifact-cache`, which the non-root user also can't create → same `EACCES`. The var must be
   in the Rock `.env` (`/var/cache/lesson3`) AND the container recreated (`up -d --force-recreate app`)
   for it to take, since `env_file` is read at container create. **Diagnosis tip: the job error names
   the exact failing path — `mkdir '/app/.artifact-cache'` vs `/var/cache/lesson3` instantly tells you
   whether the env var or the volume ownership is wrong.** Both are now in `.env.example` + this entry.

## 2026-06-22 — PDF export slice (§9): Gotenberg sidecar behind a `docxToPdf` seam

PDF export shipped as a first slice and is **live on the Rock**. The locked SPEC §9 constraints
(faithful / free / fully offline / self-hostable) were realised as decided on 2026-06-14.

- **PDF = convert the generated DOCX, never a parallel renderer.** The same "one source of layout
  truth" rule that limits the mammoth preview to *content*. We feed the generator's own DOCX bytes
  to a **local office engine** and return its PDF — so the PDF reproduces the approved DOCX exactly.
- **Engine = a Gotenberg sidecar** (`gotenberg/gotenberg:8`, multi-arch/arm64, offline), wrapping
  headless LibreOffice. Packaged as a **separate compose service**, **internal-only — no published
  host port** (same isolation posture as Postgres); the app reaches it at `http://gotenberg:3000`
  (`GOTENBERG_URL`). Keeps the app image slim; the ~GB office engine lives in the sidecar.
- **Seam = `src/generator/docxToPdf.ts`** — the *only* module that knows the engine
  (`POST /forms/libreoffice/convert`; throws `PdfConversionError` → the endpoint maps it to **502**,
  an upstream-service failure, not a client error). Callers depend on `docxToPdf(buffer) → buffer`,
  so the engine can be swapped if the fidelity test ever favours another, without touching export.
- **`?as=pdf` on the existing export endpoint** (default `docx`) — reuses the **exact same READ
  gate** (`findReadableBundle` + `generateForBundle`, published-only) then converts each of the
  three DOCX and zips the PDFs. No new auth surface. DOCX/PDF picker added to the admin Export
  button and the teacher `/lessons/[id]` download links. **No schema change → no migration.**
- **Synchronous first; Jobs Queue deferred (approved fallback).** A single sub-strand converts in
  a few seconds, so the slice ships synchronously; the async Payload Jobs Queue
  (`jobs.tasks` generatePdf + in-process runner + enqueue/poll) is the immediate follow-up, not a
  blocker. This let the live slice land without queue plumbing that can't be verified off-Rock.
- **Fidelity gate is the engine's go/no-go — written, not yet run.** `scripts/pdf-fidelity-check.ts`
  converts the approved bio_1_4 DOCX via the seam and pixel-diffs each page (`pdftoppm` +
  ImageMagick `compare`) against **Word's own DOCX→PDF** (same input both sides → pure converter
  fidelity, so the Resource-column caveat the *generator* test carries does not apply). Blocked on:
  ImageMagick on the Rock (poppler already present), 3 staged Word `*.oracle.pdf`, and a path to
  reach the port-less `gotenberg`. **Conversion itself is proven live** (Teacher `?as=pdf` → zip of
  3 valid `%PDF` docs); the gate measures *layout faithfulness*, which is the remaining evidence.
- **Verified on the Rock** (commit `9ef5ccc`): `gotenberg /health` → 200 on the compose network;
  authenticated `?as=pdf` export → 200 `application/zip` with 3 `%PDF` files. tsc 0 / eslint 0 /
  `docker compose config` clean.

## 2026-06-22 — §5 editor refinements: browser smoke-test ALL PASS on the Rock

The three §5 refinements (live-unsaved preview, teacher Standard/Compact toggle, array row labels)
were code-complete since 2026-06-17 but never clicked through with real role logins. Done now,
driven via the Chrome MCP over Tailscale with seeded Teacher + Editor logins — **all checks pass**.

- Teacher login at `/admin` → redirects to The App home (the 2026-06-22 redirect fix, in a browser).
- Teacher format toggle Compact↔Standard re-renders server-side (`?format=`).
- **`POST /:id/preview` is edit-gated:** Teacher POST → **404**, while GET → **200** (read-gated) —
  the deliberate verb split holds. Editor **unsaved** prose edit → Preview renders it (banner
  "UNSAVED EDITS"); the stored bundle was verified pristine afterwards (nothing saved).
- Editor **structural** change (6→5 lessons) → **422**; oversize (>4 MB) `data` → **413**.
- Shared `RowLabel` confirmed on every nested array: **Lesson N —**, **Phase N —**, **Section N —**,
  **Rubric row N —**.
- **Lesson — cosmetic follow-up:** lesson rows read "**Lesson 1 — Lesson 1 — …**" because `RowLabel`
  prepends `Lesson N —` while the stored `title` already begins with its own `Lesson N —`. The other
  arrays don't double (their source fields carry no such prefix). Fix later in `components/RowLabel`
  (strip a leading `Lesson N —` for the lessons array, or drop its number prefix). **Rule:** when a
  RowLabel's source field may already embed its own ordinal, the label's `noun N —` prefix can
  duplicate it — pick the prefix per array against the field's actual content, not uniformly.

## 2026-06-22 — Teachers redirected from /admin to The App (no "unauthorized" error)

A Teacher who authenticated against `/admin` (the admin login form, or a stale post-logout
cookie reopening `/admin`) hit Payload's hard **"this user does not have access to the admin
panel"** error. Teachers live entirely in The App (SPEC §2; DECISIONS 2026-06-14), so this is a
dead end. Fixed by **overriding Payload's built-in `unauthorized` view**.

- **Mechanism (verified in installed source).** On admin-panel-access denial, Payload's `RootPage`
  calls `redirect(handleAuthRedirect(...))`; for an *authenticated* user that targets
  `admin.routes.unauthorized` (`/admin/unauthorized`), which renders the default `UnauthorizedView`.
  `getRouteData` resolves a per-key custom view first (`getCustomViewByKey`), so
  `admin.components.views.unauthorized` overrides the built-in. This is the **single chokepoint**
  for every admin-access denial, so it covers all entry paths (login, stale cookie, direct nav).
- **Fix.** New server component `components/AdminUnauthorizedRedirect` = `redirect('/')` (The App
  home / lesson-plans browse). Server-side → no error flash. It only ever runs for a user who
  failed `canUseAdminPanel` (Teachers); every authenticated user can view `/` (`requireUser`).
  Registered via Payload's own `generate:importmap` (run on the Rock, Node 22) — the canonical
  basic method, so the committed `importMap.js` matches generator output and future regens no-op.
- **Why the view-override, not middleware.** A Next.js middleware can't distinguish a Teacher from
  an Editor: `roles` is `saveToJWT` but `assignments` is NOT, and `canUseAdminPanel` =
  `isSiteAdmin || assignments.length`. The decision needs the DB-backed user, which the
  Payload-rendered view already has. The view-override is also config-only, no new route.
- **Verified on the Rock** (curl with real logins): Teacher → `GET /admin` follows to
  `http://…/` (200, "Lesson plans"); Editor → `GET /admin` stays at `/admin` (200, "Dashboard").
  Admins unaffected. Test users seeded + deleted.

## 2026-06-22 — UNIT model fix + contract hard gate + clean corpus re-ingest (deployed)

Three converging tracks, all shipped and verified on the Rock. The interim UNIT model fix
(deferred since 2026-06-17) is done: the Sub-Strand Overview now renders end-to-end.

- **UNIT model (Track 3).** The `unit` group modelled only a dead `overview` stub (the generator
  never reads `unit.overview` — Section B reads `lesson.overview`), so ingest dropped ARES's now-
  populated `UNIT`. Replaced it with the **17 canonical UNIT fields** the generator's
  `subStrandOverview()` reads (`vendor/lib/sections.js`) and the contract declares: 5 short
  (`structureText`: gradeLevel/subject/strand/substrand/totalDuration) + 12 prose (`proseAdmin`:
  content/learningOutcomes/coreCompetencies/values/sep/pcis/careers/focus/drivingQuestion/
  phenomenon/supportingPhenomena/storylineThread). All admin-only — the `enforceBundleStructure`
  whitelist preserves the whole `unit` group wholesale for Editors (UNIT isn't in `EDITOR_INFLUENCED`),
  so no hook change was needed. Migration `add_unit_fields` (idempotent `IF [NOT] EXISTS` on both
  `lesson_bundles` + `_lesson_bundles_v`; drops `unit_overview`). **Proven:** `roundtrip-regression`
  3/3 on the Rock through the full DB path — **LessonSequence 381 → 408 blocks** (the +27 are the
  Sub-Strand Overview rows), FE 52 / ST 37 identical.
- **Contract → HARD GATE (Track 2).** Flipped the warn-only drift check to blocking: `ingestItems`
  pre-flight now throws on any non-empty `contractDrift(raw)` (all-or-nothing, like
  `validateGeneratable`). 13/14 upstream files conform (`f36d47c`); **chem_1_4 is rejected** until
  its string `LESSONS[].number` is coerced to integer — the gate doing its job (we deferred chem_1_4
  from the corpus accordingly). `contract-check` gained the string-number reject case (11/11).
- **Clean re-ingest (Track 3e).** Per the user: version lineage beyond 1.0.0 is disposable in early
  testing → **wipe + re-ingest fresh** (not in-place backfill). New `scripts/wipe-bundles.ts`
  (deletes all bundles incl. published, guarded by `--yes`; companion to `publish-drafts.ts` whose
  `--delete` refuses published). Wiped the 13 old empty-UNIT bundles → ingested the 13 conforming
  upstream files once (all passed the hard gate) → published. DB confirms all 13 carry populated
  UNIT (`unit_content`/`unit_storyline_thread`/`unit_learning_outcomes` non-null).
- **Fidelity oracle refreshed.** The Desktop/Rock oracle was stale (`UNIT={}`, May-30 DOCX with no
  overview). Re-staged from `upstream/main`: populated-UNIT `bio_1_4_data.js` + ARES's regenerated
  `Biology_Chemicals_of_Life_*` DOCX (`data/outputs/docx/Grade 10 Biology/Bio 1.4/`, confirmed to
  carry the overview rows; its `_data.json` UNIT is byte-identical to the data file). Oracle = the
  generator's own regenerated output (proves OUR pipeline matches the generator on the new data).

**LESSON — local `tsc` can't catch type errors from dropped/renamed Payload fields.** Dropping
`unit.overview` left a stale `unit: { overview: null }` literal in `scripts/adapter-fidelity.ts`.
Local `tsc` passed because **`payload generate:types` is blocked on local Node 25**, so the Mac's
`payload-types.ts` still had `overview`; the Rock's *regenerated* types removed it and `next build`
failed the type-check. Rules: (1) when dropping/renaming a Payload field, **grep the whole codebase
for the old name** before deploying; (2) to type-check against the real new types without a Rock
round-trip, **fetch the Rock-regenerated `payload-types.ts` and run `tsc` against it locally**
(done here — caught nothing further; all gates green pre-redeploy).

**Git flow note.** Types + migration are generated on the Rock (Node 22 + DB), but to avoid stranded
un-pushable Rock commits, their content was pulled to the Mac and committed to origin (`3b9a364`),
then the Rock `reset --hard origin/main`. **origin is the single source of truth; the Rock mirrors
it.** Verified on the Rock: migration applied (38 ms), `verify-rbac` 36/36, app up.

## 2026-06-17 — ARES data-contract: drafted, shared, and validated on every ingest

ARES (Mark) agreed to canonicalise their data output. Root cause of the blank Sub-Strand
Overview: 12/13 source files carry a rich `UNIT`, but our `unit` group was modelled as a stub
(`{overview}`) so ingest dropped it. We delivered our half of the offer — a contract + drift
validation — WITHOUT yet doing the interim UNIT model fix (still deferred).

- **Canonical schema is the single source of truth, co-located in the app.** Moved the drafted
  JSON Schema to `app/src/ingest/ares-contract.schema.json` (from `docs/`) so the validator
  imports it directly (`resolveJsonModule`) and Next bundles it — a relative import across the
  `app/` boundary is fragile. `docs/ARES-DATA-REQUEST.md` links to it there; it's both our
  validation source AND the artifact shared with ARES, so the two can't drift.
- **Hand-rolled subset validator, not ajv (`src/ingest/contract.ts`).** Only ajv 6 is present
  (transitive, draft-07) and the project pins deps deliberately; our schema uses a small fixed
  keyword set (type/required/properties/additionalProperties/items/enum/pattern/minItems/minimum),
  and hand-rolling lets us emit ACTIONABLE drift messages — alias hints (`UNIT.duration` →
  `totalDuration`) and typo hints (`slo.safety3otes` → corrupted `safetyNotes`). De-risked by a
  DB-less gate (`scripts/contract-check.ts`, 9/9: conforming→0 drift, null sections allowed, each
  drift class detected).
- **Drift is NON-BLOCKING (report, don't gate) — for now.** Current ARES output doesn't conform
  (that's the drift we report), so a hard gate would block ingesting the preliminary corpus.
  Wired into ingest pre-flight as a per-bundle warning (alongside `deliverableWarnings`), validated
  on the RAW UPPERCASE object the contract describes. Promote to a hard gate once ARES conforms
  (same staged approach as the FE/ST deliverable decision). `scripts/contract-drift.ts` prints the
  full per-file report — both a pre-ingest preview and the artifact we send ARES.
- **What the report found across the 13 files** (sent upstream): widespread `safetyNotes`
  corruption (`safety1otes`..`safety8otes` in 5 files), missing `META.titleDoc`/`substrand_id`/
  `substrand_name` in several, a missing `LESSONS[3].summaryTablePrompt.explained` (bio_3_1), the
  `duration`/`storylineThread` aliases + stray `UNIT.keyInquiry` (bio_2_1, math_*), bio_1_4's empty
  UNIT, and a universally-missing `schemaVersion`. Validates that the contract is doing its job.

## 2026-06-17 — Codex review of the §5 preview: POST authz/boundary hardened; triage

Codex reviewed the live-unsaved preview + editor refinements. No critical RCE/secret issue.
Fixed the three High findings (all in the new `POST /:id/preview`) + two Lows; the rest are
pre-existing/tracked. All fixes tsc 0 / eslint 0; DB-less gates still green (ingest 24/24,
adapter 5/5, format2, fidelity 3/3). **Behavioural verify is on the Rock** (`verify-rbac.ts`
covers `isEditorFor` + `enforceBundleStructure`; the round-trip script covers cleanup-exit).

**FIXED:**
- **#1 POST preview authz — was read-gated, now edit-gated.** My "equivalent to save-then-
  preview" claim was WRONG: a Teacher can read (and so could POST to) any *published* bundle,
  but cannot save — so read access let a non-editor drive the render path with arbitrary
  content. Rule: **unsaved preview is an EDITING affordance → require `isEditorFor` for the
  bundle's subject-grade** (Teachers → 404). GET stays read-gated (it shows only stored content).
- **#2 Field-boundary bypass — now reuses the save hook.** The whole-object overlay bypassed
  `enforceBundleStructure`'s editor whitelist, so an Editor could preview admin-only/structural
  changes they couldn't save. Fix: **call `enforceBundleStructure` (a pure, sync function)
  directly on the posted candidate** — Editor → prose-only overlay, structural change → 422,
  Subject/Site Admin → unrestricted. Reusing the hook (not a parallel whitelist) means preview
  and save can't drift — the key altitude point. The hook trusts that update-access already
  passed, which is exactly why #1's gate must run first.
- **#3 No payload cap — added.** Cap the posted JSON before parse/generate
  (`MAX_PREVIEW_JSON_BYTES = 4 MB`, 413). Full per-request body-limit + rate-limit + Jobs-Queue
  for generation stays the deferred production item (#2/#3 below).
- **#10 round-trip cleanup now fails the gate.** A self-cleaning gate that leaves rows behind is
  a failed gate (else CI/Rock silently accumulate state) — track cleanup failures, exit non-zero.
- **#9 RowLabel committed.** The new `components/RowLabel/` is part of the commit with its
  importMap entry (was untracked at review time).

**TRIAGED / pre-existing (NOT this session's regressions):**
- **#4 optimistic concurrency (`lockVersion` incremented but not checked)** — real, but
  pre-existing and already an open item; API/script updates can still clobber. Backlog.
- **#5 sanitize shared `docxToSections` HTML + add CSP to the teacher frontend route** — the
  same tracked XSS-hardening item (low exploitability today: prose is plain text, mammoth
  escapes; raise priority when Resource links land). The admin preview already sends a
  script-blocking CSP; the teacher Next.js route does not (needs an app-wide CSP strategy).
- **#6 FE/ST warn-only vs SPEC's three-documents** — the deliberate deferred decision (promote
  `deliverableWarnings` to a hard gate once the corpus is confirmed to always carry all three).
- **#7 dep advisories (vitest/postcss/esbuild, dev-tooling)** — backlog; deliberate pinned
  upgrade + re-run gates.
- **#8 no tests for POST preview authz/whitelist/limits** — fair. The logic is covered indirectly
  by `verify-rbac.ts` (roles + hook). Follow-up: add HTTP-level int tests (Teacher POST→404,
  Editor structural→422, oversize→413) — needs the cookie-auth + role-fixture harness the
  current `tests/int/api.int.spec.ts` lacks; deferred rather than shipped unrun (no local DB).

## 2026-06-17 — §5 editor refinements: live-unsaved preview, teacher format toggle, array row labels

Three §5 editor refinements (priority #2), code-complete + tsc/eslint clean; functional verify
is on the Rock (admin-component / endpoint / field-config changes → `up -d --build`, NOT a
script-only re-run). **No new stored fields, no migration, no payload-types regen.**

- **Live-unsaved preview.** Preview now reflects the editor's CURRENT form state — unsaved
  edits included — instead of only the latest saved snapshot. Added `POST /:id/preview`
  alongside the existing `GET` (`endpoints/previewBundle.ts`): same READ gate
  (`findReadableBundle(draft:true)`), then OVERLAYS the posted form values onto the stored
  bundle (pinning stored `id`/`_status` so the body can't spoof identity/exportability) and
  renders. Output stays HTML-only behind the same script-free CSP — rendering the caller's own
  posted content is **equivalent to save-then-preview**, so no new trust surface. The
  `PreviewBundle` control reads form state via `useAllFormFields` + `reduceFieldsToValues(.,true)`
  and submits a hidden transient `<form method=POST target=_blank>` so the new tab gets the
  endpoint's real HTML response (real CSP headers) — no fetch/blob round-trip. GET (saved) and
  POST (unsaved) share one `renderPreviewResponse` so they can't drift on gating/422/500/CSP.
- **Teacher format toggle.** The teacher inline view (`(frontend)/lessons/[id]`) gained a
  Standard/Compact toggle via a `?format=` **searchParam** (server-rendered, no client JS),
  matching the existing download links. Default stays **Compact** (the 2026-06-16 decision —
  Standard's Resource column is deferred/blank); Standard is available on demand.
- **Array row labels.** Collapsed rows for all five nested arrays (lessons, framework phases,
  FE sections, summary-table rows, rubric) now read "<noun> N — <first line of a field>"
  (e.g. "Lesson 1 — …", "Phase 2 — Observe Phase") instead of generic "Lesson 01". ONE shared
  client component `components/RowLabel` configured per array via `admin.components.RowLabel`
  `clientProps: { field, noun }`; falls back to "<noun> N" for an empty new row. **Lesson: one
  importMap.js entry covers all five** — the entry keys on the component PATH
  (`@/components/RowLabel#default`), not the call site, so reusing one component across many
  arrays needs a single hand-registered binding (generate:importmap still blocked on local
  Node 25). `PHASE_OPTIONS` has label===value, so the phase row label just shows `data.phase`
  — the component stays fully generic (`{ field, noun }`), no phase special-casing.

## 2026-06-17 — Repeatable round-trip regression (priority #1 DONE; 3/3 on the Rock)

The manual Phase-4 round-trip is now ONE self-cleaning command, run + green on the Rock.

- **New gate `app/scripts/roundtrip-regression.ts`.** Proves the *stored* path stays
  content-faithful (not just the DB-less `fidelity-spike`): seed-if-missing taxonomy →
  `ingestPaths(bio_1_4_data.js)` → 1.0.0 draft → publish → `generateForBundle('standard')` →
  `compareDoc` ×3 vs the approved DOCX (Resource column excluded for the SoW). Reuses
  `scripts/lib/docxDiff.ts`. **Result: 3/3 content-identical.** Runs fully in-process on the
  Rock — no Mac round-trip (the earlier Phase-4 proof pulled the DOCX to the Mac to diff).
- **Self-cleaning + non-destructive (the design rule for DB gates):** track every record the
  script creates and delete it in a `finally`, newest-first (bundle → SubjectGrade → Subject).
  Seed taxonomy only if absent and delete only what was seeded; ingest always creates a *fresh*
  draft, so the live published bundle is never touched. Cleanup runs on pass AND on crash, so
  re-running is always safe. (Same track-and-teardown pattern as `verify-rbac.ts`.)
- **Lessons (Rock script-run gotchas, both hit live):**
  1. **A script-only change must be committed + pushed before the Rock can run it.** The Rock
     bind-mounts `/srv/lesson3/app`; `git pull` only sees *committed* files — an uncommitted
     local script gives `ERR_MODULE_NOT_FOUND` for the `.ts` path. (Predicted, then hit.)
  2. **The approved DOCX + data file must be staged on the Rock** (e.g. `/srv/lesson3/out/
     ares-demo`) and pointed at via `ARES_DEMO_PATH`. They were Mac-only before this gate.
- **Invocation (deps-image + bind-mount + compose network, the established script-run line):**
  `docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules -w /app
  --env-file .env -v /srv/lesson3/out:/out -e ARES_DEMO_PATH=/out/ares-demo lesson3-deps
  npx payload run scripts/roundtrip-regression.ts`. Like the sibling gates, it's not a
  package.json script — the run command lives in the file header.

## 2026-06-16 — Preview layout: Compact default; HTML preview stays content-only (no width injection)

After deploying §5 and eyeballing real lessons in-browser, two layout decisions (don't re-litigate):

- **On-screen preview defaults to Compact.** The Resource column is deferred/blank, so Standard's
  HTML preview renders an **empty** column. Default both surfaces to Compact (the admin Preview
  keeps a Standard/Compact toggle; the teacher inline view is Compact-only — both export formats
  still download). Compact also gives the four content columns **equal** widths in the DOCX.
- **Do NOT inject fixed column widths into the HTML preview.** The browser's auto-layout makes the
  content columns uneven (sizes by text, ignoring the generator's DXA widths), which looks less
  balanced than the DOCX. We considered injecting the generator's `cw` proportions via a `colgroup`
  but **rejected it:** (1) it's cosmetic polish on the **content-preview tier**, which is explicitly
  *not* the faithful view; (2) it doesn't generalize — forcing the DOCX widths in **Standard** would
  reserve ~19% for the *empty* Resource column (worse, not better); (3) faithful layout/colour is the
  job of the future **PDF** (the *converted* DOCX), and the **DOCX export already has correct widths +
  colour**. Rule: the HTML preview is the fast content check; fidelity lives in the DOCX/PDF, never in
  a second HTML renderer (same single-source-of-layout-truth reasoning as the PDF decision).
- **Build gotcha (lesson):** the production `PAYLOAD_SECRET` fail-fast (#1) **broke `next build`** —
  build-time page-data collection runs with `NODE_ENV=production` but **without** the runtime secret
  (injected at container runtime via `--env-file`). Gate such runtime-only guards on
  `process.env.NEXT_PHASE === 'phase-production-build'`. Build-time config evaluation ≠ runtime.

## 2026-06-16 — §5 preview shipped; corpus published + deduped; Codex-review hardening

Three threads this session: the corpus went live, the §5 content preview shipped, and an
external (Codex) review was triaged.

**Corpus: 13 canonical published bundles (was 27 with duplicates).** The Rock had drifted
to 27 bundles — the Site-Admin web upload **dedups within a single request, not across
requests**, so re-uploading the same set created duplicate drafts (three waves on 06-14:
ids 36–47 and a verbatim 48–59, plus stragglers). Resolved by picking **batch B (48–59) +
bundle 33** (Chemicals, the fidelity oracle) as canonical — it already contained the only
pre-published members (33, 56, 59) so nothing had to be un-published — publishing its 10
remaining drafts and **deleting the 14 duplicates** (34–47). Result: one published bundle
per distinct sub-strand (10 Biology + 3 Math). New tool `app/scripts/publish-drafts.ts`
(`--list` / `--drafts` / id-list / `--delete`) did the batch work.
- **Correction — FE/ST presence:** a naive `--list` that checked field *truthiness* labeled
  all 13 as "FE ST", but the **generator's output is the truth**: **6/13 produce empty
  FE/ST** (the documented upstream gap). The field can be a non-null-but-empty group. Trust
  `generateBundleDocx`'s null buffers, not the stored field's truthiness.

**§5 content preview shipped (teacher + admin).** Teacher view now renders all three
documents (FE/ST omitted when absent). New **admin draft-capable preview** so an editor can
see saved-draft output before publishing. Design decisions:
- **Preview ≠ export — a separate HTML-only, draft-capable core.** `renderBundlePreview`
  (and the shared `docxToSections`) has **no published/exportable gate** — the deliberate
  difference from `generateForBundle`. It returns **HTML only, never DOCX bytes**, so it can
  never be an export bypass. Authorization is enforced at the endpoint
  (`findReadableBundle(draft:true)` — the read access rule still filters, so a Teacher can't
  reach a draft), exactly as the export endpoint does.
- **Incomplete-draft 422 reuses the publish gate.** The preview endpoint calls
  `validateGeneratable` (the same single-source gate `enforceGeneratable` uses) to return a
  **precise** "can't preview yet: <reasons>" (422); an unexpected throw *after* completeness
  passes is **logged and surfaced as 500**, not masked. (Fixes the first-draft blanket
  `catch` that turned every error into 422.)
- **Previews the latest SAVED snapshot**, not unsaved form state (live form-state preview is
  deferred — far bigger). Returned HTML page is **script-free + CSP-locked**; the frontend
  view relies on mammoth text-escaping (our prose is plain strings, no inline markup).

**Codex review — dispositions.** Fixed in-change: **#5** (blanket catch masking failures),
**#8** (`publish-drafts.ts` `process.exit(0)` overrode `process.exitCode` → false CI
success). Folded in as separate hardening: **#1** (fail-fast on missing `PAYLOAD_SECRET` in
production — was `|| ''`), **#10** (removed the dead `my-route` scaffold). **Deferred**
(pre-existing / already-tracked): #2 rate-limit/Jobs-Queue, #3 dep advisories, #6 FE/ST hard
gate, #7 official-version model, #9 CSRF posture (our preview is a read-only GET).
- **#4 XSS — kept as an open hardening item, not closed.** No *current* attacker-controlled
  HTML path (mammoth escapes text; our generated DOCX carries no user-controlled hrefs/
  images), but both preview surfaces *trust generated HTML*, so it stays a high-value
  hardening point. When the deferred **Resource-column links** land, sanitize in the shared
  `docxToSections` chokepoint (DOMPurify) — a deliberate dependency decision, declined for now.

**Calibration (lesson).** Two claims were corrected as overstated: "**Rock deploy** ≠
**production-ready**" (the Rock is a non-production verification environment; the audit's
production blockers stand), and the `validateGeneratable` happy-path invariant holds for
bundles **published via the normal hook**, not unconditionally (overrideAccess scripts /
legacy data / hook drift could violate it — the failure mode is a benign 422, not a crash).

## 2026-06-14 — PDF converter: open decision, but constraints locked (offline/free/faithful)

PDF output (and emailing/linking PDF + DOCX in the messaging platform) is confirmed in scope
(SPEC §9/§10). The converter is **not locked in**, but the constraints are:

- **Faithful** — must reproduce the generator's complex DOCX (40 tables, merged cells, shading,
  column widths). **PDF must be the *converted DOCX*, never a parallel renderer** (one source of
  layout truth — the same reason the mammoth view is a *content*-only preview). This **disqualifies
  semantic converters** (Pandoc, mammoth/HTML→Chromium/wkhtmltopdf): they reinterpret layout and
  won't match the approved DOCX. Good enough for a rough preview, not for the exact artifact.
- **Free — no paid/commercial product or service** (rules out Aspose/Apryse/Syncfusion/etc.).
- **Fully offline — no cloud** (rules out MS Graph convert and any metered API). Offline is a
  product goal; lesson content must not leave the box.
- These three together → the viable class is a **local office engine** (LibreOffice headless, or
  OnlyOffice/Collabora). There is **no lightweight free converter** at this fidelity — the bulk
  (~0.4–1 GB; minimal headless Writer ~0.4–0.7 GB, full suite ~1 GB+; ~150–300 MB RAM/run, slow
  cold start) is intrinsic to faithful Word layout. Fine on the Rock's **NVMe**.
- **Preferred packaging:** a **sidecar container** (e.g. Gotenberg wrapping LibreOffice — multi-arch
  incl. arm64, offline) so the app image stays slim and the converter is isolated/poolable. PDF is
  slow → **Jobs Queue (async)**.
- **How the engine gets chosen:** by a **golden-file fidelity test** (Word's own DOCX→PDF as the
  oracle) on a real ARES lesson, when the PDF slice is built. Until then, code calls a swappable
  **`docxToPdf(buffer)`** seam so nothing depends on the specific engine.
- **Artifacts are addressable/version-pinned/access-gated** (bundle, version, document, format,
  layout) — stable URLs that resolve deterministically (generation is content-stable). Email
  attaches freshly-generated bytes; messages link the URL; persistence/caching is a later
  optimization (avoids reintroducing media storage now).

## 2026-06-14 — Architecture: a unified role-aware App for all users + `/admin` as back-office

Confirmed the product is **two front-ends over one Payload backend** (one runtime/auth/access):
**The App** — a role-aware front-of-house frontend (`app/src/app/(frontend)`) that *all four roles*
log into — and **Payload `/admin`** as the content/admin back-office. See SPEC §2 ("Two application
surfaces") + §10 (the now-confirmed cross-user workflows).

- **What forced the decision.** The user confirmed a set of features **common to every role**:
  browse/view/export, **email a document**, **internal messaging + notifications** (any user → any
  user, optional bundle link/attachment), **translation** (Swahili), and **AI features**. A
  teacher-only frontend would force duplicating those across two apps (or making editors switch
  apps). So they belong in one shared App; `/admin` stays the editing/management console for
  Editors/Subject Admins/Site Admins.
- **Roles map cleanly to surfaces.** Teachers (the majority) live *entirely* in the App
  (intentionally excluded from `/admin`). Editors/Subject Admins use the App for the common
  features and `/admin` for editing; Site Admins administer in `/admin`. The §13 minimal-UI
  principle governs the App's role-aware rendering (show only what the role can do).
- **Resolves prior open decisions.** SPEC §2 "editor placement" → start in `/admin`, optionally
  move editing into the App later (the §5 Phase-2 custom editor, now well-motivated). SPEC §10
  workflows (messaging/favorites/browse) → **confirmed in scope**, plus email-out, translation, AI.
- **No core-architecture change.** New surface = the already-scaffolded `(frontend)` route on
  Payload's API + auth; new features = ordinary Payload collections/endpoints/hooks + the Jobs
  Queue. Single runtime preserved. Outbound services (AI, email, translation) stay server-side,
  rate-limited (§11); AI uses the current Claude API/models.
- **Sequencing.** Phase 2+ track; does NOT block current `/admin` work (publish the uploaded
  drafts, §5 editing cleanup). Recommended first App slice: the teacher-critical path
  (browse → view → export — the majority's core need and the only surface that doesn't exist yet).

### Sample role logins for UI testing (2026-06-14)

Added `app/scripts/seed-users.ts` — creates one Teacher, one Editor, one Subject-Grade Admin
(Editor + Subject Admin scoped to Biology G10 by default) via the Local API, to exercise the
role-tailored UI. Credentials from env or randomly generated + printed once (no secrets committed);
idempotent (skips existing emails). Run on the Rock (needs a DB). Note: the Teacher login has **no
surface until The App exists** — it's created ready for that.

## 2026-06-14 — Admin session timeout: 15-min expiry + reliable idle-logout backstop

Auth `tokenExpiration: 900` (15 min) is the admin inactivity window (commit `d0cf69a`).
Investigated a report that the "Stay logged in?" modal lingered for a very long time and the
session seemed resurrectable. Traced through the installed Payload 3.85 source and confirmed
behavior on the Rock:

- **Server-side enforcement is sound — no security hole.** The auth cookie's `Expires` and the
  JWT `exp` are both `issuedAt + tokenExpiration` (`auth/cookies.js` `getCookieExpiration`;
  `auth/jwt.js`). `jwtVerify` (jose) rejects an expired JWT, and the `refresh-token` operation
  throws `Forbidden` without a valid `req.user` (`auth/operations/refresh.js`). So after 15 min of
  real time the session genuinely dies — confirmed: reloading/navigating past the window bounces
  to login. No `autoLogin` is configured (ruled out as a resurrection path).
- **The defect was client-side.** Payload's *proactive* auto-logout is a single `setTimeout`
  scheduled for the deadline (`providers/Auth/index.js`); browsers throttle/suspend timers in
  backgrounded or slept tabs, so an idle tab lingers past expiry and only clears "eventually" (on
  the next server interaction). Annoying, not a breach — a stale tab can't act once the token dies.
- **Fix — `IdleLogout` wall-clock backstop** (`app/src/components/IdleLogout`, mounted via
  `admin.components.providers`, so it's always inside `AuthProvider`). Uses Payload's own auth
  context (`tokenExpirationMs` + `logOut`): a 30 s interval (focused-idle tab → out within ~30 s)
  plus `focus`/`visibilitychange` (slept/backgrounded tab → out immediately on return). It never
  logs out an active user — `tokenExpirationMs` advances on every refresh (activity or clicking
  "Stay logged in"). It changes no server behavior; it only makes the tab terminate promptly.
- **General rule:** don't rely on a single client `setTimeout` for security-relevant timing —
  browsers suspend timers off-screen. Enforce server-side (already true here) and, for UX, check
  the wall clock on an interval + visibility/focus.

## 2026-06-13 — Site-Admin web upload for ingest (DEVIATION from SPEC §7 "no HTTP/upload surface")

The user asked for an in-browser upload to add bundles, Site-Administrator-only, with the
control hidden from everyone else. This **reverses** SPEC §7's original "ingest is … never an
HTTP/upload surface." Recorded as a deliberate, documented deviation; SPEC §7 updated.

- **Why it's now safe.** The original rule existed to prevent **executing uploaded `.js`** (RCE).
  Uploads are never executed: the web path is **JSON-only** (`JSON.parse` via `extractAresJson`).
  `.js` stays CLI-only. So the threat the rule guarded against doesn't apply to the web surface.
- **Authorization is server-side, not cosmetic.** `POST /api/lesson-bundles/upload`
  (`app/src/endpoints/uploadBundles.ts`) enforces `isSiteAdmin(req.user)` → 401/403; the
  self-hiding list panel (`app/src/components/UploadBundles`, `beforeListTable`, returns null
  unless `roles` includes `siteAdmin`) is convenience only. `roles` is `saveToJWT`, so the client
  check needs no fetch.
- **Guardrails:** JSON only (`.json` extension + content-type-agnostic safe parse), per-file 5 MB
  / 50-file caps, the same `validateGeneratable` + exact-match taxonomy gates as the CLI, and the
  same **all-or-nothing** transaction. Pre-flight failures → **422** with the actionable per-file
  message; nothing written. Bundles land as **drafts** — publish stays a separate step (no
  auto-publish from upload).
- **Shared core (no duplication).** Refactored `app/src/ingest/index.ts` to a single
  `ingestItems(payload, items)` where each item is `{ name, extract() }` (a thunk so parse
  errors aggregate in pre-flight). `ingestPaths` (CLI) and the endpoint both call it; the endpoint
  runs it as the trusted system path *after* the Site-Admin gate.
- **Verified:** `tsc` 0 / eslint 0; ingest gate 24/24; importMap hand-updated for the new
  component (the `payload generate:importmap` CLI is blocked locally by the 3.85.1/Node-25 tsx
  bug — entry added with Payload's exact `default_<md5(path)>` binding so a Rock regen is a no-op).
  **Endpoint + panel are runtime-tested on the Rock (need a DB).** TODO before real exposure:
  **re-run `security-review`** on this web ingest surface (SPEC §7 calls ingest the highest-risk
  surface; a web entry point warrants a fresh pass).

## 2026-06-13 — Ingest accepts `.json` exports as well as `.js` modules (SPEC §7)

ARES prefers JSON as the transport format (and its repo now emits `*_data.json` exports), so
ingest now reads both. Confirmed the two are equivalent before building: for the same
sub-strand the `.js` module and ARES's official `.json` export are **deep-equal** (verified
on bio_3_3 — same five groups, same fields, ~213 KB each; neither carries `framework[].resources`,
so JSON does *not* un-blank the Resource column — that's still ARES's build-time Python step).

- **Only the read step differs; everything downstream is shared.** New `extractAresJson(source)`
  in `src/ingest/extract.ts` is the `.json` sibling of `extractAresData`. `src/ingest/index.ts`
  picks by extension (`gatherDataFiles` accepts `.js`/`.json`; `extractDataFile` branches), then
  feeds the same `rawToBundle → validateGeneratable → create` pipeline. Proven: a real clone
  `.json` → `extractAresJson` → `rawToBundle` is deep-equal to the `.js` path (0 validate problems).
- **Security: no new execution surface.** `JSON.parse` only yields data — there is no
  parse-never-execute concern as there is for `.js`. We still apply the structural guards the
  `.js` path enforces, for parity: reject a non-object root, **recursively reject `__proto__`
  keys** (JSON.parse makes `__proto__` an own property rather than polluting the prototype, but
  we reject it so downstream spread/assign can't be surprised), and require the five top-level
  groups.
- **CLI unchanged in spirit** — `payload run scripts/ingest.ts -- <file.js | file.json | dir>`;
  a directory ingests every `.js`/`.json` in it. (Pointing at a dir holding BOTH a `.js` and a
  `.json` for the same sub-strand would create two bundles — ingest has no dedupe; in the ARES
  clone the two live in different dirs so this doesn't arise.)
- **Verified:** `ingest-extract-check.ts` extended to **24/24** (round-trip JS↔JSON parity +
  the three reject guards + accept-valid); `tsc` 0 / eslint 0.

## 2026-06-13 — Payload 3.85.0 → 3.85.1 (deliberate patch bump)

Took the 3.85.1 patch after reviewing the changelog (none of the seven fixes touch us —
they're upload-collections / import-export-plugin / conditional-tabs / TS6 areas we don't
use). Bumped all six pins (`payload` + `@payloadcms/{db-postgres,email-nodemailer,next,
richtext-lexical,ui}`) to exact `3.85.1`; transitive `@payloadcms/{drizzle,graphql,
translations}` followed. Verified locally: `tsc` 0, eslint 0, **fidelity 3/3**, **format2
7/7** — the fidelity-critical chain is intact.

- **Caveat (dev-env only) — `payload generate:importmap`/`generate:types` fail locally on
  Node 25.** 3.85.1 bundles `tsx@4.22.4`, whose loader throws
  `ENOENT … node:path?tsx-namespace=…` under **Node 25** (my local). It works on **Node
  22.17.0** (the Docker base, `app/Dockerfile`) — so the **Rock is unaffected** (build,
  migrations, `payload run` scripts all run on Node 22). Our own DB-less gates use the
  project's `tsx@4.21.0` devDep and are fine. **Not worked around:** an `overrides: { tsx }`
  pin (a) didn't re-resolve payload's nested copy cleanly and (b) would impose a tsx pin on
  the Rock to paper over a local bleeding-edge-Node issue — wrong trade. To run those two
  CLIs locally, use Node ≤23 (or the deps Docker image); otherwise they run on the Rock.
- **Deferred-to-Rock verification (unchanged from prior workflow).** `generate:types`,
  `generate:importmap`, and `next build` run on the Rock at deploy (Node 22). `next build`/
  `test:int` were already Rock-only (need a DB). The committed `importMap.js` and
  `payload-types.ts` are valid as-is — a patch with no schema/field change on our side
  doesn't alter generated output, and `tsc` passes against the committed types under 3.85.1.
  If `generate:types` yields a diff on the Rock, commit it.

## 2026-06-13 — Second LessonSequence DOCX format (compact, no Resource column)

Added a **second LessonSequence layout**, selectable per-export, alongside the existing
(now-named `standard`) one. The new `compact` format addresses two complaints with the
upstream layout: the narrow first column wrapped phase names mid-word, and the Resource
column rendered blank (the Python recommender is out of scope — see the 2026-06-08/09
resource decisions). Only **Section C** ("C. Lesson Implementation Framework") differs;
FinalExplanation and SummaryTable are identical across formats.

- **What changes.** `standard` Section C = 6 columns `[900, 2300, 2556, 3324, 2300, 2300]`
  with the (blank) Resource column. `compact` = 5 columns, Resource **removed**, widths
  `[2261, 2854, 2854, 2854, 2857]` DXA — Phase fixed at **1.57″ (2261 DXA)**, the other
  four split the remaining content width evenly so the row sums to exactly **13680 DXA**
  (no overflow). The four flex widths are *derived from* the vendored content width `W`
  (`floor((W − 2261) / 4)`, remainder on the last column), so they track any future margin
  change automatically.
- **Width reasoning (recorded so it isn't re-litigated).** Page is landscape US Letter
  (15840 DXA wide). The generator **overrides** margins to 0.75″ (1080 DXA), giving a
  **13680 DXA (9.5″)** content area — *wider* than docx's default 1″ margins would
  (`docx@9.6.1` `sectionMarginDefaults` = 1440 all round → 12960 DXA / 9.0″). The user's
  first instinct (four 2.00″/2880-DXA columns) overflowed by ~0.07″; at the kept 0.75″
  margins, even columns land at **1.98″ (2855 DXA)** and fit exactly. Chosen:
  keep 0.75″ margins, columns ≈ 1.98″. Phase column was explicitly kept at 1.57″.
- **Where the toggle lives — per-export parameter, NOT stored on the bundle.** Confirmed
  with the user. A format is a *presentation* choice; storing it on the versioned bundle
  would couple data to presentation and need a migration, against "edit the data, never the
  document" (SPEC §5). So `format: 'standard' | 'compact'` is a function/CLI argument
  (default `'standard'`), threaded `generateBundleDocx` → `generateForBundle` → the
  `generate-bundle` CLI `--format=` flag, and ready for the future §9 export/preview UI to
  pass per request. No schema change, no migration.
- **Vendored code stays byte-pristine.** Format 1 remains the pure vendored path
  (`vendor/lib/build_docs.js` → `sections.js`), so its fidelity is untouched — re-verified
  **3/3 content-identical** via `fidelity-spike.ts`. Format 2 is Lesson3-owned
  `app/src/generator/buildSowCompact.cjs`: a CommonJS bridge that **reuses** the vendored
  primitives (`docx_kit`) and unchanged section builders (`sectionA/B/D/E`,
  `titleBlock`, …), re-implementing only `sectionC` + the `buildSoW` wrapper. It is loaded
  via `createRequire` like the vendored generator; a one-file eslint override exempts it
  from the ESM-only `no-require-imports` rule (require() is correct for the CJS bridge).
- **LESSON — a CJS bridge file outside `vendor/` MUST be `.cjs`, not `.js`.** First written
  as `buildSowCompact.js`; it ran under `tsx` (which transpiled it) but **broke under
  `payload generate:importmap`** with "require is not defined in ES module scope". Cause:
  the app root `package.json` is `"type":"module"`, so a bare `.js` there is ESM; the
  vendored `.js` only load as CJS because `vendor/package.json` declares
  `"type":"commonjs"`. Node's native `require(ESM)` path (used by the Payload CLI, not just
  tsx) then loads the `.js` as ESM and `require`/`module.exports` are undefined. Fix: the
  `.cjs` extension forces CommonJS unconditionally. Rule: any new require()-style bridge
  module living under the `"type":"module"` tree gets `.cjs` (or its own
  `package.json{"type":"commonjs"}`).

### §9 export — first slice: web download with the format toggle (2026-06-13)

Wired the standard/compact toggle into the admin UI (the user's follow-up: "toggle from the
web interface, not just the CLI"). This is the first piece of SPEC §9 (export/sharing) —
there was no export endpoint or admin component before.

- **Output = all three DOCX as one `.zip`** (confirmed with the user), mirroring the CLI.
  `jszip` promoted from transitive to an **exact direct dependency (3.10.1)** — it's now
  runtime app code, so the Rock's `npm ci` must resolve it from the lockfile (same reasoning
  as the acorn promotion). The format only changes the LessonSequence; FE/ST are identical.
- **Endpoint = Payload collection endpoint** (`app/src/endpoints/exportBundle.ts`), mounted
  `GET /api/lesson-bundles/:id/export?format=standard|compact`. Payload-first: a native
  collection endpoint, not a hand-rolled Next route, so it gets `req.user` + the Local API.
  **Authorization lives here, by design** — `generateForBundle` fetches with
  `overrideAccess:true` (trusted system path, per its own security note), so the endpoint
  FIRST re-reads the bundle with `overrideAccess:false` + `user` to enforce `lessonBundleRead`
  (a Teacher can export only published bundles; an Editor only within their subject-grades →
  else 404). `NotExportableError` (draft) → 409; bad format → 400; no user → 401.
- **Admin control = client component** (`app/src/components/ExportBundle/index.tsx`) injected
  via `admin.components.edit.beforeDocumentControls`. `useDocumentInfo()` gives `id` +
  `hasPublishedDoc`: hidden on unsaved docs, disabled (with a "publish to enable" tooltip)
  when no published version exists. Download is a same-origin `window.location` GET so the
  admin auth cookie rides along; the attachment Content-Disposition downloads without
  unloading the edit page. Registered in the import map (`@/components/ExportBundle#default`,
  committed `importMap.js`).
- **Synchronous for now.** SPEC §9 mentions the Jobs Queue for long generations; a single
  bundle generates in well under a second, so v1 returns the zip inline. Promote to the Jobs
  Queue if/when batch or very large exports need it.
- **Verification.** `tsc` 0 / eslint 0; `generate:importmap` loads the whole config through
  the new endpoint→generator→`.cjs` chain (also how the `.js`→`.cjs` bug surfaced);
  standalone zip round-trip = 3 valid DOCX entries; both DOCX gates still green
  (fidelity 3/3, format2 7/7). Endpoint+button runtime-tested on the Rock (needs a DB).
- **Deploy delta.** Unlike the CLI-only change, this adds app-server code + a dependency +
  a component, so the Rock needs a full `docker compose up -d --build` (not `git pull` +
  re-run), and `npm ci` picks up jszip from the committed lockfile.
- **Verification.** New DB-less gate `app/scripts/format2-check.ts` (7/7): unzips
  `word/document.xml`, asserts compact Section-C grids are 5-col `[2261,2854,2854,2854,2857]`
  summing to 13680, standard stays 6-col with Resource, no cross-leak, and FE/ST
  **content** (document.xml) is identical across formats. Note: full-buffer byte-equality
  is *not* a valid assertion — `docProps/core.xml` carries a per-build timestamp, so
  "byte-stable regeneration" (SPEC §4) means *content*-stable; compare `document.xml`, as
  the fidelity gate already does via mammoth. `tsc` 0 / eslint 0; standard fidelity 3/3.

## 2026-06-09 — Phase 3: safe `.js → JSON` ingest (SPEC §7)

Built the ingest path on `main`: ARES `.js` data modules → stored bundles created as 1.0.0
drafts via the Local API. New code under `app/src/ingest/` (`extract.ts`, `toBundle.ts`,
`validateGeneratable.ts`, `index.ts`, `errors.ts`), the CLI `app/scripts/ingest.ts`, the
native publish hook `app/src/hooks/generatable.ts`, the shared phase vocab
`app/src/fields/phases.ts`, and the DB-less gate `app/scripts/ingest-extract-check.ts`.
Decisions (confirmed with the user at design time):

- **Ingest is DEV-ONLY, a CLI, never teacher-facing.** Run by the app developer or the
  lesson-plan author (`payload run scripts/ingest.ts`). No HTTP/upload surface, no upload
  RBAC — the SPEC §9 endpoint stays deferred. It is a trusted Local-API system call
  (`!req.user` → `enforceBundleStructure` treats it as the system path).
- **Safe extraction = static `acorn` parse, evaluate literals only, NEVER execute.** The
  untrusted-input contract (SPEC §0/§7): parse to an AST and statically evaluate ONLY pure
  data literals (string/number/bool/null/array/object, plus unary ± on numbers and
  zero-expression template literals). REJECT everything executable/dynamic — calls,
  identifier references inside data, member access, template-with-`${}`, spread, getters,
  `__proto__` keys. No `require`/`vm`/`eval`/`Function`. acorn@8.16.0 was already in the
  tree (via Next/Payload); promoted to an exact **direct** dependency. (`tsc`/`typescript`
  could parse too but acorn is the lighter, purpose-built ESTree tool.)
- **`acorn`-as-direct-dep lockfile sync.** acorn was already resolved at 8.16.0 in
  `package-lock.json` (transitive); adding it to root `dependencies` needed only
  `npm install --package-lock-only` (one-line lock diff, zero version churn) so the Rock's
  strict `npm ci` stays in sync. **No migration / no schema change this phase** (only hooks
  + validation + a dep — `generate:types` left `payload-types.ts` byte-identical).
- **SubjectGrade: EXACT `(Subject.name, grade)` match, require pre-existing, fail loud.**
  The `.js` META carries only `subject` (free text) + `grade` (int), not a SubjectGrade id.
  Resolve by exact name match (trimmed) — **no fuzzy matching** (a silent mis-assignment
  corrupts RBAC scope, worse than a clear failure). Missing taxonomy aborts with an
  actionable message listing existing subjects. **No `--seed`/auto-create** — keeps the
  curated junction-entity invariant (2026-06-09 SubjectGrade decision) pure; seed taxonomy
  first. A read-only **pre-flight** resolves/validates all files and reports every problem
  before any write; the actual writes run in **one all-or-nothing transaction**.
- **Ingested 1.0.0 is a DRAFT; an administrator reviews & publishes.** Lesson plans land as
  `_status: 'draft'` (not official, not exportable) until an admin publishes (SPEC §6).
  Teachers never upload and never publish — they view/export published bundles only.
- **Generator-completeness gate, built the Payload-first way (the export-correctness check
  Codex flagged).** Schema-required fields + publish status are NOT enough: the generator
  unguarded-dereferences `lesson.slo.purpose`, `lesson.summaryTablePrompt.observed`,
  `lesson.framework.map(…)` and reads `META.*` (verified in `vendor/lib/sections.js` /
  `build_docs.js`); FE/ST are fully guarded there, so they're not gated. `validateGeneratable`
  (a pure function, single source of truth) requires META + per-lesson `slo`/
  `summaryTablePrompt`/≥1-phase + every phase ∈ vocab. Wired three ways: (1) the ingest
  script rejects incomplete data pre-write (even as a draft); (2) a native `beforeValidate`
  hook `enforceGeneratable` throws a Payload `ValidationError` **when the write would be
  PUBLISHED** — so it surfaces in the admin UI and via the Local API, not just the export
  path; drafts may be incomplete WIP; (3) native `minRows: 1` on `lessons` + `framework`
  for inline admin feedback (skipped on drafts, which is fine — the hook is the authority).
  Export then trusts validated-in data. The adapter's array-coercion stays the type-safety
  backstop (it can't *crash*); completeness is content-correctness, enforced here.
- **GATE `app/scripts/ingest-extract-check.ts` (DB-less, 13/13).** (1) PARITY — static
  extraction of `bio_1_4_data.js` deep-equals `require()`ing it (execution used ONLY as the
  test oracle, never in the product path). (2) SAFETY — a non-execution canary (a benign
  top-level statement never runs) + eight adversarial modules (require-in-data, member
  access, template-with-expr, identifier ref, IIFE, binary op, `__proto__` key, undefined
  export) all rejected. (3) completeness assertions. By transitivity with the Phase-2
  adapter gate (which runs `require(bio_1_4)` → adapter → DOCX, 5/5), extract → DOCX is
  proven faithful. All gates green: extract 13/13, fidelity 3/3, adapter 5/5, `tsc` 0,
  `lint` 0 errors.
- **`security-review` DONE (Phase 3 task 4) — no qualifying findings.** Reviewed the
  extraction + orchestration: no `require`/`vm`/`eval`/`Function` on the product path; the
  literal evaluator's `default`-throw rejects every executable/dynamic node; query inputs
  (`META.subject`/`grade`) are type-guarded and flow only through Payload's parameterized
  ORM; CLI paths are trusted; a malicious `.js` can't self-publish (explicit `draft: true`
  + `rawToBundle` shape). DoS/resource-exhaustion is out of scope by policy.
- **Still TODO:** the true DB round-trip — ingest → stored 1.0.0 draft → publish →
  `generateForBundle` → diff vs approved — is Phase 4 (needs a DB; run on the Rock).

## 2026-06-09 — Transport format from ARES: JSON preferred (not `.js`+JSON, not DOCX)

ARES asked which format Lesson3 needs to **store, edit, and generate** lesson plans: the JSON,
the `.js`, or both. **Answer: the data once — JSON preferred. Not both; not the rendered DOCX.**

**Why one format suffices.** Transport (how ARES hands us a lesson) is separate from storage. At
ingest, Lesson3 extracts the data and keeps it as **structured JSON in Postgres** (native Payload
fields, versioned). Store/edit/generate all run off that stored JSON; the DOCX/PDF are
regenerated build artifacts. So the original file is only an ingest *seed* — needed once, in one
form. This is exactly SPEC §3 ("canonical storage format is JSON; ingest extracts the `.js`").

**Why JSON over `.js` (recommend ARES emit JSON going forward).**
- **Safety:** a `.js` module is executable code, so ingest uses a deliberate parse-but-never-run
  extractor (acorn AST, literals only — the RCE-avoidance machinery). **Pure JSON is inert** →
  `JSON.parse`, no risk surface, no AST walk.
- **No JS-only quirks:** JSON sidesteps the things we had to special-case in the `.js`
  (cross-line string concatenation `'a\n' + 'b\n'`, single-quoted/unquoted keys in the Math
  files, `//` comments). JSON is lossless for this data — the modules are pure literals.

**Not needed:** both formats (identical data, redundant); the generated DOCX/PDF (we reproduce
them byte-faithfully — proven for bio_1_4). **Shape unchanged:** `{ META, UNIT, LESSONS[],
FINAL_EXPLANATION, SUMMARY_TABLE }`, ideally with the resolved `resources` included (see the
resource-sourcing entry below).

**Our-side follow-up (small, when ARES switches):** add a **direct `.json` ingest path** beside
the `.js` extractor — `JSON.parse` → the SAME `rawToBundle` + `validateGeneratable` + Local-API
create. Keep the `.js` extractor for backward compatibility / mixed inputs. No schema change;
just an input-format branch in `app/src/ingest/`.

## 2026-06-09 — Resource column: source resolved resources FROM ARES (un-defer the rendering)

Reviewing the Phase-4 output, the user flagged the blank Resource column as a major fidelity
issue — a blank column makes the document look incomplete, even though the *links* are useless
to the offline-majority audience (the original deferral rationale, 2026-06-08). Extracted the
approved column to confirm what it holds: **per-lesson recommended resources** — a video and a
reading, each `title + source` + "Search ARES" links (e.g. *Gene Expression Essentials* / PhET;
*…DNA Codons* / MIT Blossoms). Verified this text is **NOT in our pipeline**: bio_1_4's framework
rows carry no resource field, and the vendored generator pulls the column from the `aresResources`
*module* (our blank shim), not from the lesson data. (Also: the recommender's matches are uneven —
a DNA video landed on the diet-themed Lesson 1.)

**Decision (user-chosen): source the resolved resource data FROM ARES**, carry it through ingest
via the existing `framework[].resources` seam, and render it via an updated shim — no live Python,
no DOCX back-extraction, generalises to every bundle. This refines (not reverses) the deferral:
we still don't run the recommender; we ingest its *output as data*. The two lighter options were
declined: (b) one-off extraction from approved DOCX (doesn't generalise, inherits mismatches),
(c) keyword-only "Search ARES" guidance (non-blank but not the real titles).

**Data contract requested from ARES (per lesson — resources render identically across a lesson's
phases):**
```
resources: {
  video:   { title, source, direct_url?, search_url },
  reading: { title, source, direct_url?, search_url }
}
```
Delivery: ideally embedded in the `.js` data files (a lesson-level `resources`, or on each
`framework[]` row), else a side JSON keyed by (substrand_id, lesson number). `direct_url` may be
dead/omitted (offline) — `title`/`source` are what make the column non-blank.

**Our-side work (scoped, PENDING the data shape — do NOT build speculatively):**
1. **Schema gap:** the current `resourceLink` is `{ title, direct_url, search_url }` — **add
   `source`** (a migration). Hold until ARES confirms the shape/granularity (per-lesson vs
   per-phase).
2. **Render:** rewire the Lesson3 shim `vendor/aresResources.js` (`buildResourceParagraphs` /
   `getAllPhaseResources`) to render the stored resources (the 📹 VIDEO / 📖 PDF / Source / Search
   layout) instead of a blank paragraph — still pure Node, no Python.
3. **Ingest:** already carries `framework[].resources` through (adapter tolerates populated or
   empty); confirm the inbound shape maps cleanly.
4. **Fidelity gate:** once resources render, the diff can *stop* excluding the Resource column for
   bundles that have resource data (or keep excluding where `direct_url`s differ run-to-run).

Open question to settle with ARES: **per-lesson or per-phase** resources? Rendered output is
per-lesson; model accordingly once confirmed.

## 2026-06-09 — Phase 4 DONE: bio_1_4 DB round-trip proven on the Rock (3/3)

Closed the full pipeline against the real Postgres DB on the Rock: seeded taxonomy (Biology
G10, Mathematics G10) → ingested `bio_1_4_data.js` via the CLI → stored 1.0.0 draft (id 33) →
published → generated the three DOCX → diffed vs the stakeholder-approved set. **3/3
content-identical** (LessonSequence 381 blocks, FinalExplanation 52, SummaryTable 37; Resource
column excluded). The architecture is validated end-to-end: edit-the-data → regenerate
byte-faithful documents, through ingest + Postgres + versioning + the generator.

Two bugs surfaced + fixed, one wrinkle flagged:
- **[FIXED, `f696214`] `payload run` tears the process down before async work finishes.** The
  script scaffolds ended with a detached `run().then(() => process.exit(0))`. `payload run` only
  `await`s the module's EVALUATION, then calls `process.exit(0)` unconditionally
  (`payload/dist/bin/index.js:53,76`) — so the first two ingest attempts exited 0, created 0
  rows, and printed nothing (silent no-op; both the "no output" AND "no data"). Fixed with
  top-level `await run()` (like `verify-rbac.ts`, which always worked) + an explicit trailing
  `process.exit(0)` (so it also exits under `tsx`, where getPayload keeps the DB pool open).
  Applied to `ingest.ts`, `generate-bundle.ts`, `publish-bundle.ts`. **Rule: any `payload run`
  script MUST top-level-await its work — never fire-and-forget.**
- **[ADDED, `afd6f80`] `scripts/publish-bundle.ts`** — Local-API publish (`payload.update`
  `_status: 'published'`, overrideAccess). The admin "Publish Changes" button is disabled on a
  pristine/unchanged draft (expected Payload behavior — the form must be dirty), so a scripted
  publish is the clean path for round-trips.
- **[NOT A BUG — corrected] The 1.0.0 → 1.0.2 semver was TWO publishes, not a double-bump.**
  Initially mis-diagnosed as a single publish double-bumping; the user clarified they ALSO
  published via the admin UI (after a trivial edit to un-grey the disabled "Publish Changes"
  button) in addition to the scripted `publish-bundle.ts`. So: ingest 1.0.0 → publish 1.0.1 →
  publish 1.0.2 — **one bump per publish**, which is exactly what `enforceBundleStructure` does
  (every `update` bumps). No fidelity impact (generator ignores semver). **Lesson:** don't infer
  a bug from a version number without accounting for every write that occurred.
  **Minor open question (not urgent):** the hook bumps even on a *no-op* publish (the scripted
  one changed no content yet bumped). If "mark official without editing shouldn't bump" is
  wanted, skip the bump when only `_status` changes — small refinement, the user did not consider
  the current behavior a problem.

Mechanics learned (Rock round-trip):
- **Scripts run via the deps image + bind-mount** (`-v /srv/lesson3/app:/app`), so a
  script-only change is `git pull` + re-run — **NO image rebuild**.
- **Generated DOCX must go to a bind-mounted host dir** (`-v /srv/lesson3/out:/out`, pass `/out`
  as the `generate-bundle.ts` outDir) or they vanish with the `--rm` container's `/tmp`.
- The Mac drives Rock steps over passwordless SSH; the **content diff** (mammoth→HTML→jsdom via
  `scripts/lib/docxDiff.ts`) runs on the Mac, comparing the pulled-back DOCX vs the approved set
  (`compareDoc(label, generated, approved, stripResources)` — strip=true only for the
  LessonSequence). Not yet wired as a one-command regression (see NEXT-SESSION).

## 2026-06-09 — Removed the unused `subjects.slug` scaffold field

`Subject.slug` ("URL-safe identifier, e.g. biology") was `create-payload-app`-style residue —
referenced **nowhere** in logic: ingest matches Subject by `name` (exact), RBAC / SubjectGrade
link by `id`, and there are no subject routes/URLs in scope (SPEC §8 = discipline only). It also
cluttered the Subject create form with an extra (optional, blank-able) field. Same call as the
2026-06-09 Media-collection removal. Removed the field + its `defaultColumns` entry; fixed the
one consumer (`verify-rbac.ts` test fixture). **Migration hand-authored** (no local Postgres to
run `migrate:create`): `20260609_170000_drop_subject_slug` — `DROP INDEX IF EXISTS
subjects_slug_idx` + `DROP COLUMN IF EXISTS slug` (`up` idempotent per the migration-gen
lesson), `down` restores column + unique index. The `.json` snapshot was derived from the prior
one by deleting `public.subjects.columns.slug` + `indexes.subjects_slug_idx` (only the `.ts`
runs at apply time; the snapshot keeps future `migrate:create` diffs clean), registered in
`migrations/index.ts` (sorts last). `generate:types` dropped `Subject.slug`. Gates: tsc 0, lint
0, ingest 18/18, fidelity 3/3, adapter 5/5. **Pending Rock deploy** — rides the next
`docker compose up -d --build` (safe; slug data is disposable/unused).

## 2026-06-09 — Corpus dry-run: `+` concat folding + FE/ST readiness map

Ran the real extractor + gates over all **13** corpus data files (`generators/data/*_data.js`
at SHA `529be40`, materialized read-only via `git show`) before Phase 4, to confirm
ingestability and which SubjectGrades to seed. Two findings:

- **Seed exactly TWO SubjectGrades: `Biology — Grade 10` and `Mathematics — Grade 10`.** All 13
  files are grade 10; subjects are `"Biology"` (10 sub-strands) and `"Mathematics"` (3). Seed
  those exact subject names (ingest matches on `Subject.name` verbatim). NB Math META differs
  in *syntax* (unquoted identifier keys + single-quoted strings, vs Biology's JSON-style
  double quotes) and *labels* (`col3Label`/`col5Label` = "Teacher Actions"/"Assessment
  Strategy") — the acorn extractor handles both syntaxes; `JSON.parse` would NOT (proves acorn
  was the right tool, not a regex/JSON shortcut).
- **`+` string-concat folding added (user-approved, `+` only).** 6/13 files (bio_1_1, bio_1_3,
  bio_2_1, all 3 Math) initially failed extraction with `Unsupported expression
  (BinaryExpression)` — ARES authors build long prose as `'a\n' + 'b\n' + …`. Extended
  `literalToJson` to **constant-fold `+`** (and only `+`) on operands that each evaluate to a
  string/number literal. **Security boundary unchanged:** both operands recurse through
  `literalToJson`, so a non-literal operand (`'a' + ident`, `'a' + call()`) still throws; a
  non-`+` operator (`6 * 7`) still throws. Gate updated: the old `reject: 1 + 2` case became
  `reject: '+' with a non-literal operand` + `reject: non-'+' operator` + a positive fold
  assertion. Now **18/18**, and **13/13 files extract + pass the hard gate**.
- **FE/ST readiness (validates the warn-only decision).** 6/13 files have
  `const FINAL_EXPLANATION = null; // fill in or extract manually` (and the same for
  SUMMARY_TABLE) — bio_1_1, bio_1_3, bio_2_1, math_2_2/2_3/2_4. They are **upstream content
  gaps** (ARES hasn't authored FE/ST for those sub-strands yet), not a code/shape issue — the
  extractor handles `null` and the bundle just warns. So the corpus does NOT uniformly carry
  all three documents; **do not promote FE/ST to a hard gate** (it would reject ~46% of the
  corpus). The 7 complete bundles (bio_1_2, 1_4, 2_2, 2_3, 3_1, 3_2, 3_3) produce all three;
  the 6 produce only the LessonSequence until ARES fills in FE/ST. bio_1_4 (the Phase-4 oracle)
  is complete → ready for the full round-trip.

## 2026-06-09 — Phase 3 external review (Codex + CodeRabbit) triage + fixes

Codex/CodeRabbit reviewed the ingest work. Verified each finding directly; all green after.

- **[PRODUCT DECISION — FE/ST deliverable contract] WARN-ONLY for now.** SPEC §3 says every
  bundle "generates three documents," but the Phase-2 adapter omits empty FINAL_EXPLANATION /
  SUMMARY_TABLE (generator then produces only the LessonSequence), and `validateGeneratable`
  deliberately gates only crash-safety, not deliverable completeness. **User's call:** add the
  FE/ST checks but as a **non-blocking warning at ingest** (logged, not a hard publish block),
  until the full corpus is confirmed to always carry all three — then promote to a hard gate.
  Implemented as `deliverableWarnings()` (FE has ≥1 section, ST has ≥1 lesson row), surfaced
  per-file by the CLI; `validateGeneratable` (the hard gate) is unchanged. SPEC §3 stays the
  target (canonical); this interim stance lives here.
- **[FIXED — `__proto__` at the export layer] Consistency.** `literalToJson` rejected
  `__proto__` data keys, but the `module.exports = { … }` resolution loop did not — no global
  prototype-pollution exploit (it would only re-point the local `result` object's prototype),
  but it broke the stated "reject `__proto__`" contract. Added the same guard there + a gate
  test (`reject: __proto__ key in module.exports`).
- **[FIXED — CI portability] Hard-coded `~/Desktop/ares-docx-fidelity-demo`.** All three
  DB-less gates (`fidelity-spike`, `adapter-fidelity`, `ingest-extract-check`) hard-coded the
  demo path. Added an `ARES_DEMO_PATH` env override (defaults to the existing path, so local
  behaviour is unchanged) across all three, so the suite runs on CI / the Rock / another
  machine without editing.
- **[FIXED — type hygiene] Dropped the needless `as string` cast in `enforceGeneratable`** —
  `?? 'draft'` already yields the `'draft' | 'published'` union (CodeRabbit).
- **[NO ACTION] `npm run test:int` fails locally** — local Postgres isn't running; not this
  code path. The DB round-trip is Phase 4 on the Rock.

## 2026-06-09 — DEPLOYED to the Rock: SG compound index + media drop (migration-gen quirk)

Generated + applied the migration `20260609_164927_subjectgrade_unique_drop_media` on the Rock
(`docker compose up -d --build`; migrate exit 0 in 43ms; app healthy on :3001). Verified live:
`subject_grades` now has `"subject_grade_idx" UNIQUE btree (subject_id, grade)`, and the `media`
table is gone. The Rock now runs `0096f7a` (both branches + origin even at `0096f7a`).

**Hard-won lesson — Payload's migration generator collides `DROP TABLE … CASCADE` with an explicit
`DROP CONSTRAINT`.** The first `up` failed: `constraint "payload_locked_documents_rels_media_fk"
does not exist`. Cause: dropping a collection (`media`) that is referenced by Payload's internal
`payload_locked_documents_rels` FK generates, in order, `DROP TABLE "media" CASCADE` (which already
drops that FK) **and then** an explicit `ALTER TABLE payload_locked_documents_rels DROP CONSTRAINT
payload_locked_documents_rels_media_fk` — which now errors because CASCADE already removed it.
Migrations are transactional, so it rolled back cleanly (no partial state).

**Fix (rule for the next collection removal):** make the generated `up` idempotent by hand before
applying — `DROP TABLE IF EXISTS … CASCADE`, `DROP CONSTRAINT IF EXISTS`, `DROP INDEX IF EXISTS`,
`DROP COLUMN IF EXISTS`, `CREATE … IF NOT EXISTS`. (Equivalently: delete the redundant explicit
`DROP CONSTRAINT` line, since CASCADE handles it.) `IF EXISTS` throughout also makes the migration
safely re-runnable regardless of any partial state. The migration was patched, re-applied, and the
idempotent version committed (`0096f7a`). **Process note:** the migration is authored *on the Rock*
(needs DB access to diff schema), so it flows Rock→git→Mac (pull to sync) — the reverse of normal.

## 2026-06-09 — Preview strategy locked: derive from the generator (DOCX→HTML), never parallel HTML

Discussed how the "Preview as Word/PDF" trust-builder (SPEC §5) should render lesson plans, and
whether a JSON→HTML preview would be "close enough." Locked the approach (also tightened SPEC §5).

- **Principle (non-negotiable): preview is always DERIVED from generator output, never a parallel
  HTML renderer.** A hand-built HTML template re-implementing the layout would be a *second source
  of layout truth* that can drift from the real DOCX and **mislead the teacher** — fatal for a
  trust-builder aimed at a Word-centric stakeholder, and a return of the "HTML is lossy" problem we
  rejected for storage. One layout source: the generator.
- **What Payload provides (verified in installed source):** the *plumbing* only — `admin.livePreview`
  (`LivePreviewConfig`: iframe + breakpoints + form-state `postMessage`) and `admin.preview`
  (`GeneratePreviewURL`: a preview-button URL). Payload does NOT render your data as HTML; you supply
  the view/URL. So "does Payload manage HTML natively" = harness yes, document rendering no.
- **Two fidelity tiers:**
  1. **Fast in-browser content preview** = real DOCX (generated in-process from the working copy) →
     HTML via **`mammoth`**. We already do this in the fidelity harness, so it's nearly free. It is
     the *actual document's* content + table structure; mammoth intentionally drops styling
     (colours/widths/fonts). Adequate *because* teachers edit prose and the generator owns visuals,
     which don't change with prose edits; our grammar (`\n`=para, `- `=bullet) round-trips cleanly.
     (Implication: `mammoth` moves devDep → dependency when this ships.)
  2. **Exact visual check** = the real DOCX download and/or DOCX→PDF. PDF needs a converter
     (headless LibreOffice or similar) — heavier; fold into §9 PDF export. HTML is never the
     "exact look" answer; the DOCX/PDF is.
- **Trigger:** a preview button / custom edit-view component (the §5 component note), NOT continuous
  live-preview — regenerating a DOCX per keystroke is wasteful; the value is "check before publish."
  A debounced "Refresh preview" on the draft is the sweet spot.
- **Gates differ:** preview runs on the **working draft** (that's its purpose, so it bypasses the
  published-only export gate); **export** stays published-only via `generateForBundle`. Preview ≠
  export.
- **Status:** design decision only; built with the §5 editor / §9 export work, not now.

## 2026-06-09 — Removed the unused scaffold `Media` collection

Audited `Media` (Payload-first tidy-up): it was pure `create-payload-app` scaffold residue — an
`upload` collection with only an `alt` field, **zero domain references** (the only mentions were
the config registration, auto-generated `payload-types.ts`, the initial migration's `CREATE TABLE
"media"`, and Payload's internal `payload_locked_documents_rels.media_id`). The editor grammar is
plain strings (SPEC §4) and the generator owns all visuals, so there is no upload need; an empty
"Media" collection in the admin sidebar was misleading dead weight.

Removed: `src/collections/Media.ts`, its `payload.config.ts` import/registration, and the
media-only `images.localPatterns` block in `next.config.ts`. `generate:types` regenerated (Media
gone from `payload-types.ts`); `tsc` 0 errors, `lint` 0 errors, fidelity gates 3/3 + 5/5.
**Pending Rock migration:** a `DROP TABLE media` (+ the locked-docs FK) rides the next deploy —
safe, the table is empty. If image/attachment support is ever needed, re-adding an upload
collection is trivial.

## 2026-06-09 — SubjectGrade modeling locked (junction entity) + native compound-unique index

Deliberate review of "two fields (subject, grade) vs one SubjectGrade entity" (SPEC §8),
confirmed with two requirements the user nailed down:

- **(1) Teachers are ALWAYS assigned at `(subject, grade)` granularity → SubjectGrade stays a
  first-class junction entity.** The decisive test is the *permission grant*: a grant is a tuple
  ("Grade 10 Math"), and a teacher holds several independent tuples. Two *independent* fields
  (`subjects[]`, `grades[]`) can only express their **cross-product**, which over-grants (e.g.
  Math-10 + Biology-12 would also grant Biology-10, Math-12). So the pair must be atomic — an
  entity. This also gives clean Payload access queries (`subjectGrade: { in: [...] }`, mirrored in
  `readVersions`), referential integrity (a curated list of valid combos, no garbage/typos), and
  matches the domain mental model (Subject + Grade = building blocks; SubjectGrade = their curated
  junction). **Caveat recorded:** the entity's justification rests entirely on per-pair
  assignments; if that ever softened to subject-only or grade-only grants, two fields would be
  simpler and this should be revisited.
- **(2) Cross-axis reporting ("all Biology across grades", "all Grade 10") is OCCASIONAL → do NOT
  denormalize.** Mirror `subject`/`grade` columns on bundles would buy direct querying at the cost
  of permanent sync upkeep + more secure-by-default whitelist surface — not worth it for occasional
  use. Pattern instead: the **two-step** (resolve SubjectGrade ids for the subject/grade, then
  `bundles where subjectGrade in (...)`), which always works regardless of adapter query support. A
  one-shot relationship dot-path (`where: { 'subjectGrade.subject': … }`) may also work — verify
  against the DB before relying on it; the two-step is the safe default.
- **`grade` stays a constrained integer**, not its own `Grade` collection (YAGNI). Promote to a
  relationship via migration only if grades gain attributes (alternate names like "Form 4",
  ordering/banding, per-grade metadata).

**Action taken — adopt the native compound-unique index** (supersedes the 2026-06-08 audit note
"DB-level composite unique index still deferred; app-level check acceptable"). Added
`indexes: [{ unique: true, fields: ['subject', 'grade'] }]` to `SubjectGrade` (verified in
installed source `collections/config/types` — Payload natively supports compound unique indexes;
this is the Payload-first replacement for relying on the hook alone). Kept the `beforeValidate`
duplicate check for a friendly error message (a raw unique-violation is opaque) → defense in depth.
`generate:types` parses clean, `tsc` 0 errors, `payload-types.ts` unchanged (no new fields).
**Still needs a migration generated + applied on the Rock** (the index is DDL); existing data is
safe because the app-level check has prevented duplicates all along.

## 2026-06-09 — "Payload-first" working rule (+ leverage audit)

**Rule (adopted; also added to SPEC §13).** Before adding any new custom endpoint, editor,
permission layer, workflow, or persistence code, first check whether Payload already provides it
— via collection config, access control, field/collection hooks, versions/drafts, admin config,
the Jobs Queue, or the Local API. Build custom only when Payload genuinely cannot; when you do,
**document the specific gap** in a code comment and/or here. Keep leaning on Payload's tested
machinery instead of re-implementing it.

**Audit to date (grounded in the code, not memory) — strongly compliant.** Where we leverage
Payload:
- **Data model:** sub-strand bundle as native nested groups/arrays (`LessonBundles.ts`), NOT a
  JSON blob — the choice that unlocks per-field validation, field access, and versioning.
- **Auth:** built-in Payload auth on `Users` (JWT, `forgotPassword`, `tokenExpiration`); no custom auth.
- **RBAC:** collection + field access functions; reads return `Where` queries
  (`lessonBundleRead`) with a mirrored `readVersions` so history can't leak drafts — the idiomatic
  query-filter approach, not post-fetch filtering.
- **Versioning:** Payload `versions` + `drafts` as the history/official-version engine; restore is
  Payload's. Custom layer = only `semver`/`bumpType`/`lockVersion` (Payload has no semver).
- **Structural integrity:** `enforceBundleStructure` is a `beforeChange` hook used *because* field
  access cannot gate array cardinality/order (a documented Payload limitation) — right primitive,
  not reinvention. Same for the other hooks (`autoDemotePriorSubjectAdmins`, `guardPasswordChange`,
  `grantSiteAdminToFirstUser`, subject-rename refresh), all threading `req`.
- **Editor UI:** Phase 1 uses Payload admin edit screens; no custom React editor (SPEC §5 "only if
  needed"). **Email/migrations/persistence:** `@payloadcms/email-nodemailer`, `payload migrate` +
  `db-postgres`, Local API in scripts. **Generation:** script + reusable core via Local API; custom
  endpoint deliberately deferred to §9.

**Opportunities to be MORE native (flagged, all future — honor when these phases land):**
- **Async export (§9):** use Payload's built-in **Jobs Queue**, not a hand-rolled queue.
- **`validateGeneratable` (Phase 3):** implement as Payload field `validate` + a
  `beforeValidate`/`beforeChange` hook so it runs on save/publish/ingest and surfaces in the admin
  UI — not a standalone function only the export path calls.
- **`generateForBundle` `overrideAccess`:** trusted system path now; the §9 endpoint must switch to
  `req`-based access (Payload custom endpoint reusing access + Local API).
- **"Preview as Word/PDF" (SPEC §5):** when built, make it a Payload **admin custom component** (an
  edit-view button via `admin.components`) that calls the generate endpoint — NOT a separate React
  app. Verified caveat: Payload's native `admin.preview`/Live Preview targets HTML *frontend* URLs,
  so it does NOT fit DOCX rendering; only the *button* lives in Payload's component slots.
- **Optimistic concurrency:** currently Payload document-locking + a `lockVersion` counter; true
  reject-if-stale OCC, if needed, is a custom-endpoint concern (documented earlier).

**Verdict:** the only custom code maps to justified, already-documented gaps. The rule formalises
existing practice; its main forward use is steering Phase 3/§9 (validation + async export) toward
Payload's native validate-hooks and Jobs Queue.

## 2026-06-08 — Phase 2 external review (Codex/CodeRabbit) triage + fixes

Codex reviewed the just-committed Phase 2. Five findings, all valid; verified each directly
(don't trust the summary) and fixed. Gates re-run green afterward.

- **[FIXED — broken gates, mine to own] Repo lint + `tsc` were red, since Phase 0/1.**
  Verified: `npm run lint` → **10 errors, all the vendored pristine CJS** (`require()`
  forbidden) — eslint was never told to ignore `src/generator/vendor/`. `tsc --noEmit` → the
  vendored `.js` aren't checked (tsconfig `include` is `**/*.ts`), but `jsdom` was untyped in
  `scripts/`, so **`next build` would have failed too** (uncaught only because Phase 0/1 was
  never built on the Rock). **Calling it "pre-existing" was the wrong call** — a committed gate
  that doesn't pass is a broken gate. Fixes: eslint `ignores: ['src/generator/vendor/**']`
  (pristine code we must never edit + our sibling shim); added `@types/jsdom@28.0.3` (exact,
  matches `jsdom@28.0.0`). Now `lint` 0 errors / `tsc` 0 errors. **Rule:** run the *repo-wide*
  `npm run lint` / `tsc`, not just `eslint <my-files>` — a gate is the whole tree or it's nothing.
- **[FIXED — latent crash] Published ≠ generator-valid; adapter turned null arrays into `''`.**
  The publish gate only enforces *schema-required* fields (`title`, `subjectGrade`,
  `framework[].phase`); the generator unconditionally `.map()`s LESSONS / `lesson.framework` /
  FE.sections / FE.rubric / ST.lessons. Payload normally returns `[]` for empty arrays, but I
  proved `clean(null) → ''` — a null array would have crashed `.map`. (Codex's group examples —
  `slo.purpose` etc. — don't actually crash: Payload groups always materialise and the adapter
  nulls→''.) Fix: `bundleToAresData` now force-coerces those five iterated slots to arrays.
  **Content-completeness validation stays an ingest/publish concern (SPEC §5 "reject anything
  that would produce a broken document"), built in Phase 3** — export trusts validated-in data
  + publish status; the adapter just guarantees it can't *crash*.
- **[FIXED — product call: BLANK column] Resource cells showed "(ARES resources unavailable)".**
  `sections.js`'s try/catch fallback printed that placeholder into real DOCX (the fidelity
  harness strips the column, so gates didn't catch it). Decided (user): render the column
  **blank**, not the placeholder and not removed (removing it would diverge from the approved
  baseline, which keeps the column). Added a **Lesson3-authored** pure-Node shim
  `vendor/aresResources.js` (`getAllPhaseResources → {}`, `buildResourceParagraphs → [para('')]`)
  at the fixed `require('../aresResources')` path. No Python, deterministic. The re-sync script
  copies only the three lib files, so the shim survives a re-pin. Verified: generated
  LessonSequence contains no placeholder; gates still 3/3 and 5/5.
- **[FIXED — doc, future-endpoint] `generateForBundle` uses `overrideAccess: true`.** Correct
  for the trusted CLI/system path, dangerous if a future §9 endpoint reuses it without a read
  check. Hardened the docstring to a firm contract: the endpoint must enforce the caller's READ
  access (or pass `req`) before calling; do not expose this directly as a handler. Restructure
  when the endpoint lands.
- **[FIXED — hygiene] `meta.filePrefix` flowed into a path join unsanitised.** Operator script
  writing to a temp dir, but `filePrefix` is ingested data → trivial path-traversal hygiene.
  Now sanitised to a bare filename component (`[^A-Za-z0-9._-] → _`).
- CodeRabbit's null-check (Payload `findByID` throws by default) and duplicate-fetch notes:
  noise/minor; the script's second `findByID` is a deliberate convenience for the filename. No change.

## 2026-06-08 — Phase 2: generator integration (adapter + validity-gated core)

Built the stored-bundle → ARES generator path on `feat/generator-ingest`. Decisions:

- **Adapter is a thin rename + clean, not a field-by-field mapping.** The ARES *inner*
  keys already match the Payload field names verbatim (verified against `bio_1_4_data.js`),
  so `bundleToAresData` (`app/src/generator/adapter.ts`) only (1) renames the five top-level
  groups (`meta→META` …), (2) deep-strips Payload's row `id`, (3) converts **`null` → `''`**,
  and (4) drops **empty** `framework[].resources` / `FINAL_EXPLANATION` / `SUMMARY_TABLE`.
  **Why null→'':** Payload returns `null` for empty optional strings, but the generator's
  `cell()` wraps a non-string/non-array child as `[content]` → a raw `null` produces invalid
  docx; ARES data files never contain `null`, so the adapter restores that invariant. A
  *populated* `resources` is carried through untouched (the deferred-resources future seam).
  Verified the generator **never reads `framework[].resources`** anyway (`sections.js` pulls
  the Resource column from the absent Python `aresResources` module via its no-op fallback),
  so this is fidelity-neutral.
- **Validity gate lives in the shared core, not the caller (secure by default).**
  `generateForBundle(payload, id)` (`app/src/generator/generateForBundle.ts`) loads the
  bundle (`overrideAccess`, no `draft:true` → the published snapshot), calls `assertExportable`
  (refuses anything whose `_status !== 'published'` with a `NotExportableError`), then runs the
  adapter + `generateBundleDocx`. The gate is enforced by **every** path by construction; the
  CLI uses it now and the future §9 export endpoint just adds READ access on top — it does not
  re-implement the gate. Publishing already enforces required fields, so a published bundle is
  schema-valid. Matches the deferred Codex finding (drafts must never export).
- **Generation exposed as a script for now** (`app/scripts/generate-bundle.ts`, run via
  `payload run`), not an endpoint — full export/sharing UI is SPEC §9, later.
- **Phase-2 GATE is DB-less** (`app/scripts/adapter-fidelity.ts`, 5/5): it *simulates* a stored
  Payload bundle from `bio_1_4_data.js` (camelCase groups + injected row `id`s + sidebar fields
  + `null` UNIT.overview + empty `resources` groups), runs the real adapter + generator, and
  diffs vs the approved DOCX — proving bundle→DOCX by transitivity with the Phase-1 gate. The
  true end-to-end **DB** round-trip + Rock verification stays Phase 4 (per NEXT-SESSION). Shared
  mammoth/jsdom diff helpers were extracted to `app/scripts/lib/docxDiff.ts` (both gates import
  them; Phase-1 gate still 3/3). *Tooling note:* `scripts/*` trip a pre-existing
  `@types/jsdom`-missing `tsc` warning (present since Phase 1); left as-is to avoid an
  out-of-scope dependency add.

## 2026-06-08 — Resources deferred (recommender out of scope); audience-driven priority note

**Decision (firm):** the ARES **Resource column is not populated** for the foreseeable future,
and the **Python recommender is not integrated at all** — not live *and not at ingest*. This
formalises the Phase-0 omission of `aresResources.js`. It is **within SPEC**, not a spec change:
§3/§4/§5/§7 already mark resources **optional and "undetermined… may be omitted entirely,"** and
the recommender path was always conditional ("if the column is enabled"). We are exercising the
already-specified "off" branch.

**What we keep (the future seam):** the optional `framework[].resources` field in
`LessonBundles.ts` stays. Removing it would be the one move that forecloses the future; keeping
it costs nothing (it already tolerates empty).

**Why (three distinct audiences, user-provided):**
- **A — schools with their own ARES server** (~10–60): links resolve to local content; genuinely useful.
- **B — schools using the online ARES demo** (hundreds): links useful if online.
- **C — little/intermittent internet** (thousands — the **largest** group): links are useless.

So links add value only for a minority, while the majority is best served by a self-contained
lesson-plan document (high-fidelity DOCX/PDF, no live links). This **aligns with** the existing
SPEC non-goal "not an offline content-distribution platform (Kolibri/RACHEL serve that need)."

**Future sourcing (no live recommender):** resources do **not** live in the ARES data files —
upstream they exist only in the *rendered* DOCX (computed at build time from `aresKeywords`). So
if links are wanted later, the path is to **extract them from the ARES-produced documents** and
attach to `framework[].resources` — or, if the ARES team later embeds resources in the data
files, ingest simply carries them through. Either way, the same optional field absorbs it.

**Fidelity impact:** none. We already diff "everything-except-resources." The approved DOCX still
contain the column, so we keep excluding it; only a *structural* removal of the column would force
new baselines, and we are not doing that (that's the generator/format owner's call, not a fork).

**Flagged for a later deliberate SPEC pass (NOT changed now):** SPEC line 25 calls offline a
**"secondary goal."** The audience sizing above suggests the *exported documents* standing alone
offline is actually the majority case (distinct from running the *app* on an offline box, which
remains secondary infra). Before editing SPEC, firm up the audience numbers and think through the
downstream nudge toward **print/PDF/offline fidelity over interactive links**. Captured here as an
open question rather than a reactive spec edit.

---

## 2026-06-08 — Generator embedding (Phase 0): vendor pristine, omit Python, mirror the SHA

Starting the bio_1_4 end-to-end fidelity proof (NEXT-SESSION.md). Phase 0 vendors the ARES
Node generator into Lesson3. Decisions (all confirmed with the user at plan time):

- **Vendor pristine, not submodule/npm-dep.** The source lives on an **unmerged `claude/*`
  bot branch** (`markknit/cbe-generation-system@212da91…`), which can be rebased/force-pushed/
  deleted on merge — so any approach that points *live* at that ref (submodule SHA, npm
  git-ref) is fragile, and submodules add friction to the Rock's bind-mount Docker flow.
  **Decision:** copy the three lib files **byte-verbatim** into `app/src/generator/vendor/lib/`
  and never edit them; all integration lives in `app/src/generator/` (ours). Provenance +
  exact SHA in `vendor/PROVENANCE.md` and `docs/EXTERNAL-DEPENDENCIES.md`; one-command re-sync
  via `scripts/vendor-generator.sh`. **Pinned at `529be40`** (branch tip). *Process note:* the
  SHA was first taken as `212da91` from a **stale local fork**; the real tip was four commits
  ahead (`529be40`). Re-pinned after verifying the four intervening commits touched only
  docs/content/output DOCX — the three vendored lib files are **byte-identical** at both
  commits and the fidelity gate still passes. **Lesson:** `git fetch` before resolving a pin;
  don't trust a local clone's `origin`. **Rule:** because a generator change *also* ripples into
  our schema/adapter/approved-DOCX, an upgrade is never a silent SHA bump — the **fidelity
  regression is the acceptance gate** for adopting any new version. Vendoring makes that change
  visible and tested; a submodule's transparent bump would hide it.
- **Buffers need ZERO generator modification.** `build_docs.js` exports the three builders
  (`buildSoW`/`buildFinalExplanation`/`buildSummaryTable`), each returning a `docx` `Document`.
  Our wrapper calls them + `Packer.toBuffer()`. The NEXT-SESSION assumption that we'd "refactor
  `run()` to return Buffers" was unnecessary — `run()` stays untouched (disk-write parity only).
  This is what makes pristine vendoring cheap: no local patches to carry across upstream changes.
- **`aresResources.js` intentionally NOT vendored (deviation from NEXT-SESSION, rule-driven).**
  It `execSync`s `python3` against a SQLite DB for the Section-C Resource column. Single-runtime
  / "never invoke the Python recommender live" (SPEC §0) forbids that. `sections.js` already
  `try`-requires `../aresResources` and falls back to no-ops when absent — so **omitting the
  file** exercises that documented fallback, guaranteeing zero Python and a deterministic
  (empty) Resource column. The fidelity diff excludes the Resource column anyway.
- **CJS-in-ESM boundary.** The vendored files are CommonJS; the app is `"type":"module"`.
  Added `vendor/package.json` = `{"type":"commonjs"}` so Node parses them correctly without
  editing them; Lesson3 imports the builders from ESM via `createRequire`. (Smoke-tested: a
  builder produces a valid PK-zip docx Buffer.)
- **Pinned `docx@9.6.1` exact** (the version the generator was authored against) + **`mammoth@1.12.0`**
  (devDep, for DOCX→text diffing) in `app/package.json`.
- **Mirror tag pushed:** `lesson3-vendor-212da91` on `james-beep-boop/cbe-generation-system`,
  insurance against the upstream bot branch disappearing.
- **Export gate (confirmed, ties to the deferred Codex finding below):** generation is
  restricted to **published/official** (validated) versions; drafts are never exported.

---

## 2026-06-08 — External review (Codex) on versioning: read boundary + secure-by-default

Codex reviewed the deployed versioning work. Four findings; two acted on now (deployed,
`verify-rbac.ts` **36/36**), two recorded for the relevant upcoming phase.

- **[FIXED — security] Teacher read boundary.** `lessonBundleRead` was `Boolean(user)`, so
  with drafts enabled any authenticated Teacher could pull unpublished work via `?draft=true`
  and enumerate history via the versions endpoint. Not exploitable yet (only the Site Admin
  exists) but live the moment Teacher accounts do. **Decision (locked):** Teachers read only
  **published/official** bundles; **Editors/Subject Admins** additionally read any-status
  bundles (incl. drafts) **within their subject-grades**; Site Admins all. Implemented as a
  query-returning `read` plus a mirrored **`readVersions`** (`version._status` /
  `version.subjectGrade` paths — verified working against the live DB) so the version-history
  endpoint can't leak drafts. `verify-rbac.ts` covers teacher-sees-published,
  teacher-blocked-from-draft (list + by-id + versions), editor-sees-own-SG-draft.
- **[FIXED — secure-by-default] Top-level whitelist gap.** The hook's claim that "a new
  admin/system field is protected automatically" held for *array subfields* (overlayRows
  rebuilds each row from the original) but **not for top-level fields** — the Editor branch
  only restored enumerated keys (`title`/`subjectGrade`/`meta`/`unit`/`_status`), so a future
  top-level field added without access/hook handling would pass through an Editor update.
  **Fix:** invert to a true allow-list — restore EVERY top-level key from the original except
  the content containers (`lessons`/`finalExplanation`/`summaryTable`), the hook-set version
  fields (`semver`/`bumpType`/`lockVersion`), and Payload's `updatedAt`. New top-level fields
  are now protected by default. **Rule:** "secure by default" means *restore-all-except-known*,
  never *restore-known*; the latter silently rots as the schema grows.
- **[DEFERRED — export phase, SPEC §6/§9] Draft validity vs bulletproof export.** Enabling
  drafts relaxed DB `NOT NULL` and `draft:true` skips required validation, so an invalid draft
  snapshot can exist. SPEC says "any version regenerates on demand" — so **generation/export
  must validate the exact snapshot first, and/or only official/validated versions are
  exportable.** Honor this when the generator integration lands; not a bug today.
- **[DEFERRED — low] CodeRabbit migration notes.** `numeric` for integer-ish columns is the
  db-postgres default for `number` fields (style, not a bug); the down-migration `SET NOT NULL`
  only fails if you roll back after creating null-bearing drafts. Both downgraded; no action.

## 2026-06-08 — Versioning DEPLOYED + hard-won Payload/Docker lessons

Bundle versioning is merged and **deployed on the Rock** (migration
`20260608_224715_bundle_versioning` applied; `verify-rbac.ts` **30/30** against the live DB).
Getting there surfaced several non-obvious traps — recorded so the next schema change and the
public-production host don't re-hit them:

- **Regenerate `payload-types.ts` BEFORE building, after any schema change.** `next build`
  type-checks the whole tree; the generated `LessonBundle` type won't know new fields
  (`semver`/`bumpType`/`lockVersion`/`_status`) until regenerated, so the build fails on
  `verify-rbac.ts` (and would fail on the hook/collection too). It can't be regenerated
  locally here (no `node_modules`), so it's done on the Rock via the **deps image with the
  source bind-mounted** (anon volume preserves the image's node_modules):
  `docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app lesson3-deps npx payload generate:types`.
- **`migrate:create` needs a bind mount AND the compose network.** `docker compose run --rm
  migrate npx payload migrate:create` writes the migration file *inside* the ephemeral
  container (the builder stage `COPY . .`'d the source; there's no volume) — `--rm` then
  deletes it. Run it via the deps image with `-v /srv/lesson3/app:/app` (so the file lands on
  the host) **and** `--network lesson3_default --env-file .env` (migrate:create connects to
  Postgres to diff the schema). The exact workflow is in `docs/NEXT-SESSION.md`.
- **Publishing is `_status: 'published'` in *data*, not the `draft` op param.** Verified in
  installed source (`collections/operations/create.js`/`update*.js`): `draft: true` only forces
  draft status + skips required-field validation; the persisted `_status` otherwise comes from
  `data._status` (default `'draft'`). So **marking official = passing `_status: 'published'`**;
  `draft: false` alone does nothing. Publishing also **enforces required fields**, so a publish
  update must carry a valid doc (e.g. `framework[].phase`). The whitelist hook *preserves*
  `_status` for Editors, which both blocks an Editor from publishing a draft AND stops an
  Editor's edit from accidentally unpublishing an official bundle — both now covered by
  `verify-rbac.ts`.
- **`lockDocuments: true` is not a valid literal** (the option type is `false | { duration }`);
  document locking is **on by default** in Payload 3, so we leave it unset. An explicit `true`
  breaks the build type-check.
- **Test hygiene:** the versioning checks initially reused the suite's already-mutated bundle
  (semver long past its initial value) — they now create a **fresh** bundle. General rule:
  exact-value assertions need a fixture untouched by earlier steps.
- **`enforceBundleStructure` now treats `!req.user` as trusted** (system / `overrideAccess`),
  bypassing the Editor whitelist — so ingest/migrations can set all fields and publish.
  Unauthenticated updates are already denied at collection access, so this only frees genuine
  system calls. Matches the `guardPasswordChange` `!actor` convention.

## 2026-06-08 — Bundle versioning: implementation decisions (SPEC §6)

Implemented `versions: { drafts: true, maxPerDoc: 100 }` on `lesson-bundles` plus three
sidebar fields (`semver`, `bumpType`, `lockVersion`) and versioning logic in
`enforceBundleStructure`. Key decisions:

- **Payload drafts as the "official version" mechanism.** Payload's single published
  document per collection naturally enforces "≤1 official version per bundle" (SPEC §6).
  Publishing (`_status: 'published'`) = marking official. The whitelist hook preserves
  `_status` for Editors (`d._status = orig._status ?? 'draft'`), so only Subject Admins
  can publish.
- **bumpType is Editor-accessible.** SPEC §6 says "user may choose patch/minor/major" without
  restricting who. The `bumpType` field passes through the whitelist for all users; Editors
  can signal a minor/major bump when their change warrants it. The hook consumes and resets
  it to `'patch'` after every save.
- **Versioning logic runs before the admin early-return.** The semver bump and lockVersion
  increment are in the outer scope of `enforceBundleStructure` (before `if (isSubjectAdminFor)
  return data`), so all users get version stamps on every save. Subject Admins also get the
  whitelist bypassed (correct).
- **Restore interaction.** Version restore in Payload calls `update` with the old version's
  data, which goes through `enforceBundleStructure`. For Editors: the whitelist applies —
  only prose fields from the restored version are written; admin fields are preserved from
  the current document. For Subject Admins: the full restored data is written. The semver
  always bumps on restore (treated as a write), which is correct.
- **Optimistic concurrency: `lockVersion` counter + Payload's `lockDocuments`.** True
  server-side OCC (reject-if-stale) can't safely distinguish a restore (submitted old
  `lockVersion`) from a concurrent edit without Payload exposing a restore context flag.
  Implemented: `lockVersion` increments on every save (clients can use it to detect races);
  Payload 3 **document locking is on by default** (guards concurrent admin-UI edits) — note
  there is no `lockDocuments: true` literal (the option type is `false | { duration }`), so we
  leave it at the default rather than setting it explicitly. Server-side reject-if-stale can
  be added when building custom API endpoints — at that point callers can pass
  `_expectedLockVersion` and the hook can enforce it.

---

## 2026-06-08 — Admin login loop on Safari: serverURL forces strict CSRF

After a Rock reboot, browser login looped (enter password → flicker → back to login),
specifically on **Safari**. Diagnosed against the running stack (not guessed): app healthy,
account not locked, password valid, and **header auth (`Authorization: JWT`) worked while
cookie auth failed** — login POST set the cookie but the follow-up GET wasn't authenticated.

Root cause in installed source (`auth/extractJWT.js` + `config/sanitize.js`): setting
**`serverURL`** makes sanitize **push it onto `config.csrf`** (`if (serverURL !== '')`), and a
non-empty `csrf` makes Payload honor a cookie token on a request with **no `Origin`** only if
it carries `Sec-Fetch-Site: same-origin|same-site|none`. Browsers omit `Origin` on same-origin
GETs; **older Safari also omits `Sec-Fetch-Site`** → the admin's auth-check GET is rejected →
bounce to login. (Reproduced exactly: cookie + correct `Origin` ✓; cookie + no `Origin`/no
`Sec-Fetch-Site` ✗; cookie + `Sec-Fetch-Site: same-origin` ✓.)

**Fix:** default `serverURL` to `''` (empty → NOT pushed to csrf → cookie auth honored for all
browsers; CSRF still covered by the `SameSite=Lax` cookie, which blocks cross-site
POST/subrequests). The password-reset email base moved to a separate **`ADMIN_URL`** env via a
custom `forgotPassword.generateEmailHTML` (serverURL is no longer available for it). Env-driven:
a public **HTTPS** host may set `SERVER_URL` to opt into strict CSRF (modern browsers over HTTPS
send `Sec-Fetch-Site`, so they're fine). **Rule:** don't set `serverURL` on a plain-HTTP/internal
host that older browsers hit — it silently breaks their cookie login; use `ADMIN_URL` for email
links instead. Gotcha: `serverURL` must be the empty string, not `undefined` (undefined is still
pushed to csrf).

**Session policy (same session):** set `auth.tokenExpiration: 900` (15-min inactivity window).
With `admin.autoRefresh` off (Payload default), the admin shows a "Stay logged in?" prompt ~1 min
before expiry and **force-logs-out an unattended session at expiry even with the tab open** —
addressing the shared-device "someone sits down later" concern (cookie persistence alone wouldn't).
Avoided very short windows (e.g. 1 min): the prompt fires at `expiry − min(60s, lifetime/2)`, so a
1-min window nags every ~30s and logs you out on any brief pause, risking lost unsaved edits.
"Log Out" is always immediate. Note Payload has **no native session-cookie / "clear on tab/browser
close"** option (cookie carries `Expires` = tokenExpiration, and tabs aren't cookie-scoped), so the
inactivity window is the supported lever. Tune `tokenExpiration` (`app/src/collections/Users.ts`) if
15 min proves tight for real editing.

## 2026-06-08 — Bundle field protection: blacklist → whitelist (secure by default)

Follow-up to the audit below. The first fix made `enforceBundleStructure` restore an
*enumerated* list of admin-only fields from the original (a **blacklist**). That is
insecure-by-default: a new admin-only field added inside an editable array that someone
forgets to add to the hook would be silently Editor-editable. **Inverted to a WHITELIST**
(commit `2059156`, deployed, `verify-rbac.ts` **19/19** against the deployed image): for a
non-admin Editor the hook writes the *original* document with only the Editor-editable
**prose** fields overlaid from the submission. Everything else is preserved.

- **Why this is the right default:** forgetting to whitelist a field can only make it
  non-editable by Editors (a visible annoyance, caught in use) — never silently editable
  (a security hole). New admin/system fields are protected automatically.
- **Standing rules for anyone adding bundle fields (see the LessonBundles docstring):**
  1. A new field is **admin-only by default**. To make it Editor-editable, add it to the
     matching prose-whitelist constant in `hooks/bundleIntegrity.ts` (and use `prose()`).
     The cross-container regression test in `verify-rbac.ts` guards the contract.
  2. Field-level `access` is **not** the authority for the Editor/admin split — the hook is.
     (`prose()`/`proseAdmin()`/`structureText()` carry only grammar hints + UI/create access.)
  3. **Array edits must submit the full array** (same rows/order): the hook rejects
     cardinality/order changes by Editors. Fine for the Payload admin UI; required to know
     before building custom API/editor flows.
- **UNIT.overview** is admin-only (SPEC §5 does not list UNIT) — modeled with `proseAdmin`
  and preserved wholesale by the hook; it is intentionally not in the prose whitelist.
- Field-level access is still kept on groups (META/UNIT), `phase`, the `rubric` array, and
  top-level `title`/`subjectGrade` as harmless defense-in-depth, but the hook is the
  single source of truth.

## 2026-06-08 — External audit (Codex + CodeRabbit) triage + fixes

Second external pass on the auth/bundle work (already merged to `main`). Six findings; all
valid. Triage (live now / next-task / future) and resolution below.

**Status:** landed over two commits on `main`, both deployed to the Rock (rebuilt via
`docker compose up -d --build`, migrate exit 0, app running) and verified against the
deployed image (not bind-mounted): `eba6157` (the fixes below) verified 17/17, then
`2059156` (the whitelist inversion + cross-container test, see the dedicated entry above)
verified **19/19**. The current design point is the whitelist hook.

- **[live-when-roles-exist, FIXED] Subject Admins could reset any user's password.**
  Verified in installed source (`collections/operations/utilities/update.js`): Payload saves
  `data.password` with NO password-specific access check — only collection `update` gates it,
  and Subject Admins have collection update on all users (needed for assignment mgmt). Added
  `guardPasswordChange` (beforeChange): only self or Site Admin may change a password; `!actor`
  is treated as a trusted system/override call (unauthenticated REST is already denied at
  collection access, and the token reset writes hash/salt directly, never via this path).
  Not exploitable today (only the Site Admin exists) but mandatory before assigning Subject Admins.
- **[authz-correctness, FIXED] Editors could edit `sections[].exemplar` (an answer key).**
  SPEC §5 makes exemplar Subject-Admin-only. Fixing this surfaced a **deeper Payload
  limitation (the important lesson):** field-level access reliably retains denied values for
  **groups** and **required** array subfields, but **NULLS optional admin-only subfields inside
  open arrays** when a non-admin submits the array — and nulls them at *write* time even when
  the parent is merely *omitted* from the update (hook injection of an omitted field does NOT
  persist; only modifications to *submitted* fields do). Net effect: with field access, an
  Editor's ordinary save would **wipe** `exemplar`, `sections[].title`, and (pre-existing, missed
  by everyone) `lessons[].duration/substrand/aresKeywords`. **Resolution:** remove field-level
  access from those optional admin array subfields and make `enforceBundleStructure` the single
  enforcement point — it overwrites admin-only values from the original for non-admins (omitted
  parents are then retained intact by Payload's merge; submitted changes are corrected by the
  hook). **Rule:** do not rely on Payload field-level `access` to protect optional admin-only
  subfields inside shared/open arrays; enforce those in a hook. *(This hook was then inverted
  from this blacklist to a secure-by-default whitelist — see the entry above.)*
- **[future, DOCUMENTED—not changed] FK `ON DELETE SET NULL` on NOT NULL columns**
  (`subject_grades.subject_id`, `users_assignments.subject_grade_id`, `lesson_bundles.subject_grade_id`).
  Verified Payload 3.85 / db-postgres exposes **no `onDelete` config** — it hardcodes SET NULL
  for relationships. Practically, SET NULL on a NOT NULL column *prevents* deleting a referenced
  parent (the delete errors), so there's no orphaning/data-corruption risk today — only a less
  friendly error and a schema smell. Hand-forcing RESTRICT in a corrective migration would
  diverge from Payload's generated schema snapshot and fight `migrate:create`. **Decision:** keep
  Payload's default; when taxonomy *delete workflows* are built, add app-level `beforeDelete`
  guards on Subject/SubjectGrade that block deletion when dependents exist (clear message),
  rather than fighting the FK DDL. No delete workflows exist now; deferred deliberately.
- **[live dev harness, FIXED]** `playwright.config.ts` `webServer.command` was `pnpm dev` →
  `npm run dev` (`npm run test:e2e -- --list` now works; 4 tests listed).
- **[future-correctness, FIXED]** `SubjectGrade` uniqueness `beforeValidate` lookup omitted
  `req` → added (transaction-consistent, per the rule below). DB-level composite unique index
  still deferred (app-level check acceptable at this scale; documented).
- **[next-task, DONE] Coverage.** `verify-rbac.ts` extended to 17 checks incl. password-guard
  (subject-admin-blocked / self-allowed / assignment-mgmt-still-works) and exemplar
  (editor-blocked / admin-allowed / prompt-still-editable) and admin-array-subfield anti-wipe.

## 2026-06-08 — Code-review (high) follow-ups + a Payload transaction lesson

A correctness-focused review pass (complementing the security review) on the auth branch.
No High bugs; the access hooks held up. Actioned:

- **M1 (fixed) — denormalized title went stale.** `SubjectGrade.displayName` ("<Subject> —
  Grade N") is stored at write time; renaming the parent `Subject` left it stale. Added a
  `Subject` afterChange hook that refreshes dependent SubjectGrade titles on rename.
- **L3 (fixed) — duplicated access helpers consolidated.** Exported a shared `Assignment` type
  and a single `subjectGradeIdsByRole` from `access/index.ts`; removed the near-duplicate copies
  in `access/bundle.ts` and `hooks/userRoles.ts`. Behavior-preserving.
- **Transaction-consistency bug surfaced while fixing M1 (the real lesson).** The rename hook
  *looked* correct but the title still didn't update. Root cause, found by instrumenting:
  (1) Payload **merges existing field values into `data`** on update, so a `beforeChange` that
  guards on `data.grade == null` still runs its recompute even when you only passed one field;
  and (2) `SubjectGrade.beforeChange`'s subject lookup **omitted `req`**, so it read *outside the
  current transaction* and recomputed the title from the pre-rename name, clobbering the refresh.
  **Rule:** always thread `req` into nested `payload.find/findByID/update` inside hooks — not just
  for writes (atomicity) but for **reads**, or they see pre-transaction state. Don't assume a
  partial update means other fields are absent in `beforeChange`.
- **Verification:** `verify-rbac.ts` extended with a rename check; full gate green on the Rock
  (9/9), test data self-cleaned. Tooling note: `/code-review` resolved to the CodeRabbit plugin
  (name collision); the high-effort correctness pass was done inline instead.

## 2026-06-08 — Product model: authorization entities + sub-strand bundle

Modeled the authorization entities and the sub-strand bundle as **native Payload nested fields**
(SPEC §3, §5, §8), plus the Codex scaffold-hygiene fixes. Collections: `subjects`,
`subject-grades`, role-bearing `users`, and `lesson-bundles`. Verified locally as far as a
DB-less host allows — `generate:types`, config sanitization, `tsc --noEmit`, and `eslint` all
clean; the migration + true end-to-end run happen on the Rock. Decisions and the non-obvious
traps:

- **Content model grounded in real data, not memory.** Shapes were read from the
  fidelity-proven `~/Desktop/ares-docx-fidelity-demo/bio_1_4_data.js` (matches SPEC §3 exactly):
  `rubric[]` = `{criterion, excellent, proficient, developing}`; `sections[]` =
  `{title, prompt, exemplar}`; `framework[].resources` is **absent** in real data → modeled
  optional. `UNIT` is `{}` there → modeled minimally as a single optional `overview` pending a
  populated example.
- **Conflict resolved — admin-panel access.** NEXT-SESSION said "panel = Site Admins only";
  **SPEC §5 (canonical) has Editors/Subject Admins editing via the admin edit screen in Phase 1.**
  SPEC wins: `access.admin` (`adminPanelAccess`) allows **siteAdmin OR subjectAdmin OR editor**,
  excludes plain Teachers. General rule: when NEXT-SESSION (staged plan) and SPEC (canonical)
  disagree, SPEC governs; surface the conflict rather than silently following either.
- **Conflict flagged — phase vocabulary.** The local `cbe-generation-system` checkout is the
  older **Python** generator, so the authoritative Node `docx_kit.js` phase→colour map isn't
  available. The `framework[].phase` dropdown uses the **five phase strings from `bio_1_4`**
  (`Predict Phase`, `Observe Phase`, `Explain Phase`, `Driving Question Board (DQB) Creation`,
  `Model Building Phase`). **TODO: reconcile against the Node generator's colour-map keys when
  the generator integration / ingest lands** — an unknown phase silently degrades output (SPEC §4).
- **Field access gates *values*; a hook gates *structure*.** Payload field-level `update: false`
  silently keeps a field's existing value, but field access **cannot** stop add/remove/reorder of
  array rows. So SPEC §5 is enforced in two layers: per-field access (prose = Editor+, META /
  phase / duration / answer keys = Subject Admin+, resource column + lesson `number` = system-only),
  **plus** `enforceBundleStructure` (beforeChange) which rejects cardinality/order changes by
  non-admins and re-derives lesson numbers from order. Highest-risk surface → security-review.
- **≤1 Subject Admin per subject-grade.** `autoDemotePriorSubjectAdmins` (afterChange) demotes any
  prior holder to Editor in the **same transaction** (`req` threaded) guarded by a `context` flag.
  Scoped role management for Subject Admins is enforced by `enforceAssignmentScope` (beforeChange):
  a non-site-admin may only touch assignment rows for subject-grades they administer.
- **`req.user` carries full role data.** Confirmed in installed source: the JWT strategy
  re-fetches the user via `findByID` (`auth/strategies/jwt.js`), so `roles` and `assignments` are
  always present in access functions; relationships come back as raw IDs at the default auth depth
  (helpers normalize ID-or-object via `toId`).
- **Two Payload-3 gotchas (trust installed source).** (1) A **virtual** field can be `useAsTitle`
  *only* if it maps to a relationship field — so `SubjectGrade.displayName` ("<Subject> — Grade N")
  is a **stored** field maintained by a beforeChange hook, not virtual. (2) `payload generate:types`
  runs **without a DB** (pure config parse) and is a fast local correctness gate; `next build` and
  migrations do need the DB → run on the Rock.
- **Field naming.** Top-level groups are camelCase (`meta`, `unit`, `lessons`, `finalExplanation`,
  `summaryTable`) to avoid uppercase-column oddities; the generator adapter will map them back to
  `META/UNIT/LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE`. Inner keys already match the ARES data verbatim.
- **ESLint fix.** `eslint-config-next` 16 ships native flat-config arrays; wrapping them via
  `FlatCompat.extends('next/...')` double-wraps the flat plugin config and crashes the legacy
  validator ("circular structure"). Fix: import `eslint-config-next/core-web-vitals` and
  `/typescript` and spread them directly (no FlatCompat).
- **Security-review finding (fixed) — don't backfill `name` from `email`.** The first migration
  backfilled the new, publicly-readable `users.name` from the private `email`. Because `name` is
  *intentionally* public (attribution — SPEC §8) while `email` is gated by `emailReadAccess`,
  copying email into name leaked it to any authenticated user for pre-existing rows. Fix: backfill
  with a neutral `'User ' || id` placeholder, not email. **Rule:** when adding a public field to a
  table with rows, never backfill it from a private column — fix the *data*, not the field's
  visibility (locking down `name`'s read would break required attribution). The migration had
  already applied on the Rock, so the data was corrected in place (admin `name` set to "Site
  Administrator") and the committed migration amended for the not-yet-deployed production host;
  amending an applied migration is acceptable here because only the pre-existing-row backfill
  changed — the schema snapshot is untouched and the Rock won't replay it.
- **Admin-panel lockout + bootstrap (fixed).** Gating `access.admin` on siteAdmin/assignment
  (correct per SPEC §5) locked out the *existing* Rock admin, whose `roles` was `[]` — login API
  returned 200 but `/admin` refused entry. Fixed in place (granted siteAdmin). The deeper bug:
  on a *fresh* deploy Payload's first-user creation also yields `roles: []`, so the new admin
  would be locked out too — a bootstrap deadlock. Fix: `grantSiteAdminToFirstUser` (beforeChange)
  forces `roles: ['siteAdmin']` when creating the first user (user count 0). **Rule:** any time
  panel/admin access is gated on a role, ensure the *first* user is granted that role
  automatically, or the system is un-bootstrappable. Lesson on testing: `verify-rbac.ts` passed
  because it created users *with* roles; it didn't cover the role-less pre-existing/first user —
  exercise the bootstrap path, not just the happy path.
- **Email adapter (operations).** Password resets silently no-op'd ("Email attempted without
  being configured") because no email adapter was set. Added a conditional `nodemailerAdapter`
  (enabled when `SMTP_HOST` is set; console fallback otherwise; `skipVerify` so boot isn't
  coupled to SMTP reachability). Gmail SMTP needs a 16-char **App Password** (2FA required), not
  the account password. SPEC §11 wants real email/observability before real users.

## 2026-06-08 — External review (Codex) triaged into the build plan

Codex audited the scaffold against the root docs. Its code reads were accurate and it ran the
real `lint`/`test`/`build` commands (caught genuine tooling breakage). Its weakness was
**urgency calibration**: it reviewed code-vs-root-docs without weighting the staged plan
(this file + `NEXT-SESSION.md`), so "no product model yet" was reported as a defect when it's
the intended scaffold state. Outcome:

- **Actionable items folded into `NEXT-SESSION.md`:** a "scaffold-hygiene" pre-flight
  (npm/pnpm drift in the `test` script; int-test DB host; ESLint flat-config; finish dep
  pinning; Media default-private), plus the security items attached to the auth task
  (`access.admin`; `username` + field-level `email` read). None is a live exploit today
  (only the admin user exists) — they're requirements for the imminent roles work.
- **Prompting lesson for cross-model review:** give the reviewer the plan/stage
  (`SPEC.md` + `DECISIONS.md` + `NEXT-SESSION.md`); ask it to classify findings as
  (a) live risk now / (b) requirement of the next planned task / (c) future, and to check
  exploitability before assigning P1; have it separate scaffold defaults from designed
  choices. Keep leaning on it for running the deterministic commands and (later) security
  review of the access functions.
- Reviews stay **advisory**; the deterministic gate (golden-file diff, type-check, CI) is the
  arbiter — consistent with the 2026-06-07 multi-agent decision.

## 2026-06-08 — Scaffold deployed on Rock 5B; build & DB-init gotchas resolved

Got the Payload + Postgres stack building and running in Docker on the Rock 5B
(`/srv/lesson3`, named volume `lesson3_pgdata`), co-tenant with nanoclaw, `/admin`
serving, first admin user created. Several non-obvious traps, recorded so the
public-production host (identical stack) doesn't re-hit them:

- **`npm ci` failed: "Missing yjs/monaco/@testing-library/... from lock file."**
  Root cause was **not** Node/npm version (that was a red herring that cost time — a
  pinned-npm "fix" was tried and reverted). The scaffold's **`app/.npmrc` sets
  `legacy-peer-deps=true`** (Payload 3 / React 19 / Next 16 peer conflicts), but the
  generated Dockerfile's `COPY` line **didn't include `.npmrc`** — so `npm ci` ran in
  strict-peer mode in the image and rejected the legacy-peer-authored lock. **Fix:**
  add `.npmrc` to the deps-stage `COPY`. Lesson: `.npmrc` must travel into the build;
  when install passes locally but `npm ci` fails only in Docker, suspect a missing
  `.npmrc`/config, not versions.
- **Build then failed at `COPY /app/public`:** the blank Payload template ships no
  `public/` dir but the generated Dockerfile assumes one. **Fix:** committed
  `app/public/.gitkeep`.
- **App ran but `/admin` 500'd: `relation "users" does not exist`.** Production builds
  do **not** auto-push the schema (push is dev-only); production needs **migrations**.
  Verified against installed Payload source: prod default `push:false`, CLI is
  `payload migrate*`, default `migrationDir = src/migrations`.
- **Migrations can't run from the prod image** (minimal Next standalone, no Payload CLI).
  Generated + applied the initial migration from a one-off container built off the
  Dockerfile **`builder`** stage, on the compose network. Initial migration committed
  (`app/src/migrations/*`).
- **Wired migrate-on-deploy:** added a one-shot **`migrate`** service to
  `docker-compose.yml` (builds `target: builder`, runs `npx payload migrate`), gated on
  a new Postgres **healthcheck**; `app` now `depends_on` it via
  `service_completed_successfully`. So `docker compose up -d --build` applies pending
  migrations before the app starts. Idempotent.
- **Open follow-up — schema-change workflow:** generating a *new* migration still needs
  the `builder`/tools image (or local dev) to run `payload migrate:create`; only the
  *apply* step is automated. Document the create step when we first change collections.
- **Latent risk:** dev Mac runs **Node 25**, the build image runs **Node 22** (LTS).
  Regenerate lockfiles in the Node-22 toolchain (or align local dev to Node 22) to avoid
  tree-resolution drift. Not yet fixed.

## 2026-06-07 — Multi-agent review: deferred, with a concrete trigger

Considered bringing in a second agent (OpenAI Codex, and/or **Hermes** — the Nous Research
always-on agent daemon on the MacBook Air, GPT-5.x-capable) to review/test alongside Claude
Code. **Decision: defer. Claude codes; the human is the arbiter; deterministic checks are the
gate.** Rationale and the rules we settled on:

- **Independent cross-model review is valuable** (uncorrelated blind spots), but the *verdict*
  stays deterministic — golden-file DOCX diff, type-check, eventual test suite + CI — never a
  model's opinion. Reviews are advisory input, not a merge gate; never auto-apply a reviewer's edits.
- **One writer, one reviewer, integrate at the PR.** Never two agents editing the same tree.
  Shared constitution: `SPEC.md` is canonical; `CLAUDE.md` (Claude) and `AGENTS.md` (Codex)
  both defer to it — keep the pointers in sync.
- **Do NOT use Hermes as a per-change reviewer** — it has no native git/PR pipeline, so that
  path is glue-building = complexity for no gain (Codex/CodeRabbit/`security-review` cover
  per-change review with full repo context already).
- **Hermes's real niche is out-of-loop, always-on scheduled jobs** (daemon + cron + cross-session
  memory + messaging): nightly fidelity-regression diff with notification, scheduled async GPT-5.x
  review of the day's diff, dependency/backup watches. Nothing else in the stack does this well.
- **Trigger to revisit:** once there is feature code, a test suite, and **CI** (the deterministic
  gate) — *then* Hermes is justified as the async layer that schedules regressions/reviews and
  pings on failure. Not before. CI (GitHub Actions) is the prerequisite and the next infra piece.
- **Cautions for that day:** (1) Hermes's *self-improving skills* cut against a verification
  role's need for consistency — pin/review skill changes, don't let them auto-evolve. (2) Hermes
  overlaps nanoclaw; if adopted it should *replace* a role, not add a fifth standing agent layer.

## 2026-06-07 — Tooling: Payload skill installed; connectors trimmed

- **Payload skill installed** at `.claude/skills/payload/` (`SKILL.md` + `reference/`),
  pulled from `payloadcms/payload@3.x` `tools/claude-plugin/skills/payload/`. This is the
  structural fix for the CLAUDE.md "Knowledge currency" worry (stale Payload 3 APIs) — prefer
  it over memory when working on collections, fields, hooks, access control, versioning.
  Re-pull the same path if it needs refreshing.
- **`laravel-boost` MCP server removed** from `~/Library/Application Support/Claude/claude_desktop_config.json`
  — it pointed at Lesson2's PHP `artisan` (irrelevant to this single-runtime Node project) and
  was failing to connect. Restorable from the Lesson2 repo if ever needed there.
- **Account-level connectors** (trivago, B12, website generators, mcp-registry, etc.) are **not**
  in local config — they're synced from the Claude account and toggled in the app's
  **Settings → Connectors**, not by editing files. Keep computer-use, Claude-in-Chrome/Preview,
  and pdf-viewer (planned uses: DOCX visual-fidelity checks, admin-UI verification, PDF export).
- **Permission allowlist:** committed `.claude/settings.json` holds only read-only MCP entries;
  most frequent Bash commands are already auto-allowed by Claude Code, and the rest are mutating
  or arbitrary-execution and were deliberately left out.

## 2026-06-07 — Scaffold layout, env var, and `output: 'standalone'`

- **Payload scaffolded into `./app`**, not the repo root, to preserve the committed root
  docs and co-tenancy `docker-compose.yml`. `docker-compose.yml` `build:` points at `./app`.
- **Standardized on `DATABASE_URI`.** `create-payload-app`'s blank template (v3.85.0) reads
  `process.env.DATABASE_URL`; changed `app/src/payload.config.ts` to `DATABASE_URI` to match
  the project convention and the committed `.env.example`.
- **Added `output: 'standalone'`** to `app/next.config.ts` — the generated Dockerfile copies
  `.next/standalone` and fails without it.
- **`create-payload-app` is fully scriptable** despite the abbreviated `--help`: the hidden
  flags `--db`, `--db-connection-string`, `--secret`, `--no-git`, `--no-agent` make it
  non-interactive. (The prior session's interactive/PTY blocker was avoidable.)

## 2026-06-07 — bio_1_4 fidelity proof passed

Regenerating the three DOCX from stored data reproduced the stakeholder-approved set
exactly, except the per-phase Resource column (which needs the absent Python recommender).
Validates the core architecture: edit the data, regenerate byte-stable documents.
See assistant memory `fidelity-proof-passed` for the diff detail.
