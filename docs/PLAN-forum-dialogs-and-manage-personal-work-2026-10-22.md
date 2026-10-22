# Plan — forum dialogs and links, and personal work in Manage (Proposal B)

**Status:** proposed 2026-10-22, for Codex review before any code. Operator decisions from this session
are marked **(decided)**. Questions still open are numbered **Q1–Q6** at the end, each with a
recommendation.

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
  currently reads "Delete thread"; it becomes "Delete". The page's own trigger button also becomes
  "Delete" (it sits next to Pin/Redact on the thread, where "thread" is implied — see Q6).

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

On a thread: **Pin · Delete · Redact** (Redact moves after Delete). Trigger names: "Pin"/"Unpin",
"Delete", "Redact". On a reply (no Pin or Delete): "Redact" (was "Redact reply"). The accessible group
names ("Thread moderation" / "Reply moderation") already say which post is meant.

### PR 1 updates and proof

- Guide (`app/(frontend)/guide/page.tsx`) and `USER_GUIDE.md`: the button names and dialog titles.
- SPEC §16 only if it names these buttons (checked during implementation).
- Tests: `tests/unit/discussionModerationControls.spec.tsx` (titles, no pin body, "This cannot be
  undone.", order Pin/Delete/Redact, "Redact" on replies); `tests/e2e/discussionsModeration.e2e.spec.ts`
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

**`plans.versions` becomes administrator-only; a teacher's list moves to `plans.mine`** (see Q2 — this
departs from the 2026-10-20 recommendation to keep `plans.versions` as the teacher's list). One id, one
meaning, every role: the role-dependent title (`savedTitle`/`savedDesc`/`showSaved` for teachers) goes,
and `PANEL_IDS` render order works for all roles. A teacher's old bookmark `?open=plans.versions` is
dropped by `parseOpen` like any retired id and lands on the normal page; record it in `panelState.ts`'s
retired-ids comment. No code in `src` links to `plans.versions`.

`UnsavedWorkList` stops being a `<section>` above the accordion and becomes the body of `plans.drafts`
(its own `h2` goes; the panel heading replaces it). Its description, rows, Continue editing / Open to
copy, Discard (native confirm, unchanged) and expiry dates are unchanged. An empty state is added (Q3).

### 6.2 My saved versions — the query and the per-row actions

A new wave-1 read, alongside the existing ones in `AdminDashboard/index.tsx`:

```
lesson-bundle-versions, overrideAccess: false, user, depth: 0, pagination: false,
where: { author: { equals: user.id } }, sort: '-createdAt',
select: title, semver, subjectGrade, lessonPlan, meta.substrand_name, createdAt
```

- **Separate from the cleanup query** (`deletableVersionsWhere`), which excludes Officials and encodes
  delete authority, not ownership.
- `author` is stamped only by save-as-new; uploaded ARES versions have none, so a Site Administrator's
  list is their own edits, not the catalogue.
- Spans every subject-grade where the version is still readable, including ones where the caller no
  longer has editing access.
- Never another person's versions: the `where` is the caller's id, built server-side from the session.

Each row carries flags computed server-side with the existing per-document helpers, so the list never
offers what the server would refuse:

| Flag | Rule | Effect |
|---|---|---|
| `isOfficial` | the plan's `officialVersion` is this id | "Official" badge; no Delete; no Compare to Official |
| `canDelete` | `!isOfficial && canDeleteVersionDoc(user, row)` | Delete button (existing confirm + unsaved-draft warning) |
| `canEdit` | `isEditorFor(user, row.subjectGrade)` | Continue editing; otherwise the title opens the version to view |

The Official pointers come from the existing `exclusionPlans` read, widened to cover the plan ids of the
new rows (for a Site Admin, `planDocs` already has every plan). Subject-grade labels ride the existing
`sgIds` lookup.

`CandidateList` takes these per-row flags instead of the role booleans `showContinueEditing`; the cleanup
list passes `canDelete: true`, `canEdit: false`, `isOfficial: false` for its rows (exactly today's
behaviour). Each instance gets a distinct search label ("Search my saved versions" / "Search versions to
delete") so the two lists on an administrator's page are distinguishable to a screen reader and to tests.

### 6.3 Opening behaviour

`initialOpen` is unchanged: with no `?open=`, a lone top-level box opens, and its child too only if it
has exactly one. Consequences:

- **Teacher with editing access:** the page's only box is Lesson plans, which opens; it now has two
  children, so both stay closed. The teacher sees two headings, each with its count (Q1, Q4). This is
  one more click to reach saved versions than today — the cost the 2026-10-17 entry named.
- **Administrators:** several top-level boxes; nothing opens by default, as today.
- Deep links and remembered open state are respected as today. Nothing opens on the strength of drafts
  existing (decided).

### 6.4 Counts on headings

`AccordionPanel` gets an optional `count` prop rendered after the title as " (n)", included in the
button's accessible name. Used on `plans.mine` and `plans.drafts`, shown only when non-zero (Q4).

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

- **Integration** (real database): the personal-versions read returns only the caller's authored versions
  for each role; includes their own Official; excludes another user's versions in the same
  subject-grade; flags are right for a revoked-access version (readable, `canEdit` false, `canDelete`
  false), an Official (no delete) and an ordinary one.
- **Unit:** `panelState` (new ids, render order, `plans.versions` dropped for a teacher, lone-child
  behaviour with two children); `CandidateList` per-row actions; `AccordionPanel` count in the name.
- **Browser** (`manage.e2e`): a teacher sees Lesson plans open with both children closed and counts; a
  Subject Administrator and a Site Administrator see My saved versions and Your Drafts before the
  administration panels; an own Official row has no Delete; Discard and Continue editing still work from
  inside the panel; drafts never auto-open.
- Guide, `USER_GUIDE.md` and SPEC §5 ("Your Drafts on Manage") and §13 updated to say where the lists live.
- DECISIONS entry superseding the 2026-10-17 placement and settling the 2026-10-20 open choices.
- Full gate on an isolated stack.

---

## Open questions (recommendation first)

- **Q1 — teacher landing.** Recommended: Lesson plans opens, both children closed, counts visible.
  Alternative: special-case "My saved versions" open by default for a teacher (keeps today's zero-click
  path, but adds a role rule to `initialOpen`).
- **Q2 — ids.** Recommended: `plans.mine` for everyone, `plans.versions` administrator-only (one id, one
  meaning). Alternative (2026-10-20 recommendation): keep `plans.versions` as a teacher's personal list and
  give administrators `plans.mine` — preserves teacher bookmarks but keeps the role-dependent meaning.
- **Q3 — names.** Recommended: keep the approved "My saved versions" and "Your Drafts" (five messages
  point to "Your Drafts"). Alternative: unify to "My saved versions" / "My drafts" and update those
  messages, SPEC and the Guide.
- **Q4 — counts.** Recommended: on both personal headings, non-zero only. Alternative: drafts only, as in
  the 2026-10-20 note.
- **Q5 — `↗` on lesson links.** Recommended: yes, matching Compare to Official. Alternative: new tab with
  no visible marker (accessible name still says so).
- **Q6 — Delete trigger label.** Recommended: "Delete" on the thread page (operator asked for "Delete" in
  the dialog; the trigger sits among thread-only controls). Alternative: keep "Delete thread" on the
  trigger only.

Also for review: an administrator's own non-Official versions appear in both My saved versions and the
Delete individual versions queue. Recommended: accept the overlap — the cleanup queue must stay complete,
and filtering it by author would make it disagree with `deletableVersionsWhere`.
