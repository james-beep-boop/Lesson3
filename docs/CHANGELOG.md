# Changelog

Concise record of delivered product changes, newest first. Detailed implementation history through
2026-07-28 is preserved in
[`docs/archive/BUILD-HISTORY-2026-06-TO-07.md`](archive/BUILD-HISTORY-2026-06-TO-07.md).

- Current state and next work: [`docs/NEXT-SESSION.md`](NEXT-SESSION.md)
- Decisions and reasoning: [`docs/DECISIONS.md`](DECISIONS.md)
- Architecture and domain rules: [`SPEC.md`](../SPEC.md)

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
