# DESIGN — edit recovery (unsaved-edit durability)

**Status: APPROVED; not implemented.** Reconciled 2026-08-05 after adversarial review (five rounds).
First drafted 2026-07-20.

> **Filename kept deliberately.** This file is cited from `SPEC.md`, `docs/DECISIONS.md`,
> `docs/NEXT-SESSION.md`, `docs/DESIGN-editor-usability-2026-07-25.md` and a source docstring. Renaming
> it would break every one of those references for a cosmetic gain; the *feature* is renamed (below),
> the path is not.

The normative rules live in **`SPEC.md` §5** (the invariant, the guarantee's boundaries, access
posture, the storage exception, fencing, retirement, caps) and **§13** (shared computers, reserved
words); the `AGENTS.md` native-fields rule was narrowed to admit this one exception. **This document
is the implementation design and the verification matrix** — read SPEC §5 first for what is promised,
then this for how it gets built.

Addresses **L3-13** (session expiry silently destroys unsaved lesson edits) and the broader
edit-durability gap: browser crash, forced refresh, device sleep, accidental tab close.

> **Naming.** The feature is **edit recovery**, never "drafts" — `draft` already means an unofficial
> *saved version* in this product (SPEC §13 reserved words), so "draft saved" would tell a teacher
> their version was saved when it was not. Collection `edit-recovery`; UI "Unsaved changes backed up ·
> <when>". Earlier revisions of this file said "working drafts" throughout; that name is retired.

---

## 0. What changed in the 2026-08-05 reconciliation, and why

Recorded rather than silently overwritten, because the first draft was reviewed *against the code* and
five of its provisions did not survive. Anyone holding an older copy should know which parts were wrong.

| First draft said | Now | Why |
|---|---|---|
| Content = editor-writable **top-level keys** (`lessons`, `finalExplanation`, `summaryTable`) | Deep projection from the `*_PROSE` constants | `lessons` carries `resourceLinks`, `framework[].phase`, `duration`, `number` — a top-level whitelist would have persisted system and admin-only data into a user-readable row, violating this document's own prohibition |
| Hard-delete on save/discard | Clear content, keep a **retirement marker** | A stale tab's next capture *recreates* a deleted row — resurrection, not a lost update, and no revision token can fence a row that no longer exists |
| "Two tabs: last write wins, and the restore prompt makes divergence visible" | Server-issued **generations** + **revision** preconditions | Untrue as written: one tab can silently overwrite another's capture, or recreate it after the first tab saved |
| Staleness (`baseUpdatedAt`) would catch a stale tab | It cannot | `save-as-new` leaves the source version untouched, so a stale tab's timestamp still matches. This is exactly why markers are retained for the source version's lifetime |
| (unstated) | Prose-only scope is explicit, and the indicator is **role-aware** | Subject Admins edit structure, phases, durations and answer keys in the same editor; an unqualified "saved" would be false for them |
| (unstated) | The guarantee is the **last server-confirmed capture** | The debounce window, an in-flight request and offline time are necessarily outside it; client-side persistence is disqualified by SPEC §13 |

Also corrected: §1 of the first draft implied our `IdleLogout` was the work-destroying path. It is not
— `logOut()` performs no navigation (verified in installed `@payloadcms/ui` 3.85.1). That one wrong
inference cost a later reviewer a misfiled finding. See §1.

---

## 1. The problem this solves

Verified against installed Payload 3.85.1 (`providers/Auth/index.js`):

1. `tokenExpiration: 7200` (2 h); `admin.autoRefresh` off. A reminder modal precedes expiry by
   `min(60 s, expiresIn / 2)`.
2. **Path A — Payload's own `forceLogOutTimeout`** (≈ line 101) calls `revokeTokenAndExpire()` then
   `redirectToInactivityRoute()`, which is `startRouteTransition(() => router.replace(…))`.
3. Payload's dirty-form guard `usePreventLeave` registers **only** `beforeunload` and a document
   **click** listener. Neither intercepts a programmatic navigation.
4. The editor unmounts. **All unsaved form state is destroyed with no prompt**, and because it is
   `replace` (not `push`) the page leaves history, so Back cannot recover it.
5. **Path B — our `IdleLogout`** calls `logOut()` (≈ line 164), which POSTs `/<collection>/logout` and
   clears the in-memory user. **It does not navigate.** The editor stays mounted: a **zombie editor**
   — work on screen, session dead, every save 401ing — and on a shared machine the previous teacher's
   content is left visible to whoever sits down next.
6. There is **no autosave and no recovery persistence** anywhere: no `localStorage`/`sessionStorage` in
   `src/`, and no Payload drafts/autosave on `lesson-bundle-versions` (deliberately — versions are
   immutable).

| Path | Mechanism | Current outcome |
|---|---|---|
| A — foreground expiry | Payload `forceLogOutTimeout` → `router.replace()` | editor unmounts, **work destroyed** |
| B — backgrounded → refocused | our `IdleLogout` fires first; `logOut()` clears both timers, no navigation | **zombie editor**: work on screen, session dead, saves 401 |

Both need fixing, and the fix for both is *capture the working copy, then clear the screen* — clearing
is itself the privacy control (SPEC §13), so "stop unmounting" is never the answer.

---

## 2. Model — the `edit-recovery` collection

```
edit-recovery
  user           relationship -> users                    (required, server-stamped)
  sourceVersion  relationship -> lesson-bundle-versions   (required)
  lessonPlan     relationship -> lesson-plans             (denormalised, for listing/cleanup)
  generation     number    (server-issued; fences RETIREMENT)
  revision       number    (monotonic per write; fences CONCURRENT WRITES)
  retiredAt      date      (null = active; set = tombstone, content cleared)
  baseUpdatedAt  date      (the source's updatedAt when the session began)
  schemaVersion  text      (guards restoring against an older field shape)
  content        json      (sparse prose overlay; NULL once retired)
  updatedAt      (native)
```

**Uniqueness:** one row per `(user, sourceVersion)` — that row is either an active capture or that
pair's retirement marker. Capture is an upsert.

**Access — nothing client-facing.** `read`, `create`, `update`, `delete` all closed;
`admin.hidden: true`. Rationale and the Payload-first gap are recorded in SPEC §5; briefly: default
REST offers no upsert, closing `read` makes "lost editing access ⇒ cannot restore" structural rather
than incidental, and closing `delete` stops an owner erasing their own retirement marker.

**Endpoints** — on `lesson-bundle-versions`, beside `/:id/preview` and `/:id/save-as-new`. Each
re-loads the source and re-runs `authorize(req, 'editor')` on every call, then writes with
`overrideAccess`:

| Endpoint | Purpose |
|---|---|
| `POST /:id/recovery/start` | Explicit session start. Returns the active generation, or mints one. Never called implicitly. |
| `POST /:id/recovery` | Capture (upsert). Requires `generation` + `expectedRevision`. Stale/missing ⇒ **409**. |
| `GET /:id/recovery` | Fetch the active capture, for the restore prompt. |
| `DELETE /:id/recovery` | Explicit discard ⇒ retire. |
| `GET /:id/recovery/meta` (+ cleanup op) | Site Admin: existence/metadata and authorized retirement. Never content. |

Each ships wire-level 401/403/404 plus happy-path coverage in `tests/http` in the same PR (CLAUDE.md
standing rule), and a `recovery` bucket in `lib/rateLimit.ts` sized for the real worst case — several
tabs, blur flushes, the pre-expiry flush. **A 429 must produce visible backoff, never silent
abandonment** (§5).

---

## 3. What is stored

A **sparse map of prose leaves keyed by row id**, derived from the deep whitelist already in
`hooks/fieldSplit.ts` — `LESSON_PROSE`, `SLO_PROSE`, `FRAMEWORK_PROSE`, `SUMMARY_PROMPT_PROSE`,
`FINAL_EXPLANATION_PROSE`, `SECTION_PROSE`, `SUMMARY_LESSON_PROSE` — which
`tests/unit/proseWhitelistDrift.spec.ts` pins mechanically to the `canEditProse` field factories.

Consequences, by construction rather than by policy:

- `resourceLinks` (lesson-level), `framework[].phase`, `duration`, `number`, `sections[].exemplar`,
  `rubric[*]`, `META`, `semver`, `author` and row ids **cannot** enter a capture.
- An admin/system field added later is excluded automatically, in the secure direction.
- The projection inherits the existing drift test for free.

**One source of truth:** the same constants define "what an Editor may write" at the save boundary and
"what a capture may hold". On restore a capture supplies prose only; `applyEditorFieldSplit` remains
the write-time authority.

**v1 is prose-only** (SPEC §5). Structural edits change row identity, so a sparse overlay has nothing
stable to key on — admin-scope recovery is a *different storage model* (a full snapshot, with the
answer-key sensitivity that implies) and is deferred rather than half-built.

---

## 4. Fencing protocol

Two mechanisms, two jobs — keeping them separate is what keeps this comprehensible:

- **`generation` fences retirement.** Server-issued, never the client's choice. `start` returns the
  active generation or mints a new one, so clicking Edit twice, or in two tabs, is safe. A capture
  carrying a retired or absent generation is **409, and never an implicit restart.**
- **`revision` fences concurrent writes.** Every capture supplies `expectedRevision`; on mismatch the
  client refetches rather than overwriting.

**Retirement is one shared function with four callers** — save-as-new, explicit discard, 30-day
expiry, Site-Admin cleanup. It atomically clears `content`, sets `retiredAt`, and advances
revision/generation. **None hard-delete.** Because all four share one function, expiry cannot be SQL
inside `scripts/prune-db.sh` (a second implementation, free to drift); it becomes a Payload job, and
`prune-db.sh` keeps only the bookkeeping tables it already handles.

**On save-as-new**, retirement joins the existing transaction in `endpoints/versionEdit.ts` **inside
the semver retry attempt**, so it can neither half-apply nor double-apply. A generation mismatch there
fails the whole save with 409 rather than retiring newer work — and unlike a semver conflict, a
mismatch is **not** retryable.

**Row deletion happens only by parent cascade.** Required relationships mean NOT NULL columns with
`ON DELETE SET NULL` FKs, so a parent delete must remove these rows first or Postgres raises 23502 —
the trap `cascadeDeleteFavoritesBy` already documents. Add a `beforeDelete` cascade to **both**
`LessonBundleVersions.ts` (today `[enforceOfficialNotDeletable, cascadeDeleteVersionFavorites]`) and
`Users.ts` (today `[cascadeDeleteUserFavorites, cascadeDeleteUserMessages]`), threaded through the
parent's transaction. One hook per parent covers every path: `save-as-new?deleteSource=true`,
`make-official?deletePrevious=true` and the plan cascade all run the row's own `beforeDelete`.

---

## 5. Lifecycle

**Start.** Clicking Edit calls `recovery/start`. `LessonControls` already holds `useForm`,
`useAllFormFields` and `useFormModified` and drives the read-only lock, so it is the host.

**Capture.** Debounced ~8 s idle, plus on blur, while the form is modified and unlocked. Inert while
the form is read-only.

**Pre-expiry flush.** `IdleLogout` holds `tokenExpirationMs`; flush shortly before the deadline so the
final capture lands while the token is still valid.

**Save.** Pause capture → flush → await any in-flight write → `save-as-new` with the current
generation. **If the flush fails, save anyway**: the version save is the operation that matters and
the capture is insurance. Blocking a real save on failed insurance inverts the priority exactly.

**Failure surfacing.** The indicator shows the confirmed timestamp — "Unsaved changes backed up · 12 s
ago". On 429 or network failure it must show **not backed up** and keep the form dirty; the timestamp
*is* the contract (SPEC §5), so silence would make the guarantee a lie. Role-aware: administrators see
explicitly that structural and answer-key edits are not covered.

**Clear the screen on BOTH expiry paths.** Path A already unmounts. Path B must clear too — today it
leaves the previous teacher's content on screen.

**Restore.** On opening the editor, if an active capture exists for `(user, sourceVersion)`: offer it,
never auto-apply, showing when it was captured. Applying marks the form dirty; discarding retires it.

**409 on a stale tab.** Surface the stale content **read-only** so the user can copy it out before it
goes. Silently discarding keystrokes the user really typed would defeat the point of the feature.

**Staleness / schema drift.** `baseUpdatedAt` mismatch ⇒ warn. `schemaVersion` mismatch ⇒ view/discard
only, never applied.

**Caps.** Per-user **active** count ~20 (tombstones excluded, or a prolific editor gets locked out),
approximate enforcement acceptable; per-capture byte limit **hard**, checked before storage.

---

## 6. Operator decisions (ANSWERED 2026-07-20, unchanged)

1. **TTL — 30 days** after last touch, then retire (clear content, keep the marker).
2. **Storage ceiling — capped.** Active count bounded (~20); an oversized capture refused.
3. **Site Admin sees EXISTENCE ONLY** — count/metadata plus a cleanup operation, never content. No
   admin read bypass, so a support question is answerable without reading private unsaved work.
4. **Cross-device recovery — YES**, through the same explicit restore prompt.

---

## 7. Verification matrix (required before calling this done)

Disposable stack, shortened `tokenExpiration`. Browser-level for 1–13 (the defect is client-side);
wire-level for 14–16; DB-backed for 17–20.

| # | Case | Expected |
|---|---|---|
| 1 | Path A foreground expiry, dirty form | captured; screen cleared; recoverable after re-login |
| 2 | Path B backgrounded → refocus expiry | same; **no zombie editor left on screen** |
| 3 | "Stay logged in" clicked | session refreshes; no spurious restore prompt |
| 4 | Same user re-logs in | capture offered, not auto-applied; content exact |
| 5 | **DIFFERENT user logs in on the same browser** | **sees nothing — no prompt, no content** |
| 6 | Explicit logout while dirty | capture retained for that user; screen cleared |
| 7 | Successful save-as-new | retired: content cleared, marker kept, generation advanced |
| 8 | Explicit discard | the same retirement transition |
| 9 | Stale source (`baseUpdatedAt` mismatch) | warned, not silently applied |
| 10 | Capture from an older `schemaVersion` | not applied; view/discard only |
| 11 | Two tabs, same source | revision CAS ⇒ 409; loser refetches; no silent overwrite |
| 12 | Editing access lost between capture and restore | restore denied by the endpoint's re-authorization; no leak |
| 13 | 429 / network loss mid-session | indicator shows **not backed up**; form stays dirty; backoff visible |
| 14 | Wire authz, all five endpoints | 401/403/404 for another user's capture and for unauthorized versions |
| 15 | Capture carrying a retired generation | 409; **no new row created** — resurrection blocked |
| 16 | Admin metadata endpoint | metadata + cleanup only; content never returned to a non-owner |
| 17 | Source version deleted | rows removed by cascade, inside the parent's transaction |
| 18 | User deleted | same |
| 19 | Retirement fails during save-as-new | **whole save rolls back**; no orphan version (real failing statement, not a mocked throw) |
| 20 | Concurrent save-as-new + capture from a second tab | newer capture never silently retired; save 409s and is not retried |

Case **5** justifies the server-side choice — client storage cannot pass it on a shared machine. Case
**15** justifies lifetime markers. Case **19** also closes the separately-flagged gap that forced
second-step rollback was untested.

**Sanity-flip discipline.** There is no pre-existing buggy implementation to test against, so
sensitivity is demonstrated honestly: temporarily weaken the projection and the retirement guard and
confirm the relevant tests go red. Projection tests assert against the expected field-split result
using `canonicalJson` **structural** equality (not literal byte ordering), and include an identity
round-trip — project → restore onto source ⇒ source unchanged — which is what catches
projection/restore *asymmetry*, the failure mode that corrupts prose rather than leaking it. Negative
cases target `resourceLinks` at its real location (the lesson row), `framework[].phase`, `duration`,
and an arbitrary unknown nested key.

---

## 8. Cost / sequencing

Real infrastructure: a collection and migration, five endpoints with wire tests, a rate-limit bucket,
the fencing protocol, two parent cascades, a retirement job, the capture/restore client, a role-aware
indicator, and the matrix above. Materially larger than the first draft implied — stated here before
the build rather than discovered mid-PR.

**PR 1 (server).** Collection, access closure, endpoints, projection, fencing, the shared retirement
function, both cascades, the expiry job, and the migration (generated on the Rock per the documented
Node-22 deps-image workflow). Tests: `tests/int` access matrix, `tests/http` wire authz, projection
units, DB-backed concurrency (cases 15, 17–20).

**PR 2 (client).** Start/capture/flush in `LessonControls`, the pre-expiry flush in `IdleLogout`,
clearing on both expiry paths, the restore prompt, the role-aware indicator, 409 and 429 handling.
Tests: Playwright cases 1–13.

Interim mitigation until PR 2 ships stays operational, not technical: tell editors to save often on
long sessions.
