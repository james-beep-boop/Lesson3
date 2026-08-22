# The System panel — design (2026-08-21)

Manage gets a fifth top-level box, **System**, for Site Administrators: what this installation *is*,
and which of its capabilities are switched on. Operator brief 2026-08-21; it implements
`docs/DESIGN-next-direction-2026-08-19.md` §D1, which is the **single authority** for the deployment
model — the five layers, the env ceilings, the four capability states — so read that section first; this
document is the panel, not the model. (D1 called the panel "Installation" and its amendments lived in a
separate file until the 2026-08-21 consolidation; that file is now a superseded stub.)

⚑ **READ THE "WHERE THE SHIPPED CODE DIVERGES" SECTION BELOW BEFORE TOUCHING PART 2.** Part 1 merged
before these contracts were tightened, so this document describes the target, not the current code.

## The name is "System", and the ids are a URL contract

The operator's first proposal was "System Administration"; D1 called it "Installation". Neither won:

- **"Installation" is too narrow** for the half that holds the switches — turning outbound email off is
  not an installation fact.
- ⚑ **"System Administration" collides with the role vocabulary.** It would sit inches from **Site
  Administrator** and **Subject Administrator**, on a page whose role names have already cost this
  project real rework — "Editor" as a user type, `draft`, `class`. `userTypeLabel` exists to keep the
  three types clean, and a panel whose title contains "Administration" invites "am I a System
  Administrator?".
- **"System" is also parallel**: the other boxes are `Users`, `Curriculum`, `Lesson plans` — plain
  nouns. Two of three words in "System Administration" describe a category of activity, not a thing.

So: `system`, `system.deployment`, `system.features`, added to `PANEL_IDS`
(`components/Manage/panelState.ts`). ⚑ Those ids are a **URL contract** — they appear in bookmarks and
shared links, and the vocabulary has already retired ids twice — so they are settled here rather than
at implementation time.

## Two halves, because the two kinds of setting differ in kind

### `system.deployment` — facts, READ-ONLY, never operator-authored

⚑ **"READ-ONLY" IS THE RULE; "computed" was too strong** (operator correction, 2026-08-21). Most rows are
computed live from env plus a probe and are never persisted — a stored fact is a cache of a fact, and it
goes stale and then lies on the one screen whose purpose is saying what is true. But **backup last
success cannot be computed at all**: it is recorded operational state, required in this panel by
SPEC §11, and it has to be read from an authoritative record of what `scripts/backup-db.sh` did. Both
kinds belong here. What none of them may be is written by an operator on this screen.

⚑ **EVERY PROBE GETS ITS OWN SHORT TIMEOUT AND ITS OWN RESULT.** A dead PDF engine must not delay or
blank the rest of the panel: the probes run concurrently, each bounded independently, each resolving to
available / unavailable / unknown on its own. The panel degrades a row at a time, never as a whole.



Base URL, public-library capability, email configured, error tracking, PDF engine reachable, artifact
cache size and usage, last pre-warm. Reported, not controlled, **with the env var named** so an
operator knows where to change it.

Also the half that answers "is the PDF engine up?", which SPEC §9 records as a single point of failure.
(The read-only-not-computed rule is stated once above; this paragraph used to restate "computed per
request, never persisted" and contradicted it.)

⚑ **This half is where ABSENT capabilities appear** — a capability that is BUILT but whose bits are not
on this box, which is a *fact with an instruction* rather than a control (state 2 of the four in D1).
⚑ **"Not built anywhere" is different and does NOT belong here**: that renders as a disabled row in the
Features half carrying the true reason, because it is a roadmap statement, not something an operator
can act on.

### `system.features` — real toggles, plus one Save

| Flag | Real today? | Renders as a toggle only when | Enforced where |
|---|---|---|---|
| `publicLibraryLive` | **yes** | `PUBLIC_LIBRARY_ENABLED` is set | inside `lib/publicLibrary.ts`'s existing gate |
| an email flag — ⚑ **meaning UNDECIDED, see below** | **yes** | `SMTP_HOST` is set | see below |
| `studentAccess` | no — **not built anywhere** | never, until built | would sit under a new `STUDENT_ACCESS_ENABLED` ceiling |
| `studentQuiz` | no — **not built anywhere** | never, until built | — |

⚑ **A TOGGLE ONLY RENDERS WHEN ITS CEILING IS PRESENT** (operator, 2026-08-21; the earlier table read as
though both always rendered). With no `PUBLIC_LIBRARY_ENABLED` there is no public-library switch — the
row is a *fact* saying the environment forbids it, which is D's absent state, not its present-but-off
state. Same for email with no `SMTP_HOST`.

### ⚑ OPEN DECISION — what the email flag actually means

⚑ **The schema half of this is settled: #268 DROPPED the column.** The decision below is still open, but
it is now open with nothing half-built underneath it — no stored flag, no provenance rows, no name that
presumes an answer. Whichever reading wins arrives as a new column. That is the whole reason for taking
it out early: an unbuilt decision is cheap, and a decision with a migration and an audit table already
betting on one reading is not.

Part 1's plan called it `outboundEmail` and enforced it "at the enqueue boundary". The operator's review
of 2026-08-21 rejected that as shipped-able, on two grounds, both correct:

1. **Enqueue-gating does not stop email.** Already-queued jobs still send, so the flag's label promises
   an egress control it does not deliver. Either enforce at the actual **send** boundary with defined
   handling for queued jobs (drain? drop? hold?), or name it "no new email jobs" and accept that
   previously queued mail leaves.
2. **It bundles consequences that are not alike.** Account verification and password reset are how an
   account stays *reachable*; message pings and emailed documents are conveniences. Turning one flag off
   while open registration and email verification are live could mint accounts that can never verify,
   and make a password-reset request look successful while deliberately producing nothing.

The two candidate readings:

- **Hard egress off** — enforced at the send boundary, queued-job policy defined, and the UI states
  plainly that account recovery stops working.
- **Notifications only** — auth-critical mail is never gated from this panel, and the flag covers
  message pings and emailed artifacts. Narrower, honest, and it cannot lock anybody out.

**Recommendation: notifications only**, because a Site Administrator switching a setting should not be
able to make accounts unrecoverable, and the hard-egress case is already served by removing `SMTP_HOST`
— which is the ceiling, restart-scoped, and therefore honest about being a deployment change. ⚑ Either
way the "needs no warning" line in the original draft was wrong: this flag needs the clearest
consequence text on the panel.

⚑ **At most two flags could ever be real, and after #268 exactly one is.** Error tracking and backups
are boot-wired or run outside the app, so they are *facts*, not switches; ARES resource links would be a
generator change (SPEC §4). A panel of four working toggles would require inventing two — and the
second of the two plausible ones turned out to need a design before it needed a column.

⚑ **The two placeholders render DISABLED WITH THE TRUE REASON, not "coming soon."** For student access
that reason is specific and worth showing: a student would currently be a valid `req.user` for six
authorization gates (D3), so the switch cannot exist before that boundary lands. An operator who reads
that knows it is not a bug.

## Data: one global, typed flags, per-flag provenance

A Payload global (`system-settings`) — the project's first, and it carries a migration.

- **Typed boolean fields** per flag: greppable, type-safe, and the flag vocabulary stays a contract.
- **Per-flag provenance** (operator decision 2026-08-21): a system-written array of
  `{ flag, enabled, changedBy, changedAt }`, one row per flag, upserted by a `beforeChange` hook with
  field access `create/update: () => false`. Exactly the `grantedBy`/`grantedAt` pattern from #258,
  including that **null means *unknown*, never *nobody***.
  - ⚑ **Per-flag, not one pair for the whole global.** "Last change only" was the operator's call, and
    a single pair satisfies it while answering the wrong question — *who last touched settings* rather
    than *who turned student login on*. Per-flag is the same storage class and a migration later.
- `versions: false`. ⚑ If global versioning is ever enabled for history, `drafts` **must** be false:
  `draft` is reserved (SPEC §13) and already means an unofficial saved version.
- ⚑ `maxDepth: 0` on the `changedBy` relationship, for the reason #258 measured: a relationship into
  `users` populates on every read at `config.defaultDepth`.

### ⚑ THE SAVE ENDPOINT MUST BE THE SOLE WRITER (operator blocker, 2026-08-21)

Part 1 shipped `access: { read: siteAdminOnly, update: siteAdminOnly }`, and that makes every ceremony
below **optional**: a Site Administrator can `POST /api/globals/system-settings` — the verb Payload
actually routes for a global update — and bypass the password re-authentication, the freshness token,
the public-exposure acknowledgement, and the intended provenance path. Re-authentication that a normal
REST call skips is UI theatre.

⚑ **THE VERB IS POST.** Measured against the running app: POST → 403, PATCH → 404, PUT → 404. A
PATCH-based test probes a route that does not exist, and passes for the wrong reason the moment its
expectation admits 404 — so the wire test below must use POST.

⚑ **`admin: { hidden: true }` DOES NOT FIX THIS**, which was the tempting reading after that landed:
verified against the installed source, `globals/operations/update.js` never consults `admin.hidden` and
gates purely on `executeAccess`. Hiding the global removed the admin *form*, not the API.

The contract:

| Surface | Rule |
|---|---|
| global `read` | Site Administrator only |
| global `update` | **denied to everyone through ordinary REST/GraphQL, Site Administrators included** |
| the write | a custom endpoint only, using trusted internal access (`overrideAccess: true`) after it has done its own authorization |

The endpoint, in order: authorize the caller → rate-limit → re-authenticate → validate an explicit
**flag allowlist** (never a passthrough of the request body) → validate the required
**acknowledgements** → atomic write → stamp provenance.

⚑ **The wire test is the point**: a Site Administrator's direct `POST /api/globals/system-settings` must
FAIL while the same Site Administrator's Save succeeds. Without that pair, nothing distinguishes this design from part 1's.

**Reads.** The global's own `read` access is Site-Admin-only. The *enforcement* readers are server-only
modules using `overrideAccess: true` — the `lib/publicLibrary.ts` / `lib/editorGroups.ts` pattern —
because the public library route must resolve `publicLibraryLive` with no user at all. That deliberate
bypass is documented at the reader, not left for someone to discover. ⚑ A failed read **fails closed AND
emits a structured operational error**, so a database or configuration fault is distinguishable from a
deliberate off rather than looking identical to it.

**Fail closed**, per the amendments doc: absence, read error, or a stale cached `true` past its TTL all
mean *off*. A read-through cache that serves its last known value on error turns a database blip into
an indefinite public exposure that no operator action ended.

## Save: one re-authentication, no token

Save posts `{ changes, password, expectedUpdatedAt }`. The server verifies the password, applies the
changes, stamps provenance, commits.

- ⚑ **No step-up token anywhere.** Verify-and-write in one request means there is nothing to leak,
  expire, or replay. The operator's brief asked for a password per toggle; one at Save is fewer
  prompts *and* a better audit record — one confirmed intent covering N changes beats N confirmations
  nobody read, and the dialog can list exactly what is about to change.
- ⚑ **The re-auth path needs its own rate-limit bucket, keyed per user AND globally, or it is a
  password-guessing oracle against the Site Admin account.** `hooks/authRateLimit.ts` keys login and
  forgot-password on the *requested* identifier precisely so they are not account-existence oracles;
  this inherits the same obligation. The password must never reach a log.
- `expectedUpdatedAt` → **409**, matching the assignment endpoints ("reload before changing roles"), so
  two Site Administrators with the panel open cannot silently overwrite each other.
- ⚑ **BUT A FRESHNESS TOKEN IS NOT ATOMICITY** (operator, 2026-08-21). Compare-then-write has a window;
  two genuinely simultaneous writers can both read the same `updatedAt` and both proceed. The check must
  be a **conditional update or a row lock** — the precedent is `takeAdminCountLock` in
  `endpoints/userAssignments.ts`, which exists for exactly this and is documented there as load-bearing.
  And the test has to be a real concurrent pair, not a sequential stale-token case: a sequential test
  proves the comparison, never the race.
- ⚑ **THE ACKNOWLEDGEMENT IS SERVER-ENFORCED, or the "blocking" warning is decorative.** A dialog only
  stops a browser. The Save endpoint must reject a transition that requires acknowledgement unless the
  request carries a **versioned** acknowledgement value — versioned so that changing the warning's
  wording invalidates a client replaying the old one.

## Warnings: blocking, dismissible, and in code

A dismissible warning the operator must acknowledge before the change is applied, for flags whose
consequence is not obvious from the label:

- **`publicLibraryLive` → on:** the site becomes visible on the internet. Arguably the most
  consequential switch on the panel.
- **`studentAccess`** when it exists: the privacy and anonymisation consequences.

Copy lives **in code**, not in the global — it is behaviour-tied product copy, not operator data.
⚑ **The email flag needs the CLEAREST warning of the three, not none** — the original draft said it
needed no warning, which was wrong in exactly the direction that matters: whichever reading wins above,
an operator has to be told what stops working. Under "hard egress off" that includes account recovery.

⚑ **Destructive actions are NOT toggles** (operator agreement 2026-08-21). "Permanently delete all
existing student data" as a side effect of flipping a switch is the most dangerous affordance the brief
contained: a mis-click plus a password prompt is not enough friction for irreversible deletion of
children's records. Any such action is a **separate, explicit control** with a typed confirmation
naming counts ("permanently delete 412 student records") and a pre-deletion snapshot — with no path to
it from a toggle row.

## Tests

- **unit** — the `system.*` id vocabulary in `panelState.spec.ts`; the pending-state reducer (toggles
  are pending until Save); warning copy present for the flags that require it.
- **int** — global access by role (Site Admin writes; Subject Admin and Teacher cannot); provenance
  stamped and not restamped on an unrelated save; the fail-closed reader for each enforcement point.
- **http** — the standing rule: 401/403 on the global's **own REST endpoints** as well as the Save
  endpoint, 409 on a stale `expectedUpdatedAt`, 429 on the re-auth bucket, and wrong-password → 401
  with **nothing written**.
- **e2e** — the panel renders for a Site Admin and not for anyone else; the Save flow; the disabled
  placeholders showing their reason.

⚑ **Every guard is mutation-tested before it is called done** — delete it and watch precisely the test
that claims to pin it turn red. DECISIONS 2026-08-20 is mostly about why that is now the standard, and
four of this project's silent-pass defects would have been caught by it.

## ⚑ WHERE THE SHIPPED CODE NOW DIVERGES FROM THIS DOCUMENT

Part 1 merged as #265 (+ corrections in #266) **before** the contracts above were tightened, so this is
a checklist for reviewing existing code against the corrected design — not a description of it. Anything
here is a known gap, not a discovery waiting to happen.

| Contract | Shipped in part 1 | Action |
|---|---|---|
| Save endpoint is the **sole writer** | ✓ **CLOSED in #268** — `access.update: () => false`, so nobody writes through the ordinary door | done. Two things worth carrying forward: `hidden: true` did NOT close it (it hides the admin form; `globals/operations/update.js` gates on `executeAccess` alone), and the guard that actually protects provenance on the trusted path is the `beforeChange` hook, because `overrideAccess: true` bypasses FIELD access too |
| Backup last success + destination in the facts | ✗ omitted | either build it (needs a record source) or the §11 requirement stays outstanding — it is now marked outstanding in SPEC |
| Each probe independently bounded, three-valued | ~ partly: two probes run concurrently and each resolves independently, but they share one `PROBE_TIMEOUT_MS` | give each its own bound when a third probe lands |
| A toggle renders only when its ceiling is present | n/a — part 1 renders no toggles at all | part 2 |
| Fail-closed reads emit a structured operational error | n/a — no readers yet | part 2 |
| Atomic check-and-write, not just a freshness token | n/a — no writer yet | part 2 |
| Server-enforced versioned acknowledgement | n/a — no writer yet | part 2 |
| Email flag semantics | ✓ **the flag was REMOVED in #268**, not renamed — `SYSTEM_FLAGS` is `['publicLibraryLive']` and the column is dropped | no longer a gap in the code. The *design* question (a narrower notifications-only flag) stays open, and now stays open with nothing half-built underneath it |

⚑ **The last row's schema consequence was taken, in the cheap direction.** `features_outbound_email`
existed from #265's migration; rather than rename a column that presumed the rejected reading, #268
dropped it (`20260822_011614_drop_outbound_email_flag` — a UTC-stamped name for a 2026-08-21 decision)
along with its provenance rows, while nothing read it and no installation depended on it. A
notifications-only flag, if the design ever earns one, arrives as a new column with a name that means
what it says.

## Build order

**PR 1 — infrastructure and facts.** The global, its access rules, the provenance hook, the migration,
the computed `system.deployment` half, and the panel scaffold registered in `PANEL_IDS` and
`availablePanels`. No toggles. Provable end to end on its own, and it delivers the "is the PDF engine
up?" answer immediately.

**PR 2 — the flag.** `publicLibraryLive` (singular now — see the table above), its fail-closed reader,
enforcement at both boundaries, Save with re-auth, the atomic check-and-write, the versioned
acknowledgement, the two disabled placeholders, and the blocking warning on going public.

Deliberately not in either: presets, the school-type profiles, and any flag whose enforcement point
does not exist yet.
