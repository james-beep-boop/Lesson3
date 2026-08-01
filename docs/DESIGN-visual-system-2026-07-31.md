# One visual system — PR 1 implementation brief (2026-07-31)

Source: operator report that the **Manage** page reads as a different product (nonstandard font,
content jammed against the top, inconsistent everything), a GPT design pass that measured the drift,
and a Claude critique that corrected the architectural premise. Settled scope after two rounds of
review. **App-level, no migration.**

Goal, in one line: **one rendered visual system across the frontend and the admin custom views — not
a second token file, and not a Payload re-theme.**

This brief covers **PR 1 of 3**:

| PR | Scope |
|---|---|
| **1 (this brief)** | Shared-system extension + Manage |
| 2 | Remaining frontend pages — Guide, Messages, Compare, auth/account |
| 3 | Version editor chrome + native-Payload boundary |

---

## 1. Grounding — measured from source

The foundation **already exists**: `app/src/app/app-tokens.scss` is `@use`d by
`(payload)/custom.scss` and imported by the frontend layout. It already single-sources the content
width (960px), content padding (20px), the brand accent, the full button system, and `--app-ui-font`.

**There are two rendered visual systems over an incomplete shared token layer.** The token layer is
real; it is incompletely populated and inconsistently applied, and the two surfaces render as
different products regardless. What actually diverges:

| Element | Frontend | Admin | Cause |
|---|---|---|---|
| rem root | 16px (`styles.css:96`) | **15px** (`custom.scss:11-13`) | Ours — Payload's own default is ~13px; we bumped it one step and stopped short of 16 |
| Body font stack | `system-ui, -apple-system, Segoe UI, Roboto, sans-serif` | **Payload's own stack** | `--app-ui-font` exists but is applied only to `.btn`, never to the admin `body` |
| Page title | `1.9rem` → 30.4px | `1.9rem` → **28.5px** | A `rem` token across two roots — deliberate, and now being reversed |
| Header padding-block | `0.75rem` → 12px (`.app-header`) | `0.5rem` → **7.5px** (`.lp-admin-header`) | Hand-typed per surface |
| Avatar | `1.9rem` → 30.4px | `1.9rem` → **28.5px** | rem across two roots |
| Space below header | `1.5rem` → 24px (`.app-main`) | **0px** (`.lp-admin-dash` sets no block padding) | **This is the operator's "too close to the top."** |
| Gutter at ≤640px | `0.9rem` → 14.4px | **20px** (keeps `--app-content-pad`) | The open item DECISIONS 2026-07-18 left as "separate work" |
| Mobile header | `flex-direction: column` at ≤640 | no equivalent rule | Never mirrored |
| Primary ink | `--ink` #1a1a1a | `--theme-elevation-1000` | Per-surface **on purpose** — the admin has light/dark |

GPT's reported `#2f2f2f` body ink is Payload's **native** page text, not our custom views (which use
`--theme-elevation-1000`). That belongs to PR 3, not here.

**Finding not in either review:** Manage's controls are **not in the button system at all**. The
`--app-btn-*` rules on the admin surface are scoped to
`.collection-edit--lesson-bundle-versions .lesson-controls-wrap` (`custom.scss:659`), and the shared
`.btn--danger` / `.btn--quiet` rules live only in the frontend stylesheet, which the admin never
loads. Manage's Delete is Payload stock `<Button buttonStyle="error">`. Bringing Manage into the
button system is therefore **new work in this PR**, not a class rename.

---

## 2. Commit structure

Three commits, one PR. The foundation stays a **distinct first commit** so it is reviewable in
isolation and so a bisect can separate "everything moved 6%" from "Manage was restructured."

1. **`foundation:`** — token extension + application on both surfaces. No markup changes.
2. **`manage:`** — Manage layout restructure, consuming the tokens from commit 1.
3. **`docs:`** — `DECISIONS.md` entry, this file updated with the outcome of the 16px experiment, and
   the "Signed in as" → plain role-name refinement recorded in
   `DESIGN-user-model-language-2026-07-29.md` (§4.1).

---

## 3. Commit 1 — foundation

### 3.1 The 16px experiment (do this first; it determines the rest)

`custom.scss:11-13` sets the admin `html, body` to 15px. **Try 16px.** It is a two-character change
and everything rem-relative in our admin custom views becomes size-identical with the frontend for
free.

**Procedure — measurement and eyes together, in one pass:**

1. Bring up the local stack (`AGENTS.md` → Local stack). `rm -rf app/.next` first — a stale build
   serves **empty bodies with a 200**, which reads as "the page broke."
2. **Before** editing, capture a baseline across the five surfaces × four widths: computed
   `font-size`, `line-height`, header height, and the vertical offset of the first content box.
   Capture screenshots in the same pass.
3. Change the root to 16px. Re-capture identically.
4. Judge with **both**: the geometry table *and* the side-by-side screenshots. Numerical consistency
   alone does not answer whether Payload's own chrome still feels comfortable — an inflated form is a
   correct number and a worse page.

**Keep 16px if:** native Payload forms, tables, dialogs and navigation still read as ordinary admin
chrome at all four widths.

**Fall back if:** Payload's internals read oversized or start wrapping/overflowing. The fallback is
**fixed-px product-typography tokens** (`--app-page-title-size`, `--app-section-title-size`,
`--app-body-size`, `--app-secondary-size` all in px), applied to our custom views while the root
stays 15px. That is the pattern the button system already proved. Do **not** pre-emptively convert
~30 rem declarations before running the experiment.

⚑ The version editor lazy-renders and keeps growing for seconds. Let it settle before measuring, or
it will fabricate a regression (this has happened before).

### 3.2 Tokens to add to `app-tokens.scss`

Extend the existing file. **Do not create a second token file or a parallel system** — that is the
exact failure this PR is meant to prevent, arriving from a new direction.

```text
Typography    --app-page-title-size      30px   (was 1.9rem — see 3.3)
              --app-section-title-size   20px   (decided — see the scale below)
              --app-list-heading-size    18px   (names an existing frontend value)
              --app-body-size            16px   (minor headings are this size at weight 600)
              --app-secondary-size       14px

Spacing       --app-space-1  8px
              --app-space-2  12px
              --app-space-3  16px
              --app-space-4  24px
              --app-space-5  32px
              --app-space-6  48px

Page shell    --app-page-top             32px   (space below header, desktop)
              --app-page-top-sm          24px   (≤640px)
              --app-content-pad-sm       16px   (resolves the 14.4 / 20 split)

Header        --app-header-pad-block     12px
              --app-header-pad-inline    20px
              --app-avatar-size          30px
              --app-avatar-touch-size    44px   (≤640px, WCAG 2.5.5)

Rows          --app-row-pad-block        16px
```

All **px**. The whole point is cross-surface equality; a rem token is what created half the drift in
the table above.

**On `--app-section-title-size: 20px` — decided, and it defines the scale.** Today's admin
`__section` is `1.15rem` → 17.25px, and the catalogue's four-step scale is title / 18 / 16 / 14. 20px
deliberately outranks the catalogue's 18px subject-grade heading, because a Manage section heading is
a **true page section** while a subject-grade heading is **nested list structure**. Treating them
differently is the point: it is what produces a legible hierarchy rather than a flat one.

| Level | Size | Weight | Example |
|---|---|---|---|
| Page title | 30px | 700 | "Manage", "Lesson Plans" |
| Page section | **20px** | 600 | "My saved versions", "Editing access" |
| List / group heading | 18px | 600 | catalogue subject-grade |
| Minor heading | 16px | 600 | in-group labels (e.g. Editors group head) |
| Secondary text | 14px | 400 | metadata, descriptions |

The 18px and 16px steps are **existing** frontend values being named, not moved. Verify on the
catalogue and lesson page that the new 20px step reads as a level above them rather than competing.

**Do NOT tokenize:** primary ink and muted ink. The frontend's `--ink`/`--muted` are fixed light-theme
values; the admin's `--theme-elevation-1000`/`-600` follow light/dark. Pinning a hex on the admin
would break dark mode, and `--theme-elevation-500` is already banned for text (3.95:1, fails AA —
DECISIONS 2026-07-12 D6). **Measure** the light-mode delta and only act if it is visible; per-surface
palettes with a shared *scale* is the correct end state.

### 3.3 Existing decisions and comments to reverse

If the 16px experiment succeeds, these become wrong and must be edited, not left to rot:

- **`app-tokens.scss:5-9`** — the file header paragraph explaining that rem tokens render ~6% smaller
  in the admin *on purpose*. Delete/replace; the intentional-6% posture is retired.
- **`app-tokens.scss:11`** — `--app-page-title-size: 1.9rem` and its "scale-relative" comment → px.
- **`app-tokens.scss` button-system block (~line 21)** — the comment justifying px "because the admin
  root is 15px and the frontend's is 16px." The px choice stays correct; the *reason* changes.
- **`custom.scss:6-10`** — the comment explaining the 15px bump. Update to state the new root and why.
- **`custom.scss:62-64`** — `.lp-admin-dash__title`'s "same size/weight as the frontend, via the
  shared token" comment, if the token's unit changes.
- **`DECISIONS.md` 2026-07-18 entry** — the "unit discipline" paragraph asserting the rem/px split.
  Do not rewrite history; supersede it in the new entry, the way that entry itself superseded the
  hand-synced accent.
- **`DECISIONS.md` 2026-07-18** — "Still not fixed: the ≤640px Manage vs frontend content-padding
  difference. Left for separate work." **This PR is that work.**

### 3.4 Application (still commit 1, no markup changes)

- Apply `--app-ui-font` to the admin `body` — **globally, as the default experiment** (decided
  2026-07-31). Consistency across all pages is the requirement, so the font reaching Payload's native
  pages is the intent, not a side effect. The native collection page is in the acceptance matrix
  (§6.1) precisely to catch adverse effects. **Scope it back only on evidence of real layout or
  usability damage** — not on taste — to
  `body:has(.lp-admin-dash), body:has(.collection-edit--lesson-bundle-versions)`, matching the
  existing chrome-stripping pattern at `custom.scss:280`. If it is scoped back, **PR 3 must
  explicitly finish that boundary**; say so in the DECISIONS entry so it cannot be forgotten.
- Space below header: `.lp-admin-dash` gains `--app-page-top` block padding; `.app-main`'s `1.5rem`
  becomes the same token. Both land on 32px desktop / 24px mobile.
- Header geometry: `.app-header` and `.lp-admin-header` both take `--app-header-pad-*`; both avatars
  take `--app-avatar-size`.
- Mobile header: mirror the frontend's ≤640 column layout onto `.lp-admin-header`.
- Gutter at ≤640: both surfaces take `--app-content-pad-sm`. Note this moves the **frontend** mobile
  gutter 14.4px → 16px on every page — small, deliberate, and in the acceptance scope.

---

## 4. Commit 2 — Manage

### 4.1 Intended layout

```text
Manage                                    ← page title, --app-page-title-size / 700

Teacher                                   ← identity block
Editing access: Biology · Grade 10

My saved versions                         ← --app-section-title-size / 600
Continue working on versions you have saved.

──────────────────────────────────────────
Cell Structure                            ← link, primary label
Biology · Grade 10 · Version 1.0.1 · Saved 29 Jul 2026
[ Continue editing ]  [ Delete ]
──────────────────────────────────────────
```

Changes from today (`components/AdminDashboard/index.tsx`, `CandidateList.tsx`):

- **Identity block.** The role line and scope lines group as one block under the title, and
  **"Signed in as Teacher" becomes plain "Teacher"** (decided 2026-07-31). "Signed in as" is
  redundant on an authenticated page and reads as diagnostic output; the account menu already
  establishes identity. The access line stays beneath it.
  ⚑ This is the **one** wording change in this PR, and it is a deliberate refinement to
  `docs/DESIGN-user-model-language-2026-07-29.md` — **record it there in the docs commit**, do not
  smuggle it in as styling. Everything else about these strings still comes from
  `resolveAccessSummary` and is governed by that doc plus the truthfulness contract documented in
  `AppNav` (the *type* is always shown because it is pure and cannot be wrong; the scope *lines*
  need a read and degrade to absent on failure — that behaviour is unchanged).
- **Version becomes ordinary metadata.** Drop `.lp-admin-list__badge` from the row; "Version 1.0.1"
  joins the metadata line. Per the button system, **status is not a variant** — a floating badge that
  looks like a control is exactly what that rule exists to stop.
- **Explicit `Continue editing` control.** The title stays an obvious link (it is the primary target),
  but the action is named. Standard variant.
- **Delete → shared danger control.** See §1: this means bringing Manage into the button system, not
  renaming a class. Either extend the admin's `.btn` scoping beyond `.lesson-controls-wrap` or mirror
  the `.btn--danger` rules into `custom.scss`. **Prefer extending the scope** — a mirrored copy is a
  second thing to keep in step, which is the drift this PR removes.
- **Rows:** `--app-row-pad-block` (16px) + divider, per the existing `.lp-manage__list` idiom.
  At ≤640, metadata and actions stack beneath the title. No cards, no shadows.
- **Empty state:** short explanation occupying deliberate space — not a bare `<p class="muted">`.
  Both the Editor wording ("You have no saved versions.") and the admin wording ("No candidate
  versions.") are affected.

### 4.2 Primitives — the rule

**No primitive is extracted in PR 1. None.**

- **`PageHeader` — deferred to PR 2** (decided 2026-07-31). It has several *potential* consumers
  (Manage, catalogue, lesson page, Messages' inline title+action row) — but PR 1 declares frontend
  restructuring out of scope, and extracting a component across the catalogue, lesson page or
  Messages would contradict that boundary. Reaching into three frontend pages to prove an API is
  precisely the scope creep §5 forbids.
- **Metadata line, list row, empty state — likewise deferred.** One consumer each today.
- **In PR 1, implement Manage with the agreed classes and tokens.** When PR 2 actively touches a
  second page, extract `PageHeader` then, with real evidence for its API from two live callers.

Six abstractions ahead of demand turns a visual pass into a component-framework project; one
abstraction ahead of demand still requires editing pages this PR promised not to touch.

---

## 5. Out of scope — explicit boundaries

- **No Payload re-theme.** Payload keeps its internal layouts, components and form machinery. We
  change the root size, the font stack, and additive rules — nothing else. The pinned Payload version
  must still be able to move without a re-theme (D2).
- **No native-Payload page work** — collection lists, native forms, the ink drift on those pages.
  That is PR 3. They appear in acceptance here only as **regression checks** on the root-size change.
- **No version-editor restructuring.** PR 3. Same: acceptance-only here.
- **No frontend page restructuring** — Guide, Messages, Compare, auth. PR 2. They receive the
  foundation values and are checked for regressions; their layouts and markup are not touched. This
  is also why no shared primitive is extracted here (§4.2).
- **No wording changes except one:** "Signed in as Teacher" → "Teacher" (§4.1), recorded in
  `DESIGN-user-model-language-2026-07-29.md`.
- **No migration, no schema change, no endpoint change.** If this PR grows one, it is off-plan —
  stop and re-plan (and note that a new/changed endpoint would drag `tests/http` authz coverage in
  with it, per CLAUDE.md).
- **No cards, shadows, or decoration.** The target is one quiet structured product, not a decorated
  admin.

---

## 6. Acceptance

**Local before merge → automated → Rock.** The local stack (#173) exists precisely so UI defects stop
being discovered after deployment; five defects across #169–#173 were caught by a reviewer or the
operator's phone and zero by 318 unit tests, tsc or eslint. Rock-only verification is not acceptable.

### 6.1 Local browser verification, before merge

**Five surfaces × four widths (390 / 550 / 700 / 1280), every combination:**

1. Manage
2. Version editor
3. At least one **native** Payload collection page (e.g. `/admin/collections/users`)
4. Frontend catalogue
5. Lesson page

**Roles — Manage must be inspected as both:**

- an **Editor/Teacher with editing access** (scoped: Biology Grade 10), and
- a **Site Administrator**.

The two render materially different pages — "My saved versions" vs "Candidate versions", plus the
Editors / Upload / Repair / Delete / Curriculum sections that only Site Admins see. Checking one
proves nothing about the other.

**States — both must be verified:**

- **Populated** saved-versions list, and
- **empty** saved-versions list.

⚑ The seed's plan is **Official-only**, so it likely yields **no candidate rows at all**. Create a
candidate through the **normal edit-and-save workflow** before evaluating the row design — do not
insert one directly into the database, and do not evaluate row design against an empty list.

**Evidence — both forms, together:**

- computed-style / geometry tables (font-size, line-height, header height, first-content offset), and
- side-by-side screenshots.

Neither alone is sufficient. The tables decide *equality*; the screenshots decide whether 16px
Payload chrome is still *comfortable*. A passing table with an inflated admin is a fail.

Pane traps: coordinate clicks silently do nothing — use `javascript_tool` → `el.click()`; navigation,
semantic controls, screenshots and computed-layout measurement all work.

### 6.2 Automated

`npx tsc`, `test:unit`, sass compiles clean.

### 6.3 Rock

Post-deploy confirmation of the same five surfaces. **Confirmation, not discovery.**

### 6.4 The bar

Not "the stylesheet compiles." Header geometry, title position, font rendering, spacing and shared
controls compare side by side **without visible drift** — and no admin surface outside Manage got
quietly worse.

---

## 6a. Outcome — the experiments, as run

**16px root: KEPT.** Measured before/after at 390/700/1280 across all five surfaces.

| | 15px (before) | 16px (after) | Frontend |
|---|---|---|---|
| Page title | 28.5 | **30.4** | 30.4 |
| Secondary text | 13.5 | **14.4** | 14.4 |
| Avatar | 28.5 | **30.4** | 30.4 |
| Header pad-inline | 18.75 | **20** | 20 |
| Native list row height | 50.76 | 54.14 | — |

The bump alone closed five drift items, because the frontend already rendered those values. Payload's
own chrome stayed comfortable: the native collection page showed no new wrapping and no table
overflow at any width, and the version editor's controls did not move (px button tokens). **No
fallback to fixed-px product typography was needed.**

One overflow needed attributing rather than fixing: the version editor's document is ~21px wider than
the viewport at 1280 — but it measures **1301px at 15px and 1303px at 16px**, so it is pre-existing.
The cause is a hidden `relationship-add-new__tooltip` (`visibility: hidden`, still laid out). Not
caused by this work; left alone.

⚑ The first editor baseline recorded `overflow: none` because it was captured before the relationship
field lazy-mounted — the settle trap §3.1 warns about, hit on the first attempt anyway. The
attribution above comes from re-measuring both roots *after* settling.

**Global admin font: KEPT** — but not by the route the brief assumed. `body { font-family }` left
every `<h1>` in Payload's stack, because Payload applies `var(--font-body)` directly to headings and
inputs. Redefining **`--font-body`** was the working change. Verified on a native collection page.

**Found by measurement, not in the original diagnosis:** the admin header's inline padding (18.75px
vs 20px, a `1.25rem`-across-two-roots drift) and **line-height** (Payload's ~1.25 vs the frontend's
1.55) — the latter affecting text density on every admin page, and the last thing standing between
the two headers matching exactly. Both are now tokens; the headers measure **109.8px on both surfaces**
at 390px.

**Blocked at first attempt, since resolved:** creating the populated candidate through the UI's own
Save button. It returned a generic 500 for any bundle with an empty optional array (pre-existing;
`reduceFieldsToValues` serializes an empty array as `0`, and the cardinality guard then called `.map`
on it). The first pass worked around it by posting to the same `save-as-new` endpoint directly, which
left the UI save path unverified — so the bug was fixed separately in **#176**, merged before this
PR, and the acceptance run below then used the real edit-and-save workflow. **The final result is the
acceptance run; this paragraph records only how the first attempt was blocked.**

### Acceptance run — completed 2026-07-31

Manage inspected as **both** roles, at **390 / 550 / 700 / 1280**, in **both** states.

| | Editor (`editor@local.test`, Biology Grade 10) | Site Administrator |
|---|---|---|
| Identity block | "Teacher" / "Editing access: Biology · Grade 10" | "Site administrator" / "All subjects and grades" |
| Sections | 1 — My saved versions | 5 |
| Populated row | `Cell Structure` · one metadata line · Continue editing + Delete | same, plus author |
| Version badge | gone (plain metadata) | gone |
| Empty state | corrected copy, above a divider, 24px block | corrected copy |
| Horizontal overflow | none at any width | none at any width |

The populated state used a candidate created through the **real edit-and-save workflow** as an
Editor — possible only after the Save fix (`fix/editor-save-empty-arrays`); the client was observed
posting `finalExplanation.sections: number(0)` and the save returning 200 where it previously 500'd.
Delete was exercised through the shared danger control (`btn--style-error`, confirm dialog, row
removed, list re-rendered to the empty state).

**550px earned its place**, as the operator predicted: it is rule-identical to 390 but the header
stacks and the row drops to column layout there, while 700 keeps both inline — a difference no
geometry table at 390/700/1280 would have shown.

### 550px geometry — the corrected methodology

An earlier draft of this section claimed geometry at 550 was redundant: the stylesheets contain
exactly three rule regimes (>1024, 641–1024, ≤640), so 550 is rule-identical to 390 and "yields no
new computed value". **That was wrong, and the operator caught it.** Identical rules do not give
identical geometry — available width still changes wrapping, heights and offsets. The counter-example
is in this very page:

| Manage version row | metadata lines | row height |
|---|---|---|
| **390px** | **2** | 159.19 |
| **550px** | **1** | 137.49 |

Same rules, same breakpoint, materially different row. A table at 390/700/1280 could not have shown
it. **Rule regimes tell you which widths to reason about; they do not tell you which widths to
measure.**

Measured at 550, all five surfaces:

| | catalogue | lesson | Manage (Editor) | Manage (Site Admin) | version editor | native collection |
|---|---|---|---|---|---|---|
| rem root | 16 | 16 | 16 | 16 | 16 | 16 |
| body size | 16 | 16 | 16 | 16 | 16 | 16 |
| font | system-ui | system-ui | system-ui | system-ui | system-ui | system-ui |
| line-height | 24.8 | 24.8 | 24.8 | 24.8 | 24.8 | 24.8 |
| header height | 109.8 | 109.8 | 109.8 | 109.8 | 109.8 | 109.8 |
| header direction | column | column | column | column | column | column |
| header pad | 12 / 20 | 12 / 20 | 12 / 20 | 12 / 20 | — | — |
| space below header | 24 | 24 | 24 | 24 | — | — |
| content pad-inline | 16 | 16 | 16 | 16 | 16 (Payload's) | — |
| page title | 30 | 30 | 30 | 30 | — | 25 (Payload's) |
| section / secondary | — | — | 20 / 14 | 20 / 14 | — | — |
| avatar | 44 | 44 | 44 | 44 | 44 | 44 |
| control height | — | 44 | 44 | 44 | 44 | — |
| horizontal overflow | none | none | none | none | none | none |

The two admin-only columns are Payload's own chrome and are expected to differ: the native page's h1
is Payload's (25px) and the editor's gutter is Payload's. Everything the shared system owns is
identical across all six columns.

**Native Payload at 550 is comfortable** — and better than at 390: the users table shows **no**
horizontal overflow here, where 390 measured `409 > 390`. Row height 54.33, product font throughout.

Two incidental findings from this pass, recorded because both would mislead a future reader:

- **A dead dev server renders as an unstyled page** (Times, `line-height: normal`, zero padding) with
  the HTML still served from cache — the CSS request fails with `ERR_CONNECTION_REFUSED`. It reads as
  a catastrophic style regression. Check `document.styleSheets` before believing a measurement that
  says everything broke at once.
- **Edit mode is correctly refused at 550px** (#172's narrow-screen guard), so the candidate for the
  populated measurement had to be created at 1280 and then measured at 550. Unplanned confirmation
  that #172 still holds.

---

## 7. Decisions recorded (operator, 2026-07-31)

The three questions this brief opened are **closed**. Recorded here so the implementer does not
reopen them, and so the DECISIONS entry can cite them.

1. **Section titles are 20px**, and the five-step scale in §3.2 is the agreed hierarchy. A page
   section outranks a list/group heading deliberately — that difference is what creates hierarchy
   instead of flatness.
2. **"Signed in as Teacher" → "Teacher."** Redundant on an authenticated page, and it reads as
   diagnostic output. Recorded as a deliberate refinement to
   `DESIGN-user-model-language-2026-07-29.md`, not as styling. (§4.1)
3. **The admin font goes global by default.** Consistency across all pages is the requirement. Scope
   back only on evidence of real damage; if scoped back, PR 3 must finish the boundary explicitly.
   (§3.4)

Two structural corrections were made at the same review: the §1 framing is now "two rendered visual
systems over an incomplete shared token layer," and **`PageHeader` extraction moved to PR 2** (§4.2)
because extracting it here would violate this PR's own frontend-restructuring boundary.

**Status: approved for implementation.**
