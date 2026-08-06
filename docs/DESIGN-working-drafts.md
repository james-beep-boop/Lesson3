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

**A second review round (same day, before any push) found three more, all in the protocol this file
had just specified.** Recorded here because they are the kind of gap that reads as complete:

| Reconciled version said | Now | Why |
|---|---|---|
| Retirement is fenced by `generation` | **Every** retirement caller carries a **revision** precondition too | An ordinary capture bumps `revision` and leaves `generation` alone — so a generation check cannot see that another tab captured newer work, and save/discard/expiry/cleanup could all retire it |
| "`start` returns the active generation or mints a new one" | A **single atomic upsert** returning `generation` **and** `revision` | Two simultaneous first starts race the unique insert; two starts against a retired row race reactivation. And without the revision, the first capture has no correct precondition to send |
| "a *failed* flush must not block the save" | Transport failure ⇒ save proceeds; **409 ⇒ it does not** | A 409 flush failure specifically means another tab holds newer work, which is exactly the case where saving on would retire it |

Plus a documentation contradiction: the projection was described as "keyed by row id" *and* as
excluding row ids. Both are true of different things — §3 now says so explicitly.

**A third round found that the fix for the second round's `start` flaw did not satisfy the very cases
it was written for.** The upsert incremented `revision` on *every* conflict, including the resume path:
two first starts returned `(1,1)` and `(1,2)`, two retired-row starts `(G+1,R+1)` and `(G+1,R+2)`. So
the first caller's revision was stale the moment it was handed out, and its first capture would 409
against a conflict that did not exist — exactly what matrix cases 21–22 assert must not happen. The
governing rule was missing rather than the SQL being subtly off: **`start` on an already-active row must
be a total no-op that reports state**, since it fires on every Edit click in every tab. Reactivation
must also take a fresh `baseUpdatedAt`/`schemaVersion`, or a new session inherits the retired
generation's baseline and compares staleness against the wrong one. See §4.

Worth noting what that says about review: the case that would have caught it was already written down
in §7, and still passed inspection twice, because the SQL was checked against its own comment rather
than against the case. A test asserting cases 21–22 will not have that luxury.

**A fifth round found the two worst of the set — both places where this file described the protocol as
doing the opposite of what it specifies.**

| Said | Now | Why |
|---|---|---|
| "Capture is an upsert" (§2 and the endpoint table) | Capture is a **CAS UPDATE of an existing active row**; only `start` may insert or reactivate | An upserting capture recreates a retired row — the exact resurrection retirement markers exist to prevent — and makes the explicit-start step optional. The protocol's central mechanism, undone by one word |
| Expiry's precondition was "active **and** untouched since the cutoff" | It also carries the `revision` read at selection | The document stated a universal rule ("every caller carries a revision precondition") and then exempted one caller. The cutoff term alone does defeat the race, so this is defence in depth — but a stated universal with a silent exception is precisely the defect these five rounds kept finding |

**A fourth round found two more, both in the same protocol, both about a write that forgot to publish
its own result.** The pattern is now unmistakable enough to name: *state the rule, not the instance.*

| Reconciled version said | Now | Why |
|---|---|---|
| Capture *requires* `expectedRevision` | Every advancing endpoint also **returns** the resulting token, and the client adopts it | Otherwise the client keeps the token it sent, which its own successful write just superseded — its next capture and then the save would 409 against a self-inflicted conflict |
| Reactivation refreshes `baseUpdatedAt` and `schemaVersion` | It also sets `updated_at = NOW()` | Payload maintains that column in its application update path, and the column default fires only on INSERT — there is no DB trigger. Expiry keys off "untouched since the cutoff", so an aged marker could be reactivated and re-expired within seconds |

Both were specified as a property of one call rather than as a rule over all of them, which is exactly
how the second and third rounds' gaps arose too. The token rule and the `updated_at` rule are therefore
stated once, in §2 and §4, as obligations on *every* advancing write. Also fixed: a base-source mismatch
said merely "warn" here while SPEC §5 required view/discard-only — SPEC's stricter rule governs.

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

```text
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
pair's retirement marker.

⚑ **Only `start` may INSERT or reactivate. Capture never creates a row** — it is a compare-and-set
UPDATE against an existing *active* row, and returns 409 when the row is missing, retired, or its
revision has moved. Calling capture an "upsert" (as an earlier revision of this file did) quietly
undoes the whole protocol: an upserting capture recreates a retired row, which is exactly the
resurrection that retirement markers exist to prevent, and it makes the explicit-start step optional.

**Access — nothing client-facing.** `read`, `create`, `update`, `delete` all closed;
`admin.hidden: true`. Rationale and the Payload-first gap are recorded in SPEC §5; briefly: `start`
needs an atomic upsert and default REST has none, closing `read` makes "lost editing access ⇒ cannot
restore" structural rather than incidental, and closing `delete` stops an owner erasing their own
retirement marker.

**Endpoints** — on `lesson-bundle-versions`, beside `/:id/preview` and `/:id/save-as-new`. Each
re-loads the source and re-runs `authorize(req, 'editor')` on every call, then writes with
`overrideAccess`:

| Endpoint | Purpose |
|---|---|
| `POST /:id/recovery/start` | Explicit session start. The **only** insert/reactivate path; one atomic upsert (§4). Returns the token. Never called implicitly. |
| `POST /:id/recovery` | Capture. **CAS UPDATE of an existing active row — never an insert.** Requires `generation` + `expectedRevision`; returns the advanced token. Missing, retired or stale ⇒ **409**. |
| `GET /:id/recovery` | Fetch the active capture, for the restore prompt. Returns the token with it. |
| `DELETE /:id/recovery` | Explicit discard ⇒ retire. Requires `generation` + `expectedRevision`. |
| `GET /:id/recovery/meta` (+ cleanup op) | Site Admin: existence/metadata (incl. `revision`) and authorized retirement, which must echo that revision. Never content. |

**Token rule, applying to every one of them: any endpoint that advances the row returns the resulting
`{generation, revision, updatedAt}` from the same atomic statement, and the client must adopt it.**
Otherwise the client is left holding the token it *sent*, which the successful write just superseded —
so its next capture, and then the save, would 409 against a conflict it caused itself. Stated once, as
a rule, because the first version of this design specified the precondition on capture and forgot the
response; a per-endpoint description invites exactly that asymmetry.

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
  `rubric[*]`, `META`, `semver` and `author` **cannot** enter a capture as content.
- An admin/system field added later is excluded automatically, in the secure direction.
- The projection inherits the existing drift test for free.

**Row ids are map KEYS, not content.** Stated explicitly because "keyed by row id" and "row ids cannot
enter a capture" read as a contradiction. A row id appears only as a key, used to align the overlay
with the source's rows on restore. Each key is **validated against the current source** and an
unrecognised one is dropped, never created. Ids are never written back as field values, and no capture
can change one — structure is not editable through this path at all. Tests assert both halves: an
unknown key is dropped, and no id appears as a restored value.

**One source of truth:** the same constants define "what an Editor may write" at the save boundary and
"what a capture may hold". On restore a capture supplies prose only; `applyEditorFieldSplit` remains
the write-time authority.

**v1 is prose-only** (SPEC §5). Structural edits change row identity, so a sparse overlay has nothing
stable to key on — admin-scope recovery is a *different storage model* (a full snapshot, with the
answer-key sensitivity that implies) and is deferred rather than half-built.

---

## 4. Fencing protocol

Two mechanisms, two jobs — keeping them separate is what keeps this comprehensible — but **both** apply
to retirement, which was the second review's first finding:

- **`generation` fences retirement across sessions.** Server-issued, never the client's choice.
- **`revision` fences individual writes.** Every capture supplies `expectedRevision`; on mismatch the
  client refetches rather than overwriting.

**A generation check alone is not enough for retirement.** An ordinary capture bumps `revision` and
leaves `generation` untouched, so generation cannot distinguish "same session" from "same session, but
another tab has captured newer work since you loaded". Every retirement caller therefore carries a
revision precondition, applied **inside the atomic update** rather than read-then-write.

**`start` is one statement.** Two simultaneous first starts would otherwise race the unique insert, and
two starts against a retired row would race reactivation:

**The governing rule: `start` on an ALREADY-ACTIVE row must be a total no-op that merely reports
state.** It fires on every Edit click and in every tab, so any mutation on the resume path makes it a
write — and a write invalidates the preconditions other tabs are holding. An earlier version of this
SQL incremented `revision` unconditionally, which broke both of the cases it was written for: two first
starts returned `(1,1)` and `(1,2)`, and two starts against a retired row returned `(G+1,R+1)` and
`(G+1,R+2)`, so the first caller's returned revision was already stale and its first capture would 409
against a conflict that did not exist.

```sql
INSERT INTO edit_recovery
  (user_id, source_version_id, lesson_plan_id, generation, revision, base_updated_at, schema_version, …)
VALUES ($user, $version, $plan, 1, 1, $sourceUpdatedAt, $schemaVersion, …)
ON CONFLICT (user_id, source_version_id) DO UPDATE SET
  -- Reactivation advances the generation, fencing out any stale tab holding the old one.
  generation = edit_recovery.generation
             + (CASE WHEN edit_recovery.retired_at IS NULL THEN 0 ELSE 1 END),
  -- RESUME MUST NOT BUMP THE REVISION: an active row is reported, not written.
  revision   = CASE WHEN edit_recovery.retired_at IS NULL
                    THEN edit_recovery.revision
                    ELSE edit_recovery.revision + 1 END,
  -- A new session needs its OWN baseline; a resumed one keeps the baseline it started with.
  base_updated_at = CASE WHEN edit_recovery.retired_at IS NULL
                         THEN edit_recovery.base_updated_at
                         ELSE EXCLUDED.base_updated_at END,
  schema_version  = CASE WHEN edit_recovery.retired_at IS NULL
                         THEN edit_recovery.schema_version
                         ELSE EXCLUDED.schema_version END,
  -- Reactivation is a real write and must restart the TTL clock; resume preserves it (see below).
  updated_at = CASE WHEN edit_recovery.retired_at IS NULL
                    THEN edit_recovery.updated_at
                    ELSE NOW() END,
  retired_at = NULL
RETURNING generation, revision, updated_at;
```

**`updated_at` must be set explicitly on every raw-SQL write.** Payload maintains that column in its
own application update path, and the column's `DEFAULT now()` fires only on INSERT — there is no
database trigger. So a statement like this one leaves it untouched unless told otherwise, and expiry is
conditioned on the row being *untouched since the cutoff*: a 40-day-old marker could be reactivated and
then immediately re-expired by the next expiry run, destroying a session seconds after it began.

Resume deliberately preserves `updated_at`, which has a consequence worth stating rather than
discovering: **the TTL measures the age of the captured content, not of the session.** Resuming a
29-day-old capture and typing nothing can still let it expire; the first real capture restarts the
clock. That is the intended reading of a 30-day retention on unsaved work.

So: a retired row is reactivated by **advancing** the generation and taking a **fresh**
`baseUpdatedAt`/`schemaVersion` — without that refresh the new session would inherit the retired
generation's metadata and compare staleness against the wrong baseline. An active row is resumed
genuinely unchanged, so the race loser reads exactly the winner's values instead of a version of them
that has already moved on. It returns **both** values — without the revision, the client's first
capture has no correct precondition to send.

Postgres serialises the two conflicting updates on the row, and `ON CONFLICT DO UPDATE` re-evaluates
against the newly committed row, which is what makes the second caller take the now-active branch and
see the first caller's result.

**Retirement is one shared function with four callers** — save-as-new, explicit discard, 30-day expiry,
Site-Admin cleanup. It atomically clears `content`, sets `retiredAt` and `updatedAt`, and advances the
**revision**. **None hard-delete.**

⚑ **It does NOT advance the generation** (amended 2026-08-06; this paragraph previously said
"revision/generation", contradicting the `start` statement above, which already advances the generation
on reactivation). Each counter has one meaning: `revision` fences writes and moves on every write
including this one; `generation` identifies the active editing SESSION and moves only when a new session
BEGINS, which is reactivation's job. Advancing it in both places double-counts — one
retire-then-reactivate cycle would move it by two — and §7 case 22 already asserts a single advance
across exactly that cycle.

Preconditions, all evaluated in the update:

| Caller | Precondition |
|---|---|
| save-as-new, discard | `generation` **and** `expectedRevision` from the editing tab |
| Site-Admin cleanup | the `revision` returned by `recovery/meta` — so an operator cannot clear a capture that changed between looking and acting |
| 30-day expiry | the `revision` read when the row was selected, **and** still active, **and** still untouched since the cutoff |

Expiry carries the revision it selected, so the rule really is universal rather than universal-with-an-
exception:

```sql
UPDATE edit_recovery SET …retirement…
WHERE user_id = $user AND source_version_id = $version
  AND revision = $selectedRevision
  AND retired_at IS NULL AND updated_at < $cutoff
```

⚑ Targeting is by `(user, sourceVersion)` for ALL FOUR callers, not by row id (amended 2026-08-06 —
this snippet said `WHERE id = $id`, a fossil of the abandoned plan where expiry was standalone SQL in
`prune-db.sh`, which this section discards two paragraphs below). Three callers *cannot* use a row id:
SPEC §5 closes the collection to clients, so no row id ever reaches a browser and the endpoints address
by the authorized source version. Expiry merely happens to hold one. Letting it be the exception would
force `retire` to take a union of TARGET shapes alongside its union of commands, for no safety — the
compound unique index resolves the pair to exactly one row either way.

Zero rows updated means a capture or a reactivation won the race, and the job simply moves on. Being
precise about what that buys: `updated_at < $cutoff` **already** defeats that race on its own, because
every advancing write sets `updated_at = NOW()` — a capture landing mid-job pushes the row out of the
cutoff window. The revision term is defence in depth, not the primary guard. It is worth having anyway
because it makes expiry's safety self-contained rather than contingent on an invariant maintained in
four other places, and because a document that states a universal rule and then quietly exempts one
caller is the precise defect this review kept finding.

Because all four share one function, expiry cannot be SQL inside `scripts/prune-db.sh` (a second
implementation, free to drift); it becomes a Payload job, and `prune-db.sh` keeps only the bookkeeping
tables it already handles.

**On save-as-new**, retirement joins the existing transaction in `endpoints/versionEdit.ts` **inside
the semver retry attempt**, so it can neither half-apply nor double-apply. A precondition failure there
fails the whole save with 409 rather than retiring newer work — and unlike a semver conflict, it is
**not** retryable.

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
`generation` + `expectedRevision`. The two flush failures are **not** treated alike:

- **Transport failure** (network, 429, 5xx) ⇒ **save anyway.** The version save is the operation that
  matters and the capture is only insurance; blocking a real save on failed insurance inverts the
  priority exactly.
- **409** ⇒ **do not proceed.** A 409 means another tab holds newer work, so this is precisely the case
  where saving on would retire it. Surface the conflict and let the user reload.

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

**Staleness / schema drift — both are view/copy/discard only, never applied.** `baseUpdatedAt` mismatch
means the source moved under the capture, so the row ids the overlay is keyed on may no longer mean what
they meant; `schemaVersion` mismatch means the field shape changed. An earlier version of this section
said a base mismatch merely "warns", implying it could still be applied — which contradicted SPEC §5 and
would have let a stale overlay land on a changed source. SPEC's rule governs, and it is the safer one:
the user can read the content and copy from it, but the system will not overlay it.

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

**Status, as of 2026-08-06 (branch `feat/edit-recovery-server`, NOT merged).** Cases **15, 17-18,
21-25 and 30 are implemented and passing on that branch** (30 via the expiry pass: a reactivated row is not selected, because `start` restarted its clock); every other case is still unexecuted because the
code it covers does not exist. Update this line when that changes — a matrix that claims less coverage
than it has trains readers to ignore it, and one that claims more is worse. This is the acceptance matrix
the two PRs in §8 must satisfy, not a report.

Disposable stack, shortened `tokenExpiration`. Layers, using this project's existing suites:
**browser** (Playwright) for 1–13 and 26–27, since the defect is client-side; **DB-backed wire-level**
(`tests/http`, which runs against the live app and its database) for 14–16, 23–24 and 28–29; and
**DB-backed concurrency** (`tests/int`, needing two real transactions) for 17–22, 25 and 30. Case 29
spans a chain of real requests against real rows, so it is wire-level *and* DB-backed — the two labels
are not alternatives here.

| # | Case | Expected |
|---|---|---|
| 1 | Path A foreground expiry, dirty form | captured; screen cleared; recoverable after re-login |
| 2 | Path B backgrounded → refocus expiry | same; **no zombie editor left on screen** |
| 3 | "Stay logged in" clicked | session refreshes; no spurious restore prompt |
| 4 | Same user re-logs in | capture offered, not auto-applied; content exact |
| 5 | **DIFFERENT user logs in on the same browser** | **sees nothing — no prompt, no content** |
| 6 | Explicit logout while dirty | capture retained for that user; screen cleared |
| 7 | Successful save-as-new | retired: content cleared, marker kept, **revision** advanced (NOT the generation — that moves only when a new session begins) |
| 8 | Explicit discard | the same retirement transition |
| 9 | Stale source (`baseUpdatedAt` mismatch) | view/copy/discard only — **never applied**, same as a schema mismatch |
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
| 20 | Concurrent save-as-new + capture from a second tab | newer capture never silently retired; save 409s on the revision precondition and is not retried |
| 21 | Two simultaneous **first** `start`s | one row; both callers get the same generation; neither errors on the unique index |
| 22 | Two simultaneous `start`s against a **retired** row | generation advances exactly once; both callers see the same advanced pair; the retired generation stays fenced |
| 23 | Discard with a stale `expectedRevision` | 409; nothing retired |
| 24 | Admin cleanup with a stale revision | 409; the capture that changed between metadata and cleanup is not cleared |
| 25 | Expiry job vs a capture landing at the cutoff | the fresh capture is not retired — precondition is evaluated in the update, not read-then-write |
| 26 | Flush 409 on save | save does **not** proceed; conflict surfaced; the other tab's newer capture survives |
| 27 | Flush transport failure (429 / offline) on save | save **does** proceed; indicator shows not-backed-up |
| 28 | Restore with an unknown row-id key | key dropped, never created; no id restored as a field value |
| 29 | **Revision chaining:** start → capture → capture → save, each using the token the previous call returned | every step succeeds; no self-inflicted 409 anywhere in the chain |
| 30 | **Reactivation TTL:** retire a row, age it past the cutoff, `start` it, then run the expiry job | the reactivated session survives — `updated_at` was restarted, so it is not "untouched since the cutoff" |

Case **5** justifies the server-side choice — client storage cannot pass it on a shared machine. Case
**15** justifies lifetime markers. Cases **21–22** are why `start` is a single statement. Cases
**23–25** are why generation alone was insufficient: an ordinary capture bumps only the revision, so a
generation-only check would have let all three retire newer work. Cases **26–27** are why the two flush
failures are distinguished. Case **29** is why every advancing endpoint returns its token, and case
**30** is why reactivation restarts `updated_at`. Case **19** also closes the separately-flagged gap that forced second-step
rollback was untested.

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
units, DB-backed wire-level and concurrency cases (15, 17–25, 28–30).

**Retirement's four callers are a DISCRIMINATED UNION, not one options object with optional fields.**
Decided 2026-08-06, before implementation. The callers do not differ in what they WRITE — that is the
one shared `SET` — they differ in what they must PROVE first, and those preconditions are not
interchangeable:

```ts
type RetireCommand =
  | { by: 'save-as-new'; generation: number; expectedRevision: number }  // + a live transaction
  | { by: 'discard';     generation: number; expectedRevision: number }
  | { by: 'admin-cleanup'; expectedRevision: number }                    // revision from recovery/meta
  | { by: 'expiry'; expectedRevision: number; cutoff: Date }
```

With optional fields on a single shape, `cutoff` can be forgotten and expiry silently retires an active
session — that one genuinely becomes a **type error** under the union, because `cutoff` is required by
the `expiry` variant.

⚑ **The transaction requirement is NOT a compile-time guarantee, and saying otherwise would be the
false-assurance failure this document keeps recording.** A discriminated union constrains the FIELDS of
the command; it cannot constrain the `req` passed alongside it. `by: 'save-as-new'` selects
`requireTransaction: true` internally, so no call site can forget the flag — but a caller handing over a
transaction-less `req` is caught at RUNTIME by `txDb`'s fail-closed throw, not by `tsc`.

Two ways to close that if it is worth closing, decided when retirement is written rather than assumed
now: give `retire` an overload whose `save-as-new` signature demands a branded transaction-bearing
request type, or accept runtime enforcement and pin it with the rollback test (case 19), which has to
exist regardless. The second is probably right — a brand is only as honest as the one place that mints
it — but the choice should be explicit.

**The per-user ACTIVE-CAPTURE CAP (~20, SPEC §5) belongs in `start`**, by the same argument that puts
the byte cap in `capture`: `start` is the only path that inserts a row, so it is the storage boundary
for row COUNT exactly as `capture` is for row SIZE, and an approximate check folds into its existing
single statement. Its acceptance cases, written before the code so they cannot be back-fitted to it:

| | Case | Expected |
|---|---|---|
| C1 | resume an ALREADY-ACTIVE row while at capacity | **succeeds** — resume is a no-op and must never be blocked, or a teacher at the cap cannot reopen work they already have |
| C2 | `start` a NEW pair while at capacity | rejected |
| C3 | reactivate a RETIRED row while at capacity | rejected — reactivation creates an active session, so it counts |
| C4 | two concurrent starts at capacity−1 | overshoot to 21 is ACCEPTABLE (§5 says approximate); what must not happen is an unbounded run |
| C5 | retire one, then `start` a new pair | succeeds — retired rows are tombstones and must not count toward the cap |
| C6 | below capacity | ordinary insert, unchanged |
| C7 | **another user at capacity** | does not block this user — the cap is PER USER. Added 2026-08-06: not in the original five, and invisible to any single-user test; without `user_id` in the count one prolific editor caps everybody |
| C8 | a refused `start` | creates no row |

**IMPLEMENTED 2026-08-06** in `start`'s single statement: a CTE counts the user's ACTIVE rows, the
INSERT is gated on `count < cap OR EXISTS(row for this pair)` — the `EXISTS` is what keeps RESUME
working at capacity, since the INSERT must still be attempted for `ON CONFLICT` to fire — and the
`DO UPDATE` carries `WHERE retired_at IS NULL OR count < cap`, so resume always passes and
reactivation counts. `start` now returns a `StartResult` rather than throwing, because being at
capacity is a condition the system chose, not an error.

C1 and C5 are the ones that make the cap safe to ship: a cap that blocks resume, or that counts
tombstones, locks a prolific editor out of their own work.

⚑ **Cases 19-20 cannot be retirement unit tests.** They are about save-as-new: 19 is "retirement fails
during save-as-new ⇒ the WHOLE save rolls back, no orphan version", and 20 is a concurrent save plus a
second tab's capture. Neither says anything unless it runs through the real `endpoints/versionEdit.ts`
transaction and its semver-retry loop — a mocked throw proves the mock. Case 19 in particular needs a
REAL failing statement, not an injected exception, or it does not test the rollback path at all.
Cases 23-25 are the opposite: they isolate the retirement statement's own guards and belong directly
against the kernel.

**PR 2 (client).** Start/capture/flush in `LessonControls`, the pre-expiry flush in `IdleLogout`,
clearing on both expiry paths, the restore prompt, the role-aware indicator, 409 and 429 handling.
Tests: Playwright cases 1–13, 26–27.

Interim mitigation until PR 2 ships stays operational, not technical: tell editors to save often on
long sessions.
