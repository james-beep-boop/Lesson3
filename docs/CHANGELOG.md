# Changelog

Concise record of delivered product changes, newest first. Detailed implementation history through
2026-07-28 is preserved in
[`docs/archive/BUILD-HISTORY-2026-06-TO-07.md`](archive/BUILD-HISTORY-2026-06-TO-07.md).

- Current state and next work: [`docs/NEXT-SESSION.md`](NEXT-SESSION.md)
- Decisions and reasoning: [`docs/DECISIONS.md`](DECISIONS.md)
- Architecture and domain rules: [`SPEC.md`](../SPEC.md)

## Unreleased — checksummed GitHub deployment bundles and maintenance updates

Lesson3 now has a local-server release path that does not build source on the destination. A version
tag on protected `main` builds AMD64 and ARM64 application and migration images in GitHub Actions,
publishes them to GHCR with provenance and SBOM attestations, and attaches a small checksummed
deployment bundle to the GitHub Release. The bundle pins the application images by tag and manifest
digest, generates independent installation secrets, migrates before starting the app, and requires an
encrypted pre-migration backup for normal updates. The README and deployment guide provide the
copyable `curl`, checksum, installation, verification, backup, update, and recovery procedure. PR
#301 passed the protected-main review and CI gate. No release has been published yet; the first tag
and a clean installation from the resulting GitHub assets remain.

The release refreshes PostgreSQL from the moving `16-alpine` tag to PostgreSQL 16.15 pinned by
multi-architecture digest and updates the local Gotenberg sidecar to a smaller, pinned 8.36.0
LibreOffice-only image. Application maintenance includes Payload 3.88.0, Next.js 16.3.2, React
19.2.8, GraphQL 16.14.2, TypeScript 5.9.3, the matching `eslint-config-next` 16.3.2, and compatible
patch-level helpers. TypeScript 5.9's
stricter Fetch types exposed two Node `Buffer` response assumptions; DOCX download and PDF preview
now make one bounded byte copy at the response boundary, with no generator or document-format change.

The full local gate passed: unit 999/999, PostgreSQL integration 224/224, production HTTP 200/200,
all 47 Chromium cases, contract 16/16, deployment-sidecar 8/8, backup/status 53/53, typecheck, lint,
formatting, production and release-image builds, empty-database migrations on PostgreSQL 16.15,
release-bundle validation, and the production audit threshold. The HTTP suite exercised real DOCX
and Gotenberg PDF bytes. Five known moderate findings remain in Payload's Drizzle/esbuild tooling
chain; there are no high or critical production-audit findings.

## 2026-08-25 — plan taxonomy is immutable, and the editor opens on the lessons (MERGED #297)

**A lesson plan's subject and grade are now fixed when it is uploaded** — for everyone, Site
Administrators and trusted Local API scripts included. Moving a plan changes who can reach it while
every immutable version still carries the ingest relationship, so it is categorisation and RBAC
identity rather than editable content. The remedy for a wrong value is to delete the plan and upload
it again; an exceptional in-place repair needs an explicit migration. That remedy is safe by
construction, not convention: ingest matches an existing plan on subject-grade AND substrand id
together, so a re-upload under a different grade creates a NEW plan and never tries to move one.

An earlier guard (#291) refused a move only when it would desync the Official-version pointer, so a
plan with no pointer stayed movable. The unusable relationship control is now hidden rather than shown
greyed, and the SubjectGrade delete guard stopped suggesting "move them to another subject grade" — an
affordance that no longer exists.

**The version editor also opens on the lesson content.** Administrator-only identity — the document
title, META and the sub-strand overview — moved into one collapsed panel, *Plan and sub-strand
details*. Teachers never saw META or the overview (a role condition already hid both); what they had
was a disabled title field, now gone. The panel is a Payload `collapsible`, which carries no name and
therefore no data key: the regenerated types show a key reorder and nothing else, so no migration and
no render-version bump. No generator field was deleted, renamed, derived or revalued.

## 2026-08-25 — edit recovery is in the Guide, and the changelog is caught up (MERGED #296; DEPLOYED)

`USER_GUIDE.md` and the in-app `/guide` now document edit recovery, which had no user-facing
explanation at all: the automatic backup and its notice, that the capture is per-user and never applied
automatically, that the panel lists only what differs from the saved version, the word-by-word
colours, the three named labels, and the stale-capture case where work can be read and copied but not
put back. Five new parity claims hold the two surfaces together.

This file had also drifted from 2026-08-15, leaving roughly seventy merged PRs out of the
delivered-product history. #223–#295 are now all recorded; the six backfilled entries are marked as
such and were reconstructed from the contemporaneous handoff blocks rather than from `git log`.

## 2026-08-25 — the restore preview shows every change it would make (MERGED #295; DEPLOYED)

The unsaved-changes panel could hide the one change that destroys work. A recovered capture writes a
captured empty value **through**, clearing the field — but the panel dropped empty values before
comparing, so it could say "Nothing in these changes differs from the saved version" and then delete a
paragraph. Cleared fields are now listed, and each listed change is shown word by word using the same
red/green vocabulary as version compare.

A change the diff engine cannot draw is now **named** rather than rendered as a blank row, and the
three statements are distinguished because they mean different things: *Emptied* where the field would
be cleared, *Paragraph breaks changed* where only the line breaks moved (real — `\n` is a paragraph in
the editor's grammar, and the generated document changes), and *Spacing only* where nothing visible
differs. Dialog buttons also joined the app's button system by construction: the shared `Modal` emits
its own scope class, replacing a per-button opt-in that had been silently forgotten twice.

⚑ **The lesson, recorded because it repeated three times in one feature.** Each defect was a convenient
signal mistaken for the thing it resembled — truthiness for "will this be applied", annotation-presence
for "did anything meaningful change", and the captured value alone for "what is this change". All three
read correctly right up until they didn't. **When a tool's output is used as evidence for a claim,
check that the tool is measuring the claim.** Five review rounds; the last three defects were found by
human review after the tests were already green. Reasoning: `docs/DECISIONS.md` 2026-08-23.

## 2026-08-23 — the editor stopped offering what it would not honour (MERGED #286–#294; DEPLOYED)

Eight product PRs and a handoff, deployed to the Rock at `7193160`. The through-line is the editor
promising things it could not deliver.

- **The editor no longer offers edits the system drops (#291).** A teacher could change a biology
  lesson plan's subject to chemistry, or its grade, in a form that would then reject the write.
  Closed the invariant hole (it was reachable by simply omitting `officialVersion` from the payload)
  and hid three fields that are stored faithfully but editable by nobody. SPEC §5 gained a tier for
  that category.
- **The unsaved-changes dialog shows the change, not the document (#292, #293).** It had been listing
  the entire lesson plan, because a capture is a full snapshot; it now lists only fields that differ
  and shows each one as a word-level red/green diff, reusing the version-compare engine.
- **Dialogs look like the app (#289, #290, #287, #288).** The shared `Modal` is portalled to
  `document.body` — a `transform` on Payload's document-controls wrapper had been trapping
  `position: fixed`, laying every control-bar dialog out inside a ~235px strip below 1024px. The
  control bar also now names the version you are editing, and the recovery notice stopped rendering
  as a one-word-per-line vertical column.
- **Prettier across the repo, with a CI gate (#286)** so formatting cannot drift again.

No migrations. No generator or compare format-version change, so no export or comparison artifact was
invalidated.

> ⚑ **The six entries below were BACKFILLED on 2026-08-25**, covering #223–#285. This file had gone
> unmaintained from 2026-08-15, and the gap was flagged rather than quietly filled until an operator
> asked for it. They are reconstructed from the **contemporaneous handoff blocks** in
> `docs/NEXT-SESSION.md` — written at the time, not from `git log` archaeology — so they are shorter
> and less specific than an entry written at ship time. Where a detail was not in the record it was
> left out rather than guessed. Treat `docs/DECISIONS.md` and the handoffs as authoritative for this
> window; the lesson is in the entry for 2026-08-25.

## 2026-08-23 — compare finds the change (MERGED #284; DEPLOYED)

Version compare already coloured removals red and additions green, but on a forty-page bundle a
two-word edit was unfindable and the page could not say how much had changed. It now splits both
versions into the generator's own logical areas — a lesson's Section A–E tables, the sub-strand
overview, the differentiation table, and the corresponding areas of the Final Explanation and Summary
Table — pairs them by key, and renders each pair as one row. It opens on a **Changes only** view with a
count of the changed areas and a clickable index.

Three properties a later change must not undo, each pinned by a test: the split happens **before**
diffing (HtmlDiff rewrites the markup it annotates, so no header pattern matches its output);
`changed` comes from comparing **source HTML**, never from counting annotations (a paragraph split
emits none); and the diff cache is versioned independently of the render cache. Reasoning:
`docs/DECISIONS.md` 2026-08-23.

## 2026-08-22 — backups are proven recoverable, not just configured (MERGED #271–#283; DEPLOYED)

The backup story moved from "a script exists" to "a restore has been done and the app can say so".
Manage → System reports **verified** backup status read from a status file the backup script writes,
with compose as the only thing joining the two paths — a rename in either would have reported
"Unknown" forever, so a parity test now pins the app's read path to the script's write path.

`scripts/backup-db.sh` gained a **second age recipient**, so a school running offline can recover
without ARES holding the only key. The restore drill was run end to end and passed — and the drill's
own verification was found unable to fail, which was fixed first, because a green check that cannot go
red is worse than no check.

Also in this window: the project's code was licensed **MIT**, with a `NOTICE` for the parts MIT cannot
cover (the vendored ARES generator, and Gotenberg's own terms); link insertion arrived in the editor;
and the Guide was corrected to say that a teacher on an installation with no email is not locked out —
a Site administrator can create a reset link and hand it over directly.

## 2026-08-21 — the System panel, and two things that were not true (MERGED #260–#270; DEPLOYED)

Manage gained a **System** panel: the global facts about a deployment — version, database, backup
status, feature switches — in one place a Site administrator can read without shell access.

Two corrections matter more than the feature. **The Save endpoint became the sole writer of
system-settings** (#268): other paths could reach that document, which made a settings write an
unaudited side channel. And the vocabulary was fixed once, properly (#269): **there is no Editor user
type.** There are three user types — Teacher, Subject-grade administrator, Site administrator — and a
teacher who can edit holds *editing access*, a per-subject-grade capability, not a fourth account
class. The user-facing surface was cleaned and is now guarded; the stored identifiers (`'editor'`,
`isEditorFor`, the `assign-editor` route) deliberately keep their names, because renaming a stored enum
and a URL buys nothing.

## 2026-08-20 — a Subject Administrator may hand over, not take away (MERGED #258, #259; DEPLOYED)

**D6a is asymmetric, and deliberately so.** A Subject-grade administrator may hand administration to
somebody who *already* holds editing access in that subject-grade — which, given the one-per-subject
-grade limit and the auto-demote cascade, demotes the actor in the same transaction — and may **not**
remove an administrator, their own row included. Vacating is Site-Admin-only, and a Site administrator
is the only route back.

Enforced server-side in `enforceAssignmentScope`, covering the generic `PATCH /api/users/:id` and not
only the dedicated routes. Forward-only: grants written under the previous symmetric behaviour stay
valid. Assignment rows now carry system-written `grantedBy`/`grantedAt`, so an irreversible handover
has an answer in the data — a null means *unknown*, never *nobody*. ⚑ Do not "restore" the symmetric
rule on the strength of an older comment: SPEC §8 is canonical and `docs/DECISIONS.md` 2026-08-20 has
the reasoning.

## 2026-08-17 — the Manage redesign, in five parts (MERGED #239–#246; DEPLOYED)

Manage became an accordion of focused panels instead of one long page: the shell (#239), a lazily
loaded **Users** panel (#241), **Subjects** and **Subject grades** (#244), and **Roles & Access**
(#245), which is where editing access is granted and revoked.

Alongside it, three account controls a Site administrator previously had no UI for (#240): **disable
sign-in** for an account without deleting it, a **last-administrator guard** so the final Site
administrator cannot lock everyone out, and **admin-generated reset links** for installations with no
outbound email. Roles & Access also shows email addresses to Subject administrators — a deliberate,
narrow carve-out from the usual rule (SPEC §8, amended 2026-08-02), because an administrator has to
tell two identical display names apart before granting access.

## 2026-08-15 — a field-split hole, three request ceilings, and the deps wrapper (MERGED #223–#238; DEPLOYED)

**The security fix is the reason this entry exists.** Field-level permissions kept a teacher with
editing access out of admin-only *fields*, but not out of whole content *groups*: a crafted write could
delete an entire group past the field split (#227). Closed, with wire-level tests.

Also: request bodies gained ceilings that are read from one place and pinned against drift (#226,
#229), so a large payload is refused rather than parsed. Infrastructure faults stopped being laundered
into domain answers (#232) — a failing database read had been surfacing as "not found", which is the
same class of lie as a green check that cannot fail.

And the tooling: `scripts/in-deps.sh` became the one place that knows how to run a command in the
pinned dependency container (#230, #233), replacing a `docker run` incantation hand-copied into CI,
three docs and two scripts — each copy carrying traps, including the cwd trap AGENTS.md calls "the
trap that destroyed a working day".

## 2026-08-15 — public discovery, phase 1 (MERGED #216/#217/#219/#220; DEPLOYED)

The boundary and the data model for an optional public lesson library. **Nothing is public yet:**
`PUBLIC_LIBRARY_ENABLED` is unset, every existing plan backfilled to `private`, and the anonymous
resolver has no route consuming it. What shipped is the part that has to be right before a surface
exists at all.

`PUBLIC_LIBRARY_ENABLED=1` decides whether a deployment serves a public library. Off — the default,
and what every offline school installation runs — means absent: no Explore action on `/login`, and 404
from every public route, enforced server-side. Only the literal string `1` enables it, because `false`
and `0` are truthy strings in JS and a loose check would publish a school's corpus on a typo. Setting
it without `SERVER_URL` refuses to boot, since share cards and the printed footer need an absolute
base and degrade silently on exactly the pages built to travel.

Lesson plans gained `visibility` (private/unlisted/listed) and a unique `publicSlug`, Site-Admin-only.
Publication and Official stay independent in both directions: approving a version never publishes it,
and a published plan is served only at its current Official version — so an editor's retained working
copy cannot reach the public even though any authenticated user may read it. That is why the public
path is a narrow resolver rather than relaxed collection access: "Official only" cannot be expressed
as a permission, because Official is a trust marker. A slug is frozen once published, which makes a
forwarded link permanent by construction and removes any need for a redirect table.

Also fixed, as a prerequisite: the Official-pointer delete guard could decide from a stale read. A
plain `SELECT` under READ COMMITTED does not block on an uncommitted `UPDATE`, so a version could be
deleted while a promotion of that same version was in flight, and `ON DELETE SET NULL` then nulled the
pointer — destroying an approved snapshot and dropping the plan out of the library.

Verified in production 2026-08-15: `/` → 307, `/login` → 200 with no console errors, `/explore` → 404,
and both content collections 403 to anonymous callers. Reasoning: `docs/DECISIONS.md` 2026-08-14.

## 2026-08-15 — three row locks could silently hold nothing (MERGED #221; DEPLOYED)

`ingest`, `hooks/userRoles` and `endpoints/userAssignments` each hand-rolled a `SELECT … FOR UPDATE`
and each fell back to the connection pool when the transaction session could not be resolved. A row
lock on a pooled connection is released the instant the statement returns, so all three could hold
nothing while their callers proceeded believing a read-then-write was serialised. Replaced by one
`lockRows` helper that fails closed, locks the whole set in a single round trip, and makes the
ascending-order deadlock guard universal. Two unit tests had asserted the pool fallback as correct
behaviour, one calling it a "harmless no-op lock"; both now assert the refusal.

Cleaned up in #224 (no product change, so no separate entry): the consolidation had moved the code
but left the explanation copied at four former call sites, so four comments — including `txDb.ts`'s
own header — described code the same commit deleted. `lockLessonPlan` was inlined and its 46-line
race narrative moved to the call site, on the reasoning that the person most likely to delete the
lock is the one reading that line. `docs/DECISIONS.md` 2026-08-15 records what was deferred, and
proves that "≤1 Subject Admin per subject-grade" cannot be expressed as a Postgres constraint.

## 2026-08-15 — local development runs in the pinned container (MERGED #222)

`.claude/launch.json` had been unable to start since the Node 24 migration: `devEngines` rejects every
npm invocation on a host whose Node major isn't 24, and `npm ci` — the only way to populate
`node_modules` and bypass npm — is blocked by the same gate. `scripts/dev-server.sh` and
`scripts/dev-seed.sh` run in the `lesson3-deps` image instead, so both work on any host with Docker.
The seed step had the identical breakage and is fixed too; it joins the Postgres container's network
namespace so the seed script's loopback guard is satisfied honestly rather than argued past.

## 2026-08-12 — Node 24 Docker migration (MERGED #214; DEPLOYED)

Moved every shipped/tested Docker stage and both `.nvmrc` files from Node 22.23.2 to Node 24.19.0.
Local npm rejects non-24 majors but accepts supported 24.x patches; the unused Volta pin is gone.
The ARM64 Alpine production image now explicitly traces sharp's libvips shared library and proves a
real one-pixel render during the final image build, preventing a build-green/runtime-dead image.

Verification on native ARM64: the full production and Chromium images build; the migrated standalone
app starts; and the exact pushed commit also builds and renders through sharp on the Rock 5B itself.
The complete migration chain applies to a fresh database; 558 unit, 158 integration, 132 HTTP/authz,
and 25 browser tests pass; and both DOCX fidelity gates remain byte/content green. Two latent E2E
false-greens exposed by the new runtime were corrected: an intermediate-state race and fixture emails
that exhausted their own real signup quota. Merged onto `main` after a real amd64 GitHub Actions run
(the one architecture native ARM64 verification couldn't cover) went green in 11 minutes. See
`docs/DECISIONS.md` 2026-08-12 for the CI-trigger issue hit while landing this — the original PR
never got a CI run after being retargeted onto `main` and had to be replayed onto a fresh branch.

## 2026-08-12 — full audit remediation (MERGED #210; DEPLOYED)

Closed out a full external code audit (security, concurrency, resource-cleanup, and performance
findings across ~31k lines). Security: the Payload boot guard now fails closed on any DB error except
the expected pre-schema condition; the first-user-to-Site-Admin race is closed with a transaction-
scoped Postgres advisory lock; DOMPurify bumped to 3.4.13 with the render-cache version bumped to
match. Data integrity: `SubjectGrade` partial updates (PATCH with only one of `subject`/`grade`) no
longer skip the duplicate check or drop the other field, with real concurrent-write integration
coverage; cached JSON (preview/diff/export) is now schema-validated instead of trusted via unchecked
casts. Concurrency/resources: export-job dedup is DB-enforced via a partial unique index instead of a
racy application-level scan; failed artifact cache writes no longer leak temp files. Performance: the
catalogue's full-corpus version scan became a single `GROUP BY`; curriculum grouping's O(N²) lookup
became a map. Cleanup: `node_modules` had 265 Finder-style duplicate directories from the
Documents→Developer move, breaking `tsc`; ESLint now enforces zero warnings (was 100).

## 2026-08-09 — edit recovery, cleanup round 2 (MERGED #207; DEPLOYED)

Two real defects in code that was already live, found in a four-angle review pass. **The capture
request's deadline stopped at the response headers** — `fetch` resolves as soon as headers arrive, so a
stalled response body was unbounded, holding the single-flight guard forever and blocking the user's
save. **Two of the four recovery requests (`start`, `discard`) had no deadline at all** — `start` is the
worse one: if it never settles the debounce never schedules a capture, so the session silently takes no
backups while the indicator sits on "starting".

Also fixed: blur and visibilitychange were re-sending content the server already had on every alt-tab
(only the pre-expiry flush had the `isSafe()` short-circuit), and the restore prompt was rebuilding the
whole ~600 KB document on every render while open, including the renders the restore itself causes.

Deployed the same day, alongside #196 (an unrelated stale chore, rebased in) and #206 (documentation).
No migration. Verified: app healthy, and the read-only edit-recovery cascade probe green on the
redeployed image.

## 2026-08-08 — edit recovery deployed to production

PR 1 (server, #198) and PR 2 (client, #204) went live together, along with #205 (Payload 3.87.1 +
scoped nanoid pins, clearing three HIGH advisories). Verified: pre-migration snapshot taken, migration
ran clean, app healthy, `edit_recovery` table and cascade queries confirmed against real rows, and an
operator typed into the largest plan in the corpus (13 lessons, the one that used to 500 on a single
keystroke) and saw the indicator confirm the backup instead of a server error.

## 2026-08-07 — large lesson plans became editable again (MERGED #204)

⚑ **A pre-existing defect, unrelated to edit recovery**, found while spiking the restore path. Typing
one character into a large plan 500'd: Payload posts the whole form state through a Next.js Server
Action, whose default ceiling is 1 MiB, and the largest plan in the corpus produces ~1.5 MB. Saving
was never affected. What failed was Payload's own form-state sync, so field validation and conditional
logic silently stopped updating while the teacher typed — invisible without the console open.

Verified as an A/B on the plan the original measurement used: default → `500 POST`; with the raised
limit → no server errors. The value is derived from the document ceiling the save path already
accepts, so a document this system will store cannot become one it refuses to edit; a unit test pins
that relationship. Reasoning: `app/src/lib/serverActionBodyLimit.ts`.

## 2026-08-07 — edit recovery, PR 2: the client half (MERGED #204; deployed 2026-08-08)

On `feat/edit-recovery-client-capture`. ⚑ **Carries NO migration** — PR 1's is the only one this
feature needs — so its deploy is an ordinary app deploy. Unlike PR 1 this one IS user-visible.

**What a teacher gets.** Unsaved prose is captured while they type (debounced, plus on blur and ahead
of session expiry), with an indicator beside Save that says so — including when it has FAILED, because
a promise you cannot verify is worth nothing. Coming back to a plan with unsaved work from an earlier
session offers it back: shown in full, attributed to the lesson it came from, and applied only if they
press Restore. A capture whose source has moved since, or whose field shape has changed, is offered to
read and copy but never applied — its row ids may no longer mean what they meant.

**And the screen now clears at session expiry**, which it did not before: an idle tab used to leave the
previous teacher's document on a shared school machine with a dead session. It clears only when every
open editor confirms its unsaved work is stored; anything unproven leaves the work legible, because
the text on screen is then the last copy.

**Status:** merged, deploy pending. Verified on the merge commit — 545 unit tests across 63 files,
156/156 integration, 132/132 wire, 11/11 browser cases, `tsc` and ESLint clean, `audit:prod` green. Per-case acceptance status is
`docs/DESIGN-working-drafts.md` §7 — cases 1, 2, 3 and 11 are unclaimed there, with reasons.

⚑ **One finding is wider than this PR and is NOT fixed:** the editor's "view mode" does not make prose
fields read-only, because Payload's `useField()` ignores `useForm().disabled`. Nothing here depends on
it, but do not believe "the form is locked" elsewhere. DECISIONS 2026-08-07 (i).

## 2026-08-06 — edit recovery, PR 1: the server half (MERGED)

Merged from `feat/edit-recovery-server` (squash). ⚑ **Carries a migration** — a deploy must run
`migrate`, unlike the recent docs-only batches.

⚑ **UI-inert until PR 2 (client) ships — which is NOT runtime-inert.** No client sends a recovery
token, so every save takes the no-token path and retires nothing, no capture is ever started, and
nothing a user can reach changed on merge. But the server half is live: the six recovery endpoints are
mounted, the expiry task is scheduled, and the version-delete and user-delete hooks now query
`edit_recovery` on every delete. That is the optional-token contract doing its job — the server landed
without a flag day — and it is also why the migration is mandatory rather than merely tidy.

**DEPLOYED AND VERIFIED ON THE ROCK (2026-08-07).** Migration applied; `edit_recovery` present with
its compound unique index; health unchanged; corpus intact at 85 plans; the expiry task enqueued
itself on schedule. The check that mattered — a real version deleted through Payload with a seeded
capture attached, confirming the cascade REMOVES rows rather than merely querying them — passed via
`scripts/verify-edit-recovery-cascade.ts`, added for exactly this purpose.

- **The `edit-recovery` collection** — closed on all four operations for every role including Site
  Admin, compound unique on `(user, sourceVersion)`, both parent cascades plus the transitive
  plan→version→recovery path. DB-proven.
- **The projection** — `projectCapture` / `applyCapture`, importing the prose whitelists from
  `hooks/fieldSplit` so the save boundary and the capture boundary cannot drift apart, plus
  `normaliseProseValue` for code units the jsonb column cannot carry (unpaired surrogates and U+0000 —
  either of which previously made `capture` throw instead of returning a result).
- **The fencing kernel, all four statements** — `start` (only insert/reactivate path, a total no-op on
  resume), `capture` (CAS UPDATE, never an insert), `retire` (one transition, four callers, three
  precondition shapes, with a real transaction-rollback test), `expireCaptures` (select + per-row CAS),
  and `expireEditRecoveryTask` carrying a schedule so it actually runs.
- **`src/lib/txDb.ts`** — the drizzle primitives extracted from the feature module, failing closed when
  a `transactionID` has no resolvable session.
- **SPEC amendment**: retirement advances the **revision**, not the generation. The normative text said
  "revision/generation", which would have double-advanced across a retire-then-reactivate cycle and
  contradicted matrix case 22.

- **The six operations across four URL paths**, the `recovery` rate-limit bucket, and the migration.
  (Design §2's table lists five rows because it bundles metadata and cleanup, and `/:id/recovery`
  carries POST, GET and DELETE; the wire-authz rule counts OPERATIONS.) The body guards live in
  `endpoints/recoveryParse.ts` rather than inline, so they are unit testable without a database or a
  served app — the same split, for the same reason, as `previewParse.ts`.
- **A raw-body ceiling before `req.json()`.** Rate limiting bounds how OFTEN an authenticated editor
  may post, not how large a single post may be, so an oversized `Content-Length` is refused before the
  body is materialised. It is deliberately not the kernel's 512 KB storage cap — see the
  `MAX_RECOVERY_BODY_BYTES` docblock for the sizing, and DECISIONS 2026-08-06 for why.
- **Regression coverage for four fixes that shipped without any**, each watched failing against a
  deliberately reverted fix before being kept: the malformed-`document` guard and the body ceiling
  (`tests/unit/recoveryParse.spec.ts`), tombstones absent from the admin metadata view and `bytes`
  banded against the real serialised size (`tests/int/editRecoveryMetadata.int.spec.ts`), and the
  rollback's statement order (`tests/unit/editRecoveryMigrationOrder.spec.ts`).
- **The admin `bytes` figure is documented as APPROXIMATE.** `octet_length(content::text)` is the
  right quantity where `pg_column_size` was the wrong one, but jsonb renders its text in Postgres's
  canonical form — a space after every `:` and `,` — so it is consistently a few percent above the
  compact `JSON.stringify` the 512 KB cap measures. The docblock said "the SAME quantity"; it no
  longer does.

- **Save-as-new retirement — the fourth and last `retire` caller.** `versionEdit.ts` now retires the
  caller's capture inside the save's own transaction, after the candidate is created and BEFORE the
  optional source delete (whose cascade would otherwise remove the row the precondition needs). The
  recovery token is a SEPARATE multipart field, never a key in the bundle, so admin raw-document
  editing cannot persist recovery metadata as lesson content. It is OPTIONAL — no token means the
  pre-existing save behaviour and no retirement, which is what lets the server land before the client
  — while a half-token is a 400 rather than a silent no-op. A retirement conflict is a 409 that is
  **never retried**, unlike a semver conflict: the token is fixed at request time, so a retry re-runs
  an identical, identically-failing precondition. (It would not destroy the newer capture — the CAS
  keeps refusing it. Retrying is pointless work, not a data-loss path.)

- **`audit:prod` unblocked without a dependency change.** The gate went red on a branch that does not
  touch the lockfile: GHSA-5p4m-2wfm-xmqj was newly published against `js-yaml` 4.0.0-4.3.0 and the
  `overrides` block pinned exactly 4.3.0. Bumped to the patched 4.3.1 — one line, three in the
  lockfile. The 5 remaining moderates (`esbuild` via `drizzle-kit`, no upstream fix, a dev-server
  issue in a tool the served app never runs) are why the gate is `--audit-level=high`. ⚑ Never
  `npm audit fix --force` here: it proposes downgrading Payload to 2.x.

⚑ **Per-case acceptance status lives in `docs/DESIGN-working-drafts.md` §7 and nowhere else** — a
suite total is not a case list. This entry deliberately quotes no case numbers: the first draft of it
declared that rule and then enumerated the cases in the next sentence, which is precisely the second
copy the rule exists to prevent.

## 2026-08-05 — env templates reconciled behind a test; edit recovery approved for build

Merged to `main` from `chore/env-template-parity` (squash). No deploy required — see below.

- **Both `.env.example` templates reconciled, and the sync made mechanical.** The root template — the
  file a Compose operator copies — declared **5 of the 58** variables the app reads. The consequential
  omission was `ARTIFACT_CACHE_DIR`: unset, the cache falls back to a path the non-root container cannot
  write, and every export job fails with `EACCES` while the client polls a `202` forever, so a fresh
  correctly-followed install was broken on arrival. `app/.env.example` was a verbatim copy of the Compose
  file, pointing host-local dev at `postgres:5432` and carrying Compose-only `POSTGRES_PASSWORD`. Both
  now exist for their own consumer, pinned by `tests/unit/envTemplateParity.spec.ts` (7 assertions,
  AST-based). This reverses the Codex #5 deferral of 2026-07-06 — the deferral is what produced the
  broken install.
- **A CI blocker fixed that this branch introduced and a cleanup review caught.** `test:unit` runs in a
  container mounting only `app/`, where the root template is invisible; the spec would have failed every
  CI run. CI now bind-mounts the root `.env.example` alone at `LESSON3_REPO_ROOT`, with `--network none`
  — an interim fix mounted the entire workspace, exposing `.git` and its persisted checkout token to the
  test container, and was replaced before merge.
- **`IdleLogout`'s docstring claimed a redirect that never happens.** `logOut()` performs no navigation
  (verified in installed `@payloadcms/ui` 3.85.1); the destroying path is Payload's own
  `forceLogOutTimeout`. That one false clause had already sent a reviewer to the wrong mechanism.
- **Edit recovery (formerly "working drafts") reconciled and APPROVED for implementation** — no code yet.
  Normative rules in `SPEC.md` §5/§13, implementation design and a 30-case acceptance matrix in
  `docs/DESIGN-working-drafts.md`, reasoning in `DECISIONS.md`. Five provisions of the July draft did not
  survive review against the code (top-level content keys, hard deletion, last-write-wins, a staleness
  check that cannot fire, and an unqualified durability promise). `draft` is now a **reserved word**
  (SPEC §13) — it already means an unofficial *saved version*, so the feature is "edit recovery".
  `AGENTS.md`'s native-nested-fields rule is narrowed to the content of record, admitting one documented
  JSON exception.

No product behaviour changed: documentation, two config templates, one new unit test, one CI mount, one
corrected docstring. Unit **394/394**; tsc clean; eslint 0 errors; prettier clean on all changed TS;
`git diff --check` clean.

## 2026-08-03 — two manifest/test inconsistencies from the Node bump

- **The `as never` cast was fixed on the reviewed line and left on its twin.** The previous pass
  normalised the UPDATE case and left an identical `toId(sg.subject as never)` in the CREATE case two
  functions away — the flagged line got fixed, the problem did not. Both now share one typed
  `fixtureSubjectId()` helper.
- **`package-lock.json` still recorded `engines.node: >=22.17.0`** while `package.json` said
  `>=22.23.2`. Harmless to `npm ci` and to production, but the committed manifests disagreed.
  Regenerated: a clean one-line change, no dependency churn, and `npm ci` verified from the new
  lockfile.

⚑ **Recorded as a follow-up, not done here: `toId` is typed too narrowly for how widely it is used.**
`toId(x as never)` appears ~30 times under `src/` because the helper accepts one relationship shape
(`number | SubjectGrade`) and is called on many (`Subject`, `LessonPlan`, `User`, …). Each cast
silences a genuine type mismatch. The real fix is to generalise the helper to `number | { id: number }`
— but it is a shared authz helper, so that belongs in its own change with its own review, not smuggled
in via a test.

tsc clean; unit **365/365**; int **5/5** on the taxonomy spec; lint 0 errors; `audit:prod` exit 0;
`npm ci` clean.

## 2026-08-03 — Node 22.23.2: the npm undici bump did not fix the runtime

⚑ **Correction to the previous entry, which overstated the severity.** It said "four new HIGH
advisories". The real split is **two high and four medium**: `undici` GHSA-4cwx-7wf7-3272 (high) plus
four medium `undici` advisories, and `fast-uri` GHSA-7p8r-x3mc-p8w7 (high). npm's audit summary counts
affected *packages* with severity propagated up the dependency chain (`undici`, `fast-uri`, `ajv`,
`payload` → "4 high"), which is not an advisory count. The chosen patch versions were still correct.

⚑ **And the npm bump did not fix the path that matters.** `undici` ships twice: the npm package, and a
copy **embedded in Node** that backs global `fetch`. The Rock's container ran **Node 22.17.0 with
embedded undici 6.21.2**, and `src/generator/docxToPdf.ts` calls global `fetch` — so the npm bump to
7.29.0 left that call on 6.21.2, inside the `<6.28.0` advisory range. Fixed by moving every Node pin
**22.17.0 → 22.23.2** (`.nvmrc`, `app/.nvmrc`, `app/Dockerfile` base + e2e stages, `engines`, volta,
`AGENTS.md`); verified `node:22.23.2-alpine` embeds **undici 6.28.0**, and that the app image's base
stage reports it. 22.23.2 is the newest 22.x LTS and is itself a security release.

Exploitability here was limited — the call targets the trusted Gotenberg sidecar with no cookies,
retries or attacker-controlled origin — but "limited" is not "patched", and the fix is a pin bump.

**Tests made honest:**
- The rejected-update case asserted only `grade`. It now captures the whole row before and compares
  `grade`, `subject` **and** `displayName` after — `displayName` is rebuilt by `beforeChange`, which
  runs *after* `beforeValidate`, so "the guard threw but the derived title already moved" is a shape
  worth excluding rather than assuming.
- `toId(sg.subject as never)` dropped the cast. `toId` is typed for a subject-*grade* reference
  (`number | SubjectGrade`); this is a *subject* reference (`number | Subject`) — structurally
  different, which is precisely what `as never` hid. Normalised inline, the same way the collection
  hook narrows that field, rather than widening a shared authz helper to suit a test.

## 2026-08-03 — the deploy check now compares the same thing on both sides

- **The "durable" deploy check was asymmetric.** It compared "newest commit touching `app/`" locally
  against "repository HEAD" on the Rock — different questions, so a docs-only merge the Rock pulls
  reports a **false mismatch**. Demonstrated on real history: #181 (app code) and #183 (docs only)
  share the app tree `bc97756…` while their SHAs differ. Now `git rev-parse HEAD:app` on both sides —
  a content hash of `app/`, symmetric by construction and immune to docs commits. (Note
  `git rev-parse --short HEAD -- app` does *not* work: the pathspec is ignored.)
- **A test name that overclaimed is now true.** "still allows a legitimate move" only did a successful
  *create* plus a rejected update — the guard could have been rejecting every update and it would have
  passed. It now performs a real update and checks `displayName` follows.
- **…and that exposed a hole:** deleting the guard's self-exclusion left even the strengthened test
  green, because a move to a *free* grade finds no clash. The case it protects is **re-saving a row
  unchanged** (it collides with itself) — i.e. an operator pressing Save. Now covered, and it fails
  when the exclusion is removed.
- `docs/NEXT-SESSION.md` credited the duplicate-error fix to #186; it was #187.

tsc clean; unit **365/365**; int **5/5** on the taxonomy spec; lint 0 errors; sass compiles.

## 2026-08-03 — the duplicate-subject-grade error is readable, and the handoff stops naming a SHA

- **Creating a duplicate subject-grade said "Something went wrong."** The guard blocked correctly but
  threw a bare `Error`, which Payload returns as a generic 500 — so the one hook that exists to give an
  operator a readable message instead of an opaque constraint violation was itself opaque, for its whole
  life. Now an `APIError(…, 400)`: the form shows **"Grade 10 already exists for that subject."**
  Pinned by two integration cases asserting the status *and* the string, since the guard's blocking
  behaviour is identical either way and no behavioural test could see the difference.
- **The reported "stale subject" on that form is still unreproduced** across three navigation paths and
  was not patched speculatively — but the above is the likely cause: a save that fails with no
  explanation, on a form that (correctly) keeps what you typed, reads as a value that is stuck.
- **`docs/NEXT-SESSION.md` no longer names a deployed SHA.** It had gone stale twice that way and was
  three deploys out of date; it now carries the one-line command that checks the real answer.

tsc clean; unit **365/365**; int **5/5** on the taxonomy spec; lint 0 errors; sass compiles.

## 2026-08-03 — CodeRabbit follow-up: pin the email predicate, reject a refactor that changed behaviour

CodeRabbit's review of #184 landed after that PR merged. Verdicts on all six findings:

- **Taken — the email predicate is now pinned per role.** `buildEditorGroups` gates on two independent
  conditions (build-groups-at-all, and select-the-email-column). Every role clearing the first clears
  the second today, so the "no email" branch was unreachable and untested; a widened gate would have
  made it live having never run. Verified by narrowing the predicate: three tests fail.
- **Taken — per-row accessible names** on Remove/Add (already shipped in #185).
- **Rejected with a demonstration — the single-pass `Map` refactor.** A `Map` keeps the last value for
  a duplicate key, and a same-subject-grade `subjectAdmin`+`editor` pair is reachable via the demote
  path (`access/index.ts:119` documents it). With rows ordered `[editor, subjectAdmin]` an editor
  silently vanishes from the list. The CPU it saves is ~0 (measured 2.0 ms at 60 × 300).
- **Rejected — "narrow the email to Site Admins only".** That is the operator's decision, in SPEC §8
  and CLAUDE.md. The finding's premise (`SPEC.md` "not present in this repo") was false.
- **Rejected — two stylelint findings.** Stylelint is not configured here: no config, no script, not in
  CI. Those are the bot's own defaults, not this project's gate.
- …but the `calc()` wrap it flagged **was** genuinely hard to read (prettier had split `(rows - 1)`
  right after the `-`). Re-wrapped, arithmetic unchanged, and prettier preserves the new form.

tsc clean; unit **365/365**; int **10/10** on the access spec; lint 0 errors; sass compiles.

## 2026-08-02 — audit fixes: the launch config is actually shipped, and the email boundary is tested

- **`.claude/launch.json` is now TRACKED.** The previous entry claimed to fix it; `.gitignore`
  excluded it, so a clean clone still could not follow `AGENTS.md`. The reason it was ignored — a
  machine-specific absolute path — is exactly what the fix removed, so the rule is gone.
  `docs/NEXT-SESSION.md` no longer describes the dead path either.
- **The email carve-out has a per-role integration test** (`tests/int/editorGroupsAccess.int.spec.ts`,
  9 cases, run against a real database). This required extracting the boundary: `buildEditorGroups`
  (`app/src/lib/editorGroups.ts`) now owns the role gate, the trusted query and the client projection
  as one unit — inside the React server component it was an emergent property of several conditions
  sharing one general-purpose `isAdmin`, and untestable. Covers: Teacher and Editor get nothing and
  trigger **no query at all**; Subject and Site Admin get addresses; a caller-scoped `users` read
  still strips other people's emails while showing self; the whole grantable roster is disclosed to a
  Subject Admin (pinned so SPEC §8 and the code cannot drift apart again).
- **The freshness token is required again.** `toWidgetUser` accepted `updatedAt?: unknown`, so an
  omitted value became the string `"undefined"` — a token that never matches, making the stale-page
  409 guard fail *open*. Now typed `string`.
- `EditorsGroup` was declared in two places (it type-checked, since the shapes matched); now declared
  once in `lib/` and re-exported.

tsc clean; unit **363/363**; int **9/9** for the new spec; lint 0 errors; sass compiles. Re-verified in
a browser after the extraction — rendering unchanged.

## 2026-08-02 — /simplify: the remove dialog identifies people too, and SPEC §8's bound is corrected

Four-angle cleanup pass over the density/email work. Two behaviour changes, one document correction:

- **The remove confirmation and its toasts now identify people the way the grant picker does.** The
  argument for showing addresses is that granting access is an authorization decision and a name is
  not an identifier — and revoking is the same decision, yet `Remove editing access for <name>?` read
  identically for two people sharing a display name. A shared `personLabel` now serves the picker, the
  confirmation and both toasts.
- **SPEC §8's bound was factually wrong and is corrected.** It said the carve-out reached only the
  administrator's own subject-grades. True of the current-editors list; false of the grant picker,
  which must list every grantable user — so a Subject Administrator sees every non-Site-Admin address.
  Inherent to a grant picker, but a materially wider exposure than the sentence implied.
- **The email carve-out is gated on a named `mayIdentifyGrantCandidates` predicate**, beside
  `emailReadAccess` in `access/index.ts`, instead of on the general-purpose `isAdmin` that also picks
  copy strings and the author column.
- **The mobile row override now wins on specificity, not source order** — it was `(0-1-0)` against
  `(0-1-0)` and worked only by sitting later in the file; hoisting it would have silently restored the
  full-width-Remove layout on phones.
- **The visual spec compiles the SCSS** (`sass`, already installed) instead of scanning it as text,
  retiring a bespoke comment-stripper and a guard that asserted on authoring syntax rather than the
  cascade. "Sass compiles" is now part of `test:unit`.
- Admin compact buttons gained the `min-width` the frontend has (#180's both-dimensions finding, lost
  on the port); a dead `font-size` outranked by `.muted` removed; `WidgetUser` moved into `lib/`.

Known and deliberately deferred: adding `email` grew the Manage RSC payload ~54% (measured 1.34 MB →
2.06 MB at 60 subject-grades × 300 users) because `addable` is materialized per group. Sending the
roster once with id lists measures 20× smaller and fixes pre-existing bloat — to be done with the
deferred roster-pagination work, not as a cleanup. ~40 KB at current scale.

tsc clean; unit **363/363**; lint 0 errors; sass compiles. Re-verified in a browser as Site Admin and
Subject Admin at 1280 and 390.

## 2026-08-02 — Manage gets denser, and Editing access shows who people are

Operator report: "the manage page has too much white space … once we have a lot of editors that will
be very unwieldy", plus "should probably show the entire email address".

- **The editors list is 40% shorter.** Each row was **71px** — 16px of padding either side of a 38px
  control, to show one name. Rows carrying a single line now use tighter padding, and Remove takes
  the button system's **compact** density. Measured: **71px → 43px** per editor.
- **The admin surface finally implements compact.** `--app-btn-compact-*` has existed since #169
  for "in-row furniture … where a page-level 38px control repeated six times per row would swamp the
  list", but only the frontend ever implemented it — which is exactly why this list had a 38px
  Remove on every row. Restated inside the ≤640px block so it still reaches 44px on a phone
  (verified 26px at 1280, 44px at 390): the #179 trap, on the surface that had not hit it yet.
- **Empty subject-grades cost one row, not four.** "No one has editing access." now shares the Add
  row instead of stacking above it: **104px → 70px** per empty group. With a full curriculum most
  groups are empty, so this is the shape that decides whether the section is scannable.
- **Each person's email is shown beside their name, and in the grant picker** — a name alone is a
  poor thing to grant editing access on, and two people can share one. Shown to **Subject
  Administrators as well as Site Administrators** for their own subject-grades: granting editing
  access is an authorization decision, so withholding the only identifier the system holds made the
  privacy rule safe at the cost of making the authorization act unsafe. Recorded as a **bounded
  SPEC §8 carve-out** — `emailReadAccess` is unchanged, so every other surface still withholds
  addresses. Editors and Teachers see no part of this section.
  - The **picker** matters more than the rows: the rows are where a mistake is noticed afterwards,
    the picker is where it is made. Pinned by a test asserting no two selectable options read alike.
  - At 390px the list had rendered a **full-width Remove under every name** (98px per editor, a
    destructive control with more weight than anything else on the page). One-line rows now stay
    horizontal: **98 → 61px**. Found by screenshot — the geometry table passed, because every
    control still met its 44px target.
- **`.claude/launch.json` fixed** (pre-existing): it pinned a `node@22` path that no longer exists on
  this Mac, so the one launch config `AGENTS.md` points developers at could not start. Now plain
  `npx next dev`, verified by starting it. Its claim that node 25 breaks `next dev` was false; that
  remains true only of the Payload CLI.
- **New tests:** `editorsWidget.spec.tsx` and `uploadBundles.spec.tsx` (the upload stale-results fix
  previously had only manual verification). Both confirmed to fail against the defects they describe.

Verified in a browser as **both** roles: a Subject Administrator's page source contains zero other
users' addresses (RSC payload included), only their own. Editing-access section 490px, page
4509 → 4165px. tsc clean; unit 351/351; lint 0 errors.

## 2026-08-02 — Manage's controls all become standard buttons

Operator report: "Delete selected" was not a standard button, nor was Upload — "review all buttons
like that and make them consistent." An audit of every control on Manage found **six** outside the
system, all rendering at 29.08px / 16px / 3px against the system's 38px / 15px / 6px, plus four
unstyled `<select>`s at 31.19px. `Remove` read as bare text beside a bordered `Delete`.

- **Delete selected, Editors Remove, Editors Add and Upload** join the shared admin button block.
  Upload needed a class (`.lp-manage__upload`) first — it was an inline-styled `<div>`, and a
  control cannot join a system it is invisible to.
- **Manage's controls now opt in with `.lp-btn`.** The first cut of this fix extended a list of
  container scopes; a `/simplify` pass showed that list had grown to one entry per control across
  *three* rules, and that the third had been left un-extended in the same commit that documented the
  rule. One class replaces all of it. The version editor keeps its container scope, where the
  original "don't restyle Payload's in-form buttons" constraint genuinely applies.
- **The Editors picker and the delete-plans search** take the button system's geometry while keeping
  native `<select>`/input appearance — the same rule this PR applied to the frontend's compare
  pickers, now stated once per surface instead of invented twice.
- **The native file input stays outside, deliberately** — restyling it means giving up the OS
  control's keyboard and screen-reader behaviour. Documented so the next audit reads it as a
  decision.

Result: **one geometry across 16 of 17 controls** at desktop, and **all 16 at 44px** at 390px with
no overflow. The version editor's seven controls are unchanged.

Guarded by tests asserting that the geometry block and the ≤640px touch block list the *same*
scopes — the drift that let these controls sit outside the system since 2026-07-31. The guards were
confirmed to fail against the pre-fix stylesheet, and one of them caught a duplicate rule the fix
itself had introduced.

## 2026-08-02 — Guide and Compare join the visual system; `PageHeader` extracted

**PR 2b** of [`docs/DESIGN-visual-system-2026-07-31.md`](DESIGN-visual-system-2026-07-31.md) — the
last two frontend pages rendering outside the shared system. Presentation only: no authorization,
schema, endpoint or migration change. App-level deploy, **no migration**.

- **The Guide's page title was 22.4px/600** where every other page title is 30px/700. The shared
  treatment had been scoped `.lesson-heading h1`, reaching only the two pages that used that class,
  so the Guide declared its own. Rescoped to `.page-heading h1`; `.guide h1` deleted. Section
  headings, kicker, TOC and all spacing now come from the type and spacing scales.
- **The two compare version pickers were ~30px tall on a phone** — measured 30.59px at 390px. They
  belonged to no system: not `.btn`, and absent from the ≤640px 44px list, so nothing lifted them to
  the project's target. They now take the button system's geometry (38px desktop / 44px at ≤640,
  shared radius and type) while keeping native `<select>` appearance.
- **`PageHeader` extracted** ([`app/src/components/PageHeader.tsx`](../app/src/components/PageHeader.tsx)),
  deferred by PR 1 until a second page was in scope. Three callers: Guide, Compare, lesson page. It
  retired a duplicate — `.lesson-heading` / `.lesson-heading__actions` had rule bodies byte-identical
  to the `.page-heading` pair, and two pages applied both.
- **The guide TOC's anchor clearance is derived, not hand-typed.** `scroll-margin-top` was two magic
  numbers tied to the sticky bar's rendered height; retokenising the bar would have broken anchor
  landing silently. Both now derive from the tokens that build the bar (the #155 seam rule).

Verified in a browser at **390 / 550 / 700 / 1280** across the Guide, Compare, the lesson page and
the catalogue, with computed-geometry tables and screenshots: the lesson page measured
byte-identical before and after the `PageHeader` swap, TOC clearance 7.8–8.2px at every width, and
no horizontal overflow anywhere. Retokenising snapped four Guide spacing values to the scale
(20 → 24px, 20 → 16px, 7.2 → 8px, 12.8 → 12px) — small, deliberate, and recorded rather than
described as a pure restatement. The Compare fixture was a second version created through the real
edit-and-save workflow. `tsc` clean; unit **343/343** (11 new, each confirmed to FAIL against the
unfixed stylesheet); lint 0 errors; sass compiles.

## 2026-07-31 — narrow-screen editing explains itself; a local stack to verify UI before shipping

- **#172 (deployed)** — **PR B**, completing the wider-screen-affordance arc from #163 and finishing
  [`docs/DESIGN-button-system-2026-07-30.md`](DESIGN-button-system-2026-07-30.md) §4. Edit renders at
  every width; below 640px pressing it opens a dialog — *"Editing needs a wider screen. You can still
  view this lesson here. To edit, rotate your device, widen the window, or open the lesson on a larger
  screen."* — instead of unlocking the form (version editor) or navigating to it (lesson page). The
  copy leads with what still WORKS; the previous wording named only the remedy. The standing notice is
  removed from both surfaces along with the ≤640px rules that hid Edit, which retires the overlap class
  #165/#166/#167 each patched — that text was what competed for space in the narrow bar. The check runs
  at PRESS time (reading `window` during render breaks SSR); the once-on-mount guard is unchanged, so
  the guard decides the mode and the dialog explains it.
- **#173** — a local stack, so UI can be browser-verified BEFORE it ships. `docker-compose.local.yml`
  publishes Postgres on `127.0.0.1:55432`, opt-in via `-f` and deliberately not named
  `docker-compose.override.yml` (Compose auto-loads that on every invocation, including
  `scripts/deploy.sh`, which would publish the database on the Rock). `scripts/seed-local-dev.ts`
  seeds four role logins and one browsable lesson plan, and refuses any non-localhost `DATABASE_URI` —
  a guard now unit-tested, since it is what stops known-password accounts reaching a shared database.
  Commands and traps: `AGENTS.md` → Local stack. No app code; runs nowhere but a developer's machine.
- **#174** — `app/.dockerignore`. The builder stage's `COPY . .` had no exclusions, so any `app/.env`
  (which holds `PAYLOAD_SECRET` and the DB password) was baked into an image layer. Nothing leaked —
  the Rock has no `app/.env` — but that was luck, and #173 made a local one likely.

**#172 is the first UI change on this project verified in a browser before merge** rather than after
deploy. Across #169–#173, five defects were caught by a reviewer or by looking at a phone, and none by
the unit suite, `tsc` or eslint.

## 2026-07-30 — one button system across the app and the version editor (deployed)

The lesson page and the version editor rendered **nine** independently-authored button treatments.
`.page-back` was the only control with shared tokens; everything else was styled where it was
invented. Plan and reasoning: [`docs/DESIGN-button-system-2026-07-30.md`](DESIGN-button-system-2026-07-30.md).

The root defect: **`.btn` never declared `background`**, so `<button class="btn">` inherited the UA
`buttonface` gray while `<a class="btn">` stayed transparent — one class, two renderings.

- **#169** — `--app-back-*` generalised into `--app-btn-*`, shared by both stylesheets in px (the
  admin root is 15px vs the frontend's 16px). Four emphases (standard / primary / quiet / danger) on
  two densities (page-level / compact); emphasis carries meaning, so a filled **accent** background
  and weight 600 mean primary. Every state specified, not just default and hover: keyboard focus
  gains an offset ring *on top of* the fill, and disabled/busy are stated explicitly instead of with
  `opacity`. `.compare-link`, `.versions-chip`, `.page-back` and `.btn-doc` collapse onto `.btn`.
  Favorite becomes an ordinary outlined button whose star fills when selected. Back reads "Back"
  everywhere with the destination in `aria-label`. Official/Not Official stop being pills and become
  status text in bold ink on both surfaces. Payload's own Buttons are re-pointed at the shared tokens
  by overriding its custom properties, scoped to `.lesson-controls-wrap` so native form controls are
  untouched.
- **#170** — subject/grade filters join as `.btn.btn--quiet`, with a new `.is-active`
  **selected-in-a-set** state that fills (D4's "blue means selected", expressed rather than
  overridden). Deliberately distinct from Favorite's toggled star: a filter set's selection is the
  point, whereas Favorite is one optional switch among more consequential actions. Also fixed a
  mobile nav bug — `.app-header` and `.app-nav` shared an `align-items: flex-start` rule, correct for
  the header (a column there) but wrong for the nav (a row), which top-aligned ~22px text links
  against the 44px avatar; and the labelled Favorite rendering at 1.35rem on phones, where a second
  `.fav-toggle` copy inside `@media` beat `.btn` on source order.

Presentation only throughout — no authorization, schema, endpoint or migration change. The
narrow-screen Edit dialog is deliberately **not** in this batch; it remains PR B.

## 2026-07-29 — narrow-width view-only editor: overlap fixes (deployed)

Follow-ups to the wider-screen-affordance feature below, from showing the ≤640px editor at all (the
Payload admin editor was never made mobile-responsive). All CSS-only, no migration.

- **#165** — the "editing needs a wider screen" notice wraps onto its own full-width row instead of
  collapsing into a one-word-per-line column beside the viewing buttons. Also pinned the
  "an edit already underway is not cancelled on resize" contract with a jsdom test, and fixed a SPEC
  markdown-lint nit.
- **#166** — the in-form jump nav (a desktop editing aid) is hidden at ≤640px, where editing is
  unavailable; it had been overlapping the form fields.
- **#167** — the editor control bar takes its natural height below Payload's mid-break (≤1024px):
  Payload pins `.doc-controls__controls-wrapper` to a fixed one-row height there, which crammed the
  multi-row bar and overlapped the first field. Also covers an unmaximised <1024px editing laptop.

## 2026-07-29 — editing is a wider-screen affordance; 640px or narrower is view-only (deployed)

- At **640px or narrower**, lesson-content editing is unavailable: the lesson page's **Edit** button,
  the version editor's **Edit / Save / Cancel**, and the `?edit=1` deep link are hidden and replaced
  by a short notice that names the remedy ("rotate, widen the window, or open on a larger screen") —
  an explanation, not a silently missing button. Primary editing surface is laptops (1280×800,
  editable even unmaximised); phones are view-only.
- Progressive disclosure only — **not** an authorization boundary. Server RBAC is untouched, no
  endpoint gets a viewport check, and a landscape phone / "request desktop site" simply gets the
  cramped editor. **Make Official, Delete**, previews, Share, messaging, favorites, version history,
  user administration and everything else stay at every width.
- Behaviour: new edit intent is neutralised on initial load (a once-on-mount guard); an edit session
  already underway is not cancelled by a resize, so narrowing the window mid-edit keeps Save. No
  schema or data migration.

## 2026-07-29 — "Editor" reframed as editing access (presentation only; #160 merged, deploy pending)

- The user model now shows **three types** — Teacher, Subject-grade administrator, Site administrator
  (sentence case). "Editor" is no longer a type: a user whose only grant is `editor` shows as
  **Teacher** with a separate **"Editing access: …"** line; a subject admin's own scope shows under
  **"Administrator: …"**. Authorization, schema, endpoints, and the stored `editor` value are
  unchanged.
- The type + scope lines are resolved once in `lib/accessScopes.ts` and shared by the user menu and
  the Manage page, so the two surfaces can't drift. Site admins show one "All subjects and grades"
  line on both; a subject-grade you administer is never double-listed under editing access.
- Management copy, the request-editing email, the in-app guide (`#editors` anchor kept),
  `USER_GUIDE.md`, and `SPEC.md` §5/§8 were reworded to match. `payload-types.ts` regenerated for the
  one changed field description.
- No schema or data migration.

## 2026-07-29 — editor: drop the redundant description, Back onto the title row (#159; deploy pending)

- Removed the version editor's collection description ("Save button writes your edits as a new
  version…") — the same rule already lives in the **Editing help** modal, so the passive banner
  duplicated it. Regenerated `payload-types.ts`; the label test now asserts the description is gone.
- Moved **← Back to lesson** onto the "Editing: <title>" row at the top right; the
  Save/Cancel/preview/help buttons drop to the row beneath it. Matches the frontend's
  Back-next-to-title placement and removes the lonely wrapped row.
- No schema or data migration.

## 2026-07-29 — Back-button consistency follow-up (#158)

- Unified the Back control's appearance with shared fixed-size/font tokens: the frontend uses one
  `PageBackLink` component and the version editor a plain `<a>` carrying the same `.page-back`
  styling, so both look identical across the 16px frontend and 15px Payload roots.
- Navigation is the fastest correct one per surface: frontend Back uses Next `Link` for soft
  client-side navigation (no full reload); the editor's Back crosses root layouts — a full reload
  either way — so it stays a plain `<a>` rather than routing a guaranteed reload through `next/link`.
- Standardized placement at the top right. On lesson pages, Back now sits to the right of
  **Favorite/Favorited**.
- Moved the Guide's Back control from the footer to the top-right heading.
- Applied the same control to password recovery's **Back to sign in**. Close-tab preview guidance is
  the only workflow-specific exception.
- Approved the separate user-model language design: **Teacher**, **Subject-grade administrator**,
  and **Site administrator**, with editing access shown on its own scoped line. No authorization or
  schema change.

## 2026-07-28 — plain-language editor and consistent navigation (#157; deploy pending)

- Removed the repeated technical writing note from roughly forty fields and added one accessible
  **Editing help** dialog.
- Renamed technical editor headings (`META`, `UNIT`, `SLO`, and related labels) in teacher-facing
  language. Renamed Title to **Document title** and removed descriptions that explained internal
  storage rather than the teacher's task.
- Simplified the remaining People and Curriculum administration descriptions in the same plain-language
  pass.
- Hid system-numbered lesson and summary rows; their row headings already show the number.
- Renamed the editor previews **Quick preview ↗** and **Formatted PDF ↗**, with explicit new-tab
  guidance and a return-to-edits banner in the HTML preview.
- Made **Back to lesson plans** / **Back to lesson** prominent, consistently styled, top-right page
  actions on the lesson, comparison, and editor pages. Preview tabs deliberately have no Back link,
  which protects unsaved work in the original editor tab.
- Updated the in-app Guide and `USER_GUIDE.md`.
- A full code audit plus a four-angle `/simplify` pass followed: honest Modal-backdrop docs, a
  corrected toolbar comment, one de-duplicated `role="status"` announcement (the button already
  carries the "preparing" state), and a unified `.lesson-heading__actions` Back-button layout on the
  comparison page. `payload-types.ts` was regenerated on Node 22 so it is byte-clean generator output.
- No schema or data migration.

## 2026-07-28 — editor verification and permission correction (#154, #155)

- Live browser verification completed for the current-section indicator, collapsed lesson rows,
  Final Explanation / Summary Table tracking, focus behavior, mobile layout, and all three editing
  roles.
- Fixed a 6px toolbar/scroll-margin mismatch that caused a clicked lesson chip to highlight its
  neighbor. The script now reads the CSS value instead of duplicating it.
- The details sidebar now starts hidden, widening the editing column.
- The Edit button now appears only when the signed-in user can edit that subject-grade.

## 2026-07-25–27 — editor usability batch, first release (#150–#153)

- Added the active lesson/section indicator and collapsed lesson, phase, section, rubric, and summary
  rows by default.
- Cleared only obsolete stored collapse preferences so existing test accounts received the new
  default; other preferences and ownership were preserved.
- Hardened the deployment path: sidecar provenance is checked, Arial installation retries and is
  verified, and the deploy script has automated branch coverage.
- Corrected the preference cleanup to use Payload's Local API properly (`user` is an operation option,
  not document data).

## 2026-07-21 — security and runtime hardening (#128–#142)

- Made the browser end-to-end suite a CI gate.
- Made every unread message reachable so the unread badge can return to zero.
- Moved best-effort job enqueues outside the caller's transaction, preventing a failed enqueue from
  silently rolling back the primary write.
- Closed the forgot-password timing oracle with a fixed response-time floor.
- Fixed blocked-popup handling in both PDF-preview paths.
- Restored compile-time and runtime checks on detached job inputs.
- Treat orphaned artifact pre-warms as benign no-ops and closed the delete-between-reads race.
- Updated `sharp` to clear the applicable libvips security findings.

## 2026-07-20–21 — audit remediation and live resource cutover (#114, #119–#126)

- Added `/lessons` → `/` and `/manage` → `/admin` redirects while preserving lesson-detail routes.
- Denied direct caller creation of pointerless lesson plans.
- Removed a destructive legacy end-to-end fixture and an invalid PDF pixel gate.
- Moved the versions panel onto the shared accessible modal.
- Closed forgot-password account-existence leaks server-side and corrected mixed-case/padded address
  delivery.
- Made PDF preview stay busy until conversion actually finishes.
- Verified the Rock corpus: 42 plans, 42 Official 1.0.0 versions, 384 Official lessons, 1,950 resource
  rows, and zero unsafe URLs.

## 2026-07-19 — definitive ARES resource links (#108–#111)

- Adopted the definitive ARES JSON 1.0.0 lesson-level resource contract.
- Stored each lesson's five resource phases as native child rows, avoiding PostgreSQL's 100-argument
  reconstruction limit while keeping the external ARES shape unchanged.
- Preserved system-managed resource data when a Subject Administrator duplicates a lesson.
- Added contract, ingest, round-trip, HTTP, generator, hyperlink, and migration coverage.

## 2026-06-24–25 — Official-version model completed

- Backfilled the legacy corpus into `lesson-plans` plus immutable
  `lesson-bundle-versions`, with one Official pointer per plan.
- Moved teacher reading, preview, editing, comparison, export, and Make Official flows onto versions.
- Save now creates a new Not-Official version; existing versions are immutable.
- Retired the legacy `lesson-bundles` collection and its duplicate generator/endpoints.
- Split export into state-changing POST preparation and idempotent GET serving.

## 2026-06-22–24 — editor, library, PDF, and asynchronous export

- Added unsaved content preview, teacher reading view, array row labels, and editor field-level
  boundaries.
- Added PDF generation by converting the approved generated DOCX through the local Gotenberg office
  engine—no parallel renderer.
- Added artifact caching, background export jobs, concurrency limits, rate limits, and locked-down job
  administration.
- Rebuilt the library as a strand-first curriculum view and added the role-aware Manage dashboard.
- Unified login/navigation and simplified teacher downloads to Word/PDF with inline resources.

## 2026-06-17–22 — ARES contract and generated-document completeness

- Established the ARES 1.0.0 data contract and promoted contract drift from warning to hard ingest
  failure.
- Modelled the complete Sub-strand Overview fields and verified stored-data round trips.
- Added safe `.js`/`.json` extraction that parses data without executing uploaded code.
- Added the repeatable DOCX round-trip/fidelity gates.

## 2026-06-09–16 — foundation and first usable application

- Created the Payload CMS / Next.js / PostgreSQL application with role-based access control.
- Vendored and connected the byte-pristine ARES DOCX generator.
- Added safe ingest, native nested lesson fields, publishing/completeness rules, browser upload,
  content preview, DOCX export, branding, and idle sign-out.
- Proved the initial Biology lesson path from ingest through database storage to regenerated DOCX.
