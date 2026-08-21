# The System panel — design (2026-08-21)

Manage gets a fifth top-level box, **System**, for Site Administrators: what this installation *is*,
and which of its capabilities are switched on. Operator brief 2026-08-21; it implements
`docs/DESIGN-next-direction-2026-08-19.md` §D1's Installation panel, so read that section and
`docs/DESIGN-d1-deployment-amendments-2026-08-21.md` first — this document is the panel, not the model.

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

### `system.deployment` — facts, COMPUTED, never stored

Base URL, public-library capability, email configured, error tracking, PDF engine reachable, artifact
cache size and usage, last pre-warm. Reported, not controlled, **with the env var named** so an
operator knows where to change it.

⚑ **Computed per request from env plus probes — never persisted.** A stored fact is a cache, and a
cache of a fact goes stale and then lies on the one screen whose entire purpose is telling an operator
what is true. This is also the half that answers "is the PDF engine up?", which SPEC §9 now records as
a single point of failure.

⚑ **This half is also where ABSENT capabilities appear** (see the four states in the amendments doc). A
capability whose bits are not on this box is a *fact with an instruction*, not a control.

### `system.features` — real toggles, plus one Save

| Flag | Real today? | Enforced where |
|---|---|---|
| `publicLibraryLive` | **yes** | inside `lib/publicLibrary.ts`'s existing gate, under the `PUBLIC_LIBRARY_ENABLED` env ceiling |
| `outboundEmail` | **yes** | at the enqueue boundary of `passwordResetEmail`, `messagePing`, `emailVersionArtifact`, and user verification |
| `studentAccess` | no — **not built anywhere** | would sit under a new `STUDENT_ACCESS_ENABLED` ceiling |
| `studentQuiz` | no — **not built anywhere** | — |

⚑ **Only two flags can be real, and that is the honest first cut.** Error tracking and backups are
boot-wired or run outside the app, so they are *facts*, not switches; ARES resource links would be a
generator change (SPEC §4). A panel of four working toggles would require inventing two.

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

**Reads.** The global's own `read` access is Site-Admin-only. The *enforcement* readers are
server-only modules using `overrideAccess: true` — the `lib/publicLibrary.ts` / `lib/editorGroups.ts`
pattern — because the public library route must resolve `publicLibraryLive` with no user at all. That
deliberate bypass is documented at the reader, not left for someone to discover.

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

## Warnings: blocking, dismissible, and in code

A dismissible warning the operator must acknowledge before the change is applied, for flags whose
consequence is not obvious from the label:

- **`publicLibraryLive` → on:** the site becomes visible on the internet. Arguably the most
  consequential switch on the panel.
- **`studentAccess`** when it exists: the privacy and anonymisation consequences.

Copy lives **in code**, not in the global — it is behaviour-tied product copy, not operator data.
`outboundEmail` needs no warning.

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

## Build order

**PR 1 — infrastructure and facts.** The global, its access rules, the provenance hook, the migration,
the computed `system.deployment` half, and the panel scaffold registered in `PANEL_IDS` and
`availablePanels`. No toggles. Provable end to end on its own, and it delivers the "is the PDF engine
up?" answer immediately.

**PR 2 — the flags.** `publicLibraryLive` and `outboundEmail`, their fail-closed readers, enforcement
at both boundaries, Save with re-auth and the freshness token, the two disabled placeholders, and the
blocking warning on going public.

Deliberately not in either: presets, the school-type profiles, and any flag whose enforcement point
does not exist yet.
