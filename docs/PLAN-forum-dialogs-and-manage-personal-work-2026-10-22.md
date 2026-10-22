# Plan — forum dialogs and links, and personal work in Manage (Proposal B)

**Status:** revised 2026-10-22 after Codex's review of `77a5cd75` (one P2, one P3, views on Q1–Q6;
all folded in below — see "Review log" at the end). Operator decisions from this session are marked
**(decided)**. Two answers changed from the first draft's recommendation and one new question arose; the operator
confirms **Q1**, **Q6** and **Q7** (table at the end).

Two independent PRs, each reviewed separately:

- **PR 1 — forum and confirmation dialogs** (§1–§5). Small, frontend + admin CSS, no data change.
- **PR 2 — Proposal B: personal work in Manage → Lesson plans** (§6). Manage page only.

Neither PR adds or changes an endpoint, access rule, collection field or migration, so neither needs new
wire tests (CLAUDE.md "Working process"). PR 2 adds one server-side read with the caller's access
(`overrideAccess: false`); its privacy is proved with integration tests (§6.7).

---

## PR 1 — forum and confirmation dialogs

### 1. Lesson links open in a new tab — forum AND Messages (decided)

`components/LessonReference.tsx` renders the "Lesson: …" link and "Compare changes" in both
`/discuss/[id]` and `/messages`. Both links get `target="_blank" rel="noopener noreferrer"`, following
the app's existing new-tab convention (`CompareToOfficialLink`): an accessible name ending ", opens in a
new tab" and a trailing `↗` marked `aria-hidden` (see Q5). The "no longer available" text branch is
unchanged. Post text URLs already open in a new tab (`PostText`), so this makes every link in a post
behave alike.

Tests: `tests/unit/lessonReference.spec.tsx` asserts `target`/`rel` on both links; the existing
`discussions` and `messages` browser assertions keep passing (Playwright's role-name match is a
substring, and the 44px tap-height check still applies).

### 2. Pin / Unpin dialog (decided)

`components/Discussions/ModerationControls.tsx`:

- Title **"Pin this discussion"** (or **"Unpin this discussion"** when already pinned); no question mark.
- **No body text** (the "Pin this discussion?" paragraph goes).
- Two equal buttons: **Cancel** and **Pin** (or **Unpin**). Order: Cancel then action (§4).

### 3. Delete thread dialog (decided)

- Title **"Delete entire thread and all replies"**.
- Body **"This cannot be undone."** (kept, operator decision).
- Two equal buttons spanning the dialog: **Cancel** and **Delete** (danger style). The confirm button
  currently reads "Delete thread"; it becomes "Delete", since the title now states the scope. The
  page's own trigger button **keeps "Delete thread"**, so the destructive scope is stated before the
  dialog opens (Q6, revised on Codex's view).

The Redact dialog keeps its title ("Redact"), body (permanent removal + backups ageing out) and the
Title / Opening post checkboxes; it gets the same two-button row.

### 4. One button-row style for two-button confirmations

**Button order (decided by consistency): Cancel on the left, the action on the right.** The browser's
own `confirm()` does not have one order — it follows the operating system: Windows puts OK first;
macOS, iOS, Android and ChromeOS put Cancel first with OK on the right. Every in-app dialog today
already puts Cancel first, so keeping it is the consistent choice and matches the browser everywhere
but Windows.

**Style.** A modifier `.modal__actions--pair` defined in BOTH stylesheets (the frontend's
`app/(frontend)/styles.css` and the admin's `app/(payload)/custom.scss`, which each define the shared
`Modal` chrome): a two-column grid, `1fr 1fr`, the existing gap, each button `width: 100%`. The dialog's
content inset already supplies the side margins. Labels are short, so the pair stays side by side down
to 320px; verify at 360px.

**Applies to the in-app dialogs that are a plain Cancel + one action:**

| Dialog | File |
|---|---|
| Pin / Unpin, Delete thread, Redact (topic and reply) | `Discussions/ModerationControls.tsx` |
| Delete lesson plans (Manage) | `AdminDashboard/DeletePlansPanel.tsx` (drop `.lp-confirm__actions`' right-push) |
| Save settings (Manage → System → Features) | `Manage/SystemFeaturesPanel.tsx` |

**Not changed:** dialogs that are not two-button confirmations — the draft restore prompt (three
choices), Email, Insert link, Combine, Versions, Help, Welcome and the too-narrow notice.

**Not changed (decided): the 16 browser-native `window.confirm()` prompts** (Manage accounts, Roles &
Access, Subjects and grades, Your Drafts' Discard, version deletes, lesson controls). They cannot be
styled; converting them means new titles for 16 messages and rewriting four browser test files' dialog
handlers. Revisit only if teachers find the mix confusing.

No new component: three call sites share one CSS modifier, which is the smallest change that keeps them
alike. (A `ConfirmDialog` component is worth it only if the native prompts are ever converted.)

### 5. Moderation button order and names (decided)

On a thread: **Pin · Delete thread · Redact** (Redact moves after Delete). Trigger names:
"Pin"/"Unpin", "Delete thread", "Redact". On a reply (no Pin or Delete): "Redact" (was "Redact reply"). The accessible group
names ("Thread moderation" / "Reply moderation") already say which post is meant.

### PR 1 updates and proof

- Guide (`app/(frontend)/guide/page.tsx`) and `USER_GUIDE.md`: the button names and dialog titles.
- SPEC §16 only if it names these buttons (checked during implementation).
- Tests: `tests/unit/discussionModerationControls.spec.tsx` (titles, no pin body, "This cannot be
  undone.", trigger order Pin/Delete thread/Redact, "Redact" on replies); `tests/e2e/discussionsModeration.e2e.spec.ts`
  (renamed buttons; one screenshot each of the three dialogs at 360px and desktop, light and dark,
  reviewed by eye); `manage.e2e` Delete lesson plans and Features still pass.
- Types, lint, format, unit, integration, wire, browser on an isolated stack.

---

## PR 2 — Proposal B: personal work in Manage → Lesson plans

Background: DECISIONS 2026-10-17 put Your Drafts above the accordion for two reasons — a second child
under Lesson plans would close a teacher's "My saved versions" (the lone-child rule) and drafts expire.
DECISIONS 2026-10-20 recorded Proposal B to bring them inside. Operator decisions today:

- **B goes ahead (decided).**
- **Subject-grade administrators get the same personal sections as Site Administrators (decided).**
- **"My saved versions" includes the person's own Official versions (decided).**
- **The drafts section does NOT open automatically (decided).** Its closed heading shows the count.

### 6.1 Panels

Everyone who reaches Manage can edit somewhere (`canUseAdminPanel`: a Site Administrator or anyone with
a grant), so the personal sections render for every Manage user, even when empty.

Lesson plans, in render order:

| Id | Title | Who | Content |
|---|---|---|---|
| `plans.mine` **(new)** | My saved versions | everyone | versions the caller authored (§6.2) |
| `plans.drafts` **(new)** | Your Drafts | everyone | today's `UnsavedWorkList` rows, moved in |
| `plans.upload` | Upload lesson plans | Site Admin | unchanged |
| `plans.delete` | Delete a plan (all versions) | Site Admin | unchanged |
| `plans.versions` | Delete individual versions | administrators with candidates | unchanged cleanup queue |
| `plans.repair` | Set an Official version | Site Admin, when needed | unchanged |

**`plans.versions` becomes unavailable to teachers; a teacher's list moves to `plans.mine`** (Q2 —
this departs from the 2026-10-20 recommendation to keep `plans.versions` as the teacher's list). One
id, one meaning, every role: the role-dependent title (`savedTitle`/`savedDesc`/`showSaved` for
teachers) goes, and `PANEL_IDS` render order works for all roles. `plans.versions` is NOT retired — it
stays valid for administrators. For a teacher it is now an unavailable id: `parseOpen` drops it, so an
old teacher bookmark `?open=plans.versions` falls back to the default landing (§6.3). Note this in
`panelState.ts` beside the other id history. No code in `src` links to `plans.versions`.

`UnsavedWorkList` stops being a `<section>` above the accordion and becomes the body of `plans.drafts`
(its own `h2` goes; the panel heading replaces it). Its description, rows, Continue editing / Open to
copy, Discard (native confirm, unchanged) and expiry dates are unchanged. An empty state is added
(§6.5). Its read stays separate and owner-only (`listUnsavedWork`, keyed on the session user); nothing
in this plan merges it with the versions read.

### 6.2 My saved versions — the query and the per-row actions

A new wave-1 read, alongside the existing ones in `AdminDashboard/index.tsx`:

```
lesson-bundle-versions, overrideAccess: false, user, depth: 0, pagination: false,
where: { author: { equals: user.id } }, sort: '-createdAt',
select: title, semver, subjectGrade, lessonPlan, author, meta.substrand_name, createdAt
```

- **`author` is selected** (Codex P2): `canDeleteVersionDoc` grants a teacher with editing access only
  when `version.author === user.id`, so a projection without it would hide Delete on every teacher's
  own versions while administrators — who pass on subject-grade alone — would mask the defect.
  **Permission flags are computed on the server document, before the client row is projected**; the
  client row carries flags, not `author`.
- **Separate from the cleanup query** (`deletableVersionsWhere`), which excludes Officials and encodes
  delete authority, not ownership.
- `author` is stamped only by save-as-new; uploaded ARES versions have none, so a Site Administrator's
  list is their own edits, not the catalogue.
- Spans every subject-grade where the version is still readable, including ones where the caller no
  longer has editing access. Authenticated users can already read numbered versions; the server-built
  author predicate is what limits this list to the caller (Codex: no authorization gap).
- Never another person's versions: the `where` is the caller's id, built server-side from the session.

Each row carries flags computed server-side with the existing per-document helpers, so the list never
offers what the server would refuse:

| Flag | Rule | Effect |
|---|---|---|
| `official` | `'yes'` / `'no'` / `'unknown'` from the plan's `officialVersion` | `'yes'`: "Official" badge |
| `canDelete` | `official === 'no' && canDeleteVersionDoc(user, doc)` | Delete button (existing confirm + unsaved-draft warning) |
| `canCompare` | `official === 'no'` and the plan has an Official | Compare to Official |
| `canEdit` | `isEditorFor(user, doc.subjectGrade)` | Continue editing, and the title links with `?edit=1`; otherwise the title opens the version to view, without `?edit=1` |

**Fails closed on an unresolved plan pointer**, as the cleanup list does today: an Official state that
cannot be determined is `'unknown'`, never `'no'`, so the row is still listed (it is the caller's work)
but offers neither Delete nor Compare. An own Official row keeps Continue editing where `canEdit` holds
(editing an Official saves a new version, as everywhere else).

The Official pointers come from the existing `exclusionPlans` read, widened to cover the plan ids of the
new rows (for a Site Admin, `planDocs` already has every plan). Subject-grade labels ride the existing
`sgIds` lookup.

`CandidateList` takes these per-row flags instead of the role boolean `showContinueEditing`; the
cleanup list's rows are built with `canDelete: true`, `canEdit: false`, `official: 'no'` (exactly
today's behaviour). Each instance gets a distinct search label ("Search my saved versions" / "Search
versions to delete") so the two lists on an administrator's page are distinguishable to a screen reader
and to tests.

### 6.3 Opening behaviour

Today's mechanics, stated precisely (Codex P3) — open state lives only in the URL's `?open=`:

- With no `?open=`, the page applies a **default** on every load. Closing every panel removes `open`
  from the URL, so a reload applies the default again; an explicitly all-closed page is not remembered.
- A `?open=` whose ids are all unavailable to the caller parses to nothing and also falls back to the
  default (this is what a teacher's old `?open=plans.versions` bookmark will do).
- Any available id in `?open=` (deep links, Back/Forward, reload of a page with panels open) is honoured
  exactly, as today.

**The default changes in one place (Q1, revised on Codex's view):** rule 2's one-level-down exception
becomes "when a role's single top-level box opens, its **first** available child opens too" (today:
"its child, if it has exactly one"). It is structural, not a role check, and for every existing case it
gives the same result (one child = first child). Consequences:

- **Teacher with editing access:** Lesson plans and My saved versions open; Your Drafts stays closed
  with its count. Same zero-click landing as today. Nothing opens because drafts exist (decided).
- **Site Administrator:** several top-level boxes; nothing opens, as today.
- **Subject-grade administrator — a change to flag (Q7):** they always see two top-level boxes now
  (Users, for Roles & Access, and Lesson plans, for their personal sections), so nothing opens by
  default. Today a Subject Administrator with no cleanup candidates lands with Roles & Access open; one
  with candidates already lands all-closed.

### 6.4 Counts on headings

`AccordionPanel` gets an optional `count` prop rendered after the title as " (n)", included in the
button's accessible name. Used on `plans.mine` and `plans.drafts`, shown only when non-zero. The count
is the **complete list**, computed on the server, independent of the search box (Q4).

### 6.5 Strings

Existing, approved, unchanged: "My saved versions", "Your Drafts", the drafts description, the
saved-versions empty text, "Continue editing", "Open to copy", "Discard", "Delete individual versions".
The five messages that say "in the Manage tab, under Your Drafts" stay true and are unchanged.

New strings, to approve:

- Drafts empty state: "You have no drafts. While editing, choose Save as draft to put work aside without
  saving a new version."
- Saved versions description (now every role): "Versions you have saved, newest first."
- Official badge: "Official" (the word the library already uses).

### 6.6 What is removed or simplified

- `savedTitle`, `savedDesc`, `showSaved`'s teacher branch, `showContinueEditing`.
- The "NOT an accordion panel" ⚑ in `UnsavedWorkList` (replaced by a note pointing here and to the
  DECISIONS entry that supersedes 2026-10-17's placement).
- `.lp-manage__unsaved*` styles, if nothing else uses them.

### 6.7 Proof

- **Integration, through the production path** (Codex): extract the personal-versions read + row mapping
  into one server function (e.g. `lib/personalVersions.ts`) that `AdminDashboard` calls, and test THAT
  function against a real database with its exact `select` — never the helpers with hand-built full
  documents, which would have missed the P2. Cases:
  - a teacher with editing access: own ordinary version → `canDelete`, `canEdit`; another user's
    version in the same subject-grade → absent; own Official → listed, badge, no Delete, no Compare,
    Continue editing kept;
  - **one Subject Administrator who administers A, edits B and has lost access to C** (keeping another
    grant so they can still reach Manage): their authored versions get different flags in each scope —
    A delete + edit, B delete (own) + edit, C neither, still listed;
  - an unresolvable plan pointer → `official: 'unknown'`, no Delete, no Compare;
  - a Site Administrator: their own authored versions only, no uploaded 1.0.0s.
- **Unit:** `panelState` (new ids and render order; the first-child default for a teacher; Site Admin
  and Subject Administrator defaults; `plans.versions` unavailable to a teacher falls back to the
  default); `CandidateList` per-row actions and links (`?edit=1` only when `canEdit`); `AccordionPanel`
  count in the accessible name; the count ignores the search filter.
- **Browser** (`manage.e2e`):
  - teacher lands with Lesson plans + My saved versions open, Your Drafts closed with its count; drafts
    never auto-open;
  - Subject and Site Administrators see My saved versions and Your Drafts before the administration
    panels; actual links checked — revoked-access rows have no `?edit=1`, an own Official row has no
    Delete and no Compare but keeps permitted editing;
  - Delete from My saved versions: both administrator lists refresh, the personal count updates, and a
    draft on that source disappears from Your Drafts (existing cascade); Discard: the draft count
    updates and the empty state appears at zero;
  - `?open=plans.mine` and `?open=plans,plans.drafts` deep links, reload, Back/Forward; the teacher's
    retired `?open=plans.versions` bookmark;
  - another user's drafts and versions affect neither rows nor counts.
- Guide, `USER_GUIDE.md` and SPEC §5 ("Your Drafts on Manage") and §13 updated to say where the lists live.
- DECISIONS entry superseding the 2026-10-17 placement and settling the 2026-10-20 open choices.
- Full gate on an isolated stack.

---

## Questions — resolved by review, and two for the operator

| Q | Resolution | Status |
|---|---|---|
| **Q1** teacher landing | My saved versions opens for a teacher; drafts stay closed (§6.3). Done structurally ("first child of a lone box"), not as a role rule. | **Changed from the first draft — operator to confirm** |
| **Q2** ids | `plans.mine` for everyone; `plans.versions` administrator-only (unavailable to teachers, not retired). | Agreed |
| **Q3** names | Keep "My saved versions" / "Your Drafts" and the existing messages. | Agreed |
| **Q4** counts | Both headings, non-zero only, complete list independent of search. | Agreed |
| **Q5** `↗` | Keep, with the accessible new-tab announcement. | Agreed |
| **Q6** delete label | Trigger "Delete thread"; "Delete" inside the titled confirmation (§3). | **Changed from the first draft — operator to confirm** |
| **Q7** Subject Administrator landing | Accept all-closed (§6.3): the same landing an administrator with cleanup candidates already gets. | New — operator to confirm |

The administrator-list overlap (own non-Official versions in both My saved versions and Delete
individual versions) is accepted: the cleanup queue must stay complete and agree with
`deletableVersionsWhere`.

## Review log

- **Codex, `77a5cd75`.** P2: the personal-version projection omitted `author`, which
  `canDeleteVersionDoc` needs for a teacher — fixed in §6.2 (select it; compute flags before projecting).
  P3: §6.3 promised remembered state that `initialOpen` does not provide — rewritten to describe the
  actual URL-only mechanics. No authorization gap in the authored read; keep the draft read separate;
  keep fail-closed Official handling; accept the overlap. Proof additions folded into §6.7. Views on
  Q1–Q6 adopted.
