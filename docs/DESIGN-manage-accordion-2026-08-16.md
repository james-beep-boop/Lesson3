# Manage page — accordion redesign

**Date:** 2026-08-16 · **Revised seven times the same day** — external review, rebase onto
`origin/main`, then five further external reviews (see §10)
**Status: COMPLETE (2026-08-18).** All five PRs are merged to `main`: PR 1 accordion shell (#239),
PR 2a user-security foundation (#240), PR 2b Users panel (#241), PR 3 Subjects and Subject grades
panels (#244), PR 4 Roles & Access (#245). `main` is green on the full gate at `3969d65`.

⚑ **Two departures from this plan, both deliberate — read them before treating the tables below as
the built design.**
1. **PR 3 did not nest a panel per subject-grade** and PR 4 does not either. §6 says "nest one panel
   per subject-grade", which is not buildable: `PANEL_IDS` is a CLOSED vocabulary and a URL contract
   (D7a's scrub rule depends on it), while subject-grade ids are dynamic. D7 already names the right
   pattern — a per-row **inline row disclosure**, "deliberately named as a distinct pattern so 'two
   levels max' stays enforceable". The `access` panel id is unchanged.
2. **`maySetSubjectAdmin` is a PROP, not a field of the projection.** §6's PR 4 row implies the
   capability rides with the data; it briefly did, which put a presentation flag inside the return
   type of the email-carve-out projection — the one function whose docblock exists to keep its role
   gate, trusted query and projection inseparable. The render site holds `siteAdmin` and passes it.

Everything else was built as specified. `docs/DECISIONS.md` (2026-08-18) records D6a and D11a,
including why PR 4's first D6a test could not fail.
⚑ **Vocabulary (amended 2026-08-17):** three user types — Teacher, Subject-grade administrator, Site
administrator. **"Editor" is not one.** A Teacher may hold **editing access** for particular
subject-grades without changing type; the stored `role: 'editor'` value and names built on it stay as
implementation identifiers. The §10 review log preserves the older wording as a historical record —
do not carry it into new panels, labels or tests. Canonical: `SPEC.md` §8.
**Five PRs**, not four: PR 2 is split into 2a (security foundation) and 2b (panel UI).
**Verified against:** `7ecf7d0` (`origin/main` as of 2026-08-16). Every file:line citation below was
re-checked at that commit.
**Author:** Claude, from an operator-led design discussion on 2026-08-16.
**Scope:** The Manage page (`/admin`, the custom Payload dashboard view) and the three back-office
collection views it currently links out to.

This document is written to be reviewable **without** the discussion that produced it. Every factual
claim about current behaviour carries a file reference so a reviewer can check it rather than trust
it. Where a decision reversed during the discussion, the reversal and its cause are recorded, because
the reasoning is the durable part.

---

## 1. Why this exists — the operator's brief

The operator opened with six observations about Manage:

1. **"People" is the wrong word** — it should be "Users".
2. **Clicking a management function should not navigate to a new page** — it should open an
   accordion in place.
3. **Each accordion needs a search bar** near the top.
4. **The "look" of those linked-to pages is inconsistent** with the rest of the app — wrong
   typefaces, wrong hierarchy, wrong spacing, grey bars.
5. **The top-level accordion should be "My Account"** — email, password and other account functions.
6. **The main accordions** should be My Account, People, Subjects, Subject Grades, Editing Access and
   Lesson Plans for a Site Administrator, with reduced sets for lesser roles — and second-level
   accordion behaviour should be discussed.

Underlying all six: **as users and subjects grow, the page becomes long and unwieldy.**

Three further constraints emerged during the discussion and are load-bearing for what follows:

- **Many deployments will have no reliable email access.** The app may run on local servers where
  users' only email is on their phones. This breaks every email-dependent recovery path.
- **Students are a planned future user class**, far more numerous than teachers, needing only a
  quiz feature that does not yet exist.
- **Roughly 100+ users today**, growing.

---

## 2. What exists today (verified)

### 2.1 Manage itself is already app-styled

Manage is a **custom Payload admin view**, registered as `admin.components.views.dashboard`
([payload.config.ts:115](../app/src/payload.config.ts:115)) and implemented in
[components/AdminDashboard/index.tsx](../app/src/components/AdminDashboard/index.tsx). It deliberately
strips Payload's chrome — nav sidebar, hamburger toggler and breadcrumb header — via a `:has()`
selector at [custom.scss:564](<../app/src/app/(payload)/custom.scss:564>), and renders the frontend's
own `AppNav` in its place. That is *why* Manage looks like the app.

Four panels on it are already bespoke and consistent:

| Panel | Component | Notes |
|---|---|---|
| Editing access | `AdminDashboard/EditorsWidget.tsx` | Grant/remove editing access per subject-grade |
| Upload lesson plans | `UploadBundles` | |
| Delete lesson plans | `AdminDashboard/DeletePlansPanel.tsx` | Has search; subject-grade → strand → plan tree with group checkboxes |
| Candidate versions | `AdminDashboard/CandidateList.tsx` | |

A shared search input class already exists: `.lp-admin-list__search`
([custom.scss:594](<../app/src/app/(payload)/custom.scss:594>)).

### 2.2 The inconsistency is structural, not cosmetic

Three links under "Curriculum & people"
([AdminDashboard/index.tsx:371-391](../app/src/components/AdminDashboard/index.tsx:371)) point at
Payload's **native collection list views**:

- People → `/admin/collections/users`
- Subjects → `/admin/collections/subjects`
- Subject grades → `/admin/collections/subject-grades`

Those routes do not match the `body:has(.lp-admin-dash)` selector, so they retain the full Payload
shell: sidebar, breadcrumbs, Payload's own type scale, grey zebra table rows, a "Columns / Filters"
bar and "Per Page" pagination. Clicking a row then opens Payload's native document form — a second,
deeper layer of the same mismatch.

**This cannot be fixed by restyling.** Widening the `:has()` selector to cover collection views would
mean re-theming Payload's entire list-and-document UI, which is a far larger surface than replacing
the three views we actually need.

### 2.3 The native Users table also reads *wrong*

`roles` is a `select` whose only option is `siteAdmin` ([collections/Users.ts](../app/src/collections/Users.ts)).
Subject Administrator and editing-access grants live in `assignments`, not `roles`. So the native
table's "Roles" column renders **empty for a Subject Administrator and empty for a Teacher with
editing access**. A management
table that shows nothing in the roles column for a person who administers a subject grade is not
merely ugly — it is misleading. This is an independent argument for replacement.

### 2.4 Who can reach Manage

`canUseAdminPanel` ([access/index.ts:90](../app/src/access/index.ts:90)) is
`isSiteAdmin(user) || Boolean(user?.assignments?.length)`. **Plain Teachers cannot reach `/admin` at
all** (SPEC §2 redirects them out via `AdminUnauthorizedRedirect`). Teachers are the default role and
presumably the bulk of users.

⚑ **The app now has an unauthenticated surface** (public discovery, merged in #219/#220 and specified
in `docs/DESIGN-public-library.md` + SPEC §2 "Deployment modes and public discovery"). An earlier
draft of this document asserted there was none; that is no longer true. It does **not** change
anything about Manage — the public surface is a separate, opt-in deployment feature
(`PUBLIC_LIBRARY_ENABLED === '1'`, [lib/publicLibrary.ts:34](../app/src/lib/publicLibrary.ts:34)),
server-side gated by `requirePublicLibrary()`, refusing to boot if enabled without a `SERVER_URL`,
and it exposes only deliberately-published plans through their current Official pointer. Crucially it
is **not** general anonymous collection read: `lessonPlanRead` remains `Boolean(user)` (§2.5/D8), and
the public path goes through its own narrow resolver. The consequence for this plan is confined to
D9.

### 2.5 Access data model

Every account is one of the three user types in SPEC §8. The table below is narrower: it describes
the additional authorities/capabilities stored on an account, not a fourth account taxonomy.

| Authority / capability | Stored as | Scope | Who may give it **today** |
|---|---|---|---|
| Site administrator | `roles: ['siteAdmin']` | global | Site Admin only |
| Subject administrator | `assignments[]` row | one subject-grade, **≤1 person** | Site Admin **and Subject Admin within own scope** — see ⚑ below |
| Editing access | `assignments[]` row with role `editor` | one subject-grade, many people | Site Admin; Subject Admin within own scope |

A **Teacher** is the baseline user type, not an entry in this authority table. A Teacher may hold
zero or more editing-access grants without changing type.

⚑ **Corrected 2026-08-16 after external review.** An earlier draft of this table claimed Subject
Administrator could be granted only by a Site Admin. That is **not** what the code does.
`enforceAssignmentScope` ([hooks/userRoles.ts:96](../app/src/hooks/userRoles.ts:96)) collects the
subject-grade of every *touched* assignment row and requires `isSubjectAdminFor(actor, sgId)` — it
**never inspects the row's `role` value**. Its only role-sensitive rule is that a *Site Admin's*
assignments may be changed only by a Site Admin. So today a Subject Administrator may write a
`subjectAdmin` row within a grade they administer, i.e. appoint a successor (and, via
`autoDemotePriorSubjectAdmins`, demote themselves to editor in the process). SPEC §8's wording —
"manage scoped roles" ([SPEC.md:402](../SPEC.md:402)) — is ambiguous and does not settle it either
way. **Resolved by the operator: see D6a (Option B).**

Server-side machinery already in place:

- `enforceAssignmentScope` (beforeChange) — gates *which* assignment rows an actor may change.
- `autoDemotePriorSubjectAdmins` (afterChange) — enforces ≤1 Subject Admin per subject-grade.
  ⚑ Per [access/index.ts:119](../app/src/access/index.ts:119), the demote path **rewrites the
  outgoing administrator's `subjectAdmin` row to `editor`** — it does not remove them.
- `POST /api/users/:id/assign-editor` and `/unassign-editor`
  ([endpoints/userAssignments.ts](../app/src/endpoints/userAssignments.ts)) — narrow, one-row deltas
  requiring `expectedUpdatedAt`, rejecting a stale page with 409, rebuilding `assignments` from the
  fresh row so a concurrent admin's change cannot be clobbered.

### 2.6 Email, password and verification

- `email.access.update` is `siteAdminField` — **self-service email change is already blocked**, with
  a comment explaining why (Payload verifies only on create, so an update would let a verified
  account claim any unregistered address without proving ownership).
- `_verified.access.update` is `siteAdminField` — manual verification is already a Site-Admin repair
  action.
- `guardPasswordChange` ([hooks/userRoles.ts:56](../app/src/hooks/userRoles.ts:56)) permits a password
  update by **self or a Site Admin**.
- `forgotPasswordOperation({ disableEmail: true })`
  ([endpoints/forgotPassword.ts:89](../app/src/endpoints/forgotPassword.ts:89)) **mints a reset token
  and returns it without sending anything.**
- The reset link format is `${emailLinkBase()}/reset-password?token=…`
  ([jobs/passwordResetEmail.ts:75](../app/src/jobs/passwordResetEmail.ts:75)), and
  `/reset-password` plus `ResetPasswordForm` already exist and consume it.

Three further facts, established during external review on 2026-08-16 and load-bearing for D5:

- **The reset token expires after one hour.** `Users.auth` sets `tokenExpiration` but **no**
  `forgotPassword.expiration` override ([collections/Users.ts:47](../app/src/collections/Users.ts:47)),
  so Payload's installed default of `3_600_000` ms applies.
- **`forgotPasswordOperation` fires the public auth rate limiter.** `rateLimitAuthOperations` is a
  collection `beforeOperation` hook that keys on `operation === 'forgotPassword'`
  ([hooks/authRateLimit.ts:74](../app/src/hooks/authRateLimit.ts:74)), and the forgot-password
  operation does run collection `beforeOperation` hooks — this is already documented in
  [endpoints/forgotPassword.ts](../app/src/endpoints/forgotPassword.ts) as the reason the existing
  throttle still bites through the shadowed endpoint. Any new caller inherits it.
- **The delivery job reads the user's *current* token at send time**, not a token captured at
  enqueue ([jobs/passwordResetEmail.ts:57](../app/src/jobs/passwordResetEmail.ts:57), which reads
  with `showHiddenFields`). Its module header already notes that a second reset before the job runs
  means the job sends the newest link.

### 2.7 Taxonomy delete guards already exist

`guardSubjectGradeDelete` and the Subject equivalent already **block** deletion on referenced content
with an actionable 409, and **cascade** dangling assignment rows; a Subject cannot be deleted while it
still has subject grades. Covered by
[tests/int/taxonomyDelete.int.spec.ts](../app/tests/int/taxonomyDelete.int.spec.ts). The FK shape is
documented there as `ON DELETE SET NULL`.

### 2.8 Known gaps this redesign will expose

- **No last-Site-Admin guard.** Nothing found in `src/` prevents deleting — or demoting — the only
  Site Administrator, which would lock the installation out of its own administration.
- **No self-delete guard.**
- **User delete does not cascade authored versions.** `users.hooks.beforeDelete` cascades favorites,
  messages and edit-recovery only. `lesson-bundle-versions.author` is a plain relationship
  ([LessonBundleVersions.ts:159](../app/src/collections/LessonBundleVersions.ts:159)) with no cascade
  hook — **but the FK itself is `ON DELETE set null`**
  ([migration 20260702_015014:35](../app/src/migrations/20260702_015014_add_version_author.ts:35)).
  *Resolved 2026-08-16 during external review; this was open item 1 and is now closed.* Deleting a
  user therefore leaves their versions in place with a null author, which is exactly what Manage
  already renders as an absent author name.

These gaps exist today. They matter more once a convenient delete button exists.

⚑ **Any last-Site-Admin guard must be concurrency-safe.** A read-then-write hook ("count admins,
reject if one") is racy under READ COMMITTED: two concurrent demotions or deletions each observe a
count of two and both commit, leaving zero.

**Use a transaction-scoped advisory lock with one fixed key shared by every operation that can reduce
the administrator count** — grant, demote, delete and (per D13a) disable — taking the lock *before*
the count and doing the write inside the same transaction. A per-user key would not serialize two
*different* administrators being demoted concurrently, which is the actual failure mode. Pick a
second int distinct from the existing `(1280527187, 1)` bootstrap key used by
`grantSiteAdminToFirstUser` ([hooks/userRoles.ts:32](../app/src/hooks/userRoles.ts:32)).

**Why an advisory lock rather than `lockRows`.** As of #221/#224 the project has a purpose-built row
locker, `lockRows(source, table, ids)`
([lib/txDb.ts:109](../app/src/lib/txDb.ts:109)) — ascending-id ordering to avoid deadlocks, ids bound
as parameters, and `requireTransaction: true` so it **refuses** rather than silently locking nothing
outside a transaction. That is the right tool for a race over *known rows*, and
`autoDemotePriorSubjectAdmins` now uses it. The last-admin invariant is different in kind: it guards
an **aggregate condition** ("at least one administrator remains"), and the row set it would need to
lock is exactly the set the count is about — so a row lock would have to cover every current
administrator and re-read after acquiring, which is strictly more fragile than one fixed key.

⚑ Whichever is used, follow the discipline #221 established: **a lock that holds nothing must fail,
not no-op.** That commit ("three row locks could silently hold nothing") exists because a
pool-fallback lock left the race wide open with nothing to say so. Do not reintroduce that shape.

---

## 3. Decisions

Each decision records what was decided and why. Where the discussion changed its mind, that is stated.

### D1 — "Users", universally

"People" becomes "Users" everywhere: the accordion, the Payload nav group label, and
`docs/DESIGN-user-model-language-2026-07-29.md`. The three *type* labels are unchanged (Teacher /
Subject-grade administrator / Site administrator).

When students arrive they get their own "Students" accordion. Because they will be a **separate
collection** (D8), "Users" stays accurate rather than quietly meaning "staff users".

### D2 — In-page disclosure, not navigation

The Users, Subjects and Subject Grades views move **into Manage** as accordion panels with in-panel
CRUD. Payload's native list routes for those three collections redirect to Manage, mirroring the
existing treatment of the `Lesson plans` nav group
([custom.scss:548](<../app/src/app/(payload)/custom.scss:548>) and `RedirectToManage`). The
collections stay non-`hidden` so their **document** routes remain reachable as an escape hatch —
Payload 404s the document routes of hidden collections, and the lesson-plan repair flow depends on
that.

This extends rather than reverses an existing decision: the 2026-07-01 note at
[AdminDashboard/index.tsx:33](../app/src/components/AdminDashboard/index.tsx:33) already records that
the editors widget is *deliberately* not the native Users table.

Most writes can go through Payload's existing REST routes (`POST/PATCH/DELETE /api/subjects`, etc.),
which are already access-controlled server-side. New endpoints are added only where a narrower or
freshness-guarded operation is genuinely required (D5, D6).

### D3 — Search per panel, where the panel is a list

Search appears in Users, Roles & Access, Subjects, Subject Grades, Delete lesson plans and Candidate
versions. Not in Upload — a search box over two controls is noise. Per-accordion search rather than
one global search that opens matching accordions: simpler, and `DeletePlansPanel` already models it.

### D4 — My Account is **dropped** from this project *(reversal)*

The brief asked for a top-level "My Account" accordion with email and password change. During the
discussion the operator ruled out **both** email change and password change for now. What remains is
a single editable field — display name. Everything else such a panel would show (your type, your
scope lines, your login email, Messages, Log out) is **already in the avatar menu**
([components/UserMenu/index.tsx](../app/src/components/UserMenu/index.tsx)).

There is also an audience problem: Manage is unreachable by plain Teachers (§2.4), so account
self-service placed there would be invisible to most users.

**Decision:** no My Account accordion. Add "Change display name" to the existing avatar dropdown,
which is shared by both surfaces and therefore reaches everyone. Revisit a real account page if and
when self-service email or password change is wanted.

Note that self-service email change is *already* blocked at the field level (§2.6), so that half of
the operator's instruction requires no work.

### D5 — Password recovery by **admin-revealed reset link** *(reversal)*

**Problem.** With no reliable email (§1), a user who forgets their password is permanently locked
out — `/forgot-password` emails a link they will never receive. A new user never receives their
verification email and cannot activate.

**First proposal, rejected:** let a Site Admin type a new password, plus a
force-change-on-next-login flag so the admin's knowledge of it is short-lived. Rejected because the
flag requires exactly the self-service password-change UI the operator deferred, plus a login gate on
both surfaces — and it still means the admin knows the password.

**Decision:** a Site-Admin action that mints a reset token via
`forgotPasswordOperation({ disableEmail: true })` and **displays the resulting
`/reset-password?token=…` link once, on screen**, for the administrator to hand over in person, by
phone, or by message. The user then sets their own password through the existing, already-hardened
flow.

|  | Admin learns password? | New UI | Force-change flag |
|---|---|---|---|
| Admin types a password | **yes** | password field | needed → drags in deferred work |
| …plus force-change | yes, briefly | field + change page + login gate | needed |
| **Reveal a reset link** | **no** | one button + copyable link | **not needed** |

Constraints on the implementation:

- **The token must never reach the application logs.** It is a live credential and the logger is a
  JSON stream. See the honest limits on this below.
- Shown once; not persisted in page state after dismissal.
- **Grants no new power.** A Site Admin can already set any password via `PATCH /api/users/:id`
  (§2.6). This makes existing authority usable without email. Recording this explicitly so it is not
  later mistaken for a privilege escalation.

#### D5a — Three interactions raised in external review (2026-08-16)

**(i) The public rate limiter.** `forgotPasswordOperation` fires `rateLimitAuthOperations` (§2.6), so
a naive implementation would consume the public per-address and site-global daily forgot-password
budgets.

**Decision: the admin path must NOT be gated by the public budget.** The decisive argument is
availability, not convenience: in a no-email deployment this endpoint is the *only* account-recovery
path in the product. If an attacker (or ordinary traffic) exhausts the site-global daily budget, an
administrator standing next to a locked-out teacher must still be able to recover the account. Gating
the fallback on the same budget as the thing it is a fallback for defeats its purpose. It takes its
own modest cap instead, keyed to the authenticated administrator.

⚑ **Name the mechanism, don't leave it to implementation** (added in review round 2). "Not gated by
the public budget" is a requirement, not a design, and the obvious cheap implementations are wrong —
sniffing `req.user` inside `rateLimitAuthOperations` would exempt *any* authenticated caller, which
is a bypass rather than a carve-out.

The mechanism: a **server-only `req.context` flag**, set by the admin endpoint **only after** two
things have both happened — the caller has been authorized as a Site Admin, **and** the
admin-specific cap has been consumed. `rateLimitAuthOperations` skips the public budget only when
that flag is present. `req.context` is server-side and cannot be set by a request body, which is the
property that makes this safe.

Two tests, not one: the admin path is not throttled by the public budget, **and the ordinary public
`POST /forgot-password` still is**. The second is the one that catches a carve-out that quietly
became a bypass.

**(ii) A queued job can email an admin-minted token.** Because the delivery job reads the user's
current token at send time (§2.6), a job queued by the *user's own* earlier forgot-password request
will send whatever token is live when it runs — including one an administrator has just minted for
hand-delivery.

**Classification matters here: this is a confusion bug, not a leak.** The job sends to `user.email`,
the account owner's own address, and the administrator already holds that token by design. Nothing
crosses a trust boundary. The defect is that a user receives an unexpected password-reset email for a
reset they did not request, which in a no-email deployment they will never see anyway. **Decision:**
document the behaviour; if it proves confusing in practice, cancel pending `passwordResetEmail` jobs
for that user when an administrator mints a token. Not a blocker.

**(iii) The token travels in a URL query string.** It therefore reaches the web server's and any
reverse proxy's access logs, and persists in browser history.

**This is a pre-existing property of the shipped reset flow, not something this feature introduces** —
the email path already sends `…/reset-password?token=…` and `/reset-password` already consumes it.
The admin path inherits the exposure rather than creating it, so fixing it properly (a URL fragment,
or a short one-time handover code exchanged for a token) would improve **both** paths and is its own
piece of work, not a gate on this one.

What this feature must nonetheless specify, because it is cheap:

- `Cache-Control: no-store` on the endpoint response and the panel view that renders the link.
- A restrictive `Referrer-Policy` so the token is not forwarded off-site from `/reset-password`.
- Scrub the token from the URL on `/reset-password` after it is read.
- Explicit redaction: the token must not appear in the endpoint's structured log line.

**(iv) Expiry is one hour** (§2.6), Payload's default, with no override. **Operator decision
2026-08-16: leave it at one hour**, and have the administrator mint the link at handover time.
Raising it would have meant an explicit `forgotPassword.expiration` in `Users.auth`, lengthening the
window for *every* reset token including emailed ones — weakening the normal path to serve an edge
case. The panel copy should therefore say the link expires in an hour, so an administrator does not
mint one in the morning for an afternoon handover.

Verification uses the simpler route: a **"Mark verified"** action writing `_verified`, which is
already Site-Admin-updatable.

### D6 — One place to grant access: **"Roles & Access"**

The operator's rule: there must not be two places to grant any privilege. Today there are — the
Editing access widget, and the native Users table's `roles`/`assignments` fields.

Two candidate homes were considered:

- **Person-centred** — find the person, edit their grants. Reads naturally ("Jane joined, give her
  access") but answers the *common* question badly: "who can edit Biology Grade 10?" becomes a scan
  of every user, growing without bound.
- **Subject-grade-centred** — the existing `EditorsWidget` model. Bounded by curriculum size
  (dozens) permanently, matches the frequent operational task, and is the code that already exists
  with its endpoints and per-role test.

**Decision: subject-grade-centred, renamed "Roles & Access"**, extended to grant Subject
Administrator as well as editing access.

**One necessary exception:** the Site Administrator grant is global and has no subject-grade to hang
from, so its toggle lives in the Users panel. That is the only grant control there.

Users *displays* each person's grants **read-only**, with a link that opens Roles & Access at the
relevant group. Read-only display in two places is fine; two places to *change* is what causes drift.

⚑ **Doc consequence:** SPEC §8 and `CLAUDE.md` both name "Manage → Editing access" for the email
carve-out, and `CLAUDE.md` flags it with "read SPEC §8 before 'fixing' it as a leak". Both must be
amended **for the rename only**.

⚑ **The carve-out does NOT widen** (corrected in review round 2). An earlier draft claimed its
justification "strengthens" because disambiguation would now precede handing over *administrator*
rights. That was written before D6a resolved to Site-Admin-only, and D6a makes it false: only Site
Administrators may grant `subjectAdmin`, and they already have general email visibility under
`emailReadAccess`, so the carve-out does no work for them. **For Subject Administrators — the people
the carve-out actually exists for — it remains justified by exactly what it was justified by before:
granting and revoking editing access.** The SPEC amendment must say that rather than broaden the
stated exception; broadening a deliberate privacy exception on the strength of a superseded draft
is precisely the drift the ⚑ in `CLAUDE.md` warns about.

⚑ **Wording trap:** the Subject Administrator confirmation must say the outgoing administrator
**"will become an editor for this subject grade"**, not "will be removed" — see §2.5.

### D6a — Subject Administrators may NOT appoint their successor *(operator decision, 2026-08-16)*

Raised by external review. §2.5 records the corrected current state: **today they can**, because
`enforceAssignmentScope` gates *which subject-grade* a row belongs to and never *which role* the row
grants. SPEC §8's "manage scoped roles" does not disambiguate.

**Decision: Site Administrators only.** "≤1 per subject-grade" combined with "the incumbent chooses
who replaces them" is an unusual governance property for a role that also controls marking versions
Official. The rejected alternative — letting them appoint — would additionally have required a
conspicuous confirmation, since appointing a successor demotes the incumbent to editor via
`autoDemotePriorSubjectAdmins`, i.e. an administrator could strip their own rights in one click.

⚑ **This is a behaviour change to shipped code, not merely a UI choice, and hiding the picker is not
the fix.** The generic `PATCH /api/users/:id` authority already permits the write. It requires a
**server-side guard in `enforceAssignmentScope`** rejecting a non-Site-Admin actor who adds, removes
or changes any row whose `role` is `subjectAdmin`, plus a wire-level test proving a Subject Admin's
direct PATCH is refused rather than merely absent from the UI.

⚑ **Check for existing Subject-Admin-granted administrators before shipping.** Because the current
code permits it, a deployed installation may already contain `subjectAdmin` rows written by a Subject
Administrator. The guard changes what is permitted going forward; it does not retroactively invalidate
existing grants, and it should not try to.

SPEC §8 must be amended to state this explicitly rather than leaving "manage scoped roles" to be
re-litigated.

⚑ **What a Subject Administrator SEES, specified (review round 3).** The target IA implied they get
the picker, which D6a takes away. They must see **who the current Subject Administrator is** — that is
useful, scoped information they already effectively hold — rendered **read-only**, with no picker and
no remove control. Their editing-access list is unchanged and fully interactive.

**This needs its own E2E assertion, not just the server-side PATCH test.** A guard that refuses the
write while the UI still offers the control produces an administrator who clicks, sees an error, and
concludes the app is broken — the same "explain, don't just remove" principle the 2026-07-28 decision
applies to phone editing (D12). The server test proves the boundary holds; the E2E test proves nobody
is invited to cross it.

### D7 — Accordion mechanics

- **Two levels maximum.** A per-row edit form is an **inline row disclosure**, deliberately named as
  a distinct pattern so "two levels max" stays enforceable.
- **Nested panels only where the data is already a tree**: Roles & Access (one per subject-grade),
  and Lesson Plans (Upload / Delete / Repair).
- **The delete-plans curriculum tree keeps its current idiom untouched.** It shares `groupLessons`
  with the library catalogue so the two cannot drift on ordering or group naming; converting it to a
  third accordion level would break that and bury rows three clicks deep.
- **Same component for every role**, gated by which sections they see — one code path, one visual
  language. **Auto-expand when a role has only one section**, so nobody clicks to reveal their only
  panel.
- **Multiple panels may be open at once.** This is a disclosure list, not a strict accordion; an
  admin comparing Users against Roles & Access should not have one snap shut.
- **Open state lives in the URL query** (e.g. `?open=users,access`). React state alone is lost on a
  genuine full page load — arriving at `/admin` fresh, a bookmark, a shared link, a browser reload —
  and the URL is also what makes the Users → Roles & Access jump link work, with back-button
  behaviour for free. **No localStorage.**

  ⚑ **Corrected in review round 5:** an earlier draft justified this partly by saying "an upload
  reloads the page". It does not — `UploadBundles` calls `router.refresh()`
  ([UploadBundles/index.tsx:80](../app/src/components/UploadBundles/index.tsx:80)), exactly as
  `EditorsWidget` does after a grant. `router.refresh()` re-renders server components while
  **preserving client state**, so neither is a case where React state is lost. The conclusion stands
  on the genuine-page-load cases above; the example was wrong and is removed rather than left
  propping up a right answer.

#### D7a — URL state mechanics (specified after external review, 2026-08-16)

The first draft said "open state lives in the URL" without saying how, which would have led to
`router.push` on every toggle — re-running the dashboard server component and its queries, and
pushing a history entry per open/close. Both are wrong. Precisely:

- **Ordinary toggles use `window.history.replaceState`.** No RSC navigation, no refetch, no history
  entry. The panel's open state is client state that is *mirrored* into the URL for reload survival,
  not state the server renders from.
- **Cross-panel jumps use router navigation with `push`**, so the jump is one meaningful, reversible
  history entry — the Users → Roles & Access link is the only such case today.
- **Nested state needs its own parameter.** `?open=users,access` cannot express *which*
  subject-grade group to reveal, which the jump link requires. Encode the target separately, e.g.
  `?open=access&at=sg-12`; `at` is consumed on arrival and then scrubbed by `replaceState`.
- **After a jump:** scroll the target group into view and move focus to its heading, matching the
  focus discipline already used in `UserMenu`. Respect `prefers-reduced-motion`.
- **Unknown, stale or role-inaccessible panel ids are ignored silently** and scrubbed from the URL.
  A Subject Admin following a link containing `open=users` must land on a normal page, not an error
  and not an empty panel implying something was hidden from them.
- **A11y:** APG disclosure pattern — `<h2><button aria-expanded="…" aria-controls="…">` — matching
  the pattern already used in `UserMenu` (Escape returns focus to the trigger).
- ⚑ **Closing a panel must NOT unmount it** (specified in review round 5; the first draft left this
  undefined, which would have been settled by whichever `{open && <Panel/>}` an implementer typed
  first). **Panels stay mounted and are hidden with the `hidden` attribute.**

  This is not a preference — today's panels hold consequential local state that a stray click on a
  heading would otherwise destroy:

  | Panel | State lost on unmount |
  |---|---|
  | `DeletePlansPanel` | the selected rows **and** the active search — a multi-select assembled across a curriculum tree |
  | `UploadBundles` | the chosen files, including the native input's value |
  | `EditorsWidget` / Roles & Access | the pending per-group picker selections |

  Losing an upload selection or a half-built delete set to an accidental toggle is real destroyed
  work, and the accordion is precisely the affordance that makes such a click easy.

  **Lazy Users (D11) mounts on first open and then stays mounted** — "lazy" means *deferred first
  fetch*, not *remount on every open*; re-fetching a paginated search on every reopen would also
  discard the administrator's query and page position.

  Needs one E2E assertion: type a search, select rows, close the panel, reopen it, and find both
  intact.
- **Heading sizes come from the existing scale**, not new values. A top-level accordion header *is*
  the 20px section heading it replaces; nested panels take 18px. See
  [app/src/app/app-tokens.scss](../app/src/app/app-tokens.scss), whose comments make the 20/18/16
  choice a rule rather than a preference.

### D8 — Students: a separate collection *(future work; recorded because it constrains today)*

The operator's requirements: students need credentials (for progress tracking), need **no** lesson
plan access at all, need **no** messaging, and need **no** favorites — only quiz questions and
answers.

⚑ **This decision's original rationale was wrong and is corrected here (external review,
2026-08-16).** The first draft argued that a separate collection would *by itself* keep students out
of the lesson library. **It would not.** Payload's JWT strategy reads the collection name from the
token, loads the document from *that* collection, and places it in `req.user`
([node_modules/payload/dist/auth/strategies/jwt.js:66](../app/node_modules/payload/dist/auth/strategies/jwt.js:66)).
An authenticated student therefore makes `Boolean(req.user)` **true**, and
`lessonPlanRead` / `lessonBundleVersionRead` / `usersCollectionRead` — all literally
`({ req: { user } }) => Boolean(user)`
([access/versioning.ts:16 and :48](../app/src/access/versioning.ts:16),
[access/index.ts:157](../app/src/access/index.ts:157)) — would admit them regardless of which
collection they live in. **Both options require changing those gates.** The claim that separation
avoids the rewrite was false.

**The decision still stands, for a narrower and more honest reason: allowlist versus denylist.**

- With a separate collection, the staff gate becomes a **positive principal check** —
  `user?.collection === 'users'`. When a *third* principal type appears later, it is excluded by
  default. The check fails closed.
- With a `student` role inside `users`, the gate becomes a **negative check** —
  `Boolean(user) && !user.roles?.includes('student')`. A fourth role added later is admitted by
  default. The check fails open.

Given how much of this codebase's audit history is about failing closed, an allowlist is the right
shape. The supporting reasons are unchanged and still hold: student accounts have a different
lifecycle (bulk-enrolled, likely no email, while `users` auth requires a unique email); a student can
never accidentally receive an `assignments` row; and roster queries stay staff-scale by construction
rather than by remembering a filter. The one real cost of separation — the `Messages` FK — is
removed entirely by "no messaging for students".

**Decision: a separate `students` collection, with no shared relationships.**

**Hard prerequisites, which belong to the students project, not this one.** Recording them here so
D8 is not later read as "separation was sufficient":

1. Convert every staff-only access rule from `Boolean(user)` to an explicit principal check.
2. Audit every access function, endpoint, server component and helper that assumes `req.user` is a
   `User` — including `req.user` casts such as `(req.user as User)` in the hooks, which would
   silently mistype a student.
3. Add **cross-principal tests** proving a student token cannot read users, lesson plans, versions,
   messages or favorites, and cannot reach `/admin`.

**What this constrains today:** nothing must foreclose it, and nothing should assume "Users = every
human with an account". Practically that means the Users search endpoint takes an explicit type
filter from day one and we never write "fetch all users into the client".

### D9 — Anonymous quizzes: a self-contained demo only *(future work)*

A general anonymous mode was considered and rejected by the operator in favour of **a single demo
quiz** unconnected to the rest of the system, storing no records of anonymous users.

⚑ **Rationale updated 2026-08-16 after rebasing onto `origin/main`.** The original argument was that
the app has no unauthenticated surface at all. **That is no longer true** — public discovery shipped
in #219/#220 (§2.4). The decision is unchanged, but the reasoning improves: there is now a **shipped
precedent to copy** rather than a boundary to defend. `docs/DESIGN-public-library.md` and
`lib/publicLibrary.ts` establish the house pattern for a public surface, and a demo quiz should
follow it rather than invent a second one:

- **Opt-in by explicit env flag**, matching `PUBLIC_LIBRARY_ENABLED === '1'`
  ([lib/publicLibrary.ts:34](../app/src/lib/publicLibrary.ts:34)) — never inferred from `SERVER_URL`.
- **Server-side 404 from every route when disabled**, via a `requirePublicLibrary()`-shaped guard.
  Hiding the UI is not the boundary.
- **Fail-closed at boot** if enabled in an incoherent configuration, as `publicLibraryBootRefusal`
  does.
- **No general anonymous collection read** — a narrow resolver only.

The original point that still stands: a stateless demo quiz needs no principal, so it avoids the
records, rate-limiting and abuse surface a real anonymous student mode would require.

### D10 — Editing-access requests in Roles & Access: **rejected** *(reversal)*

Proposed: surface pending "request editing access" messages in Roles & Access so an admin can grant
from where the grant lives.

Investigation showed this is a data-model change, not a UI addition.
`POST /api/lesson-plans/:id/request-editing`
([endpoints/requestEditing.ts:112](../app/src/endpoints/requestEditing.ts:112)) resolves the site
admins plus that subject-grade's admins and creates **one Message per recipient**. No request record
exists. A pending list cannot be reliably derived from those messages:

- **Read ≠ resolved** — an admin opens the message, the badge clears, and the request would vanish
  from the panel while still ungranted, which is the exact failure the panel would exist to prevent.
- **The body is prose** — recovering the subject-grade means parsing English.
- **One request fans out to N messages** — granting once must resolve all N, which needs a shared
  identity they lack.

Doing it properly means a small `editing-requests` collection plus an endpoint plus authz tests. The
operator judged that not worth it. **Dropped, and no UI space is reserved for it** — adding it later
cleanly beats leaving a hole.

### D11 — Loading strategy: lazy-load **only** Users

Manage currently runs ~9 server-side queries per load. That is the outcome of a documented
optimization (~8.0s → ~170ms) recorded at
[AdminDashboard/index.tsx:112](../app/src/components/AdminDashboard/index.tsx:112), achieved by
dropping to `depth: 0` with explicit projected lookups.

Accordions make most content hidden by default, which tempts a wholesale move to fetch-on-expand.
**Rejected.** Keep today's server-loaded panels exactly as they are — they are fast and tuned — and
lazy-load only the Users panel, whose size is unbounded and which most sessions will not open. One
new read endpoint instead of five, honouring the minimal-churn rule in `CLAUDE.md`.

Users search is therefore **server-side, paginated, with an explicit type filter**.
`DeletePlansPanel`'s fetch-everything-and-filter-in-the-client model is retained for Subjects and
Subject Grades, which are bounded by curriculum size.

#### D11a — Roles & Access is *not* bounded by curriculum size today (external review, 2026-08-16)

D6 justified the subject-grade-centred design partly on the claim that its size is bounded by
curriculum size. **That is true of the visible list but not of the payload.** `buildEditorGroups`
fetches **every** user with `pagination: false`
([lib/editorGroups.ts:76](../app/src/lib/editorGroups.ts:76)) and then builds a per-subject-grade
group; each group carries its own `addable` array of eligible users. The serialized RSC payload
therefore grows as roughly **users × subject-grades**, and adding a Subject Administrator picker per
group would multiply it again. At 100 users and 40 subject-grades that is already thousands of
entries — each carrying an email address, under the SPEC §8 carve-out.

**Decision: rework the projection as part of PR 4**, to send **one shared, deduplicated roster** plus
per-group id lists (`editorIds`, `subjectAdminId`). Payload becomes `users + subject-grades` instead
of their product, and the pickers resolve ids against the shared roster client-side.

If the roster itself later becomes large, the next step is a **server-searched grant picker** that
returns matches only — which would also narrow the SPEC §8 email exposure from "every user's address,
once per group" to "the addresses an administrator actually searched for". That is a strict
improvement on the carve-out and worth doing if it is cheap at implementation time.

⚑ `lib/editorGroups.ts` must remain the **single** `overrideAccess: true` trusted projection for the
email carve-out. Reworking its shape is fine; splitting it into two projections is not.

### D12 — Mobile

Accordions are a clear improvement on a phone.

⚑ **Revised after external review, 2026-08-16.** The first draft banned *all* row editing below
640px, reasoning by analogy to the lesson editor
([custom.scss:1640](<../app/src/app/(payload)/custom.scss:1640>)). That analogy does not hold. The
lesson editor is a dense, many-field, long-form editing surface; changing a display name, ticking
"verified", copying a reset link or granting editing access is a single control each. Worse, the
blanket ban would have removed the **most** mobile-relevant action in the whole redesign: an
administrator standing next to a locked-out teacher, phone in hand, revealing a reset link (D5).

**Decision:** simple row actions — single-field edits, toggles, reveal-link, grant/revoke — **work on
mobile**, with forms stacked vertically. Only genuinely dense workflows are desktop-restricted; on
current scope that is the delete-plans curriculum tree with its group checkboxes, which already has
its own responsive treatment. Touch targets continue to follow `--app-btn-touch-min-height`
(WCAG 2.5.5).

⚑ **This is not a fresh judgement — it restates a standing operator decision, and re-opening it needs
the operator.** `DECISIONS.md` 2026-07-28 ("editing is a laptop/tablet surface below 640px", entry at
line ~2696) already scopes the 640px rule to the lesson-content editor and rules `/admin` explicitly
IN for phones:

> "User administration (promote/demote) lives in the admin too and **must keep working on a phone** —
> it is a small form, not a 3350px lesson body."
> "**Delete stays.** Operator: *'editing needs room, deleting does not.'*"

Review round 2 proposed reversing this — making Manage read-only below 640px — and the operator
**declined, reaffirming the 2026-07-28 decision** (2026-08-16). The proposal's supporting details
(explain rather than silently remove; evaluate eligibility once on load, never on resize; viewport is
not a device class and never an authorization boundary) are all *already in that entry*, near
verbatim — which is corroboration of the constraints, and a sign the entry had not been found.

⚑ **That has now happened twice in one review cycle. If a future reviewer proposes a phone-width
management ban, read `DECISIONS.md` 2026-07-28 first** — the counter-argument it must answer is
"a small form is not a lesson body, and deleting does not need room", which neither proposal engaged
with.

### D13 — Deletion of users

Approved. The FK behaviour is now settled (§2.8): `author_id` is `ON DELETE set null`, so authored
versions **survive** the deletion and lose their attribution.

The confirmation must therefore state exactly what happens, not merely warn. Three facts, because
they differ from each other and an administrator cannot guess which applies:

- **Authored versions and Official content remain**, including any version currently marked Official.
- **Their author attribution becomes unknown** — versions will read as having no saved-by name.
- **Messages, favorites and edit-recovery rows are deleted** (the existing `beforeDelete` cascades).

Counts should be concrete where they are cheap to obtain: "authored N versions, M of them currently
Official."

Two guards must be added (they do not exist today, §2.8), and the first must be concurrency-safe per
the ⚑ in §2.8:

- **Last Site Administrator** — covering **demotion as well as deletion**. Demotion is the subtler
  path: the sole Site Admin demoting themselves would lock the installation out, and a
  delete-only guard would not catch it. One shared advisory lock across grant, demote and delete.
- **Self-delete.**

#### D13a — "Disable sign-in" is the normal offboarding action *(operator decision, 2026-08-16: IN SCOPE)*

External review proposed making **disable sign-in** the routine way to offboard someone, reserving
permanent deletion for erroneous accounts. Deletion destroys attribution irreversibly, and most real
offboarding ("this teacher left") does not want that. **The operator adopted it into this project**
rather than deferring it.

Deletion stays available; disabling becomes the presented default, with deletion the deliberate,
secondary choice.

**What it requires — this is real scope in PR 2, not a checkbox:**

1. **A `signInDisabled` field on `users`.** It is authorization state, so it follows `roles`, not
   profile data.

   ⚑ **State every access axis separately** (corrected in review round 4). An earlier draft said it
   "follows `_verified`", but `_verified` is not one rule — it is three
   ([collections/Users.ts:152](../app/src/collections/Users.ts:152)): `create: siteAdminField`,
   `read: emailReadAccess`, `update: siteAdminField`. Summarising three rules as one is how the
   partial-disablement defect got in the first time.

   | Axis | Rule | Why |
   |---|---|---|
   | `create` | `() => false` | **Nobody is created disabled.** An account is disabled *after* it exists, which also answers "does 'the endpoint is the only writer' include creation?" — there is nothing to include, because no create path may set it |
   | `read` | `emailReadAccess` (self or Site Admin) | Account status is personal, exactly like `_verified` and `email` |
   | `update` | `() => false` to callers | The disable endpoint is the **only** writer, via `overrideAccess: true` after authorizing — see the ⚑ below |

   ⚑ **On UPDATE it must be system-set, not merely `siteAdminField`** (corrected in review round 2).
   Payload's base `sessions` field carries `update: () => false`
   ([auth/baseFields/sessions.js](../app/node_modules/payload/dist/auth/baseFields/sessions.js)), so
   only an `overrideAccess: true` path can clear sessions. If the flag itself were ordinarily
   PATCHable, a Site Admin could flip it through generic REST or the native document route and **no
   session clearing would happen** — an account disabled on paper whose holder is still signed in for
   up to two hours. Partial disablement is worse than none, because the UI would report success.

   The freshness-guarded endpoint is therefore the **only** writer, and it sets `signInDisabled` and
   `sessions: []` **atomically**, with `overrideAccess: true`, *after* authorizing the caller. The
   last-admin and self-disable guards must still fire on that trusted path — an endpoint that
   authorizes and then writes with `overrideAccess` is exactly the shape `CLAUDE.md` requires
   wire-level tests for.
2. **A login gate.** Payload exposes a `beforeLogin` collection hook
   (`collections/config/types.d.ts`), which is the correct seam — `Users` currently registers only
   `beforeOperation`. **Throw `AccountDisabledError`** — the `APIError` subclass defined in step 4,
   carrying `data: { code: 'ACCOUNT_DISABLED' }`.

   ⚑ **NOT plain `Forbidden`** (corrected in review round 6, where an earlier draft of this step still
   said so). `Forbidden` carries no `data`, so `formatErrors` degrades it to a bare `{ message }` and
   the machine-readable code step 4 depends on never reaches the client — in *both* consumers below.

   ⚑ **This hook fires on ordinary login too, and that breaks a documented invariant.**
   `LoginForm.tsx` currently maps **every** 403 to "This account isn't verified yet", and says why in
   a comment: *"Payload rejects unverified accounts with the login op's ONLY 403 (UnverifiedEmail; bad
   credentials and lockout are 401, the throttle 429 — verified in installed errors/). … Status, not
   message text"* ([LoginForm.tsx:24](<../app/src/app/(frontend)/login/LoginForm.tsx:24>)). That
   reasoning is correct **only while 403 has one cause**. Adding a second one makes a disabled user
   with correct credentials be told to go find a verification email that does not exist.

   Both consumers of this seam must therefore be updated, and the comment's stated premise corrected
   along with the code — a comment that explains a now-false invariant is worse than none.
3. **Existing sessions must be dealt with explicitly.** A `beforeLogin` hook stops *new* logins; it
   does nothing about a live JWT, and `tokenExpiration` is 7200s, so a disabled user would otherwise
   stay signed in for up to two hours. Payload's `auth.useSessions` defaults to **true**
   (`collections/config/defaults.js:128`) and the JWT strategy validates the token's `sid` against
   the user's `sessions` array, so **clearing `sessions` on disable terminates live sessions
   immediately**. Do that; do not rely on token expiry. ⚑ Verify the session-clearing behaviour
   against installed source before relying on it — this is a claim about Payload internals, and the
   house rule is to trust installed source over recollection.
4. **Requesting a reset stays uniform; CONSUMING one is refused while disabled.**

   ⚑ **An earlier draft of this step was wrong** (corrected in review round 2). It said "let the reset
   succeed; the login gate still refuses." It will not succeed: Payload's `resetPassword` operation
   **creates a session and runs the collection's `beforeLogin` hooks inline** before signing the token
   ([auth/operations/resetPassword.js:113](../app/node_modules/payload/dist/auth/operations/resetPassword.js:113)).
   A `beforeLogin` hook that rejects disabled accounts therefore rejects the *reset* too and rolls the
   password change back — the user would see a failure with no explanation of why.

   The honest behaviour, and what we build:

   - **Requesting** a reset is unchanged and uniform for every address. The forgot-password endpoint
     is deliberately non-oracular (L3-R1) and must not learn about `signInDisabled`; special-casing it
     would reintroduce the account-status oracle
     [endpoints/forgotPassword.ts](../app/src/endpoints/forgotPassword.ts) exists to close.
   - **Consuming** the link is refused while the account is disabled, with copy that names the reason
     and says to contact an administrator. This is not an oracle: the person consuming a valid token
     for an account is that account's owner, so telling them their own account is disabled leaks
     nothing.

     ⚑ **This requires a machine-readable error code — the status code cannot carry it** (raised in
     review round 4; this was an implementation-blocking gap, not a wording detail). **Both failure
     modes are HTTP 403:** an invalid or expired token throws
     `APIError('Token is either invalid or has expired.', FORBIDDEN)`
     ([resetPassword.js:53](../app/node_modules/payload/dist/auth/operations/resetPassword.js:53)),
     and `Forbidden` is also `httpStatus.FORBIDDEN`
     ([errors/Forbidden.js](../app/node_modules/payload/dist/errors/Forbidden.js)). So the form
     cannot tell them apart by status, and matching on translated message strings is brittle — it
     breaks on any locale change or upstream copy edit, silently, in the direction of showing the
     *wrong* message.

     **Requirement:** the disabled refusal returns a **stable machine-readable code**
     (`ACCOUNT_DISABLED`) that the client keys on, never prose. It must be emitted **only after
     Payload has validated the token** — order matters, so a caller holding a bogus token learns
     nothing about any account's status.

     ⚑ **Mechanism DECIDED (review round 5): a custom `APIError` subclass thrown from the
     `beforeLogin` hook. The shadow-endpoint alternative is rejected.** An earlier draft left both
     open "at implementation time", which is an unresolved decision wearing a plan's clothes — and
     the two are not comparable in risk.

     Shadowing `POST /api/users/reset-password` means re-implementing everything the native handler
     does around the operation
     ([auth/endpoints/resetPassword.js](../app/node_modules/payload/dist/auth/endpoints/resetPassword.js)):
     `generatePayloadCookie`, the `removeTokenFromResponses` branch, `headersWithCors`, and the
     translated `authentication:passwordResetSuccessfully` message. Getting the cookie wrong breaks
     sign-in silently on the success path. The existing shadows (`forgotPasswordQueuedEndpoint`,
     `verifyEmailThrottledEndpoint`) are precedent for shadowing *when there is no hook seam* — here
     there is one, and `beforeLogin` already runs after the user lookup, which is exactly the ordering
     the requirement above needs.

     **The wire contract, stated exactly** — verified against installed source:

     ```
     HTTP 403
     { "errors": [ { "name": "...", "data": { "code": "ACCOUNT_DISABLED" }, "message": "..." } ] }
     ```

     The client keys on `errors[0].data.code === 'ACCOUNT_DISABLED'`.

     ⚑ **Implementation trap: `data` must be truthy or the contract silently disappears.**
     `formatErrors` emits the `{ name, data, message }` shape **only** when the thrown error is an
     `APIError`/`ValidationError` *and* `incoming.data` is truthy
     ([utilities/formatErrors.js](../app/node_modules/payload/dist/utilities/formatErrors.js));
     otherwise it falls through to a bare `{ message }` and the code is gone. Note that plain
     `Forbidden` carries **no** `data`, so it cannot be used here — this needs its own subclass.

     **The wire contract is what gets tested**, not the rendered string — see §7.
   - **"Reveal reset link" is not offered for a disabled account.** Minting a credential that cannot
     be used is a support call waiting to happen; re-enable first.

   The rejected alternative — customising the reset flow to change a password without creating a
   session — is more machinery than this earns.
5. **The last-Site-Admin guard must cover disabling.** Disabling the only Site Admin's sign-in locks
   the installation out exactly as deleting or demoting them would. Disable joins grant, demote and
   delete under the one shared advisory lock (§2.8 ⚑) — this is why that guard is specified as one
   key across *every* count-reducing operation rather than per-operation.
6. **Self-disable guard**, alongside the self-delete guard.

---

## 4. Out of scope

Explicitly not part of this project, recorded so a reviewer does not read their absence as an
oversight:

- The `students` collection and anything student-facing (D8).
- Quizzes, including the anonymous demo (D9).
- An `editing-requests` collection (D10).
- Self-service email or password change (D4, D5).
- The messages composer's `pagination: false` roster fetch
  ([messages/page.tsx:72](<../app/src/app/(frontend)/messages/page.tsx:72>)), which fetches every
  user with no limit. With students separated (D8) this stays teacher-scale, so it is no longer a
  time bomb — but it remains a known follow-up.

---

## 5. Target information architecture

```
Manage
├── Users                    [Site Admin only]        search + type filter, server-side, lazy
│     └── (row disclosure)   view / edit one user
├── Roles & Access           [Site Admin, Subject Admin]   search
│     └── per subject-grade  Subject Administrator (picker for Site Admin;
│                            READ-ONLY for Subject Admin) + editing-access list
├── Subjects                 [Site Admin only]        search
│     └── (row disclosure)   rename / delete
├── Subject Grades           [Site Admin only]        search
│     └── (row disclosure)   edit / delete
├── Lesson Plans             [Site Admin only]
│     ├── Upload
│     ├── Delete             search; existing curriculum tree unchanged
│     └── Repair             conditional
└── Candidate versions / My saved versions   [all roles that reach Manage]   search
```

By role:

| Role | Sees |
|---|---|
| Site Administrator | all of the above |
| Subject Administrator | Roles & Access (own subject-grades), Candidate versions |
| Teacher with editing access | My saved versions *(single section → auto-expanded, per D7)* |
| Teacher without editing access | cannot reach Manage (§2.4) |

### 5.1 Users panel — actions

| Action | Mechanism | Notes |
|---|---|---|
| Search | new server-side endpoint | name + email; type filter |
| Change display name | `PATCH /api/users/:id` | `name.access.update` is `selfOrSiteAdminField` |
| Change email | `PATCH /api/users/:id` | already `siteAdminField` |
| Reveal password reset link | **new endpoint** | D5 |
| Mark verified | `PATCH /api/users/:id` | `_verified` already `siteAdminField` |
| Site Administrator toggle | **new endpoint** | freshness-guarded; confirms with name **and** email; last-admin guard |
| **Disable / enable sign-in** | **new field + `beforeLogin` gate** | D13a — the presented default for offboarding; clears live sessions; self-disable and last-admin guards |
| Delete | `DELETE /api/users/:id` | already `siteAdminOnly`; the deliberate secondary choice, not the default; confirmation states consequences (D13); self-delete and last-admin guards |
| Grants (Subject Administrator / editing access) | **read-only**, with jump link to Roles & Access | D6 |

The list shows the **computed type** (Teacher / Subject-grade administrator / Site administrator),
not the raw `roles` array — fixing §2.3.

---

## 6. Implementation plan

**Five** stacked PRs (PR 2 split in review round 2). Each is independently reviewable and deployable,
so an unwanted later stage can be dropped without unwinding the earlier ones.

### PR 1 — Accordion shell, plus three small additive changes

⚑ **Retitled in review round 2.** This was "no behaviour change", which stopped being true once the
missing D1/D3/D4 items were folded in (§10 finding 5): it now also adds candidate-version search,
display-name editing in the avatar menu, and the People→Users terminology change. Those are all
additive and low-risk, but the old title would have told a reviewer not to look for behaviour — which
is exactly when behaviour slips through.

**Goal:** ship the disclosure component, the URL state and the visual system, with today's sections
moved inside it. **No authorization behaviour changes here** — that is the claim a reviewer should
verify, and it remains true. All access-model changes are in PR 2a and PR 4.

| File | Change |
|---|---|
| `src/components/Manage/Accordion.tsx` *(new)* | Disclosure panel: `<h2><button aria-expanded aria-controls>`; open state read from and written to the URL query; supports nesting one level |
| `src/components/Manage/useOpenPanels.ts` *(new)* | Parse/serialise `?open=` and `?at=`; `replaceState` for toggles, router `push` for jumps (D7a) |
| `src/components/AdminDashboard/index.tsx` | Wrap existing sections; auto-expand when a role has one section |
| `src/components/AdminDashboard/CandidateList.tsx` | **Add search** — promised by D3 and the target IA, missing from the first draft's inventory |
| `src/components/UserMenu/index.tsx` | **Add "Change display name"** — promised by D4, missing from the first draft's inventory. `name.access.update` is already `selfOrSiteAdminField`, so this needs no new endpoint |
| `src/payload.config.ts` + `src/collections/Users.ts` | **Rename the Payload nav group "People" → "Users"** (D1) |
| `docs/DESIGN-user-model-language-2026-07-29.md` | **Record the People → Users rename** (D1) |
| `src/app/(payload)/custom.scss` | Accordion header/panel styles on the existing type + spacing scale |
| `tests/e2e/manage.e2e.spec.ts` | **Extended first** — see §7 |

Existing panels keep their server-side loading (D11).

### PR 2 — Users: split into 2a (security foundation) and 2b (panel UI)

⚑ **Split in review round 2.** As originally scoped this PR carried a schema migration, login
behaviour, session revocation, reset-link handling, last-admin concurrency, deletion **and** the whole
Users UI. That is too much to review as one unit, and the risky half would be reviewed alongside a
large volume of straightforward React.

**PR 2a — user security & recovery foundation. No Manage UI.** *(Was "server only" until review round
4 — that stopped being true when it took ownership of `ResetPasswordForm.tsx`. It is one small
frontend file on the account-recovery path, not Manage surface, and it belongs with the wire contract
it consumes.)* Contents: the `signInDisabled` field and its migration, the `beforeLogin` gate, the
atomic disable+session-revocation endpoint, the `ACCOUNT_DISABLED` wire contract and the reset form
that keys on it, the reset-link endpoint with its `req.context` rate-limit carve-out, and the
last-admin/self-action guards with their shared advisory lock. Every authorization change in the Users
half lands here, reviewable against the test matrix without Manage-UI noise.

**PR 2b — the Users panel.** The search endpoint, the list, the row disclosure and the controls that
call 2a's endpoints. If 2b slips, 2a still closes the account-recovery gap that motivated D5 — the
capabilities are reachable via the API even before the panel exists.

⚑ **Corrected in review round 3:** an earlier draft of this paragraph said the second column notes
which half each row belongs to. There was no such column. The table now carries an explicit **PR**
column, because "independently deployable" is only a checkable claim if the boundary is written down.

| PR | File | Change |
|---|---|---|
| **2a** | `src/collections/Users.ts` | Add the `signInDisabled` field with **all three access axes stated separately** — see D13a step 1. `create: () => false` · `read: emailReadAccess` · `update: () => false`. Also register a **`beforeLogin`** hook — the collection currently has only `beforeOperation` — mount the new endpoints, and wire the guards |
| **2a** | `src/errors/AccountDisabled.ts` *(new)* | The `APIError` subclass carrying `data: { code: 'ACCOUNT_DISABLED' }` at 403, thrown by the `beforeLogin` hook. ⚑ Must set `data` — `formatErrors` drops to a bare `{ message }` when it is falsy, and plain `Forbidden` carries none (D13a step 4) |
| **2a** | `src/app/(frontend)/login/LoginForm.tsx` | ⚑ **Added in review round 6 — `beforeLogin` fires on ordinary login, not just reset.** The form maps **every** 403 to "This account isn't verified yet" ([line 24](<../app/src/app/(frontend)/login/LoginForm.tsx:24>)), so a disabled user with correct credentials would be sent hunting for a verification email. Check `errors[0].data.code === 'ACCOUNT_DISABLED'` **first** → disabled/contact-an-administrator; else keep 403 → unverified; else keep the generic "Invalid email or password." ⚑ **Update the comment too** — it documents "the login op's ONLY 403", which this change makes false |
| **2a** | `src/migrations/…` *(new)* | `signInDisabled` column |
| **2a** | `src/endpoints/userAdminActions.ts` *(new)* | `POST /api/users/:id/reveal-reset-link`, `…/set-site-admin`, `…/set-sign-in-disabled` — all freshness-guarded on `expectedUpdatedAt`, modelled on [userAssignments.ts](../app/src/endpoints/userAssignments.ts). Reset-link path: own cap, **not** the public budget (D5a-i); `no-store`; token redacted from logs. Disable path writes the flag **and** `sessions: []` atomically with `overrideAccess: true`, after authorizing |
| **2a** | `src/hooks/userRoles.ts` | Add last-Site-Admin guard covering **grant, demote, delete and disable**, plus self-delete and self-disable guards, **all serialized on one shared advisory key** (§2.8 ⚑) |
| **2a** | `src/app/(frontend)/reset-password/ResetPasswordForm.tsx` | ⚑ **Added in review round 3.** The form flattens *every* non-OK response into "This reset link is invalid or has expired" ([line 29](<../app/src/app/(frontend)/reset-password/ResetPasswordForm.tsx:29>)), so a disabled user would be told their valid link is broken. Branch on the **`ACCOUNT_DISABLED` code** from D13a step 4 — **not** on status (both cases are 403) and **not** on message text (brittle across locales) — showing "This account is disabled — contact an administrator"; every other failure keeps the existing generic string |
| **2b** | `src/endpoints/userSearch.ts` *(new)* | `GET /api/users/search` — paginated, `q` over name+email, explicit `type` filter. Site-Admin-only. Runs with the caller's access, never `overrideAccess: true` for the read |
| **2b** | `src/components/Manage/UsersPanel.tsx` *(new)* | Search, list with computed type, row disclosure, the actions in §5.1 |
| **2b** | `src/components/AdminDashboard/index.tsx` | Replace the People link with the panel |
| **2b** | `src/components/RedirectToManage/index.tsx` + config | **Redirect the native `users` list route** — promised by D2, missing from the first draft (which redirected only Subjects and Subject Grades) |

**Do not add a `src/lib/userType.ts`.** `userTypeLabel` already exists and is tested
([access/index.ts:106](../app/src/access/index.ts:106)); the panel reuses it. *(First draft proposed a
redundant new module; caught in external review.)*

The delete-confirmation wording is now fully determined by D13 — the FK question that blocked it is
resolved (§2.8).

### PR 3 — Subjects and Subject Grades panels

| File | Change |
|---|---|
| `src/components/Manage/SubjectsPanel.tsx` *(new)* | List + search + create + rename + delete via existing REST routes |
| `src/components/Manage/SubjectGradesPanel.tsx` *(new)* | Same; `displayName` stays read-only/derived |
| `src/components/AdminDashboard/index.tsx` | Replace the two links |
| `src/components/RedirectToManage/index.tsx` + config | Redirect the two list routes, as `Lesson plans` already does |

Both panels **surface the existing 409 guard messages** (§2.7) rather than implementing new guards,
and must surface the friendly duplicate-subject-grade message from the existing `beforeValidate`
hook.

### PR 4 — Roles & Access consolidation

| File | Change |
|---|---|
| `src/components/AdminDashboard/EditorsWidget.tsx` → `src/components/Manage/RolesAccessPanel.tsx` | Rename; add the Subject Administrator picker; nest one panel per subject-grade; add search |
| `src/endpoints/userAssignments.ts` | Add the Subject Administrator grant path (or a sibling endpoint) with the same freshness guard |
| `src/hooks/userRoles.ts` | **Required (D6a resolved):** guard `enforceAssignmentScope` so a non-Site-Admin cannot add, remove or change a row whose `role` is `subjectAdmin`. A behaviour change to shipped code — the hook currently checks only the row's subject-grade |
| `src/lib/editorGroups.ts` | **Reshape the projection** to one shared deduplicated roster + per-group `editorIds` / `subjectAdminId`, so payload is `users + subject-grades` rather than their product (D11a). Also carries the current Subject Admin. **This remains the single `overrideAccess: true` projection for the email carve-out — do not add a second** |
| `SPEC.md` §8 | ⚑ **RENAME-ONLY** — per corrected D6, the carve-out does **not** widen to administrator grants; for Subject Administrators it still rests on editing-access grants alone. Amend the name "Manage → Editing access" → "Roles & Access", and separately **state the D6a answer explicitly** rather than leaving "manage scoped roles" ambiguous. *(An earlier draft of this row said "cover administrator grants", contradicting D6 — caught in review round 3.)* |
| `CLAUDE.md` | Same amendment, including the ⚑ note |
| `docs/DECISIONS.md` | Entries for D4, D5, D6, D6a, D8, D11, D11a — and the three corrections external review produced (§10) |

---

## 7. Test coverage

**`tests/e2e/manage.e2e.spec.ts` is the safety net and is extended in PR 1, before the restructuring
lands.** Its existing per-role assertions ("a Teacher with editing access sees ONLY My saved
versions", "Subject Admin sees candidates + Editing access, no Site-Admin panels") are exactly the
invariant at risk. Extending
first means a quietly-dropped section fails a test; extending afterwards means it looks identical to
a deliberate change.

| PR | Tests |
|---|---|
| 1 | E2E: per-role section visibility; open state survives reload; deep link opens the named panel; unknown/inaccessible panel ids are ignored and scrubbed; toggling adds **no** history entry while a cross-panel jump adds exactly one; keyboard operation of the disclosure; **the display-name change flow in `UserMenu`**. **⚑ State survives close/reopen (round 5)**: type a search and select rows in the delete panel, close it, reopen it, and find both intact — this is the test that fails if a panel is conditionally rendered instead of hidden |
| **2a** | **`tests/http`**: every admin-action endpoint — 401 unauthenticated, 403 non-Site-Admin, 404 unknown user, 409 stale `expectedUpdatedAt`, plus happy path. **`tests/int`**: last-Site-Admin guard blocks delete, demote **and disable**; self-delete and self-disable blocked; reset-link endpoint returns a token the existing reset flow accepts; **the reset-link path is not throttled by the public forgot-password budget**, **and** the ordinary public `POST /forgot-password` still is (D5a-i — the second test is what distinguishes a carve-out from a bypass). **Disable (D13a)**: a disabled user cannot log in; **an already–signed-in user's live token stops working once disabled** (the session-clearing claim, tested rather than assumed); **a Site Admin flipping `signInDisabled` by any path other than the endpoint cannot produce a disabled-but-still-signed-in account** (the partial-disablement test — fails if the field is left ordinarily PATCHable); a disabled user's forgot-password **request** response is byte-identical to an enabled user's (the oracle test), **and consuming a valid reset token while disabled is refused with the password left unchanged** — not merely the request tested, since `resetPassword` runs `beforeLogin` inline. **⚑ `ACCOUNT_DISABLED` wire contract (round 4, exact shape pinned in round 5)**: the refusal serialises to `errors[0].data.code === 'ACCOUNT_DISABLED'`, **an invalid/expired token does NOT carry it**, and the code appears only *after* token validation — this is the contract the form depends on, and both cases are 403, so status alone proves nothing. Assert the parsed JSON shape, not a substring of the body, so the test fails if `data` is dropped. **Concurrency**: two simultaneous demotions of the two remaining Site Admins, exactly one succeeds (§2.8 ⚑) — sequential tests pass against the racy implementation and prove nothing. **Reset form**: a valid token on a disabled account shows the disabled message; an invalid token still shows the generic one — both directions, since collapsing them either way is the bug. **⚑ Login form, all three outcomes (round 6)**: a **disabled** account with *correct* credentials shows disabled/contact-an-administrator; an **unverified** account still shows the verification message; **bad credentials** still show the generic "Invalid email or password." Two of the three are 403, which is exactly why all three are asserted — and this pins the `ACCOUNT_DISABLED` contract through **both** operations that run `beforeLogin`, not only reset |
| **2b** | **`tests/http`**: `userSearch` — 401 / 403 non-Site-Admin / happy path, and that the `type` filter is honoured server-side. **E2E**: **the `users` list route redirects to Manage**; the Users panel's row disclosure and its actions against 2a's endpoints |
| 3 | E2E: the two list routes redirect to Manage; the existing 409 guard message and the friendly duplicate-subject-grade message are displayed in-panel. Existing `taxonomyDelete.int.spec.ts` already covers the server side |
| 4 | **`tests/int`**: extend `editorGroupsAccess.int.spec.ts` for the reshaped projection, per role — including that the shared roster carries emails only when `mayIdentifyGrantCandidates` allows. **`tests/http`**: the Subject Administrator grant path — 401/403/404/409 + happy path, and that `autoDemotePriorSubjectAdmins` still fires. **D6a guard (required)**: a Subject Admin's direct `PATCH /api/users/:id` writing a `subjectAdmin` row is refused, and their editing-access grants still succeed — the UI-only version of this guard is untested and worthless. **E2E (round 3)**: a Subject Admin sees the current Subject Administrator **read-only, with no picker and no remove control**, while a Site Admin sees the picker — the server test proves the boundary holds, this one proves nobody is invited to cross it |

This follows the standing rule in `CLAUDE.md`: every new or changed endpoint lands with wire-level
authz coverage in the **same** PR, because these endpoints authorize with the caller's access and then
write with `overrideAccess: true` — a pattern only as safe as the test proving the gate runs first.

**Additional required check:** assert that the reset token never appears in the log stream (D5).

---

## 8. Open items

**No blocking items remain.** All operator decisions are recorded in §3.

### To verify during implementation

1. **Payload's session-clearing behaviour** (D13a step 3) — that emptying a user's `sessions` array
   invalidates their live JWT. `auth.useSessions` defaults to true and the JWT strategy checks `sid`
   against that array, but this is a claim about Payload internals and the house rule is to trust
   installed source over recollection. If it does not hold, disable needs a different mechanism —
   token expiry alone (up to 2h) is not acceptable for an offboarding control.
2. **Pre-existing Subject-Admin-granted administrators** (D6a) — the current code permits them, so a
   live installation may already contain such rows. The guard is forward-looking; confirm nothing
   depends on retroactively invalidating them.
3. **Public-plan attribution vs. user deletion** — public discovery (§2.4) now exposes published
   plans anonymously. Confirm whether any public view renders an author name; if so, deleting a user
   changes public content, and D13's confirmation should say so.

### Resolved during external review, 2026-08-16

- ~~`lesson_bundle_versions.author_id` on user delete~~ — **`ON DELETE set null`**, confirmed in
  [migration 20260702_015014:35](../app/src/migrations/20260702_015014_add_version_author.ts:35).
- ~~Reset-token expiry window~~ — **one hour**, Payload's default; no override in `Users.auth`.
  Operator confirmed leaving it (D5a-iv).
- ~~Confirm no last-Site-Admin guard exists~~ — confirmed absent; review reached the same
  conclusion independently.
- ~~D6a, may a Subject Administrator appoint their successor~~ — **no**; operator decision, requires
  a server-side guard (D6a).
- ~~"Disable sign-in" as offboarding~~ — **adopted into this project**, PR 2 (D13a).

---

## 9. Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Restyle Payload's native collection views | Would mean re-theming Payload's whole list-and-document UI; a far larger surface than replacing three views (§2.2) |
| Person-centred grant UI | Answers the common question ("who edits Biology Grade 10?") by scanning every user; unbounded growth (D6) |
| My Account accordion | Reduces to one editable field once email and password change are excluded; and Manage is unreachable by Teachers (D4) |
| Admin types a replacement password (± force-change) | Admin learns the password; force-change requires the deferred self-service UI plus a login gate (D5) |
| Students in the `users` collection | Three `Boolean(user)` access gates would grant students the whole lesson library; fixing it is deny-by-enumeration against the house idiom (D8) |
| Derive pending access requests from Messages | Read ≠ resolved; prose bodies; one request fans out to N messages (D10) |
| Lazy-load every panel | Discards a documented 8.0s → 170ms optimization and needs five new endpoints instead of one (D11) |
| Third accordion level for the delete-plans tree | Breaks the shared `groupLessons` idiom with the library catalogue and buries rows three clicks deep (D7) |
| One panel open at a time | Blocks comparing Users against Roles & Access; conflicts with deep-linking (D7) |
| localStorage for open state | Invisible, unshareable, no back-button behaviour; loses state that `router.refresh()` needs preserved (D7) |
| Router navigation on every disclosure toggle | Re-runs the dashboard server component and its queries; one history entry per open/close (D7a) |
| Blanket desktop-only row editing | False analogy to the lesson editor; would have removed the most mobile-relevant action in the redesign (D12) |
| A new `src/lib/userType.ts` | `userTypeLabel` already exists and is tested (PR 2) |
| Hiding the Subject Administrator picker as the D6a fix | Generic `PATCH` authority already permits the write; only a server-side guard closes it (D6a) |

---

## 10. Review log

**2026-08-16 — external review (GPT), incorporated.** The review is recorded because three of its
findings corrected claims this document had presented as verified, and a reader who only sees the
corrected text would not know they had been contested.

| # | Finding | Outcome |
|---|---|---|
| 1 | D8's security premise was wrong — Payload's JWT strategy authenticates against the token's collection and populates `req.user` regardless, so a separate `students` collection does not by itself defeat `Boolean(user)` gates | **Accepted.** Verified at [jwt.js:66](../app/node_modules/payload/dist/auth/strategies/jwt.js:66). D8 rewritten: decision stands on allowlist-vs-denylist grounds, with three hard prerequisites recorded |
| 2 | The Subject Administrator granting policy was self-contradictory, and the current-state table was wrong about who may grant it | **Accepted.** Verified at [userRoles.ts:96](../app/src/hooks/userRoles.ts:96) — the hook never inspects the row's `role`. §2.5 corrected; new blocking decision **D6a** |
| 3 | A last-Site-Admin guard must be concurrency-safe, using the project's existing advisory-lock pattern | **Accepted.** ⚑ added to §2.8 with the shared-key requirement; concurrent test added to PR 2 |
| 4 | Three unresolved interactions in the reset-link design (public rate limiter, stale queued job, token in URL), plus the one-hour default expiry | **Accepted with two refinements** (D5a). The stale-job case is a *confusion* bug, not a leak — the job sends to the account owner's own address and the admin already holds the token. Token-in-URL is *pre-existing*: the shipped email flow already puts it in a query string, so fixing it improves both paths and is its own work, not a gate on this one |
| 5 | Five promised changes were absent from the PR inventory; a proposed `src/lib/userType.ts` duplicates existing `userTypeLabel` | **Accepted in full.** All five added to PRs 1–2; the redundant module dropped |
| 6 | Roles & Access is not bounded by curriculum size — the projection is `users × subject-grades` | **Accepted.** Verified at [editorGroups.ts:76](../app/src/lib/editorGroups.ts:76). New **D11a**: reshape to a shared roster + per-group ids |
| 7 | URL state mechanics under-specified | **Accepted.** New **D7a** specifying `replaceState` vs `push`, nested-state encoding, focus/scroll, and unknown-id handling |
| 8 | The blanket mobile editing ban was over-broad | **Accepted.** D12 reversed |
| 9 | `author_id` is already `ON DELETE SET NULL`; confirmation should state consequences precisely; consider "disable sign-in" as normal offboarding | **Accepted.** Open item 1 closed; D13 wording specified; disabling recorded as **D13a** — subsequently adopted into scope by the operator |

### 2026-08-16 (later) — rebased onto `origin/main` @ `7ecf7d0`

The plan had been written against `a88a48f`, **18 commits behind** `origin/main`. The operator caught
this before review. Fast-forwarded and re-verified every citation. What the rebase changed:

| Area | Effect |
|---|---|
| **Public discovery shipped** (#219, #220) | **§2.4 claim was falsified.** The app *does* now have an unauthenticated surface. Manage is unaffected — it is an opt-in, env-gated, narrowly-resolved surface, and `lessonPlanRead` is still `Boolean(user)`. **D9 rewritten**: the demo quiz now has a shipped pattern to copy (`PUBLIC_LIBRARY_ENABLED`, `requirePublicLibrary()`, boot refusal) instead of a boundary to defend |
| **Row-lock consolidation** (#221, #224) | **§2.8 concurrency guidance rewritten.** A purpose-built `lockRows` helper now exists ([lib/txDb.ts:109](../app/src/lib/txDb.ts:109)) that refuses outside a transaction. The last-admin guard still wants a fixed advisory key (it guards an aggregate, not known rows), but must follow #221's discipline: a lock that holds nothing must fail, not no-op |
| **`enforceAssignmentScope`** | **Unchanged** — the D6a correction and §2.5 hold exactly. Only `autoDemotePriorSubjectAdmins`'s locking was reworked |
| **`src/access/`, `collections/Users.ts`, `lib/editorGroups.ts`** | **Unchanged** — D8, §2.6 and D11a all stand |
| **Line-number drift** | `payload.config.ts` 114→**115**; `SPEC.md` 374→**402**; `jwt.js` 65→**66**. All other citations verified intact |
| **Field-split security fix** (#227) | Content-scoped; does not touch the user-management authorization model |

**Lesson worth keeping:** a plan whose value rests on verified file:line claims has a shelf life
measured in commits, not days. Re-verify against `origin/main` before circulating one for review.

### 2026-08-16 (round 2) — external review of the revised plan

Two genuine defects, both in D13a — the section added *between* rounds, and therefore the only part
that had never been reviewed. Worth noting as a pattern: the corrections a review produces are
themselves unreviewed until the next round.

| # | Finding | Outcome |
|---|---|---|
| 1 | D13a step 4 was wrong — `resetPassword` runs `beforeLogin` hooks inline, so a disabled-account gate rejects the *reset* and rolls back the password change | **Accepted.** Verified at [resetPassword.js:113](../app/node_modules/payload/dist/auth/operations/resetPassword.js:113). Step 4 rewritten: requesting stays uniform, consuming is refused while disabled, no reset link offered for a disabled account. Test now consumes a token, not just the request |
| 2 | An ordinarily-PATCHable `signInDisabled` allows partial disablement — flag set, session still live — because `sessions` is `update: () => false` and only the endpoint clears it | **Accepted.** Verified at [sessions.js](../app/node_modules/payload/dist/auth/baseFields/sessions.js). Field is system-set on update; endpoint is sole writer and sets flag + `sessions: []` atomically; guards still fire on the trusted path |
| 3 | The email carve-out does not "strengthen" after D6a — only Site Admins grant `subjectAdmin`, and they already see all emails | **Accepted.** D6 corrected; the SPEC amendment is rename-only. For Subject Admins the carve-out still rests on editing-access grants alone |
| 4 | PR 1 is no longer "no behaviour change" | **Accepted.** Retitled; the surviving, checkable claim is "no authorization behaviour changes here" |
| 5 | The rate-limit carve-out needs a named mechanism | **Accepted.** Server-only `req.context` flag, set only after Site-Admin authorization *and* admin-cap consumption; plus a test that the public endpoint stays throttled |
| 6 | PR 2 is too large | **Accepted.** Split into 2a (security foundation, server only) and 2b (panel UI) |
| 7 | Proposed making Manage read-only below 640px, reversing revised D12 | **Declined by the operator**, reaffirming the 2026-07-28 decision. ⚑ The proposal's own implementation details were already in that DECISIONS entry near-verbatim, and this is the **second** time in one review cycle it has been re-derived rather than found — so D12 now quotes it directly and names the argument any future proposal must answer |

### 2026-08-16 (round 3) — internal consistency: corrections that did not propagate

Five findings, all valid, none requiring a code fact to be re-checked. **Three of the five share one
root cause**, which is the finding worth keeping.

| # | Finding | Outcome |
|---|---|---|
| 1 | The PR 2 file table still said `signInDisabled` uses `siteAdminField`, contradicting D13a's system-set rule and re-creating the partial-disablement defect | **Accepted.** Row rewritten to spell out per-axis access explicitly |
| 2 | The PR 4 table still said the SPEC §8 amendment should "cover administrator grants", contradicting corrected D6 | **Accepted.** Row marked RENAME-ONLY |
| 3 | The target IA showed Subject Administrators a Subject Administrator *picker*, which D6a removes | **Accepted.** IA now says read-only for Subject Admins; D6a specifies what they see; an E2E visibility assertion added, because a server guard behind a visible control produces "the app is broken" |
| 4 | D13a promised a disabled-account reset message, but `ResetPasswordForm.tsx` flattens every failure into "invalid or has expired" — and no PR owned the file | **Accepted.** Verified at [line 29](<../app/src/app/(frontend)/reset-password/ResetPasswordForm.tsx:29>). File assigned to PR 2a with tests for **both** directions |
| 5 | The PR 2 table claimed a second column identified 2a vs 2b; no such column existed | **Accepted.** Explicit `PR` column added — "independently deployable" is only checkable if the boundary is written down |

### 2026-08-16 (round 4) — a promised behaviour the wire could not carry

| # | Finding | Outcome |
|---|---|---|
| 1 | **The reset form has no stable way to identify "account disabled".** Both an invalid/expired token and a `Forbidden` throw return **HTTP 403**, so the client cannot distinguish them by status, and matching translated message strings is brittle | **Accepted — implementation-blocking, not bookkeeping.** Verified at [resetPassword.js:53](../app/node_modules/payload/dist/auth/operations/resetPassword.js:53) and [Forbidden.js](../app/node_modules/payload/dist/errors/Forbidden.js). D13a step 4 now requires a stable `ACCOUNT_DISABLED` code, emitted only after token validation, with the wire contract itself pinned by tests |
| 2 | The "explicit" field-access row was still ambiguous — `_verified` is three different rules, not one | **Accepted.** D13a step 1 now states all three axes in a table. `create: () => false` also answers the raised question "does 'only writer' include creation?" — nobody is created disabled |
| 3 | PR 2a is no longer server-only; it owns `ResetPasswordForm.tsx` | **Accepted.** Retitled "security & recovery foundation. No Manage UI." in both the design doc and `NEXT-SESSION.md` |
| 4 | The test table still combined everything under "2" while the file table had split | **Accepted.** Split into 2a and 2b rows, so `userSearch`, the reset-form tests and the users-route redirect have owners |
| 5 | `NEXT-SESSION.md` still said reviewed "twice" | **Accepted.** |

### 2026-08-16 (round 5) — an undecided decision, and undefined mount semantics

| # | Finding | Outcome |
|---|---|---|
| 1 | The `ACCOUNT_DISABLED` mechanism was left as two options "at implementation time", so "no blocking decisions" and "file-by-file plan" were not quite true | **Accepted and decided: custom `APIError` from `beforeLogin`; shadow endpoint rejected.** Verified that the native handler also owns cookie generation, `removeTokenFromResponses`, CORS headers and translated success copy ([auth/endpoints/resetPassword.js](../app/node_modules/payload/dist/auth/endpoints/resetPassword.js)) — all of which a shadow must re-implement, with a silent sign-in break as the failure mode. The exact wire shape is now pinned from `formatErrors` source, including the falsy-`data` trap |
| 2 | D7 never said whether closing a disclosure unmounts its contents. It must not — today's panels hold selected delete rows, search text, pending picker choices and chosen upload files | **Accepted.** Panels stay mounted and use `hidden`; lazy Users mounts on first open and stays mounted ("lazy" = deferred first fetch, not remount-per-open). E2E assertion added |
| 3 | D7 said an upload "reloads the page"; `UploadBundles` calls `router.refresh()` | **Accepted.** Corrected — and since `router.refresh()` preserves client state, that example did not support the claim at all. The URL-state decision stands on genuine full page loads; the wrong example is removed rather than left propping up a right answer |

⚑ **The lesson from finding 1: two options in a plan are an unresolved decision wearing a plan's
clothes.** The document simultaneously claimed "no blocking decisions outstanding" and "file-by-file",
while deferring a choice with materially different risk profiles — and the cheaper-looking option was
the dangerous one. **Where a plan offers alternatives, either pick one or label it explicitly as an
open decision**; anything else lets an implementer make an architectural choice under time pressure,
with none of the review this document exists to provide.

⚑ **The lesson from finding 2: an unstated default is still a decision — made by whoever types the
code first.** `{open && <Panel/>}` is the shorter and more natural thing to write, and it would have
silently destroyed a half-built multi-select or a chosen upload file on any stray click. A plan that
specifies behaviour but not lifecycle has left its most consequential detail to reflex.

### 2026-08-16 (round 6) — the other consumer of the shared seam

| # | Finding | Outcome |
|---|---|---|
| 1 | D13a **step 2** still said "Throw `Forbidden`", contradicting step 4's newly-chosen `AccountDisabledError` and removing the machine-readable code | **Accepted.** Step 2 now names `AccountDisabledError` and states why `Forbidden` cannot work — it carries no `data`, so `formatErrors` degrades it |
| 2 | The new error also flows through **ordinary login**, where `LoginForm.tsx` maps every 403 to "This account isn't verified yet" — so a disabled user with correct credentials is sent to find a verification email that does not exist | **Accepted.** `LoginForm.tsx` added to PR 2a, with all three outcomes tested. ⚑ The form's comment *documents* the now-false invariant "the login op's ONLY 403", so the comment is corrected with the code |

⚑ **The lesson from finding 2, and it is pointed.** Round 4's finding was literally *"`beforeLogin` is
not a login-only hook"* — that reset also runs it. That insight was applied to the new consumer
(reset) and the **original** consumer (login) was never revisited. Learning that a seam has more
callers than its name suggests is worth nothing if the audit stops at the caller that prompted it.

**The general rule: when adding a new error or return value to a shared seam, enumerate every consumer
of that seam before writing the plan.** Here there were exactly two, both in this repo, both easy to
find — `beforeLogin` runs in `login` and in `resetPassword`.

⚑ **Finding 1 is the third instance of "corrected here, stale there"** (see rounds 3 and 4). Round 3's
structural fix made §6's tables point at decisions rather than restate them; it did not anticipate the
same duplication **inside a single decision**, where step 4 was rewritten and step 2 left alone. When
revising one step of a multi-step decision, re-read the other steps.

⚑ **The lesson from finding 1, and why the previous round's "converged" call was wrong.** Rounds 2
and 3 were consistency passes, and their quietness was read as the design having settled. It had not:
**round 4 went back to checking the design against the code and immediately found a promise the
protocol could not keep.** D13a asserted a user-visible distinction ("copy that names the reason")
without anyone checking whether the wire could carry the distinction — and it could not, because the
two cases are indistinguishable at the status level.

**The general rule: when a plan promises that the user will see *different* outcomes for two
situations, verify the transport can tell them apart, and pin that as a wire contract rather than a
copy requirement.** A rendered-string test would have passed against an implementation that guessed
from message text and broke on the next locale change.

⚑ **The root cause of 1, 2 and 5: this document states the same fact in two places — once as a
decision, once as a file-table row — and review round 2 corrected only the decisions.** The tables
kept the superseded text, and a reader working from the implementation plan (which is what an
implementer reads) would have built the defect the decision section forbids.

This codebase already knows this failure mode and says so in its own source. From
[EditorsWidget.tsx:26](../app/src/components/AdminDashboard/EditorsWidget.tsx:26), on a type declared
in two places: *"two declarations that agree today are two declarations to keep in step."* The
document committed that error three times in one revision.

**Structural fix, applied here:** file-table rows now **point at the decision** ("per D13a step 1",
"per corrected D6") rather than restating its content, so the decision stays the single source. Where
a row must restate something, it says so and names what it must agree with. **When revising a
decision in §3, grep §6 for the same fact** — the tables are the duplicate most likely to be missed,
and the most likely to be read by whoever writes the code.
