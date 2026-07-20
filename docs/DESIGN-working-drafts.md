# DESIGN DRAFT — recoverable working drafts (unsaved-edit durability)

**Status: DRAFT for review. Not implemented. No code written.**
Author: assistant, 2026-07-20 session. Baseline `main` `dcfc8dc`.

Addresses **L3-13** (session expiry silently destroys unsaved lesson edits) and the broader
edit-durability gap: browser crash, forced refresh, device sleep, accidental tab close.

---

## 1. The problem this solves

Confirmed by source trace (see the session audit; every link verified in installed Payload 3.85.1):

1. `tokenExpiration: 7200` (2 h); `admin.autoRefresh` off. A 60 s "Stay logged in?" modal precedes expiry.
2. If unattended, Payload's `forceLogOutTimeout` calls `redirectToInactivityRoute()` →
   **`router.replace()`**, a *programmatic client-side* navigation.
3. Payload's dirty-form guard `usePreventLeave` registers **only** `beforeunload` and a document
   **click** listener. Neither intercepts programmatic navigation.
4. The editor unmounts. **All unsaved form state is destroyed with no prompt**, and because it is
   `replace` (not `push`) the page leaves history, so Back cannot recover it.
5. There is **no autosave and no draft persistence** anywhere — no `localStorage`/`sessionStorage` in
   `src/`, no Payload drafts/autosave on `lesson-bundle-versions` (deliberately: immutable versions).

**Two distinct expiry paths** (do not assume one):

| Path | Mechanism | Current outcome |
|---|---|---|
| Foreground | Payload `forceLogOutTimeout` fires at the deadline | editor unmounts, **work destroyed** |
| Backgrounded → refocused | our `IdleLogout` fires first; `logOut()` clears both timers, no navigation | **zombie editor**: work on screen, session dead, saves 401 |

Note `IdleLogout`'s docstring (`src/components/IdleLogout/index.tsx:15`) claims `logOut()` performs a
"logout + redirect". **That is factually wrong** — `logOut()` (`providers/Auth/index.js:164`) performs
no navigation. The comment should be corrected regardless of this design.

## 2. Deployment constraint that drives the design

**Shared computers are effectively universal in Kenyan schools** (operator, 2026-07-20). Consequences:

- **Client-side storage is disqualified.** A draft in `localStorage`/IndexedDB persists in the browser
  profile across logout and users; the next person at that machine can read it with devtools.
  Namespacing by user id prevents an accidental *restore* — it does not prevent *exposure*.
- **The destructive unmount is doing double duty.** Clearing the editor off screen is itself a privacy
  control on a shared machine. So the fix is NOT "stop unmounting" — it is
  **capture the working copy, then clear the screen.** Both expiry paths must clear.
- **Session expiry must stay.** On shared machines the walk-away case is the normal case, and the next
  user may be a student, not a colleague. `admin.autoRefresh` must remain **off** (an indefinitely
  refreshing session on a shared box is the opposite of what is wanted).

This reverses the assistant's earlier `localStorage` recommendation and its earlier suggestion to
consider enabling `autoRefresh`. Both were wrong for this deployment.

## 3. Proposed model — a `working-drafts` collection

A **separate, user-owned, mutable** collection. It does NOT create `lesson-bundle-versions` rows, so
it introduces no version churn and does not touch the immutable-version model or the no-op-save guard.

```
working-drafts
  user          relationship -> users     (required, system-stamped, never client-supplied)
  sourceVersion relationship -> lesson-bundle-versions  (required)
  lessonPlan    relationship -> lesson-plans            (denormalised, for listing/cleanup)
  baseUpdatedAt date        (the source's updatedAt when editing began — staleness check)
  schemaVersion text        (guards restoring a draft written against an older field shape)
  content       json        (ONLY editor-writable keys; see §4)
  updatedAt     (native)
```

**Uniqueness:** one draft per `(user, sourceVersion)`. Upsert on autosave.

### Access rules — mirror the existing user-owned idiom (`Favorites.ts:30`)

```
read:   own only          ({ user: { equals: u.id } })
create: authenticated     (user stamped server-side in beforeValidate)
update: own only
delete: own only
```

**Deliberately stricter than Favorites:** `read` must NOT include a Site-Admin bypass. A draft is a
user's private unsaved work; there is no operational need for an admin to read it, and on shared
hardware the smallest possible audience is the right default. Admin needs are met by *counts* and
*deletion*, not content.

`user` is stamped from the session in a `beforeValidate` hook (same pattern as `stampFavoriteUser`) so
a REST POST cannot supply a foreign id.

## 4. What is stored

**Only editor-writable content** — the same scope the save boundary already enforces:
`VERSION_EDITOR_KEYS = { lessons, finalExplanation, summaryTable }` (`hooks/bundleVersion.ts:19`).

Explicitly NOT stored: `meta`/`unit` structure, `semver`, `sourceVersion` identity fields, `author`,
row ids, and **`resourceLinks`** (system-owned; it is restored from the source on save anyway, so
persisting it would duplicate system data into a user-readable row for no benefit).

Rationale: a draft must never become a second, weaker channel for data the field-split protects.
On restore, the draft supplies prose only; everything else comes from the source version, and the
existing `applyEditorFieldSplit` remains the write-time authority.

## 5. Lifecycle

**Capture.** Debounced autosave (~5–10 s idle, or on blur) from the editor while the form is dirty.
Upsert `(user, sourceVersion)`. Cheap: content-only, no version creation.

**Pre-expiry flush.** `IdleLogout` already holds `tokenExpirationMs`; add a flush shortly before the
deadline so the last edits land while the token is still valid. (A server autosave cannot write after
expiry — but continuous autosave means the last write is seconds old, so this is belt-and-braces.)

**Clear the screen on BOTH expiry paths.** Foreground already unmounts. The `IdleLogout`/zombie path
must also clear — currently it leaves the previous teacher's content visible on a shared machine.

**Restore.** On opening the editor for a version, if a draft exists for `(user, sourceVersion)`:
offer it — never auto-apply. Show when it was saved. Applying it marks the form dirty; discarding
deletes the draft.

**Staleness.** If `draft.baseUpdatedAt !== source.updatedAt`, warn that the underlying version changed.
(Rare — versions are immutable — but possible via a trusted/migration path.)

**Schema drift.** If `draft.schemaVersion` ≠ current, do not silently apply; offer view/discard only.

**Cleanup.** Delete on successful save-as-new, on explicit discard, and by TTL (proposal: 30 days) via
a scheduled job. Also delete when the source version is deleted (the save-as-new `deleteSource` path).

**Concurrency.** Two tabs, same user, same source: last write wins on the upsert, and the restore
prompt makes divergence visible rather than silent. Acceptable for v1; note it explicitly.

## 6. Open questions for the operator

1. **TTL** — 30 days proposed. Shorter is safer on shared infrastructure.
2. **Storage ceiling** — cap draft size / count per user? A 12-lesson plan's editor content is
   non-trivial; unbounded drafts across many users is a growth vector.
3. **Should a Site Admin see that a draft exists** (count only, never content) for support purposes?
4. **Cross-device** — this design gives it for free. Confirm it is wanted, not a surprise.

## 7. Verification matrix (required before calling this done)

Disposable stack, shortened `tokenExpiration`. Browser-level, since the defect is client-side.

| # | Case | Expected |
|---|---|---|
| 1 | Foreground expiry, dirty form | draft persisted; screen cleared; recoverable after re-login |
| 2 | Backgrounded → refocus expiry | same; **no zombie editor left on screen** |
| 3 | "Stay logged in" clicked | session refreshes; no spurious draft prompt |
| 4 | Same user re-logs in | draft offered, not auto-applied; content exact |
| 5 | **DIFFERENT user logs in on the same browser** | **sees nothing — no prompt, no content** |
| 6 | Explicit logout while dirty | draft retained for that user; screen cleared |
| 7 | Successful save-as-new | draft deleted |
| 8 | Explicit discard | draft deleted |
| 9 | Stale source (`baseUpdatedAt` mismatch) | warned, not silently applied |
| 10 | Draft from older `schemaVersion` | not applied; view/discard only |
| 11 | Two tabs, same source | last write wins; restore prompt shows divergence |
| 12 | Role lost between draft and restore | restore denied by normal access; no leak |
| 13 | Source version deleted | draft cleaned up |
| 14 | Wire authz | 401/403 for another user's draft over REST (`tests/http`, per CLAUDE.md) |

Case **5** is the one that justifies the whole server-side choice — it is the case client-side storage
cannot pass on a shared machine.

## 8. Cost / risk

Real infrastructure: a collection + migration, access rules, autosave client, restore UI, cleanup job,
plus the tests above. Larger than any fix currently on the audit list.

It is **not** a simplification — it adds a new durability guarantee. Per CLAUDE.md this warrants a SPEC
amendment (§5/§7 touch the editing and versioning model) before implementation, not after.

**Recommended sequencing:** treat as its own project *after* the small Tier-1 fixes (L3-04, L3-09,
L3-10) land. In the interim, the honest mitigation is operational, not technical: tell editors to save
often on long sessions.
